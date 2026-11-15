import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {requireKitchenDataset} from './sample-data.mjs';
requireKitchenDataset('check-nutrition-sugar-spoon-conversion.mjs');

globalThis.fetch=async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(fileURLToPath(url),'utf8'))});
const {ingredientNutrition,createNutritionResolver}=await import('../public/nutrition-resolver.js');
const {parseRecipeAmounts,calculateRecipeNutrition}=await import('../public/nutrition.js');

const yellow=ingredientNutrition('황설탕');
const black=ingredientNutrition('흑설탕');
assert.equal(yellow.gramsPerMl,0.8,'황설탕 must use 12g per 15mL Korean tablespoon conversion');
assert.equal(black.gramsPerMl,0.8,'흑설탕 must use the same level-spoon conversion so generic 설탕 can stay equivalent');
assert.ok(yellow.energy&&yellow.sodium&&black.energy&&black.sodium,'Both held sugar candidates need kcal and sodium profiles');
assert.deepEqual(
 [yellow.energy.value,yellow.energy.amount,yellow.energy.unit,yellow.sodium.value,yellow.sodium.amount,yellow.sodium.unit],
 [black.energy.value,black.energy.amount,black.energy.unit,black.sodium.value,black.sodium.amount,black.sodium.unit],
 '황설탕 and 흑설탕 must remain nutrition-equivalent for generic 설탕 resolution'
);

const resolver=createNutritionResolver({pantry:['황설탕','흑설탕'],stockOverrides:{}});
const shared=resolver('설탕');
assert.equal(shared.reason,'동일한 영양정보의 보유 후보를 공통값으로 계산');
assert.equal(shared.nutrition.gramsPerMl,0.8);

for(const [text,grams] of [['설탕 2T',24],['설탕 0.5큰술',6]]){
 const parsed=parseRecipeAmounts(text,['설탕']);
 const total=calculateRecipeNutrition(parsed,resolver);
 assert.equal(total.totals.energy.missing,0,`${text} kcal must be calculable`);
 assert.equal(total.totals.sodium.missing,0,`${text} sodium must be calculable`);
 const expectedEnergy=shared.nutrition.energy.value*grams/shared.nutrition.energy.amount;
 const expectedSodium=shared.nutrition.sodium.value*grams/shared.nutrition.sodium.amount;
 assert.ok(Math.abs(total.totals.energy.value-expectedEnergy)<1e-9,`${text} must convert to ${grams}g for kcal`);
 assert.ok(Math.abs(total.totals.sodium.value-expectedSodium)<1e-9,`${text} must convert to ${grams}g for sodium`);
}

const custom=ingredientNutrition('황설탕',{'황설탕':{nutrition:{gramsPerMl:0.9,conversionNote:'집에서 직접 잰 값'}}});
assert.equal(custom.gramsPerMl,0.9,'Direct user conversion must override the researched spoon conversion');
assert.equal(custom.conversionNote,'집에서 직접 잰 값');

console.log('Sugar tablespoon conversion, shared-candidate resolution, recipe calculation, and user override checks passed.');
