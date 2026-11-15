import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {requireKitchenDataset} from './sample-data.mjs';
requireKitchenDataset('check-nutrition-onion-conversion.mjs');

globalThis.fetch=async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(fileURLToPath(url),'utf8'))});
const {ingredientNutrition}=await import('../public/nutrition-resolver.js');
const {nutrientForAmount}=await import('../public/nutrition.js');

const onion=ingredientNutrition('양파');
assert.equal(onion.gramsPerPiece,100,'Owner house reference should expose 100g per onion');
assert.ok(onion.energy,'Onion kcal profile must remain available');
assert.ok(onion.sodium,'Onion sodium profile must remain available');
const expectedEnergy=onion.energy.value*100/onion.energy.amount;
const expectedSodium=onion.sodium.value*100/onion.sodium.amount;
assert.ok(Math.abs(nutrientForAmount(onion.energy,1,'piece',onion)-expectedEnergy)<1e-12,'1 onion must calculate as 100g for kcal');
assert.ok(Math.abs(nutrientForAmount(onion.sodium,1,'piece',onion)-expectedSodium)<1e-12,'1 onion must calculate as 100g for sodium');
assert.ok(Math.abs(nutrientForAmount(onion.energy,0.5,'piece',onion)-expectedEnergy/2)<1e-12,'Half an onion must calculate as 50g');

const owner=ingredientNutrition('양파',{'양파':{nutrition:{gramsPerPiece:120}}});
assert.equal(owner.gramsPerPiece,120,'Explicit owner conversion metadata must override the 100g house reference');
assert.ok(Math.abs(nutrientForAmount(owner.energy,1,'piece',owner)-(owner.energy.value*120/owner.energy.amount))<1e-12,'Explicit owner piece weight must drive kcal calculation');

console.log('Owner onion 100g-per-piece conversion and explicit override checks passed.');
