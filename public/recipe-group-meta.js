import {withVersions} from './recipe-versions.js';
const RELATED_ID=/^(?:source|user)-[a-z0-9-]+$/;
export const RECIPE_GROUP_SHARED_FIELDS=Object.freeze(['pairing','note','servingNote','related']);
export function recipeGroupMetaFromRecipe(recipe={}){
 return {pairing:String(recipe.pairing||'').trim(),note:String(recipe.note||'').trim(),servingNote:String(recipe.servingNote||'').trim(),related:[...new Set((Array.isArray(recipe.related)?recipe.related:[]).filter(id=>typeof id==='string'&&RELATED_ID.test(id)))].slice(0,30)};
}
export function validateRecipeGroupMeta(values,validText){
 if(values===undefined)return {};
 if(!values||typeof values!=='object'||Array.isArray(values)||Object.keys(values).length>1000)throw Error('레시피 묶음 공통 정보 형식이 올바르지 않아요.');
 const out={};
 for(const [id,value] of Object.entries(values)){
  if(!RELATED_ID.test(id)||!value||typeof value!=='object'||Array.isArray(value))throw Error('레시피 묶음 공통 정보 형식이 올바르지 않아요.');
  if(value.related!==undefined&&(!Array.isArray(value.related)||value.related.length>30||value.related.some(link=>typeof link!=='string'||!RELATED_ID.test(link))))throw Error('함께 만드는 레시피 목록을 확인해 주세요.');
  out[id]={pairing:validText(value.pairing||'',4000),note:validText(value.note||'',8000),servingNote:validText(value.servingNote||'',4000),related:[...new Set(value.related||[])]};
 }
 return out;
}
function mergePieces(values,separator,max){
 const unique=[...new Set(values.map(value=>String(value||'').trim()).filter(Boolean))];let result='';
 for(const piece of unique){const next=result?result+separator+piece:piece;if(next.length<=max)result=next;}
 return result;
}
function legacyMeta(base,edits){
 const versioned=withVersions(base,edits);if((versioned.variants?.length||0)<2)return null;
 const ownEdits=edits.filter(edit=>edit.sourceId===base.id).sort((a,b)=>(Date.parse(b.recipe?.modifiedAt||'')||0)-(Date.parse(a.recipe?.modifiedAt||'')||0));
 const candidates=[...ownEdits.map(edit=>edit.recipe),...(versioned.variants||[]),base];
 const pairingLines=candidates.flatMap(recipe=>String(recipe?.pairing||'').split('\n').map(line=>line.trim()).filter(Boolean));
 const noteBlocks=candidates.map(recipe=>recipe?.note).filter(Boolean),servingBlocks=candidates.map(recipe=>recipe?.servingNote).filter(Boolean);
 const related=[...new Set(candidates.flatMap(recipe=>Array.isArray(recipe?.related)?recipe.related:[]).filter(id=>typeof id==='string'&&RELATED_ID.test(id)))].slice(0,30);
 return {pairing:mergePieces(pairingLines,'\n',4000),note:mergePieces(noteBlocks,'\n\n',8000),servingNote:mergePieces(servingBlocks,'\n\n',4000),related};
}
export function migrateRecipeGroupMeta(values,bases,edits){const out={...values};for(const base of bases){if(!base?.id||Object.hasOwn(out,base.id))continue;const derived=legacyMeta(base,edits);if(derived)out[base.id]=derived;}return out;}
// Only these four metadata fields are shared. Required/optional ingredients,
// cooking records, prep, time and version labels stay on each serving/version.
export function applyRecipeGroupMeta(recipe,meta){if(!meta)return recipe;return {...recipe,pairing:meta.pairing||'',note:meta.note||'',servingNote:meta.servingNote||'',related:[...(meta.related||[])]};}
