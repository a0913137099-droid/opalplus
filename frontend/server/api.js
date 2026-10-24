import {randomBytes, createHmac, timingSafeEqual} from 'node:crypto';
import {OAuth2Client} from 'google-auth-library';
import {validateWorkflow} from '../src/workflow.js';
const sessionSecret = randomBytes(32);
const MAX_IMAGE = 5 * 1024 * 1024;
export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function validateImage(image) {
  if (!image) return null;
  if (!['image/png','image/jpeg','image/webp'].includes(image.mimeType) || typeof image.data !== 'string' || image.data.length > Math.ceil(MAX_IMAGE * 4 / 3) + 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image.data)) throw new ApiError(400, '圖片必須是 5 MB 以下的 PNG、JPEG 或 WebP。');
  const bytes=Buffer.from(image.data,'base64');
  const valid=image.mimeType==='image/png' ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : image.mimeType==='image/jpeg' ? bytes[0]===255 && bytes[1]===216 && bytes[2]===255 : bytes.subarray(0,4).toString()==='RIFF' && bytes.subarray(8,12).toString()==='WEBP';
  if(!valid || bytes.length>MAX_IMAGE) throw new ApiError(400,'無法辨識圖片格式，請重新選擇。');
  return {mimeType:image.mimeType,data:image.data};
}
export async function generate({key, model, parts, image = false, json = false, fetcher = fetch}) {
  let response;
  try {
    response = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', headers: {'Content-Type':'application/json','x-goog-api-key':key},
      body: JSON.stringify({contents:[{role:'user',parts}], generationConfig: image ? {responseModalities:['TEXT','IMAGE']} : json ? {responseMimeType:'application/json'} : {}}),
      signal: AbortSignal.timeout(90_000)
    });
  } catch (error) { if(error instanceof ApiError) throw error; throw new ApiError(504, 'Gemini 連線逾時或無法連線，請稍後重試。'); }
  if (!response.ok) {
    const messages = {400:'Gemini 無法處理此內容，請調整提示或圖片。',401:'Gemini 金鑰無效，請檢查伺服器設定。',403:'Gemini 存取被拒絕，請確認金鑰權限、地區與服務設定。',404:'找不到設定的模型，請確認模型名稱與帳號可用模型。',429:'Gemini 額度不足或請求太頻繁，請稍後重試或檢查計費設定。'};
    throw new ApiError(response.status >= 500 ? 502 : response.status, messages[response.status] || 'Gemini 服務暫時無法完成請求。');
  }
  let data;
  try { data = await response.json(); } catch {throw new ApiError(502,'Gemini 回應格式不正確。');}
  const candidate=data.candidates?.[0];
  if(data.promptFeedback?.blockReason || (candidate?.finishReason && candidate.finishReason !== 'STOP')) throw new ApiError(422,'模型未完成產生內容，可能受到內容限制或輸出長度限制，請調整指令。');
  const output=candidate?.content?.parts || [];
  const text=output.map(p=>p.text||'').join('\n').trim();
  const images=output.filter(p=>p.inlineData && ['image/png','image/jpeg','image/webp'].includes(p.inlineData.mimeType)).map(p=>validateImage(p.inlineData));
  if(!text && !images.length) throw new ApiError(422,'模型沒有傳回內容，請調整指令後重試。');
  if(image && !images.length) throw new ApiError(422,'模型沒有傳回圖片。請調整圖片指令，或確認模型支援圖片生成。');
  return {text,images};
}
export async function executeWorkflow({flow,input,image,key,textModel,imageModel,fetcher,onStep=()=>{}}) {
  validateWorkflow(flow);
  if(typeof input!=='string' || !input.trim() || input.length>5000) throw new ApiError(400,'請輸入 1 至 5000 字的內容。');
  const attachment=validateImage(image);
  let previous={text:input.trim(),images:attachment?[attachment]:[]};
  const steps=[];let lastText='';
  for(const node of flow.nodes.filter(n=>n.type==='generate')) {
    onStep(node.id);
    const start=Date.now();
    previous=await generate({key,model:node.mode==='image'?imageModel:textModel,image:node.mode==='image',fetcher,parts:[{text:`請依下列指令處理上一個步驟的內容，使用繁體中文（除非指令另有要求）。\n\n指令：\n${node.content}\n\n上一個步驟的內容：\n${previous.text || lastText || input}`},...previous.images.map(inlineData=>({inlineData}))]});
    if(node.mode!=='image')lastText=previous.text;
    steps.push({id:node.id,title:node.title,text:previous.text,images:previous.images,durationMs:Date.now()-start});
  }
  return {...previous,text:lastText||previous.text,steps,source:'gemini'};
}
function sign(value) { return createHmac('sha256',sessionSecret).update(value).digest('base64url'); }
function encodeSession(account) {
  const payload=Buffer.from(JSON.stringify({...account,expires:Date.now()+8*60*60*1000})).toString('base64url');
  return `${payload}.${sign(payload)}`;
}
function readSession(req) {
  try {
    const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('bloom_session='))?.slice(14);
    if(!token) return null;
    const [payload,signature]=token.split('.');
    const expected=Buffer.from(sign(payload));const actual=Buffer.from(signature||'');
    if(expected.length!==actual.length || !timingSafeEqual(expected,actual)) return null;
    const account=JSON.parse(Buffer.from(payload,'base64url').toString());
    return account.expires>Date.now()?account:null;
  } catch {return null;}
}
async function readBody(req) {
  if(!req.headers['content-type']?.startsWith('application/json')) throw new ApiError(415,'請使用 JSON 格式。');
  let bytes=0;const chunks=[];
  for await (const chunk of req) {bytes+=chunk.length;if(bytes>7*1024*1024) throw new ApiError(413,'上傳內容過大。');chunks.push(chunk);}
  try {return JSON.parse(Buffer.concat(chunks).toString());} catch {throw new ApiError(400,'請求格式不正確。');}
}
export function createApi(config, {fetcher=fetch, verifyIdentity}={}) {
  let active=0, callsUsed=0;
  const aiEnabled=config.AI_ENABLED==='true';
  const imagesEnabled=config.AI_IMAGES_ENABLED==='true';
  const callLimit=Number(config.AI_CALL_LIMIT || 20);
  if(!Number.isSafeInteger(callLimit) || callLimit<1 || callLimit>1000) throw new Error('AI_CALL_LIMIT 必須是 1 至 1000 的整數。');
  const limitedFetcher=async (...args)=>{
    if(callsUsed>=callLimit) throw new ApiError(429,'本次伺服器啟動的 AI 呼叫上限已用完。示範模式仍可使用。');
    callsUsed++;
    return fetcher(...args);
  };
  const oauth=new OAuth2Client(config.GOOGLE_CLIENT_ID);
  const key=config.GEMINI_API_KEY || config.GOOGLE_API_KEY;
  const textModel=config.GEMINI_TEXT_MODEL || 'gemini-2.5-flash';
  const imageModel=config.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
  return async (req,res,next)=>{
    const path=req.url?.split('?')[0];if(!path?.startsWith('/api/')) return next();
    res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
    const send=(status,value)=>{res.statusCode=status;res.end(JSON.stringify(value));};
    try {
      if(req.method==='GET' && path==='/api/status') return send(200,{gemini:!!key && aiEnabled,aiEnabled,keyConfigured:!!key,imagesEnabled,callsUsed,callLimit,googleClientId:config.GOOGLE_CLIENT_ID||'',textModel,imageModel,account:readSession(req)});
      if(req.method!=='POST') throw new ApiError(405,'不支援此操作。');
      const origin=req.headers.origin;
      const publicOrigin=config.PUBLIC_ORIGIN || (config.CODESPACE_NAME ? `https://${config.CODESPACE_NAME}-${config.PORT||5173}.${config.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN||'app.github.dev'}` : '');
      if(!origin || (new URL(origin).host!==req.headers.host && origin!==publicOrigin)) throw new ApiError(403,'請從目前網站操作。');
      const body=await readBody(req);
      const secure=origin.startsWith('https:')?'; Secure':'';
      if(path==='/api/logout') {res.setHeader('Set-Cookie',`bloom_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`);return send(200,{ok:true});}
      if(path==='/api/login') {
        if(!config.GOOGLE_CLIENT_ID) throw new ApiError(503,'尚未設定 Google OAuth Client ID。');
        if(typeof body.credential!=='string' || body.credential.length>10000) throw new ApiError(400,'Google 登入憑證格式不正確。');
        let identity;
        try {identity=verifyIdentity ? await verifyIdentity(body.credential) : (await oauth.verifyIdToken({idToken:body.credential,audience:config.GOOGLE_CLIENT_ID})).getPayload();}catch{throw new ApiError(401,'Google 登入憑證無效或已過期，請重新登入。');}
        if(!identity?.sub || !identity.email_verified) throw new ApiError(401,'請使用已驗證的 Google 帳號。');
        const account={sub:identity.sub,name:identity.name||'Google 使用者',email:identity.email};
        res.setHeader('Set-Cookie',`bloom_session=${encodeSession(account)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${secure}`);
        return send(200,{account});
      }
      if(!['/api/run','/api/plan'].includes(path)) throw new ApiError(404,'找不到此操作。');
      if(!aiEnabled) throw new ApiError(503,'AI 呼叫已關閉，目前可免費使用本機示範。確認 Google 專案未啟用付費後，再設定 AI_ENABLED=true。');
      if(!key) throw new ApiError(503,'尚未設定 Gemini API 金鑰。請開啟「連線設定」查看啟用方式。');
      if(config.GOOGLE_CLIENT_ID && !readSession(req)) throw new ApiError(401,'請先登入 Google 再使用 AI 功能。');
      if(active>=2) throw new ApiError(429,'目前有工作執行中，請稍後再試。');
      active++;
      try {
        if(path==='/api/run' && !imagesEnabled && body.flow?.nodes?.some(n=>n.type==='generate' && n.mode==='image')) throw new ApiError(403,'圖片生成尚未啟用。請先使用文字流程，或切換示範模式。');
        if(path==='/api/run') return send(200,await executeWorkflow({flow:body.flow,input:body.input,image:body.image,key,textModel,imageModel,fetcher:limitedFetcher}));
        if(typeof body.idea!=='string' || !body.idea.trim() || body.idea.length>1000) throw new ApiError(400,'請描述 1 至 1000 字的工具需求。');
        const answer=await generate({key,model:textModel,json:true,fetcher:limitedFetcher,parts:[{text:`將需求設計成一個簡潔的工作流程，回傳 JSON，schema: {"name":"名稱","description":"簡介","steps":[{"title":"步驟名稱","content":"給 AI 的完整指令","mode":"text 或 image"}]}。一到四個步驟，全部使用繁體中文，只有需求確實需要產生圖片時才用 image。需求：${body.idea}`} ]});
        let plan;try{plan=JSON.parse(answer.text);}catch{throw new ApiError(502,'模型傳回的流程格式不正確，請重試。');}
        if(!plan || typeof plan.name!=='string' || !plan.name.trim() || plan.name.length>100 || typeof plan.description!=='string' || plan.description.length>500 || !Array.isArray(plan.steps) || plan.steps.length<1 || plan.steps.length>4 || plan.steps.some(s=>!s || typeof s.title!=='string' || !s.title.trim() || s.title.length>100 || typeof s.content!=='string' || !s.content.trim() || s.content.length>5000 || !['text','image'].includes(s.mode))) throw new ApiError(502,'模型傳回的流程不符合格式，請重試。');
        return send(200,{plan});
      } finally {active--;}
    }catch(err){send(err.status||400,{error:err.status?err.message:err.message?.startsWith('工作流程')||err.message?.startsWith('請匯入')?err.message:'無法完成此操作，請檢查輸入格式。'});}
  };
}
