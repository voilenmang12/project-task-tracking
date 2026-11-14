import {parseDocumentSections,renderDocument} from '../src/document.js';
import {randomUUID} from 'node:crypto';
import {children,descendants,moveTask,toggleBranch,progressMap,projectProgress} from '../src/model.js';
import {availableTags,editTag,removeTag} from '../src/tags.js';
import {defaultDocument,applyProposal} from '../src/planning.js';

const str={type:'string'},num={type:'number'},bool={type:'boolean'},strings={type:'array',items:str};
const spec=(name,description,properties={},required=[],readOnly=false)=>({name,description,inputSchema:{type:'object',properties,required,additionalProperties:false},readOnly});
export const TOOL_DEFINITIONS=[
  spec('projects.list','List local projects and progress',{},[],true),
  spec('projects.get','Read project, design document, tasks and progress',{projectId:str},['projectId'],true),
  spec('projects.create','Create project; optional client ID makes retries deterministic',{title:str,description:str,id:str,color:str},['title']),
  spec('projects.update','Update project metadata',{projectId:str,title:str,description:str,color:str},['projectId']),
  spec('documents.get','Read design document',{projectId:str},['projectId'],true),
  spec('documents.set','Replace document; expectedRevision required to protect concurrent edits',{projectId:str,document:str},['projectId','document']),
  spec('documents.section.create','Create document section; parentId null creates a separate root Markdown file',{projectId:str,title:str,content:str,parentId:{type:['string','null']}},['projectId','title']),
  spec('documents.section.update','Edit section title/content; expectedRevision required',{projectId:str,sectionId:str,title:str,content:str},['projectId','sectionId']),
  spec('documents.section.move','Move section subtree; expectedRevision required',{projectId:str,sectionId:str,parentId:{type:['string','null']},index:num},['projectId','sectionId','parentId']),
  spec('documents.section.delete','Delete section subtree; expectedRevision required',{projectId:str,sectionId:str},['projectId','sectionId']),
  spec('tasks.list','List tasks; filter by project, parent, status or tag',{projectId:str,parentId:{type:['string','null']},status:str,tagId:str},['projectId'],true),
  spec('tasks.create','Create a task or child; optional client ID',{projectId:str,title:str,id:str,parentId:{type:['string','null']},notes:str,tagIds:strings},['projectId','title']),
  spec('tasks.update','Edit title, notes, tags, status (todo/in_progress/blocked/done), blockedReason; expectedRevision required',{taskId:str,title:str,notes:str,tagIds:strings,status:str,blockedReason:str},['taskId']),
  spec('tasks.move','Move subtree; expectedRevision required',{taskId:str,parentId:{type:['string','null']},index:num},['taskId','parentId']),
  spec('tasks.complete','Complete/reopen entire subtree; expectedRevision required',{taskId:str,done:bool},['taskId','done']),
  spec('tasks.delete','Delete task and subtree; expectedRevision required; prior workspace backup retained',{taskId:str},['taskId']),
  spec('tasks.claim','Atomically claim task for actor; renewable lease (default 30 minutes)',{taskId:str,leaseMinutes:num},['taskId']),
  spec('tasks.release','Release task claimed by actor',{taskId:str},['taskId']),
  spec('progress.get','Progress weighted equally by root tasks; includes status counts',{projectId:str},['projectId'],true),
  spec('tags.list','List tag catalog',{},[],true),
  spec('tags.create','Create tag',{name:str,color:str},['name']),
  spec('tags.update','Rename/recolor tag; expectedRevision required',{tagId:str,name:str,color:str},['tagId','name','color']),
  spec('tags.delete','Remove tag catalog entry and assignments; expectedRevision required',{tagId:str},['tagId']),
  spec('audit.check','Local deterministic audit of project, document and tasks',{projectId:str},['projectId'],true),
  spec('audit.start','Start agy/Codex audit or roadmap proposal; never executes project code',{projectId:str,mode:{type:'string',enum:['agy','codex','both']},instruction:str},['projectId','mode'],true),
  spec('audit.list','Read audit jobs and results',{projectId:str},['projectId'],true),
  spec('audit.cancel','Cancel an audit job',{runId:str},['runId'],true),
  spec('audit.apply','Apply reviewed audit proposal; expectedRevision required',{projectId:str,runId:str},['projectId','runId']),
  spec('activity.list','Read recent human/agent changes',{projectId:str},[],true),
];
const fail=(message,status=400)=>{const e=Error(message);e.status=status;throw e;};
const text=(s,max=300)=>{if(typeof s!=='string'||!s.trim()||s.length>max)fail(`Text must be nonempty, max ${max} characters`);return s.trim();};
const project=(d,id)=>d.projects.find(p=>p.id===id)||fail('Project not found',404);
const task=(d,id)=>d.tasks.find(t=>t.id===id)||fail('Task not found',404);
const state=t=>t.done?'done':t.status==='done'?'todo':t.status||'todo';
export function progress(d,id){project(d,id);const tasks=d.tasks.filter(t=>t.projectId===id),map=progressMap(tasks),roots=tasks.filter(t=>t.parentId===null);return {percent:projectProgress(tasks,id),rootCount:roots.length,completedRoots:roots.filter(t=>map[t.id]===100).length,taskCount:tasks.length,counts:Object.fromEntries(['todo','in_progress','blocked','done'].map(s=>[s,tasks.filter(t=>state(t)===s).length])),tasks:map};}
function checkTags(d,ids){if(ids.some(id=>!availableTags(d).some(t=>t.id===id)))fail('Unknown tag ID');return [...new Set(ids)];}
function writable(t,actor){if(t.claim&&Date.parse(t.claim.expiresAt)>Date.now()&&t.claim.owner!==actor)fail(`Task claimed by ${t.claim.owner}`,409);}
const empty=()=>({version:1,projects:[],tasks:[],ideas:[]});
export function createTools(store,agents){
  async function call(name,args={},options={}){
    const definition=TOOL_DEFINITIONS.find(t=>t.name===name);if(!definition)fail('Unknown tool',404);
    if(!args||typeof args!=='object'||Array.isArray(args))fail('Arguments must be object');
    for(const k of definition.inputSchema.required)if(args[k]===undefined)fail(`Missing ${k}`);
    for(const [k,v] of Object.entries(args)){const s=definition.inputSchema.properties[k];if(!s)fail(`Unknown argument ${k}`);const type=v===null?'null':Array.isArray(v)?'array':typeof v;if(![].concat(s.type).includes(type)||s.enum&&!s.enum.includes(v)||type==='array'&&v.some(i=>typeof i!=='string'))fail(`Invalid ${k}`);}
    const actor=text(options.actor||'agent',100);
    if(options.expectedRevision!==undefined&&(!Number.isInteger(options.expectedRevision)||options.expectedRevision<0))fail('Invalid expectedRevision');
    if(options.requestId!==undefined)text(options.requestId,200);
    if(name==='audit.start')return agents.start(args.projectId,args.mode,args.instruction||'Audit project, design document và task: chỉ ra thiếu sót, mâu thuẫn, rủi ro, task bị chặn và đề xuất bổ sung cần thiết. Không triển khai code.');
    if(name==='audit.list')return agents.list(args.projectId);
    if(name==='audit.cancel'){await agents.cancel(args.runId);return {ok:true};}
    if(definition.readOnly){const {data:raw,revision}=await store.read();const d=raw||empty();let result;
      switch(name){
        case 'projects.list':result=d.projects.map(p=>({...p,designDocument:undefined,progress:progress(d,p.id)}));break;
        case 'projects.get':result={project:project(d,args.projectId),tasks:d.tasks.filter(t=>t.projectId===args.projectId).map(t=>({...t,status:state(t)})),tags:availableTags(d),progress:progress(d,args.projectId)};break;
        case 'documents.get':result={document:project(d,args.projectId).designDocument||'',sections:project(d,args.projectId).documentSections??parseDocumentSections(project(d,args.projectId).designDocument||'')};break;
        case 'tasks.list':project(d,args.projectId);result=d.tasks.filter(t=>t.projectId===args.projectId&&(args.parentId===undefined||t.parentId===args.parentId)&&(!args.status||state(t)===args.status)&&(!args.tagId||(t.tagIds||[]).includes(args.tagId))).sort((a,b)=>a.order-b.order).map(t=>({...t,status:state(t)}));break;
        case 'progress.get':result=progress(d,args.projectId);break;
        case 'tags.list':result=availableTags(d);break;
        case 'activity.list':result=(d.activity||[]).filter(e=>!args.projectId||e.projectId===args.projectId);break;
        case 'audit.check':{const p=project(d,args.projectId),tasks=d.tasks.filter(t=>t.projectId===p.id);result={progress:progress(d,p.id),findings:[...(!p.designDocument?.trim()?['Missing design document']:[]),...(!tasks.length?['No tasks planned']:[]),...tasks.flatMap(t=>[...(!t.notes.trim()?[`${t.id}: missing description/acceptance criteria`]:[]),...(state(t)==='blocked'?[`${t.id}: blocked — ${t.blockedReason||'reason missing'}`]:[])])],document:p.designDocument||''};break;}
      }return {revision,result};
    }
    const guarded=['documents.set','tasks.update','tasks.move','tasks.complete','tasks.delete','tags.update','tags.delete','projects.update','audit.apply'];
    if((guarded.includes(name)||name.startsWith('documents.section.'))&&options.expectedRevision===undefined)fail('expectedRevision required; read current state first',428);
    let result;
    const record=await store.transact(async(raw,previous)=>{
      let d=structuredClone(raw||empty());
      const receipt=options.requestId&&(d.receipts||[]).find(r=>r.id===options.requestId&&r.actor===actor);
      const fingerprint=JSON.stringify({name,args});
      if(receipt){if(receipt.fingerprint!==fingerprint)fail('requestId reused with different arguments',409);result=receipt.result;return d;}
      if(options.expectedRevision!==undefined&&previous.revision!==options.expectedRevision)fail('Revision conflict; read and retry',409);
      const now=new Date().toISOString();let projectId=args.projectId;
      let t=args.taskId?task(d,args.taskId):null;if(t){writable(t,actor);projectId=t.projectId;}
      switch(name){
        case 'documents.section.create':case 'documents.section.update':case 'documents.section.move':case 'documents.section.delete':{
          const p=project(d,args.projectId);let nodes=p.documentSections??parseDocumentSections(p.designDocument||'');const n=args.sectionId?nodes.find(n=>n.id===args.sectionId):null;if(args.sectionId&&!n)fail('Section not found',404);
          if(name==='documents.section.create'){const parentId=args.parentId??null;if(parentId!==null&&!nodes.some(n=>n.id===parentId))fail('Parent section not found');const created={id:randomUUID(),title:text(args.title),content:args.content||'',parentId,order:nodes.filter(n=>n.parentId===parentId).length};nodes=[...nodes,created];result=created;}
          if(name==='documents.section.update'){if(args.title!==undefined)n.title=text(args.title);if(args.content!==undefined)n.content=args.content;result=n;}
          if(name==='documents.section.move'){if(args.parentId!==null&&(!nodes.some(n=>n.id===args.parentId)||args.parentId===n.id||descendants(nodes,n.id).has(args.parentId)))fail('Invalid parent/cycle');if(args.index!==undefined&&(!Number.isInteger(args.index)||args.index<0))fail('Invalid index');nodes=moveTask(nodes,n.id,args.parentId,args.index);result=nodes.find(x=>x.id===n.id);}
          if(name==='documents.section.delete'){const ids=descendants(nodes,n.id);ids.add(n.id);nodes=nodes.filter(x=>!ids.has(x.id));result={deleted:[...ids]};}
          p.documentSections=nodes;p.designDocument=renderDocument(p,nodes);break;
        }
        case 'projects.create':{const p={id:args.id||randomUUID(),title:text(args.title),description:args.description||'',color:args.color||'#82768e',createdAt:now};p.designDocument=defaultDocument(p);d.projects.push(p);result=p;projectId=p.id;break;}
        case 'projects.update':{const p=project(d,args.projectId);for(const k of ['title','description','color'])if(args[k]!==undefined)p[k]=k==='title'?text(args[k]):args[k];result=p;break;}
        case 'documents.set':{const p=project(d,args.projectId);p.designDocument=args.document;p.documentSections=parseDocumentSections(args.document);result={projectId:p.id,document:p.designDocument};break;}
        case 'tasks.create':{project(d,args.projectId);const parentId=args.parentId??null;if(parentId!==null&&task(d,parentId).projectId!==args.projectId)fail('Cross-project parent');const item={id:args.id||randomUUID(),projectId:args.projectId,title:text(args.title),notes:args.notes||'',tagIds:checkTags(d,args.tagIds||[]),parentId,done:false,status:'todo',order:children(d.tasks,parentId).filter(t=>t.projectId===args.projectId).length,attachments:[],createdAt:now};d.tasks.push(item);result=item;break;}
        case 'tasks.update':{for(const k of ['title','notes','blockedReason'])if(args[k]!==undefined)t[k]=k==='title'?text(args[k]):args[k];if(args.tagIds)t.tagIds=checkTags(d,args.tagIds);if(args.status){if(!['todo','in_progress','blocked','done'].includes(args.status))fail('Invalid status');if(args.status==='done'&&d.tasks.some(c=>c.parentId===t.id))fail('Use tasks.complete for a branch');t.status=args.status;t.done=args.status==='done';}t.updatedAt=now;result=t;break;}
        case 'tasks.move':{if(args.index!==undefined&&(!Number.isInteger(args.index)||args.index<0))fail('Invalid index');if(args.parentId!==null&&(task(d,args.parentId).projectId!==t.projectId||args.parentId===t.id||descendants(d.tasks,t.id).has(args.parentId)))fail('Invalid parent/cycle');d.tasks=moveTask(d.tasks,t.id,args.parentId,args.index);result=task(d,t.id);break;}
        case 'tasks.complete':{const ids=descendants(d.tasks,t.id);ids.add(t.id);for(const item of d.tasks.filter(x=>ids.has(x.id)))writable(item,actor);d.tasks=toggleBranch(d.tasks,t.id,args.done).map(item=>ids.has(item.id)?{...item,status:args.done?'done':'todo',claim:null,updatedAt:now}:item);result=task(d,t.id);break;}
        case 'tasks.delete':{const ids=descendants(d.tasks,t.id);ids.add(t.id);for(const item of d.tasks.filter(x=>ids.has(x.id)))writable(item,actor);d.tasks=d.tasks.filter(x=>!ids.has(x.id));result={deleted:[...ids]};break;}
        case 'tasks.claim':{const minutes=args.leaseMinutes??30;if(minutes<1||minutes>1440||!Number.isFinite(minutes))fail('leaseMinutes must be 1..1440');if(t.done)fail('Task already complete');t.claim={owner:actor,expiresAt:new Date(Date.now()+minutes*60000).toISOString()};t.status='in_progress';result=t;break;}
        case 'tasks.release':t.claim=null;result=t;break;
        case 'tags.create':{const tag={id:randomUUID(),name:text(args.name,60),color:args.color||'#82768e'};if(availableTags(d).some(t=>t.name.toLowerCase()===tag.name.toLowerCase()))fail('Tag name already exists',409);d.tagCatalog=[...availableTags(d),tag];result=tag;break;}
        case 'tags.update':d=editTag(d,args.tagId,args);result=availableTags(d).find(t=>t.id===args.tagId);break;
        case 'tags.delete':d=removeTag(d,args.tagId);result={deleted:args.tagId};break;
        case 'audit.apply':{const run=(await agents.list(args.projectId)).find(r=>r.id===args.runId);if(!run||run.status!=='ready')fail('Audit result not ready');d=applyProposal(d,args.projectId,run);result={applied:run.id};break;}
      }
      d.activity=[...(d.activity||[]),{id:randomUUID(),actor,action:name,projectId,taskId:args.taskId,createdAt:now}].slice(-2000);
      if(options.requestId)d.receipts=[...(d.receipts||[]),{id:options.requestId,actor,fingerprint,result:structuredClone(result)}].slice(-1000);
      return d;
    });return {revision:record.revision,result};
  }
  return {call,definitions:TOOL_DEFINITIONS};
}
