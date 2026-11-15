import {saveKitchenState} from './cloud-sync.js';

const STATE_KEY='my-little-kitchen-pantry-v1';
let activeNoteKey='';

function toastText(text){
 const toast=document.getElementById('toast');
 if(!toast)return;
 toast.textContent=text;
 toast.classList.add('show');
}

function readKitchenState(){
 try{return JSON.parse(localStorage.getItem(STATE_KEY)||'null');}catch{return null;}
}

function writeKitchenState(next){
 const raw=JSON.stringify(next);
 return saveKitchenState(raw,{apply:true});
}

async function currentCuration(state){
 if(Array.isArray(state?.curation))return state.curation;
 if(Array.isArray(state?.library?.curation))return state.library.curation;
 const response=await fetch('./curation.json',{cache:'no-cache'});
 if(!response.ok)throw new Error('요리 노트 원문을 불러오지 못했어요.');
 const curation=await response.json();
 return Array.isArray(curation)?curation:[];
}

function splitNoteKey(key){
 const pos=String(key).lastIndexOf('-');
 if(pos<1)return null;
 return {source:key.slice(0,pos),index:key.slice(pos+1)};
}

export function installNoteDelete(){
 const curationDialog=document.getElementById('curation-dialog');
 const noteDialog=document.getElementById('note-dialog');
 const addNote=document.getElementById('add-note');
 const button=document.getElementById('delete-note');
 if(!curationDialog||!noteDialog||!button)return;
 const syncButton=()=>{button.hidden=!activeNoteKey;button.dataset.confirm='';button.textContent='요리 노트 삭제';};
 curationDialog.addEventListener('click',e=>{
  const edit=e.target.closest('[data-edit-note]');
  if(edit){activeNoteKey=edit.dataset.editNote||'';syncButton();}
 },true);
 addNote?.addEventListener('click',()=>{activeNoteKey='';syncButton();},true);
 noteDialog.addEventListener('close',()=>{button.dataset.confirm='';button.textContent='요리 노트 삭제';});
 button.addEventListener('click',async()=>{
  if(!activeNoteKey)return;
  if(button.dataset.confirm!=='yes'){
   button.dataset.confirm='yes';button.textContent='한 번 더 눌러 완전히 삭제';return;
  }
  const state=readKitchenState();
  const key=splitNoteKey(activeNoteKey);
  if(!state||!key){toastText('요리 노트를 삭제하지 못했어요.');return;}
  button.disabled=true;
  try{
   const current=await currentCuration(state);
   const before=current.length;
   const curation=current.filter(r=>!(String(r.source)===key.source&&String(r.index)===key.index));
   if(curation.length===before)throw new Error('삭제할 요리 노트를 찾지 못했어요.');
   const next={...state,curation};
   if(!writeKitchenState(next))throw new Error('읽기 전용이거나 저장하지 못했어요.');
   const selector=`[data-edit-note="${CSS.escape(activeNoteKey)}"]`;
   document.querySelector(selector)?.closest('.audit-record')?.remove();
   noteDialog.close();
   toastText('요리 노트를 삭제했어요. 서버 변경 기록에서 되돌릴 수도 있어요.');
   activeNoteKey='';syncButton();
  }catch(error){
   const message=document.getElementById('note-error');
   if(message)message.textContent=error.message;
  }finally{button.disabled=false;}
 });
 syncButton();
}
