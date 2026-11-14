export const DEFAULT_TAGS = [
  ['idea','Idea','#b77b18'],['design-document','Design Document','#8261b5'],
  ['prototype','Prototype','#b55a86'],['core-system','Core System','#3876b5'],
  ['architecture','Architecture','#5463b2'],['gameplay','Gameplay','#358857'],
  ['ui-ux','UI / UX','#ab628b'],['art','Art / Assets','#ac6b30'],
  ['audio','Audio','#7770b5'],['tech-art','Tech Art / VFX','#328b85'],
  ['research','Research','#6c8093'],['feature','Feature','#417e95'],
  ['bug','Bug','#b24f50'],['testing','Testing / QA','#7c8a34'],
  ['optimization','Optimization','#358877'],['release','Release','#805c43'],
  ['analytics','Analytics','#6977a7'],['marketing','Marketing','#9d6f3c']
].map(([id,name,color])=>({id,name,color}));
export const availableTags = data => data.tagCatalog ?? [...DEFAULT_TAGS,...(data.customTags||[])];

export function editTag(data,id,changes){
  const tags=availableTags(data);const tag=tags.find(t=>t.id===id);
  if(!tag)throw Error('Tag này không còn tồn tại.');
  const name=changes.name.trim();
  if(!name||name.length>60)throw Error('Tên tag cần từ 1 đến 60 ký tự.');
  if(!/^#[0-9a-f]{6}$/i.test(changes.color))throw Error('Màu tag không hợp lệ.');
  if(tags.some(t=>t.id!==id&&t.name.toLowerCase()===name.toLowerCase()))throw Error('Tên tag đã được sử dụng.');
  return {...data,tagCatalog:tags.map(t=>t.id===id?{...t,name,color:changes.color}:t)};
}
export function removeTag(data,id){
  return {...data,tagCatalog:availableTags(data).filter(t=>t.id!==id),tasks:data.tasks.map(t=>(t.tagIds||[]).includes(id)?{...t,tagIds:t.tagIds.filter(tagId=>tagId!==id)}:t)};
}
