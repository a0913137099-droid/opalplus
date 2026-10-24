export function downloadBlob(blob, name) {
 const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
export function imageBlob(image) {
 const bytes=Uint8Array.from(atob(image.data),c=>c.charCodeAt(0));return new Blob([bytes],{type:image.mimeType});
}
export async function pngBlob(image) {
 const bitmap=await createImageBitmap(imageBlob(image));
 const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;canvas.getContext('2d').drawImage(bitmap,0,0);bitmap.close();
 return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('圖片轉換失敗。')),'image/png'));
}
export async function copyText(text) {
 try {await navigator.clipboard.writeText(text);} catch {
   const el=document.createElement('textarea');el.value=text;el.style.cssText='position:fixed;opacity:0';document.body.append(el);el.select();const ok=document.execCommand('copy');el.remove();if(!ok)throw new Error('瀏覽器不允許複製，請選取文案手動複製。');
 }
}
export async function copyImage(image) {
 if(!navigator.clipboard?.write || !window.ClipboardItem) throw new Error('此瀏覽器不支援圖片複製，請使用「下載圖片」。');
 // Pass the promise immediately to preserve the user activation on Safari.
 await navigator.clipboard.write([new ClipboardItem({'image/png':pngBlob(image)})]);
}
export async function readImage(file) {
 if(!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size>5*1024*1024) throw new Error('請選擇 5 MB 以下的 PNG、JPEG 或 WebP。');
 const bitmap=await createImageBitmap(file);bitmap.close();
 const url=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('讀取圖片失敗。'));reader.readAsDataURL(file);});
 return {mimeType:file.type,data:url.split(',')[1]};
}
export function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function documentHtml(title,text) {
 return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body><h1>${escapeHtml(title)}</h1><p style="white-space:pre-wrap">${escapeHtml(text)}</p></body></html>`;
}
export async function textCard(title,text) {
 const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1080;const ctx=canvas.getContext('2d');
 ctx.fillStyle='#f4f7ec';ctx.fillRect(0,0,1080,1080);ctx.fillStyle='#d6e99f';ctx.beginPath();ctx.arc(950,130,240,0,Math.PI*2);ctx.fill();
 ctx.fillStyle='#697f47';ctx.font='24px sans-serif';ctx.fillText('BLOOM / 文字圖卡',76,90);ctx.fillStyle='#303d25';ctx.font='bold 42px sans-serif';
 const wrap=(value,maxWidth)=>{const lines=[];let line='';for(const c of value){if(c==='\n'){lines.push(line);line='';continue;}if(ctx.measureText(line+c).width>maxWidth&&line){lines.push(line);line=c;}else line+=c;}if(line)lines.push(line);return lines;};
 const titleLines=wrap(title,920).slice(0,2);titleLines.forEach((l,i)=>ctx.fillText(l,76,190+i*60));
 ctx.font='30px sans-serif';ctx.fillStyle='#5d6a50';const lines=wrap(text,920);const start=250+(titleLines.length-1)*60;const maxLines=Math.floor((960-start)/46);lines.slice(0,maxLines).forEach((l,i)=>ctx.fillText(i===maxLines-1&&lines.length>maxLines?l.slice(0,-1)+'…':l,76,start+i*46));
 ctx.fillStyle='#92a17e';ctx.font='20px sans-serif';ctx.fillText(lines.length>maxLines?'完整文案請另存文字檔 · bloom':'把靈感，變成值得分享的內容。',76,1020);
 const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('圖卡產生失敗。')),'image/png'));
 const buffer=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<buffer.length;i+=8192)binary+=String.fromCharCode(...buffer.subarray(i,i+8192));
 return {mimeType:'image/png',data:btoa(binary)};
}
