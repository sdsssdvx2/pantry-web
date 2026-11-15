import assert from 'node:assert/strict';
import {parseRecipeAmounts} from '../public/nutrition.js';

const smoothie=parseRecipeAmounts('딸기요거트1(85g)',['딸기요거트']);
assert.equal(smoothie.rows.length,1);
assert.equal(smoothie.rows[0]?.name,'딸기요거트','A unitless count attached to a declared ingredient must not remain in the ingredient identity');
assert.equal(smoothie.rows[0]?.sourceName,'딸기요거트1','The original spelling should remain available as source context');
assert.equal(smoothie.rows[0]?.amount,85);
assert.equal(smoothie.rows[0]?.unit,'g');
assert.ok(!smoothie.warnings.includes('분량 미확인: 딸기요거트'));

const numberedProduct=parseRecipeAmounts('비타민C500(100g)',['비타민C500']);
assert.equal(numberedProduct.rows[0]?.name,'비타민C500','A number that is part of the declared product name must be preserved');

const unrelated=parseRecipeAmounts('딸기요거트1(85g)',['다른 요거트']);
assert.equal(unrelated.rows[0]?.name,'딸기요거트1','Do not strip an attached number unless the stripped text exactly matches one declared required ingredient');

console.log('Unitless counts attached to declared ingredient names are recovered only with exact required-name evidence.');
