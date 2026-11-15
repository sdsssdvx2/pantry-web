import {validateRecipeNutrition} from './nutrition.js';
import {promotedRecipeIds} from './data.js?v=20260919-6';
import {enrichSource,validateExtras} from './recipe-context.js';

export function validateCuration(value,validText){
 const preserveText=(v,max)=>{validText(v,max);return v;};
 if(!Array.isArray(value)||value.length>2000)throw Error('백업의 참고 기록 형식을 확인해 주세요.');
 return value.map(r=>{
  if(!r||!['main','rare','personal'].includes(r.source)||!Number.isInteger(r.index)||r.index<0||!Number.isInteger(r.line)||r.line<0)throw Error('참고 기록의 출처를 확인해 주세요.');
  if(r.kind!==undefined&&!['tip','reference','candidate','history'].includes(r.kind))throw Error('요리 노트 분류를 확인해 주세요.');
  if(r.modifiedAt!==undefined&&(typeof r.modifiedAt!=='string'||!Number.isFinite(Date.parse(r.modifiedAt))))throw Error('요리 노트 수정 시각을 확인해 주세요.');
  return {...(r.modifiedAt?{modifiedAt:new Date(r.modifiedAt).toISOString()}:{}),...(r.kind?{kind:r.kind}:{}),...(r.note!==undefined?{note:preserveText(r.note,80000)}:{}),...(r.displayTitle?{displayTitle:preserveText(r.displayTitle,2000)}:{}),source:r.source,index:r.index,line:r.line,title:preserveText(r.title,2000),status:preserveText(r.status,100),reason:preserveText(r.reason),original:preserveText(r.original,80000)};
 });
}

// A full backup carries the source collection too, so restoration does not rely
// on a later deployment containing identical seed records. Runtime state can keep
// only curation overrides when the deployed recipe library is already identical.
export function validateLibrary(value,validText,validateRecipe,currentRecipes=[]){
 const preserveText=(v,max)=>{validText(v,max);return v;};
 if(!value||!Array.isArray(value.recipes)||value.recipes.length>500||!Array.isArray(value.curation))throw Error('백업의 원문 자료 형식을 확인해 주세요.');
 const recipes=value.recipes.map(r=>{
  if(!/^source-[a-z0-9-]+$/.test(r?.id)||!Array.isArray(r.variants)||!r.variants.length||r.variants.length>30)throw Error('백업의 레시피 원문 형식이 올바르지 않아요.');
  const checked=validateRecipe({...r,id:'user-validation'});
  const variants=r.variants.map(v=>{
   validateRecipe({...r,...v,id:'user-validation'});
   if(!/^[a-z0-9-]+$/.test(v.key)||!Number.isInteger(v.sourceLine)||v.sourceLine<0)throw Error('레시피 인분·출처를 확인해 주세요.');
   return {...validateExtras(v,preserveText),...(v.nutritionPlan?{nutritionPlan:validateRecipeNutrition(v.nutritionPlan)}:{}),key:v.key,label:preserveText(v.label,300),original:preserveText(v.original,80000),required:v.required.map(x=>preserveText(x,150)),optional:v.optional.map(x=>preserveText(x,150)),time:v.time,sourceFile:preserveText(v.sourceFile,200),sourceLine:v.sourceLine,sourceTitle:preserveText(v.sourceTitle,1000)};
  });
  if(new Set(variants.map(v=>v.key)).size!==variants.length)throw Error('중복된 인분·버전이 있어요.');
  const {custom,...fields}=checked;
  return {...fields,id:r.id,required:r.required.map(x=>preserveText(x,150)),optional:r.optional.map(x=>preserveText(x,150)),source:true,variants,...(r.prep?{prep:preserveText(r.prep)}:{}),...(r.reviewNote?{reviewNote:preserveText(r.reviewNote)}:{}),...(r.contextSource?{contextSource:preserveText(r.contextSource,1000)}:{})};
 });
 if(new Set(recipes.map(r=>r.id)).size!==recipes.length)throw Error('중복된 원문 레시피 ID가 있어요.');
 const curation=validateCuration(value.curation,validText);
 const promotedIds=new Set(promotedRecipeIds);
 const promoted=currentRecipes.filter(r=>promotedIds.has(r.id)&&!recipes.some(x=>x.id===r.id));
 return {recipes:[...recipes.map(enrichSource),...promoted],curation};
}

