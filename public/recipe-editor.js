import {categories,efforts,inferRecipeCategory} from './data.js?v=20260919-6';
import {recipeGroupMetaFromRecipe} from './recipe-group-meta.js';
import {cookingBody} from './recipe-display.js?v=20260919-4';
import {preparationSuggestions} from './recipe-context.js';
import {createSearchMatcher} from './search-utils.js?v=20260919-1';
import {validText,validateCustom,validateRecipe,variantStateKey} from './state-validation.js?v=20260919-5';
import {installRecipeNutritionEditor} from './nutrition-ui.js';
import {gramCookingText} from './nutrition.js';
import {estimateRecipeTime,recipeTimeSuggestionText} from './recipe-time-estimator.js';

const $=id=>document.getElementById(id);
const escapeHTML=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

export function installRecipeEditor({getContext,applyContext,persist,render,showRecipe,toast,isGroupedRecipe}){
 const nutritionEditor=installRecipeNutritionEditor($('recipe-nutrition-editor'),getContext);
 let editingId=null,editingSource=null,editorFocus=null,editorRelated=[],editorBaseId=null,prepCandidates=[],editingBaseline='',editingGroupBaseline='',categoryTouched=false,timeTouched=false,timeEstimate=null;
 $('recipe-steps').rows=10;
 const stableValue=value=>Array.isArray(value)?value.map(stableValue):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stableValue(value[key])])):value;
 const splitIngredients=value=>String(value||'').split(/[,，、;\n]+/).map(part=>part.trim()).filter(Boolean);
 const updateInferredCategory=()=>{
  if(categoryTouched||editingId||editingSource)return;
  const name=$('recipe-name').value.trim();if(!name)return;
  $('recipe-category').value=inferRecipeCategory({name,required:splitIngredients($('recipe-required').value)},$('recipe-category').value||'side');
 };
 const stateSnapshot=value=>JSON.stringify(stableValue(value??null));
 const editTargetState=context=>{
  if(editingId)return {recipe:context.customRecipes.find(item=>item.id===editingId)||null};
  if(editingSource)return {
   edit:context.sourceEdits.find(item=>item.sourceId===editingSource.sourceId&&item.variantKey===editingSource.variantKey)||null,
   sourceHidden:context.hiddenSources.includes(editingSource.sourceId),
   variantHidden:!!editingSource.variantKey&&(context.hiddenVariants||[]).includes(variantStateKey(editingSource.sourceId,editingSource.variantKey))
  };
  return null;
 };
 const editGroupState=context=>{
  const id=editingSource?.sourceId||editingId;
  return id?context.recipeGroupMeta[id]??null:null;
 };

 const relatedRecipeName=(recipe,sourceEdits=[])=>{
  if(!recipe?.source)return recipe?.name||'';
  let bestName=recipe.name||'',bestTime=-1,bestIndex=-1;
  sourceEdits.forEach((edit,index)=>{
   if(edit.sourceId!==recipe.id)return;
   const name=String(edit.recipe?.name||'').trim();
   if(!name)return;
   const time=Date.parse(edit.recipe?.modifiedAt||'')||0;
   if(time>bestTime||(time===bestTime&&index>bestIndex)){bestName=name;bestTime=time;bestIndex=index;}
  });
  return bestName;
 };

 function renderRelatedChoices(){
  const {builtInRecipes,customRecipes,hiddenSources,sourceEdits}=getContext();
  const q=$('related-search').value.trim(),matchSearch=q?createSearchMatcher(q):null;
  const recipes=[...builtInRecipes,...customRecipes].filter(recipe=>!hiddenSources.includes(recipe.id)).map(recipe=>({recipe,name:relatedRecipeName(recipe,sourceEdits)}));
  const availableIds=new Set(recipes.map(item=>item.recipe.id));
  editorRelated=editorRelated.filter(id=>id!==editorBaseId&&availableIds.has(id));
  const options=recipes.filter(({recipe,name})=>recipe.id!==editorBaseId&&(!matchSearch||matchSearch(name)));
  $('related-options').innerHTML=options.map(({recipe,name})=>`<label class="related-choice"><input type="checkbox" value="${recipe.id}" ${editorRelated.includes(recipe.id)?'checked':''}><span>${escapeHTML(name)}</span></label>`).join('')||'<p class="field-help">검색 결과가 없어요.</p>';
  $('related-selection').textContent=editorRelated.length?`연결 ${editorRelated.length}개: `+editorRelated.map(id=>recipes.find(item=>item.recipe.id===id)?.name).filter(Boolean).join(' / '):'연결한 레시피가 없어요.';
 }

 function renderPrepSuggestions(){
  prepCandidates=preparationSuggestions($('recipe-steps').value);
  $('prep-suggestions').innerHTML=prepCandidates.length?'<p>본문에서 찾은 시간 문구 · 눌러서 추가</p>'+prepCandidates.map((text,i)=>`<button type="button" data-prep="${i}">${escapeHTML(text)}</button>`).join(''):'<p>해동·숙성·불리기·냉장 대기처럼 시간이 적힌 문장을 찾으면 여기에 제안해요.</p>';
 }

 function renderTimeSuggestion(){
  const helper=$('recipe-time-helper'),label=$('recipe-time-suggestion'),apply=$('apply-recipe-time-suggestion');
  if(!helper||!label||!apply)return;
  timeEstimate=estimateRecipeTime($('recipe-steps').value);
  if(!timeEstimate){helper.hidden=true;label.textContent='';return;}
  if(!timeTouched&&timeEstimate.confidence==='high')$('recipe-time').value=String(timeEstimate.minutes);
  label.textContent=recipeTimeSuggestionText(timeEstimate,$('recipe-time').value);
  helper.hidden=false;
 }

 function open(recipe=null,copy=false,newVersion=false){
  const context=getContext(),{sourceEdits}=context;
  editorFocus=document.activeElement;
  editingId=recipe?.custom&&!recipe.source&&!copy?recipe.id:null;
  editingSource=recipe?.source&&!copy?{sourceId:recipe.id,variantKey:recipe.variantKey}:null;
  if(newVersion){
   editingId=null;
   editingSource={sourceId:recipe.id,variantKey:`version-${crypto.randomUUID()}`,label:''};
  }else if(recipe&&!copy){
   const authored=sourceEdits.find(e=>e.sourceId===recipe.id&&e.variantKey===recipe.variantKey);
   if(authored?.label){
    editingId=null;
    editingSource={sourceId:recipe.id,variantKey:recipe.variantKey,label:authored.label};
   }
  }
  $('recipe-form').reset();
  categoryTouched=false;
  timeTouched=!!recipe;
  $('recipe-error').textContent='';
  $('editor-title').textContent=editingSource?`기록 수정 · ${recipe.variantLabel}`:editingId?'내 레시피 수정':'내 레시피 추가';
  $('recipe-version-field').hidden=false;
  $('recipe-version-label').value=newVersion?'':recipe?.variantLabel||'';
  $('recipe-version-label').required=false;
  if(newVersion)$('editor-title').textContent='인분·버전 추가';
  $('recipe-category').innerHTML=categories.filter(c=>c[0]!=='all').map(([v,l])=>`<option value="${v}">${l}</option>`).join('');
  $('recipe-effort').innerHTML=efforts.filter(e=>e[0]!=='all').map(([v,l])=>`<option value="${v}">${l}</option>`).join('');
  $('recipe-effort').value='2';
  $('recipe-category').value='side';
  if(recipe){
   $('recipe-name').value=recipe.name;
   $('recipe-category').value=recipe.category;
   $('recipe-effort').value=recipe.effort;
   $('recipe-time').value=recipe.time;
   $('recipe-required').value=recipe.required.join(', ');
   $('recipe-optional').value=recipe.optional.join(', ');
   $('recipe-summary').value=recipe.summary;
   const edited=sourceEdits.some(e=>e.sourceId===recipe.id&&e.variantKey===recipe.variantKey);
   $('recipe-steps').value=gramCookingText(cookingBody(recipe.source&&!edited?recipe.original:recipe.steps.join('\n'),recipe));
   $('recipe-note').value=recipe.note||'';
  }
  $('recipe-prep').value=recipe?.prep||'';
  nutritionEditor.open(recipe||{});
  $('recipe-pairing').value=recipe?.pairing||'';
  $('recipe-serving').value=recipe?.servingNote||'';
  editorRelated=[...(recipe?.related||[])];
  editorBaseId=copy?null:recipe?.id||null;
  editingBaseline=stateSnapshot(editTargetState(context));
  editingGroupBaseline=stateSnapshot(editGroupState(context));
  $('related-search').value='';
  renderRelatedChoices();
  renderPrepSuggestions();
  renderTimeSuggestion();
  $('editor-dialog').showModal();
  $('recipe-name').focus();
 }

 function openFromArchive(record){
  open();
  $('recipe-name').value=record.title.replace(/^•\s*/,'').split(':')[0].slice(0,100);
  updateInferredCategory();
  $('recipe-steps').value=record.note??record.original;
  $('recipe-note').value='참고 기록에서 가져옴. 재료와 조리 조건을 확인한 뒤 저장.';
  $('recipe-steps').dispatchEvent(new Event('input',{bubbles:true}));
  toast('원문을 가져왔어요. 음식 종류·수고와 필수 재료 초안을 확인해 저장하세요.');
 }

 const close=()=>$('editor-dialog').close();

 $('related-search').addEventListener('input',renderRelatedChoices);
 $('related-options').addEventListener('change',event=>{
  const input=event.target;
  if(input.type!=='checkbox')return;
  editorRelated=input.checked?[...new Set([...editorRelated,input.value])]:editorRelated.filter(id=>id!==input.value);
  renderRelatedChoices();
 });
 $('recipe-steps').addEventListener('input',()=>{renderPrepSuggestions();renderTimeSuggestion();});
 $('recipe-name').addEventListener('input',updateInferredCategory);
 $('recipe-required').addEventListener('input',updateInferredCategory);
 $('recipe-category').addEventListener('change',()=>{categoryTouched=true;});
 $('recipe-time').addEventListener('input',()=>{timeTouched=true;renderTimeSuggestion();});
 $('apply-recipe-time-suggestion')?.addEventListener('click',()=>{if(!timeEstimate)return;$('recipe-time').value=String(timeEstimate.minutes);timeTouched=true;renderTimeSuggestion();$('recipe-time').focus();});
 $('prep-suggestions').addEventListener('click',event=>{
  const button=event.target.closest('[data-prep]');
  if(!button)return;
  const text=prepCandidates[Number(button.dataset.prep)];
  if(!text)return;
  const rows=$('recipe-prep').value.split('\n').filter(Boolean);
  $('recipe-prep').value=[...new Set([...rows,text])].join('\n');
  $('recipe-prep').focus();
 });
 $('add-recipe').addEventListener('click',()=>open());
 $('close-editor').addEventListener('click',close);
 $('cancel-editor').addEventListener('click',close);
 $('editor-dialog').addEventListener('close',()=>{if(editorFocus?.isConnected)editorFocus.focus();else $('add-recipe').focus();});

 $('recipe-form').addEventListener('submit',event=>{
  event.preventDefault();
  try{
   const context=getContext();
   if(stateSnapshot(editTargetState(context))!==editingBaseline)throw Error('다른 기기에서 이 레시피가 변경되거나 삭제됐어요. 편집창을 닫고 최신 내용을 확인한 뒤 다시 수정해 주세요.');
   if(stateSnapshot(editGroupState(context))!==editingGroupBaseline)throw Error('다른 기기에서 이 레시피의 묶음 공통 정보가 변경됐어요. 편집창을 닫고 최신 내용을 확인한 뒤 다시 수정해 주세요.');
   const recipe=validateRecipe({
    id:editingId||`user-${crypto.randomUUID()}`,
    modifiedAt:new Date().toISOString(),
    name:$('recipe-name').value,
    category:$('recipe-category').value,
    effort:Number($('recipe-effort').value),
    time:Number($('recipe-time').value),
    required:splitIngredients($('recipe-required').value),
    optional:splitIngredients($('recipe-optional').value),
    summary:$('recipe-summary').value,
    steps:gramCookingText($('recipe-steps').value).split('\n'),
    nutritionPlan:nutritionEditor.read(),
    note:$('recipe-note').value,
    prep:$('recipe-prep').value,
    pairing:$('recipe-pairing').value,
    servingNote:$('recipe-serving').value,
    related:editorRelated,
    variantLabel:$('recipe-version-label').value
   });
   const previous={customRecipes:context.customRecipes,sourceEdits:context.sourceEdits,recipeGroupMeta:context.recipeGroupMeta};
   let nextCustom=context.customRecipes,nextEdits=context.sourceEdits,nextGroupMeta=context.recipeGroupMeta,showId=recipe.id;
   if(editingSource){
    nextEdits=context.sourceEdits.filter(x=>!(x.sourceId===editingSource.sourceId&&x.variantKey===editingSource.variantKey));
    const versionLabel=validText($('recipe-version-label').value,100);
    nextEdits=[...nextEdits,{...editingSource,label:versionLabel||(editingSource.variantKey.startsWith('version-')?'추가 버전':''),recipe}];
    showId=editingSource.sourceId;
   }else{
    nextCustom=validateCustom(editingId?context.customRecipes.map(r=>r.id===editingId?recipe:r):[...context.customRecipes,recipe]);
   }
   if(editingSource||context.recipeGroupMeta[showId]||isGroupedRecipe(showId)){
    nextGroupMeta={...context.recipeGroupMeta,[showId]:recipeGroupMetaFromRecipe(recipe)};
   }
   applyContext({customRecipes:nextCustom,sourceEdits:nextEdits,recipeGroupMeta:nextGroupMeta});
   if(!persist()){
    applyContext(previous);
    render();
    $('recipe-error').textContent='브라우저에 저장하지 못했어요. 내용을 복사하거나 전체 백업으로 보관해 주세요.';
    return;
   }
   const nextSelected=editingSource?{...context.selectedVariants,[showId]:editingSource.variantKey}:context.selectedVariants;
   applyContext({selectedVariants:nextSelected});
   render();
   close();
   showRecipe(showId);
   toast(editingSource?'선택한 인분·버전의 기록을 수정했어요. 묶음 공통 메모도 함께 반영됐어요.':'내 레시피를 저장했어요.');
  }catch(error){
   $('recipe-error').textContent=error.message;
  }
 });

 return {open,openFromArchive,refreshNutrition(){if($('editor-dialog')?.open)nutritionEditor.refresh();}};
}

