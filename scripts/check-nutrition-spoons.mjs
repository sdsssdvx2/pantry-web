import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {parseRecipeAmounts,calculateRecipeNutrition,nutrientForAmount} from '../public/nutrition.js';
import {requireKitchenDataset} from './sample-data.mjs';
requireKitchenDataset('check-nutrition-spoons.mjs');

globalThis.fetch=async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(fileURLToPath(url),'utf8'))});
const {createNutritionResolver,ingredientNutrition}=await import('../public/nutrition-resolver.js');
const metric=(value,amount=100,unit='g')=>({value,amount,unit,kind:'user'});

assert.equal(nutrientForAmount(metric(16,15,'ml'),1,'spoon',{},'T'),16,'1T must be 15mL for an mL nutrition label');
assert.equal(nutrientForAmount(metric(16,15,'ml'),1,'spoon',{},'큰술'),16);
assert.equal(nutrientForAmount(metric(10,5,'ml'),1,'spoon',{},'t'),10,'1t must be 5mL');
assert.equal(nutrientForAmount(metric(10,5,'ml'),1,'spoon',{},'ts'),10,'1ts must be 5mL');
assert.equal(nutrientForAmount(metric(10,5,'ml'),1,'spoon',{},'작은술'),10);
assert.equal(nutrientForAmount(metric(100),1,'spoon',{},'T'),null,'A g-based label still needs a verified density');

const garlicProfile=ingredientNutrition('다진마늘');
assert.equal(garlicProfile.gramsPerMl,0.56);
assert.equal(garlicProfile.gramsPerPiece,3);
assert.match(garlicProfile.conversionNote,/USDA SR28/);

const resolve=createNutritionResolver({pantry:['다진마늘']});
const tablespoon=calculateRecipeNutrition(parseRecipeAmounts('다진마늘 1T',['다진마늘']),resolve);
assert.ok(Math.abs(tablespoon.totals.energy.value-12.516)<1e-9,'USDA 1 tsp=2.8g means 1T=8.4g of minced garlic');
assert.ok(Math.abs(tablespoon.totals.sodium.value-1.428)<1e-9);
assert.equal(tablespoon.rows[0].review,'','A verified density must clear the old weigh-it-in-grams review');

const teaspoon=calculateRecipeNutrition(parseRecipeAmounts('다진마늘 1t',['다진마늘']),resolve);
assert.ok(Math.abs(teaspoon.totals.energy.value-4.172)<1e-9,'1t minced garlic must use the USDA 2.8g common measure');

const teaspoonTs=calculateRecipeNutrition(parseRecipeAmounts('다진마늘 1ts',['다진마늘']),resolve);
assert.ok(Math.abs(teaspoonTs.totals.energy.value-4.172)<1e-9,'1ts must be the same 5mL teaspoon as 1t');
assert.equal(teaspoonTs.warnings.includes('분량 미확인: 다진마늘'),false);

const vinegarTs=parseRecipeAmounts('식초 1ts',['식초']);
assert.equal(vinegarTs.rows.length,1,'The owner\'s `1ts` spelling must be parsed as a quantified spoon row');
assert.equal(vinegarTs.rows[0].name,'식초');
assert.equal(vinegarTs.rows[0].amount,1);
assert.equal(vinegarTs.rows[0].unit,'spoon');
assert.equal(vinegarTs.rows[0].originalUnit,'ts');
assert.equal(vinegarTs.warnings.includes('분량 미확인: 식초'),false,'Explicit 식초 1ts must not remain a missing-quantity warning');

const compactTs=parseRecipeAmounts('진간장1ts + 설탕1ts + 마요네즈1T',['진간장','설탕','마요네즈']);
assert.equal(compactTs.rows.length,3,'Compact owner spoon spelling without spaces must keep all three quantified ingredients');
assert.deepEqual(compactTs.rows.map(row=>[row.name,row.amount,row.unit,row.originalUnit]),[
 ['진간장',1,'spoon','ts'],
 ['설탕',1,'spoon','ts'],
 ['마요네즈',1,'spoon','T']
]);
assert.equal(compactTs.warnings.some(warning=>warning.startsWith('분량 미확인:')),false,'Compact ts/T spelling must satisfy all explicitly quantified required ingredients');

const clove=calculateRecipeNutrition(parseRecipeAmounts('다진마늘 1개',['다진마늘']),resolve);
assert.ok(Math.abs(clove.totals.energy.value-4.47)<1e-9,'One garlic clove must use USDA 3.0g common measure');

const userDensity=ingredientNutrition('다진마늘',{'다진마늘':{nutrition:{gramsPerMl:0.7}}});
assert.equal(userDensity.gramsPerMl,0.7,'A user-entered measured density must override the researched common measure');

const oliveResolve=createNutritionResolver({pantry:['엑스트라버진 올리브유','엑스트라버진 유기농 올리브유']});
const olive=calculateRecipeNutrition(parseRecipeAmounts('올리브유 1T',['올리브유']),oliveResolve);
assert.equal(olive.rows[0].ingredient,'올리브유','Equivalent EVOO candidates must stay generic rather than silently choosing a bottle');
assert.equal(olive.rows[0].profile.gramsPerMl,0.9);
assert.ok(Math.abs(olive.totals.energy.value-119.34)<1e-9,'USDA 1 tbsp olive oil = 13.5g, so 1T must scale 884kcal/100g to 119.34kcal');
assert.ok(Math.abs(olive.totals.sodium.value-0.27)<1e-9);
assert.equal(olive.rows[0].review,'');

const unresolved=calculateRecipeNutrition(parseRecipeAmounts('버터 1T',['버터']),name=>({name,nutrition:{energy:metric(717),sodium:metric(11)}}));
assert.equal(unresolved.totals.energy.missing,1);
assert.match(unresolved.rows[0].review,/저울로 잰 g/,'Spoon amounts without a density must remain explicit gaps');

console.log('Standard spoon-unit, USDA minced-garlic and olive-oil conversion checks passed.');
