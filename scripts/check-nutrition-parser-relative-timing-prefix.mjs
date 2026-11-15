import assert from 'node:assert/strict';
import {parseRecipeAmounts} from '../public/nutrition.js';

const garlic=parseRecipeAmounts('끝나기 2~3분 전에 갈릭칩 1T',['갈릭칩']);
assert.equal(garlic.rows.length,1);
assert.equal(garlic.rows[0].name,'갈릭칩','Relative timing prose before an ingredient must not become part of the ingredient name');
assert.equal(garlic.rows[0].amount,1);
assert.equal(garlic.rows[0].unit,'spoon');
assert.equal(garlic.rows[0].originalUnit,'T');

const seconds=parseRecipeAmounts('끝나기 30초 전에 버터 5g',['버터']);
assert.equal(seconds.rows[0]?.name,'버터');
assert.equal(seconds.rows[0]?.amount,5);

const ordinary=parseRecipeAmounts('2~3분 숙성 치즈 30g');
assert.notEqual(ordinary.rows[0]?.name,'치즈','Timing-looking text without the exact `끝나기 … 전에` phrase must retain existing parsing behavior');

console.log('Relative end-of-cook timing prefixes are removed without broad timing-text stripping.');
