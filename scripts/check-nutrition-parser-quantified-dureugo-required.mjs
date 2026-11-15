import assert from 'node:assert/strict';
import {parseRecipeAmounts} from '../public/nutrition.js';

const oneServing=parseRecipeAmounts(
 '2. 중불(170~180도)로 예열한 팬에 참치기름 5g 두르고 다진마늘 2g + 양파 1/2 (60~70g) 3~4분 볶기',
 ['다진마늘','양파'],
);
assert.equal(oneServing.rows.some(row=>row.name==='다진마늘'&&row.amount===2&&row.unit==='g'),true,'A declared quantified ingredient after `두르고` must not be swallowed by the previous oil quantity');
assert.equal(oneServing.warnings.includes('분량 미확인: 다진마늘'),false,'The recovered garlic quantity must satisfy its required-ingredient warning');

const twoServing=parseRecipeAmounts(
 '2. 중불(170~180도)로 예열한 팬에 참치기름 10g 두르고 다진마늘 4g + 양파 1개 (120~140g) 4~5분 볶기',
 ['다진마늘','양파'],
);
assert.equal(twoServing.rows.some(row=>row.name==='다진마늘'&&row.amount===4&&row.unit==='g'),true,'The live two-serving shape must recover the 4g garlic quantity');
assert.equal(twoServing.warnings.includes('분량 미확인: 다진마늘'),false);

const proseOnly=parseRecipeAmounts('5. 팬에 우지 5g 두르고 밥을 넣기',['밥']);
assert.equal(proseOnly.rows.some(row=>row.name==='밥'),false,'`두르고` must not invent a second ingredient row when the following ingredient has no explicit quantity');
assert.equal(proseOnly.warnings.includes('분량 미확인: 밥'),true,'An unquantified required ingredient must remain a real warning');

const undeclared=parseRecipeAmounts('1. 팬에 기름 5g 두르고 마늘 2g 볶기',['소금']);
assert.equal(undeclared.rows.some(row=>row.name==='마늘'),false,'The connector split is intentionally limited to explicitly declared required ingredients');

console.log('Quantified declared ingredients after `두르고` are recovered narrowly without inventing unquantified or undeclared rows.');
