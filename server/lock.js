import fs from 'node:fs/promises';
import path from 'node:path';
export async function acquireLock(root,{reuseProcess=false}={}){
  await fs.mkdir(root,{recursive:true});const file=path.join(root,'server.lock');
  for(let attempt=0;attempt<2;attempt++){
    try{const handle=await fs.open(file,'wx');await handle.writeFile(String(process.pid));await handle.close();return async()=>{try{if(await fs.readFile(file,'utf8')===String(process.pid))await fs.unlink(file);}catch{}};}
    catch(e){if(e.code!=='EEXIST')throw e;let pid;try{pid=Number(await fs.readFile(file,'utf8'));}catch{throw Error('Cannot inspect data directory lock');}if(!Number.isInteger(pid)||pid<=0)throw Error('Invalid server.lock; inspect before removing');
      if(reuseProcess&&pid===process.pid)return async()=>{};
      try{process.kill(pid,0);}catch(err){if(err.code==='ESRCH'){await fs.unlink(file);continue;}throw Error('Cannot verify existing local server');}
      throw Error(`Data directory already served by PID ${pid}. Stop that server before starting another.`);
    }
  }throw Error('Cannot lock data directory');
}
