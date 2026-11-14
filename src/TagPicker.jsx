import React,{useState,useRef,useEffect} from 'react';
import {Tag,Plus,X} from 'lucide-react';

export default function TagPicker({task,tags,onChange,onCreate}){
  const [open,setOpen]=useState(false),[query,setQuery]=useState('');const root=useRef();
  useEffect(()=>{if(!open)return;const close=e=>{if(!root.current?.contains(e.target))setOpen(false);};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close);},[open]);
  const selected=task.tagIds||[];
  const matches=tags.filter(t=>t.name.toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="task-tags" ref={root} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();setOpen(false);root.current?.querySelector('button')?.focus();}}}>
    <button type="button" className="tag-trigger" aria-label={`Gắn tag cho ${task.title}`} aria-expanded={open} title="Gắn tag" onClick={()=>setOpen(v=>!v)}><Tag size={15}/>{selected.length>0&&<span>{selected.length}</span>}</button>
    <div className="tag-chips">{tags.filter(t=>selected.includes(t.id)).map(t=><span className="tag-chip" style={{'--tag-color':t.color}} key={t.id}>{t.name}</span>)}</div>
    {open&&<div className="tag-picker" role="dialog" aria-label="Chọn tag"><div className="tag-picker-heading"><strong>Tag của task</strong><button type="button" aria-label="Đóng chọn tag" onClick={()=>setOpen(false)}><X size={16}/></button></div><input autoFocus aria-label="Tìm hoặc tạo tag" placeholder="Tìm hoặc tạo tag…" value={query} onChange={e=>setQuery(e.target.value)}/><div className="tag-options">{matches.map(t=><label key={t.id}><input type="checkbox" checked={selected.includes(t.id)} onChange={()=>onChange(selected.includes(t.id)?selected.filter(id=>id!==t.id):[...selected,t.id])}/><span className="tag-color" style={{background:t.color}}/>{t.name}</label>)}</div>{query.trim()&&!tags.some(t=>t.name.toLowerCase()===query.trim().toLowerCase())&&<button className="create-tag" type="button" onClick={()=>{onCreate(query.trim());setQuery('');}}><Plus size={15}/>Tạo “{query.trim()}”</button>}<small>Chọn nhiều tag · tự động lưu</small></div>}
  </div>;
}
