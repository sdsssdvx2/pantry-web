import {needsProductNutrition} from './nutrition-product-policy.js';
// Pure, read-only triage. Potential recipe mentions are not guaranteed
// nutrient fixes or proof of any packaged food's identity.
const hasMetric=metric=>metric&&typeof metric==='object'&&
 typeof metric.value==='number'&&Number.isFinite(metric.value)&&metric.value>=0&&
 typeof metric.amount==='number'&&Number.isFinite(metric.amount)&&metric.amount>0&&
 ['g','ml','piece'].includes(metric.unit);
const ambiguous=reason=>/여러 식재료|여러 제품|선택 필요|연결 확인|불명확|모호/.test(String(reason||''));

export function rankNutritionGaps({pantry=[],recipes=[],sourceEdits=[],resolve=()=>({}),stockDetail=()=>({notes:[]})}={}){
 const byName=new Map();
 const cached=new Map();
 const lookup=name=>{
  if(!cached.has(name)){
   try{cached.set(name,resolve(name)||{name,nutrition:{}});}
   catch{cached.set(name,{name,nutrition:{},reason:'식재료 연결 확인 필요'});}
  }
  return cached.get(name);
 };
 for(const name of pantry){
  if(typeof name!=='string'||byName.has(name))continue;
  const result=lookup(name);
  const exact=result.name===name&&!ambiguous(result.reason);
  const profile=exact?result.nutrition||{}:{};
  const missing=['energy','sodium'].filter(key=>!hasMetric(profile[key]));
  // A numbered estimate is not a missing metric, but neither is it a
  // validated package label. Keep the two research tasks visibly distinct.
  const estimated=['energy','sodium'].filter(key=>
   hasMetric(profile[key])&&profile[key].kind==='estimate');
  if(!missing.length&&!estimated.length)continue;
  // Product policy is shared with the actual nutrition resolver. A generic
  // food value is NOT proof of the specific package, brand or mixed pantry item.
  // Never guess which product is currently in the pantry.
  let requiresProductLabel=false;
  try{
   const detail=stockDetail(name);
   requiresProductLabel=needsProductNutrition(name,
    Array.isArray(detail?.notes)?detail.notes:[]);
  }catch{requiresProductLabel=true;}
  byName.set(name,{name,missing,estimated,mentions:0,needsIdentity:!exact,
    requiresProductLabel});
 }
 const edits=new Map();
 for(const entry of sourceEdits){
  if(!entry||typeof entry!=='object'||typeof entry.sourceId!=='string')continue;
  const id=entry.sourceId+'|'+String(entry.variantKey||'');
  if(!edits.has(id))edits.set(id,entry.recipe);
 }
 let scanned=0;
 for(const base of recipes){
  if(!base||typeof base!=='object')continue;
  const variants=Array.isArray(base.variants)&&base.variants.length?base.variants:[null];
  for(const variant of variants){
   scanned++;
   const edited=edits.get(String(base.id||'')+'|'+String(variant?.key||''));
   const required=Array.isArray(edited?.required)?edited.required:
    Array.isArray(variant?.required)?variant.required:base.required;
   const hit=new Set();
   for(const label of Array.isArray(required)?required:[]){
    if(typeof label!=='string'||!label.trim())continue;
    const mapped=lookup(label);
    if(ambiguous(mapped.reason))continue;
    const record=byName.get(mapped.name);
    if(record)hit.add(record.name);
   }
   for(const name of hit)byName.get(name).mentions++;
  }
 }
 // Never let a widely used but numerically complete estimated product displace
 // a product actually missing kcal/sodium. Keep the secondary review separate.
 const impactOrder=(a,b)=>b.mentions-a.mentions||b.missing.length-a.missing.length||
  a.name.localeCompare(b.name,'ko');
 const missingRows=[...byName.values()].filter(r=>r.missing.length).sort(impactOrder);
 // A zero mention means no match in visible recipes' required arrays. It
 // does NOT prove the food is unused (steps and optional rows are not parsed).
 // Keep all unknown nutrition visible without crowding the actionable queue.
 const mentionedMissingRows=missingRows.filter(r=>r.mentions>0);
 const unmentionedMissingRows=missingRows.filter(r=>r.mentions===0);
 const estimateRows=[...byName.values()].filter(r=>!r.missing.length&&r.estimated.length).sort(impactOrder);
 const rows=[...missingRows,...estimateRows];
 return {total:rows.length,missingTotal:missingRows.length,
  estimateOnlyTotal:estimateRows.length,missingRows,mentionedMissingRows,
  unmentionedMissingRows,estimateRows,scanned,rows};
}
