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
export const availableTags = data => [...DEFAULT_TAGS,...(data.customTags||[])];
