import assert from 'node:assert/strict';
import {parseRecipeAmounts,calculateRecipeNutrition} from '../public/nutrition.js';

// This exact wording appears in the owner's saved tuna-mayo fried rice.
// The numerator/denominator describe a half onion; 60–70g is the actual
// weighed quantity. Never treat "양파 1/2" as a separate product.
const source='양파 1/2 (60~70g)';
const half=parseRecipeAmounts(source,['양파']);
assert.equal(half.body,source,'Recipe content must remain unchanged');
assert.equal(half.rows.length,1);
assert.equal(half.rows[0].name,'양파');
assert.equal(half.rows[0].sourceName,'양파 1/2','Retain the original visible phrasing for provenance');
assert.equal(half.rows[0].amount,60);
assert.equal(half.rows[0].maxAmount,70);
assert.equal(half.rows[0].unit,'g');
assert.equal(half.rows[0].included,true);
assert.match(half.rows[0].review,/범위의 작은 양/,'Do not silently claim the range was precisely measured');
assert(!half.warnings.includes('분량 미확인: 양파'));

const metric=value=>({value,amount:100,unit:'g',kind:'generic'});
const onionNutrition={energy:metric(40),sodium:metric(1)};
const calculated=calculateRecipeNutrition(half,name=>({name,nutrition:name==='양파'?onionNutrition:{}}));
assert.equal(calculated.totals.energy.value,24,'Only the stated lower bound of 60g is used, not guessed half-onion grams');
assert.equal(calculated.totals.sodium.value,0.6);
assert.equal(calculated.totals.energy.missing,0);
assert(calculated.partial,'The 60–70g range must still be reviewed');

// Preserve the accompanying garlic and explicitly measured edible oil when
// reading the full real-world cooking-step sentence.
const original='2. 중불(170~180도)로 예열한 팬에 참치기름 5g 두르고 다진마늘 2g + 양파 1/2 (60~70g) 3~4분 볶기';
const full=parseRecipeAmounts(original,['참치캔','다진마늘','양파']);
assert.equal(full.body,original);
assert(full.rows.some(row=>row.name==='참치기름'&&row.amount===5));
assert(full.rows.some(row=>row.name==='다진마늘'&&row.amount===2));
assert(full.rows.some(row=>row.name==='양파'&&row.amount===60&&row.maxAmount===70));
assert(!full.warnings.some(warning=>warning==='분량 미확인: 양파'));

// The 2-serving formula already has an explicit "1개" count and should stay
// exactly 120–140g, not be recast as a generic fixed 100g onion.
const whole=parseRecipeAmounts('양파 1개 (120~140g)',['양파']);
assert.equal(whole.rows[0]?.name,'양파');
assert.equal(whole.rows[0]?.amount,120);
assert.equal(whole.rows[0]?.maxAmount,140);

// Do not rewrite a literal product whose name includes 1/2.
const fractionProduct=parseRecipeAmounts('한정판 소스 1/2 (100g)',['한정판 소스 1/2']);
assert.equal(fractionProduct.rows[0]?.name,'한정판 소스 1/2');
assert.equal(fractionProduct.rows[0]?.amount,100);

// Without an exact ingredient declaration and an explicit parenthesized gram
// weight, a fraction might be a name or preparation ratio: leave it alone.
const unverified=parseRecipeAmounts('양파 1/2 (60g)',[]);
assert.equal(unverified.rows[0]?.name,'양파 1/2');
const nonParenthesized=parseRecipeAmounts('양파 1/2 60g',['양파']);
assert.equal(nonParenthesized.rows[0]?.name,'양파 1/2');

console.log('Half-onion weighed gram range resolves only to an exactly declared onion; original names, products, and unverified fractions remain unchanged.');
