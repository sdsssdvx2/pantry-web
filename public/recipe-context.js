import * as VOCAB from './kitchen-vocabulary.js';
import {reviewedEffort} from './recipe-effort.js';
import {normalizeSourceRecipe} from './recipe-source-normalization.js';
// Display metadata is separate from the user's verbatim cooking records.

function cleanMigrationNote(text=''){
 return String(text).split(/(?<=\.)\s+/).filter(sentence=>{
  const s=sentence.trim();
  if(!s)return false;
  return !(
   /표시 시간|메뉴 분류용 추정값/.test(s)||
   /원문 제목|메뉴 이름만/.test(s)||
   /요청대로.*정리/.test(s)||
   /정식 레시피에서는 제외|이전 가져오기 과정/.test(s)||
   /원문 뒤에.*(?:섞여|섞여 있어)/.test(s)||
   /임의로.*보완/.test(s)||
   (/원문/.test(s)&&/그대로 보존(?:했어요|합니다)/.test(s))
  );
 }).join(' ').trim();
}

function cleanInternalMigrationMeta(input){
 const r={...input};
 const migrated=/^source-note-/.test(r.id)||r.id==='source-53'||r.id==='source-76';
 // Migration/provenance commentary belongs in source metadata, not in the recipe a person cooks from.
 if(migrated){
  delete r.reviewNote;
  if(r.note)r.note=cleanMigrationNote(r.note);
 }
 if(Object.hasOwn(VOCAB.recipeSummaryOverrides,r.id))r.summary=VOCAB.recipeSummaryOverrides[r.id];
 return r;
}

export function cleanPairingText(text=''){
 return String(text||'').split('\n').map(line=>line.trim()
  .replace(/^(?:추천\s*음료(?:\s*·\s*곁들임)?|추천\s*곁들임|음료|곁들임)\s*[:：\-]\s*/,'')
  .replace(/^(?:같이|함께)\s*마실\s*음료(?:로|는)?\s*/,'')
  .replace(/\s+(?:추천|권장)\s*$/,'').trim()).filter(Boolean).join('\n');
}

export function pairingFromText(text=''){
 const lines=[...new Set(text.split('\n').map(l=>l.trim()).filter(l=>/추천\s*음료|음료\s*[:：]|음료.*(?:추천|좋)|(?:같이|함께)\s*마실\s*음료|음료는|(?:맥주|탄산수|콜라).*(?:같이|함께).*(?:먹|마시)/.test(l)))];
 return cleanPairingText(lines.join('\n'));
}
export function enrichSource(input){
 const r=cleanInternalMigrationMeta(normalizeSourceRecipe(input));
 const extra={};
 const group=VOCAB.recipeServingGroups.find(entry=>entry.ids.includes(r.id));
 if(group){
  if(!Object.hasOwn(r,'pairing'))extra.pairing=group.pairing;
  if(!Object.hasOwn(r,'servingNote'))extra.servingNote=group.servingNote;
  if(!Object.hasOwn(r,'related'))extra.related=group.ids.filter(id=>id!==r.id);
  extra.contextSource='요리 레시피.txt · 812행 · 볼락/가자미 공통';
 }
 const basePairing=Object.hasOwn(r,'pairing')?cleanPairingText(r.pairing):undefined;
 return {...r,...(basePairing!==undefined?{pairing:basePairing}:{}),effort:reviewedEffort[r.id]||r.effort,...extra,variants:r.variants.map(v=>{
  const ownPairing=Object.hasOwn(v,'pairing')?cleanPairingText(v.pairing):'';
  const extracted=!Object.hasOwn(v,'pairing')&&!Object.hasOwn(r,'pairing')&&!extra.pairing?pairingFromText(v.original):'';
  return {...v,...(ownPairing?{pairing:ownPairing}:{}),...(extracted?{pairing:extracted}:{})};
 })};
}

export function validateExtras(v,validText){
 const out={};
 for(const key of ['prep','servingNote'])if(Object.hasOwn(v,key))out[key]=validText(v[key],4000);
 if(Object.hasOwn(v,'pairing'))out.pairing=cleanPairingText(validText(v.pairing,4000));
 if(Object.hasOwn(v,'variantLabel'))out.variantLabel=validText(v.variantLabel,100);
 if(Object.hasOwn(v,'related')){
  if(!Array.isArray(v.related)||v.related.length>30||v.related.some(id=>typeof id!=='string'||! /^(?:source|user)-[a-z0-9-]+$/.test(id)))throw Error('함께 만드는 레시피 목록을 확인해 주세요.');
  out.related=[...new Set(v.related)];
 }
 return out;
}

// Suggestions copy source lines; they neither invent durations nor sum times
// that may run concurrently. Rejected/edited suggestions are never re-applied.
export function preparationSuggestions(text=''){
 const result=[];
 for(const raw of text.split('\n')){
  const line=raw.trim().replace(/^\d+[.)]\s*/, '');
  if(!line||line.length>1000)continue;
  const duration=/(?:\d+(?:\.\d+)?\s*(?:[~～〜–—-]\s*\d+(?:\.\d+)?)?\s*(?:시간|분|일)|하룻밤|반나절)/;
  const waiting=/해동|숙성|불리|불려|휴지|재우|재워|식히|식혀|기다|얼리|(?:냉장고?|냉동실?)(?:에|에서).{0,30}(?:넣|두|보관)|(?:냉장|냉동)(?:고|실)?\s*(?:약|최소|최대)?\s*\d/;
  if(!duration.test(line)||!waiting.test(line)||/해동\s*(?:[xX×✕]|없|않)|숙성\s*(?:[xX×✕]|없|않)/.test(line))continue;
  // Ordinary short cooling during cooking is not a separate preparation block.
  if(!/해동|숙성|불리|불려|냉장|냉동|휴지|재우|재워|시간|하룻밤|반나절/.test(line)&&!/\b(?:[1-9]\d+)\s*분/.test(line))continue;
  result.push(line);
 }
 return [...new Set(result)].slice(0,8);
}
