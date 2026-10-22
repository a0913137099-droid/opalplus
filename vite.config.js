import {defineConfig,loadEnv} from 'vite';
import {createApi} from './server/api.js';
import {allowedPreviewHosts} from './server/hosts.js';
export default defineConfig(({mode})=>{
 const config={...loadEnv(mode,process.cwd(),''),...process.env};
 return {
  server:{host:'0.0.0.0',strictPort:true},
  plugins:[{
   name:'bloom-api',
   configResolved(resolved){
    for(const target of [resolved.server,resolved.preview]){
     if(Array.isArray(target.allowedHosts))target.allowedHosts.push(...allowedPreviewHosts(config,target.port));
    }
   },
   configureServer(server){server.middlewares.use(createApi({...config,PORT:String(server.config.server.port)}));},
   configurePreviewServer(server){server.middlewares.use(createApi({...config,PORT:String(server.config.preview.port)}));}
  }]
 };
});
