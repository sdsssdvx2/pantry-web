import assert from 'node:assert/strict';
import {parseRecipeAmounts} from '../public/nutrition.js';

const garlic=parseRecipeAmounts('갈릭칩 6~8조각(2~3g) 뿌리기');
assert.equal(garlic.rows.length,1);
assert.equal(garlic.rows[0].name,'갈릭칩','A descriptive piece count before parenthesized grams must not become part of the ingredient name');
assert.equal(garlic.rows[0].sourceName,'갈릭칩');
assert.equal(garlic.rows[0].amount,2);
assert.equal(garlic.rows[0].maxAmount,3);
assert.equal(garlic.rows[0].unit,'g');

const chocolate=parseRecipeAmounts('다크초콜릿 1조각(5g)');
assert.equal(chocolate.rows.length,1);
assert.equal(chocolate.rows[0].name,'다크초콜릿');
assert.equal(chocolate.rows[0].amount,5);
assert.equal(chocolate.rows[0].unit,'g');

const instructionOnly=parseRecipeAmounts('바나나를 6조각으로 자르기');
assert.equal(instructionOnly.rows.length,0,'Piece-only cutting instructions must not become ingredient quantities');

console.log('Parenthesized gram weights ignore descriptive piece-count labels without enabling piece-only instruction parsing.');
