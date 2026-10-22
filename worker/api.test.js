import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createWorkerApi} from './api.js';
import {createWorkflow} from '../frontend/src/workflow.js';
const origin='https://test.example';
const env={AI_ENABLED:'true',GEMINI_API_KEY:'fake-key'};
const post=(path,body,stream=false)=>new Request(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(stream?{Accept:'text/event-stream'}:{})},body:JSON.stringify(body)});
const answer=(text='文案完成')=>new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text}]}}]}));
test('status exposes configuration but never the key; missing configuration blocks generation',async()=>{
 let calls=0;const api=createWorkerApi(async()=>{calls++;return answer();});
 const status=await api(new Request(origin+'/api/status'),env);const text=await status.text();assert.ok(!text.includes('fake-key'));assert.equal(JSON.parse(text).gemini,true);
 for(const config of [{},{GEMINI_API_KEY:'fake-key'}]){const response=await api(post('/api/run',{flow:createWorkflow(),input:'書店'}),config);assert.equal(response.status,503);}
 assert.equal(calls,0);
});
test('cross-origin, disabled images, and malformed flows never call a model',async()=>{
 let calls=0;const api=createWorkerApi(async()=>{calls++;return answer();});
 const evil=new Request(origin+'/api/run',{method:'POST',headers:{Origin:'https://evil.example'}});assert.equal((await api(evil,env)).status,403);
 const flow=createWorkflow();flow.nodes[1].mode='image';assert.equal((await api(post('/api/run',{flow,input:'畫圖'}),env)).status,403);
 assert.equal((await api(post('/api/run',{flow:{},input:'x'}),env)).status,400);assert.equal(calls,0);
});
test('stream emits actual step progress then a complete generated result',async()=>{
 const flow=createWorkflow();flow.nodes.splice(2,0,{...flow.nodes[1],id:'second',title:'潤稿'});let calls=0;
 const api=createWorkerApi(async()=>answer('第'+(++calls)+'步完成'));
 const response=await api(post('/api/run',{flow,input:'書店'},true),env);assert.match(response.headers.get('Content-Type'),/event-stream/);
 const events=(await response.text()).trim().split('\n\n').map(s=>JSON.parse(s.slice(6)));
 assert.deepEqual(events.map(e=>e.type),['step-start','step-complete','step-start','step-complete','result']);assert.equal(events.at(-1).result.text,'第2步完成');assert.equal(calls,2);
});
test('provider quota error stops the stream without retry or fake output',async()=>{
 let calls=0;const api=createWorkerApi(async()=>{calls++;return new Response('{}',{status:429});});
 const response=await api(post('/api/run',{flow:createWorkflow(),input:'書店'},true),env);const text=await response.text();assert.match(text,/"type":"error"/);assert.doesNotMatch(text,/"type":"result"/);assert.equal(calls,1);
});
test('per-instance request cap counts failed attempts and blocks the next call',async()=>{
 let calls=0;const api=createWorkerApi(async()=>{calls++;return new Response('{}',{status:429});});const config={...env,AI_CALL_LIMIT:'1'};
 for(let i=0;i<2;i++)assert.equal((await api(post('/api/run',{flow:createWorkflow(),input:'書店'}),config)).status,429);assert.equal(calls,1);
});
test('structured planner response is validated',async()=>{
 const plan={name:'書店貼文',description:'描述',steps:[{title:'文案',content:'寫貼文',mode:'text'}]};
 const api=createWorkerApi(async()=>answer(JSON.stringify(plan)));const response=await api(post('/api/plan',{idea:'寫書店貼文'}),env);assert.equal(response.status,200);assert.deepEqual((await response.json()).plan,plan);
});
test('key setup encrypts the key, activates only this browser, rejects tampering, and clears access',async()=>{
 const api=createWorkerApi();const config={AI_SESSION_SECRET:'test-session-secret-not-production'};
 const settings={key:'test-key-that-is-at-least-twenty-chars',textModel:'gemini-2.5-flash',imageModel:'gemini-2.5-flash-image',images:false,confirm:true};
 const response=await api(post('/api/connection',settings),config);assert.equal(response.status,200);const cookie=response.headers.get('Set-Cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/SameSite=Strict/);assert.ok(!cookie.includes(settings.key));assert.ok(!(await response.text()).includes(settings.key));
 const status=await api(new Request(origin+'/api/status',{headers:{Cookie:cookie.split(';')[0]}}),config);const data=await status.json();assert.equal(data.gemini,true);assert.equal(data.imagesEnabled,false);assert.equal(data.sessionConfigured,true);assert.ok(!JSON.stringify(data).includes(settings.key));
 const tampered=await api(new Request(origin+'/api/status',{headers:{Cookie:cookie.split(';')[0]+'tamper'}}),config);assert.equal((await tampered.json()).gemini,false);
 const clear=await api(post('/api/connection',{clear:true}),config);assert.match(clear.headers.get('Set-Cookie'),/Max-Age=0/);
 assert.equal((await api(post('/api/connection',{...settings,confirm:false}),config)).status,400);
});
