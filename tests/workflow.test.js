import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {createStore} from '../server/store.js';
import {createTools} from '../server/tools.js';
import {createLocalService} from '../server/local-api.js';
import {mergeWorkspace} from '../server/merge.js';
import {acquireLock} from '../server/lock.js';

test('external workflow: projects, hierarchy, claim races, progress, tags, doc, revision and idempotency',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'nhanh-workflow-'));const store=createStore(root),tools=createTools(store,{list:async()=>[]});
  const call=(name,args={},options={})=>tools.call(name,args,{actor:'codex',...options});
  const guarded=async(name,args)=>call(name,args,{expectedRevision:(await store.read()).revision});
  try{
    const p=(await call('projects.create',{id:'project',title:'Game'})).result;
    await call('projects.create',{id:'other',title:'Other'});
    await guarded('documents.set',{projectId:p.id,document:'# Game\nPlayable puzzle'});
    assert.match((await call('documents.get',{projectId:p.id})).result.document,/puzzle/);
    await call('tasks.create',{id:'phase',projectId:p.id,title:'Phase'});
    const input={id:'child',projectId:p.id,parentId:'phase',title:'Implement loop',tagIds:['prototype'],notes:'Done when playable'};
    await call('tasks.create',input,{requestId:'add-child'});await call('tasks.create',input,{requestId:'add-child'});
    assert.equal((await call('tasks.list',{projectId:p.id})).result.length,2);
    await assert.rejects(()=>call('tasks.create',{...input,title:'Changed'},{requestId:'add-child'}),/reused/);
    await assert.rejects(()=>call('tasks.create',{projectId:'other',parentId:'phase',title:'Invalid'}),/Cross-project/);
    const claims=await Promise.allSettled([call('tasks.claim',{taskId:'child'}),call('tasks.claim',{taskId:'child'},{actor:'agy'})]);assert.equal(claims.filter(c=>c.status==='fulfilled').length,1);
    await assert.rejects(()=>call('tasks.release',{taskId:'child'},{actor:'agy'}),/claimed/);
    await assert.rejects(()=>call('tasks.update',{taskId:'child',title:'Bad'}),/expectedRevision/);
    await assert.rejects(()=>call('tasks.update',{taskId:'child',title:'Bad'},{expectedRevision:0}),/Revision/);
    await guarded('tasks.update',{taskId:'child',status:'blocked',blockedReason:'Needs assets'});
    assert.equal((await call('progress.get',{projectId:p.id})).result.counts.blocked,1);
    assert.ok((await call('audit.check',{projectId:p.id})).result.findings.some(f=>f.includes('Needs assets')));
    await assert.rejects(()=>guarded('tasks.move',{taskId:'phase',parentId:'child'}),/cycle/);
    await guarded('tasks.complete',{taskId:'child',done:true});assert.equal((await call('progress.get',{projectId:p.id})).result.percent,100);
    const tag=(await call('tags.create',{name:'Milestone'})).result;
    await guarded('tasks.update',{taskId:'child',tagIds:[tag.id]});await guarded('tags.update',{tagId:tag.id,name:'Beta',color:'#777777'});await guarded('tags.delete',{tagId:tag.id});
    assert.deepEqual((await call('tasks.list',{projectId:p.id,parentId:'phase'})).result[0].tagIds,[]);
    assert.ok((await call('activity.list',{projectId:p.id})).result.some(e=>e.actor==='codex'));
    assert.equal((await createTools(createStore(root)).call('projects.get',{projectId:p.id})).result.tasks.length,2);
    await guarded('tasks.delete',{taskId:'phase'});assert.equal((await call('tasks.list',{projectId:p.id})).result.length,0);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('three-way human/agent merging preserves unrelated updates and rejects actual conflicts',()=>{
  const base={tasks:[{id:'a',title:'Old',notes:'Original'}],projects:[]};
  const human=structuredClone(base);human.tasks[0].title='Human';
  const agent=structuredClone(base);agent.tasks[0].notes='Agent';agent.tasks.push({id:'b',title:'New'});
  const merged=mergeWorkspace(base,human,agent);assert.equal(merged.tasks[0].notes,'Agent');assert.equal(merged.tasks[0].title,'Human');assert.equal(merged.tasks.length,2);
  agent.tasks[0].title='Other';assert.throws(()=>mergeWorkspace(base,human,agent));
  assert.throws(()=>mergeWorkspace(base,human,{...base,tasks:[]}));
});

test('HTTP tool contract, authentication, chat removal and singleton data lock',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'nhanh-http-'));const service=createLocalService({root});const server=http.createServer(service.middleware);
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
  try{
    const release=await acquireLock(root);await assert.rejects(()=>acquireLock(root),/already served/);await release();
    assert.equal((await fetch(base+'/api/health')).status,200);
    assert.equal((await fetch(base+'/api/tools')).status,403);
    assert.equal((await fetch(base+'/api/session',{headers:{Origin:'https://evil.example'}})).status,403);
    const {token}=await (await fetch(base+'/api/session')).json();const headers={'Content-Type':'application/json','X-Nhanh-Token':token};
    assert.equal((await fetch(base+'/api/chat',{headers})).status,404);
    const catalog=await (await fetch(base+'/api/tools',{headers})).json();assert.ok(catalog.tools.some(t=>t.name==='tasks.claim'));
    const response=await fetch(base+'/api/tools/call',{method:'POST',headers,body:JSON.stringify({name:'projects.create',arguments:{title:'HTTP project'},options:{actor:'test'}})});assert.equal(response.status,200);assert.ok((await response.json()).result.id);
    const before=await service.store.read(),human=structuredClone(before.data);human.projects[0].title='Human title';
    await fetch(base+'/api/tools/call',{method:'POST',headers,body:JSON.stringify({name:'projects.update',arguments:{projectId:human.projects[0].id,description:'Agent description'},options:{expectedRevision:before.revision}})});
    const saved=await fetch(base+'/api/workspace',{method:'PUT',headers,body:JSON.stringify({data:human,base:before.data,revision:before.revision})});assert.equal(saved.status,200);
    const merged=(await service.store.read()).data;assert.equal(merged.projects[0].title,'Human title');assert.equal(merged.projects[0].description,'Agent description');
    const cli=spawn(process.execPath,['scripts/nhanh.mjs','projects.create','--stdin'],{env:{...process.env,NHANH_URL:base},windowsHide:true,stdio:['pipe','pipe','pipe']});let output='',error='';cli.stdout.on('data',c=>output+=c);cli.stderr.on('data',c=>error+=c);cli.stdin.end(JSON.stringify({arguments:{id:'cli-project',title:'External CLI project'},options:{actor:'external-agent',requestId:'cli-create'}}));const code=await new Promise((resolve,reject)=>{cli.on('error',reject);cli.on('close',resolve);});assert.equal(code,0,error);assert.equal(JSON.parse(output).result.id,'cli-project');assert.ok((await service.store.read()).data.projects.some(p=>p.id==='cli-project'));
    assert.equal((await fetch(base+'/api/tools/call',{method:'POST',headers,body:JSON.stringify({name:'tasks.create',arguments:{unexpected:true}})})).status,400);
  }finally{service.close();await new Promise(r=>server.close(r));await fs.rm(root,{recursive:true,force:true});}
});
