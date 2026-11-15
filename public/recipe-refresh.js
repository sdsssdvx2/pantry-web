import {createRecipeModel} from './recipe-model.js?v=20261108-search-reuse-1';
import {validateRecipe,validateCustom,validateEdits,validateItems} from './state-validation.js?v=20260919-5';

const key=p=>p.sourceId+'/'+(p.variantKey||'base');
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function validateRefreshPlan(plan){
 if(plan?.version!==1||typeof plan.id!=='string'||!Array.isArray(plan.patches)||plan.patches.length>500)throw Error('레시피 정비 파일 형식을 확인해 주세요.');
 const seen=new Set();
 for(const p of plan.patches){
  if(typeof p.sourceId!=='string'||!(p.variantKey===null||typeof p.variantKey==='string')||typeof p.before!=='string'||typeof p.after!=='string'||!p.after.trim()||p.after.length>80000||p.before.length>80000||seen.has(key(p)))throw Error('정비 파일에 잘못된 내용이나 중복 레시피가 있어요.');
  for(const field of ['beforeRequired','beforeOptional','required','optional'])if(p[field]!==undefined)validateItems(p[field]);
  if(p.servings!==undefined&&(!(p.servings>0)||p.servings>1000))throw Error('인분 설정을 확인해 주세요.');
  seen.add(key(p));
 }
 return plan;
}
export function inspectRefresh(context,plan){
 validateRefreshPlan(plan);
 const model=createRecipeModel(()=>context),current=new Map();
 for(const base of model.allRecipes())for(const variant of base.variants?.length?base.variants:[null]){
  const recipe=model.matchVariant(base,variant),edit=context.sourceEdits.find(e=>e.sourceId===recipe.id&&(e.variantKey||null)===(recipe.variantKey||null));
  const body=recipe.source&&!edit?recipe.original:recipe.steps.join('\n');
  current.set(key({sourceId:recipe.id,variantKey:recipe.variantKey}),{recipe,body,edit});
 }
 return plan.patches.map(p=>{
  const found=current.get(key(p));
  return {...p,...found,status:!found?'missing':found.body===p.after?'applied':found.body===p.before&&(!p.beforeRequired||equal(found.recipe.required,p.beforeRequired)&&equal(found.recipe.optional,p.beforeOptional))?'ready':'changed'};
 });
}
export function applyRefresh(context,plan,selected=null){
 const rows=inspectRefresh(context,plan),customRecipes=[...context.customRecipes],sourceEdits=[...context.sourceEdits],receipt=[];
 for(const row of rows){
  if(row.status!=='ready'||selected&&!selected.has(key(row)))continue;
  const customIndex=customRecipes.findIndex(r=>r.id===row.sourceId);
  const editIndex=sourceEdits.findIndex(e=>e.sourceId===row.sourceId&&(e.variantKey||null)===(row.variantKey||null));
  const direct=customIndex>=0&&editIndex<0&&(!row.variantKey||row.variantKey==='base');
  const before=direct?customRecipes[customIndex]:editIndex>=0?sourceEdits[editIndex]:null;
  const recipe=validateRecipe({...((direct?before:before?.recipe)||row.recipe),id:direct?before.id:before?.recipe.id||'user-'+crypto.randomUUID(),steps:row.after.split('\n'),...(row.required?{required:row.required,optional:row.optional||[]}:{}),...(row.servings&&!row.recipe.nutritionPlan?{nutritionPlan:{servings:row.servings,overrides:[]}}:{})});
  const after=direct?recipe:{...(before||{sourceId:row.sourceId,variantKey:row.variantKey}),recipe};
  if(direct)customRecipes[customIndex]=after;
  else if(editIndex>=0)sourceEdits[editIndex]=after;
  else sourceEdits.push(after);
  receipt.push({sourceId:row.sourceId,variantKey:row.variantKey,direct,before,after});
 }
 // Check the complete result before returning any mutation.
 validateCustom(customRecipes);validateEdits(sourceEdits,context.builtInRecipes,customRecipes);
 return {customRecipes,sourceEdits,receipt,rows};
}
export function undoRefresh(context,receipt){
 const customRecipes=[...context.customRecipes],sourceEdits=[...context.sourceEdits],remaining=[];let reverted=0;
 for(const item of receipt){
  const list=item.direct?customRecipes:sourceEdits;
  const index=list.findIndex(r=>item.direct?r.id===item.sourceId:r.sourceId===item.sourceId&&(r.variantKey||null)===(item.variantKey||null));
  if(index<0||!equal(list[index],item.after)){remaining.push(item);continue;}
  if(item.before)list[index]=item.before;else list.splice(index,1);
  reverted++;
 }
 validateCustom(customRecipes);validateEdits(sourceEdits,context.builtInRecipes,customRecipes);
 return {customRecipes,sourceEdits,remaining,reverted};
}
export {key as refreshKey};
