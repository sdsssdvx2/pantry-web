import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseRecipeAmounts,calculateRecipeNutrition} from '../public/nutrition.js';
import {requireKitchenDataset} from './sample-data.mjs';
requireKitchenDataset('check-nutrition-noodle-chilling-bath.mjs');

// Full public source recipe: the 500g chilling bowl must not be mistaken for
// another 500g of sauce water. The actual sauce uses a separate 135g water.
const catalog=JSON.parse(fs.readFileSync(new URL('../public/recipes.json',import.meta.url),'utf8'));
const source=catalog.find(recipe=>recipe.id==='source-250');
assert(source,'Expected original 1-serving ni-hachi soba source recipe');
const variant=source.variants.find(row=>row.key==='250');
assert(variant?.original.includes('볼에 물 500ml 넣기'));
const before=variant.original;
const parsed=parseRecipeAmounts(variant.original,variant.required);
assert.equal(variant.original,before,'Never edit recipe originals');
const coldWater=parsed.rows.find(row=>row.name==='찬물'&&row.amount===500);
assert(coldWater,'Original 500ml cold rinse water must remain visible');
assert.equal(coldWater.included,false,'Cold rinse water is preparation, not consumed food');
assert.match(coldWater.review,/섭취하지 않는 냉각수/);
const ice=parsed.rows.find(row=>row.name==='얼음'&&row.amount===50);
assert(ice,'Original 50–100g noodle-rinse ice must remain visible');
assert.equal(ice.maxAmount,100);
assert.equal(ice.included,false,'Ice used to cool noodles must not count as consumed food');
assert.match(ice.review,/섭취하지 않는 냉각수/);
const sauce=parsed.rows.find(row=>row.name==='물'&&row.amount===135);
assert(sauce,'Actual 135g sauce water must remain quantified');
assert.equal(sauce.included,true,'Narrow chilling fix must not exclude water actually added to sauce');
assert(!parsed.rows.some(row=>row.name.includes('볼에 물')&&row.amount===500),
 'Water in a bowl for chilling must not become another food row');
assert(!parsed.warnings.some(warning=>/분량 불일치:\s*물/.test(warning)),
 'The cooling bowl is not a second, mismatched sauce-water quantity');
const calculated=calculateRecipeNutrition(parsed,name=>({name,nutrition:{}}));
assert(calculated.excluded.some(row=>row.name==='찬물'));
assert(calculated.excluded.some(row=>row.name==='얼음'));
assert(calculated.rows.some(row=>row.name==='물'&&row.amount===135&&row.included));
assert(!calculated.warnings.some(warning=>/분량 불일치:\s*물/.test(warning)));

// A saved variant may use g instead of the public source's ml for the same
// scale-weighed chilling water. The parser must handle both identically.
const edited=variant.original.replace('볼에 물 500ml 넣기','볼에 물 500g 넣기')
 .replace('찬물 500ml','찬물 500g');
const editedParsed=parseRecipeAmounts(edited,variant.required);
assert(!editedParsed.warnings.some(warning=>/분량 불일치:\s*물/.test(warning)));
assert.equal(editedParsed.rows.find(row=>row.name==='물'&&row.amount===135)?.included,true);
assert.equal(editedParsed.rows.find(row=>row.name==='찬물'&&row.amount===500)?.included,false);

// Not all ice/water in recipes is discarded. Drink ice and a legitimate
// measured cooking-stage addition must remain food unless independently excluded.
const drink=parseRecipeAmounts('[음료]\n얼음물(2~5도): 찬물 500g + 얼음 50~100g');
assert.equal(drink.rows.find(row=>row.name==='찬물')?.included,true);
assert.equal(drink.rows.find(row=>row.name==='얼음')?.included,true);
const unlabeled=parseRecipeAmounts('[면 삶기]\n찬물 500g + 얼음 50g');
assert.equal(unlabeled.rows.find(row=>row.name==='찬물')?.included,true,
 'Do not infer a discarded ice bath from a quantity with no ice-bath label');
const poured=parseRecipeAmounts('[재료]\n물 135g\n[조리]\n1. 볼에 물 500g 넣기',['물']);
assert(poured.warnings.some(warning=>/분량 불일치:\s*물/.test(warning)),
 'Ordinary measured added water in a bowl must still report a genuine mismatch');

// A truly inconsistent egg count in a separate recipe must not be suppressed
// by the chilling-water exception.
const egg=parseRecipeAmounts('[재료]\n계란 4개\n[조리]\n1. 계란 8개 넣기',['계란']);
assert(egg.warnings.some(warning=>/분량 불일치:\s*계란/.test(warning)),
 'Genuine mismatched ingredient quantities remain visible');

console.log('Real ni-hachi soba cooling-bath water and ice excluded; sauce water, drink ice and genuine quantity mismatches preserved.');
