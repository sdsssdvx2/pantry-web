import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {requireKitchenDataset} from './sample-data.mjs';
requireKitchenDataset('check-nutrition-pink-pepper.mjs');

globalThis.fetch=async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(fileURLToPath(url),'utf8'))});
const {ingredientNutrition,createNutritionResolver}=await import('../public/nutrition-resolver.js');
const {nutrientForAmount}=await import('../public/nutrition.js');

const pink=ingredientNutrition('통적후추');
assert.equal(pink.energy.value,370);
assert.equal(pink.sodium.value,102);
assert.equal(pink.energy.kind,'estimate');
assert.ok(Math.abs(nutrientForAmount(pink.energy,0.1,'g',pink)-0.37)<1e-12,'0.1g pink pepper should contribute 0.37kcal');
assert.ok(Math.abs(nutrientForAmount(pink.sodium,0.1,'g',pink)-0.102)<1e-12,'0.1g pink pepper should contribute 0.102mg sodium');

const owner=ingredientNutrition('통적후추',{'통적후추':{notes:['나트륨 150mg/100g']}});
assert.equal(owner.sodium.value,150,'Current package note must override the pink-pepper reference estimate');
assert.equal(owner.energy.value,370,'Missing owner nutrients should still use the reference estimate');

const resolved=createNutritionResolver({pantry:['통적후추']})('적후추');
assert.equal(resolved.name,'통적후추');
assert.equal(resolved.nutrition.energy.value,370);
assert.equal(resolved.nutrition.sodium.value,102);

console.log('Pink-pepper nutrition estimate, tiny-amount scaling, alias resolution and owner precedence checks passed.');
