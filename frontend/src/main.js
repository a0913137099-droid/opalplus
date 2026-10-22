import './style.css';
import {createWorkflow, templates, validateWorkflow, demoResult, workflowFromPlan} from './workflow.js';
import {downloadBlob, imageBlob, copyText, copyImage, readImage, textCard, documentHtml} from './assets.js';
import {prepareGoogle, mountGoogleLogin, saveToDrive, disconnectDrive} from './google.js';
const hostedDemo=false;
const demoService={gemini:false,googleClientId:'',account:null,aiEnabled:false,keyConfigured:false,imagesEnabled:false,callsUsed:0,callLimit:20};
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons={spark:'✳',input:'↓',generate:'✧',output:'▤'};
let service={gemini:false,googleClientId:'',account:null}, engine='gemini', attachment=null, images=[], steps=[], resultSource='', googleFile=null, outputBusy=false;
let flow=createWorkflow(), selected=null, tab='app', result='', running=false, zoom=1;
try {const saved=localStorage.getItem('bloom-workflow');if(saved) flow=validateWorkflow(JSON.parse(saved));}catch{}
function save(){try{localStorage.setItem('bloom-workflow',JSON.stringify(flow));$('#save-status').textContent='已儲存至此瀏覽器';}catch{$('#save-status').textContent='無法儲存，請匯出備份';}}
$('#app').innerHTML=`
<aside class="sidebar"><a class="brand" href="#" aria-label="Bloom 首頁"><span class="brand-mark">✳</span>bloom<span class="beta">LAB</span></a><button class="new-project"><span>＋</span> 新的靈感</button><div class="nav-caption">工作空間</div><button class="nav-item active" id="workspace-nav"><span>▦</span> 我的工作流程 <span class="nav-count">1</span></button><button class="nav-item" id="templates-nav"><span>◇</span> 範本探索 <span>↗</span></button><div class="sidebar-projects"><div class="nav-caption">最近開啟 <span>⌄</span></div><button class="project-item"><i></i><span id="project-label"></span></button></div><div class="sidebar-bottom"><div class="tip"><span>✧</span><strong>從一個想法開始。</strong><p>不必寫程式，讓你的靈感<br>長成真正有用的小工具。</p><button id="tip-explore">找一點靈感 ↗</button></div><div class="profile"><span class="avatar">Y</span><div>你的工作空間<small>個人版 · 本機儲存</small></div><span class="profile-dot"></span></div></div></aside>
<div class="main"><header><div class="breadcrumb">我的工作流程 <span>/</span> <span id="breadcrumb-name"></span></div><div class="header-right"><button class="connection-btn" id="connections">◎ 連線設定</button><span id="save-status">已儲存至此瀏覽器</span><button class="icon-btn" id="import-btn" title="匯入工作流程" aria-label="匯入工作流程">↑</button><button class="share-btn" id="export-btn">↗ <span>匯出流程</span></button></div></header>
<main><section class="intro"><div><div class="eyebrow"><span></span> YOUR IDEAS, IN BLOOM</div><div class="title-row"><h1 id="flow-title" tabindex="0" title="點擊修改名稱"></h1><button class="edit-name" aria-label="修改流程名稱">✎</button></div><p id="flow-description"></p></div><div class="intro-flower" aria-hidden="true">✳<span>讓好點子，開始發生。</span></div></section>
<section class="builder"><div class="builder-top"><div class="builder-label"><span class="small-flower">✳</span> 工作流程 <span class="pill">視覺化編輯器</span></div><button class="text-btn" id="add-node">＋ 新增步驟</button></div><div class="canvas" id="canvas"><div class="canvas-note"><span class="live-dot"></span> 你的想法，正在這裡串連 <span class="canvas-hint">拖曳移動 · 點擊編輯</span></div><div class="canvas-viewport"><div id="canvas-stage"><svg id="edges" width="1800" height="1100" aria-hidden="true"></svg><div id="nodes"></div></div></div><div class="canvas-bottom"><span class="flow-order">依畫面編號順序執行 <span>→</span></span><div class="zoom-tools"><button id="zoom-out" aria-label="縮小">−</button><span id="zoom-value">100%</span><button id="zoom-in" aria-label="放大">＋</button><i></i><button id="reset-view" aria-label="重設檢視">⌖</button></div></div></div></section>
<div class="lower-grid"><section class="prompt-section"><div class="section-heading"><h2><span>✧</span> 你想做出什麼？</h2><span>從一句話開始</span></div><div class="prompt-box"><textarea id="idea" aria-label="描述想建立的工具" placeholder="例如：幫我做一個規劃週末小旅行的工具⋯" maxlength="1000"></textarea><div><span>✧ 示範模式 · 依主題選用範本</span><button id="build-idea">建立流程 <span>↗</span></button></div></div><div class="suggestions"><span>試試看</span><button data-template="content">✎ 社群文案</button><button data-template="visual">▨ 文案＋配圖</button><button data-template="travel">☀ 旅行規劃</button><button data-template="learning">▧ 學習計畫</button></div><div class="footnote"><span>♧</span> 靈感只屬於你。工作流程儲存在你的瀏覽器中。</div></section>
<section class="preview-section"><div class="section-heading"><h2><span class="preview-dot"></span> 開始產出</h2><div class="preview-tabs"><button class="active" data-tab="app">輸入與產出</button><button data-tab="result">執行結果</button></div></div><div class="preview-card" id="preview"></div></section></div>
<footer>MADE FOR YOUR NEXT BIG LITTLE IDEA <span>✳ bloom / 實驗性原型</span></footer></main></div>
<dialog id="editor"><form method="dialog"><div class="dialog-heading"><span id="editor-type"></span><button class="icon-btn" aria-label="關閉編輯器" formnovalidate>×</button></div><h2>編輯這個步驟</h2><label>步驟名稱<input id="node-title" maxlength="100" required></label><label id="content-label" for="node-content">指令內容</label><textarea id="node-content" maxlength="5000" required></textarea><p class="editor-note">節點依編號順序串接。生成步驟將收到前一步的文案與圖片；執行模式可在預覽中選擇。</p><label id="mode-label">生成內容<select id="node-mode"><option value="text">文案／文字（Gemini）</option><option value="image">圖片（Gemini 圖像模型）</option></select></label><div class="reorder-actions"><button type="button" id="move-up">↑ 提前一步</button><button type="button" id="move-down">↓ 延後一步</button></div><div class="dialog-actions"><button type="button" id="delete-node" class="danger">刪除步驟</button><button class="primary" id="save-node" value="save">儲存變更 ↗</button></div></form></dialog>
<dialog id="template-dialog"><div class="dialog-heading"><span class="eyebrow">A LITTLE INSPIRATION</span><button class="icon-btn" id="close-templates" aria-label="關閉範本">×</button></div><h2>下一個好點子，從這裡開始。</h2><p>選擇範本會取代目前流程；需要保留時請先匯出。</p><div class="template-grid">${Object.entries(templates).map(([k,t],i)=>`<button class="template-card" data-template="${k}"><span>${['✎','☀','▨','▧'][i]}</span><strong>${t.name}</strong><p>${t.description}</p><small>使用範本 ↗</small></button>`).join('')}</div></dialog>
<dialog id="connection-dialog"><div class="dialog-heading"><span class="eyebrow">CONNECTED TO YOUR IDEAS</span><button class="icon-btn" id="close-connections" aria-label="關閉連線設定">×</button></div><h2>讓工具真正開始工作。</h2><div id="connection-content"></div></dialog>
<input type="file" id="import-file" accept="application/json,.json" hidden><div id="toast" role="status"></div>`;
const productionLayout=document.createElement('div');productionLayout.className='production-layout';
const editingColumn=document.createElement('div');editingColumn.className='editing-column';
$('.builder').before(productionLayout);productionLayout.append(editingColumn,$('.preview-section'));
editingColumn.append($('.builder'),$('.prompt-section'));$('.lower-grid').remove();
function render(){
 $('#flow-title').textContent=flow.name;$('#breadcrumb-name').textContent=flow.name;$('#project-label').textContent=flow.name;$('#flow-description').textContent=flow.description||'把你的想法，一步一步串連起來。';
 $('#nodes').innerHTML=flow.nodes.map((n,i)=>`<button class="node node-${n.type}" data-id="${esc(n.id)}" style="left:${n.x}px;top:${n.y}px"><span class="port port-in"></span><div class="node-type"><span class="node-icon">${icons[n.type]}</span><span>${{input:'使用者輸入',generate:'AI 生成',output:'呈現結果'}[n.type]}</span><span class="node-number">0${i+1}</span></div><h3>${esc(n.title)}</h3><p>${esc(n.content)}</p><div class="node-footer"><span>${n.type==='generate'?(n.mode==='image'?'Gemini 圖片':'Gemini 文案'):n.type==='input'?'文字與圖片輸入':'文案與圖片輸出'}</span><span>↗</span></div><span class="port port-out"></span></button>`).join('');
 drawEdges(); renderPreview();
}
function drawEdges(){ $('#edges').innerHTML=flow.nodes.slice(0,-1).map((n,i)=>{let b=flow.nodes[i+1],x=n.x+266,y=n.y+87,tx=b.x,ty=b.y+87;return `<path d="M${x},${y} C${x+70},${y} ${tx-70},${ty} ${tx},${ty}" fill="none" stroke="#b9bdb0" stroke-width="1.6"/><circle cx="${(x+tx)/2}" cy="${(y+ty)/2}" r="9" fill="#f5f7f0" stroke="#d4d8ca"/><text x="${(x+tx)/2}" y="${(y+ty)/2+3}" text-anchor="middle" fill="#8d9681" font-size="10">→</text>`;}).join(''); }
let inputValue='',runProgress={};
function renderPreview(){
 const t=templates[flow.template]||templates.content;
 $('#preview').innerHTML=tab==='app'?`
 <div class="preview-mini-brand">✳ <span>執行你的工作流程</span><span class="execution-status">${service.gemini?'AI 已設定 · 待執行驗證':'AI 尚未連線'}</span></div>
 <h3>${esc(flow.nodes.at(-1).content)}</h3><p class="preview-description">${esc(flow.nodes[0].content)}</p>
 <label class="sr-only" for="run-input">工具輸入內容</label><textarea id="run-input" placeholder="${esc(t.placeholder)}" maxlength="5000" ${running?'disabled':''}>${esc(inputValue)}</textarea>
 <div class="attachment-row"><label class="upload-btn">＋ 加入參考圖片<input type="file" id="reference-image" accept="image/png,image/jpeg,image/webp" ${running?'disabled':''}></label><small>PNG / JPG / WebP · 5 MB</small></div>
 ${attachment?`<div class="attachment-preview"><img src="data:${attachment.mimeType};base64,${attachment.data}" alt="使用者提供的參考圖片"><span>參考圖片</span><button id="remove-attachment" aria-label="移除參考圖片" ${running?'disabled':''}>×</button></div>`:''}
 <button class="run-btn" id="run" ${running?'disabled':''}>${running?'正在產出，請稍候⋯':'✦ 開始產出'} <span>↗</span></button>
 <button class="demo-run-btn" id="run-demo" ${running?'disabled':''}>先試跑示範（不呼叫 AI）</button>
 ${!service.gemini?'<p class="setup-needed">流程已可編輯。真正產出前，需在「連線設定」完成 AI 設定。<button id="setup-ai">設定 AI ↗</button></p>':''}
 ${running?`<div class="execution-progress" role="status"><strong>依序執行節點中</strong>${flow.nodes.filter(n=>n.type==='generate').map(n=>`<div class="progress-step"><span>${runProgress[n.id]==='done'?'✓':runProgress[n.id]==='running'?'◌':'○'}</span>${esc(n.title)}<small>${runProgress[n.id]==='done'?'完成':runProgress[n.id]==='running'?'產出中':'等待'}</small></div>`).join('')}</div>`:''}
 <small class="preview-disclaimer">${engine==='gemini'?'執行時會將輸入、參考圖與指令傳送至 Google Gemini，可能產生費用；請確認 Google 專案未啟用付費。圖片生成預設關閉。':'示範模式不呼叫 AI；參考圖片僅保留於本頁。'}</small>
 <p class="inline-error" id="run-error" role="alert"></p>`:
 `<div class="result-top"><span>${resultSource==='gemini'?'✧ Gemini 生成結果':resultSource==='card'?'▧ 文字圖卡':'↳ 示範結果'}</span>${result?'<button id="copy-result">複製文案 ↗</button>':''}</div>
 ${result?`<label class="result-edit-label" for="result-text">可以直接編輯文案，再複製或儲存</label><textarea id="result-text" class="result-content" aria-label="結果文案">${esc(result)}</textarea>
 <div class="output-actions"><button id="download-text">↓ 下載文案</button><button id="download-html">↓ 下載文件</button><button id="make-card">▧ 製作文字圖卡</button><button ${service.hosted?'hidden':''} id="save-doc">↗ 存成 Google 文件</button><button ${service.hosted?'hidden':''} id="save-drive">↗ 存到 Drive</button></div>`:'<p class="empty-result">還沒有結果。切換到「小工具」，輸入內容後開始執行。</p>'}
 <div class="image-results">${images.map((img,i)=>`<article class="image-result"><img src="data:${img.mimeType};base64,${img.data}" alt="${resultSource==='gemini'?'AI 生成圖片':'參考圖片或文字圖卡'} ${i+1}"><div><span>圖片 ${i+1}</span><button data-image-copy="${i}">複製圖片</button><button data-image-download="${i}">下載</button><button ${service.hosted?'hidden':''} data-image-drive="${i}">存至 Drive</button></div></article>`).join('')}</div>
 ${steps.length?`<details class="run-steps"><summary>已完成 ${steps.length} 個生成步驟 · 查看每步結果</summary>${steps.map((step,i)=>`<article><strong>${i+1}. ${esc(step.title)} <small>${(step.durationMs/1000).toFixed(1)} 秒</small></strong><pre>${esc(step.text||'圖片生成完成')}</pre>${step.images.map(img=>`<img src="data:${img.mimeType};base64,${img.data}" alt="步驟 ${i+1} 的圖片">`).join('')}</article>`).join('')}</details>`:''}
 <div id="google-file">${googleFile?`<a href="https://drive.google.com/file/d/${encodeURIComponent(googleFile.id)}/view" target="_blank" rel="noopener noreferrer">✓ 已儲存：${esc(googleFile.name)} ↗</a>`:''}</div><p class="inline-error" id="run-error" role="alert"></p>`;
 $('#preview').setAttribute('aria-busy',String(running || outputBusy));
 if(outputBusy) $('#preview').querySelectorAll('button').forEach(b=>b.disabled=true);
}
function clearOutput(){result='';images=[];steps=[];resultSource='';googleFile=null;}
async function api(path, body){
 if(hostedDemo)throw new Error('這是個人示範部署，AI 與 Google 雲端服務未啟用。');
 let response;try{response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(600_000)});}catch{throw new Error('無法連線到伺服器，請確認網站仍在執行。');}
 const data=await response.json();if(!response.ok)throw new Error(data.error||'操作失敗，請稍後重試。');return data;
}
async function runWithProgress(body){
 const response=await fetch('/api/run',{method:'POST',headers:{'Content-Type':'application/json',Accept:'text/event-stream'},body:JSON.stringify(body),signal:AbortSignal.timeout(600_000)});
 if(!response.ok){const data=await response.json();throw new Error(data.error||'無法執行流程。');}
 if(!response.headers.get('Content-Type')?.includes('text/event-stream'))return response.json();
 const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',finalResult;
 try{while(true){const {done,value}=await reader.read();buffer+=done?decoder.decode():decoder.decode(value,{stream:true});let end;
 while((end=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,end);buffer=buffer.slice(end+2);const line=frame.split('\n').find(line=>line.startsWith('data: '));if(!line)continue;const event=JSON.parse(line.slice(6));
 if(event.type==='error')throw new Error(event.message);
 if(event.type==='step-start'){runProgress[event.id]='running';renderPreview();}
 if(event.type==='step-complete'){runProgress[event.step.id]='done';renderPreview();}
 if(event.type==='result')finalResult=event.result;
 }if(done)break;}
 }finally{reader.releaseLock();}
 if(!finalResult)throw new Error('連線中斷，未收到完整結果。請勿重複點擊，確認後再試。');return finalResult;
}
function setBusy(busy){running=busy;lockControls(busy);}
function lockControls(busy){$('.builder').inert=busy;$('.prompt-section').inert=busy;$('.header-right').inert=busy;$('.new-project').disabled=busy;$('#templates-nav').disabled=busy;$('#tip-explore').disabled=busy;}
function showError(message){const el=$('#run-error');if(el)el.textContent=message;notify(message);}
async function refreshService(){
 if(hostedDemo){service={...demoService};engine='gemini';updateAccount();renderPreview();$('.prompt-box>div>span').textContent='✧ 個人示範版 · 依主題選用範本';$('.footnote').textContent='個人示範版 · 不呼叫 AI · 流程僅存於目前瀏覽器，請匯出備份。';return;}
 try{const r=await fetch('/api/status');if(!r.ok)throw new Error();service=await r.json();engine='gemini';updateAccount();renderPreview();if(service.googleClientId)prepareGoogle(service.googleClientId).catch(()=>{});$('.prompt-box>div>span').textContent=service.gemini?'✧ Gemini · 從描述設計流程':'✧ 未連線 AI · 依主題選用範本';}catch{notify('後端服務未連線，目前可使用示範模式。');}
}
function updateAccount(){const account=service.account;$('.avatar').textContent=account?.name?.slice(0,1)||'Y';$('.profile>div').textContent=account?.name||'你的工作空間';const small=document.createElement('small');small.textContent=account?'Google 已登入 · 流程仍存於本機':'個人版 · 本機儲存';$('.profile>div').append(small);}
async function openConnections(){
 try{const response=hostedDemo?null:await fetch('/api/status');if(response?.ok)service=await response.json();}catch{}
 $('#connection-dialog').showModal();
 if(service.hosted){
 $('#connection-content').innerHTML=`<section class="connection-item"><strong>連接 Gemini AI</strong><p>${service.keyConfigured?'設定已儲存，請執行一次以驗證模型與額度。':'尚未設定金鑰。請先到 Google AI Studio 建立 API 金鑰。'}</p><a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">① 前往 Google AI Studio 建立金鑰 ↗</a><p>請確認 Google 專案維持 Free Tier，且未啟用付費。文字與圖片的免費額度不同；此網站無法查核 Google 帳務。先以純文字流程測試。</p><form id="ai-connection-form"><label for="ai-key">② 貼上 Gemini API 金鑰</label><input id="ai-key" type="password" autocomplete="off" spellcheck="false" placeholder="貼上金鑰（不會顯示已儲存的金鑰）" required minlength="20" maxlength="256"><label for="ai-text-model">文字模型</label><input id="ai-text-model" value="${esc(service.textModel||'gemini-2.5-flash')}" required maxlength="100"><label class="key-checkbox"><input id="ai-images" type="checkbox">啟用圖片生成（請先確認模型可用性與費用）</label><label for="ai-image-model">圖片模型</label><input id="ai-image-model" value="${esc(service.imageModel||'gemini-2.5-flash-image')}" required maxlength="100"><label class="key-checkbox"><input id="ai-confirm" type="checkbox" required>我已確認 Google 專案方案，並同意執行時將輸入與參考圖傳送給 Google。</label><p class="key-security">金鑰透過 HTTPS 傳到本站伺服器，以加密且 JavaScript 無法讀取的 Cookie 暫存 8 小時，不會寫入流程、GitHub 或 localStorage。儲存設定不會呼叫 AI；「開始產出」才會發送請求。</p><button type="submit" class="primary" ${service.keyEntryAvailable?'':'disabled'}>③ 儲存並啟用 AI</button>${service.sessionConfigured?'<button type="button" id="clear-ai" class="outline-btn">清除本瀏覽器金鑰</button>':''}<p id="ai-connection-error" role="alert"></p></form></section>`;
 $('#ai-connection-form').onsubmit=async event=>{event.preventDefault();const submit=event.currentTarget.querySelector('[type=submit]');submit.disabled=true;try{await api('/api/connection',{key:$('#ai-key').value.trim(),textModel:$('#ai-text-model').value.trim(),imageModel:$('#ai-image-model').value.trim(),images:$('#ai-images').checked,confirm:$('#ai-confirm').checked});$('#ai-key').value='';await refreshService();$('#connection-dialog').close();notify('設定已儲存。請輸入內容並按「開始產出」，驗證實際生成。');}catch(error){$('#ai-connection-error').textContent=error.message;}finally{submit.disabled=false;}};
 if($('#clear-ai'))$('#clear-ai').onclick=async()=>{try{await api('/api/connection',{clear:true});await refreshService();$('#connection-dialog').close();notify('已清除本瀏覽器的金鑰。');}catch(error){$('#ai-connection-error').textContent=error.message;}};
 return;}

 $('#connection-content').innerHTML=`<section class="connection-item"><div><strong>✧ Gemini AI</strong><span class="connection-status ${service.gemini?'connected':''}">${service.gemini?'金鑰已設定・尚需實際執行驗證':service.keyConfigured?'金鑰已設定・AI 呼叫已關閉':'示範模式・不呼叫 AI'}</span></div><p>個人試用版預設使用示範模式，不發送 AI 請求。啟用 AI 前，請確認 Google 專案未啟用付費；本網站無法查核你的帳務狀態。</p><p>金鑰只存於伺服器，不會放進瀏覽器或流程匯出檔案。</p><small>本次啟動已呼叫：${Number(service.callsUsed)||0} / ${Number(service.callLimit)||20} 次（重啟歸零，並非費用上限）<br>圖片生成：${service.imagesEnabled?'已啟用':'預設關閉'}<br>文案模型：${esc(service.textModel||'gemini-2.5-flash')}<br>圖片模型：${esc(service.imageModel||'gemini-2.5-flash-image')}</small></section>
 <section class="connection-item"><div><strong>G Google 帳號</strong><span class="connection-status ${service.account?'connected':''}">${service.account?'已登入':service.googleClientId?'可登入':'需要 OAuth 設定'}</span></div><p>${service.account?esc(service.account.email):'登入後可啟用 AI，並在儲存時授權 Google Drive。只請求存取由這個工具建立或選取的檔案。'}</p><div id="google-signin"></div>${service.account?'<button class="outline-btn" id="logout-google">登出並解除本頁 Drive 連線</button>':''}<p id="google-login-error" role="alert"></p></section>
 <details class="setup-guide" ${!hostedDemo&&(!service.gemini||!service.googleClientId)?'open':''}><summary>${hostedDemo?'本機版 AI 啟用指南（此部署僅支援示範）':'首次啟用指南'}</summary><ol><li>至 <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio</a> 建立 Gemini API 金鑰。</li><li>在 Codespaces 專案根目錄建立 <code>.env.local</code>，依照 <code>.env.example</code> 填入 <code>GEMINI_API_KEY</code>。僅在確認免費額度及未啟用付費後，加入 <code>AI_ENABLED=true</code>，然後重啟開發伺服器。圖片生成另需 <code>AI_IMAGES_ENABLED=true</code>。不要將金鑰貼在聊天或前端程式碼。</li><li>在 <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer">Google Cloud</a> 設定 OAuth 同意畫面（測試階段加入自己的帳號），建立「網頁應用程式」Client ID，將目前網站來源加入「已授權的 JavaScript 來源」：<code class="origin-code">${esc(location.origin)}</code>。</li><li>將 Client ID 填入伺服器 <code>GOOGLE_CLIENT_ID</code>，並啟用 Google Drive API。重新啟動網站後即可登入。公開給其他人使用前，請依 Google 規定發布 OAuth 應用程式。</li></ol><p>Google 登入與 Drive 授權會在 Google 的視窗進行。不要在這裡輸入 Google 密碼。</p></details>`;
 if(service.googleClientId){
  try{await mountGoogleLogin(service.googleClientId,$('#google-signin'),async credential=>{
   try{const data=await api('/api/login',{credential});service.account=data.account;updateAccount();$('#connection-dialog').close();notify('已登入 Google。儲存至 Drive 時會再請求檔案授權。');}catch(err){$('#google-login-error').textContent=err.message;}
  });}catch(err){$('#google-login-error').textContent=err.message;}
 }
}
$('#connections').onclick=openConnections;$('#close-connections').onclick=()=>$('#connection-dialog').close();
$('#connection-content').addEventListener('click',async e=>{if(e.target.id==='logout-google'){try{await api('/api/logout',{});disconnectDrive();service.account=null;updateAccount();$('#connection-dialog').close();notify('已登出。');}catch(err){notify(err.message);}}});
function notify(msg){$('#toast').textContent=msg;$('#toast').classList.add('visible');clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3000);}
function chooseTemplate(key){flow=createWorkflow(key);clearOutput();inputValue='';attachment=null;tab='app';updateTabs();save();render();focusNode(flow.nodes[0].id);$('#template-dialog').close();notify('已載入範本，點擊節點就能開始編輯。');}
function updateTabs(){document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));}
function openEditor(id){selected=flow.nodes.find(n=>n.id===id);$('#node-title').value=selected.title;$('#node-content').value=selected.content;$('#editor-type').textContent=icons[selected.type]+' '+({input:'使用者輸入',generate:'AI 生成',output:'呈現結果'}[selected.type]);$('#delete-node').hidden=selected.type!=='generate';$('#mode-label').hidden=selected.type!=='generate';$('#node-mode').value=selected.mode||'text';$('.reorder-actions').hidden=selected.type!=='generate';const pos=flow.nodes.indexOf(selected);$('#move-up').disabled=pos<=1;$('#move-down').disabled=pos>=flow.nodes.length-2;$('#editor').showModal();}
$('#nodes').addEventListener('pointerdown',e=>{
 const node=e.target.closest('.node');if(!node||e.button!==0)return;
 const n=flow.nodes.find(n=>n.id===node.dataset.id),start={x:e.clientX,y:e.clientY,nx:n.x,ny:n.y};let moved=false;
 node.setPointerCapture(e.pointerId);
 const move=ev=>{let dx=(ev.clientX-start.x)/zoom,dy=(ev.clientY-start.y)/zoom;if(Math.abs(dx)+Math.abs(dy)>5)moved=true;if(!moved)return;n.x=Math.max(10,Math.min(1400,start.nx+dx));n.y=Math.max(55,Math.min(900,start.ny+dy));node.style.left=n.x+'px';node.style.top=n.y+'px';node.classList.add('dragging');drawEdges();};
 const end=()=>{node.removeEventListener('pointermove',move);node.removeEventListener('pointerup',end);node.removeEventListener('pointercancel',cancel);node.classList.remove('dragging');if(moved)save();else openEditor(n.id);};
 const cancel=()=>{node.removeEventListener('pointermove',move);node.removeEventListener('pointerup',end);node.removeEventListener('pointercancel',cancel);node.classList.remove('dragging');save();};
 node.addEventListener('pointermove',move);node.addEventListener('pointerup',end);node.addEventListener('pointercancel',cancel);
});
$('#nodes').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.closest('.node')){e.preventDefault();openEditor(e.target.closest('.node').dataset.id);}});
$('#editor form').addEventListener('submit',e=>{if(e.submitter?.id!=='save-node')return;e.preventDefault();if(!$('#node-title').value.trim()||!$('#node-content').value.trim()){notify('請填寫步驟名稱與內容。');return;}selected.title=$('#node-title').value.trim();selected.content=$('#node-content').value.trim();if(selected.type==='generate')selected.mode=$('#node-mode').value;clearOutput();save();render();$('#editor').close();focusNode(selected.id);});
$('#delete-node').onclick=()=>{const index=flow.nodes.indexOf(selected);flow.nodes=flow.nodes.filter(n=>n.id!==selected.id);clearOutput();save();render();$('#editor').close();focusNode(flow.nodes[Math.max(0,index-1)].id);};
$('#add-node').onclick=()=>{if(flow.nodes.length>=12)return notify('每個流程最多 12 個步驟。');const n={id:crypto.randomUUID(),type:'generate',title:'新的生成步驟',content:'根據上一個步驟的結果，整理並改善內容。',mode:'text',x:420,y:410};flow.nodes.splice(-1,0,n);clearOutput();save();render();openEditor(n.id);};
function rename(){const value=prompt('為這個工作流程取個名字',flow.name);if(value?.trim()){flow.name=value.trim().slice(0,100);save();render();}}
$('.edit-name').onclick=rename;$('#flow-title').onclick=rename;$('#flow-title').onkeydown=e=>{if(e.key==='Enter')rename();};
function focusNode(id){const node=flow.nodes.find(n=>n.id===id);if(!node)return;const viewport=$('.canvas-viewport');viewport.scrollTo({left:Math.max(0,node.x*zoom-(viewport.clientWidth-266*zoom)/2),top:Math.max(0,node.y*zoom-60)});}
function setZoom(delta){zoom=Math.max(.5,Math.min(1.5,Math.round((zoom+delta)*10)/10));$('#canvas-stage').style.transform=`scale(${zoom})`;$('#zoom-value').textContent=Math.round(zoom*100)+'%';}
$('#zoom-in').onclick=()=>setZoom(.1);$('#zoom-out').onclick=()=>setZoom(-.1);$('#reset-view').onclick=()=>{zoom=1;setZoom(0);focusNode(flow.nodes[0].id);};
for(const id of ['templates-nav','tip-explore'])$('#'+id).onclick=()=>$('#template-dialog').showModal();$('#close-templates').onclick=()=>$('#template-dialog').close();$('#workspace-nav').onclick=()=>$('.builder').scrollIntoView({behavior:'smooth'});$('.project-item').onclick=()=>$('.builder').scrollIntoView({behavior:'smooth'});$('.brand').onclick=e=>{e.preventDefault();window.scrollTo({top:0,behavior:'smooth'});};
$('.new-project').onclick=()=>{if(confirm('建立新流程會取代目前內容。需要保留時請先匯出。')){chooseTemplate('content');flow.name='未命名的靈感';save();render();}};
$('#build-idea').onclick=async()=>{
 const idea=$('#idea').value.trim();if(!idea)return notify('先寫下一個你想做的工具。');
 if(!service.gemini){chooseTemplate(/圖片|配圖|海報|插畫|image|poster/i.test(idea)?'visual':/旅行|旅遊|行程|travel/i.test(idea)?'travel':/學習|讀書|課程|learn/i.test(idea)?'learning':'content');notify('尚未連線 Gemini，已依主題套用範本。');return;}
 setBusy(true);$('#build-idea').textContent='正在設計流程⋯';
 try{const {plan}=await api('/api/plan',{idea});flow=workflowFromPlan(plan);clearOutput();save();render();notify('已由 Gemini 建立流程，請檢視並調整每步指令。');}catch(err){notify(err.message);}finally{setBusy(false);renderPreview();$('#build-idea').textContent='建立流程 ↗';}
};
for(const [id,delta] of [['move-up',-1],['move-down',1]])$('#'+id).onclick=()=>{const index=flow.nodes.indexOf(selected);const target=index+delta;if(target<1||target>=flow.nodes.length-1)return;[flow.nodes[index],flow.nodes[target]]=[flow.nodes[target],flow.nodes[index]];clearOutput();save();render();openEditorOrder();};
function openEditorOrder(){const pos=flow.nodes.indexOf(selected);$('#move-up').disabled=pos<=1;$('#move-down').disabled=pos>=flow.nodes.length-2;}
document.addEventListener('click',e=>{const t=e.target.closest('[data-template]');if(t)chooseTemplate(t.dataset.template);const b=e.target.closest('[data-tab]');if(b){tab=b.dataset.tab;updateTabs();renderPreview();}});
$('#preview').addEventListener('input',e=>{if(e.target.id==='run-input')inputValue=e.target.value;if(e.target.id==='result-text'){result=e.target.value;googleFile=null;$('#google-file').textContent='';}});
$('#preview').addEventListener('change',async e=>{
 if(e.target.id==='engine'){engine=e.target.value;renderPreview();}
 if(e.target.id==='reference-image'&&e.target.files[0]){try{attachment=await readImage(e.target.files[0]);renderPreview();}catch(err){showError(err.message);}}
});
$('#preview').addEventListener('click',async e=>{
 const button=e.target.closest('button');if(!button||outputBusy)return;
 if(button.id==='remove-attachment'){attachment=null;renderPreview();return;}
 if(button.id==='setup-ai'){await openConnections();return;}
 if(['run','run-demo'].includes(button.id)){
  engine=button.id==='run-demo'?'demo':'gemini';
  if(running)return;if(!inputValue.trim())return showError('先輸入一點靈感，再開始執行。');
  if(engine==='gemini'&&!service.gemini){showError('尚未連線 AI，請完成右側「設定 AI」。你的節點設定已保留。');await openConnections();return;}
  setBusy(true);clearOutput();runProgress={};renderPreview();
  try{
   if(engine==='gemini'){
    const data=await runWithProgress({flow,input:inputValue,image:attachment});result=data.text;images=data.images;steps=data.steps;resultSource='gemini';
   }else{result=demoResult(flow,inputValue);images=attachment?[attachment]:[];resultSource='demo';}
   tab='result';updateTabs();
  }catch(err){setBusy(false);renderPreview();showError(err.message);return;}
  finally{setBusy(false);}
  renderPreview();return;
 }
 const i=Number(button.dataset.imageCopy??button.dataset.imageDownload??button.dataset.imageDrive);
 let actionError='';
 try{
  if(button.id==='copy-result'){await copyText(result);notify('文案已複製，可以貼到文件或社群。');}
  if(button.id==='download-text')downloadBlob(new Blob([result],{type:'text/plain;charset=utf-8'}),'bloom-content.txt');
  if(button.id==='download-html')downloadBlob(new Blob([documentHtml(flow.name,result)],{type:'text/html;charset=utf-8'}),'bloom-document.html');
  if(button.dataset.imageCopy!==undefined){await copyImage(images[i]);notify('圖片已複製，可以直接貼上。');}
  if(button.dataset.imageDownload!==undefined)downloadBlob(imageBlob(images[i]),`bloom-image-${i+1}.${images[i].mimeType==='image/png'?'png':images[i].mimeType==='image/jpeg'?'jpg':'webp'}`);
  if(button.id==='make-card'){
   outputBusy=true;lockControls(true);button.disabled=true;const card=await textCard(flow.name,result);images.push(card);notify('文字圖卡已製作完成，可複製或下載。');
  }
  if(['save-doc','save-drive'].includes(button.id)||button.dataset.imageDrive!==undefined){
   if(!service.account){notify('請先登入 Google，再儲存結果。');await openConnections();return;}
   outputBusy=true;lockControls(true);googleFile=null;
   const pending=saveToDrive({title:button.dataset.imageDrive!==undefined?`${flow.name} - 圖片 ${i+1}`:flow.name,text:result,image:button.dataset.imageDrive!==undefined?images[i]:null,asDocument:button.id==='save-doc'});
   $('#preview').querySelectorAll('button').forEach(b=>b.disabled=true);
   googleFile=await pending;notify('已儲存至 Google Drive。');
  }
 }catch(err){actionError=err.message;showError(err.message);}
 finally{if(outputBusy){outputBusy=false;lockControls(false);renderPreview();if(actionError)showError(actionError);}}
});
$('#export-btn').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(flow,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='bloom-workflow.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('工作流程已匯出。');};
$('#import-btn').onclick=()=>$('#import-file').click();$('#import-file').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>100000)throw new Error('檔案過大，請選擇小於 100 KB 的流程檔案。');const imported=validateWorkflow(JSON.parse(await f.text()));if(!confirm('匯入會取代目前流程，是否繼續？'))return;flow=imported;inputValue='';attachment=null;clearOutput();tab='app';updateTabs();save();render();focusNode(flow.nodes[0].id);notify('工作流程已匯入。');}catch(err){notify(err instanceof SyntaxError?'無法讀取 JSON 檔案。':err.message);}finally{e.target.value='';}};
render();
refreshService();
