const name='bloom_ai';
const encode=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const decode=text=>Uint8Array.from(atob(text.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
async function cipher(secret){return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret)),{name:'AES-GCM'},false,['encrypt','decrypt']);}
export async function sessionCookie(settings,secret){
 const iv=crypto.getRandomValues(new Uint8Array(12));const payload=new TextEncoder().encode(JSON.stringify({...settings,expires:Date.now()+8*3600*1000}));
 const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},await cipher(secret),payload);
 return `${name}=${encode(iv)}.${encode(encrypted)}; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=28800`;
}
export const clearSessionCookie=()=>`${name}=; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=0`;
export async function readAiSession(request,secret){
 if(!secret)return null;
 try{const token=(request.headers.get('Cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1);if(!token)return null;const [iv,data]=token.split('.');const payload=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(iv)},await cipher(secret),decode(data));const settings=JSON.parse(new TextDecoder().decode(payload));return settings.expires>Date.now()?settings:null;}catch{return null;}
}
