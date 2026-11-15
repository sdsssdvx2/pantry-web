import assert from 'node:assert/strict';
import {parseRecipeAmounts} from '../public/nutrition.js';

const fries=parseRecipeAmounts('에어프라이어 회전통: 200도/180도로 예열하고 감자튀김 200~250g + 땅콩기름 4g',['감자튀김','땅콩기름']);
const friesRow=fries.rows.find(row=>row.name==='감자튀김');
assert.ok(friesRow,'Temperature/preheat prose before fries must not become part of the ingredient name');
assert.equal(friesRow.amount,200);
assert.equal(friesRow.maxAmount,250);
assert.ok(!fries.rows.some(row=>/예열|도로/.test(row.name)));

const cutlet=parseRecipeAmounts('에어프라이어 회전통: 180도로 예열하고 돈까스 200~250g + 아보카도유 10~12.5g',['돈까스','아보카도유']);
const cutletRow=cutlet.rows.find(row=>row.name==='돈까스');
assert.ok(cutletRow,'Temperature/preheat prose before cutlet must not become part of the ingredient name');
assert.equal(cutletRow.amount,200);
assert.equal(cutletRow.maxAmount,250);

const productLike=parseRecipeAmounts('180도 숙성 치즈 30g');
assert.equal(productLike.rows[0]?.name,'도 숙성 치즈','A temperature-looking prefix without the explicit preheat instruction must retain existing parsing behavior');

console.log('Explicit temperature/preheat prefixes are removed without broad temperature-name stripping.');
