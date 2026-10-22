import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createWorkerApi} from './api.js';
import {createWorkflow} from '../frontend/src/workflow.js';
const origin='https://test.example';
function database(){const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../drizzle/0000_freezing_red_shift.sql',import.meta.url),'utf8'));return {prepare(sql){return {bind(...values){return {async first(){return sqlite.prepare(sql).get(...values)||null;},async run(){return sqlite.prepare(sql).run(...values);}};}};},sqlite};}
function post(path,body={},headers={}){return new Request(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});}
const owner={'oai-authenticated-user-email':'owner@example.test'};
const settings={key:'AQ.Ab.'+'x'.repeat(40),textModel:'text-current',imageModel:'image-current',images:true,confirm:true};
async function setup(api,env){const saved=await api(post('/api/connection',settings,owner),env);assert.equal(saved.status,200);const cookie=saved.headers.get('Set-Cookie').split(';')[0];const shared=await api(post('/api/shared-settings',{}, {...owner,Cookie:cookie}),env);assert.equal(shared.status,200);return cookie;}
test('only owner promotes encrypted shared credentials, and visitors need no key',async()=>{
 const DB=database();const env={DB,PUBLIC_TRIAL:'true',SITE_OWNER_EMAIL:owner['oai-authenticated-user-email'],AI_SESSION_SECRET:'server-secret'};let calls=0;const api=createWorkerApi(async()=>{calls++;return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:'成功'}]}}]});});
 assert.equal((await api(post('/api/shared-settings'),env)).status,403);assert.equal((await api(post('/api/connection',settings),env)).status,403);
 await setup(api,env);const raw=DB.sqlite.prepare('SELECT encrypted FROM shared_settings').get().encrypted;assert.ok(!raw.includes(settings.key));
 const response=await api(new Request(origin+'/api/status'),env);const status=await response.json();assert.equal(status.gemini,true);assert.equal(status.sharedActive,true);assert.equal(status.keyEntryAvailable,false);assert.equal(status.canManageShared,false);assert.ok(!JSON.stringify(status).includes(settings.key));
 assert.equal((await api(new Request(origin+'/api/models'),env)).status,403);
 assert.equal((await api(post('/api/run',{flow:createWorkflow(),input:'咖啡'}),env)).status,200);assert.equal(calls,1);
 assert.equal((await api(post('/api/shared-settings?clear=1',{},owner),env)).status,200);
 assert.equal((await api(post('/api/run',{flow:createWorkflow(),input:'咖啡'}),env)).status,503);assert.equal(calls,1);DB.sqlite.close();
});
test('persistent global and network quotas bound upstream calls across Worker instances',async()=>{
 const DB=database();const env={DB,PUBLIC_TRIAL:'true',SITE_OWNER_EMAIL:owner['oai-authenticated-user-email'],AI_SESSION_SECRET:'server-secret',SHARED_DAILY_CALL_LIMIT:'2',VISITOR_DAILY_CALL_LIMIT:'1'};let calls=0;const fetcher=async()=>{calls++;return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:'成功'}]}}]});};
 const api=createWorkerApi(fetcher);await setup(api,env);
 const body={flow:createWorkflow(),input:'咖啡'};
 assert.equal((await api(post('/api/run',body,{'cf-connecting-ip':'192.0.2.1'}),env)).status,200);
 assert.equal((await createWorkerApi(fetcher)(post('/api/run',body,{'cf-connecting-ip':'192.0.2.1'}),env)).status,429);
 assert.equal((await createWorkerApi(fetcher)(post('/api/run',body,{'cf-connecting-ip':'192.0.2.2'}),env)).status,200);
 assert.equal((await createWorkerApi(fetcher)(post('/api/run',body,{'cf-connecting-ip':'192.0.2.3'}),env)).status,429);assert.equal(calls,2);
 const rows=DB.sqlite.prepare('SELECT * FROM trial_quotas').all();assert.ok(!JSON.stringify(rows).includes('192.0.2.'));DB.sqlite.close();
});
