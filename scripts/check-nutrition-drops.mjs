import assert from 'node:assert/strict';
import {parseRecipeAmounts,calculateRecipeNutrition,nutrientForAmount} from '../public/nutrition.js';
import {auditNutritionState,formatNutritionAudit,installLocalJsonFetch} from './nutrition-audit-lib.mjs';

const energy={value:90,amount:100,unit:'g',kind:'user'};
const sodium={value:2,amount:100,unit:'g',kind:'user'};
const profile={energy,sodium,gramsPerMl:0.9,gramsPerPiece:42};
const recipe='올리브유 3~4방울\n레몬즙 1.5방울';
const parsed=parseRecipeAmounts(recipe,['올리브유','레몬즙']);
assert.deepEqual(parsed.rows.map(row=>[row.name,row.amount,row.maxAmount,row.unit,row.originalUnit]),[
 ['올리브유',3,4,'drop','방울'],
 ['레몬즙',1.5,1.5,'drop','방울']
]);
assert.equal(parsed.warnings.some(warning=>warning.startsWith('분량 미확인:')),false,'Explicit drop counts are quantified, not absent');
const result=calculateRecipeNutrition(parsed,name=>({name,nutrition:profile}));
assert.equal(result.totals.energy.known,0,'Never make up kcal by assuming grams per drop');
assert.equal(result.totals.energy.missing,2);
assert.equal(result.totals.sodium.missing,2);
assert(result.partial);
assert(result.rows.every(row=>/방울당 무게.*실제 사용량\(g\)/.test(row.review)));
assert.equal(nutrientForAmount(energy,1,'drop',profile,'방울'),null,'Even a known g/mL density or grams-per-piece does not define drop volume');

const grams=parseRecipeAmounts('레몬즙 2g(3~4방울)\n올리브유 0.5g(1방울)',['레몬즙','올리브유']);
assert.equal(grams.rows.length,2,'A parenthesized descriptive drop count must not duplicate a verified gram amount');
assert.deepEqual(grams.rows.map(row=>[row.name,row.amount,row.unit]),[['레몬즙',2,'g'],['올리브유',0.5,'g']]);
const gramResult=calculateRecipeNutrition(grams,name=>({name,nutrition:profile}));
assert.equal(gramResult.totals.energy.missing,0,'Verified gram weights remain calculable');
assert.equal(gramResult.totals.energy.known,2);
assert.equal(parseRecipeAmounts('올리브유 1g + 1방울',['올리브유']).rows.length,1,'A standalone drop count without an ingredient name must not be assigned to a prior item');
assert.equal(parseRecipeAmounts('레몬즙 1방울 + 레몬즙 1방울',['레몬즙']).rows.length,2,'Two explicitly specified uses remain separate quantities');
assert.equal(parseRecipeAmounts('계란 4개\n식초 1ts',['계란','식초']).rows.length,2,'Existing counts and teaspoon parsing remain intact');

installLocalJsonFetch();
const audit=await auditNutritionState({version:1001,updatedAt:'2026-11-04T00:00:00Z',state:{
 items:['레몬즙'],history:[],edits:[],
 stock:{레몬즙:{nutrition:{energy,sodium}}},
 custom:[{id:'drop-audit',name:'방울 실측 대기',required:['레몬즙'],steps:['레몬즙 1.5방울']}]
}});
assert.equal(audit.recipes.withWarnings,0,'A real drop count is not a missing-quantity warning');
assert.equal(audit.recipes.complete,0,'Unverified drop-to-g conversion must never count as nutritionally complete');
const gap=audit.gaps.find(row=>row.ingredient==='레몬즙');
assert(gap,'Unmeasured drops must remain visible as a nutrition gap');
assert.equal(gap.causes.drop,2,'Both kcal and sodium require a real measured weight');
const report=formatNutritionAudit(audit);
assert.match(report,/방울 단위 실측 무게\(g\) 필요×2/,'Audit should not mislabel unmeasured drops as ordinary g↔mL conversion');
console.log('Drop quantities are preserved, but only measured grams can produce nutrient totals.');
