import {test} from 'node:test';
import assert from 'node:assert/strict';
import {documentOutline,replaceDocumentSection,standardDocument,addStandardSections,DOCUMENT_SECTIONS} from '../src/document.js';
import {parseDocumentSections,renderDocument,validateDocumentSections} from '../src/document.js';
import {createStore,folderId} from '../server/store.js';
import {createTools} from '../server/tools.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
test('outline supports nested headings, duplicates, fenced code and CRLF source offsets',()=>{
 const doc='Intro\r\n# Root\r\n## A\r\ntext\r\n```md\r\n## Not a heading\r\n```\r\n### Child\r\nx\r\n## A\r\ny';
 const h=documentOutline(doc);assert.deepEqual(h.map(s=>s.title),['Root','A','Child','A']);assert.equal(h[2].parent,1);assert.equal(h[3].parent,0);assert.equal(doc.slice(h[1].start,h[1].end),'## A\r\ntext\r\n```md\r\n## Not a heading\r\n```\r\n### Child\r\nx\r\n');
 const next=replaceDocumentSection(doc,h[2],'### Child\nChanged');assert.ok(next.startsWith(doc.slice(0,h[2].start)));assert.ok(next.endsWith('## A\r\ny'));assert.match(next,/Changed\n\n## A/);
});
test('plain documents and setext headings remain editable without losing text',()=>{
 assert.deepEqual(documentOutline('plain text'),[]);assert.equal(replaceDocumentSection('plain',null,'new'),'new');const h=documentOutline('Title\n=====\n\nSection\n-------\nbody');assert.deepEqual(h.map(n=>n.title),['Title','Section']);assert.equal(h[1].parent,0);
});
test('standard template and non-destructive missing-section insertion are idempotent',()=>{
 const doc=standardDocument({title:'Game',description:'Vision'});assert.equal(documentOutline(doc).filter(h=>h.level===2).length,DOCUMENT_SECTIONS.length);assert.equal(addStandardSections(doc),doc);const old='# Existing\n\nCustom content\n\n## Phạm vi\nApproved scope\n';const next=addStandardSections(old);assert.ok(next.startsWith(old));assert.equal(documentOutline(next).filter(h=>h.title==='Phạm vi').length,1);assert.equal(addStandardSections(next),next);
});
test('section parsing preserves fenced content and indented code; invalid parents are rejected',()=>{
 const nodes=parseDocumentSections('# Demo\n\nIntro\n\n## A\n\n    code();\n\n### Child\n\n```md\n## sample\n```\n\n## B\nB content');
 assert.equal(nodes.find(n=>n.title==='A').content,'    code();');assert.equal(nodes.find(n=>n.title==='Child').parentId,nodes.find(n=>n.title==='A').id);assert.match(renderDocument({title:'Demo'},nodes),/    code\(\);/);assert.equal(nodes.length,4);assert.deepEqual(parseDocumentSections('# Only title'),[]);
 assert.throws(()=>validateDocumentSections([{id:'a',title:'A',content:'',order:0,parentId:'a'}]));
});
test('root Markdown files keep stable names across rename; subtree moves archive obsolete root file',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'nhanh-docs-'));const store=createStore(root),tools=createTools(store);const call=(name,args,options={})=>tools.call(name,args,{actor:'test',...options});const edit=async(name,args)=>call(name,args,{expectedRevision:(await store.read()).revision});
 try{
  await call('projects.create',{id:'doc-project',title:'Docs'});
  await edit('documents.set',{projectId:'doc-project',document:'# Docs\n\n## First\nText A\n\n### Child\nText child\n\n## Second\nText B'});
  let result=(await call('documents.get',{projectId:'doc-project'})).result;const first=result.sections.find(n=>n.title==='First'),second=result.sections.find(n=>n.title==='Second');const dir=path.join(root,'projects',folderId('doc-project'),'documents');
  let index=JSON.parse(await fs.readFile(path.join(dir,'index.json'),'utf8'));assert.equal(index.branches.length,2);const original=index.branches.find(b=>b.id===first.id).file;
  await edit('documents.section.update',{projectId:'doc-project',sectionId:first.id,title:'Renamed',content:'Updated content'});
  index=JSON.parse(await fs.readFile(path.join(dir,'index.json'),'utf8'));assert.equal(index.branches.find(b=>b.id===first.id).file,original);assert.match(await fs.readFile(path.join(dir,original),'utf8'),/Text child/);
  await assert.rejects(()=>edit('documents.section.move',{projectId:'doc-project',sectionId:first.id,parentId:first.id}),/cycle/);
  await edit('documents.section.move',{projectId:'doc-project',sectionId:second.id,parentId:first.id});index=JSON.parse(await fs.readFile(path.join(dir,'index.json'),'utf8'));assert.equal(index.branches.length,1);assert.match(await fs.readFile(path.join(dir,original),'utf8'),/Text B/);assert.ok((await fs.readdir(path.join(dir,'archive'))).some(name=>name.endsWith(folderId(second.id)+'.md')));
  const child=(await edit('documents.section.create',{projectId:'doc-project',parentId:first.id,title:'New child',content:'Test criteria'})).result;await edit('documents.section.delete',{projectId:'doc-project',sectionId:child.id});
  result=(await call('documents.get',{projectId:'doc-project'})).result;assert.ok(!result.sections.some(n=>n.id===child.id));assert.match(result.document,/Renamed/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
