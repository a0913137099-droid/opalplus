import {test,expect} from '@playwright/test';
// Keep UI tests independent of optional external font downloads.
test.beforeEach(async({page})=>{await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,route=>route.fulfill({contentType:'text/css',body:''}));});
test('edit, drag, run, persist, and export a workflow',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await expect(page.locator('h1')).toHaveText('社群內容靈感助手');
 await page.locator('[data-id="generate"]').click();await page.locator('#node-content').fill('將想法寫成一句簡短的標語。');await page.getByRole('button',{name:'儲存變更'}).click();
 await page.locator('#run-input').fill('台南的巷弄書店');await page.locator('#run').click();await expect(page.locator('.result-content')).toContainText('台南的巷弄書店');await expect(page.locator('.result-content')).toContainText('將想法寫成一句簡短的標語。');
 const n=page.locator('[data-id="input"]');await n.scrollIntoViewIfNeeded();const before=await n.boundingBox();await page.mouse.move(before.x+100,before.y+50);await page.mouse.down();await page.mouse.move(before.x+120,before.y+70,{steps:5});await page.mouse.up();await expect(n).toHaveCSS('left','70px');
 await page.reload();await expect(page.locator('[data-id="generate"]')).toContainText('將想法寫成一句簡短的標語。');await expect(page.locator('[data-id="input"]')).toHaveCSS('left','70px');
 const download=page.waitForEvent('download');await page.locator('#export-btn').click();expect((await download).suggestedFilename()).toBe('bloom-workflow.json');expect(errors).toEqual([]);
 await page.screenshot({path:'/tmp/bloom-desktop.png',fullPage:true});
});
test('template, add/delete step, invalid import, mobile layout',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');
 await page.locator('[data-template="travel"]').first().click();await expect(page.locator('h1')).toHaveText('週末旅行規劃師');
 await page.locator('#add-node').click();await page.locator('#node-title').fill('額外整理');await page.locator('#save-node').click();await expect(page.locator('.node')).toHaveCount(4);
 await page.getByRole('button',{name:/額外整理/}).click();await page.locator('#delete-node').click();await expect(page.locator('.node')).toHaveCount(3);await expect(page.locator('[data-id="generate"]')).toBeInViewport();
 await page.locator('#import-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{}')});await expect(page.locator('#toast')).toContainText('有效的 Bloom');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'/tmp/bloom-mobile.png',fullPage:true});
});
test('copy/download editable text, upload/copy images, create a real PNG card',async({page,context})=>{
 await context.grantPermissions(['clipboard-read','clipboard-write']);
 await page.goto('/');await page.locator('#run-input').fill('為台南書店寫一則文案');
 const data=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=32;c.height=32;c.getContext('2d').fillRect(0,0,32,32);return c.toDataURL('image/png').split(',')[1];});
 await page.locator('#reference-image').setInputFiles({name:'reference.png',mimeType:'image/png',buffer:Buffer.from(data,'base64')});await expect(page.locator('.attachment-preview img')).toBeVisible();
 await page.locator('#run').click();await page.locator('#result-text').fill('一間書店，一整個下午的溫柔。');await page.locator('#copy-result').click();expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe('一間書店，一整個下午的溫柔。');
 const textDownload=page.waitForEvent('download');await page.locator('#download-text').click();expect((await textDownload).suggestedFilename()).toBe('bloom-content.txt');
 await page.locator('[data-image-copy="0"]').click();await expect(page.locator('#toast')).toContainText('圖片已複製');expect(await page.evaluate(async()=>(await navigator.clipboard.read())[0].types)).toContain('image/png');
 await page.locator('#make-card').click();await expect(page.locator('.image-result')).toHaveCount(2);expect(await page.locator('.image-result img').last().evaluate(el=>el.naturalWidth)).toBe(1080);
 const pngDownload=page.waitForEvent('download');await page.locator('[data-image-download="1"]').click();expect((await pngDownload).suggestedFilename()).toBe('bloom-image-2.png');
 await page.locator('#save-doc').click();await expect(page.locator('#connection-dialog')).toBeVisible();await expect(page.locator('#connection-content')).toContainText('需要 OAuth 設定');
});
test('Gemini results, image mode, planner, and API failure are reflected honestly',async({page})=>{
 await page.route('**/api/status',route=>route.fulfill({json:{gemini:true,googleClientId:'',account:null,textModel:'test-text',imageModel:'test-image'}}));
 let call;
 await page.route('**/api/run',async route=>{call=route.request().postDataJSON();await route.fulfill({json:{text:'台南書店的午後，讓閱讀慢下來。',images:[],steps:[{id:'generate',title:'讓靈感發芽',text:'完成的貼文',images:[],durationMs:800}],source:'gemini'}});});
 await page.route('**/api/plan',route=>route.fulfill({json:{plan:{name:'書店海報助手',description:'建立海報與圖說',steps:[{title:'生成海報',content:'畫一張書店插畫',mode:'image'}]}}}));
 await page.goto('/');await expect(page.locator('#engine')).toHaveValue('gemini');
 await page.locator('#idea').fill('做書店海報');await page.locator('#build-idea').click();await expect(page.locator('h1')).toHaveText('書店海報助手');await expect(page.locator('.node-generate')).toContainText('Gemini 圖片');
 await page.locator('#run-input').fill('一間台南書店');await page.locator('#run').click();await expect(page.locator('#result-text')).toHaveValue('台南書店的午後，讓閱讀慢下來。');expect(call.flow.nodes[1].mode).toBe('image');
 await page.locator('.run-steps summary').click();await expect(page.locator('.run-steps pre')).toContainText('完成的貼文');
 await page.getByRole('button',{name:'小工具',exact:true}).click();await page.route('**/api/run',route=>route.fulfill({status:429,json:{error:'Gemini 額度不足，請檢查計費。'}}));await page.locator('#run').click();await expect(page.locator('#run-error')).toContainText('額度不足');await page.getByRole('button',{name:'執行結果',exact:true}).click();await expect(page.locator('.empty-result')).toBeVisible();
});
test('Google login and Drive authorization UI: document upload and visible errors (mocked Google)',async({page})=>{
 let account=null;let uploads=0;let fail=false;
 await page.route('**/api/status',route=>route.fulfill({json:{gemini:false,googleClientId:'test-client',account}}));
 await page.route('**/api/login',route=>{account={name:'小花',email:'flower@example.com'};return route.fulfill({json:{account}});});
 await page.route('https://accounts.google.com/gsi/client',route=>route.fulfill({contentType:'application/javascript',body:`window.google={accounts:{id:{initialize(opts){window.fakeSignIn=opts.callback;},renderButton(el){const b=document.createElement('button');b.textContent='使用 Google 登入（測試）';b.onclick=()=>window.fakeSignIn({credential:'test-credential'});el.append(b);}},oauth2:{initTokenClient(opts){return{requestAccessToken(){opts.callback({access_token:'test-only-token',expires_in:3600,scope:'https://www.googleapis.com/auth/drive.file'});}}},hasGrantedAllScopes(){return true;},revoke(token,cb){cb();}}}};` }));
 await page.route('https://www.googleapis.com/upload/drive/v3/files?**',route=>{
  uploads++;expect(route.request().headers().authorization).toBe('Bearer test-only-token');expect(route.request().postData()).toContain('application/vnd.google-apps.document');
  return route.fulfill(fail?{status:403,json:{error:{message:'forbidden'}}}:{json:{id:'test-file-123',name:'書店文案'}});
 });
 await page.goto('/');await page.locator('#connections').click();await page.getByRole('button',{name:'使用 Google 登入（測試）'}).click();await expect(page.locator('.profile')).toContainText('小花');
 await page.locator('#run-input').fill('台南書店');await page.locator('#run').click();await page.locator('#save-doc').click();await expect(page.locator('#google-file')).toContainText('已儲存：書店文案');expect(uploads).toBe(1);
 fail=true;await page.locator('#save-doc').click();await expect(page.locator('#run-error')).toContainText('無法寫入 Google Drive');expect(uploads).toBe(2);
});
