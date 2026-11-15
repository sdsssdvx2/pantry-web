import {noteKind} from './archive-notes.js';
import {createSearchMatcher} from './search-utils.js?v=20260919-1';
import {noteDisplayBody,noteDisplayTitle,sortNotesByModified} from './curation-display.js?v=20260919-3';

const STATE_KEY='my-little-kitchen-pantry-v1';

const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function readState(){
 try{return JSON.parse(localStorage.getItem(STATE_KEY)||'null');}catch{return null;}
}

async function getNotes(){
 const state=readState();
 if(Array.isArray(state?.curation))return state.curation;
 if(Array.isArray(state?.library?.curation))return state.library.curation;
 try{
  const response=await fetch('./curation.json',{cache:'no-cache'});
  if(response.ok){const notes=await response.json();return Array.isArray(notes)?notes:[];}
 }catch{}
 return [];
}

function noteTitle(note){return noteDisplayTitle(note)||'제목 없는 요리 팁';}
function noteBody(note){return noteDisplayBody(note);}
function noteKey(note){return `${String(note?.source??'')}-${String(note?.index??'')}`;}

function installNoteSearch(){
 const query=document.getElementById('recipe-search');
 const notesCheck=document.getElementById('search-notes');
 const box=document.getElementById('note-search-results');
 const reset=document.getElementById('reset-filters');
 if(!query||!notesCheck||!box)return;
 let token=0;
 const render=async()=>{
  const current=++token;
  const q=query.value.trim();
  if(!notesCheck.checked||!q){box.hidden=true;box.innerHTML='';return;}
  const notes=await getNotes();
  if(current!==token)return;
  const matchSearch=createSearchMatcher(q);
  const matches=sortNotesByModified(notes.filter(note=>noteKind(note)==='tip'&&matchSearch([noteTitle(note),note?.reason,noteBody(note)].filter(Boolean).join(' '))));
  const shown=matches.slice(0,20);
  box.hidden=false;
  box.innerHTML=`<div class="note-search-head"><strong>요리 팁 검색 결과 ${matches.length}</strong><span>레시피 결과와 별도로 보여줘요.</span></div><div class="note-search-list">${shown.map(note=>{
   const title=noteTitle(note),body=noteBody(note).replace(/\s+/g,' ').slice(0,150),key=noteKey(note);
   return `<button type="button" class="note-search-item" data-note-key="${escapeHTML(key)}" data-note-title="${escapeHTML(title)}"><b>${escapeHTML(title)}</b><span>${escapeHTML(body||note?.reason||'내용 보기')}</span></button>`;
  }).join('')||'<p class="field-help">일치하는 요리 팁이 없어요.</p>'}</div>${matches.length>shown.length?`<p class="note-search-more">${matches.length-shown.length}개가 더 있어요. 요리 팁·개인 참고·정리에서 같은 검색어로 볼 수 있어요.</p>`:''}`;
 };
 let timer=null;
 query.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(render,80);});
 notesCheck.addEventListener('change',render);
 reset?.addEventListener('click',()=>queueMicrotask(render));
 window.addEventListener('storage',event=>{if(event.key===STATE_KEY&&notesCheck.checked)render();});
 for(const event of ['mlk-notes-changed','mlk-state-applied'])window.addEventListener(event,()=>{if(notesCheck.checked)render();});
 box.addEventListener('click',event=>{
  const button=event.target.closest('[data-note-key]');if(!button)return;
  const key=button.dataset.noteKey||'';
  const title=button.dataset.noteTitle||query.value;
  document.getElementById('open-curation')?.click();
  setTimeout(()=>{
   const tipFilter=document.querySelector('#note-filters [data-note-kind="tip"]');
   if(tipFilter&&tipFilter.getAttribute('aria-pressed')!=='true')tipFilter.click();
   const search=document.getElementById('curation-search');
   if(!search)return;
   search.value=title;
   search.dispatchEvent(new Event('input',{bubbles:true}));
   setTimeout(()=>{
    const edit=document.querySelector(`[data-edit-note="${CSS.escape(key)}"]`);
    const details=edit?.closest('details.audit-record');
    if(details){details.open=true;details.scrollIntoView({block:'center',behavior:'smooth'});}
    search.focus({preventScroll:true});
   },40);
  },60);
 });
}

installNoteSearch();
