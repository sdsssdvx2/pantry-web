import assert from 'node:assert/strict';
import {auditNutritionState,formatNutritionAudit,installLocalJsonFetch} from './nutrition-audit-lib.mjs';

installLocalJsonFetch();
const snapshot={
 version:1000,
 state:{
  // Keep one exact pantry identity with no nutrition profile. This mirrors a
  // real unresolved stocked product without accidentally inheriting a generic
  // food profile (plain `청주`, for example, is a valid generic food).
  items:['정체불명 소스'],stock:{},history:[],edits:[],
  custom:[
   {id:'specific-a',name:'브랜드 A 레시피',required:['정체불명 소스'],steps:['브랜드A 정체불명 소스 5g']},
   {id:'generic',name:'일반 표기 레시피',required:['정체불명 소스'],steps:['정체불명 소스 10g']},
   {id:'specific-b',name:'브랜드 B 레시피',required:['정체불명 소스'],steps:['브랜드B 정체불명 소스 4g']}
  ]
 }
};

const audit=await auditNutritionState(snapshot);
const gap=audit.gaps.find(row=>row.ingredient==='정체불명 소스');
assert.ok(gap,'The grouped unresolved pantry gap should exist');
assert.equal(gap.occurrences,3);
assert.equal(gap.recipes.length,3);
assert.deepEqual(gap.sourceNames,{
 '브랜드A 정체불명 소스':1,
 '브랜드B 정체불명 소스':1,
 '정체불명 소스':1
},'Grouped gaps must retain the concrete source wording instead of discarding it');

const report=formatNutritionAudit(audit);
assert.match(report,/1\. 정체불명 소스 — recipes 3, occurrences 3/);
assert.match(report,/source forms: .*브랜드A 정체불명 소스×1/);
assert.match(report,/source forms: .*브랜드B 정체불명 소스×1/);
const sourceLine=report.split('\n').find(line=>line.includes('source forms:'))||'';
assert.ok(!sourceLine.split(': ')[1].split(' / ').includes('정체불명 소스×1'),'The grouped name itself should not be redundantly repeated as a source form');
assert.match(report,/branded\/source-specific blockers/);

console.log('Nutrition audit preserves and formats concrete source ingredient forms without changing grouped gap identity.');
