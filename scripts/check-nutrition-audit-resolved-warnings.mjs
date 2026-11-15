import assert from 'node:assert/strict';
import {auditNutritionState,formatNutritionAudit,installLocalJsonFetch} from './nutrition-audit-lib.mjs';

installLocalJsonFetch();
const snapshot={state:{items:['달걀'],stock:{},history:[],edits:[],custom:[
 {id:'egg-alias',name:'계란 표기 달걀 레시피',required:['달걀'],steps:['[재료]','계란 1개 약 50g']}
]}};
const audit=await auditNutritionState(snapshot);
const row=audit.recipes.rows.find(item=>item.name==='계란 표기 달걀 레시피');
assert(row,'Expected audit row for alias recipe');
assert.equal(row.warnings.includes('분량 미확인: 달걀'),false,'Audit must use calculateRecipeNutrition warnings after canonical resolution.');
const report=formatNutritionAudit(audit);
assert.doesNotMatch(report,/분량 미확인: 달걀/,'Formatted audit must not resurrect parser-only false warnings.');
console.log('Nutrition audit uses calculated canonical warnings instead of raw parser warnings.');
