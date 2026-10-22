import {sessionCookie,readAiSession} from './session.js';
import {ApiError} from './engine.js';
export const isOwner=(request,env)=>!!env.SITE_OWNER_EMAIL&&request.headers.get('oai-authenticated-user-email')?.toLowerCase()===env.SITE_OWNER_EMAIL.toLowerCase();
export async function loadShared(request,env){
 if(!env.DB||!env.AI_SESSION_SECRET)return null;
 const row=await env.DB.prepare('SELECT encrypted FROM shared_settings WHERE id = ?').bind('shared').first();
 if(!row)return null;
 return readAiSession(new Request(request.url,{headers:{Cookie:row.encrypted}}),env.AI_SESSION_SECRET);
}
export async function setShared(request,env,session,clear=false){
 if(!isOwner(request,env))throw new ApiError(403,'只有網站擁有者可以管理共用試用。');
 if(!env.DB||!env.AI_SESSION_SECRET)throw new ApiError(503,'共用試用儲存尚未啟用。');
 if(clear){await env.DB.prepare('DELETE FROM shared_settings WHERE id = ?').bind('shared').run();return;}
 if(!session?.key)throw new ApiError(400,'請先在本瀏覽器儲存金鑰與模型，再開啟共用試用。');
 const encrypted=(await sessionCookie(session,env.AI_SESSION_SECRET,7*24*3600*1000)).split(';')[0];
 await env.DB.prepare('INSERT INTO shared_settings(id, encrypted, updated_at) VALUES(?, ?, ?) ON CONFLICT(id) DO UPDATE SET encrypted=excluded.encrypted,updated_at=excluded.updated_at').bind('shared',encrypted,new Date().toISOString()).run();
}
export async function reserveSharedCall(request,env){
 if(!env.DB)throw new ApiError(503,'共用試用的用量管理尚未啟用。');
 const globalLimit=Number(env.SHARED_DAILY_CALL_LIMIT||60),visitorLimit=Number(env.VISITOR_DAILY_CALL_LIMIT||6);
 if(![globalLimit,visitorLimit].every(n=>Number.isSafeInteger(n)&&n>0&&n<=1000))throw new ApiError(503,'試用次數設定不正確。');
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const identity=request.headers.get('cf-connecting-ip')||request.headers.get('oai-authenticated-user-id')||'anonymous-network';
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(env.AI_SESSION_SECRET+identity));const hash=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
 for(const [bucket,limit] of [['visitor:'+hash,visitorLimit],['global',globalLimit]]){
 const row=await env.DB.prepare('INSERT INTO trial_quotas(bucket, day, count) VALUES(?, ?, 1) ON CONFLICT(bucket) DO UPDATE SET count=CASE WHEN trial_quotas.day=excluded.day THEN trial_quotas.count+1 ELSE 1 END,day=excluded.day WHERE trial_quotas.day<>excluded.day OR trial_quotas.count<? RETURNING count').bind(bucket,day,limit).first();
 if(!row)throw new ApiError(429,bucket==='global'?'今天全站共用試用次數已用完，請明天再試。':'你所在網路今天的試用次數已用完，請明天再試。');
 }
}
