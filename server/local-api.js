import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {createStore,folderId} from './store.js';
import {createAgents} from './agents.js';
import {createTools} from './tools.js';
import {mergeWorkspace} from './merge.js';
import {acquireLock} from './lock.js';

export function createLocalService({root=path.resolve('.local')}={}){
  const store=createStore(root),agents=createAgents(store),token=randomUUID();
  // The audit adapter is shared with the web UI and external tools.
  const workflow=createTools(store,agents);
  async function middleware(req,res,next=()=>{res.statusCode=404;res.end('Not found');}){
    if(!req.url?.startsWith('/api/'))return next();
    const send=(status,value)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(value));};
    try{
      const host=req.headers.host||'';
      if(!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host))return send(403,{error:'Chỉ phục vụ localhost.'});
      if(req.headers.origin&&req.headers.origin!==`http://${host}`)return send(403,{error:'Origin không được phép.'});
      if(req.headers['sec-fetch-site']==='cross-site')return send(403,{error:'Cross-site request denied.'});
      const url=new URL(req.url,`http://${host}`);
      if(req.method==='GET'&&url.pathname==='/api/health')return send(200,{ok:true,service:'nhanh-local',apiVersion:1});
      if(req.method==='GET'&&url.pathname==='/api/session')return send(200,{token,storage:root});
      if(req.headers['x-nhanh-token']!==token)return send(403,{error:'Phiên local hết hạn. Tải lại trang.'});
      let body={};if(['POST','PUT'].includes(req.method)){
        if(!req.headers['content-type']?.startsWith('application/json'))return send(415,{error:'Cần JSON.'});
        let chunks=[],size=0;for await(const chunk of req){size+=chunk.length;if(size>150*1024*1024)throw Error('Dữ liệu vượt 150 MB.');chunks.push(chunk);}body=JSON.parse(Buffer.concat(chunks).toString()||'{}');
      }
      if(url.pathname==='/api/tools'&&req.method==='GET')return send(200,{tools:workflow.definitions,callEndpoint:'/api/tools/call',options:{actor:'string',expectedRevision:'integer',requestId:'string'}});
      if(url.pathname==='/api/tools/call'&&req.method==='POST')return send(200,await workflow.call(body.name,body.arguments,body.options));
      if(url.pathname==='/api/workspace'){
        if(req.method==='GET')return send(200,await store.read());
        if(req.method==='PUT'){
          const record=await store.transact((current)=>{
            const merged=body.base&&current?mergeWorkspace(body.base,body.data,current):body.data;
            return {...merged,activity:[...(current?.activity||[]),{id:randomUUID(),actor:'human',action:'workspace.save',createdAt:new Date().toISOString()}].slice(-2000),receipts:current?.receipts||[]};
          },body.base?undefined:body.revision);
          return send(200,{revision:record.revision});
        }
      }
      if(req.method==='GET'&&url.pathname==='/api/agents')return send(200,await agents.status());
      if(req.method==='GET'&&url.pathname==='/api/project-folder')return send(200,{path:path.join(root,'projects',folderId(url.searchParams.get('id')||''))});
      if(url.pathname==='/api/runs'){
        if(req.method==='GET')return send(200,await agents.list(url.searchParams.get('projectId')));
        if(req.method==='POST')return send(202,await agents.start(body.projectId,body.mode,body.instruction));
      }
      if(req.method==='POST'&&url.pathname==='/api/runs/cancel'){await agents.cancel(body.id);return send(200,{ok:true});}
      return send(404,{error:'Không tìm thấy API.'});
    }catch(e){return send(e.status||400,{error:e.message});}
  }
  return {middleware,close:()=>agents.close(),store};
}
export function localApi(options){
  const service=createLocalService(options);
  return {name:'nhanh-local-api',async configureServer(server){await acquireLock(service.store.root,{reuseProcess:true});server.httpServer?.on('close',service.close);server.middlewares.use(service.middleware);}};
}

