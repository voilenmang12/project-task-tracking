import {uid,children} from './model.js';
import {availableTags} from './tags.js';

export function defaultDocument(project){return `# ${project.title}\n\n## Tầm nhìn\n${project.description||''}\n\n## Người dùng / người chơi mục tiêu\n\n## Vấn đề & giá trị cốt lõi\n\n## Phạm vi MVP\n\n## Ngoài phạm vi\n\n## Trải nghiệm & luồng chính\n\n## Hệ thống & ràng buộc kỹ thuật\n\n## Tiêu chí thành công\n\n## Các phase dự kiến\n\n## Câu hỏi chưa chốt\n`;}
export function validateProposal(value){
  if(!value||typeof value.summary!=='string'||!Array.isArray(value.phases)||!Array.isArray(value.tagAssignments))throw Error('Agent chưa trả về đúng định dạng roadmap.');
  let count=0;
  const text=(v,max)=>typeof v==='string'&&v.length<=max;
  function node(n,depth){if(++count>500||depth>12||!n||!text(n.title,300)||!n.title.trim()||!text(n.notes,20000)||!Array.isArray(n.tags)||n.tags.length>20||n.tags.some(t=>!text(t,60)||!t.trim())||!Array.isArray(n.tasks))throw Error('Đề xuất task không hợp lệ (tối đa 500 task, 12 cấp).');n.tasks.forEach(c=>node(c,depth+1));}
  value.phases.forEach(p=>node(p,0));
  if(value.summary.length>30000||value.tagAssignments.length>500)throw Error('Đề xuất quá dài.');
  for(const a of value.tagAssignments)if(!a||!text(a.taskId,200)||!Array.isArray(a.tags)||a.tags.length>20||a.tags.some(t=>!text(t,60)||!t.trim()))throw Error('Đề xuất tag không hợp lệ.');
  return value;
}
export function parseProposal(output){
  let text=output.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');
  try{return validateProposal(JSON.parse(text));}catch{}
  const begin=text.indexOf('{'),end=text.lastIndexOf('}');
  if(begin>=0&&end>begin)return validateProposal(JSON.parse(text.slice(begin,end+1)));
  throw Error('Không đọc được JSON từ agent. Xem kết quả để chạy lại với yêu cầu rõ hơn.');
}
export function applyProposal(data,projectId,run){
  const project=data.projects.find(p=>p.id===projectId);
  if(!project||run.projectId!==projectId)throw Error('Không tìm thấy dự án của đề xuất.');
  if((project.appliedRunIds||[]).includes(run.id))throw Error('Đề xuất này đã được áp dụng.');
  if((project.designDocument||'')!==run.document)throw Error('Design document đã thay đổi. Hãy chạy lại agent với bản mới.');
  const plan=validateProposal(run.proposal);const tags=[...availableTags(data)];
  function tagIds(names){return [...new Set(names.map(name=>{name=name.trim();let tag=tags.find(t=>t.name.toLowerCase()===name.toLowerCase());if(!tag){tag={id:uid(),name,color:'#786d85'};tags.push(tag);}return tag.id;}))];}
  const tasks=data.tasks.map(t=>{const changes=plan.tagAssignments.filter(a=>a.taskId===t.id&&t.projectId===projectId);return changes.length?{...t,tagIds:[...new Set([...(t.tagIds||[]),...tagIds(changes.flatMap(a=>a.tags))])]}:t;});
  function append(nodes,parentId,offset=0){nodes.forEach((n,i)=>{const id=uid();tasks.push({id,title:n.title.trim(),notes:n.notes,projectId,parentId,order:offset+i,done:false,attachments:[],tagIds:tagIds(n.tags),createdAt:new Date().toISOString()});append(n.tasks,id);});}
  append(plan.phases,null,children(tasks,null).filter(t=>t.projectId===projectId).reduce((max,t)=>Math.max(max,t.order+1),0));
  return {...data,tagCatalog:tags,tasks,projects:data.projects.map(p=>p.id===projectId?{...p,appliedRunIds:[...(p.appliedRunIds||[]),run.id]}:p)};
}
