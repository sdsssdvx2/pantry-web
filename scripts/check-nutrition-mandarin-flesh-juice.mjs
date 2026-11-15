import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {calculateRecipeNutrition,parseRecipeAmounts} from '../public/nutrition.js';
import {requireKitchenDataset} from './sample-data.mjs';
requireKitchenDataset('check-nutrition-mandarin-flesh-juice.mjs');

const originalFetch=globalThis.fetch;
globalThis.fetch=async input=>{
 const url=input instanceof URL?new URL(input.href):new URL(String(input));
 url.search='';url.hash='';
 const value=JSON.parse(await readFile(fileURLToPath(url),'utf8'));
 return {ok:true,json:async()=>value};
};

try{
 const {createNutritionResolver,ingredientNutrition}=await import(`../public/nutrition-resolver.js?mandarin=${Date.now()}`);
 const whole=ingredientNutrition('밀감');
 assert.equal(whole.energy?.value,53);
 assert.equal(whole.sodium?.value,2);
 assert.equal(whole.energy?.kind,'generic');
 assert.match(whole.energy?.source||'',/Tangerines, \(mandarin oranges\), raw/);

 const flesh=ingredientNutrition('밀감 과육');
 assert.equal(flesh.energy?.value,53,'Explicit flesh wording should reuse the existing whole-edible mandarin profile');
 assert.equal(flesh.sodium?.value,2);
 assert.equal(flesh.energy?.source,whole.energy?.source);

 const juice=ingredientNutrition('밀감 과즙');
 assert.equal(juice.energy?.value,43);
 assert.equal(juice.sodium?.value,1);
 assert.equal(juice.energy?.kind,'generic');
 assert.match(juice.energy?.source||'',/Tangerine juice, raw/);
 for(const [key,value] of Object.entries({carbs:10.1,sugars:9.9,fat:0.2,saturatedFat:0.024,transFat:0,cholesterol:0,protein:0.5,fiber:0.2})){
  assert.equal(juice[key]?.value,value,'USDA raw mandarin juice 100g '+key);
  assert.equal(juice[key]?.kind,'generic');
  assert.equal(juice[key]?.amount,100);
  assert.equal(juice[key]?.unit,'g');
 }
 assert.match(juice.energy?.url||'',/169925\/nutrients/);

 const resolver=createNutritionResolver({pantry:[],stockOverrides:{}});
 const parsed=parseRecipeAmounts('밀감 과육 70g + 밀감 과즙 6g',['밀감 과육','밀감 과즙']);
 const calculated=calculateRecipeNutrition(parsed,resolver);
 assert.equal(calculated.rows.length,2);
 assert.equal(calculated.totals.energy.missing,0);
 assert.equal(calculated.totals.sodium.missing,0);
 assert.ok(Math.abs(calculated.totals.energy.value-39.68)<1e-12);
 assert.ok(Math.abs(calculated.totals.sodium.value-1.46)<1e-12);
 assert.notEqual(calculated.rows[0]?.profile.energy?.value,calculated.rows[1]?.profile.energy?.value,'Flesh and juice must retain separate composition profiles');

 console.log('Mandarin flesh reuses the existing raw mandarin profile while juice stays a separate USDA generic profile.');
}finally{
 globalThis.fetch=originalFetch;
}
