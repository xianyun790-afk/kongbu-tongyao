import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath,URL} from 'node:url';
export default defineConfig({base:'/kongbu-tongyao/',plugins:[react()],resolve:{alias:{'@':fileURLToPath(new URL('./src',import.meta.url))}},server:{host:'127.0.0.1',port:4184,strictPort:true},build:{rollupOptions:{input:{game:fileURLToPath(new URL('./index.html',import.meta.url)),script:fileURLToPath(new URL('./script/index.html',import.meta.url))}}}});
