import {recipeNutritionResult,nutritionSummaryHTML} from './nutrition-ui.js';
import {cookingBody,recipeCopyText,recipeDetailHTML,cookModeHTML} from './recipe-display.js?v=20260919-4';
import {getStock,matchIngredient} from './data.js?v=20260919-6';
import {copyText} from './clipboard.js';

const $=id=>document.getElementById(id);

export function installRecipeViewController({getContext,applyContext,allRecipes,evaluate,evaluationSnapshot,toast,escapeHTML,effortName,clock,ratingHTML,canRecordCooked=()=>false}){
 let relatedIndex=new Map(),relatedSource=null,lastFocus=null;

 function refreshRelated(evaluated=evaluationSnapshot().evaluated){
  if(evaluated===relatedSource)return;
  relatedSource=evaluated;
  relatedIndex=new Map();
  const visibleIds=new Set(evaluated.map(recipe=>recipe.id));
  const add=(a,b)=>{if(a===b)return;if(!relatedIndex.has(a))relatedIndex.set(a,new Set());relatedIndex.get(a).add(b);};
  for(const recipe of evaluated)for(const id of recipe.related||[])if(visibleIds.has(id)){add(recipe.id,id);add(id,recipe.id);}
 }

 function relatedIds(recipe){return [...(relatedIndex.get(recipe.id)||[])];}

 function recipeContextHTML(recipe){
  const {builtInRecipes,customRecipes}=getContext();
  const links=relatedIds(recipe).map(id=>{
   const base=[...builtInRecipes,...customRecipes].find(item=>item.id===id);
   return base?`<button class="outline-button" data-related="${id}">${escapeHTML(evaluate(base).name)}</button>`:'';
  }).filter(Boolean).join('');
  return `${recipe.pairing?`<section class="recipe-context"><h3>추천 음료·곁들임</h3><p>${escapeHTML(recipe.pairing).replace(/\n/g,'<br>')}</p></section>`:''}${recipe.servingNote||links?`<section class="recipe-context meal-context"><h3>${links?'함께 만드는 한 끼':'조리·구성 메모'}</h3>${recipe.servingNote?`<p>${escapeHTML(recipe.servingNote).replace(/\n/g,'<br>')}</p>`:''}<div class="related-links">${links}</div></section>`:''}`;
 }

 function active(){
  const {activeRecipe}=getContext();
  const base=allRecipes().find(recipe=>recipe.id===activeRecipe);
  return base?evaluate(base):null;
 }

 function recipeRawBody(recipe){
  const {sourceEdits}=getContext();
  const edited=sourceEdits.some(edit=>edit.sourceId===recipe.id&&edit.variantKey===recipe.variantKey);
  return recipe.source&&!edited?recipe.original:recipe.steps.join('\n');
 }

 function recipeRelatedNames(recipe){
  const {builtInRecipes,customRecipes}=getContext();
  return relatedIds(recipe).map(id=>{
   const base=[...builtInRecipes,...customRecipes].find(item=>item.id===id);
   return base?evaluate(base).name:'';
  }).filter(Boolean);
 }

 function recipeCookingText(recipe){
  const {sourceEdits}=getContext();
  const edit=sourceEdits.find(item=>item.sourceId===recipe.id&&item.variantKey===recipe.variantKey);
  return cookingBody(recipe.source?(edit?recipe.steps.join('\n'):recipe.original):recipe.steps.join('\n'),recipe);
 }

 async function copyRecipeToClipboard(recipe){
  const ok=await copyText(recipeCopyText(recipe,recipeRawBody(recipe),recipeRelatedNames(recipe)));
  toast(ok?'레시피를 복사했어요.':'텍스트를 선택해서 복사해 주세요.');
  return ok;
 }

 function showRecipe(id,random=false,keepFocus=false){
  const base=allRecipes().find(recipe=>recipe.id===id);if(!base)return;
  refreshRelated();
  applyContext({activeRecipe:id});
  const recipe=evaluate(base),{sourceEdits,pantry,stockOverrides,cookingHistory={},lastCooked={}}=getContext();
  if(!keepFocus)lastFocus=document.activeElement;
  const edit=sourceEdits.find(item=>item.sourceId===id&&item.variantKey===recipe.variantKey),text=recipeCookingText(recipe);
  const productNotes=recipe.matches.filter(match=>match.available&&match.actual&&getStock(match.actual,stockOverrides).notes.length).map(match=>({name:match.actual,note:getStock(match.actual,stockOverrides).notes.join('\n')}));
  const optionalAvailability=recipe.optional.map(name=>({name,available:matchIngredient(name,pantry,stockOverrides,recipe).available}));
  $('dialog-content').classList.remove('cook-mode-body');
  const nutritionPending='<div class="recipe-nutrition-pending" data-recipe-nutrition-pending role="status">영양정보 계산 중…</div>';
  $('dialog-content').innerHTML=recipeDetailHTML({recipe,base,random,nutritionHTML:nutritionPending,edited:!!edit,cookingText:text,productNotes,contextHTML:recipeContextHTML(recipe),clockHTML:clock,effortLabel:effortName(recipe.effort),optionalAvailability,ratingMarkup:ratingHTML(recipe.id,recipe.name,recipe.rating,escapeHTML),lastCookedAt:lastCooked[recipe.id]||'',cookingHistory:cookingHistory[recipe.id]||[],canRecordCooked:!!canRecordCooked()});
  if(!$('recipe-dialog').open)$('recipe-dialog').showModal();
  if(!keepFocus)$('close-dialog').focus();else $('recipe-variant')?.focus();
  // Paint the requested recipe details immediately. A full nutrition resolve
  // is intentionally deferred until after that first paint; stale dialog DOM
  // cannot be updated when the user switches recipes, opens cook mode or closes.
  const pending=$('dialog-content').querySelector('[data-recipe-nutrition-pending]');
  requestAnimationFrame(()=>setTimeout(()=>{
   if(!pending?.isConnected||!$('recipe-dialog').open)return;
   try{pending.outerHTML=nutritionSummaryHTML(recipeNutritionResult(recipe,text,getContext()));}
   catch{pending.textContent='영양정보를 계산하지 못했어요. 재료·분량을 확인해 주세요.';}
  },0));
 }

 let cookFontSize=19;
 try{const saved=Number(localStorage.getItem('mlk-cook-font-size'));if(saved>=16&&saved<=24)cookFontSize=saved;}catch{}
 function applyCookFont(){
  $('dialog-content').style.setProperty('--cook-font-size',cookFontSize+'px');
  for(const button of $('dialog-content').querySelectorAll('[data-cook-font]'))button.disabled=Number(button.dataset.cookFont)<0?cookFontSize<=16:cookFontSize>=24;
 }
 $('dialog-content').addEventListener('click',event=>{
  const button=event.target.closest('[data-cook-font]');if(!button)return;
  cookFontSize=Math.max(16,Math.min(24,cookFontSize+Number(button.dataset.cookFont)));applyCookFont();
  try{localStorage.setItem('mlk-cook-font-size',String(cookFontSize));}catch{}
 });
 function showCookMode(){
  const recipe=active();if(!recipe)return;
  const text=recipeCookingText(recipe);
  $('dialog-content').classList.add('cook-mode-body');
  $('dialog-content').innerHTML=cookModeHTML(recipe,text,{canRecordCooked:!!canRecordCooked()});
  applyCookFont();
  $('recipe-dialog').scrollTop=0;
  $('close-cook-mode').focus();
 }

 function closeRecipe(){$('recipe-dialog').close();}

 $('recipe-dialog').addEventListener('close',()=>{if(lastFocus?.isConnected)lastFocus.focus();});

 return {active,showRecipe,showCookMode,closeRecipe,copyRecipeToClipboard,refreshRelated,relatedIds};
}

