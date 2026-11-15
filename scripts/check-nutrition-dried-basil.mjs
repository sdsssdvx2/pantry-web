import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {calculateRecipeNutrition,parseRecipeAmounts} from '../public/nutrition.js';
import {requireKitchenDataset} from './sample-data.mjs';
requireKitchenDataset('check-nutrition-dried-basil.mjs');

const originalFetch=globalThis.fetch;
globalThis.fetch=async input=>{
 const url=input instanceof URL?new URL(input.href):new URL(String(input));
 url.search='';url.hash='';
 const value=JSON.parse(await readFile(fileURLToPath(url),'utf8'));
 return {ok:true,json:async()=>value};
};

try{
 const {createNutritionResolver,ingredientNutrition}=await import(`../public/nutrition-resolver.js?dried-basil=${Date.now()}`);
 const profile=ingredientNutrition('바질');
 assert.equal(profile.energy?.value,233);
 assert.equal(profile.energy?.amount,100);
 assert.equal(profile.energy?.unit,'g');
 assert.equal(profile.energy?.kind,'generic');
 assert.equal(profile.sodium?.value,76);
 assert.equal(profile.sodium?.kind,'generic');
 assert.match(profile.energy?.source||'',/Spices, basil, dried/);
 for(const [key,value] of Object.entries({carbs:47.75,sugars:1.71,fat:4.07,saturatedFat:2.157,transFat:0,cholesterol:0,protein:22.98,fiber:37.7})){
  assert.equal(profile[key]?.value,value,'Preserve verified USDA dried-basil '+key);
  assert.equal(profile[key]?.kind,'generic');
  assert.equal(profile[key]?.amount,100);
  assert.equal(profile[key]?.unit,'g');
 }

 const resolver=createNutritionResolver({pantry:['바질'],stockOverrides:{}});
 const linked=resolver('건바질');
 assert.equal(linked.name,'바질','Exact dried-basil wording should resolve to the held room-temperature basil spice');
 assert.equal(linked.nutrition.energy?.value,233);
 assert.equal(linked.nutrition.sodium?.value,76);

 const parsed=parseRecipeAmounts('건바질 0.2g',['바질']);
 const calculated=calculateRecipeNutrition(parsed,resolver);
 assert.equal(calculated.rows.length,1);
 assert.equal(calculated.rows[0]?.ingredient,'바질');
 assert.equal(calculated.totals.energy.missing,0);
 assert.equal(calculated.totals.sodium.missing,0);
 assert.ok(Math.abs(calculated.totals.energy.value-0.466)<1e-12);
 assert.ok(Math.abs(calculated.totals.sodium.value-0.152)<1e-12);

 const unrelated=resolver('건바질 페스토');
 assert.equal(unrelated.reason,'제품·식재료 연결 확인 필요','Do not broaden the exact dried-basil alias into prepared basil products');
 console.log('Held dried basil resolves narrowly to USDA generic dried-basil kcal/sodium values.');
}finally{
 globalThis.fetch=originalFetch;
}
