export const uid = () => crypto.randomUUID();
export function children(tasks, parentId) { return tasks.filter(t => t.parentId === parentId).sort((a,b) => a.order-b.order); }
export function descendants(tasks, id) {
  const result = new Set(); const stack = [id];
  while (stack.length) { const current=stack.pop(); for(const t of tasks) if(t.parentId===current && !result.has(t.id)){result.add(t.id);stack.push(t.id);} }
  return result;
}
export function progressMap(tasks) {
  const result = {}; const groups = new Map();
  for(const t of tasks) { if(!groups.has(t.parentId)) groups.set(t.parentId,[]); groups.get(t.parentId).push(t); }
  const stack = tasks.filter(t=>t.parentId===null).map(t=>[t,false]);
  while(stack.length){ const [t,visited]=stack.pop(); const sub=groups.get(t.id)||[]; if(!visited && sub.length){stack.push([t,true]); for(const child of sub) stack.push([child,false]);}else result[t.id]=sub.length?sub.reduce((sum,c)=>sum+result[c.id],0)/sub.length:(t.done?100:0); }
  return result;
}
export function projectProgress(tasks, projectId) { const roots=tasks.filter(t=>t.projectId===projectId && t.parentId===null); const map=progressMap(tasks); return roots.length?roots.reduce((s,t)=>s+map[t.id],0)/roots.length:0; }
export function moveTask(tasks,id,parentId,index=Infinity) {
  const task=tasks.find(t=>t.id===id);
  if(!task || id===parentId || descendants(tasks,id).has(parentId))return tasks;
  const parent=parentId===null?null:tasks.find(t=>t.id===parentId);
  if(parentId!==null && (!parent || parent.projectId!==task.projectId))return tasks;
  const siblings=children(tasks,parentId).filter(t=>t.id!==id && t.projectId===task.projectId);
  siblings.splice(Math.min(Math.max(0,index),siblings.length),0,{...task,parentId});
  const orders=new Map(siblings.map((t,i)=>[t.id,i]));
  return tasks.map(t=>t.id===id?{...t,parentId,order:orders.get(id)}:orders.has(t.id)?{...t,order:orders.get(t.id)}:t);
}
export function toggleBranch(tasks,id,done) {const ids=descendants(tasks,id);ids.add(id);return tasks.map(t=>ids.has(t.id)?{...t,done}:t);}
export function validateData(data) {
  if(!data || data.version!==1 || !Array.isArray(data.projects) || !Array.isArray(data.tasks) || !Array.isArray(data.ideas))throw Error('Tệp sao lưu không đúng định dạng Nhánh.');
  const ids=new Set(); for(const item of [...data.projects,...data.tasks,...data.ideas]){if(typeof item.id!=='string'||ids.has(item.id)||typeof item.title!=='string')throw Error('Dữ liệu có ID hoặc tiêu đề không hợp lệ.');ids.add(item.id);}
  for(const p of data.projects){if(typeof p.description!=='string'||typeof p.color!=='string'||!/^#[0-9a-f]{6}$/i.test(p.color))throw Error('Thông tin dự án không hợp lệ.');}
  for(const i of data.ideas){if(typeof i.notes!=='string'||typeof i.createdAt!=='string'||Number.isNaN(Date.parse(i.createdAt)))throw Error('Ý tưởng không hợp lệ.');}
  const projects=new Set(data.projects.map(p=>p.id)), taskMap=new Map(data.tasks.map(t=>[t.id,t]));
  for(const item of [...data.tasks,...data.ideas]){if(!Array.isArray(item.attachments)||item.attachments.some(a=>!a||typeof a.id!=='string'||typeof a.url!=='string'||!/^data:(image\/(png|jpeg|gif|webp)|audio\/[\w.+-]+)(;[^,]*)?,/i.test(a.url)))throw Error('Tệp đính kèm không hợp lệ.');}
  for(const t of data.tasks){if(!projects.has(t.projectId)||typeof t.done!=='boolean'||!Number.isFinite(t.order)||typeof t.notes!=='string')throw Error('Task không hợp lệ.');let p=t;const seen=new Set([t.id]);while(p.parentId!==null){const parent=taskMap.get(p.parentId);if(!parent||parent.projectId!==t.projectId||seen.has(parent.id))throw Error('Cây task không hợp lệ.');seen.add(parent.id);p=parent;}}
  return data;
}
export function seedData(){
  const p='welcome';const now=new Date().toISOString();
  const task=(id,title,parentId,order,done=false)=>({id,title,parentId,projectId:p,order,done,notes:'',attachments:[],createdAt:now});
  return {version:1,projects:[{id:p,title:'Không gian của tôi',description:'Bắt đầu từ một ý tưởng nhỏ, tiến lên mỗi ngày.',color:'#dd784b',createdAt:now}],tasks:[task('plan','Phác thảo điều bạn muốn làm',null,0),task('goal','Xác định mục tiêu đầu tiên','plan',0,true),task('steps','Chia nhỏ thành từng bước','plan',1),task('inspiration','Gom những nguồn cảm hứng',null,1),task('start','Bắt tay vào việc thôi!',null,2)],ideas:[{id:'first-idea',title:'Một nơi cho những ý tưởng bất chợt',notes:'Gõ vài dòng, dán một hình ảnh hoặc thu âm. Khi sẵn sàng, biến ý tưởng thành một task.',attachments:[],createdAt:now}]};
}
