import assert from 'node:assert/strict';
import {calculateRecipeNutrition,parseRecipeAmounts} from '../public/nutrition.js';

const raw='남은 국물은 따뜻한 소바유(면 삶은 물) 100ml 넣어 마시기(소스 1 : 소바유 2~3)';
const parsed=parseRecipeAmounts(raw,[]);
assert.equal(parsed.rows.length,1);
const row=parsed.rows[0];
assert.equal(row.name,'남은 국물은 따뜻한 소바유');
assert.equal(row.amount,100);
assert.equal(row.unit,'g');
assert.equal(row.included,false,'Explicit sobayu identified as noodle cooking water must not be counted as a normal ingredient');
assert.equal(row.review,'삶은 물·면수의 실제 섭취량 확인');

const calculated=calculateRecipeNutrition(parsed,name=>({name,nutrition:{}}));
assert.equal(calculated.totals.energy.missing,0,'Excluded sobayu must not create an energy gap');
assert.equal(calculated.totals.sodium.missing,0,'Excluded sobayu must not create a sodium gap');
assert.equal(calculated.excluded.length,1);

const existingProcess=parseRecipeAmounts('면수 50ml',[]);
assert.equal(existingProcess.rows[0]?.included,false,'Existing noodle-water handling must stay intact');

const unrelated=parseRecipeAmounts('소바유 음료 100ml',[]);
assert.equal(unrelated.rows[0]?.included,true,'The word sobayu alone must not globally exclude a separately named product');

console.log('Explicit sobayu noodle-cooking water is excluded narrowly without broad sobayu stripping.');
