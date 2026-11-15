import {handleRatingClick} from './ratings.js';
import {variantStateKey} from './state-validation.js?v=20260919-5';
import {addCookingRecord,removeCookingRecord,replaceCookingRecord} from './cooking-history.js';

const $=id=>document.getElementById(id);

export function installRecipeDialogController({getContext,applyContext,active,showRecipe,showCookMode,closeRecipe,copyRecipeToClipboard,recipeEditor,persist,render,renderRecipes,saveRating,toast,canRecordCooked=()=>false}){
 const dialog=$('recipe-dialog');

 dialog.addEventListener('change',event=>{
  const editedCooked=event.target.closest?.('[data-edit-cooked]');
  if(editedCooked){
   if(!canRecordCooked())return;
   const recipe=active();if(!recipe)return;
   const value=editedCooked.value,parsed=new Date(value);
   if(!value||!Number.isFinite(parsed.getTime())||parsed.getTime()>Date.now()+60000){
    toast('먹은 날짜는 현재 시각 이전으로 입력해 주세요.');
    showRecipe(recipe.id,false,true);
    dialog.querySelector('.cooking-history-details')?.setAttribute('open','');
    return;
   }
   const context=getContext(),previous=context.cookingHistory||{};
   const next=replaceCookingRecord(previous,recipe.id,editedCooked.dataset.editCooked,parsed.toISOString());
   applyContext({cookingHistory:next});
   if(!persist()){applyContext({cookingHistory:previous});return;}
   showRecipe(recipe.id,false,true);renderRecipes();
   dialog.querySelector('.cooking-history-details')?.setAttribute('open','');
   toast('먹은 날짜를 수정했어요.');
   return;
  }
  if(event.target.id!=='recipe-variant')return;
  const context=getContext();
  applyContext({selectedVariants:{...context.selectedVariants,[context.activeRecipe]:event.target.value}});
  showRecipe(context.activeRecipe,false,true);
  renderRecipes();
 });

 dialog.addEventListener('click',async event=>{
  if(handleRatingClick(event,saveRating))return;

  const linked=event.target.closest('[data-related]');
  if(linked){
   showRecipe(linked.dataset.related,false,true);
   $('close-dialog').focus();
   dialog.scrollTop=0;
   return;
  }

  const recipe=active();
  if(!recipe)return;

  if(event.target.closest('#close-cook-mode')){
   showRecipe(recipe.id,false,true);
   dialog.scrollTop=0;
   $('open-cook-mode')?.focus();
   return;
  }
  if(event.target.closest('#open-cook-mode')){showCookMode();return;}
  if(event.target.closest('#close-dialog'))closeRecipe();
  if(event.target.closest('#copy-recipe'))await copyRecipeToClipboard(recipe);
  const cookModeRecord=event.target.closest('#mark-cooked-cook');
  if(cookModeRecord){
   if(!canRecordCooked())return;
   const context=getContext(),previous=context.cookingHistory||{},next=addCookingRecord(previous,recipe.id);
   applyContext({cookingHistory:next});
   if(!persist()){applyContext({cookingHistory:previous});return;}
   renderRecipes();
   cookModeRecord.disabled=true;
   cookModeRecord.textContent='✓ 방금 기록됨';
   toast('이 메뉴를 방금 먹은 것으로 기록했어요.');
   return;
  }
  if(event.target.closest('#mark-cooked')){
   if(!canRecordCooked())return;
   const context=getContext(),previous=context.cookingHistory||{},next=addCookingRecord(previous,recipe.id);
   applyContext({cookingHistory:next});
   if(!persist()){applyContext({cookingHistory:previous});return;}
   showRecipe(recipe.id,false,true);renderRecipes();
   $('mark-cooked')?.focus();
   toast('이 메뉴를 방금 먹은 것으로 기록했어요.');
   return;
  }
  if(event.target.closest('#add-cooked-record')){
   if(!canRecordCooked())return;
   const input=$('cooking-history-new'),parsed=new Date(input?.value||'');
   if(!input?.value||!Number.isFinite(parsed.getTime())||parsed.getTime()>Date.now()+60000){
    toast('추가할 먹은 날짜를 현재 시각 이전으로 선택해 주세요.');
    input?.focus();
    return;
   }
   const context=getContext(),previous=context.cookingHistory||{},next=addCookingRecord(previous,recipe.id,parsed.toISOString());
   applyContext({cookingHistory:next});
   if(!persist()){applyContext({cookingHistory:previous});return;}
   showRecipe(recipe.id,false,true);renderRecipes();
   dialog.querySelector('.cooking-history-details')?.setAttribute('open','');
   $('cooking-history-new')?.focus();
   toast('과거 먹은 기록을 추가했어요.');
   return;
  }
  const removeCooked=event.target.closest('[data-remove-cooked]');
  if(removeCooked){
   if(!canRecordCooked())return;
   const context=getContext(),previous=context.cookingHistory||{},next=removeCookingRecord(previous,recipe.id,removeCooked.dataset.removeCooked);
   applyContext({cookingHistory:next});
   if(!persist()){applyContext({cookingHistory:previous});return;}
   showRecipe(recipe.id,false,true);renderRecipes();
   toast('선택한 먹은 기록을 지웠어요.');
   return;
  }
  if(event.target.closest('#clear-cooked')){
   if(!canRecordCooked())return;
   const context=getContext(),previous=context.cookingHistory||{},latest=previous?.[recipe.id]?.[0]||context.lastCooked?.[recipe.id]||'';
   const next=latest?removeCookingRecord(previous,recipe.id,latest):previous;
   applyContext({cookingHistory:next});
   if(!persist()){applyContext({cookingHistory:previous});return;}
   showRecipe(recipe.id,false,true);renderRecipes();
   $('mark-cooked')?.focus();
   toast('가장 최근 먹은 기록을 취소했어요.');
   return;
  }
  if(event.target.closest('#add-recipe-version')){closeRecipe();recipeEditor.open(recipe,false,true);return;}
  if(event.target.closest('#edit-recipe')){closeRecipe();recipeEditor.open(recipe);return;}
  if(event.target.closest('#duplicate-recipe')){closeRecipe();recipeEditor.open(recipe,true);return;}

  const removeCustom=event.target.closest('#delete-recipe');
  if(removeCustom){
   if(removeCustom.dataset.confirm!=='yes'){
    removeCustom.dataset.confirm='yes';
    removeCustom.textContent='한 번 더 눌러 삭제';
    return;
   }
   const context=getContext();
   const previous={customRecipes:context.customRecipes,ratings:context.ratings,sourceEdits:context.sourceEdits,recipeGroupMeta:context.recipeGroupMeta,cookingHistory:context.cookingHistory};
   const nextGroupMeta={...context.recipeGroupMeta};delete nextGroupMeta[recipe.id];
   const nextRatings={...context.ratings};delete nextRatings[recipe.id];
   const nextCookingHistory={...(context.cookingHistory||{})};delete nextCookingHistory[recipe.id];
   applyContext({
    customRecipes:context.customRecipes.filter(item=>item.id!==recipe.id),
    sourceEdits:context.sourceEdits.filter(edit=>edit.sourceId!==recipe.id),
    recipeGroupMeta:nextGroupMeta,
    ratings:nextRatings,
    cookingHistory:nextCookingHistory
   });
   if(!persist()){applyContext(previous);return;}
   closeRecipe();
   render();
   toast('내 레시피를 삭제했어요.');
   return;
  }

  if(event.target.closest('#hide-recipe')){
   const context=getContext(),previous=context.hiddenSources;
   applyContext({hiddenSources:[...new Set([...context.hiddenSources,recipe.id])]});
   if(!persist()){applyContext({hiddenSources:previous});return;}
   closeRecipe();
   render();
   toast('레시피를 삭제했어요. 요리 노트·레시피 정리에서 다시 복원할 수 있어요.');
   return;
  }

  const hideVariant=event.target.closest('#hide-recipe-variant');
  if(hideVariant){
   if(hideVariant.dataset.confirm!=='yes'){
    hideVariant.dataset.confirm='yes';
    hideVariant.textContent='한 번 더 눌러 이 버전 삭제';
    return;
   }
   const context=getContext();
   if(recipe.custom&&!recipe.source&&recipe.variantKey==='base'){
    const replacement=(recipe.variants||[]).find(variant=>variant.key!=='base');
    const promoted=context.sourceEdits.find(edit=>edit.sourceId===recipe.id&&edit.variantKey===replacement?.key&&edit.label);
    if(!promoted){toast('남길 다른 인분·버전을 찾지 못했어요.');return;}
    const previous={customRecipes:context.customRecipes,sourceEdits:context.sourceEdits,selectedVariants:context.selectedVariants};
    const nextCustom=context.customRecipes.map(item=>item.id===recipe.id?{...promoted.recipe,id:recipe.id,custom:true}:item);
    const nextEdits=context.sourceEdits.filter(edit=>!(edit.sourceId===recipe.id&&edit.variantKey===promoted.variantKey));
    const selectedVariants={...(context.selectedVariants||{})};delete selectedVariants[recipe.id];
    applyContext({customRecipes:nextCustom,sourceEdits:nextEdits,selectedVariants});
    if(!persist()){applyContext(previous);return;}
    showRecipe(recipe.id,false,true);
    renderRecipes();
    toast('선택한 기본 인분·버전을 삭제하고 다음 버전을 기본으로 바꿨어요.');
    return;
   }
   const key=variantStateKey(recipe.id,recipe.variantKey),previous=context.hiddenVariants;
   applyContext({hiddenVariants:[...new Set([...context.hiddenVariants,key])]});
   if(!persist()){applyContext({hiddenVariants:previous});return;}
   const selectedVariants={...getContext().selectedVariants};delete selectedVariants[recipe.id];
   applyContext({selectedVariants});
   showRecipe(recipe.id,false,true);
   renderRecipes();
   toast('선택한 인분·버전만 삭제했어요. 요리 노트·레시피 정리에서 복원할 수 있어요.');
   return;
  }

  const reset=event.target.closest('#reset-source-edit');
  if(reset){
   if(reset.dataset.confirm!=='yes'){
    reset.dataset.confirm='yes';
    reset.textContent=recipe.original?'한 번 더 눌러 원문 복원':'한 번 더 눌러 버전 삭제';
    return;
   }
   const context=getContext(),previous=context.sourceEdits;
   applyContext({sourceEdits:context.sourceEdits.filter(edit=>!(edit.sourceId===recipe.id&&edit.variantKey===recipe.variantKey))});
   if(!persist()){applyContext({sourceEdits:previous});return;}
   showRecipe(recipe.id);
   renderRecipes();
  }
 });

 return {dialog};
}
