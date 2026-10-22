import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createWorkflow,validateWorkflow,demoResult,templates} from '../src/workflow.js';
test('all templates produce valid sequential flows',()=>{for(const key of Object.keys(templates)){const f=createWorkflow(key);assert.equal(validateWorkflow(f),f);assert.equal(f.nodes[0].type,'input');assert.equal(f.nodes.at(-1).type,'output');}});
test('reject malformed imports and duplicate identifiers',()=>{assert.throws(()=>validateWorkflow({version:1,nodes:[]}));const f=createWorkflow();f.nodes[1].id=f.nodes[0].id;assert.throws(()=>validateWorkflow(f));});
test('reject invalid coordinates',()=>{const f=createWorkflow();f.nodes[0].x=Infinity;assert.throws(()=>validateWorkflow(f));});
test('demo uses edited instructions and input without claiming model output',()=>{const f=createWorkflow();f.nodes[1].content='請用英文回答';const output=demoResult(f,'書店');assert.match(output,/非 AI 生成/);assert.match(output,/請用英文回答/);assert.match(output,/書店/);assert.throws(()=>demoResult(f,'  '));});
