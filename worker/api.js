import {isOwner,loadShared,setShared,reserveSharedCall} from './shared.js';
import {sessionCookie,clearSessionCookie,readAiSession} from './session.js';
import {ApiError, executeWorkflow, generate} from './engine.js';
import {validateWorkflow} from '../frontend/src/workflow.js';
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
export function createWorkerApi(fetcher=fetch){
 let callsUsed=0,active=0;
 return async function handle(request,env={}){
 const path=new URL(request.url).pathname;
 const owner=isOwner(request,env),publicTrial=env.PUBLIC_TRIAL==='true';
 const session=await readAiSession(request,env.AI_SESSION_SECRET);
 const shared=publicTrial?await loadShared(request,env):null;
 const effective=publicTrial?(owner?(session||shared):shared):session;
 const usingShared=publicTrial&&!owner;
 if(effective)env={...env,GEMINI_API_KEY:effective.key,AI_ENABLED:'true',AI_IMAGES_ENABLED:effective.images?'true':'false',GEMINI_TEXT_MODEL:effective.textModel,GEMINI_IMAGE_MODEL:effective.imageModel};
 if(usingShared&&!shared)env={...env,GEMINI_API_KEY:'',AI_ENABLED:'false'};
 const enabled=env.AI_ENABLED==='true',key=env.GEMINI_API_KEY;
 const imagesEnabled=env.AI_IMAGES_ENABLED==='true';
 const textModel=env.GEMINI_TEXT_MODEL||'gemini-2.5-flash';
 const imageModel=env.GEMINI_IMAGE_MODEL||'gemini-2.5-flash-image';
 const limit=Number(env.AI_CALL_LIMIT||20);
 const limitedFetch=async(...args)=>{if(!usingShared&&callsUsed>=limit)throw new ApiError(429,'目前執行個體的 AI 呼叫上限已用完，請稍後再試。');if(usingShared)await reserveSharedCall(request,env);callsUsed++;return fetcher(...args);};
 try{
 if(request.method==='GET'&&path==='/api/status')return json({gemini:enabled&&!!key,aiEnabled:enabled,keyConfigured:!!key,imagesEnabled,textModel,imageModel,googleClientId:'',account:null,callsUsed,callLimit:limit,hosted:true,keyEntryAvailable:!!env.AI_SESSION_SECRET&&(!publicTrial||owner),sessionConfigured:!!session&&(!publicTrial||owner),publicTrial,canManageShared:owner,sharedActive:!!shared,sharedExpires:shared?.expires||null,sharedDailyLimit:Number(env.SHARED_DAILY_CALL_LIMIT||60),visitorDailyLimit:Number(env.VISITOR_DAILY_CALL_LIMIT||6)});
 if(request.method==='GET'&&path==='/api/models'){
 if(publicTrial&&!owner)throw new ApiError(403,'訪客無法讀取共用金鑰的模型清單。');
 if(!key)throw new ApiError(503,'請先儲存 API 金鑰，再讀取模型清單。');
 const models=[];let token='';
 for(let page=0;page<5;page++){
 const url=new URL('https://generativelanguage.googleapis.com/v1beta/models');url.searchParams.set('pageSize','1000');if(token)url.searchParams.set('pageToken',token);
 let response;try{response=await fetcher(url.toString(),{headers:{'x-goog-api-key':key},signal:AbortSignal.timeout(20000)});}catch{throw new ApiError(504,'讀取模型清單逾時，請稍後再試。');}
 if(!response.ok)throw new ApiError(response.status===401||response.status===403?response.status:502,response.status===401?'Google 不接受這把金鑰，請確認完整複製。':response.status===403?'Google 拒絕讀取模型，請確認金鑰權限與專案。':response.status===429?'Google 暫時限制請求，請稍後再讀取。':'Google 無法提供模型清單，請稍後再試。');
 const data=await response.json();for(const model of data.models||[]){if(model.supportedGenerationMethods?.includes('generateContent')&&typeof model.name==='string'){models.push({name:model.name.replace(/^models\//,''),displayName:model.displayName||model.name});}}
 token=data.nextPageToken||'';if(!token)break;
 }
 return json({models,truncated:!!token,notice:'清單列出支援 generateContent 的模型，不保證每個模型有免費額度或支援圖片生成。'});
 }
 if(request.method!=='POST')throw new ApiError(405,'不支援此操作。');
 if(request.headers.get('Origin')!==new URL(request.url).origin)throw new ApiError(403,'請從目前網站操作。');
 if(path==='/api/shared-settings'){
 if(!owner)throw new ApiError(403,'只有管理員可以變更服務設定。');
 await setShared(request,env,session,new URL(request.url).searchParams.get('clear')==='1');
 return json({ok:true});
 }
 if(path==='/api/connection'){
 if(publicTrial&&!owner)throw new ApiError(403,'服務設定由管理員維護。');
 if(!env.AI_SESSION_SECRET)throw new ApiError(503,'安全設定尚未完成，暫時無法儲存金鑰。');
 if(Number(request.headers.get('Content-Length')||0)>4096)throw new ApiError(413,'設定資料過大。');
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw new ApiError(415,'請使用 JSON 格式。');
 const reader=request.body?.getReader();if(!reader)throw new ApiError(400,'缺少設定。');let bytes=0,content='';const decoder=new TextDecoder();while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>4096){await reader.cancel();throw new ApiError(413,'設定資料過大。');}content+=decoder.decode(value,{stream:true});}content+=decoder.decode();
 let settings;try{settings=JSON.parse(content);}catch{throw new ApiError(400,'設定格式不正確。');}
 if(settings.clear)return new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store','Set-Cookie':clearSessionCookie()}});
 if((settings.key===undefined||settings.key==='')&&session)settings.key=session.key;
 if(typeof settings.key!=='string'||settings.key.trim().length<20||settings.key.trim().length>2048||!/^[-_.A-Za-z0-9]+$/.test(settings.key.trim()))throw new ApiError(400,'請貼上完整 Gemini 金鑰，請勿包含引號、空白或換行。支援標準金鑰與含句點的授權金鑰。');
 if(settings.confirm!==true)throw new ApiError(400,'請先確認專案方案與資料傳送。');
 for(const field of ['textModel','imageModel'])if(typeof settings[field]!=='string'||!/^[-_.a-zA-Z0-9]{1,100}$/.test(settings[field]))throw new ApiError(400,'模型名稱格式不正確。');
 const cookie=await sessionCookie({key:settings.key.trim(),textModel:settings.textModel,imageModel:settings.imageModel,images:settings.images===true},env.AI_SESSION_SECRET);
 return new Response(JSON.stringify({ok:true,message:'設定已儲存，尚未驗證模型額度。'}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store','Set-Cookie':cookie}});
 }
 if(!['/api/run','/api/plan'].includes(path))throw new ApiError(404,'此版本未啟用 Google 登入或雲端儲存。');
 if(!key)throw new ApiError(503,usingShared?'AI 服務暫時未開放，請稍後再試。':'尚未設定 Gemini API 金鑰，請至「連線設定」完成設定。');
 if(!enabled)throw new ApiError(503,'AI 服務尚未啟用，請聯絡管理員。');
 if(!Number.isSafeInteger(limit)||limit<1||limit>1000)throw new ApiError(503,'AI_CALL_LIMIT 設定不正確。');
 if(active>=1)throw new ApiError(429,'已有流程執行中，請完成後再試。');
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw new ApiError(415,'請使用 JSON 格式。');
 const reader=request.body?.getReader();if(!reader)throw new ApiError(400,'缺少輸入內容。');
 const chunks=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>7*1024*1024){await reader.cancel();throw new ApiError(413,'上傳內容過大。');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 let body;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new ApiError(400,'請求格式不正確。');}
 if(path==='/api/run'){
 validateWorkflow(body.flow);
 if(!imagesEnabled&&body.flow.nodes.some(n=>n.type==='generate'&&n.mode==='image'))throw new ApiError(403,'此流程包含圖片生成，請先在「連線設定」啟用圖片生成並選擇可用模型。');
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
