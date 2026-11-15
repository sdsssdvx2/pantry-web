import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export function installLocalJsonFetch(){
 globalThis.fetch=async input=>{
  const url=input instanceof URL?input:new URL(String(input));
  if(url.protocol!=='file:')throw new Error(`Nutrition audit only permits local file fetches, got ${url.protocol}`);
  const file=fileURLToPath(url);
  try{
   const text=fs.readFileSync(file,'utf8');
   return {ok:true,status:200,json:async()=>JSON.parse(text),text:async()=>text};
  }catch(error){
   if(error?.code==='ENOENT')return {ok:false,status:404,json:async()=>{throw error;},text:async()=>''};
   throw error;
  }
 };
}

const recipeKey=(recipe,index)=>`${recipe.id||recipe.sourceId||'recipe'}|${recipe.variantKey||recipe.variantLabel||''}|${index}`;
const recipeText=recipe=>Array.isArray(recipe?.steps)?recipe.steps.join('\n'):String(recipe?.steps||'');
const recipeName=recipe=>String(recipe?.name||recipe?.title||recipe?.id||'이름 없는 레시피');
const metricState=profile=>({energy:!!profile?.energy,sodium:!!profile?.sodium});
// Classify the evidence behind *both* numbers, not just their presence.
// Even a product catalog entry is not proof that the owner's packaging lot
// matches; no category below asserts independently verified exact-package data.
const pantryEvidence=profile=>{
 if(!profile?.energy||!profile?.sodium)return 'incomplete';
 const kinds=[profile.energy.kind,profile.sodium.kind];
 if(kinds.includes('estimate'))return 'estimated';
 if(kinds.every(kind=>kind==='user'))return 'owner-entered';
 if(kinds.every(kind=>kind==='product'))return 'product-reference';
 if(kinds.every(kind=>kind==='generic'))return 'generic-reference';
 return 'mixed-or-unattributed';
};
const percent=v=>Math.round(v*10)/10;
const nutritionNameKey=v=>String(v||'').normalize('NFKC').toLowerCase().replace(/\s+/g,'');
const causeLabels={
 ambiguous:'제품 선택 필요',
 unresolved:'식재료 연결 필요',
 conversion:'g↔mL·개 단위 환산값 필요',
 drop:'방울 단위 실측 무게(g) 필요',
 fragment:'조각 단위 실측 무게(g) 필요',
 nutrient:'해당 영양성분 자료 필요',
 unknown:'추가 확인 필요'
};
// Warning classification is diagnostic only: never suppress a warning or
// turn ambiguous cooking quantities into measured food.
const warningTypes={
 missing:'필수 재료 계량 누락',
 intake:'조리 과정에서 실제 섭취·추출된 영양량 확인',
 mismatch:'재료 목록·조리 단계 분량 불일치',
 reserveWater:'면수 따로 확보하는 조리 지시',
 conditionalWater:'조건부 면수 추가량 확인',
 retainedFat:'조리 후 남기거나 덜어둔 기름 확인',
 substitution:'대체 재료·분량 선택 확인',
 quantityContext:'조리 문장 속 수량 의미 확인',
 discard:'절임·양념·기름 실제 섭취량 확인',
 noRows:'계산 가능한 재료 분량 없음',
 stepSource:'재료 목록 밖 조리 단계의 수량 감지',
 other:'기타 확인 필요'
};
export function nutritionWarningType(warning=''){
 const s=String(warning);
 if(s.startsWith('분량 미확인:'))return 'missing';
 if(s.startsWith('실제 섭취량 확인:'))return 'intake';
 if(s.startsWith('대체 재료·분량 선택 확인:'))return 'substitution';
 if(s.startsWith('분량 불일치:'))return 'mismatch';
 if(s.startsWith('분량 확인:')){
  if(/면수\s*\d+(?:\.\d+)?\s*g\s*남겨놓기/.test(s))return 'reserveWater';
  if(/면수\s*\d+(?:\.\d+)?\s*g\s*씩\s*추가/.test(s))return 'conditionalWater';
  if(/(?:기름|오리기름)[^\n]{0,28}\d+(?:\.\d+)?\s*g(?:만|\s*정도만)?\s*남기|기름[^\n]{0,20}\d+(?:\.\d+)?\s*g[^\n]{0,35}덜어두기/.test(s))return 'retainedFat';
  if(/(?:대신|교체|함께\s*넣지)/.test(s))return 'substitution';
  return 'quantityContext';
 }
 if(s.startsWith('계산할 분량'))return 'noRows';
 if(s.startsWith('조리 단계에서 분량'))return 'stepSource';
 if(s.startsWith('양념·기름을 남기는'))return 'discard';
 return 'other';
}
function missingCause(row,key){
 const reason=String(row.resolution||'');
 if(reason.includes('여러 식재료'))return 'ambiguous';
 if(reason.includes('제품·식재료 연결 확인 필요'))return 'unresolved';
 const metric=row.profile?.[key];
 if(!metric)return 'nutrient';
 if(row.unit==='drop')return 'drop';
 if(row.unit==='fragment')return 'fragment';
 if(row.unit!==metric.unit)return 'conversion';
 return 'unknown';
}

export async function auditNutritionState(snapshot){
 const state=snapshot?.state??snapshot??{};
 const pantry=Array.isArray(state.items)?state.items:[];
 const stock=state.stock&&typeof state.stock==='object'?state.stock:{};
 const history=Array.isArray(state.history)?state.history:[];
 const detectionRules=Array.isArray(state.ingredientDetectionRules)?state.ingredientDetectionRules:[];
 const custom=Array.isArray(state.custom)?state.custom:[];
 const edits=(Array.isArray(state.edits)?state.edits:[]).map(row=>row?.recipe).filter(Boolean);

 const {ingredientNutrition,createNutritionResolver}=await import('../public/nutrition-resolver.js');
 const {parseRecipeAmounts,calculateRecipeNutrition}=await import('../public/nutrition.js');
 const resolve=createNutritionResolver({pantry,stockOverrides:stock,ingredientHistory:history,ingredientDetectionRules:detectionRules});

 const pantryRows=pantry.map(name=>{
  const profile=ingredientNutrition(name,stock);
  const status=metricState(profile);
  return {name,energy:status.energy,sodium:status.sodium,evidence:pantryEvidence(profile)};
 });
 const pantryComplete=pantryRows.filter(row=>row.energy&&row.sodium).length;
 const pantryPartial=pantryRows.filter(row=>row.energy!==row.sodium).length;
 const pantryMissing=pantryRows.filter(row=>!row.energy&&!row.sodium).length;
 const evidenceCounts=Object.fromEntries(
  ['owner-entered','product-reference','generic-reference','estimated','mixed-or-unattributed']
   .map(kind=>[kind,pantryRows.filter(row=>row.evidence===kind).length])
 );

 const recipes=[...custom,...edits];
 const seen=new Set(),recipeRows=[],gapMap=new Map(),singleBlockerMap=new Map();
 for(const [index,recipe] of recipes.entries()){
  const key=recipeKey(recipe,index);if(seen.has(key))continue;seen.add(key);
  const raw=recipeText(recipe);if(!raw.trim())continue;
  const parsed=parseRecipeAmounts(raw,Array.isArray(recipe.required)?recipe.required:[]);
  // The recipe editor persists per-row product links, inclusion and percentages
  // as `nutritionPlan`. `nutrition` is retained only as a legacy fallback for
  // snapshots created before that field name was standardized.
  const savedPlan=recipe.nutritionPlan??recipe.nutrition;
  const settings=savedPlan&&typeof savedPlan==='object'?savedPlan:{servings:1,overrides:[]};
  let calculated;
  try{calculated=calculateRecipeNutrition(parsed,resolve,settings);}catch(error){
   recipeRows.push({name:recipeName(recipe),key,error:error.message,warnings:parsed.warnings,rows:[]});continue;
  }
  const included=calculated.rows.filter(row=>row.included&&row.percent>0);
  const energyMissing=included.filter(row=>row.values.energy==null);
  const sodiumMissing=included.filter(row=>row.values.sodium==null);
  const anyMissing=included.filter(row=>row.values.energy==null||row.values.sodium==null);
  // Count only included, nonzero-use ingredient rows with unresolved review flags.
  const rowReviewCount=included.filter(row=>!!row.review).length;
  // A recipe with one distinct unresolved ingredient can sometimes become
  // nutrient-complete by verifying that ingredient. Multiple lines or missing
  // metrics for the same ingredient never inflate its recipe count.
  const missingIngredients=[...new Set(anyMissing.map(row=>row.ingredient||row.name))];
  if(included.length>0&&missingIngredients.length===1){
   const ingredient=missingIngredients[0];
   const entry=singleBlockerMap.get(ingredient)||{ingredient,recipes:new Set(),readyCandidates:new Set()};
   entry.recipes.add(key);
   if(calculated.warnings.length===0&&rowReviewCount===0)entry.readyCandidates.add(key);
   singleBlockerMap.set(ingredient,entry);
  }
  for(const row of anyMissing){
   const gapKey=row.ingredient||row.name;
   const entry=gapMap.get(gapKey)||{ingredient:gapKey,occurrences:0,recipes:new Set(),energyMissing:0,sodiumMissing:0,resolutions:new Set(),causes:new Map(),sourceNames:new Map()};
   entry.occurrences++;
   entry.recipes.add(recipeName(recipe));
   const sourceName=String(row.sourceName||row.name||gapKey).trim();
   if(sourceName)entry.sourceNames.set(sourceName,(entry.sourceNames.get(sourceName)||0)+1);
   for(const key of ['energy','sodium'])if(row.values[key]==null){
    if(key==='energy')entry.energyMissing++;else entry.sodiumMissing++;
    const cause=missingCause(row,key);entry.causes.set(cause,(entry.causes.get(cause)||0)+1);
   }
   if(row.resolution)entry.resolutions.add(row.resolution);
   gapMap.set(gapKey,entry);
  }
  recipeRows.push({name:recipeName(recipe),key,included:included.length,energyMissing:energyMissing.length,sodiumMissing:sodiumMissing.length,warnings:calculated.warnings,rowReviewCount});
 }

 const gapRows=[...gapMap.values()].map(row=>({...row,recipes:[...row.recipes],resolutions:[...row.resolutions],causes:Object.fromEntries(row.causes),sourceNames:Object.fromEntries([...row.sourceNames.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'ko')))})).sort((a,b)=>
  b.recipes.length-a.recipes.length||b.occurrences-a.occurrences||String(a.ingredient).localeCompare(String(b.ingredient),'ko')
 );
 const singleBlockers=[...singleBlockerMap.values()].map(row=>({
  ingredient:row.ingredient,nutrientOnlyRecipes:row.recipes.size,possibleReadyRecipes:row.readyCandidates.size
 })).sort((a,b)=>b.possibleReadyRecipes-a.possibleReadyRecipes||
  b.nutrientOnlyRecipes-a.nutrientOnlyRecipes||a.ingredient.localeCompare(b.ingredient,'ko'));
 const warningMap=new Map();
 for(const row of recipeRows.filter(r=>!r.error)){
  for(const warning of row.warnings){
   const type=nutritionWarningType(warning);
   const entry=warningMap.get(type)||{type,label:warningTypes[type],occurrences:0,recipes:new Set(),examples:[]};
   entry.occurrences++;
   entry.recipes.add(row.key);
   if(entry.examples.length<4)entry.examples.push({name:row.name,warning});
   warningMap.set(type,entry);
  }
 }
 const warningGroups=[...warningMap.values()].map(row=>({...row,recipes:row.recipes.size}))
  .sort((a,b)=>b.occurrences-a.occurrences||a.type.localeCompare(b.type));
 const auditedRecipes=recipeRows.filter(row=>!row.error).length;
 // Historical "no gap" count is retained for comparison, including zero-row recipes.
 // The new metric requires at least one actually quantified *included* ingredient.
 const completeRecipes=recipeRows.filter(row=>!row.error&&row.energyMissing===0&&row.sodiumMissing===0).length;
 const quantifiedComplete=recipeRows.filter(row=>!row.error&&row.included>0&&row.energyMissing===0&&row.sodiumMissing===0).length;
 const calculationReady=recipeRows.filter(row=>!row.error&&row.included>0&&row.energyMissing===0&&row.sodiumMissing===0&&!row.warnings.length&&row.rowReviewCount===0).length;
 const noQuantifiedRows=recipeRows.filter(row=>!row.error&&row.included===0).length;
 const withWarnings=recipeRows.filter(row=>!row.error&&row.warnings.length>0).length;
 const withRowReviews=recipeRows.filter(row=>!row.error&&row.rowReviewCount>0).length;
 return {
  generatedAt:new Date().toISOString(),
  stateVersion:snapshot?.version??null,
  stateUpdatedAt:snapshot?.updatedAt??null,
  pantry:{total:pantryRows.length,complete:pantryComplete,partial:pantryPartial,missing:pantryMissing,coverage:pantryRows.length?percent(pantryComplete/pantryRows.length*100):100,evidenceCounts,rows:pantryRows},
  recipes:{total:recipeRows.length,audited:auditedRecipes,complete:completeRecipes,coverage:auditedRecipes?percent(completeRecipes/auditedRecipes*100):100,quantifiedComplete,quantifiedCoverage:auditedRecipes?percent(quantifiedComplete/auditedRecipes*100):100,calculationReady,noQuantifiedRows,withWarnings,withRowReviews,rows:recipeRows},
  gaps:gapRows,
  remediation:{
   singleBlockers,warningGroups,
   singleBlockerRecipes:[...new Set([...singleBlockerMap.values()].flatMap(row=>[...row.recipes]))].length,
   possibleReadyRecipes:[...new Set([...singleBlockerMap.values()].flatMap(row=>[...row.readyCandidates]))].length
  }
 };
}

const fmtMetric=(yes,label)=>yes?label:'—';
export function formatNutritionAudit(audit,{top=80}={}){
 const lines=[];
 lines.push('MY LITTLE KITCHEN — LIVE NUTRITION GAP AUDIT','');
 lines.push(`Generated: ${audit.generatedAt}`);
 if(audit.stateVersion!=null)lines.push(`Live snapshot version: ${audit.stateVersion}`);
 if(audit.stateUpdatedAt)lines.push(`Live state updatedAt: ${audit.stateUpdatedAt}`);
 lines.push('');
 lines.push(`CURRENT PANTRY: ${audit.pantry.complete}/${audit.pantry.total} have both kcal + sodium (${audit.pantry.coverage}%) · partial ${audit.pantry.partial} · both missing ${audit.pantry.missing}`);
 if(audit.pantry.evidenceCounts){
  const counts=audit.pantry.evidenceCounts;
  lines.push(`PANTRY EVIDENCE (both metrics only): owner-entered ${counts['owner-entered']||0}; product reference ${counts['product-reference']||0}; generic food ${counts['generic-reference']||0}; estimated/analog ${counts.estimated||0}; mixed or unattributed ${counts['mixed-or-unattributed']||0}`);
  lines.push('A reference category measures provenance, not whether the exact current package, preparation, serving size or actual intake has been independently validated.');
 }
 lines.push(`USER/EDITED RECIPES: ${audit.recipes.complete}/${audit.recipes.audited} have no kcal/sodium gaps in parsed included rows (${audit.recipes.coverage}%) — historical no-gap count, including zero quantified rows`);
 lines.push(`QUANTIFIED KCAL/NA COVERAGE: ${audit.recipes.quantifiedComplete}/${audit.recipes.audited} have at least one included quantified ingredient and no missing kcal/sodium (${audit.recipes.quantifiedCoverage}%) — not a confirmed intake total`);
 lines.push(`CALCULATION REVIEW: ${audit.recipes.calculationReady}/${audit.recipes.audited} have quantified included rows, no kcal/sodium gaps, no recipe warnings and no included row review flags`);
 lines.push(`NEEDS REVIEW: ${audit.recipes.withWarnings} recipes have quantity/preparation warnings; ${audit.recipes.noQuantifiedRows} have no quantified included rows; ${audit.recipes.withRowReviews} have included row review flags (counts overlap)`);
 lines.push('');
 lines.push('=== RECIPE-IMPACT GAPS ===');
 if(!audit.gaps.length)lines.push('No included kcal/sodium gaps found in current custom/edited recipes.');
 for(const [index,row] of audit.gaps.slice(0,top).entries()){
  const missing=[row.energyMissing?`kcal×${row.energyMissing}`:'',row.sodiumMissing?`Na×${row.sodiumMissing}`:''].filter(Boolean).join(', ');
  lines.push(`${index+1}. ${row.ingredient} — recipes ${row.recipes.length}, occurrences ${row.occurrences}, missing ${missing}`);
  lines.push(`   ${row.recipes.slice(0,6).join(' / ')}${row.recipes.length>6?' / …':''}`);
  const sourceForms=Object.entries(row.sourceNames||{}).filter(([name])=>nutritionNameKey(name)!==nutritionNameKey(row.ingredient)).slice(0,6).map(([name,count])=>`${name}×${count}`);
  if(sourceForms.length)lines.push(`   source forms: ${sourceForms.join(' / ')}`);
  const causes=Object.entries(row.causes||{}).sort((a,b)=>b[1]-a[1]).map(([cause,count])=>`${causeLabels[cause]||cause}×${count}`);
  if(causes.length)lines.push(`   cause: ${causes.join(' / ')}`);
  if(row.resolutions.length)lines.push(`   resolver: ${row.resolutions.join(' / ')}`);
 }
 lines.push('');
 if(audit.remediation){
  lines.push('=== PRIORITIZED SINGLE-INGREDIENT NUTRIENT BLOCKERS ===');
  lines.push(`Recipe versions with exactly one distinct ingredient missing kcal or sodium: ${audit.remediation.singleBlockerRecipes}; of these, ${audit.remediation.possibleReadyRecipes} have no other detected warning or included row-review flag.`);
  lines.push('Potential impact only: verified product identity, measured amount and both nutrient metrics are still required. No automatic nutrient substitution or calculation changes.');
  if(!audit.remediation.singleBlockers.length)lines.push('None.');
  for(const row of audit.remediation.singleBlockers.slice(0,30))
   lines.push(`- ${row.ingredient}: single-blocker recipes ${row.nutrientOnlyRecipes}; potential calculation-ready after verification ${row.possibleReadyRecipes}`);
  lines.push('');
  lines.push('=== QUANTITY / PREPARATION WARNING TRIAGE ===');
  lines.push('Grouped for investigation only; all original warnings remain below.');
  if(!audit.remediation.warningGroups.length)lines.push('None.');
  for(const row of audit.remediation.warningGroups){
   lines.push(`- ${row.label}: ${row.occurrences} warnings in ${row.recipes} recipes`);
   for(const example of row.examples.slice(0,2))lines.push(`   example ${example.name}: ${example.warning}`);
  }
  lines.push('');
 }
 lines.push('=== RECIPE QUANTITY / PREPARATION WARNINGS ===');
 const warningRows=audit.recipes.rows.filter(row=>!row.error&&row.warnings.length);
 if(!warningRows.length)lines.push('None.');
 for(const row of warningRows){
  lines.push(`- ${row.name} [${row.key}]: ${row.included} quantified included rows`);
  for(const warning of row.warnings)lines.push(`   ${warning}`);
 }
 lines.push('');
 lines.push('=== CURRENT PANTRY WITHOUT BOTH KCAL + SODIUM ===');
 const unresolved=audit.pantry.rows.filter(row=>!row.energy||!row.sodium);
 if(!unresolved.length)lines.push('None.');
 for(const row of unresolved)lines.push(`- ${row.name}: ${fmtMetric(row.energy,'kcal')} · ${fmtMetric(row.sodium,'Na')}`);
 lines.push('');
 lines.push('Notes:');
 lines.push('- This report is read-only. It never writes Cloudflare D1 or browser state.');
 lines.push('- Pantry evidence counts partition only entries with both kcal and sodium; missing and partial records remain separate. An estimated value in either metric places the pair in estimated/analog. Owner-entered notes and branded references are not independently authenticated current-package labels.');
 lines.push('- Gap causes distinguish missing nutrient data, ambiguous product selection, unresolved ingredient identity, and unit-conversion blockers.');
 lines.push('- `source forms` preserves the concrete ingredient wording found in recipes when it differs from the grouped gap name, so branded/source-specific blockers can be researched without weakening generic matching.');
 lines.push('- Missing information stays missing; the audit does not substitute a generic food value for a product that requires product-specific nutrition.');
 lines.push('- Recipe coverage currently audits user recipes and saved source edits present in the live state. Built-in recipes with no saved edit are outside this first-pass coverage.');
 lines.push('- Historical no-gap coverage counts zero-quantity recipes for continuity; QUANTIFIED KCAL/NA COVERAGE excludes them. Neither is a verified edible intake total: missing quantities, parser warnings, active ingredient row review flags and discarded oil/seasoning require separate review. No detected warnings or row review flags is an automated check, not a guarantee of measured intake.');
 return lines.join('\n')+'\n';
}

export function readSnapshot(file){return JSON.parse(fs.readFileSync(path.resolve(file),'utf8'));}