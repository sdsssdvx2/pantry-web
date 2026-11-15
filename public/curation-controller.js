import {noteKind} from './archive-notes.js';
import {curationRecordsHTML,deletedRecipeSectionsHTML,noteDisplayTitle,noteFiltersHTML,sortNotesByModified} from './curation-display.js?v=20260919-3';
import {createSearchMatcher} from './search-utils.js?v=20260919-1';
import {validText} from './state-validation.js?v=20260919-5';

const $=id=>document.getElementById(id);
const trashIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h3v2H5V5h3l1-2Zm-2 6h10l-.7 12H7.7L7 9Z"/></svg>';

export function installCurationController({getContext,applyContext,persist,render,recipeEditor,toast}){
 let archiveFilter='tip',activeNote=null,noteTitleAuto=false;
 const noteKey=record=>record?`${String(record.source)}-${String(record.index)}`:'';
 const noteSnapshot=record=>JSON.stringify(Object.keys(record||{}).sort().map(key=>[key,record[key]]));

 function hiddenVariantInfo(token,builtInRecipes,sourceEdits=[]){
  const split=String(token).indexOf('/');
  if(split<1)return null;
  const sourceId=token.slice(0,split),variantKey=token.slice(split+1);
  const recipe=builtInRecipes.find(item=>item.id===sourceId),variant=recipe?.variants?.find(item=>item.key===variantKey),edit=sourceEdits.find(item=>item.sourceId===sourceId&&item.variantKey===variantKey);
  return recipe&&(variant||edit)?{sourceId,variantKey,name:recipe.name,label:edit?.label||variant?.label||variantKey}:null;
 }

 async function ensureArchive(){
  const context=getContext();
  if(context.curationLoaded)return context.curation;
  const response=await fetch('./curation.json');
  if(!response.ok)throw Error('참고 원문을 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.');
  const curation=await response.json();
  applyContext({curation,curationLoaded:true});
  return curation;
 }

 function renderCuration(){
  const context=getContext();
  const q=$('curation-search').value.trim(),matchSearch=q?createSearchMatcher(q):null;
  $('note-filters').innerHTML=noteFiltersHTML(archiveFilter);
  const list=context.curation.filter(record=>(archiveFilter==='all'||noteKind(record)===archiveFilter)&&(!matchSearch||matchSearch(noteDisplayTitle(record)+' '+record.reason+' '+(record.note??record.original))));
  $('curation-list').innerHTML=curationRecordsHTML(sortNotesByModified(list));
  const deleted=context.hiddenSources.filter(id=>!context.purgedSources.includes(id)).map(id=>({id,name:context.builtInRecipes.find(recipe=>recipe.id===id)?.name||id}));
  const deletedVariants=context.hiddenVariants.filter(token=>!(context.purgedVariants||[]).includes(token)).map(token=>hiddenVariantInfo(token,context.builtInRecipes,context.sourceEdits)).filter(Boolean);
  $('hidden-recipes').innerHTML=deletedRecipeSectionsHTML({recipes:deleted,variants:deletedVariants,trashIcon});
 }

 async function open(){
  try{await ensureArchive();}
  catch{toast('정리 내역을 불러오지 못했어요. 다시 시도해 주세요.');return;}
  archiveFilter='tip';
  $('curation-search').value='';
  renderCuration();
  $('curation-dialog').showModal();
  $('close-curation').focus();
 }

 function openNote(record=null){
  activeNote=record;
  const normalized=value=>String(value??'').replace(/^\s*[•·]\s*/,'').trim().replace(/\s+/g,' ');
  noteTitleAuto=!!record&&record.source!=='personal'&&(!record.displayTitle||normalized(record.displayTitle)===normalized(record.title));
  $('note-form').reset();
  $('note-error').textContent='';
  $('note-name').value=record?noteDisplayTitle(record):'';
  $('note-body').value=record?.note??record?.original??'';
  $('note-kind').value=record?noteKind(record):'tip';
  $('note-dialog').showModal();
  $('note-name').focus();
 }

 $('open-curation').addEventListener('click',open);
 $('close-curation').addEventListener('click',()=>$('curation-dialog').close());
 $('curation-search').addEventListener('input',renderCuration);
 $('note-filters').addEventListener('click',event=>{
  const button=event.target.closest('[data-note-kind]');
  if(!button)return;
  archiveFilter=button.dataset.noteKind;
  renderCuration();
 });

 $('curation-dialog').addEventListener('click',event=>{
  const purge=event.target.closest('[data-trash-delete]'),purgeAll=event.target.closest('[data-trash-delete-all]');
  if(purge||purgeAll){
   event.preventDefault();
   const context=getContext();
   const ids=purgeAll?context.hiddenSources.filter(id=>!context.purgedSources.includes(id)):[purge.dataset.trashDelete];
   if(!ids.length)return;
   const previous={purgedSources:context.purgedSources,sourceEdits:context.sourceEdits,recipeGroupMeta:context.recipeGroupMeta,ratings:context.ratings,cookingHistory:context.cookingHistory};
   const remove=new Set(ids),nextGroupMeta={...context.recipeGroupMeta},nextRatings={...context.ratings},nextCookingHistory={...(context.cookingHistory||{})};
   for(const id of ids){delete nextGroupMeta[id];delete nextRatings[id];delete nextCookingHistory[id];}
   applyContext({
    purgedSources:[...new Set([...context.purgedSources,...ids])],
    sourceEdits:context.sourceEdits.filter(edit=>!remove.has(edit?.sourceId)),
    recipeGroupMeta:nextGroupMeta,
    ratings:nextRatings,
    cookingHistory:nextCookingHistory
   });
   if(!persist()){applyContext(previous);return;}
   render();
   renderCuration();
   toast(purgeAll?'삭제한 레시피 '+ids.length+'개를 완전 삭제했어요.':'레시피를 완전 삭제했어요.');
   return;
  }

  const context=getContext();
  const purgeVariant=event.target.closest('[data-trash-delete-variant]'),purgeVariantsAll=event.target.closest('[data-trash-delete-variant-all]');
  if(purgeVariant||purgeVariantsAll){
   event.preventDefault();
   const tokens=purgeVariantsAll?context.hiddenVariants.filter(key=>!(context.purgedVariants||[]).includes(key)):[purgeVariant.dataset.trashDeleteVariant];
   if(!tokens.length)return;
   const remove=new Set(tokens),builtInKeys=new Set(context.builtInRecipes.flatMap(recipe=>(recipe.variants||[]).map(variant=>recipe.id+'/'+variant.key)));
   const previous={hiddenVariants:context.hiddenVariants,purgedVariants:context.purgedVariants||[],sourceEdits:context.sourceEdits};
   applyContext({
    hiddenVariants:context.hiddenVariants.filter(key=>!remove.has(key)),
    purgedVariants:[...new Set([...(context.purgedVariants||[]),...tokens.filter(key=>builtInKeys.has(key))])],
    sourceEdits:context.sourceEdits.filter(edit=>!remove.has(edit.sourceId+'/'+edit.variantKey))
   });
   if(!persist()){applyContext(previous);return;}
   render();
   renderCuration();
   toast(purgeVariantsAll?'삭제한 인분·버전 '+tokens.length+'개를 완전 삭제했어요.':'인분·버전을 완전 삭제했어요.');
   return;
  }
  const editNote=event.target.closest('[data-edit-note]');
  if(editNote){
   openNote(context.curation.find(record=>`${record.source}-${record.index}`===editNote.dataset.editNote));
   return;
  }
  const unhide=event.target.closest('[data-unhide]');
  if(unhide){
   const previous=context.hiddenSources;
   applyContext({hiddenSources:previous.filter(id=>id!==unhide.dataset.unhide)});
   if(!persist()){applyContext({hiddenSources:previous});return;}
   render();
   renderCuration();
   toast('삭제한 레시피를 복원했어요.');
   return;
  }
  const unhideVariant=event.target.closest('[data-unhide-variant]');
  if(unhideVariant){
   const previous=context.hiddenVariants;
   applyContext({hiddenVariants:previous.filter(key=>key!==unhideVariant.dataset.unhideVariant)});
   if(!persist()){applyContext({hiddenVariants:previous});return;}
   render();
   renderCuration();
   toast('삭제한 인분·버전을 복원했어요.');
   return;
  }
  const use=event.target.closest('[data-archive]');
  if(use){
   const record=context.curation.find(item=>`${item.source}-${item.index}`===use.dataset.archive);
   if(!record)return;
   $('curation-dialog').close();
   recipeEditor.openFromArchive({...record,title:noteDisplayTitle(record)});
  }
 });

 $('add-note').addEventListener('click',()=>openNote());
 $('close-note').addEventListener('click',()=>$('note-dialog').close());
 $('note-name').addEventListener('input',()=>{noteTitleAuto=false;});
 $('note-body').addEventListener('input',()=>{
  if(!noteTitleAuto||!activeNote)return;
  $('note-name').value=noteDisplayTitle({...activeNote,displayTitle:undefined,note:$('note-body').value});
 });
 $('note-form').addEventListener('submit',event=>{
  event.preventDefault();
  try{
   const title=validText($('note-name').value,2000),body=$('note-body').value;
   validText(body,80000);
   if(!title||!body.trim())throw Error('제목과 내용을 입력해 주세요.');
   const context=getContext(),activeKey=noteKey(activeNote);
   if(activeNote){
    const currentNote=context.curation.find(item=>noteKey(item)===activeKey);
    if(!currentNote)throw Error('다른 기기에서 이 요리 노트가 삭제됐어요. 편집창을 닫고 최신 목록을 확인해 주세요.');
    if(noteSnapshot(currentNote)!==noteSnapshot(activeNote))throw Error('다른 기기에서 이 요리 노트가 변경됐어요. 편집창을 닫고 최신 내용을 확인한 뒤 다시 수정해 주세요.');
   }
   const record={...(activeNote||{source:'personal',index:Date.now(),line:0,title,original:body,status:'개인 노트',reason:'직접 작성한 요리 팁·참고 기록.'}),note:body,kind:$('note-kind').value};
   const normalizeTitle=value=>String(value??'').replace(/^\s*[•·]\s*/,'').trim().replace(/\s+/g,' ');
   const baselineTitle=activeNote?noteDisplayTitle(activeNote):'',autoTitle=activeNote?noteDisplayTitle({...activeNote,displayTitle:undefined,note:body}):'';
   const keepAutoTitle=record.source!=='personal'&&noteTitleAuto&&(normalizeTitle(title)===normalizeTitle(baselineTitle)||normalizeTitle(title)===normalizeTitle(autoTitle));
   if(keepAutoTitle)delete record.displayTitle;else record.displayTitle=title;
   record.modifiedAt=new Date().toISOString();
   const nextCuration=activeNote?context.curation.map(item=>noteKey(item)===activeKey?record:item):[...context.curation,record];
   const previous={curation:context.curation,curationOverride:context.curationOverride,curationLoaded:context.curationLoaded};
   applyContext({curation:nextCuration,curationOverride:nextCuration,curationLoaded:true});
   if(!persist()){
    applyContext(previous);
    throw Error('저장하지 못했어요. 내용을 복사해 보관해 주세요.');
   }
   $('note-dialog').close();
   renderCuration();
   window.dispatchEvent(new CustomEvent('mlk-notes-changed'));
   toast('요리 노트를 저장했어요. 전체 JSON·TXT 백업에도 포함돼요.');
  }catch(error){
   $('note-error').textContent=error.message;
  }
 });

 return {open,render:renderCuration,ensureArchive};
}
