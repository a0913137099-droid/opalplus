import {documentHtml,imageBlob} from './assets.js';
let clientId='', accessToken=null, expiresAt=0, loading;
export function loadGoogle() {
 if(window.google?.accounts)return Promise.resolve();
 if(loading)return loading;
 loading=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;
  const timer=setTimeout(()=>{loading=null;script.remove();reject(new Error('Google 登入載入逾時，請檢查網路後重試。'));},15000);
  script.onload=()=>{clearTimeout(timer);resolve();};script.onerror=()=>{clearTimeout(timer);loading=null;script.remove();reject(new Error('無法載入 Google 登入，請檢查網路或瀏覽器阻擋設定。'));};document.head.append(script);
 });return loading;
}
export async function prepareGoogle(id) {clientId=id;await loadGoogle();}
export async function mountGoogleLogin(id, element, onCredential) {
 clientId=id;await loadGoogle();
 window.google.accounts.id.initialize({client_id:id,callback:response=>onCredential(response.credential),auto_select:false});
 window.google.accounts.id.renderButton(element,{theme:'outline',size:'large',text:'signin_with',locale:'zh_TW'});
}
export function disconnectDrive() {
 if(accessToken&&window.google?.accounts)window.google.accounts.oauth2.revoke(accessToken,()=>{});
 accessToken=null;expiresAt=0;
}
function token() {
 if(accessToken&&Date.now()<expiresAt)return Promise.resolve(accessToken);
 if(!clientId || !window.google?.accounts) return Promise.reject(new Error('請先在連線設定登入 Google。'));
 return new Promise((resolve,reject)=>{
  const auth=window.google.accounts.oauth2.initTokenClient({client_id:clientId,scope:'https://www.googleapis.com/auth/drive.file',callback:response=>{
   if(response.error || !response.access_token)return reject(new Error('Google Drive 授權未完成，請重試。'));
   if(!window.google.accounts.oauth2.hasGrantedAllScopes(response,'https://www.googleapis.com/auth/drive.file'))return reject(new Error('請允許儲存檔案至 Google Drive。'));
   accessToken=response.access_token;expiresAt=Date.now()+(Number(response.expires_in)-60)*1000;resolve(accessToken);
  },error_callback:()=>reject(new Error('Google 授權視窗已關閉或被阻擋，請允許彈出視窗後重試。'))});auth.requestAccessToken();
 });
}
export async function saveToDrive({title,text,image,asDocument=false}) {
 // Request authorization directly in the button event, before any file work.
 const authorization=await token();
 const body=new FormData();
 body.append('metadata',new Blob([JSON.stringify({name:title,mimeType:asDocument?'application/vnd.google-apps.document':image?image.mimeType:'text/plain'})],{type:'application/json'}));
 body.append('file',image?imageBlob(image):new Blob([asDocument?documentHtml(title,text):text],{type:asDocument?'text/html':'text/plain'}));
 let response;
 try{response=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,name',{method:'POST',headers:{Authorization:`Bearer ${authorization}`},body,signal:AbortSignal.timeout(60000)});}catch{throw new Error('無法連線 Google Drive，請檢查網路。');}
 if(!response.ok){if(response.status===401){accessToken=null;expiresAt=0;throw new Error('Google 授權已過期，請再按一次儲存重新授權。');}throw new Error(response.status===403?'無法寫入 Google Drive，請確認已啟用 Drive API 並授予權限。':'Google Drive 儲存失敗，請稍後再試。');}
 const file=await response.json();if(!file.id)throw new Error('Google 未回傳檔案資訊，請到 Drive 確認後再重試。');return file;
}
