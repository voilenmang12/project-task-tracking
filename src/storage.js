let token,revision=0,baseline;
export async function api(route,options={}){
  if(!token){const response=await fetch('/api/session');if(!response.ok)throw Error('Không kết nối được server local. Hãy chạy npm run dev.');token=(await response.json()).token;}
  const response=await fetch(route,{...options,headers:{'Content-Type':'application/json','X-Nhanh-Token':token,...options.headers}});
  const result=await response.json();if(!response.ok)throw Error(result.error||'Lỗi server local.');return result;
}
function legacyData(){return new Promise((resolve,reject)=>{const request=indexedDB.open('nhanh-workspace',1);request.onupgradeneeded=()=>request.result.createObjectStore('workspace');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,read=db.transaction('workspace').objectStore('workspace').get('data');read.onsuccess=()=>{resolve(read.result);db.close();};read.onerror=()=>{reject(read.error);db.close();};};});}
export async function readData(){const result=await api('/api/workspace');revision=result.revision;baseline=result.data;if(result.data)return result.data;return legacyData();}
export async function writeData(data){const result=await api('/api/workspace',{method:'PUT',body:JSON.stringify({data,revision,base:baseline})});revision=result.revision;baseline=data;}

export async function pollData(){const result=await api('/api/workspace');return result;}
export function acceptRemote(record){revision=record.revision;baseline=record.data;}
