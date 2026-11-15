import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {parseRecipeAmounts} from '../public/nutrition.js';
import {requireKitchenDataset} from './sample-data.mjs';
requireKitchenDataset('check-nutrition-alternative-editor-roundtrip.mjs');

// Exercise the real nutrition editor event handlers and saved override
// round trip without touching a browser profile, network, D1 or owner state.
// Minimal event/DOM fixtures deliberately avoid reimplementing nutrition logic.
const oldFetch=globalThis.fetch;
const oldDocument=globalThis.document;
globalThis.fetch=async input=>{
 const url=input instanceof URL?input:new URL(String(input));
 if(url.protocol!=='file:')throw Error('Unexpected network request in nutrition editor regression');
 return {ok:true,json:async()=>JSON.parse(fs.readFileSync(fileURLToPath(url),'utf8'))};
};

class Element {
 constructor(value=''){
  this.value=value;
  this.innerHTML='';
  this.listeners=new Map();
 }
 querySelector(){return null;}
 querySelectorAll(){return [];}
 addEventListener(type,listener){
  const listeners=this.listeners.get(type)||[];
  listeners.push(listener);
  this.listeners.set(type,listeners);
 }
 dispatchEvent(event){
  for(const listener of this.listeners.get(event.type)||[])listener(event);
  return true;
 }
 fire(type,target){
  for(const listener of this.listeners.get(type)||[])listener({target});
 }
}
const body=new Element('설탕 10g / 버터 10g');
const required=new Element('설탕, 버터');
const target=new Element();
globalThis.document={
 getElementById(id){
  if(id==='recipe-steps')return body;
  if(id==='recipe-required')return required;
  return null;
 }
};
const context=()=>({pantry:[],stockOverrides:{},ingredientHistory:[]});
const checkbox=(rowIndex,checked)=>({
 checked,
 matches:selector=>selector==='[data-include]',
 closest:selector=>selector==='[data-row]'?{dataset:{row:String(rowIndex)}}:null
});
const quantity=(rowIndex,value)=>({
 value:String(value),
 matches:selector=>selector==='[data-quantity]',
 closest:selector=>selector==='[data-row]'?{dataset:{row:String(rowIndex)}}:null
});
const state=()=>({
 complete:target.innerHTML.includes('<span>재료 기준 추정</span>'),
 incomplete:target.innerHTML.includes('<span>일부 미확인</span>')
});
try{
 const {installRecipeNutritionEditor}=await import('../public/nutrition-ui.js');
 const editor=installRecipeNutritionEditor(target,context);
 const original=body.value;
 const parsed=parseRecipeAmounts(original,['설탕','버터']);
 assert.equal(parsed.rows.length,2);
 const sugarIndex=parsed.rows.findIndex(row=>row.name==='설탕');
 const butterIndex=parsed.rows.findIndex(row=>row.name==='버터');
 assert(sugarIndex>=0&&butterIndex>=0);
 const sugarKey=parsed.rows[sugarIndex].key, butterKey=parsed.rows[butterIndex].key;
 const opened={required:['설탕','버터'],variantLabel:'1인분'};
 const prior=structuredClone(opened);
 editor.open(opened);
 assert.deepEqual(opened,prior,'Opening editor may not mutate recipe inputs');
 assert(state().incomplete,'No alternative selected: never show completed nutrition');
 assert(target.innerHTML.includes('대체 재료·분량 선택 확인:'));
 assert.deepEqual(editor.read().overrides,[],'Opening does not invent an owner selection');

 // Select the known sugar, exactly as the checkbox handler does in the UI.
 target.fire('change',checkbox(sugarIndex,true));
 assert(state().complete,'One selected, fully known food must clear review status');
 assert(!state().incomplete);
 assert.equal(body.value,original,'A checkbox must not edit the cooking instructions');
 let saved=editor.read();
 assert.equal(saved.overrides.length,1);
 assert.deepEqual(saved.overrides[0],{
  key:sugarKey,included:true,percent:100,ingredient:'설탕'
 });
 assert(!target.innerHTML.includes('두 대체안을 모두 포함했어요'));

 // The editor must load its own persisted plan without introducing a
 // second selection, deleting the owner's choice or rewriting recipe text.
 const snapshot=structuredClone(saved);
 editor.open({...opened,nutritionPlan:saved});
 assert.deepEqual(saved,snapshot);
 assert(state().complete,'The same saved plan should display complete on reopen');
 assert.deepEqual(editor.read(),snapshot);

 // Explicitly include both exclusive foods: no false "complete" badge.
 target.fire('change',checkbox(butterIndex,true));
 assert(state().incomplete,'Including both sides must retain a conflict warning');
 assert(target.innerHTML.includes('두 대체안을 모두 포함했어요'));
 let both=editor.read();
 assert.equal(both.overrides.length,2);
 assert.equal(both.overrides.find(row=>row.key===butterKey)?.included,true);
 assert.equal(both.overrides.find(row=>row.key===sugarKey)?.included,true);
 editor.open({...opened,nutritionPlan:both});
 assert(state().incomplete,'The double-choice warning survives save/reopen');

 // Uncheck the second food and verify the existing first selection persists.
 target.fire('change',checkbox(butterIndex,false));
 assert(state().complete);
 saved=editor.read();
 assert.equal(saved.overrides.find(row=>row.key===sugarKey)?.included,true);
 assert.equal(saved.overrides.find(row=>row.key===butterKey)?.included,false);

 // Changing the chosen gram amount must update recipe text *and* retain
 // the selected row's stable key. No second product can become active.
 target.fire('change',quantity(sugarIndex,12));
 assert.equal(body.value,'설탕 12g / 버터 10g');
 assert(state().complete,'Quantifying a selected option must not lose its choice');
 const postQuantity=parseRecipeAmounts(body.value,['설탕','버터']);
 assert.equal(postQuantity.rows.find(row=>row.name==='설탕')?.key,sugarKey);
 assert.equal(postQuantity.rows.find(row=>row.name==='버터')?.key,butterKey);
 assert.deepEqual(editor.read(),saved);
 assert.deepEqual(opened,prior,'The UI must never mutate the recipe passed to open');

 // A real change-event free provenance edit must survive closing the proof.
 // An invalid URL must block collapse, unrelated redraw, and final save.
 required.value='설탕';
 body.value='[재료]\n설탕 40g\n[조리]\n1. 섞기';
 editor.open({required:['설탕'],variantLabel:'1인분'});
 const error={textContent:''};
 const parent={dataset:{row:'0'}};
 const fields={
  value:{value:'80'},amount:{value:'40'},unit:{value:'g'},
  source:{value:'보유 포장'},url:{value:'http://bad.invalid'},
  note:{value:'입력한 포장 메모'}
 };
 const metricRow={
  dataset:{nutrient:'energy'},
  querySelector:selector=>({
   '[data-value]':fields.value,'[data-amount]':fields.amount,
   '[data-unit]':fields.unit,'[data-evidence-source]':fields.source,
   '[data-evidence-url]':fields.url,'[data-evidence-note]':fields.note
  })[selector]||null
 };
 const proof={
  closest:selector=>selector==='[data-row]'?parent:null,
  querySelectorAll:selector=>selector==='[data-nutrient]'?[metricRow]:[],
  querySelector:selector=>selector==='[data-proof-error]'?error:null
 };
 target.querySelector=selector=>{
  if(selector==='[data-proof-panel]')return target.innerHTML.includes('data-proof-panel')?proof:null;
  if(selector==='.nutrition-editor [role="status"]')return {set innerHTML(value){}};
  return null;
 };
 target.querySelectorAll=selector=>{
  if(selector==='details')return [];
  if(selector==='[data-proof-panel]')return target.innerHTML.includes('data-proof-panel')?[proof]:[];
  if(selector==='[data-proof-error]')return target.innerHTML.includes('data-proof-panel')?[error]:[];
  return [];
 };
 const proofButton={
  closest:selector=>selector==='[data-row]'?parent:selector.includes('[data-edit-proof]')?proofButton:null,
  matches:selector=>selector==='[data-edit-proof]'
 };
 target.fire('click',proofButton);
 assert(target.innerHTML.includes('data-proof-panel'),'Proof must open before editing');
 target.fire('click',proofButton);
 assert(target.innerHTML.includes('data-proof-panel'),'Invalid proof must remain visible');
 assert.match(error.textContent,/https/);
 assert.throws(()=>editor.read(),/https/);
 body.dispatchEvent(new Event('input',{bubbles:true}));
 assert(target.innerHTML.includes('data-proof-panel'),'Invalid proof must block unrelated redraw');
 fields.url.value='https://example.org/verified';
 fields.note.value='미블러 최신 포장 근거'; // intentionally no change event
 target.fire('click',proofButton);
 assert(!target.innerHTML.includes('data-proof-panel'),'Validated proof must collapse');
 const folded=editor.read();
 assert.equal(folded.overrides[0].nutrition.energy.value,80);
 assert.equal(folded.overrides[0].nutrition.energy.url,'https://example.org/verified');
 assert.equal(folded.overrides[0].nutrition.energy.note,'미블러 최신 포장 근거');
 assert.equal(error.textContent,'');
 console.log('Nutrition editor proof collapse: invalid source fails closed, unblurred evidence preserved PASS.');
 console.log('Nutrition editor checkbox, conflict, save/reopen, and gram edit round trip passed.');
}finally{
 globalThis.fetch=oldFetch;
 if(oldDocument===undefined)delete globalThis.document;
 else globalThis.document=oldDocument;
}
