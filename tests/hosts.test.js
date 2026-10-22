import {test} from 'node:test';
import assert from 'node:assert/strict';
import {allowedPreviewHosts} from '../server/hosts.js';
test('permits only current Codespace exact hostname and actual port',()=>{
 assert.deepEqual(allowedPreviewHosts({CODESPACE_NAME:'my-workspace'},5173),['my-workspace-5173.app.github.dev']);
 assert.deepEqual(allowedPreviewHosts({CODESPACE_NAME:'my-workspace'},4173),['my-workspace-4173.app.github.dev']);
 assert.deepEqual(allowedPreviewHosts({},5173),[]);
});
test('explicit public origin is supported without disabling host verification',()=>{
 assert.deepEqual(allowedPreviewHosts({PUBLIC_ORIGIN:'https://bloom.example.com'},5173),['bloom.example.com']);
 assert.throws(()=>allowedPreviewHosts({PUBLIC_ORIGIN:'https://example.com/unexpected-path'},5173));
 assert.throws(()=>allowedPreviewHosts({CODESPACE_NAME:'*'},5173));
});
