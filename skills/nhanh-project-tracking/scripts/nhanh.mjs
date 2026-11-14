#!/usr/bin/env node
import fs from 'node:fs/promises';
const base=(process.env.NHANH_URL||'http://127.0.0.1:5173').replace(/\/$/,'');
const request=(url,options={})=>fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(15000)});
const [command='help',...rest]=process.argv.slice(2);
if(command==='help'){
  console.log(`nhanh local workflow CLI
  node scripts/nhanh.mjs tools
  node scripts/nhanh.mjs projects.list
  node scripts/nhanh.mjs tasks.create --file request.json
  node scripts/nhanh.mjs tasks.update --stdin

JSON input: {"arguments":{...},"options":{"actor":"codex","expectedRevision":12,"requestId":"unique-operation-id"}}
Use tools to discover names and JSON schemas. Reads return {revision,result}; send that revision for guarded writes.
NHANH_URL defaults to http://127.0.0.1:5173. Errors are JSON on stderr and exit code 1.`);
}else try{
  const url=new URL(base);
  if(!['127.0.0.1','localhost'].includes(url.hostname)||url.protocol!=='http:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('NHANH_URL must be an HTTP localhost origin');
  const health=await request(base+'/api/health');if(!health.ok||(await health.json()).service!=='nhanh-local')throw Error('Endpoint is not a Nhanh local service');
  const session=await request(base+'/api/session');if(!session.ok)throw Error('Local server unavailable');const {token}=await session.json();
  let payload={};if(rest[0]==='--file')payload=JSON.parse(await fs.readFile(rest[1],'utf8'));else if(rest[0]==='--stdin'){let text='';for await(const chunk of process.stdin)text+=chunk;payload=JSON.parse(text);}else if(rest.length)throw Error('Use --file or --stdin for JSON (no shell interpolation)');
  const response=await request(base+(command==='tools'?'/api/tools':'/api/tools/call'),{method:command==='tools'?'GET':'POST',headers:{'Content-Type':'application/json','X-Nhanh-Token':token},...(command==='tools'?{}:{body:JSON.stringify({name:command,arguments:payload.arguments||{},options:payload.options||{}})})});
  const result=await response.json();if(!response.ok)throw Error(`${response.status}: ${result.error}`);console.log(JSON.stringify(result,null,2));
}catch(e){console.error(JSON.stringify({error:e.message}));process.exitCode=1;}
