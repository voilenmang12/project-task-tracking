import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createStore,folderId} from '../server/store.js';
import {seedData,validateData} from '../src/model.js';
import {applyProposal,parseProposal,validateProposal} from '../src/planning.js';
import {cleanEnvironment,runCLI} from '../server/agents.js';

test('disk storage round trips docs, keeps backup and rejects stale concurrent saves',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'nhanh-test-'));try{
    const store=createStore(root),data=seedData();data.projects[0].designDocument='# Design\nNội dung';
    await store.write(data,0);assert.deepEqual((await store.read()).data,data);
    assert.equal(await fs.readFile(path.join(root,'projects',folderId('welcome'),'design.md'),'utf8'),'# Design\nNội dung');
    const results=await Promise.allSettled([store.write({...data,ideas:[]},1),store.write(data,1)]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
    assert.equal(JSON.parse(await fs.readFile(path.join(root,'workspace.backup.json'),'utf8')).revision,1);
    await fs.writeFile(path.join(root,'workspace.json'),'broken');await assert.rejects(()=>store.write(data,2));
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
const proposal={summary:'Prototype',phases:[{title:'Phase 1',notes:'Deliver playable loop',tags:['Prototype'],tasks:[{title:'Move',notes:'Arrow keys move a block.',tags:['Gameplay'],tasks:[]}]}],tagAssignments:[{taskId:'plan',tags:['Design Document']}]};
test('proposal application preserves existing tasks, tags, links, prevents duplicate and stale doc apply',()=>{
  const data=seedData();data.projects[0].designDocument='doc';const run={id:'run1',projectId:'welcome',document:'doc',proposal};
  const next=applyProposal(data,'welcome',run);validateData(next);assert.equal(next.tasks.length,data.tasks.length+2);assert.equal(next.tasks.find(t=>t.id==='goal').done,true);
  const phase=next.tasks.find(t=>t.title==='Phase 1'),child=next.tasks.find(t=>t.title==='Move');assert.equal(child.parentId,phase.id);assert.ok(next.tasks.find(t=>t.id==='plan').tagIds.length);
  assert.throws(()=>applyProposal(next,'welcome',run));assert.throws(()=>applyProposal(data,'welcome',{...run,document:'stale'}));
  assert.deepEqual(parseProposal('```json\n'+JSON.stringify(proposal)+'\n```'),proposal);assert.throws(()=>validateProposal({summary:'bad',phases:[{}],tagAssignments:[]}));
});
test('agent environment excludes user API keys',()=>{const env=cleanEnvironment();assert.equal(env.GEMINI_API_KEY,undefined);assert.equal(env.GOOGLE_API_KEY,undefined);assert.equal(env.CODEX_API_KEY,undefined);});
test('CLI adapter transports literal input without shell evaluation and supports cancellation',async()=>{
  const cli={command:process.execPath,prefix:[]};const literal='$(do-not-run) & <design> tiếng Việt';
  const result=await runCLI(cli,['-e',"process.stdin.setEncoding('utf8');process.stdin.on('data',d=>process.stdout.write(d))"],{cwd:os.tmpdir(),stdin:literal,timeout:5000});assert.equal(result,literal);
  const controller=new AbortController();const running=runCLI(cli,['-e','setInterval(()=>{},1000)'],{cwd:os.tmpdir(),signal:controller.signal});controller.abort();await assert.rejects(running,/hủy/);
});
