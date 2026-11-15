import {ratingHTML,previewRating,installRatingInputs} from './ratings.js';

const $=id=>document.getElementById(id);

export function installRatingController({getContext,applyContext,allRecipes,persist,renderRecipes,active,toast,escapeHTML}){
 function saveRating(widget,value){
  const id=widget.dataset.ratingId,scope=widget.closest('#recipe-dialog')?'dialog-content':'recipe-grid';
  if(!allRecipes().some(recipe=>recipe.id===id))return;
  const {ratings,activeRecipe}=getContext(),previous=ratings,next={...ratings};
  if(value)next[id]=value;else delete next[id];
  applyContext({ratings:next});
  if(!persist()){
   applyContext({ratings:previous});
   previewRating(widget,previous[id]||0);
   return;
  }
  renderRecipes();
  if($('recipe-dialog').open&&activeRecipe===id){
   const recipe=active();
   if(recipe)$('dialog-content').querySelector('.recipe-rating').outerHTML=ratingHTML(id,recipe.name,value,escapeHTML);
  }
  const target=$(scope).querySelector(`[data-rating-id="${id}"] [data-rating-value="${value||0.5}"]`);
  if(target)target.focus({preventScroll:true});
  else if(scope==='recipe-grid')$('rating-filters').querySelector('[aria-pressed="true"]')?.focus({preventScroll:true});
  toast(value?`${value}점을 저장했어요.`:'별점을 지웠어요.');
 }

 installRatingInputs([$('recipe-dialog')],saveRating);
 return {saveRating};
}
