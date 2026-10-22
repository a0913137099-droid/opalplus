import {test,expect} from '@playwright/test';
test('edit, drag, run, persist, and export a workflow',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await expect(page.locator('h1')).toHaveText('社群內容靈感助手');
 await page.locator('[data-id="generate"]').click();await page.locator('#node-content').fill('將想法寫成一句簡短的標語。');await page.getByRole('button',{name:'儲存變更'}).click();
 await page.locator('#run-input').fill('台南的巷弄書店');await page.locator('#run').click();await expect(page.locator('.result-content')).toContainText('台南的巷弄書店');await expect(page.locator('.result-content')).toContainText('將想法寫成一句簡短的標語。');
 const n=page.locator('[data-id="input"]');const before=await n.boundingBox();await page.mouse.move(before.x+100,before.y+50);await page.mouse.down();await page.mouse.move(before.x+120,before.y+70,{steps:5});await page.mouse.up();await expect(n).toHaveCSS('left','70px');
 await page.reload();await expect(page.locator('[data-id="generate"]')).toContainText('將想法寫成一句簡短的標語。');await expect(page.locator('[data-id="input"]')).toHaveCSS('left','70px');
 const download=page.waitForEvent('download');await page.locator('#export-btn').click();expect((await download).suggestedFilename()).toBe('bloom-workflow.json');expect(errors).toEqual([]);
 await page.screenshot({path:'/tmp/bloom-desktop.png',fullPage:true});
});
test('template, add/delete step, invalid import, mobile layout',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');
 await page.locator('[data-template="travel"]').first().click();await expect(page.locator('h1')).toHaveText('週末旅行規劃師');
 await page.locator('#add-node').click();await page.locator('#node-title').fill('額外整理');await page.locator('#save-node').click();await expect(page.locator('.node')).toHaveCount(4);
 await page.getByRole('button',{name:/額外整理/}).click();await page.locator('#delete-node').click();await expect(page.locator('.node')).toHaveCount(3);
 await page.locator('#import-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{}')});await expect(page.locator('#toast')).toContainText('有效的 Bloom');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'/tmp/bloom-mobile.png',fullPage:true});
});
