import assert from 'node:assert/strict';
import {auditNutritionState,formatNutritionAudit,installLocalJsonFetch} from './nutrition-audit-lib.mjs';
import {requireKitchenDataset} from './sample-data.mjs';
requireKitchenDataset('check-nutrition-audit-calculation-readiness.mjs');
installLocalJsonFetch();
const snapshot={state:{items:['설탕'],stock:{},history:[],edits:[],custom:[
 {id:'clean',name:'분량 있는 설탕',required:['설탕'],steps:['[재료]','설탕 10g']},
 {id:'empty',name:'분량 없는 설탕',required:['설탕'],steps:['설탕을 섞기']},
 {id:'partial',name:'소금 분량 미확인',required:['설탕','소금'],steps:['[재료]','설탕 10g','소금 약간']}
]}};
const before=structuredClone(snapshot),audit=await auditNutritionState(snapshot);
assert.deepEqual(snapshot,before,'Read-only audit must not change recipe or inventory state');
assert.equal(audit.recipes.complete,3,'Preserve historical no-gap count, including zero-row recipes');
assert.equal(audit.recipes.quantifiedComplete,2,'A recipe without any quantified included row must never count as quantified nutrient coverage');
assert.equal(audit.recipes.quantifiedCoverage,66.7);
assert.equal(audit.recipes.calculationReady,1,'Zero-row and missing-quantity recipes cannot be calculation-ready');
assert.equal(audit.recipes.noQuantifiedRows,1);
assert.equal(audit.recipes.withWarnings,2);
const report=formatNutritionAudit(audit);
assert.match(report,/QUANTIFIED KCAL\/NA COVERAGE: 2\/3/);
assert.match(report,/USER\/EDITED RECIPES: 3\/3.*historical no-gap count/);
assert.match(report,/CALCULATION REVIEW: 1\/3/);
assert.match(report,/NEEDS REVIEW: 2 recipes.*1 have no quantified/);
assert.match(report,/분량 없는 설탕.*0 quantified included rows/);
assert.match(report,/소금 분량 미확인/);
assert.match(report,/historical no-gap count, including zero quantified rows/);
assert.match(report,/not a guarantee of measured intake/);
// Range amounts have verified ingredients and kcal/sodium, but the parser uses
// the smaller amount. That is a row-level review flag, not a completed calculation.
const rangeSnapshot={state:{items:['설탕'],stock:{},history:[],edits:[],custom:[
 {id:'measured',name:'확정 계량',required:['설탕'],steps:['설탕 10g']},
 {id:'range',name:'범위 계량',required:['설탕'],steps:['설탕 5~10g']},
 {id:'optional',name:'선택 범위 제외',required:['설탕'],steps:['설탕 10g','(설탕 5~10g 선택)']}
]}};
const rangeBefore=structuredClone(rangeSnapshot);
const withRanges=await auditNutritionState(rangeSnapshot);
assert.deepEqual(rangeSnapshot,rangeBefore,'The audit must remain strictly read-only with review flags');
assert.equal(withRanges.recipes.complete,3,'Nutrient coverage must not be artificially lowered by range reviews');
assert.equal(withRanges.recipes.quantifiedComplete,3,'All three cases include at least one well-quantified ingredient');
assert.equal(withRanges.recipes.withWarnings,0,'Row reviews are distinct from recipe-level quantity warnings');
assert.equal(withRanges.recipes.withRowReviews,1,'Only the active range row needs review');
assert.equal(withRanges.recipes.calculationReady,2,'An active range review blocks readiness; an excluded optional range does not');
const ranged=withRanges.recipes.rows.find(row=>row.name==='범위 계량');
const optional=withRanges.recipes.rows.find(row=>row.name==='선택 범위 제외');
assert.equal(ranged?.rowReviewCount,1);
assert.equal(optional?.rowReviewCount,0,'Excluded alternatives must not cause a false review flag');
const detailedReport=formatNutritionAudit(withRanges);
assert.match(detailedReport,/CALCULATION REVIEW: 2\/3.*no included row review flags/);
assert.match(detailedReport,/NEEDS REVIEW: 0 recipes.*1 have included row review flags/);
console.log('Recipe readiness distinguishes quantified coverage, empty calculations and quantity warnings.');
