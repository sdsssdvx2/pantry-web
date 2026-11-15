import {NUTRIENTS} from './nutrition.js';
import {stockPriorityDate,pantryDateValue,priorityBasis} from './pantry-priority.js';
import {withVersions} from './recipe-versions.js';
import {recipes as seedRecipes,SEED_REVISION} from './data.js?v=20260919-6';
import {migrateRecipeGroupMeta,validateRecipeGroupMeta} from './recipe-group-meta.js';
import {validateCuration,validateLibrary} from './backup-validation.js?v=20260919-1';
export {validateCuration,validateLibrary};
import {validateRatings} from './ratings.js';
import {hash,legacyFingerprint,legacyHashes,validText,validateCookingHistory,validateCustom,validateEdits,validateHidden,validateHiddenVariants,validatePurgedVariants,validateIngredientHistory,validateItems,validateRecipe,validateStock} from './state-validation.js?v=20260919-5';
import {latestCookedMap,mergeCookingHistory} from './cooking-history.js';
import {PANTRY_GROUP_VERSION,migratePantryStockGroups} from './pantry-groups.js?v=20260919-2';
import {RECIPE_CATEGORY_VERSION,migrateRecipeCategoryEdits} from './recipe-categories.js?v=20260919-2';
import {createInitialIngredientDetectionRules,normalizeIngredientDetectionRules} from './ingredient-detection.js?v=20261018-2';
// Human-readable exports always include every serving, regardless of filters.
export function recipesText({recipes,custom,edits,hidden,ratings={},cookingHistory={},lastCooked={},archive,categoryName,effortName}) {
 const lines=['나의 작은 주방 · 전체 레시피',`내보낸 시각: ${new Date().toLocaleString('ko-KR')}`,`메뉴 ${recipes.length+custom.length}개 · 인분/버전 ${[...recipes,...custom].reduce((n,r)=>n+(withVersions(r,edits).variants?.length||1),0)}개`,
  '검색·필터와 관계없이 숨긴 메뉴, 모든 인분, 수정본과 원문, 나만의 메모를 포함합니다.',''];
 for(const base of [...recipes,...custom].map(r=>withVersions(r,edits))){
  const cookedRows=Array.isArray(cookingHistory[base.id])?cookingHistory[base.id]:[],latest=cookedRows[0]||lastCooked[base.id]||'';
  const cookedAt=latest&&Number.isFinite(Date.parse(latest))?new Date(latest).toLocaleString('ko-KR'):'';
  lines.push('='.repeat(48),base.name+(hidden.includes(base.id)?' [메뉴에서 숨김]':''),`나의 별점: ${ratings[base.id]?ratings[base.id]+' / 5':'평가 안 함'} (모든 인분 공통)`,`최근 조리: ${cookedAt||'기록 없음'} (모든 인분 공통)`,`먹은 기록: ${cookedRows.length}회`);
  if(cookedRows.length)lines.push('먹은 날짜: '+cookedRows.map(value=>new Date(value).toLocaleString('ko-KR')).join(' / '));
  for(const v of base.variants||[null]){
   const edit=edits.find(e=>e.sourceId===base.id&&e.variantKey===v?.key);
   const r={...base,...v,...edit?.recipe};
   lines.push('',`[${edit?.label||v?.label||'직접 추가한 레시피'}]`,r.name,`종류: ${categoryName(r.category)} / 수고: ${effortName(r.effort)} / 약 ${r.time}분`,
    `필수 재료: ${r.required.join(', ')}`,`선택 재료: ${r.optional.join(', ')||'없음'}`,`간단한 방향: ${r.summary}`);
   if(r.prep)lines.push(`사전 준비·대기: ${r.prep}`);
   if(r.pairing)lines.push(`추천 음료·곁들임: ${r.pairing}`);
   if(r.servingNote)lines.push(`함께 먹는 구성: ${r.servingNote}`);
   if(r.related?.length)lines.push('연결된 레시피: '+r.related.map(id=>[...recipes,...custom].find(x=>x.id===id)?.name||id).join(' / '));
   if(r.contextSource)lines.push(`공통 메모 출처: ${r.contextSource}`);
   if(r.reviewNote)lines.push(`검토 메모: ${r.reviewNote}`);
   lines.push('',edit?'[내가 수정한 조리 기록]':'[조리 기록]',v?.original&&!edit?v.original:r.steps.join('\n'));
   if(r.note)lines.push('','[나만의 메모]',r.note);
   if(edit&&v?.original)lines.push('','[업로드한 원문 · 수정 전]',v.original);
   if(v?.sourceFile)lines.push('',`출처: ${v.sourceFile} · ${v.sourceLine}행`);
  }
 }
 lines.push('','='.repeat(48),'참고 기록 · 업로드한 전체 원문',
  '아래는 중복·이전 버전·잘 안 쓰는 요리를 포함한 원래 기록입니다. 위 메뉴와 중복될 수 있습니다.');
 for(const r of archive)lines.push('',`[${r.status}] ${r.displayTitle||r.title}`,`출처: ${r.source==='main'?'요리 레시피.txt':r.source==='personal'?'직접 작성':'잘 안 쓰는 요리 레시피.txt'} · ${r.line}행`,`정리 메모: ${r.reason}`,r.note??r.original,...(r.note!==undefined&&r.source!=='personal'?['[수정 전 원문]',r.original]:[]));
 return lines.join('\n');
}
export function stockText(items,getStock,statusNames,groups,locations){
 const lines=['나의 작은 주방 · 식재료와 보관 메모',`내보낸 시각: ${new Date().toLocaleString('ko-KR')}`,`보유 재료 ${items.length}개`,''];
 for(const name of items){const d=getStock(name),automatic=stockPriorityDate(name,d);lines.push(`• ${name}`,`분류: ${groups[d.group]}`,`재고 상태: ${statusNames[d.status]}`,...(d.addedAt?[`재고 추가일: ${pantryDateValue(d.addedAt)}`]:[]),...(d.priorityDate?[`소비 우선일: ${d.priorityDate}`]:automatic?[`${automatic.quality?'냉동 품질 목표일':'자동 소비 우선일'}: ${automatic.value} · ${priorityBasis(automatic)}`]:[]),...(d.priorityStartDate?[`보관 기준일: ${d.priorityStartDate}`]:[]),'보관 위치:',...(d.locations.length?d.locations.map(l=>'  - '+l):['  미지정']),'제품·분량·보관 메모:',...(d.notes.length?d.notes:['없음']),...(d.nutrition?['영양정보:',...Object.entries(NUTRIENTS).filter(([key])=>d.nutrition[key]).map(([key,[label,unit]])=>{const n=d.nutrition[key];return `  ${label}: ${n.value}${unit} / ${n.amount}${n.unit==='piece'?'개':n.unit} · ${n.source||'직접 입력'}${n.url?' · '+n.url:''}`;}),...(d.nutrition.gramsPerMl?[`  1mL = ${d.nutrition.gramsPerMl}g`]:[]),...(d.nutrition.gramsPerPiece?[`  1개 = ${d.nutrition.gramsPerPiece}g`]:[])]:[]),'');}
 lines.push('='.repeat(48),'보관 위치 가이드','괄호 안 용도는 정리 기준입니다. 필요하면 다른 칸에 보관해도 됩니다.');
 for(const [value,area,label,hint] of locations)lines.push(`${area} · ${label}${hint?' ('+hint+')':''}`);
 return lines.join('\n');
}

export function parseKitchenBackup(value,{currentRecipes=seedRecipes}={}){
 if(!value||![1,2,3].includes(value.version)||(value.version===3&&value.kind!=='my-kitchen-full-backup'))throw Error('이 주방에서 만든 JSON 백업을 선택해 주세요.');
 const library=value.version===3||value.library?validateLibrary(value.library,validText,validateRecipe,seedRecipes):null;
 const target=library?.recipes||currentRecipes;
 const custom=validateCustom(value.recipes||[]);
 const editMigration=migrateRecipeCategoryEdits(validateEdits(value.edits||[],target,custom),Number.isInteger(value.recipeCategoryVersion)?value.recipeCategoryVersion:1),edits=editMigration.edits;
 const stockMigration=migratePantryStockGroups(validateStock(value.stock||{}),Number.isInteger(value.pantryGroupVersion)?value.pantryGroupVersion:1);
 const incoming={
  items:validateItems(value.items),
  recipes:custom,
  stock:stockMigration.stock,
  history:validateIngredientHistory(value.history||[]),
  historySeedVersion:Number.isInteger(value.historySeedVersion)?value.historySeedVersion:0,
  pantryGroupVersion:stockMigration.version,
  recipeCategoryVersion:editMigration.version,
  edits,
  recipeGroupMeta:validateRecipeGroupMeta(value.recipeGroupMeta||{},validText),
  hidden:validateHidden(value.hidden||[],target),
  hiddenVariants:validateHiddenVariants(value.hiddenVariants||[],target,edits,custom),
  trashPurgedVariants:validatePurgedVariants(value.trashPurgedVariants||[],target),
  trashPurged:validateHidden(value.trashPurged||[],target),
  ratings:validateRatings(value.ratings||{}),
  cookingHistory:validateCookingHistory(value.cookingHistory,value.lastCooked)
 };
 incoming.ingredientDetectionRules=value.ingredientDetectionRules===undefined?createInitialIngredientDetectionRules([...incoming.items,...incoming.history.map(item=>item.name),...Object.keys(incoming.stock)]):normalizeIngredientDetectionRules(value.ingredientDetectionRules);
 incoming.hiddenVariants=incoming.hiddenVariants.filter(key=>!incoming.trashPurgedVariants.includes(key));
 incoming.lastCooked=latestCookedMap(incoming.cookingHistory);
 incoming.recipeGroupMeta=migrateRecipeGroupMeta(incoming.recipeGroupMeta,[...target,...incoming.recipes],incoming.edits);
 if(value.version===1)incoming.recipes=incoming.recipes.filter(r=>!legacyHashes.has(hash(legacyFingerprint(value.recipes.find(x=>x.id===r.id)))));
 if(value.version===3&&incoming.items.some(name=>!Object.hasOwn(incoming.stock,name)))throw Error('일부 재료의 상세 정보가 빠진 전체 백업이에요.');
 return {...incoming,library,full:value.version===3,sourceVersion:value.version};
}

export function buildKitchenRestoreState(incoming,{replace=false,currentState,currentRecipes=seedRecipes,currentLibrary=null,seedRevision=SEED_REVISION}={}){
 if(!incoming||!currentState)throw Error('복원할 백업 상태를 확인해 주세요.');
 if(replace){
  return {version:2,seedRevision,items:incoming.items,recipes:incoming.recipes,stock:incoming.stock,history:incoming.history||[],ingredientDetectionRules:incoming.ingredientDetectionRules||[],historySeedVersion:incoming.historySeedVersion||0,pantryGroupVersion:incoming.pantryGroupVersion||PANTRY_GROUP_VERSION,recipeCategoryVersion:incoming.recipeCategoryVersion||RECIPE_CATEGORY_VERSION,edits:incoming.edits,recipeGroupMeta:incoming.recipeGroupMeta||{},hidden:incoming.hidden,hiddenVariants:incoming.hiddenVariants||[],trashPurgedVariants:incoming.trashPurgedVariants||[],trashPurged:incoming.trashPurged||[],ratings:incoming.ratings,cookingHistory:incoming.cookingHistory||{},lastCooked:latestCookedMap(incoming.cookingHistory||{}),...((incoming.library||currentLibrary)?{library:incoming.library||currentLibrary}:{})};
 }
 const currentItems=currentState.items||[],currentRecipesCustom=currentState.recipes||[];
 const stock={...(currentState.stock||{})};for(const name of incoming.items)if(!currentItems.includes(name)&&Object.hasOwn(incoming.stock,name))stock[name]=incoming.stock[name];
 const recipes=validateCustom([...currentRecipesCustom,...incoming.recipes.filter(r=>!currentRecipesCustom.some(x=>x.id===r.id))]);
 const items=validateItems([...currentItems,...incoming.items]);
 const history=validateIngredientHistory([...(currentState.history||[]),...(incoming.history||[]).filter(h=>!(currentState.history||[]).some(x=>x.name===h.name))]).filter(h=>!items.includes(h.name));
 const currentCookingHistory=validateCookingHistory(currentState.cookingHistory,currentState.lastCooked),mergedCookingHistory=mergeCookingHistory(incoming.cookingHistory,currentCookingHistory);
 const currentDetection=normalizeIngredientDetectionRules(currentState.ingredientDetectionRules||[]),incomingDetection=normalizeIngredientDetectionRules(incoming.ingredientDetectionRules||[]),currentDetectionIds=new Set(currentDetection.map(rule=>rule.id));
 const ingredientDetectionRules=normalizeIngredientDetectionRules([...currentDetection,...incomingDetection.filter(rule=>!currentDetectionIds.has(rule.id))]);
 return {...currentState,items,history,ingredientDetectionRules,historySeedVersion:Math.max(currentState.historySeedVersion||0,incoming.historySeedVersion||0),pantryGroupVersion:PANTRY_GROUP_VERSION,recipeCategoryVersion:RECIPE_CATEGORY_VERSION,recipes,stock,
  edits:validateEdits([...(currentState.edits||[]),...incoming.edits.filter(v=>!(currentState.edits||[]).some(e=>e.sourceId===v.sourceId&&e.variantKey===v.variantKey))],currentRecipes,recipes),
  hidden:[...new Set([...(currentState.hidden||[]),...incoming.hidden])],hiddenVariants:[...new Set([...(currentState.hiddenVariants||[]),...(incoming.hiddenVariants||[])])].filter(key=>![...new Set([...(currentState.trashPurgedVariants||[]),...(incoming.trashPurgedVariants||[])])].includes(key)),trashPurgedVariants:[...new Set([...(currentState.trashPurgedVariants||[]),...(incoming.trashPurgedVariants||[])])],trashPurged:[...new Set([...(currentState.trashPurged||[]),...(incoming.trashPurged||[])])],
  recipeGroupMeta:{...(incoming.recipeGroupMeta||{}),...(currentState.recipeGroupMeta||{})},ratings:validateRatings({...incoming.ratings,...(currentState.ratings||{})}),cookingHistory:mergedCookingHistory,lastCooked:latestCookedMap(mergedCookingHistory)};
}
