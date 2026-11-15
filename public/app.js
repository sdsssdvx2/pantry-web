import {initialPantry,categories,efforts,recipes as seedRecipes,SEED_REVISION} from './data.js?v=20260919-6';
import {ratingHTML} from './ratings.js';
import {createRecipeModel} from './recipe-model.js?v=20261108-search-reuse-1';
import {installRecipeBrowserController} from './recipe-browser-controller.js?v=20261108-offthread-1';
import {installRecipeViewController} from './recipe-view-controller.js?v=20260919-6';
import {installRatingController} from './rating-controller.js';
import {installRecipeEditor} from './recipe-editor.js?v=20260919-10';
import {installStockEditor} from './stock-editor.js?v=20261018-2';
import {installPantryController} from './pantry-controller.js?v=20260919-8';
import {installCurationController} from './curation-controller.js?v=20260919-6';
import {installRecipeDialogController} from './recipe-dialog-controller.js?v=20260919-1';
import {canSaveKitchenState,readKitchenStateRaw} from './cloud-sync.js';
import {applyLegacyIngredientHistorySeed,buildKitchenSnapshot,loadKitchenState} from './kitchen-state.js?v=20261018-2';
import {latestCookedMap} from './cooking-history.js';
import {installPersistenceController} from './persistence-controller.js?v=20260919-2';
import {downloadBackupData} from './download-file.js?v=20260919-1';
import {installIngredientDraft} from './ingredient-draft.js?v=20261018-2';
let builtInRecipes=seedRecipes,restoredLibrary=null;
const $=id=>document.getElementById(id),STORAGE='my-little-kitchen-pantry-v1';
const escapeHTML=v=>String(v).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
let storageOK=true,migrated=false,compactedLibrary=false,unreadableState=null,historySeeded=false,pantryGroupsMigrated=false,recipeCategoriesMigrated=false;
function readState(){
 const loaded=loadKitchenState({readRaw:readKitchenStateRaw,initialPantry,seedRecipes,canSave:canSaveKitchenState(),backupLegacyRaw:raw=>localStorage.setItem(STORAGE+'-before-user-import',raw)});
 builtInRecipes=loaded.builtInRecipes;restoredLibrary=loaded.restoredLibrary;compactedLibrary=loaded.compactedLibrary;unreadableState=loaded.unreadableState;
 if(!loaded.storageOK)storageOK=false;if(loaded.migrated)migrated=true;if(loaded.pantryGroupsMigrated)pantryGroupsMigrated=true;if(loaded.recipeCategoriesMigrated)recipeCategoriesMigrated=true;
 return loaded.state;
}
let state=readState(),pantry=state.items,customRecipes=state.custom,stockOverrides=state.stock,ingredientHistory=state.history||[],ingredientDetectionRules=state.ingredientDetectionRules||[],historySeedVersion=state.historySeedVersion||0,pantryGroupVersion=state.pantryGroupVersion||1,recipeCategoryVersion=state.recipeCategoryVersion||1,sourceEdits=state.edits,recipeGroupMeta=state.recipeGroupMeta||{},hiddenSources=state.hidden,hiddenVariants=state.hiddenVariants||[],purgedVariants=state.trashPurgedVariants||[],purgedSources=state.trashPurged||[],ratings=state.ratings,cookingHistory=state.cookingHistory||{},lastCooked=state.lastCooked||latestCookedMap(cookingHistory),curationOverride=state.curation??null;
const seededHistory=applyLegacyIngredientHistorySeed({pantry,stockOverrides,ingredientHistory,historySeedVersion});
({pantry,stockOverrides,ingredientHistory,historySeedVersion}=seededHistory);historySeeded=seededHistory.changed;
let filters={categories:{},effort:'all',availability:'ready',sort:'recent',query:'',rating:'all',searchBody:false};
let selectedVariants={},activeRecipe=null,toastTimer=null,curation=curationOverride??restoredLibrary?.curation??[],curationLoaded=curationOverride!==null||!!restoredLibrary?.curation;
function applyKitchenStateFields(next,nextCustomRecipes){
 pantry=next.items;customRecipes=nextCustomRecipes;stockOverrides=next.stock;ingredientHistory=next.history||[];ingredientDetectionRules=next.ingredientDetectionRules||[];historySeedVersion=next.historySeedVersion||0;pantryGroupVersion=next.pantryGroupVersion||1;recipeCategoryVersion=next.recipeCategoryVersion||1;sourceEdits=next.edits;recipeGroupMeta=next.recipeGroupMeta||{};hiddenSources=next.hidden;hiddenVariants=next.hiddenVariants||[];purgedVariants=next.trashPurgedVariants||[];purgedSources=next.trashPurged||[];ratings=next.ratings;cookingHistory=next.cookingHistory||{};lastCooked=next.lastCooked||latestCookedMap(cookingHistory);curationOverride=next.curation??null;
}
function refreshCurationState(){
 curation=curationOverride??restoredLibrary?.curation??[];
 curationLoaded=curationOverride!==null||!!restoredLibrary?.curation;
}
const categoryName=id=>categories.find(c=>c[0]===id)?.[1]||'',effortName=id=>efforts.find(c=>c[0]===String(id))?.[1]||'';
const categoryIconPaths={
 noodles:'<path d="M3 13h18a9 7 0 0 1-18 0Z"/><path d="M5 4h14"/><path d="M7.5 5c-2 1.1 2 2.2 0 3.4s2 2.3 0 3.6m4.5-7c-2 1.1 2 2.2 0 3.4s2 2.3 0 3.6m4.5-7c-2 1.1 2 2.2 0 3.4s2 2.3 0 3.6"/>',
 rice:'<path d="M4 12h16c-.6 4.4-3.5 7-8 7s-7.4-2.6-8-7Z"/><path d="M5 12c.1-1.4 1-2.4 2.3-2.8.2-1.4 1.4-2.2 2.7-2 1-1.3 3.1-1.3 4.2.1 1.5-.2 2.7.8 2.9 2.3 1.4.3 2.3 1.3 2.4 2.4"/><path d="M9 19v2h6v-2"/>',
 bread:'<path d="M2.5 12c0-2.9 3.8-4.9 9.5-4.9s9.5 2 9.5 4.9-3.8 4.9-9.5 4.9S2.5 14.9 2.5 12Z"/><path d="M7 10.3l1.7 1.2m2.2-1.8 1.7 1.2m2.2-1.5 1.7 1.2"/>',
 main:'<ellipse cx="12" cy="12.7" rx="9.5" ry="6.3"/><path d="M4.5 12.7c2.5-3.1 6.8-3.8 10.3-1l3.5-2.3V16l-3.5-2.3c-3.5 2.8-7.8 2.1-10.3-1Z"/><circle cx="7.7" cy="12" r=".65" fill="currentColor" stroke="none"/>',
 soup:'<path d="M3 11h18a9 9 0 0 1-18 0Z"/><path d="M7 7V3m5 4V3m5 4V3"/>',
 side:'<path d="M3.5 16h17c-.8 3-3.9 4.5-8.5 4.5S4.3 19 3.5 16Z"/><path d="M8 15v-3.5m0 0c-2.2 0-3.2-1.4-3.2-3.2 2.2 0 3.2 1.4 3.2 3.2Zm0 0c0-2.5 1.5-4 3.8-4 0 2.5-1.5 4-3.8 4Zm5.5 3.5c0-3.4 2-5.2 5-5.4-.1 3.2-2 5-5 5.4Zm0 0-2.2-2.8"/>',
 snack:'<path d="M4 14h16l-1.5 6h-13L4 14Z"/><path d="M6 13 9 6l3 7m-1 0 3-8 3 8m-2 0 3-5 2 5"/>',
 sauce:'<path d="M5 15h14c-.7 3.2-3.3 5-7 5s-6.3-1.8-7-5Z"/><path d="M6.5 14c.8-2.8 2.8-4.6 5.1-5.2.9-.2 1.6-1 1.5-2 2.1 1 3.7 2.7 4 4.5.3 1.6-.7 2.7-2.1 2.7-1.3 0-2.2-.9-1.8-1.8.4-.9 1.6-1.1 2.7-.4"/>',
 drink:'<path d="M6 7h12l-1 14H7ZM13 7l2-5h4"/>'
};
const icon=c=>`<svg viewBox="0 0 24 24" data-category="${c}" aria-hidden="true">${categoryIconPaths[c]||categoryIconPaths.main}</svg>`;
const clock='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></svg>';
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),4500);}
const snapshot=()=>buildKitchenSnapshot({seedRevision:SEED_REVISION,pantry,customRecipes,stockOverrides,ingredientHistory,ingredientDetectionRules,historySeedVersion,pantryGroupVersion,recipeCategoryVersion,sourceEdits,recipeGroupMeta,hiddenSources,hiddenVariants,purgedVariants,purgedSources,ratings,cookingHistory,curationOverride,restoredLibrary});
const persistenceController=installPersistenceController({getSnapshot:snapshot,getUnreadableState:()=>unreadableState,getStorageOK:()=>storageOK,setStorageOK:value=>{storageOK=!!value;},toast});
const {persist,updateStorageState}=persistenceController;
installIngredientDraft({
 getRules:()=>ingredientDetectionRules,
 saveRules:next=>{
  const previous=ingredientDetectionRules;
  ingredientDetectionRules=next;
  if(!persist()){ingredientDetectionRules=previous;return {ok:false,error:'브라우저에 자동 감지 설정을 저장하지 못했어요.'};}
  // The same rules feed nutrition calculations and recipe-card summaries.
  // Reflect a saved edit immediately, without reloading or editing recipes.
  recipeEditor.refreshNutrition();
  renderRecipeList();
  return {ok:true};
 },
 toast
});
const recipeModel=createRecipeModel(()=>({builtInRecipes,customRecipes,sourceEdits,recipeGroupMeta,hiddenSources,hiddenVariants,purgedVariants,ratings,pantry,stockOverrides,cookingHistory,selectedVariants,filters}));
const {allRecipes,isGroupedRecipe,evaluate,evaluationSnapshot,filteredBase,visibleRecipes}=recipeModel;
let recipeBrowser;
const renderRecipeList=()=>recipeBrowser.renderRecipes();
const recipeView=installRecipeViewController({
 getContext:()=>({activeRecipe,builtInRecipes,customRecipes,sourceEdits,hiddenSources,pantry,stockOverrides,ingredientHistory,ingredientDetectionRules,cookingHistory,lastCooked}),
 applyContext:next=>{if(Object.hasOwn(next,'activeRecipe'))activeRecipe=next.activeRecipe;},
 allRecipes,evaluate,evaluationSnapshot,toast,escapeHTML,effortName,clock,ratingHTML,canRecordCooked:canSaveKitchenState
});
const ratingController=installRatingController({
 getContext:()=>({ratings,activeRecipe}),
 applyContext:next=>{if(Object.hasOwn(next,'ratings'))ratings=next.ratings;},
 allRecipes,persist,renderRecipes:renderRecipeList,active:recipeView.active,toast,escapeHTML
});
const recipeEditor=installRecipeEditor({
 getContext:()=>({builtInRecipes,customRecipes,sourceEdits,recipeGroupMeta,hiddenSources,hiddenVariants,filters,selectedVariants,pantry,stockOverrides,ingredientHistory,ingredientDetectionRules}),
 applyContext:next=>{if(Object.hasOwn(next,'customRecipes'))customRecipes=next.customRecipes;if(Object.hasOwn(next,'sourceEdits'))sourceEdits=next.sourceEdits;if(Object.hasOwn(next,'recipeGroupMeta'))recipeGroupMeta=next.recipeGroupMeta;if(Object.hasOwn(next,'filters'))filters=next.filters;if(Object.hasOwn(next,'selectedVariants'))selectedVariants=next.selectedVariants;},
 persist,render:renderRecipeList,showRecipe:recipeView.showRecipe,toast,isGroupedRecipe
});
const stockEditor=installStockEditor({
 getContext:()=>({pantry,stockOverrides,ingredientHistory,ingredientDetectionRules}),
 applyContext:next=>{if(Object.hasOwn(next,'pantry'))pantry=next.pantry;if(Object.hasOwn(next,'stockOverrides'))stockOverrides=next.stockOverrides;if(Object.hasOwn(next,'ingredientHistory'))ingredientHistory=next.ingredientHistory;if(Object.hasOwn(next,'ingredientDetectionRules'))ingredientDetectionRules=next.ingredientDetectionRules;},
 persist,render,toast
});
const pantryController=installPantryController({
 getContext:()=>({pantry,stockOverrides,ingredientHistory,ingredientDetectionRules,sourceEdits}),
 applyContext:next=>{if(Object.hasOwn(next,'pantry'))pantry=next.pantry;if(Object.hasOwn(next,'stockOverrides'))stockOverrides=next.stockOverrides;if(Object.hasOwn(next,'ingredientHistory'))ingredientHistory=next.ingredientHistory;},
 allRecipes,stockEditor,persist,renderApp:render,updateStorageState,toast
});
recipeBrowser=installRecipeBrowserController({
 getContext:()=>({filters,selectedVariants,pantry,stockOverrides,ingredientHistory,ingredientDetectionRules,sourceEdits,cookingHistory,lastCooked}),
 applyContext:next=>{if(Object.hasOwn(next,'filters'))filters=next.filters;if(Object.hasOwn(next,'selectedVariants'))selectedVariants=next.selectedVariants;},
 allRecipes,evaluate,evaluationSnapshot,filteredBase,visibleRecipes,refreshRelated:recipeView.refreshRelated,relatedIds:recipeView.relatedIds,
 showRecipe:recipeView.showRecipe,copyRecipeToClipboard:recipeView.copyRecipeToClipboard,saveRating:ratingController.saveRating,openPantry:pantryController.open,escapeHTML,categoryName,effortName,icon,clock
});
const curationController=installCurationController({
 getContext:()=>({curation,curationLoaded,curationOverride,hiddenSources,purgedSources,purgedVariants,sourceEdits,recipeGroupMeta,ratings,hiddenVariants,builtInRecipes,cookingHistory,lastCooked}),
 applyContext:next=>{
  if(Object.hasOwn(next,'curation'))curation=next.curation;
  if(Object.hasOwn(next,'curationLoaded'))curationLoaded=next.curationLoaded;
  if(Object.hasOwn(next,'curationOverride'))curationOverride=next.curationOverride;
  if(Object.hasOwn(next,'hiddenSources'))hiddenSources=next.hiddenSources;
  if(Object.hasOwn(next,'purgedSources'))purgedSources=next.purgedSources;
  if(Object.hasOwn(next,'sourceEdits'))sourceEdits=next.sourceEdits;
  if(Object.hasOwn(next,'recipeGroupMeta'))recipeGroupMeta=next.recipeGroupMeta;
  if(Object.hasOwn(next,'ratings'))ratings=next.ratings;
  if(Object.hasOwn(next,'hiddenVariants'))hiddenVariants=next.hiddenVariants;
  if(Object.hasOwn(next,'purgedVariants'))purgedVariants=next.purgedVariants;
  if(Object.hasOwn(next,'cookingHistory')){cookingHistory=next.cookingHistory;lastCooked=latestCookedMap(cookingHistory);}
  if(Object.hasOwn(next,'lastCooked'))lastCooked=next.lastCooked;
 },
 persist,render:renderRecipeList,recipeEditor,toast
});
installRecipeDialogController({
 getContext:()=>({activeRecipe,selectedVariants,customRecipes,ratings,sourceEdits,recipeGroupMeta,hiddenSources,hiddenVariants,cookingHistory,lastCooked}),
 applyContext:next=>{
  if(Object.hasOwn(next,'selectedVariants'))selectedVariants=next.selectedVariants;
  if(Object.hasOwn(next,'customRecipes'))customRecipes=next.customRecipes;
  if(Object.hasOwn(next,'ratings'))ratings=next.ratings;
  if(Object.hasOwn(next,'sourceEdits'))sourceEdits=next.sourceEdits;
  if(Object.hasOwn(next,'recipeGroupMeta'))recipeGroupMeta=next.recipeGroupMeta;
  if(Object.hasOwn(next,'hiddenSources'))hiddenSources=next.hiddenSources;
  if(Object.hasOwn(next,'hiddenVariants'))hiddenVariants=next.hiddenVariants;
  if(Object.hasOwn(next,'cookingHistory')){cookingHistory=next.cookingHistory;lastCooked=latestCookedMap(cookingHistory);}
  if(Object.hasOwn(next,'lastCooked'))lastCooked=next.lastCooked;
 },
 active:recipeView.active,showRecipe:recipeView.showRecipe,showCookMode:recipeView.showCookMode,closeRecipe:recipeView.closeRecipe,copyRecipeToClipboard:recipeView.copyRecipeToClipboard,recipeEditor,persist,render:renderRecipeList,renderRecipes:renderRecipeList,saveRating:ratingController.saveRating,toast,canRecordCooked:canSaveKitchenState
});
function render(){
 const recipeOpen=!!($('recipe-dialog')?.open&&activeRecipe),recipeScroll=recipeOpen?$('recipe-dialog').scrollTop:0;
 pantryController.render();recipeBrowser.renderRecipes();
 if(recipeOpen){recipeView.showRecipe(activeRecipe,false,true);$('recipe-dialog').scrollTop=recipeScroll;}
}
function applyRestoredKitchen(next,replace){
 unreadableState=null;storageOK=true;
 restoredLibrary=next.library||null;builtInRecipes=restoredLibrary?.recipes||seedRecipes;
 applyKitchenStateFields(next,next.recipes);refreshCurationState();selectedVariants={};
 render();toast(replace?'백업의 재료·메모·레시피·별점·최근 조리 기록을 복원했어요.':'새 항목을 추가했어요. 기존 항목의 내용은 유지했어요.');
}
const downloadLegacyBackup=canSaveKitchenState()?downloadBackupData:null;
if(canSaveKitchenState()){
 const refreshButton=document.getElementById('open-recipe-refresh');let refreshReady=false,refreshLoading=false;
 if(refreshButton)refreshButton.hidden=false;
 refreshButton?.addEventListener('click',async()=>{
  if(refreshReady||refreshLoading)return;refreshLoading=true;
  try{const {installRecipeRefresh}=await import('./recipe-refresh-ui.js');
   installRecipeRefresh({getContext:()=>({builtInRecipes,customRecipes,sourceEdits,recipeGroupMeta,hiddenSources,hiddenVariants,purgedVariants,ratings,pantry,stockOverrides,selectedVariants}),applyContext:next=>{customRecipes=next.customRecipes;sourceEdits=next.sourceEdits;},persist,render,snapshot,toast});
   refreshReady=true;refreshButton.click();
  }catch{toast('레시피 정비 도구를 불러오지 못했어요. 다시 시도해 주세요.');}finally{refreshLoading=false;}
 });
 let backupUIReady=false,backupUIPromise=null;
 const backupButton=$('open-recipe-backup');
 backupButton?.addEventListener('click',()=>{
  if(backupUIReady||backupUIPromise)return;
  backupUIPromise=import('./backup-ui.js?v=20260919-9').then(({installBackupUI})=>{
   installBackupUI({
    getContext:()=>({unreadableState,pantry,stockOverrides,builtInRecipes,customRecipes,sourceEdits,hiddenSources,ratings,cookingHistory,lastCooked,curation,snapshot:snapshot(),restoredLibrary}),
    ensureArchive:curationController.ensureArchive,applyRestore:applyRestoredKitchen,toast,updateStorageState
   });
   backupUIReady=true;backupButton.click();
  }).catch(error=>{
   backupUIPromise=null;
   const message=$('backup-error');
   if(message)message.textContent='백업·복원 도구를 불러오지 못했어요. 다시 열어 시도해 주세요.';
   console.error(error);
  });
 });
}
window.addEventListener('mlk-state-applied',e=>{state=readState();applyKitchenStateFields(state,state.custom);refreshCurationState();const recipeWasOpen=!!($('recipe-dialog')?.open&&activeRecipe);render();if($('curation-dialog')?.open)curationController.render();if(recipeWasOpen&&!recipeView.active())recipeView.closeRecipe();const source=e.detail?.source;if(source==='tab')toast('다른 탭의 변경을 반영했어요.');else if(source==='server')toast('다른 기기의 최신 변경을 반영했어요.');else if(source==='merge')toast('다른 항목의 변경을 함께 반영했어요.');});
// Editors close only with their explicit controls. Dragging outside cannot discard input.
for(const id of ['recipe-dialog','curation-dialog','backup-dialog'])$(id).addEventListener('click',e=>{if(e.target!==$(id))return;const r=$(id).getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$(id).close();});
if(canSaveKitchenState()&&(compactedLibrary||historySeeded||pantryGroupsMigrated||recipeCategoriesMigrated)){persist();}if(migrated&&downloadLegacyBackup){persist();$('migration-notice').hidden=false;$('migration-notice').innerHTML='보내주신 재고·레시피로 갱신했어요. 직접 작성한 레시피는 유지했고, 이전 목록은 이 브라우저에 백업해 두었어요. <button id="export-before-import" class="text-button">이전 목록 백업 받기</button>';$('export-before-import').addEventListener('click',()=>{try{downloadLegacyBackup(JSON.parse(localStorage.getItem(STORAGE+'-before-user-import')),'my-kitchen-before-user-import.json');}catch{toast('이전 백업을 읽을 수 없어요.');}});}
recipeBrowser.renderFilterButtons();render();