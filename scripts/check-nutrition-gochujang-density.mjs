import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {requireKitchenDataset} from './sample-data.mjs';
requireKitchenDataset('check-nutrition-gochujang-density.mjs');

globalThis.fetch=async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(fileURLToPath(url),'utf8'))});
const {ingredientNutrition,createNutritionResolver}=await import('../public/nutrition-resolver.js');
const {parseRecipeAmounts,calculateRecipeNutrition}=await import('../public/nutrition.js');

const profile=ingredientNutrition('고추장');
assert.ok(profile.energy,'Existing gochujang kcal profile must remain available');
assert.ok(profile.sodium,'Existing gochujang sodium profile must remain available');
assert.equal(profile.gramsPerMl,1.2,'1 tbsp 18g with the recipe engine 15mL tablespoon must equal 1.2g/mL');

const resolver=createNutritionResolver({pantry:['고추장'],stockOverrides:{}});
const bySpoon=calculateRecipeNutrition(parseRecipeAmounts('고추장 1T'),resolver);
const byMass=calculateRecipeNutrition(parseRecipeAmounts('고추장 18g'),resolver);
assert.equal(bySpoon.totals.energy.missing,0);
assert.equal(bySpoon.totals.sodium.missing,0);
assert.ok(Math.abs(bySpoon.totals.energy.value-byMass.totals.energy.value)<1e-9,'1T must calculate like 18g for kcal');
assert.ok(Math.abs(bySpoon.totals.sodium.value-byMass.totals.sodium.value)<1e-9,'1T must calculate like 18g for sodium');

const customResolver=createNutritionResolver({
 pantry:['고추장'],
 stockOverrides:{'고추장':{nutrition:{gramsPerMl:1.3}}}
});
const customSpoon=calculateRecipeNutrition(parseRecipeAmounts('고추장 1T'),customResolver);
const customMass=calculateRecipeNutrition(parseRecipeAmounts('고추장 19.5g'),customResolver);
assert.ok(Math.abs(customSpoon.totals.energy.value-customMass.totals.energy.value)<1e-9,'Explicit owner conversion must override the researched generic conversion');
assert.ok(Math.abs(customSpoon.totals.sodium.value-customMass.totals.sodium.value)<1e-9,'Explicit owner conversion must override the researched generic conversion');

console.log('Gochujang 1T=18g conversion, recipe totals, and owner override checks passed.');
