import {productNutrition,nutritionAliases,preparedNutritionSupplement,nutritionConversions,nutritionCatalog,genericNutritionCatalog} from './nutrition-data.js';
import * as VOCAB from './kitchen-vocabulary.js';
import {NUTRIENTS,nutritionKey} from './nutrition.js';
import {needsProductNutrition} from './nutrition-product-policy.js';
import {normalizeIngredientDetectionText,detectionRuleProvesMeasuredQuantity} from './ingredient-detection.js?v=20261018-2';
import {getStock,ingredientIdentity,matchingNames} from './data.js?v=20260919-6';
import {createProductRules} from './nutrition-product-rules.js';
export {productNutrition};

// Product-specific identity and evidence rules of this deployment.
const rules=createProductRules({productNutrition,preparedNutritionSupplement,nutritionCatalog,nutritionKey,getStock,normalizeIngredientDetectionText});
const catalogIndex=new Map(Object.entries(genericNutritionCatalog).map(([name,nutrition])=>[nutritionKey(name),{name,nutrition}]));
const metricNames={energy:'(?:칼로리|열량)',sodium:'나트륨',carbs:'탄수화물',sugars:'당류',fat:'(?<!포화|불포화|트랜스|조)지방',saturatedFat:'포화지방',protein:'단백질',fiber:'식이섬유',cholesterol:'콜레스테롤',transFat:'트랜스지방'};
const denominator=/(\d+(?:\.\d+)?)\s*(mL|ml|g)\s*(?:당|기준)|\/\s*(\d+(?:\.\d+)?)\s*(mL|ml|g)/g;
const sameMetricRate=(a,b)=>Boolean(a&&b&&a.unit===b.unit&&a.amount>0&&b.amount>0&&Math.abs(a.value/a.amount-b.value/b.amount)<=1e-9);
export function nutritionFromNotes(notes=[]){
 const found={};
 for(const note of notes){
  // A mixed product note is not a nutrition label for the mixture.
  if(/섞여|구분 불가|혼합 비율/.test(note))continue;
  const denoms=[...note.matchAll(denominator)].map(m=>({amount:Number(m[1]||m[3]),unit:(m[2]||m[4]).toLowerCase()}));
  const packageBasis=note.match(/총\s*(\d+(?:\.\d+)?)\s*(mL|ml|g)\s*(?:\([^)]*\))?\s*당/i);
  const perPiece=/(?:1\s*(?:정|개|봉|포)\s*당|개당)/.test(note);
  const serving=note.match(/(\d+(?:\.\d+)?)\s*g\s*1\s*(?:회분|조각|포)(?:\s*당)?/);
  let common=packageBasis?{amount:Number(packageBasis[1]),unit:packageBasis[2].toLowerCase()}:serving?{amount:Number(serving[1]),unit:'g'}:perPiece?{amount:1,unit:'piece'}:null;
  if(!common&&denoms.length&&denoms.every(d=>d.amount===denoms[0].amount&&d.unit===denoms[0].unit))common=denoms[0];
  const salt=note.match(/식염상당량\s*([\d,.]+)\s*g/);
  if(salt&&common&&!found.sodium)found.sodium={value:Number(salt[1].replaceAll(',',''))*400,...common,kind:'user',source:'직접 적은 식염상당량÷2.5',note};
  for(const [key,label] of Object.entries(metricNames)){
   const regex=key==='energy'?/(?:칼로리|열량)?\s*([\d,]+(?:\.\d+)?)\s*kcal(?:\s*\/\s*(\d+(?:\.\d+)?)\s*(mL|ml|g))?/gi:new RegExp(label+'\\s*([\\d,]+(?:\\.\\d+)?)\\s*(mg|g)(?:\\s*\\/\\s*(\\d+(?:\\.\\d+)?)\\s*(mL|ml|g))?','g');
   for(const m of note.matchAll(regex)){
    const own=key==='energy'?(m[2]?{amount:Number(m[2]),unit:m[3].toLowerCase()}:null):(m[3]?{amount:Number(m[3]),unit:m[4].toLowerCase()}:null),basis=own||common;
    if(!basis)continue;
    let value=Number(m[1].replaceAll(',',''));
    if(key!=='energy'&&m[2]!==NUTRIENTS[key][1])value*=m[2]==='g'?1000:0.001;
    const metric={value,...basis,kind:'user',source:'직접 적은 제품 메모',note};
    if(found[key]&&JSON.stringify([found[key].value,found[key].amount,found[key].unit])!==JSON.stringify([value,basis.amount,basis.unit])){
     if(sameMetricRate(found[key],metric))found[key]=metric;
     else found[key]=null;
    }else if(found[key]!==null)found[key]=metric;
   }
  }
 }
 return Object.fromEntries(Object.entries(found).filter(([,v])=>v));
}
export function nutritionProductKey(name,stockOverrides={}){
 const detail=getStock(name,stockOverrides);
 // An existing K-FIND review is a specific product profile; never infer a
 // different catalog product from the ingredient name or an old stock note.
 if(detail.nutrition?.kfindEvidence?.dataset==='K-FIND')return null;
 if(Object.hasOwn(detail.nutrition||{},'productKey'))return detail.nutrition.productKey;
 const noteText=(detail.notes||[]).join(' ');
 const ruled=rules.noteProductKey(name,noteText,detail,stockOverrides);
 if(ruled!==undefined)return ruled;
 const canonical=nutritionAliases[name]||name;
 if(productNutrition[canonical])return canonical;
 return null;
}
export function ingredientNutrition(name,stockOverrides={},context={}){
 const detail=getStock(name,stockOverrides);
 const canonical=nutritionAliases[name]||name;
 const entry=catalogIndex.get(nutritionKey(canonical));
 const hasManualProductChoice=Object.hasOwn(detail.nutrition||{},'productKey');
 // Backwards-compatible for K-FIND reviews saved before productKey:null was
 // persisted. Unknown nutrients must not acquire generic catalog data.
 const reviewedKfind=detail.nutrition?.kfindEvidence?.dataset==='K-FIND';
 const manualOnly=detail.nutrition?.productKey===null||reviewedKfind;
 const notes=detail.nutrition?.ignoreNotes?{}:nutritionFromNotes(detail.notes);
 // Preparation/source-specific enrichment is automatic, so an explicit
 // product choice/unlink in the editor always wins over it.
 const contextual=hasManualProductChoice?null:rules.sourceSpecificNutritionFor(name,context)||rules.preparedNutritionFor(name,context);
 const productKey=nutritionProductKey(name,stockOverrides);
 // Explicit 5.8% (or any non-10%) recipe batch must never inherit a stock
 // profile for the distinct 10% product, even if the stock note identifies it.
 const salinityConflict=rules.blocksStockProduct(name,context,productKey);
 const product=reviewedKfind?null:contextual||(salinityConflict?null:productNutrition[productKey]);
 const conversion=manualOnly?{}:nutritionConversions[productKey]||nutritionConversions[entry?.name]||nutritionConversions[canonical]||{};
 const needsProduct=needsProductNutrition(name,detail.notes)||needsProductNutrition(canonical,detail.notes)||Boolean(product);
 let generic=needsProduct||manualOnly?{}:entry?.nutrition||{};
 if(name==='레드 퀴노아'&&!manualOnly&&nutritionCatalog['퀴노아'])generic=Object.fromEntries(Object.entries(nutritionCatalog['퀴노아']).filter(([,n])=>n?.value!=null).map(([key,n])=>[key,{...n,value:n.value/0.9,kind:'estimate',note:'사용자 메모: 전처리 후 무게가 생것의 90%. 수분만 감소한 것으로 추정.'}]));
 return {...generic,...product,...conversion,...notes,...detail.nutrition};
}
const metricSignature=metric=>metric==null?null:[metric.value,metric.amount,metric.unit,metric.kind||'',metric.source||'',metric.url||'',metric.note||''];
const calculationProfileSignature=profile=>JSON.stringify({
 nutrients:Object.fromEntries(Object.keys(NUTRIENTS).map(key=>[key,metricSignature(profile?.[key])])),
 gramsPerMl:profile?.gramsPerMl??null,
 gramsPerPiece:profile?.gramsPerPiece??null,
 conversionNote:profile?.conversionNote||''
});
function equivalentCandidateNutrition(names,stock,context={}){
 const profiles=names.map(name=>ingredientNutrition(name,stock,context));
 // Do not use equivalence to hide product-specific uncertainty. At minimum the
 // two metrics shown in the recipe summary must be known for every candidate.
 if(!profiles.length||profiles.some(profile=>!profile?.energy||!profile?.sodium))return null;
 const signature=calculationProfileSignature(profiles[0]);
 return profiles.every(profile=>calculationProfileSignature(profile)===signature)?profiles[0]:null;
}
export function createNutritionResolver(context={}){
 const stock=context.stockOverrides||{},pantry=context.pantry||[],history=context.ingredientHistory||[],detectionRules=Array.isArray(context.ingredientDetectionRules)?context.ingredientDetectionRules:[];
 const savedNames=[...new Set([...pantry,...history.map(r=>r.name),...Object.keys(stock)])];
 const exact=new Map(savedNames.map(name=>[nutritionKey(name),name]));
 const exactDetectionTargets=raw=>{
  const key=normalizeIngredientDetectionText(raw);
  if(!key)return [];
  const targets=[];
  for(const rule of detectionRules){
   const sourceName=String(rule?.sourceName||'').trim();
   if(!sourceName)continue;
   const saved=exact.get(nutritionKey(sourceName));
   if(!saved)continue;
   const names=Array.isArray(rule?.detectNames)?rule.detectNames:[];
   if(names.some(name=>normalizeIngredientDetectionText(name)===key))targets.push(saved);
  }
  return [...new Set(targets)];
 };
 const quantityCandidates=raw=>{
  const source=String(raw||'');
  if(source.includes('/'))return [];
  const warningOnly={'달걀':['계란 노른자','노른자','흰자'],...rules.quantityWarningOnly}[source]||[];
  const candidates=[...new Set([...matchingNames(source),...warningOnly])];
  if(!warningOnly.length&&candidates.length<=1)return [];
  // The old pantry-family fallback also contains a managed pasta alias.
  // Deleting "스파게티면" in detection settings must not keep that
  // deleted name active through a hidden legacy match list.
  // Keep the explicitly named historical product for existing
  // saved recipes, which never had that particular managed alias.
  if(normalizeIngredientDetectionText(source)===normalizeIngredientDetectionText('파스타면')){
   return candidates.filter(candidate=>
    rules.legacyPastaProducts.some(product=>normalizeIngredientDetectionText(candidate)===normalizeIngredientDetectionText(product))||
    resolve.legacyQuantityEvidenceAllowed?.(source,candidate)!==false);
  }
  return candidates;
 };
 const resolve=(raw,resolutionContext={})=>{
  const originalRaw=raw;
  let reason='';
  // A beaten-egg mixture is still the declared egg ingredient. Bridge only the
  // exact recipe wording and only while no separately saved egg-liquid item exists.
  const eggLiquidTarget={'달걀물':'달걀','계란물':'달걀'}[raw];
  if(!exact.has(nutritionKey(raw))&&eggLiquidTarget&&exact.has(nutritionKey(eggLiquidTarget)))raw=eggLiquidTarget;
  // Deployment rules may bridge one generic recipe wording to a held product.
  raw=rules.bridgeHeldProduct(raw,{exact,stock});
  // These exact recipe forms describe the same ingredient and preparation.
  // Only bridge to a saved item; an explicitly saved frozen item keeps its own
  // product choice, manual values and exclusions. Never strip 냉동 globally.
  const frozenTarget=VOCAB.frozenIngredientBridges[raw];
  const conflictingGenericUdon=raw==='냉동 우동면'&&savedNames.some(name=>nutritionKey(name).includes(nutritionKey('우동면'))&&nutritionKey(name)!==nutritionKey(frozenTarget));
  if(!exact.has(nutritionKey(raw))&&frozenTarget&&exact.has(nutritionKey(frozenTarget))&&!conflictingGenericUdon)raw=frozenTarget;
  if(!exact.has(nutritionKey(raw))){
   const detectionTargets=exactDetectionTargets(raw);
   if(detectionTargets.length===1){
    raw=detectionTargets[0];
    reason=pantry.includes(raw)?'자동 감지 보유 제품 연결':'자동 감지 기존 식재료 연결';
   }else if(detectionTargets.length>1){
    return {name:raw,nutrition:{},reason:'자동 감지 규칙이 여러 식재료에 연결돼요. 사용할 제품을 선택해 주세요.'};
   }
  }
  const single=rules.singleHeldVariant(raw,{resolutionContext,exact,pantry,stock,savedNames});
  if(single){raw=single.name;reason=single.reason;}
  const alias=nutritionAliases[raw];if(alias)raw=alias;
  const key=nutritionKey(raw);let name=exact.get(key);
  if(!name){
   const normalized=ingredientIdentity(raw),options=new Set([normalized,...matchingNames(raw)].map(nutritionKey));
   const candidates=savedNames.filter(n=>options.has(nutritionKey(n))||nutritionKey(ingredientIdentity(n))===nutritionKey(normalized));
   const held=candidates.filter(n=>pantry.includes(n));
   const selected=held.length===1?held:candidates;
   if(selected.length===1){name=selected[0];reason=pantry.includes(name)?'보유 제품 연결':'기존 식재료 연결';}
   else if(selected.length>1){
    const shared=equivalentCandidateNutrition(selected,stock,{...resolutionContext,rawName:resolutionContext.rawName||originalRaw});
    if(shared)return {name:raw,nutrition:shared,reason:'동일한 영양정보의 보유 후보를 공통값으로 계산'};
    return {name:raw,nutrition:{},reason:'여러 식재료가 연결돼요. 사용할 제품을 선택해 주세요.'};
   }
  }
  // An exact generic name is kept generic if several product lots could match.
  if(!name)name=catalogIndex.get(key)?.name||Object.keys(productNutrition).find(n=>nutritionKey(n)===key);
  if(!name)return {name:raw,nutrition:{},reason:'제품·식재료 연결 확인 필요'};
  const nutrition=ingredientNutrition(name,stock,{...resolutionContext,rawName:resolutionContext.rawName||originalRaw});
  return {name,nutrition,productKey:nutritionProductKey(name,stock)||'',reason:reason||(!pantry.includes(name)&&Object.hasOwn(stock,name)?'이전 식재료의 영양정보':'')};
 };
 // Quantity identity follows the same owner-managed ingredient detection
 // rules used to prepare recipe ingredient drafts. Unlike the draft matcher,
 // it requires exact membership in a single rule; it does not pick nutrients.
 resolve.quantityEvidenceMatches=(required,measured)=>
  detectionRuleProvesMeasuredQuantity(required,measured,detectionRules);
 // Older recipes rely on a tiny number of conservative quantity-only
 // shorthand forms. Preserve them before owner customization, but do not
 // let those hardcoded forms override edits in "자동 감지 설정".
 // Never use these exceptions to resolve product identity or nutrients.
 // Ambiguous ownership cannot prove a measured required food. The one
 // historical broad family with genuinely distinct written shapes is
 // "파스타면". Preserve existing one-rule synonym/product behavior rather
 // than treating every alternate spelling as a different food.
 resolve.quantityRequiresExactEvidence=required=>{
  const key=normalizeIngredientDetectionText(required);
  if(!key)return false;
  const owners=detectionRules.filter(rule=>[
   rule?.sourceName,rule?.displayName,
   ...(Array.isArray(rule?.detectNames)?rule.detectNames:[])
  ].some(name=>normalizeIngredientDetectionText(name)===key));
  if(owners.length!==1)return owners.length>1;
  const source=normalizeIngredientDetectionText(owners[0].sourceName);
  const display=normalizeIngredientDetectionText(owners[0].displayName);
  return source===display&&display===normalizeIngredientDetectionText('파스타면')&&key!==display;
 };
 resolve.legacyQuantityEvidenceAllowed=(required,measured)=>{
  const requiredKey=normalizeIngredientDetectionText(required);
  const measuredKey=normalizeIngredientDetectionText(measured);
  const owners=detectionRules.filter(rule=>[
   rule?.sourceName,rule?.displayName,
   ...(Array.isArray(rule?.detectNames)?rule.detectNames:[])
  ].some(name=>normalizeIngredientDetectionText(name)===requiredKey));
  if(!owners.length)return true; // unconfigured legacy state
  if(owners.length!==1)return false; // conflicting rule ownership
  const rule=owners[0];
  if(!rule.customized)return true; // unchanged auto-generated rule
  const managed=new Set((Array.isArray(rule.detectNames)?rule.detectNames:[])
   .map(normalizeIngredientDetectionText));
  if(managed.has(measuredKey))return true;
  // A managed generic name may explicitly cover one known branded form.
  return rules.managedMeasuredBridge(requiredKey,measuredKey,managed);
 };
 resolve.quantityCandidates=quantityCandidates;
 return resolve;
}
