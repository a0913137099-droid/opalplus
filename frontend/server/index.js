import {createServer} from 'node:http';
import {existsSync, createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createApi} from './api.js';
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
for(const name of ['.env.local','.env'])if(existsSync(resolve(root,name)))process.loadEnvFile(resolve(root,name));
const dist=resolve(root,'dist');
if(!existsSync(resolve(dist,'index.html')))throw new Error('請先執行 npm run build。');
const api=createApi(process.env);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'};
const server=createServer((req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
 api(req,res,async()=>{
  try{
   if(!['GET','HEAD'].includes(req.method)){res.statusCode=405;return res.end();}
   const pathname=decodeURIComponent(new URL(req.url,'http://bloom.local').pathname);
   let file=resolve(dist,'.'+pathname);
   if(!file.startsWith(dist+sep)&&file!==dist){res.statusCode=403;return res.end();}
   let info;try{info=await stat(file);}catch{}
   if(!info?.isFile()){
    if(extname(pathname)){res.statusCode=404;return res.end('Not found');}
    file=resolve(dist,'index.html');info=await stat(file);
   }
   res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.setHeader('Content-Length',info.size);
   res.setHeader('Cache-Control',file.includes(`${sep}assets${sep}`)?'public,max-age=31536000,immutable':'no-cache');
   if(req.method==='HEAD')return res.end();const stream=createReadStream(file);stream.on('error',()=>res.destroy());stream.pipe(res);
  }catch{res.statusCode=400;res.end('Bad request');}
 });
});
server.listen(Number(process.env.PORT||5173),'0.0.0.0',()=>console.log(`Bloom server listening on port ${process.env.PORT||5173}`));
