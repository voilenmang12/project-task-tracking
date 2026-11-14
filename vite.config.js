import {defineConfig} from 'vite';
import {localApi} from './server/local-api.js';
export default defineConfig({plugins:[localApi()],server:{host:'127.0.0.1',port:5173,strictPort:true,watch:{ignored:['**/.local/**']},fs:{deny:['**/.local/**','**/.env*','**/.git/**']}}});
