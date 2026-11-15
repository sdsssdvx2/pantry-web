import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {requireKitchenDataset} from './sample-data.mjs';
requireKitchenDataset('check-nutrition-peperoncino-conversion.mjs');

globalThis.fetch=async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(fileURLToPath(url),'utf8'))});
const {ingredientNutrition}=await import('../public/nutrition-resolver.js');
const {nutrientForAmount}=await import('../public/nutrition.js');

const pepper=ingredientNutrition('페페론치노');
assert.equal(pepper.gramsPerPiece,0.5,'USDA sun-dried hot chile measure should expose 0.5g per pepper');
assert.equal(pepper.energy.value,318);
assert.equal(pepper.sodium.value,30);
assert.ok(Math.abs(nutrientForAmount(pepper.energy,1,'piece',pepper)-1.59)<1e-12,'1 pepper should contribute 1.59kcal');
assert.ok(Math.abs(nutrientForAmount(pepper.sodium,1,'piece',pepper)-0.15)<1e-12,'1 pepper should contribute 0.15mg sodium');
assert.ok(Math.abs(nutrientForAmount(pepper.energy,3,'piece',pepper)-4.77)<1e-12,'3 peppers should contribute 4.77kcal');
assert.ok(Math.abs(nutrientForAmount(pepper.sodium,3,'piece',pepper)-0.45)<1e-12,'3 peppers should contribute 0.45mg sodium');

const owner=ingredientNutrition('페페론치노',{'페페론치노':{nutrition:{gramsPerPiece:0.7}}});
assert.equal(owner.gramsPerPiece,0.7,'Explicit user conversion metadata must override the USDA reference conversion');
assert.ok(Math.abs(nutrientForAmount(owner.energy,1,'piece',owner)-2.226)<1e-12,'User piece weight must drive the calculation when provided');

console.log('Peperoncino USDA piece conversion, scaling and user override checks passed.');
