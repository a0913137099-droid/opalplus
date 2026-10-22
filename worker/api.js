import {sessionCookie,clearSessionCookie,readAiSession} from './session.js';
import {ApiError, executeWorkflow, generate} from './engine.js';
import {validateWorkflow} from '../frontend/src/workflow.js';
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
export function createWorkerApi(fetcher=fetch){
 let callsUsed=0,active=0;
 return async function handle(request,env={}){
 const path=new URL(request.url).pathname;
 const session=await readAiSession(request,env.AI_SESSION_SECRET);
 if(session)env={...env,GEMINI_API_KEY:session.key,AI_ENABLED:'true',AI_IMAGES_ENABLED:session.images?'true':'false',GEMINI_TEXT_MODEL:session.textModel,GEMINI_IMAGE_MODEL:session.imageModel};
 const enabled=env.AI_ENABLED==='true',key=env.GEMINI_API_KEY;
 const imagesEnabled=env.AI_IMAGES_ENABLED==='true';
 const textModel=env.GEMINI_TEXT_MODEL||'gemini-2.5-flash';
 const imageModel=env.GEMINI_IMAGE_MODEL||'gemini-2.5-flash-image';
 const limit=Number(env.AI_CALL_LIMIT||20);
 const limitedFetch=async(...args)=>{if(callsUsed>=limit)throw new ApiError(429,'目前執行個體的 AI 呼叫上限已用完，請稍後再試。');callsUsed++;return fetcher(...args);};
 try{
 if(request.method==='GET'&&path==='/api/status')return json({gemini:enabled&&!!key,aiEnabled:enabled,keyConfigured:!!key,imagesEnabled,textModel,imageModel,googleClientId:'',account:null,callsUsed,callLimit:limit,hosted:true,keyEntryAvailable:!!env.AI_SESSION_SECRET,sessionConfigured:!!session});
 if(request.method!=='POST')throw new ApiError(405,'不支援此操作。');
 if(request.headers.get('Origin')!==new URL(request.url).origin)throw new ApiError(403,'請從目前網站操作。');
 if(path==='/api/connection'){
 if(!env.AI_SESSION_SECRET)throw new ApiError(503,'安全設定尚未完成，暫時無法儲存金鑰。');
 if(Number(request.headers.get('Content-Length')||0)>4096)throw new ApiError(413,'設定資料過大。');
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw new ApiError(415,'請使用 JSON 格式。');
 const reader=request.body?.getReader();if(!reader)throw new ApiError(400,'缺少設定。');let bytes=0,content='';const decoder=new TextDecoder();while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>4096){await reader.cancel();throw new ApiError(413,'設定資料過大。');}content+=decoder.decode(value,{stream:true});}content+=decoder.decode();
 let settings;try{settings=JSON.parse(content);}catch{throw new ApiError(400,'設定格式不正確。');}
 if(settings.clear)return new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store','Set-Cookie':clearSessionCookie()}});
 if(typeof settings.key!=='string'||settings.key.trim().length<20||settings.key.trim().length>2048||!/^[-_.A-Za-z0-9]+$/.test(settings.key.trim()))throw new ApiError(400,'請貼上完整 Gemini 金鑰，請勿包含引號、空白或換行。支援標準金鑰與含句點的授權金鑰。');
 if(settings.confirm!==true)throw new ApiError(400,'請先確認免費方案與資料傳送。');
 for(const field of ['textModel','imageModel'])if(typeof settings[field]!=='string'||!/^[-_.a-zA-Z0-9]{1,100}$/.test(settings[field]))throw new ApiError(400,'模型名稱格式不正確。');
 const cookie=await sessionCookie({key:settings.key.trim(),textModel:settings.textModel,imageModel:settings.imageModel,images:settings.images===true},env.AI_SESSION_SECRET);
 return new Response(JSON.stringify({ok:true,message:'設定已儲存，尚未驗證模型額度。'}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store','Set-Cookie':cookie}});
 }
 if(!['/api/run','/api/plan'].includes(path))throw new ApiError(404,'此版本未啟用 Google 登入或雲端儲存。');
 if(!key)throw new ApiError(503,'尚未設定 Gemini API 金鑰。請在網站的伺服器環境設定中加入 GEMINI_API_KEY；不要貼到聊天或流程裡。');
 if(!enabled)throw new ApiError(503,'AI 尚未啟用。確認 Google 專案的免費額度及未啟用付費後，在伺服器設定 AI_ENABLED=true。');
 if(!Number.isSafeInteger(limit)||limit<1||limit>1000)throw new ApiError(503,'AI_CALL_LIMIT 設定不正確。');
 if(active>=1)throw new ApiError(429,'已有流程執行中，請完成後再試。');
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw new ApiError(415,'請使用 JSON 格式。');
 const reader=request.body?.getReader();if(!reader)throw new ApiError(400,'缺少輸入內容。');
 const chunks=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>7*1024*1024){await reader.cancel();throw new ApiError(413,'上傳內容過大。');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 let body;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new ApiError(400,'請求格式不正確。');}
 if(path==='/api/run'){
 validateWorkflow(body.flow);
 if(!imagesEnabled&&body.flow.nodes.some(n=>n.type==='generate'&&n.mode==='image'))throw new ApiError(403,'此流程包含圖片生成，但圖片模型尚未啟用。請先確認模型免費額度，再設定 AI_IMAGES_ENABLED=true；或先使用純文字流程。');
 active++;
 const options={flow:body.flow,input:body.input,image:body.image,key,textModel,imageModel,fetcher:limitedFetch};
 if(request.headers.get('Accept')==='text/event-stream'){
 const encoder=new TextEncoder();
 const stream=new ReadableStream({async start(controller){let closed=false;const send=(type,data)=>{if(!closed)try{controller.enqueue(encoder.encode(`data: ${JSON.stringify({type,...data})}\n\n`));}catch{closed=true;}};
 try{const result=await executeWorkflow({...options,onStep:id=>send('step-start',{id}),onStepEnd:step=>send('step-complete',{step})});send('result',{result});}catch(error){send('error',{message:error instanceof ApiError?error.message:'執行失敗，請檢查流程內容或稍後重試。'});}finally{active--;if(!closed)controller.close();}},cancel(){/* Upstream timeout remains bounded; no automatic retry. */}});
 return new Response(stream,{headers:{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','X-Accel-Buffering':'no'}});
 }
 try{return json(await executeWorkflow(options));}finally{active--;}
 }
 if(typeof body.idea!=='string'||!body.idea.trim()||body.idea.length>1000)throw new ApiError(400,'請描述 1 至 1000 字的工具需求。');
 active++;try{
 const answer=await generate({key,model:textModel,json:true,fetcher:limitedFetch,parts:[{text:`將需求設計成繁體中文工作流程，回傳 JSON：{"name":"名稱","description":"簡介","steps":[{"title":"名稱","content":"完整指令","mode":"text 或 image"}]}。1 至 4 個步驟。需求：${body.idea}`} ]});
 let plan;try{plan=JSON.parse(answer.text);}catch{throw new ApiError(502,'模型回傳的流程格式不正確。');}
 if(!plan||typeof plan.name!=='string'||!plan.name.trim()||plan.name.length>100||typeof plan.description!=='string'||plan.description.length>500||!Array.isArray(plan.steps)||plan.steps.length<1||plan.steps.length>4||plan.steps.some(s=>!s||typeof s.title!=='string'||!s.title.trim()||s.title.length>100||typeof s.content!=='string'||!s.content.trim()||s.content.length>5000||!['text','image'].includes(s.mode)))throw new ApiError(502,'模型回傳的流程不符合格式。');
 return json({plan});
 }finally{active--;}
 }catch(error){return json({error:error instanceof ApiError?error.message:'無法完成操作，請檢查輸入格式。'},error instanceof ApiError?error.status:400);}
 };
}
