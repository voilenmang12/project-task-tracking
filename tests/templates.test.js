import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PROJECT_TEMPLATES,instantiateTemplate,templateTaskCount} from '../src/templates.js';
import {DEFAULT_TAGS} from '../src/tags.js';
import {validateData,projectProgress} from '../src/model.js';

for(const template of PROJECT_TEMPLATES){
  test(`${template.name}: independent valid trees, ordered siblings, tags and zero progress`,()=>{
    const first=instantiateTemplate(template.id,'first',DEFAULT_TAGS),second=instantiateTemplate(template.id,'second',DEFAULT_TAGS);
    assert.equal(first.length,templateTaskCount(template));assert.equal(first.filter(t=>t.parentId===null).length,7);
    const data={version:1,projects:['first','second'].map(id=>({id,title:id,description:'',color:'#82768f'})),tasks:[...first,...second],ideas:[]};
    assert.doesNotThrow(()=>validateData(data));assert.equal(projectProgress(data.tasks,'first'),0);
    assert.equal(new Set(data.tasks.map(t=>t.id)).size,data.tasks.length);
    for(const t of first){assert.equal(t.done,false);assert.ok(t.tagIds.length>0);assert.ok(t.parentId===null||first.some(p=>p.id===t.parentId));}
    for(const parentId of new Set(first.map(t=>t.parentId))){assert.deepEqual(first.filter(t=>t.parentId===parentId).map(t=>t.order),Array.from({length:first.filter(t=>t.parentId===parentId).length},(_,i)=>i));}
    first[0].title='Changed';assert.notEqual(second[0].title,'Changed');assert.notEqual(template.tasks[0].title,'Changed');
  });
}
test('templates respect deleted tags and empty projects',()=>{assert.ok(instantiateTemplate('game','p',[]).every(t=>t.tagIds.length===0));assert.deepEqual(instantiateTemplate('','p',DEFAULT_TAGS),[]);});
