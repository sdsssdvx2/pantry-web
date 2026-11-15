// On-demand, read-only analysis using the SAME amount parser and nutrient
// calculator as the recipe editor. Never invent missing amounts or products.
// A candidate indicates a useful next investigation, not a finished recipe.
const list=v=>Array.isArray(v)?v:[];
const text=v=>typeof v==='string'?v:'';
const stepText=v=>Array.isArray(v)?v.join('\n'):text(v);
const isObject=v=>v&&typeof v==='object'&&!Array.isArray(v);

export function analyzeNutritionSingleBlockers({
 recipes=[],sourceEdits=[],eligibleNames=[],resolve,parseRecipeAmounts,calculateRecipeNutrition
}={}){
 if(typeof resolve!=='function'||typeof parseRecipeAmounts!=='function'||
    typeof calculateRecipeNutrition!=='function')throw Error('NUTRITION_ANALYSIS_CALLBACKS_REQUIRED');
 const eligible=new Set(eligibleNames);
 // Don't parse potentially hundreds of recipe versions if no pantry nutrient
 // values are actually missing.
 if(!eligible.size)return {byName:new Map(),examplesByName:new Map(),versions:0,quantified:0,errors:0};
 const edits=new Map();
 for(const entry of list(sourceEdits)){
  if(!entry?.sourceId||!entry.variantKey||!isObject(entry.recipe))continue;
  const key=entry.sourceId+'|'+entry.variantKey;
  // Match recipe-model.js: the first saved edit for a version wins.
  if(!edits.has(key))edits.set(key,entry.recipe);
 }
 const impact=new Map(),examplesByName=new Map(),seen=new Set();
 let versions=0,quantified=0,errors=0;
 for(const base of list(recipes)){
  if(!isObject(base)||!base.id)continue;
  const variants=list(base.variants).length?base.variants:[null];
  for(const variant of variants){
   const vKey=variant?.key||'base',unique=base.id+'|'+vKey;
   if(seen.has(unique))continue;seen.add(unique);
   const edit=edits.get(unique);
   const required=list(edit?.required??variant?.required??base.required);
   // The source recipe's original is the amount-bearing text. Saved edits
   // deliberately replace it; custom recipes use their authored steps.
   const original=text(variant?.original)||(!variant?text(base.original):'');
   const raw=edit?.steps!==undefined?stepText(edit.steps):
    original.trim()?original:stepText(variant?.steps??base.steps);
   if(!raw.trim())continue;
   versions++;
   const plan=edit?.nutritionPlan??edit?.nutrition??
    variant?.nutritionPlan??variant?.nutrition??base.nutritionPlan??base.nutrition;
   try{
    const parsed=parseRecipeAmounts(raw,required);
    const calc=calculateRecipeNutrition(parsed,resolve,isObject(plan)?plan:{servings:1,overrides:[]});
    const active=list(calc?.rows).filter(row=>row?.included&&row.percent>0);
    if(!active.length)continue;
    quantified++;
    const missing=active.filter(row=>row?.values?.energy==null||row?.values?.sodium==null);
    if(!missing.length)continue;
    const names=new Set(missing.map(row=>row.ingredient||row.name).filter(Boolean));
    if(names.size!==1)continue;
    const name=names.values().next().value;
    if(!eligible.has(name))continue;
    // An unresolved identity/competing product rule is not a nutrient-only
    // blocker. A label value cannot complete a recipe until the owner
    // chooses which actual food/product that measured row represents.
    const unresolvedIdentity=missing.some(row=>
     /제품·식재료 연결 확인 필요|여러 식재료가 연결돼요|자동 감지 규칙이 여러 식재료에 연결돼요/
      .test(String(row.resolution||'')));
    if(unresolvedIdentity)continue;
    // One missing food is NOT necessarily one fix. If *any* missing
    // energy/sodium cell already has a source profile, its failure needs
    // a separate unit/amount conversion (or other review), not a new
    // nutrient label. Exclude this mixed-cause case from "one fix" leads.
    const nutrientOnly=missing.every(row=>
     (row.values?.energy!=null||!row.profile?.energy)&&
     (row.values?.sodium!=null||!row.profile?.sodium));
    if(!nutrientOnly)continue;
    const entry=impact.get(name)||{singleBlockerVersions:0,reviewFreeCandidates:0};
    entry.singleBlockerVersions++;
    // Dormant saved evidence belongs to a different identity/preparation/
    // product; its existence is a separate owner review obligation even
    // when the current profile has no kcal/sodium. Do not label it clean.
    const reviewFree=list(calc?.warnings).length===0&&
       active.every(row=>!row.review)&&
       missing.every(row=>!row.evidenceDormant);
    if(reviewFree)entry.reviewFreeCandidates++;
    impact.set(name,entry);
    // Keep bounded, private recipe examples entirely in the owner's browser.
    // These are investigation leads, not a guarantee of complete nutrition.
    const title=text(edit?.name||variant?.name||base.name).trim();
    if(title){
     const label=text(variant?.label||base.variantLabel).trim();
     const example=(title+(label?' · '+label:'')).slice(0,120);
     const examples=examplesByName.get(name)||{clean:[],review:[]};
     const list=reviewFree?examples.clean:examples.review;
     if(!list.includes(example)&&list.length<3)list.push(example);
     examplesByName.set(name,examples);
    }
   }catch{
    // A broken individual recipe cannot be counted as ready. Report the
    // number of skipped versions without printing private source text.
    errors++;
   }
  }
 }
 return {byName:impact,examplesByName,versions,quantified,errors};
}
