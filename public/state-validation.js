import {categories,recipes as seedRecipes} from './data.js?v=20260919-6';
import {groups} from './pantry-groups.js?v=20260919-2';
import {validateExtras} from './recipe-context.js';
import {validateNutrition,validateRecipeNutrition} from './nutrition.js';

export const statusNames={available:'사용 가능',incoming:'배송 중',check:'사용 확인',locate:'위치 확인',curry:'카레용'};
export const legacyHashes=new Set(["e442b5ef","47520ddf","74c5aa17","fcb40ca9","5f90fe87","b06319bf","d8faf624","ce5c241","3d453a87","b40d04ac","24a76dc7","ae3fd423","782ea408","c1a50174","9dfe7644","e0c026a5","a655445c","c55dd2d8","678c867c","ba4eb154","c311b17b","20880053","7a2ec2d2","fe1fba4c","76220f6e","a444ee50","9e609564"]);

export function legacyFingerprint(r){return JSON.stringify([r.name,r.category,r.effort,r.time,r.required,r.optional||[],r.summary||'',r.steps,r.note||'']);}
export function hash(v){let h=2166136261;for(const c of v){h^=c.codePointAt(0);h=Math.imul(h,16777619);}return(h>>>0).toString(16);}
export function validText(v,max=8000){if(typeof v!=='string'||v.length>max)throw Error('글자 수와 입력 형식을 확인해 주세요.');return v.trim();}
export function validateItems(items){if(!Array.isArray(items)||items.length>1000)throw Error('재료는 최대 1,000개까지 저장할 수 있어요.');return [...new Set(items.map(x=>{const s=validText(x,150);if(!s)throw Error('빈 재료명이 있어요.');return s.normalize('NFKC').replace(/\s+/g,' ');}))];}
export function validateIngredientDetectionRules(values){
 if(values===undefined)return [];
 if(!Array.isArray(values)||values.length>2000)throw Error('자동 감지 식재료는 최대 2,000개까지 저장할 수 있어요.');
 const ids=new Set();
 return values.map(value=>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('자동 감지 식재료 설정을 확인해 주세요.');
  const id=validText(value.id,120),sourceName=validText(value.sourceName||'',150),displayName=validText(value.displayName,150);
  if(!id||!/^[a-z0-9._:-]+$/i.test(id)||ids.has(id))throw Error('자동 감지 식재료 ID를 확인해 주세요.');
  ids.add(id);
  if(!displayName)throw Error('자동 감지 식재료의 표시 이름을 입력해 주세요.');
  const detectNames=validateItems(value.detectNames||[]);
  if(!detectNames.length||detectNames.length>20)throw Error('감지할 이름은 식재료마다 1~20개까지 입력할 수 있어요.');
  return {id,sourceName,displayName:displayName.normalize('NFKC').replace(/\s+/g,' '),detectNames,customized:!!value.customized};
 });
}
export function validateRecipe(v){const __modifiedAt=typeof v?.modifiedAt==='string'&&Number.isFinite(Date.parse(v.modifiedAt))?v.modifiedAt:'';
 if(!v||typeof v!=='object'||!/^user-[a-z0-9-]+$/.test(v.id))throw Error('레시피 형식이 올바르지 않아요.');
 const name=validText(v.name,100),summary=validText(v.summary||'',180),note=validText(v.note||'',8000);if(!name)throw Error('메뉴 이름을 입력해 주세요.');
 if(!categories.some(c=>c[0]!=='all'&&c[0]===v.category)||![1,2,3,4,5].includes(v.effort)||!Number.isInteger(v.time)||v.time<1||v.time>1440)throw Error('음식 종류·수고·시간을 확인해 주세요.');
 const required=validateItems(v.required).filter(x=>x!=='물'),optional=validateItems(v.optional||[]).filter(x=>x!=='물'&&!required.includes(x));
 if(!required.length||required.length>80||optional.length>80)throw Error('필수 재료는 1~80개, 선택 재료는 최대 80개예요.');
 if(!Array.isArray(v.steps)||!v.steps.length||v.steps.length>250)throw Error('조리 순서는 1~250줄로 입력해 주세요.');
 const steps=v.steps.map(x=>{validText(x,10000);return x;});if(!steps.some(s=>s.trim())||steps.join('\n').length>80000)throw Error('조리 순서의 길이를 확인해 주세요.');
 return {...validateExtras(v,validText),...(v.nutritionPlan?{nutritionPlan:validateRecipeNutrition(v.nutritionPlan)}:{}),...(__modifiedAt?{modifiedAt:__modifiedAt}:{}),id:v.id,name,summary:summary||'내가 적어둔 우리 집 레시피.',note,category:v.category,effort:v.effort,time:v.time,required,optional,steps,custom:true};
}
export function validateCustom(values){if(!Array.isArray(values)||values.length>500)throw Error('직접 추가한 레시피는 최대 500개예요.');const result=values.map(validateRecipe);if(new Set(result.map(r=>r.id)).size!==result.length)throw Error('중복 레시피 ID가 있어요.');return result;}
export function validatePriorityDate(value){
 if(value===undefined||value==='')return '';
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('소비 우선일을 확인해 주세요.');
 const [year,month,day]=value.split('-').map(Number),date=new Date(Date.UTC(year,month-1,day));
 if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)throw Error('소비 우선일을 확인해 주세요.');
 return value;
}
function validatePriorityRuleValue(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('자동 계산 기간을 확인해 주세요.');
 const amount=Number(value.amount),unit=value.unit;
 const max=unit==='months'?120:3650;
 if(!['days','months'].includes(unit)||!Number.isInteger(amount)||amount<1||amount>max)throw Error('자동 계산 기간은 1일~3650일 또는 1~120개월로 입력해 주세요.');
 return {amount,unit};
}
export function validatePriorityRule(value){
 if(value===undefined||value===null||value==='')return null;
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('자동 계산 기간을 확인해 주세요.');
 if(Object.hasOwn(value,'byArea')){
  if(!value.byArea||typeof value.byArea!=='object'||Array.isArray(value.byArea))throw Error('보관 위치별 자동 계산 기간을 확인해 주세요.');
  const allowed=new Set(['room','chilled','frozen','custom']),entries=Object.entries(value.byArea);
  if(entries.length>4)throw Error('보관 위치별 자동 계산 기간을 확인해 주세요.');
  const byArea={};
  for(const [area,rule] of entries){if(!allowed.has(area))throw Error('보관 위치별 자동 계산 기간을 확인해 주세요.');byArea[area]=validatePriorityRuleValue(rule);}
  return Object.keys(byArea).length?{byArea}:null;
 }
 return validatePriorityRuleValue(value);
}
function validateTimestamp(value,label){
 if(value===undefined||value==='')return '';
 if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))throw Error(label);
 return new Date(value).toISOString();
}
export function validateStock(values){if(!values||typeof values!=='object'||Array.isArray(values)||Object.keys(values).length>1000)throw Error('재고 정보 형식이 올바르지 않아요.');const out=Object.create(null);for(const [key,v]of Object.entries(values)){const name=validText(key,150);if(!v||!Object.hasOwn(statusNames,v.status)||!Array.isArray(v.locations)||!Array.isArray(v.notes))throw Error('재고 상태를 확인해 주세요.');if(v.group!==undefined&&(!Number.isInteger(v.group)||v.group<0||v.group>=groups.length))throw Error('재료 분류를 확인해 주세요.');const priorityDate=validatePriorityDate(v.priorityDate),addedAt=validateTimestamp(v.addedAt,'식재료 추가 시각을 확인해 주세요.');const priorityStartDate=validatePriorityDate(v.priorityStartDate),priorityRule=validatePriorityRule(v.priorityRule);out[name]={...(v.nutrition?{nutrition:validateNutrition(v.nutrition)}:{}),...(v.group!==undefined?{group:v.group}:{}),status:v.status,locations:v.locations.map(x=>validText(x,3000)),notes:v.notes.map(x=>validText(x,8000)),...(priorityDate?{priorityDate}:{}),...(addedAt?{addedAt}:{}),...(priorityStartDate?{priorityStartDate}:{}),...(priorityRule?{priorityRule}:{})};if(v.locations.length>30||v.notes.join('\n').length>8000)throw Error('재고 메모가 너무 길어요.');}return out;}
export function validateEdits(values,library=seedRecipes,custom=[]){
 if(!Array.isArray(values)||values.length>500)throw Error('레시피 수정 기록 형식이 올바르지 않아요.');
 const keys=new Set();
 return values.map(v=>{const r=[...library,...custom].find(r=>r.id===v.sourceId);const label=v.label===undefined?'':validText(v.label,100);
  if(!r||(!r.variants?.some(x=>x.key===v.variantKey)&&!(r.custom&&v.variantKey==='base')&&!(label&&/^version-[a-z0-9-]+$/.test(v.variantKey))))throw Error('수정 기록의 원본을 찾을 수 없어요.');
  const key=r.id+'/'+v.variantKey;if(keys.has(key))throw Error('중복된 인분·버전 수정 기록이 있어요.');keys.add(key);
  return {sourceId:r.id,variantKey:v.variantKey,recipe:validateRecipe(v.recipe),...(label?{label}:{})};
 });
}
export function validateHidden(values,library=seedRecipes){if(!Array.isArray(values))throw Error('숨긴 레시피 목록 형식이 올바르지 않아요.');return [...new Set(values.map(x=>validText(x,100)))].filter(id=>library.some(r=>r.id===id));}
export const variantStateKey=(sourceId,variantKey)=>sourceId+'/'+variantKey;
const builtInVariantKeys=library=>new Set(library.flatMap(r=>(r.variants||[]).map(v=>variantStateKey(r.id,v.key))));
export function validateHiddenVariants(values,library=seedRecipes,edits=[],custom=[]){
 if(values===undefined)return [];
 if(!Array.isArray(values)||values.length>2000)throw Error('숨긴 인분·버전 목록 형식이 올바르지 않아요.');
 const recipes=[...library,...custom],allowed=builtInVariantKeys(recipes);
 for(const edit of edits||[])if(edit?.label&&recipes.some(recipe=>recipe.id===edit.sourceId))allowed.add(variantStateKey(edit.sourceId,edit.variantKey));
 return [...new Set(values.map(x=>validText(x,220)))].filter(key=>allowed.has(key));
}
export function validatePurgedVariants(values,library=seedRecipes){
 if(values===undefined)return [];
 if(!Array.isArray(values)||values.length>2000)throw Error('완전 삭제한 인분·버전 목록 형식이 올바르지 않아요.');
 const allowed=builtInVariantKeys(library);
 return [...new Set(values.map(x=>validText(x,220)))].filter(key=>allowed.has(key));
}
export function validateIngredientHistory(values){
 if(values===undefined)return [];
 if(!Array.isArray(values)||values.length>1000)throw Error('이전 식재료 기록 형식이 올바르지 않아요.');
 const seen=new Set(),result=[];
 for(const value of values){
  const name=validText(value?.name,150);if(!name||seen.has(name))continue;seen.add(name);
  const archivedAt=typeof value?.archivedAt==='string'&&(!value.archivedAt||Number.isFinite(Date.parse(value.archivedAt)))?value.archivedAt:'';
  result.push({name,archivedAt});
 }
 return result;
}
export function validateLastCooked(value){
 if(value===undefined)return {};
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>1000)throw Error('최근 조리 기록 형식이 올바르지 않아요.');
 const result={};
 for(const [rawId,rawAt] of Object.entries(value)){
  const id=validText(rawId,160);if(!id)continue;
  if(typeof rawAt!=='string'||!Number.isFinite(Date.parse(rawAt)))throw Error('최근 조리 시각을 확인해 주세요.');
  result[id]=new Date(rawAt).toISOString();
 }
 return result;
}

export function validateCookingHistory(value,legacyLastCooked={}){
 const legacy=validateLastCooked(legacyLastCooked);
 if(value===undefined)value={};
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>1000)throw Error('조리 이력 형식이 올바르지 않아요.');
 const ids=new Set([...Object.keys(legacy),...Object.keys(value)]),result={};let total=0;
 for(const rawId of ids){
  const id=validText(rawId,160);if(!id)continue;
  const raw=value[rawId]??[];
  if(!Array.isArray(raw)||raw.length>1000)throw Error('레시피별 조리 이력이 너무 많아요.');
  const rows=[...raw,...(legacy[id]?[legacy[id]]:[])].map(at=>{
   if(typeof at!=='string'||!Number.isFinite(Date.parse(at)))throw Error('조리 이력 시각을 확인해 주세요.');
   return new Date(at).toISOString();
  });
  const unique=[...new Set(rows)].sort((a,b)=>Date.parse(b)-Date.parse(a));
  total+=unique.length;if(total>20000)throw Error('조리 이력이 너무 많아요.');
  if(unique.length)result[id]=unique;
 }
 return result;
}

