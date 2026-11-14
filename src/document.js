const trimBlank=s=>s.replace(/^(?:[ \t]*\r?\n)+/,'').replace(/(?:\r?\n[ \t]*)+$/,'');
export const DOCUMENT_SECTIONS=[
  ['Tổng quan & tầm nhìn','Mô tả sản phẩm/game, vấn đề cần giải quyết và giá trị cốt lõi.'],
  ['Người dùng & bối cảnh','Ai sử dụng, nhu cầu chính và tình huống sử dụng.'],
  ['Phạm vi','### MVP\nLiệt kê tính năng bắt buộc.\n\n### Ngoài phạm vi\nGhi rõ những gì chưa làm.'],
  ['Trải nghiệm & luồng chính','Mô tả từng luồng: điều kiện đầu vào → thao tác → kết quả; gồm lỗi và ngoại lệ.'],
  ['Thiết kế hệ thống','### Thành phần & dữ liệu\nTrách nhiệm, dữ liệu và quan hệ giữa các hệ thống.\n\n### Quy tắc & ràng buộc\nQuy tắc nghiệp vụ/gameplay, nền tảng và giới hạn kỹ thuật.'],
  ['Tiêu chí nghiệm thu','Viết điều kiện có thể kiểm chứng; nêu cách đo hoặc test và kết quả mong đợi.'],
  ['Roadmap & phụ thuộc','Chia phase theo đầu ra có thể kiểm chứng, liên kết task ID và các phụ thuộc.'],
  ['Rủi ro & câu hỏi mở','Phân biệt quyết định đã chốt, giả định và câu hỏi cần trả lời.'],
  ['Nhật ký quyết định','Ghi ngày, quyết định, lý do và ảnh hưởng khi thiết kế thay đổi.'],
];
export function standardDocument(project){return `# ${project.title}\n\n${project.description||''}\n\n${DOCUMENT_SECTIONS.map(([title,body])=>`## ${title}\n\n${body}`).join('\n\n')}\n`;}

// Source offsets preserve all text (including preamble and original newlines).
export function documentOutline(source){
  const headings=[];let fence=null,previous=null;
  for(const match of source.matchAll(/[^\n]*(?:\n|$)/g)){
    const raw=match[0];if(!raw)continue;const line=raw.replace(/\r?\n$/,'');
    const marker=line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if(fence){if(marker&&marker[1][0]===fence.char&&marker[1].length>=fence.length&&!marker[2].trim())fence=null;previous=null;continue;}
    if(marker){fence={char:marker[1][0],length:marker[1].length};previous=null;continue;}
    const atx=line.match(/^ {0,3}(#{1,6})(?:[ \t]+(.*?)|[ \t]*)$/);
    const setext=line.match(/^ {0,3}(=+|-+)[ \t]*$/);
    if(atx){headings.push({level:atx[1].length,title:(atx[2]||'').replace(/[ \t]+#+[ \t]*$/,'').trim()||'Mục chưa đặt tên',start:match.index});previous=null;}
    else if(setext&&previous&&previous.text.trim()&&!/^\s{4}|^\s*[-*>]/.test(previous.text)){headings.push({level:setext[1][0]==='='?1:2,title:previous.text.trim(),start:previous.start});previous=null;}
    else previous=line.trim()?{text:line,start:match.index}:null;
  }
  const stack=[];
  return headings.map((h,index)=>{while(stack.length&&headings[stack.at(-1)].level>=h.level)stack.pop();const parent=stack.at(-1)??null,depth=stack.length;stack.push(index);const end=headings.slice(index+1).find(n=>n.level<=h.level)?.start??source.length;return {...h,index,parent,depth,end};});
}
export function replaceDocumentSection(source,section,value){return section?source.slice(0,section.start)+value+(value&&!value.endsWith('\n')&&section.end<source.length?'\n\n':'')+source.slice(section.end):value;}
export function addStandardSections(source){const names=new Set(documentOutline(source).map(h=>h.title.toLocaleLowerCase()));const missing=DOCUMENT_SECTIONS.filter(([name])=>!names.has(name.toLocaleLowerCase()));return missing.length?source.trimEnd()+'\n\n'+missing.map(([title,body])=>`## ${title}\n\n${body}`).join('\n\n')+'\n':source;}

export function parseDocumentSections(source){
  const outline=documentOutline(source),nodes=[];
  const title=outline[0]?.level===1&&outline.slice(1).every(h=>h.level>1)?outline[0]:null;
  const headings=title?outline.slice(1):outline;
  const titleEnd=title?(source.indexOf('\n',title.start)===-1?source.length:source.indexOf('\n',title.start)+1):0;
  const intro=trimBlank(source.slice(titleEnd,headings[0]?.start??source.length));
  if(intro)nodes.push({id:'document-intro',title:'Giới thiệu',content:intro,parentId:null,order:0});
  const stack=[];
  headings.forEach((h,index)=>{while(stack.length&&stack.at(-1).level>=h.level)stack.pop();const parentId=stack.at(-1)?.id??null;const end=headings[index+1]?.start??source.length;const chunk=source.slice(h.start,end);let body=chunk.slice(chunk.indexOf('\n')+1);if(!/^ {0,3}#/.test(chunk))body=body.slice(body.indexOf('\n')+1);if(!chunk.includes('\n'))body='';const node={id:`section-${h.start}`,title:h.title,content:trimBlank(body),parentId,order:nodes.filter(n=>n.parentId===parentId).length};nodes.push(node);stack.push({...h,id:node.id});});
  return nodes;
}
export function validateDocumentSections(nodes){
  if(!Array.isArray(nodes)||nodes.length>2000)throw Error('Cây document tối đa 2.000 mục.');
  const ids=new Map();for(const n of nodes){if(!n||typeof n.id!=='string'||!n.id||ids.has(n.id)||typeof n.title!=='string'||!n.title.trim()||n.title.length>300||/[\r\n]/.test(n.title)||typeof n.content!=='string'||!Number.isFinite(n.order))throw Error('Mục document không hợp lệ.');ids.set(n.id,n);}
  for(const n of nodes){let p=n;const seen=new Set([n.id]);while(p.parentId!==null){p=ids.get(p.parentId);if(!p||seen.has(p.id))throw Error('Cây document có chu trình hoặc thiếu mục cha.');seen.add(p.id);}}
  return nodes;
}
export function orderedDocumentSections(nodes,parentId=null,depth=0){const rows=[];const stack=nodes.filter(n=>n.parentId===parentId).sort((a,b)=>b.order-a.order).map(n=>({node:n,depth}));while(stack.length){const item=stack.pop();rows.push(item);for(const n of nodes.filter(n=>n.parentId===item.node.id).sort((a,b)=>b.order-a.order))stack.push({node:n,depth:item.depth+1});}return rows;}
export function renderDocumentBranch(nodes,id,level=1){const root=nodes.find(n=>n.id===id);if(!root)return '';return [{node:root,depth:0},...orderedDocumentSections(nodes,id,1)].map(({node,depth})=>`${'#'.repeat(Math.min(6,level+depth))} ${node.title}\n\n${trimBlank(node.content)}\n`).join('\n');}
export function renderDocument(project,nodes){return `# ${project.title}\n\n`+nodes.filter(n=>n.parentId===null).sort((a,b)=>a.order-b.order).map(n=>renderDocumentBranch(nodes,n.id,2)).join('\n');}
