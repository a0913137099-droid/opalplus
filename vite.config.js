import {defineConfig,loadEnv} from 'vite';
import {createApi} from './server/api.js';
export default defineConfig(({mode})=>{
 const config={...loadEnv(mode,process.cwd(),''),...process.env};

 return {server:{host:'0.0.0.0',strictPort:true},plugins:[{name:'bloom-api',configureServer(server){server.middlewares.use(createApi({...config,PORT:String(server.config.server.port)}));},configurePreviewServer(server){server.middlewares.use(createApi({...config,PORT:String(server.config.preview.port)}));}}]};
});
