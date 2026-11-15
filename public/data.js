import * as VOCAB from './kitchen-vocabulary.js';
import {enrichSource} from './recipe-context.js';
import {groups,inferPantryGroup} from './pantry-groups.js?v=20260919-2';
import {stockPriorityDate} from './pantry-priority.js';
export {categories,inferRecipeCategory} from './recipe-categories.js?v=20260919-2';
// Historical migration modules are flattened into promoted-recipes.json by CI.
const [stock,sourceRecipes,promotedSnapshot] = await Promise.all(['inventory.json?v=20260919-2','recipes.json?v=20260919-2','promoted-recipes.json?v=20260919-1'].map(async path=>{const r=await fetch(new URL(path,import.meta.url));if(!r.ok)throw new Error('주방 자료를 불러오지 못했어요. 새로고침해 주세요.');return r.json();}));
const promotedSnapshotRecipes=Array.isArray(promotedSnapshot?.recipes)?promotedSnapshot.recipes:[];
export const SEED_REVISION='kitchen-taxonomy-2026-09-19-4';
export {groups};
export const pantryDetails=Object.fromEntries(stock.map(r=>[r.name,r]));
export const initialPantry=stock.map(r=>r.name);
export const catalog=Object.fromEntries(stock.map(r=>[r.name,r.group]));
export const efforts=[['all','모든 수고'],['1','거의 손 안 대기'],['2','간단히 조리'],['3','보통 수고'],['4','정성 들이기'],['5','많이 정성 들이기']];
const key=s=>s.normalize('NFKC').replace(/\s+/g,'').toLowerCase();
const aliases={};
function alias(name,values){for(const v of values.split('|'))aliases[key(v)]=name;}
for(const [name,values] of VOCAB.pantryAliases)alias(name,values);
const known=new Map(initialPantry.map(n=>[key(n),n]));
const wasabiRequest=new RegExp(VOCAB.wasabiRequestPattern);
// A house-made concentrate whose batches share one recipe name prefix.
const concentrateSauce=VOCAB.concentrateSaucePattern?new RegExp(VOCAB.concentrateSaucePattern):null;
export function normalize(value){return known.get(key(value))||aliases[key(value)]||value.trim().normalize('NFKC').replace(/\s+/g,' ');}
// Product-specific spellings that map to one saved pantry identity.
const identityPatterns=VOCAB.pantryIdentityPatterns.map(([pattern,target])=>[new RegExp(pattern),target]);
// Match lot labels without changing the user's saved inventory names.
export function ingredientIdentity(value){
 const name=String(value).normalize('NFKC').trim().replace(/^(?:난각번호\s*)?\d+\s*번\s*/,'').replace(/\s+\d+\s*번$/,'');
 if(/^(?:계란|달걀)(?:\s*\((?:난각번호\s*)?\d+번\))?$/.test(name))return '달걀';
 for(const [pattern,target] of identityPatterns)if(pattern.test(name))return target;
 return normalize(name);
}
const options=VOCAB.stockOptionFamilies;
export function matchingNames(name){return [...new Set(name.split(/\s*\/\s*/).flatMap(n=>[normalize(n),...(options[n]||[])].map(normalize)))];}
export function getStock(name,overrides={}){const d={name,group:inferPantryGroup(name,5),locations:[],notes:[],status:'available',...pantryDetails[name],...overrides[name]};if(VOCAB.instantRiceProducts.includes(name)&&!d.notes.some(n=>n.includes('즉석밥')))d.notes=[...d.notes,'즉석밥 · 레시피의 밥으로 사용'];return d;}

const pantryLookupCache=new WeakMap();
const heldCache=new WeakMap();
const riskyLoose=new Set(['소스','치즈','버터','우유','간장','식초','설탕','소금','후추','마요','김','밥','면','물','오일']);
function looseKey(value){return key(value).replace(/[^0-9a-z가-힣]/g,'');}
function phraseKey(value){return value.normalize('NFKC').toLowerCase().replace(/[^0-9a-z가-힣]+/g,' ').trim().replace(/\s+/g,' ');}
function looseForms(value){return [value,ingredientIdentity(value)].map(name=>({key:looseKey(name),phrase:phraseKey(name)}));}
function safeLooseMatch(a,b){
 return a.some((first,index)=>{
  const second=b[index],ak=first.key,bk=second.key;if(!ak||!bk||ak===bk)return false;
  const aShort=ak.length<=bk.length,shorter=aShort?ak:bk;
  if(shorter.length<3||riskyLoose.has(shorter))return false;
  const shortPhrase=(aShort?first:second).phrase,longPhrase=(aShort?second:first).phrase;
  return !!shortPhrase&&longPhrase.endsWith(' '+shortPhrase);
 });
}
function pantryLookup(pantry){
 let cached=pantryLookupCache.get(pantry);if(cached)return cached;
 const byName=new Map(),entries=[];
 for(const item of pantry){const normalized=ingredientIdentity(item);if(!byName.has(normalized))byName.set(normalized,[]);byName.get(normalized).push(item);entries.push({item,normalized,loose:looseForms(item)});}
 cached={byName,entries};pantryLookupCache.set(pantry,cached);return cached;
}
function heldNames(input,pantry,candidates,wantedWasabi,wantedSauce){
 let cache=heldCache.get(pantry);if(!cache){cache=new Map();heldCache.set(pantry,cache);}const cacheKey=input;
 if(cache.has(cacheKey))return cache.get(cacheKey);
 const {byName,entries}=pantryLookup(pantry),held=[];
 for(const candidate of candidates)for(const item of byName.get(ingredientIdentity(candidate))||[])if(!held.includes(item))held.push(item);
 const wantsShredded=input.split(/\s*\/\s*/).some(name=>key(name)==='슈레드치즈');
 const cheeseTypes=input.split(/\s*\/\s*/).map(name=>name.trim().match(/^(에멘탈|모짜렐라|체다|고르곤졸라|파르메산)(?:\s*치즈)?$/)?.[1]).filter(Boolean);
 if(wantsShredded)for(const {item} of entries)if(/슈레드/.test(item)&&/(?:치즈|에멘탈\s*슈레드)$/.test(item)&&!/소스|시즈닝|과자|피자|빵|샌드위치|치즈볼/.test(item)&&!held.includes(item))held.push(item);
 if(cheeseTypes.length)for(const {item} of entries)if(cheeseTypes.some(type=>item.includes(type))&&/(?:치즈|슈레드)$/.test(item)&&!/소스|시즈닝|과자|피자|빵|샌드위치|치즈볼/.test(item)&&!held.includes(item))held.push(item);
 if(wantedWasabi)for(const {item} of entries)if(/와사비/.test(item)&&!/시즈닝|마요|소스|과자|김|맛/.test(item)&&!held.includes(item))held.push(item);
 if(wantedSauce&&concentrateSauce)for(const {item} of entries)if(concentrateSauce.test(item)&&!held.includes(item))held.push(item);
 const looseCandidates=[...new Set([...candidates,...input.split(/\s*\/\s*/)])].map(looseForms);
 for(const {item,loose} of entries)if(!held.includes(item)&&looseCandidates.some(candidate=>safeLooseMatch(candidate,loose)))held.push(item);
 cache.set(cacheKey,held);return held;
}

export function matchIngredient(input,pantry,overrides,recipe){
 const name=VOCAB.matchNameRedirects[input]||input;
 const candidates=matchingNames(input);
 const wantedWasabi=wasabiRequest.test(input);
 const wantedSauce=Boolean(concentrateSauce?.test(input));
 const held=heldNames(input,pantry,candidates,wantedWasabi,wantedSauce);
 const allowed=held.filter(n=>{const s=getStock(n,overrides).status;return s==='available'||s==='incoming'||(s==='curry'&&recipe.name.includes('카레'));}).sort((a,b)=>{
  const aa=getStock(a,overrides),bb=getStock(b,overrides);
  return Number(aa.status==='incoming')-Number(bb.status==='incoming')||(stockPriorityDate(a,aa)?.value||'9999').localeCompare(stockPriorityDate(b,bb)?.value||'9999');
 });
 const actual=allowed[0]||held[0]||null;let available=allowed.length>0;
 let reason=held.length&&!allowed.length?held.map(n=>getStock(n,overrides).status==='curry'?'카레용 제한':getStock(n,overrides).status==='locate'?'위치 확인 필요':'사용 여부 확인 필요').join(' · '):!held.length?'미보유':'';
 if(available&&actual&&getStock(actual,overrides).status==='incoming'&&!reason)reason='배송 중 · 곧 도착';
 if(available&&wantedWasabi&&normalize(actual)!==normalize(input))reason='와사비 제품·농도에 맞춰 분량 조절';
 // 농도 차이는 레시피 원문에서 확인하며, 수정 불가능한 자동 희석 문구는 표시하지 않습니다.
 return {name,held,available,actual,reason};
}
const promoted=promotedSnapshotRecipes;
export const promotedRecipeIds=[...new Set(promoted.map(r=>r.id))];
export const recipes=[...sourceRecipes,...promoted.filter(r=>!sourceRecipes.some(x=>x.id===r.id))].map(enrichSource);