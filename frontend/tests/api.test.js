import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createApi,executeWorkflow,generate,validateImage} from '../server/api.js';
import {createWorkflow} from '../src/workflow.js';
const pixel={mimeType:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII='};
const answer=parts=>new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts}}]}),{status:200,headers:{'Content-Type':'application/json'}});
async function withApi(config,options,callback){const api=createApi({AI_ENABLED:'true',AI_IMAGES_ENABLED:'true',...config},options);const server=createServer((req,res)=>api(req,res,()=>{res.statusCode=404;res.end();}));await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;try{await callback(url);}finally{await new Promise(r=>server.close(r));}}
const post=(url,path,body,headers={})=>fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:url,...headers},body:JSON.stringify(body)});
test('sequential real runner passes text and images to the next node',async()=>{
 const f=createWorkflow();f.nodes[1].mode='image';f.nodes.splice(2,0,{...f.nodes[1],id:'caption',title:'撰寫圖說',mode:'text'});
 const calls=[];const out=await executeWorkflow({flow:f,input:'畫一間書店',key:'not-a-real-key',textModel:'text-model',imageModel:'image-model',fetcher:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return calls.length===1?answer([{text:'書店插畫'},{inlineData:pixel}]):answer([{text:'午後的書香'}]);}});
 assert.match(calls[0].url,/image-model/);assert.match(calls[1].url,/text-model/);assert.match(calls[1].body.contents[0].parts[0].text,/書店插畫/);assert.deepEqual(calls[1].body.contents[0].parts[1].inlineData,pixel);assert.equal(out.text,'午後的書香');assert.equal(out.steps.length,2);assert.equal(out.steps[0].images.length,1);
});
test('upstream failure, blocked result, and missing image never become successes',async()=>{
 await assert.rejects(generate({key:'x',model:'x',parts:[],fetcher:async()=>new Response('{"key":"must-not-leak"}',{status:429})}),/額度不足/);
 await assert.rejects(generate({key:'x',model:'x',parts:[],image:true,fetcher:async()=>answer([{text:'no image'}])}),/沒有傳回圖片/);
 await assert.rejects(generate({key:'x',model:'x',parts:[],fetcher:async()=>new Response(JSON.stringify({promptFeedback:{blockReason:'SAFETY'}}))}),/未完成/);
});
test('rejects fake image data, malformed flows, and oversized input before upstream',async()=>{
 assert.throws(()=>validateImage({mimeType:'image/png',data:'AAAA'}));assert.throws(()=>validateImage({mimeType:'image/svg+xml',data:'AAAA'}));assert.deepEqual(validateImage(pixel),pixel);
 await assert.rejects(executeWorkflow({flow:createWorkflow(),input:'x'.repeat(5001)}),/5000/);
});
test('API reports capabilities only and clearly blocks missing credentials',async()=>withApi({}, {}, async url=>{
 const status=await (await fetch(url+'/api/status')).json();assert.equal(status.gemini,false);assert.equal(status.account,null);
 const res=await post(url,'/api/run',{flow:createWorkflow(),input:'書店'});assert.equal(res.status,503);assert.match((await res.json()).error,/尚未設定/);
 const bad=await fetch(url+'/api/logout',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://evil.test'},body:'{}'});assert.equal(bad.status,403);
}));
test('verified Google login issues HttpOnly session; auth protects AI and logout clears access',async()=>withApi({GEMINI_API_KEY:'never-expose-me',GOOGLE_CLIENT_ID:'client-id'},{verifyIdentity:async()=>({sub:'123',name:'測試帳號',email:'test@example.com',email_verified:true}),fetcher:async()=>answer([{text:'真正的模型回應'}])},async url=>{
 const statusText=await (await fetch(url+'/api/status')).text();assert.ok(!statusText.includes('never-expose-me'));
 assert.equal((await post(url,'/api/run',{flow:createWorkflow(),input:'書店'})).status,401);
 const login=await post(url,'/api/login',{credential:'signed-test-id'});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Lax/);
 const res=await post(url,'/api/run',{flow:createWorkflow(),input:'書店'},{Cookie:cookie.split(';')[0]});assert.equal(res.status,200);assert.equal((await res.json()).text,'真正的模型回應');
 const logout=await post(url,'/api/logout',{});assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
 const forged=await post(url,'/api/run',{flow:createWorkflow(),input:'書店'},{Cookie:'bloom_session=forged.invalid'});assert.equal(forged.status,401);
}));
test('planner validates structured AI output and rejects malformed plans',async()=>{
 let valid=true;await withApi({GEMINI_API_KEY:'x'},{fetcher:async()=>answer([{text:JSON.stringify(valid?{name:'製作海報',description:'圖文流程',steps:[{title:'畫圖',content:'生成書店海報',mode:'image'}]}:{name:'oops',steps:[]})}])},async url=>{
 const res=await post(url,'/api/plan',{idea:'做海報'});assert.equal(res.status,200);assert.equal((await res.json()).plan.steps[0].mode,'image');valid=false;assert.equal((await post(url,'/api/plan',{idea:'做海報'})).status,502);
 });
});
test('explicit Codespaces origin works behind rewritten Host; arbitrary origins are blocked',async()=>withApi({CODESPACE_NAME:'my-workspace',GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:'app.github.dev'}, {}, async url=>{
 const res=await post(url,'/api/logout',{}, {Origin:'https://my-workspace-5173.app.github.dev'});assert.equal(res.status,200);
 const bad=await post(url,'/api/logout',{}, {Origin:'https://other-workspace-5173.app.github.dev'});assert.equal(bad.status,403);
}));

test('personal trial blocks AI by default even with a key',async()=>withApi({AI_ENABLED:'false',GEMINI_API_KEY:'x'}, {fetcher:async()=>{throw new Error('must not call');}}, async url=>{
 const status=await (await fetch(url+'/api/status')).json();assert.equal(status.gemini,false);assert.equal(status.keyConfigured,true);
 for(const path of ['/api/run','/api/plan'])assert.equal((await post(url,path,{flow:createWorkflow(),input:'hello',idea:'hello'})).status,503);
}));
test('image guard and request budget prevent upstream calls',async()=>{
 let calls=0;await withApi({GEMINI_API_KEY:'x',AI_IMAGES_ENABLED:'false',AI_CALL_LIMIT:'1'},{fetcher:async()=>{calls++;return answer([{text:'done'}]);}},async url=>{
 const imageFlow=createWorkflow();imageFlow.nodes[1].mode='image';
 assert.equal((await post(url,'/api/run',{flow:imageFlow,input:'hello'})).status,403);assert.equal(calls,0);
 assert.equal((await post(url,'/api/run',{flow:createWorkflow(),input:'hello'})).status,200);
 assert.equal((await post(url,'/api/run',{flow:createWorkflow(),input:'hello'})).status,429);assert.equal(calls,1);
 assert.equal((await (await fetch(url+'/api/status')).json()).callsUsed,1);
 });
});
