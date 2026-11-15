import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {parseRecipeAmounts,calculateRecipeNutrition} from '../public/nutrition.js';
import {requireKitchenDataset} from './sample-data.mjs';
requireKitchenDataset('check-nutrition-active-only-readiness.mjs');

// The editor only makes a claim about the nutrient rows contributing to
// the active total. Optional/excluded/0%-use rows may retain review notes.
const metric=value=>({value,amount:100,unit:'g',kind:'generic'});
const sugar={energy:metric(400),sodium:metric(0)};
const resolve=name=>({name,nutrition:name==='설탕'?sugar:{},reason:''});

const original='[재료]\n설탕 10g\n(미확인재료 5~10g 선택)';
const parsed=parseRecipeAmounts(original,['설탕']);
const optional=parsed.rows.find(row=>row.name==='미확인재료');
assert(optional,'A measured optional ingredient must remain visible');
assert.equal(optional.included,false);
assert(optional.review,'Excluded alternative must retain its review information');
assert.deepEqual(parsed.warnings,[]);

const calculated=calculateRecipeNutrition(parsed,resolve);
assert.equal(calculated.totals.energy.value,40);
assert.equal(calculated.totals.sodium.value,0);
assert.equal(calculated.totals.energy.missing,0);
assert.equal(calculated.partial,false,'Excluded alternative review must not mark a fully calculated active recipe incomplete');
assert(calculated.excluded.some(row=>row.name==='미확인재료'));
assert.equal(parsed.body,original,'No recipe text may be modified');

// 0% of an otherwise included, unresolved ingredient contributes no unknown
// nutrients. The UI must show it as excluded rather than "unknown calories."
const zeroRaw='설탕 10g\n미확인 시즈닝 4g';
const zeroParsed=parseRecipeAmounts(zeroRaw,['설탕']);
const unknown=zeroParsed.rows.find(row=>row.name==='미확인 시즈닝');
assert(unknown&&unknown.included);
const zeroSettings={servings:1,overrides:[{key:unknown.key,included:true,percent:0,ingredient:''}]};
const snapshot=structuredClone(zeroSettings);
const zeroed=calculateRecipeNutrition(zeroParsed,resolve,zeroSettings);
assert.deepEqual(zeroSettings,snapshot,'Saved user overrides must not be mutated');
assert.equal(zeroed.totals.energy.value,40);
assert.equal(zeroed.totals.energy.missing,0);
assert.equal(zeroed.partial,false,'0%-use ingredient is not an outstanding nutrient gap');
assert(zeroed.excluded.some(row=>row.name==='미확인 시즈닝'&&row.percent===0));

// The empty case must not claim completeness: there is no measured, active food.
const sugarRow=parseRecipeAmounts('설탕 10g',['설탕']);
const excluded=calculateRecipeNutrition(sugarRow,resolve,{servings:1,overrides:[
 {key:sugarRow.rows[0].key,included:false,percent:100,ingredient:''}
]});
assert.equal(excluded.totals.energy.known,0);
assert.equal(excluded.partial,true,'No active quantified rows cannot be a completed nutrition calculation');
const zeroOnly=calculateRecipeNutrition(sugarRow,resolve,{servings:1,overrides:[
 {key:sugarRow.rows[0].key,included:true,percent:0,ingredient:''}
]});
assert.equal(zeroOnly.partial,true,'0% of every ingredient cannot be declared complete');

// Genuine unknowns, relevant quantity reviews and missing required amounts
// must still mark the active recipe as incomplete.
const activeUnknown=calculateRecipeNutrition(zeroParsed,resolve);
assert.equal(activeUnknown.totals.energy.missing,1);
assert.equal(activeUnknown.partial,true);
const ranged=calculateRecipeNutrition(parseRecipeAmounts('설탕 5~10g',['설탕']),resolve);
assert.equal(ranged.partial,true);
const missingRequired=calculateRecipeNutrition(parseRecipeAmounts('설탕 10g',['설탕','소금']),resolve);
assert.equal(missingRequired.partial,true);

// Exercise the actual UI, including its independently derived card badge.
const oldFetch=globalThis.fetch;
globalThis.fetch=async input=>{
 const url=input instanceof URL?input:new URL(String(input));
 if(url.protocol!=='file:')throw Error('Only local fixtures allowed');
 return {ok:true,json:async()=>JSON.parse(fs.readFileSync(fileURLToPath(url),'utf8'))};
};
try{
 const {nutritionSummaryHTML,recipeEnergyLabel}=await import('../public/nutrition-ui.js');
 const cleanHTML=nutritionSummaryHTML(calculated);
 assert(cleanHTML.includes('재료 기준 추정'),'Complete active nutrition should not show incomplete status');
 assert(!cleanHTML.includes('<span>일부 미확인</span>'));
 const zeroHTML=nutritionSummaryHTML(zeroed);
 assert(zeroHTML.includes(' · 합계 제외'));
 assert(zeroHTML.includes('사용량의 0% 반영'));
 assert(zeroHTML.includes('<span>—<br>—</span>'),'Zero-use unresolved ingredient must not show unknown contribution');
 assert(nutritionSummaryHTML(excluded).includes('<span>일부 미확인</span>'));
 assert(nutritionSummaryHTML(activeUnknown).includes('<span>일부 미확인</span>'));
 const card=recipeEnergyLabel({name:'선택 재료와 설탕',required:['설탕'],
  steps:['설탕 10g','(미확인재료 5~10g 선택)']},{});
 assert.match(card.text,/kcal$/);
 assert(!card.text.includes('+ 미확인'),'Recipe-card badge must ignore excluded alternatives');
 const unknownCard=recipeEnergyLabel({name:'미확인 재료 포함',required:['설탕'],
  steps:['설탕 10g','미확인 시즈닝 4g']},{});
 assert(unknownCard.text.includes('+ 미확인'),'Recipe-card badge must still flag truly missing energy');

 // The editor and recipe card must agree after the owner confirms exactly
 // one standalone alternative. A synthetic resolver proves the calculation;
 // the real card uses the shipped nutrition catalog.
 const choiceText='설탕 10g / 버터 10g';
 const choiceRows=parseRecipeAmounts(choiceText,['설탕','버터']);
 const selectedSugar=choiceRows.rows.find(row=>row.name==='설탕');
 const selectedButter=choiceRows.rows.find(row=>row.name==='버터');
 assert(selectedSugar&&selectedButter);
 const chooseSugar={servings:1,overrides:[{key:selectedSugar.key,included:true,percent:100,ingredient:''}]};
 const chosenSugar=calculateRecipeNutrition(choiceRows,resolve,chooseSugar);
 assert.equal(chosenSugar.partial,false);
 assert(nutritionSummaryHTML(chosenSugar).includes('<span>재료 기준 추정</span>'),
  'Selected pure alternative must clear the UI partial status');
 assert.equal(chosenSugar.rows.find(row=>row.key===selectedSugar.key)?.review,'');
 const choiceCard=recipeEnergyLabel({name:'단독 감미료 선택',required:['설탕','버터'],
  steps:[choiceText],nutritionPlan:chooseSugar},{});
 assert.match(choiceCard.text,/kcal$/);
 assert(!choiceCard.text.includes('+ 미확인'),'Recipe card must agree with selected known alternative');
 const both={servings:1,overrides:[selectedSugar,selectedButter].map(row=>({
  key:row.key,included:true,percent:100,ingredient:''
 }))};
 const bothChoice=calculateRecipeNutrition(choiceRows,resolve,both);
 assert.equal(bothChoice.partial,true,'Both alternatives cannot be treated as one completed recipe');
 assert(nutritionSummaryHTML(bothChoice).includes('<span>일부 미확인</span>'));
 const bothCard=recipeEnergyLabel({name:'양쪽 감미료 선택',required:['설탕','버터'],
  steps:[choiceText],nutritionPlan:both},{});
 assert(bothCard.text.includes('+ 미확인'),
  'The card must not call two exclusive alternatives complete');

}finally{
 globalThis.fetch=oldFetch;
}
console.log('Nutrition summary and card badges reflect only contributing ingredients; excluded/0%-use reviews and genuine missing data remain distinct.');
