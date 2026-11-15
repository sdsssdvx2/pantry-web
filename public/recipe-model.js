import {withVersions} from './recipe-versions.js';
import {applyRecipeGroupMeta} from './recipe-group-meta.js';
import {matchIngredient,normalize} from './data.js?v=20260919-6';
import {matchesRating} from './ratings.js';
import {createSearchMatcher} from './search-utils.js?v=20260919-1';
import {variantStateKey} from './state-validation.js?v=20260919-5';
import {cookingCount,latestCookedAt} from './cooking-history.js';

export function createRecipeModel(getContext){
 let evaluationCache=null;
 const sourceEditIndexes=new WeakMap();
 const sourceEditIndex=sourceEdits=>{
  let cached=sourceEditIndexes.get(sourceEdits);if(cached)return cached;
  cached=new Map();
  for(const edit of sourceEdits){
   let variants=cached.get(edit.sourceId);if(!variants){variants=new Map();cached.set(edit.sourceId,variants);}
   if(!variants.has(edit.variantKey))variants.set(edit.variantKey,edit);
  }
  sourceEditIndexes.set(sourceEdits,cached);return cached;
 };
 const context=()=>{
  const value=getContext();
  if(!value||typeof value!=='object')throw new Error('Recipe model context is unavailable.');
  return value;
 };
 const visibleVersionedRecipe=(recipe,c)=>{
  const versioned=withVersions(recipe,c.sourceEdits);
  if(!versioned.variants?.length)return versioned;
  const variants=versioned.variants.filter(v=>{const key=variantStateKey(recipe.id,v.key);return !c.hiddenVariants.includes(key)&&!(c.purgedVariants||[]).includes(key);});
  return variants.length?{...versioned,variants}:null;
 };
 const allRecipesWith=c=>[...c.builtInRecipes.filter(r=>!c.hiddenSources.includes(r.id)&&!r.internalHidden),...c.customRecipes].map(recipe=>visibleVersionedRecipe(recipe,c)).filter(Boolean);
 const composeVariantWith=(base,v,c)=>{
  const edit=sourceEditIndex(c.sourceEdits).get(base.id)?.get(v?.key);
  const merged=applyRecipeGroupMeta({...base,...v,...edit?.recipe},c.recipeGroupMeta[base.id]);
  const r={...merged,id:base.id,variantKey:v?.key||null,variantLabel:edit?.label||v?.label||base.variantLabel||'',original:v?.original||'',custom:!!base.custom||!!edit,source:!!base.source};
  r.rating=c.ratings[base.id]||0;
  return r;
 };
 const matchRecipeIngredientsWith=(r,c)=>{
  const matches=r.required.map(n=>matchIngredient(n,c.pantry,c.stockOverrides,r));
  return {...r,matches,missing:matches.filter(m=>!m.available).map(m=>m.name)};
 };
 const matchVariantWith=(base,v,c)=>matchRecipeIngredientsWith(composeVariantWith(base,v,c),c);
 const evaluateWith=(base,c)=>{
  if(!base.variants)return matchVariantWith(base,null,c);
  const selected=c.selectedVariants[base.id];
  if(selected)return matchVariantWith(base,base.variants.find(v=>v.key===selected)||base.variants[0],c);
  return base.variants.map(v=>matchVariantWith(base,v,c)).sort((a,b)=>a.missing.length-b.missing.length||a.time-b.time)[0];
 };
 const matchesCategories=(category,filters,includedCategories)=>filters.categories[category]!==-1&&(!includedCategories.size||includedCategories.has(category));
 const queryMatches=(r,matchSearch,filters)=>{
  if(!matchSearch)return true;
  const ingredients=[...(r.required||[]),...(r.optional||[])];
  const summaryText=r.name+' '+ingredients.join(' ')+' '+r.summary+' '+(r.pairing||'')+' '+(r.servingNote||'');
  return matchSearch(summaryText)
   ||ingredients.some(n=>matchSearch(normalize(n)))
   ||(filters.searchBody&&matchSearch(r.custom?r.steps.join(' '):r.original||r.steps.join(' ')));
 };
 const filteredBaseWith=(baseRecipes,evaluatedById,c)=>{
  const {filters}=c,q=filters.query.trim(),matchSearch=q?createSearchMatcher(q):null,includedCategories=new Set(Object.keys(filters.categories).filter(key=>filters.categories[key]===1));
  const passes=r=>matchesRating(r.rating,filters.rating)&&matchesCategories(r.category,filters,includedCategories)&&(filters.effort==='all'||String(r.effort)===filters.effort);
  return baseRecipes.map(base=>{
   if(!q){const r=evaluatedById?.get(base.id)||evaluateWith(base,c);return passes(r)?r:null;}
   const candidates=base.variants?.length?base.variants.map(v=>composeVariantWith(base,v,c)):[composeVariantWith(base,null,c)];
   // The selected variant was already matched against the exact current stock
   // in evaluationSnapshot(). Search-only input must not rematch it again.
   // Non-selected variants still get their own independent ingredient verdict.
   const evaluated=evaluatedById?.get(base.id);
   const matched=candidates.filter(r=>passes(r)&&queryMatches(r,matchSearch,filters))
    .map(r=>evaluated?.variantKey===r.variantKey?evaluated:matchRecipeIngredientsWith(r,c));
   if(!matched.length)return null;
   const selectedKey=c.selectedVariants[base.id];
   const selected=selectedKey?matched.find(r=>r.variantKey===selectedKey):null;
   const chosen=selected||matched.sort((a,b)=>a.missing.length-b.missing.length||a.time-b.time)[0];
   if(chosen.variantKey)c.selectedVariants[base.id]=chosen.variantKey;
   return chosen;
  }).filter(Boolean);
 };
 const selectedVariantsKey=selected=>JSON.stringify(Object.keys(selected||{}).sort().map(id=>[id,selected[id]]));
 const evaluationStateMatches=(cached,c,selectedKey)=>!!cached
  &&cached.builtInRecipes===c.builtInRecipes
  &&cached.customRecipes===c.customRecipes
  &&cached.sourceEdits===c.sourceEdits
  &&cached.recipeGroupMeta===c.recipeGroupMeta
  &&cached.hiddenSources===c.hiddenSources
  &&cached.hiddenVariants===c.hiddenVariants
   &&cached.purgedVariants===c.purgedVariants
  &&cached.ratings===c.ratings
  &&cached.pantry===c.pantry
  &&cached.stockOverrides===c.stockOverrides
  &&cached.selectedKey===selectedKey;
 const evaluationSnapshotWith=c=>{
  const selectedKey=selectedVariantsKey(c.selectedVariants);
  if(evaluationStateMatches(evaluationCache,c,selectedKey))return evaluationCache.value;
  const all=allRecipesWith(c),evaluated=all.map(base=>evaluateWith(base,c)),value={all,evaluated,evaluatedById:new Map(evaluated.map(recipe=>[recipe.id,recipe]))};
  evaluationCache={builtInRecipes:c.builtInRecipes,customRecipes:c.customRecipes,sourceEdits:c.sourceEdits,recipeGroupMeta:c.recipeGroupMeta,hiddenSources:c.hiddenSources,hiddenVariants:c.hiddenVariants,purgedVariants:c.purgedVariants,ratings:c.ratings,pantry:c.pantry,stockOverrides:c.stockOverrides,selectedKey,value};
  return value;
 };
 const sourceChronologyRank=r=>Math.max(Number(r.sourceLine||0),...(r.variants||[]).map(v=>Number(v.sourceLine||0)));
 const recentSortIndexes=c=>{
  const edits=new Map();
  c.sourceEdits.forEach((edit,index)=>{
   const current=edits.get(edit.sourceId)||{time:0,fallback:-1};
   edits.set(edit.sourceId,{time:Math.max(current.time,Date.parse(edit.recipe?.modifiedAt||'')||0),fallback:index});
  });
  return {edits,customIndex:new Map(c.customRecipes.map((recipe,index)=>[recipe.id,index]))};
 };
 const recentModifiedRank=(r,indexes)=>{
  const ownTime=Date.parse(r.modifiedAt||'')||0,edit=indexes.edits.get(r.id),editTime=edit?.time||0;
  if(ownTime||editTime)return Math.max(ownTime,editTime);
  if(r.custom)return 100000000000+(indexes.customIndex.get(r.id)??0);
  if((edit?.fallback??-1)>=0)return 100000000000+edit.fallback;
  return sourceChronologyRank(r);
 };
 return {
  allRecipes(){const c=context();return allRecipesWith(c);},
  evaluationSnapshot(){return evaluationSnapshotWith(context());},
  isGroupedRecipe(id){const c=context(),base=[...c.builtInRecipes,...c.customRecipes].find(r=>r.id===id);return !!base&&(withVersions(base,c.sourceEdits).variants?.length||0)>1;},
  matchVariant(base,v){return matchVariantWith(base,v,context());},
  evaluate(base){return evaluateWith(base,context());},
  filteredBase(baseRecipes,evaluatedById=null){const c=context();return filteredBaseWith(baseRecipes??allRecipesWith(c),evaluatedById,c);},
  visibleRecipes(base){
   const c=context(),filters=c.filters;
   const source=base??filteredBaseWith(allRecipesWith(c),null,c);
   const list=source.filter(r=>filters.availability==='all'||(filters.availability==='ready'?r.missing.length===0:filters.availability==='far'?r.missing.length>=3:r.missing.length>=1&&r.missing.length<=2));
   const recentIndexes=filters.sort==='recent'?recentSortIndexes(c):null;
   const recentRanks=recentIndexes?new Map(list.map(r=>[r.id,recentModifiedRank(r,recentIndexes)])):null;
   const cookingRanks=['cooked','popular'].includes(filters.sort)?new Map(list.map(r=>[r.id,{count:cookingCount(c.cookingHistory,r.id),latest:Date.parse(latestCookedAt(c.cookingHistory,r.id)||'')||0}])):null;
   return list.sort((a,b)=>filters.sort==='recent'?recentRanks.get(b.id)-recentRanks.get(a.id)
    :filters.sort==='cooked'?cookingRanks.get(b.id).latest-cookingRanks.get(a.id).latest||a.name.localeCompare(b.name,'ko')
    :filters.sort==='popular'?cookingRanks.get(b.id).count-cookingRanks.get(a.id).count||cookingRanks.get(b.id).latest-cookingRanks.get(a.id).latest||a.name.localeCompare(b.name,'ko')
    :filters.sort==='rating'?b.rating-a.rating||a.missing.length-b.missing.length||a.time-b.time
    :filters.sort==='time'?a.time-b.time||a.missing.length-b.missing.length
    :filters.sort==='effort'?a.effort-b.effort||a.missing.length-b.missing.length||a.time-b.time
    :a.missing.length-b.missing.length||Number(!!a.prep)-Number(!!b.prep));
  }
 };
}
