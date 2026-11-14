import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {validateData} from '../src/model.js';
export const folderId=id=>createHash('sha256').update(id).digest('hex').slice(0,24);
export async function atomicWrite(file,text){await fs.mkdir(path.dirname(file),{recursive:true});const temp=file+'.'+randomUUID()+'.tmp';await fs.writeFile(temp,text,'utf8');await fs.rename(temp,file);}
export function createStore(root){
  const file=path.join(root,'workspace.json');let queue=Promise.resolve();
  async function read(){try{const record=JSON.parse(await fs.readFile(file,'utf8'));validateData(record.data);return record;}catch(e){if(e.code==='ENOENT')return {revision:0,data:null};throw Error('Không đọc được workspace.json. Dữ liệu không bị ghi đè; kiểm tra backup.');}}
  async function transact(change,revision){const operation=queue.catch(()=>{}).then(async()=>{const previous=await read();if(revision!==undefined&&previous.revision!==revision){const error=Error('Dữ liệu đã đổi. Đọc lại trước khi thử lại.');error.status=409;throw error;}const data=await change(previous.data,previous);validateData(data);
    if(previous.data)await atomicWrite(path.join(root,'workspace.backup.json'),JSON.stringify(previous,null,2));
    const record={revision:previous.revision+1,data};
    // Project exports are reproducible from workspace.json; keep deleted project folders for recovery.
    for(const project of data.projects){const dir=path.join(root,'projects',folderId(project.id));await atomicWrite(path.join(dir,'design.md'),project.designDocument||'');await atomicWrite(path.join(dir,'project.json'),JSON.stringify(project,null,2));await atomicWrite(path.join(dir,'tasks.json'),JSON.stringify(data.tasks.filter(t=>t.projectId===project.id),null,2));}
    await atomicWrite(file,JSON.stringify(record,null,2));return record;
  });queue=operation;return operation;}
  const write=(data,revision)=>transact(()=>data,revision);
  return {root,read,write,transact};
}
