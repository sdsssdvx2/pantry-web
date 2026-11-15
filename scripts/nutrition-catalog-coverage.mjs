// Expanded, read-only audit of exactly the recipe versions available in the
// site library. Keep this separate from the historical saved-edit-only report.
import {withVersions} from '../public/recipe-versions.js';
import {normalizeSourceRecipe} from '../public/recipe-source-normalization.js';
import {auditNutritionState} from './nutrition-audit-lib.mjs';

const list=value=>Array.isArray(value)?value:[];
const ids=value=>new Set(list(value).filter(item=>typeof item==='string'));
const detailKey=(sourceId,variantKey)=>sourceId+'/'+variantKey;
const recipeInput=(base,variant,edit)=>{
 const current=edit?.recipe||null;
 const original=typeof variant?.original==='string'?variant.original:'';
 const sourceSteps=original?original.split('\n'):list(variant?.steps).length?variant.steps:list(base.steps);
 return {
  id:'audit:'+base.id+':'+(variant?.key||'base'),
  name:current?.name||base.name||base.id,
  required:list(current?.required??variant?.required??base.required),
  steps:current?.steps??sourceSteps,
  ...(current?.nutritionPlan?{nutritionPlan:current.nutritionPlan}:{}),
  ...(current?.nutrition&&!current?.nutritionPlan?{nutrition:current.nutrition}:{})
 };
};

export function buildVisibleNutritionLibrary(snapshot,rawSourceRecipes=[],rawPromotedRecipes=[]){
 const state=snapshot?.state??snapshot??{};
 const hidden=ids([...list(state.hidden),...list(state.trashPurged)]);
 const hiddenVariants=ids([...list(state.hiddenVariants),...list(state.trashPurgedVariants)]);
 const edits=list(state.edits);
 const editsByKey=new Map();
 for(const edit of edits){
  if(!edit?.sourceId||!edit?.variantKey||!edit.recipe)continue;
  const key=detailKey(edit.sourceId,edit.variantKey);
  // Same as recipe-model.js: first saved edit wins for this source/version.
  if(!editsByKey.has(key))editsByKey.set(key,edit);
 }
 const builtInIds=new Set(),builtIns=[];
 for(const raw of [...list(rawSourceRecipes),...list(rawPromotedRecipes)]){
  if(!raw?.id||builtInIds.has(raw.id))continue;
  builtInIds.add(raw.id);
  builtIns.push(normalizeSourceRecipe(raw));
 }
 const userById=new Map();
 for(const recipe of [...list(state.recipes),...list(state.custom)]){
  if(!recipe?.id||userById.has(recipe.id))continue;
  userById.set(recipe.id,recipe);
 }
 const grouped={user:[...userById.values()],edited:[],unedited:[]};
 const diagnostics={builtInMenus:builtIns.length,sourceVariants:0,visibleSourceVariants:0,hiddenMenus:0,hiddenMenuVersions:0,hiddenVersions:0,missingOriginals:0,orphanEdits:0};
 const selectedEditKeys=new Set();
 for(const source of builtIns){
  const versioned=withVersions(source,edits);
  const variants=versioned.variants?.length?versioned.variants:[{key:'base',original:'',...source}];
  diagnostics.sourceVariants+=variants.length;
  // Reconcile all source versions before filtering internally hidden or user-hidden menus.
  if(source.internalHidden||hidden.has(source.id)){
   diagnostics.hiddenMenus++;
   diagnostics.hiddenMenuVersions+=variants.length;
   continue;
  }
  for(const variant of variants){
   const key=detailKey(source.id,variant.key||'base');
   if(hiddenVariants.has(key)){diagnostics.hiddenVersions++;continue;}
   diagnostics.visibleSourceVariants++;
   const edit=editsByKey.get(key);
   if(edit)selectedEditKeys.add(key);
   if(!edit&&!String(variant.original||'').trim()&&!list(variant.steps).some(step=>String(step).trim())){
    diagnostics.missingOriginals++;
   }
   grouped[edit?'edited':'unedited'].push(recipeInput(source,variant,edit));
  }
 }
 diagnostics.orphanEdits=[...editsByKey.keys()].filter(key=>!selectedEditKeys.has(key)).length;
 return {groups:grouped,diagnostics};
}

const brief=audit=>({
 audited:audit.recipes.audited,
 nutrientComplete:audit.recipes.complete,
 quantifiedNutrientComplete:audit.recipes.quantifiedComplete,
 calculationReady:audit.recipes.calculationReady,
 withWarnings:audit.recipes.withWarnings,
 noQuantifiedRows:audit.recipes.noQuantifiedRows,
 withRowReviews:audit.recipes.withRowReviews,
 errorCount:audit.recipes.rows.filter(row=>row.error).length
});

export async function auditVisibleNutritionLibrary(snapshot,sourceRecipes=[],promotedRecipes=[]){
 const {groups,diagnostics}=buildVisibleNutritionLibrary(snapshot,sourceRecipes,promotedRecipes);
 const state=snapshot?.state??snapshot??{};
 const fixture=recipes=>({
  ...snapshot,
  state:{
   items:list(state.items),
   stock:state.stock||{},
   history:list(state.history),
   ingredientDetectionRules:list(state.ingredientDetectionRules),
   custom:recipes,
   edits:[]
  }
 });
 const results={};
 for(const name of ['user','edited','unedited']){
  const audit=await auditNutritionState(fixture(groups[name]));
  results[name]={...brief(audit),gaps:audit.gaps,rows:audit.recipes.rows,remediation:audit.remediation};
 }
 const metrics=['audited','nutrientComplete','quantifiedNutrientComplete','calculationReady','withWarnings','noQuantifiedRows','withRowReviews','errorCount'];
 const summary=Object.fromEntries(metrics.map(key=>[key,results.user[key]+results.edited[key]+results.unedited[key]]));
 return {summary,groups:results,diagnostics};
}

const reasonLabels={
 ambiguous:'제품 선택 필요',unresolved:'식재료 연결 필요',conversion:'환산값 필요',
 drop:'방울 실측 무게 필요',fragment:'조각 실측 무게 필요',
 nutrient:'영양성분 자료 필요',unknown:'추가 확인 필요'
};
export function formatVisibleNutritionCoverage(result,{top=15,examples=12}={}){
 const {summary,groups,diagnostics}=result;
 const lines=[
  '=== COMPLETE VISIBLE RECIPE LIBRARY — ADDITIONAL COVERAGE ===',
  'Separate from the legacy saved-source-edits-only trend above; its record count may change.',
  'Includes owner-created recipes and every visible built-in serving variant; saved edits replace their originals, never double-count them.',
  `VISIBLE LIBRARY: ${summary.audited} versions audited; quantified kcal/Na coverage ${summary.quantifiedNutrientComplete}; calculation-ready ${summary.calculationReady}; historical no-gap including zero rows ${summary.nutrientComplete}; no included quantified rows ${summary.noQuantifiedRows}; quantity/preparation warnings ${summary.withWarnings}; row review flags ${summary.withRowReviews}; calculation errors ${summary.errorCount} (counts can overlap).`,
  `CATALOG: ${diagnostics.builtInMenus} built-in recipe groups; ${diagnostics.sourceVariants} source/saved variants before hidden filtering; ${diagnostics.visibleSourceVariants} visible built-in versions; hidden recipe groups ${diagnostics.hiddenMenus} (${diagnostics.hiddenMenuVersions} versions); hidden individual versions ${diagnostics.hiddenVersions}; orphan/hidden saved edit keys ${diagnostics.orphanEdits}; visible versions lacking an original ${diagnostics.missingOriginals}.`,
  ''
 ];
 // Group-level audit datasets partition the visible versions. Combine
 // their warning taxonomy here so owner-created, saved-edit and unedited
 // versions are all represented in the same read-only triage.
 const warningFamilies=new Map(),missingNames=new Map();
 for(const kind of ['user','edited','unedited']){
  const group=groups[kind];
  for(const family of group.remediation?.warningGroups||[]){
   const entry=warningFamilies.get(family.type)||{label:family.label,warnings:0,versions:0};
   entry.warnings+=family.occurrences;
   entry.versions+=family.recipes;
   warningFamilies.set(family.type,entry);
  }
  for(const row of group.rows){
   if(row.error)continue;
   for(const warning of row.warnings||[]){
    const required=warning.match(/^분량 미확인:\s*(.+)$/)?.[1]?.trim();
    if(!required)continue;
    const key=required.normalize('NFKC').toLowerCase().replace(/\s+/g,' ');
    const entry=missingNames.get(key)||{name:required,count:0,versions:new Set()};
    entry.count++;
    entry.versions.add(kind+'|'+row.key);
    missingNames.set(key,entry);
   }
  }
 }
 // Combine single-ingredient blockers across all three disjoint visible
 // groups. This ranks the actual potential unlocks rather than the frequency
 // of unknown nutrient rows alone (which can over-prioritize hard recipes).
 const blockers=new Map();
 let blockerTotal=0,potentialTotal=0;
 for(const kind of ['user','edited','unedited']){
  const group=groups[kind];
  blockerTotal+=group.remediation?.singleBlockerRecipes||0;
  potentialTotal+=group.remediation?.possibleReadyRecipes||0;
  const gaps=new Map((group.gaps||[]).map(row=>[
   String(row.ingredient).normalize('NFKC').toLowerCase().replace(/\s+/g,' '),row
  ]));
  for(const item of group.remediation?.singleBlockers||[]){
   const key=String(item.ingredient).normalize('NFKC').toLowerCase().replace(/\s+/g,' ');
   const entry=blockers.get(key)||{name:item.ingredient,oneGap:0,potential:0,causes:new Map()};
   entry.oneGap+=item.nutrientOnlyRecipes;
   entry.potential+=item.possibleReadyRecipes;
   const gap=gaps.get(key);
   for(const [cause,count] of Object.entries(gap?.causes||{}))
    entry.causes.set(cause,(entry.causes.get(cause)||0)+count);
   blockers.set(key,entry);
  }
 }
 lines.push('=== COMPLETE VISIBLE LIBRARY — SINGLE-INGREDIENT BLOCKER PRIORITIES ===');
 lines.push(`Exactly one ingredient missing kcal/sodium: ${blockerTotal} versions; potential calculation-ready after verified resolution: ${potentialTotal} versions (not guaranteed)`);
 lines.push('Priority is potential calculation-ready versions first, then number of one-ingredient-gap versions. Missing source data, ambiguous identity and unit conversions are different tasks.');
 for(const item of [...blockers.values()].filter(row=>row.potential>0).sort((a,b)=>
  b.potential-a.potential||b.oneGap-a.oneGap||a.name.localeCompare(b.name,'ko')
 ).slice(0,top)){
  const causes=[...item.causes].sort((a,b)=>b[1]-a[1]).map(([cause,count])=>
   (reasonLabels[cause]||cause)+'×'+count
  ).join(', ');
  lines.push(`- ${item.name}: ${item.potential} otherwise review-free versions / ${item.oneGap} one-ingredient-gap versions; ${causes||'cause unspecified'}`);
 }
 lines.push('No nutrient number, product selection, g↔mL conversion or missing ingredient quantity is inferred. Review the exact product and original food form before entering verified evidence.');
 lines.push('');
 lines.push('=== COMPLETE VISIBLE RECIPE LIBRARY — WARNING TRIAGE ===');
 lines.push('All currently visible versions, partitioned into direct user, saved-edit and unedited groups. Category counts can overlap; the version count below is unique within each category, not a count of distinct recipes across categories.');
 for(const family of [...warningFamilies.values()].sort((a,b)=>b.warnings-a.warnings||a.label.localeCompare(b.label,'ko'))){
  lines.push(`- ${family.label}: ${family.warnings} warnings in ${family.versions} visible versions`);
 }
 lines.push('Most repeated required-name quantity warnings (not automatically verified missing food):');
 for(const entry of [...missingNames.values()].sort((a,b)=>b.versions.size-a.versions.size||b.count-a.count||a.name.localeCompare(b.name,'ko')).slice(0,top)){
  lines.push(`- ${entry.name}: ${entry.versions.size} visible versions, ${entry.count} warnings`);
 }
 lines.push('Triage only: a missing-quantity warning can come from genuinely unmeasured seasoning, a different product, an ambiguous alternative or an unrecognized measured label. No source text, product identity, nutrient estimate, included row or cooking quantity was changed by this report.');
 lines.push('');
 const headings={
  user:'DIRECT USER-CREATED RECIPES',
  edited:'VISIBLE BUILT-IN VERSIONS WITH SAVED EDITS',
  unedited:'VISIBLE BUILT-IN VERSIONS WITHOUT SAVED EDITS'
 };
 for(const key of ['user','edited','unedited']){
  const group=groups[key];
  lines.push(`--- ${headings[key]} ---`);
  lines.push(`${group.audited} audited; quantified kcal/Na coverage ${group.quantifiedNutrientComplete}; calculation-ready ${group.calculationReady}; historical no-gap including zero rows ${group.nutrientComplete}; warnings ${group.withWarnings}; no quantified rows ${group.noQuantifiedRows}; row review flags ${group.withRowReviews}; errors ${group.errorCount}.`);
  const absent=group.rows.filter(row=>row.included===0||row.error).slice(0,examples).map(row=>row.name);
  if(absent.length)lines.push('No quantified rows or calculation errors (first entries): '+absent.join(' / '));
  const exampleWarnings=group.rows.filter(row=>!row.error&&row.warnings?.length).slice(0,examples);
  if(exampleWarnings.length){
   lines.push('Example recipes requiring a quantity/preparation check:');
   for(const row of exampleWarnings)lines.push(' - '+row.name+': '+row.warnings.slice(0,2).join(' / '));
  }
  if(group.remediation){
   const triage=group.remediation;
   lines.push(`One missing nutrient ingredient: ${triage.singleBlockerRecipes} recipes; ${triage.possibleReadyRecipes} have no other automated quantity/review flags.`);
   for(const item of triage.singleBlockers.filter(row=>row.possibleReadyRecipes>0).slice(0,top)){
    lines.push(` - potential fix ${item.ingredient}: ${item.possibleReadyRecipes} otherwise review-free recipes; ${item.nutrientOnlyRecipes} one-ingredient-gap recipes`);
   }
   if(triage.warningGroups.length){
    lines.push('Quantity/preparation warning types (all raw warnings preserved):');
    for(const group of triage.warningGroups.slice(0,10))
     lines.push(` - ${group.label}: ${group.occurrences} warnings / ${group.recipes} recipes`);
   }
  }
  if(group.gaps.length){
   lines.push('Largest unresolved nutrient impacts:');
   for(const row of group.gaps.slice(0,top)){
    const causes=Object.entries(row.causes||{}).sort((a,b)=>b[1]-a[1]).map(([cause,count])=>(reasonLabels[cause]||cause)+'×'+count).join(', ');
    lines.push(` - ${row.ingredient}: ${row.recipes.length} recipes, ${row.occurrences} occurrences; ${causes||'unclassified'}`);
   }
  }
  lines.push('');
 }
 lines.push('Coverage limits: historical no-gap includes zero-quantity recipes, but quantified kcal/Na coverage excludes them. Calculation-ready additionally excludes quantity warnings and active row review flags. Counts are for currently visible recipe versions, not the number of menu cards shown at once. Original source text is parsed only for a version without saved edits; no source text, pantry record or recipe is modified. Ingredient labels, optional choices, discarded oil, extraction and recipe-stage amounts still require measurement/review.');
 return lines.join('\n')+'\n';
}
