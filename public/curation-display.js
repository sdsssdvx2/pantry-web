import {noteKinds,noteKind,noteStatus,noteReason} from './archive-notes.js';

const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function noteFiltersHTML(active='tip'){
 return noteKinds.map(([id,label])=>`<button class="chip" data-note-kind="${id}" aria-pressed="${active===id}">${escapeHTML(label)}</button>`).join('');
}

export function sortNotesByModified(records=[]){
 const rank=record=>Date.parse(record.modifiedAt||'')||(record.source==='personal'?Number(record.index)||0:0);
 return [...records].sort((a,b)=>rank(b)-rank(a));
}

const cleanNoteTitle=value=>String(value??'').replace(/^\s*[•·]\s*/,'').trim();
const comparableNoteTitle=value=>cleanNoteTitle(value).replace(/\s+/g,' ').trim();
const firstMeaningfulLine=value=>String(value??'').replace(/\r\n?/g,'\n').split('\n').find(line=>line.trim())||'';

export function noteDisplayTitle(record={}){
 const stored=cleanNoteTitle(record.displayTitle||record.title);
 if(record.source==='personal'||record.note===undefined)return stored;
 const customized=record.displayTitle!==undefined&&comparableNoteTitle(record.displayTitle)!==comparableNoteTitle(record.title);
 if(customized)return stored;
 const fromBody=cleanNoteTitle(firstMeaningfulLine(record.note));
 return fromBody||stored;
}

export function noteDisplayBody(record={}){
 const raw=String(record.note??record.original??'').replace(/\r\n?/g,'\n');
 if(!raw.trim())return '';
 const lines=raw.split('\n'),first=lines.findIndex(line=>line.trim());
 if(first>=0&&comparableNoteTitle(lines[first])===comparableNoteTitle(noteDisplayTitle(record)))lines.splice(first,1);
 return lines.join('\n').trim();
}

export function curationRecordsHTML(records=[]){
 if(!records.length)return '<p>검색 결과가 없어요.</p>';
 return records.map(record=>{
  const promotedBatch=record.source==='main'&&record.index===256;
  const status=promotedBatch?'메뉴 5개 등록':noteStatus(record);
  const reason=promotedBatch?'이 원문의 다섯 배합을 멜론 메뉴로 등록했어요. 원문은 이곳에 보존합니다.':noteReason(record);
  const kindLabel=noteKinds.find(([kind])=>kind===noteKind(record))?.[1]||'';
  const key=`${record.source}-${record.index}`,title=noteDisplayTitle(record),body=noteDisplayBody(record);
  return `<details class="audit-record"><summary><span class="audit-summary-main"><span class="audit-status">${escapeHTML(status)}</span><span class="audit-title">${escapeHTML(title)}</span></span><span class="audit-kind">${escapeHTML(kindLabel)}</span></summary><div class="audit-content">${reason?`<p class="audit-reason">${escapeHTML(reason)}</p>`:''}${body?`<div class="recipe-original audit-body">${escapeHTML(body)}</div>`:''}${record.note!==undefined&&record.source!=='personal'?`<details class="audit-original"><summary>수정 전 원문</summary><div class="recipe-original">${escapeHTML(record.original)}</div></details>`:''}<div class="audit-actions"><button class="text-button" data-edit-note="${escapeHTML(key)}">노트·분류 수정</button><button class="text-button" data-archive="${escapeHTML(key)}">원문을 편집기에 가져오기</button></div></div></details>`;
 }).join('');
}

export function deletedRecipeSectionsHTML({recipes=[],variants=[],trashIcon='' }={}){
 let html='';
 if(recipes.length){
  html=`<div class="trash-heading-row"><h3>삭제한 레시피</h3><button type="button" class="trash-delete-icon trash-delete-all" data-trash-delete-all="1" title="삭제한 레시피 모두 완전 삭제" aria-label="삭제한 레시피 모두 완전 삭제">${trashIcon}</button></div>${recipes.map(({id,name})=>`<div class="trash-recipe-row"><span class="trash-recipe-name" title="${escapeHTML(name)}">${escapeHTML(name)}</span><span class="trash-recipe-actions"><button type="button" class="trash-delete-icon" data-trash-delete="${escapeHTML(id)}" title="완전 삭제" aria-label="${escapeHTML(name)} 완전 삭제">${trashIcon}</button><button class="outline-button" data-unhide="${escapeHTML(id)}">복원</button></span></div>`).join('')}`;
 }
 if(variants.length){
  html+=`<div class="trash-heading-row"><h3>삭제한 인분·버전</h3><button type="button" class="trash-delete-icon trash-delete-all" data-trash-delete-variant-all="1" title="삭제한 인분·버전 모두 완전 삭제" aria-label="삭제한 인분·버전 모두 완전 삭제">${trashIcon}</button></div>${variants.map(({sourceId,variantKey,name,label})=>{const token=sourceId+'/'+variantKey;return `<div class="trash-recipe-row"><span class="trash-recipe-name" title="${escapeHTML(name+' · '+label)}">${escapeHTML(name)} · ${escapeHTML(label)}</span><span class="trash-recipe-actions"><button type="button" class="trash-delete-icon" data-trash-delete-variant="${escapeHTML(token)}" title="완전 삭제" aria-label="${escapeHTML(name+' '+label)} 완전 삭제">${trashIcon}</button><button class="outline-button" data-unhide-variant="${escapeHTML(token)}">복원</button></span></div>`;}).join('')}`;
 }
 return html;
}
