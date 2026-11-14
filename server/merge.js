const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function conflict(){const e=Error('Cùng trường dữ liệu đã được người/agent khác sửa. Xuất bản sao lưu rồi tải lại.');e.status=409;throw e;}
export function mergeWorkspace(base,next,current){
  if(same(base,next))return current;
  if(same(base,current)||same(next,current))return next;
  if(base===undefined||next===undefined||current===undefined)conflict();
  if(Array.isArray(base)&&Array.isArray(next)&&Array.isArray(current)){
    if([...base,...next,...current].every(v=>v&&typeof v.id==='string')){
      const b=new Map(base.map(v=>[v.id,v])),n=new Map(next.map(v=>[v.id,v])),c=new Map(current.map(v=>[v.id,v]));
      return [...new Set([...c.keys(),...n.keys()])].map(id=>mergeWorkspace(b.get(id),n.get(id),c.get(id))).filter(v=>v!==undefined);
    }
    conflict();
  }
  if(base&&next&&current&&typeof base==='object'&&typeof next==='object'&&typeof current==='object'&&!Array.isArray(base)){
    return Object.fromEntries([...new Set([...Object.keys(base),...Object.keys(next),...Object.keys(current)])].map(k=>[k,mergeWorkspace(base[k],next[k],current[k])]).filter(([,v])=>v!==undefined));
  }
  conflict();
}
