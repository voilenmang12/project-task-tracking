import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createLocalService} from './local-api.js';
import {acquireLock} from './lock.js';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.resolve(process.env.NHANH_DATA_DIR||path.join(repo,'.local'));
const port=Number(process.env.PORT||5173);
const release=await acquireLock(root);
const service=createLocalService({root});
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
const server=http.createServer((req,res)=>service.middleware(req,res,async()=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);return res.end();}
    const dist=path.join(repo,'dist'),file=path.resolve(dist,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(dist+path.sep)||pathname.split('/').some(p=>p.startsWith('.'))){res.writeHead(403);return res.end();}
    const content=await fs.readFile(file);res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.setHeader('X-Content-Type-Options','nosniff');res.end(req.method==='HEAD'?undefined:content);
  }catch{res.writeHead(404);res.end('API is running. Build UI with npm run build.');}
}));
server.on('error',async e=>{await release();console.error(e.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log(`Nhánh local API + UI: http://127.0.0.1:${port}`));
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{service.close();server.close(async()=>{await release();process.exit(0);});});
