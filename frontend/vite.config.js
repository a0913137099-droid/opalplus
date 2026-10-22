import {defineConfig} from 'vite';
export default defineConfig({root:new URL('.',import.meta.url).pathname,base:'/editor/',build:{outDir:'../public/editor',emptyOutDir:true}});
