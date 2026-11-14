import React,{useState,useEffect} from 'react';
import {Check,Trash2,Search} from 'lucide-react';

function TagRow({tag,count,onSave,onDelete}){
  const [name,setName]=useState(tag.name),[color,setColor]=useState(tag.color),[confirm,setConfirm]=useState(false),[error,setError]=useState('');
  useEffect(()=>{setName(tag.name);setColor(tag.color);},[tag.name,tag.color]);
  const changed=name.trim()!==tag.name||color!==tag.color;
  return <div className="managed-tag"><form onSubmit={e=>{e.preventDefault();try{onSave(tag.id,{name,color});setError('');}catch(e){setError(e.message);}}}>
    <input type="color" aria-label={`Màu tag ${tag.name}`} value={color} onInput={e=>setColor(e.currentTarget.value)} onChange={e=>setColor(e.target.value)}/>
    <input aria-label={`Tên tag ${tag.name}`} maxLength={60} required value={name} onChange={e=>setName(e.target.value)} />
    <span className="tag-usage">{count} task</span>
    <button className="icon-button save-tag" title="Lưu tag" aria-label={`Lưu tag ${tag.name}`} disabled={!changed||!name.trim()}><Check size={17}/></button>
    <button type="button" className="icon-button danger" title="Xóa tag" aria-label={`Xóa tag ${tag.name}`} onClick={()=>setConfirm(v=>!v)}><Trash2 size={16}/></button>
  </form>{error&&<p className="danger-text" role="alert">{error}</p>}{confirm&&<div className="tag-delete-confirm"><p>Xóa “{tag.name}” khỏi danh sách và {count} task? Các task vẫn được giữ nguyên.</p><button type="button" onClick={()=>setConfirm(false)}>Hủy</button><button type="button" className="danger" onClick={()=>onDelete(tag.id)}>Xác nhận xóa tag</button></div>}</div>;
}

export default function TagManager({tags,tasks,onSave,onDelete}){
  const [query,setQuery]=useState('');const filtered=tags.filter(t=>t.name.toLowerCase().includes(query.toLowerCase()));
  return <div className="tag-management"><p>Áp dụng cho tất cả dự án. Đổi tên hoặc màu sẽ cập nhật tag trên mọi task. Có thể hoàn tác sau khi đóng cửa sổ.</p><div className="manager-search"><Search size={16}/><input aria-label="Tìm tag để quản lý" placeholder="Tìm tag…" value={query} onChange={e=>setQuery(e.target.value)}/></div><div className="managed-tag-list">{filtered.map(t=><TagRow key={t.id} tag={t} count={tasks.filter(task=>(task.tagIds||[]).includes(t.id)).length} onSave={onSave} onDelete={onDelete}/>)}{!filtered.length&&<p className="empty-tags">{query?'Không có tag phù hợp.':'Chưa có tag. Tạo tag bằng nút gắn tag trên cây task.'}</p>}</div></div>;
}
