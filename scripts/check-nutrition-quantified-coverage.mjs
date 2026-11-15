import assert from 'node:assert/strict';
import {auditNutritionState,formatNutritionAudit,installLocalJsonFetch} from './nutrition-audit-lib.mjs';
import {auditVisibleNutritionLibrary,formatVisibleNutritionCoverage} from './nutrition-catalog-coverage.mjs';
import {requireKitchenDataset} from './sample-data.mjs';
requireKitchenDataset('check-nutrition-quantified-coverage.mjs');

installLocalJsonFetch();
const edible=(id,name,steps,required=['설탕'])=>({id,name,required,steps});
const fixture={version:19,updatedAt:'2026-11-05T00:00:00Z',state:{
 items:['설탕'],stock:{},history:[],custom:[],ingredientDetectionRules:[],
 recipes:[
  edible('user-measured','사용자 계량 설탕',['설탕 10g']),
  edible('user-zero','사용자 미계량 설탕',['설탕을 섞기']),
  edible('user-missing-label','사용자 제품정보 누락',['영양불명A 2g'],['영양불명A'])
 ],
 edits:[
  {sourceId:'source-b',variantKey:'b',label:'실제 저장 수정본',
   recipe:edible('edited-zero','수정본 미계량 설탕',['설탕 섞기'])}
 ]
}};
const sources=[
 {id:'source-a',name:'기본 2버전',required:['설탕'],variants:[
  {key:'a',label:'정량',required:['설탕'],original:'설탕 8g'},
  {key:'a2',label:'미계량',required:['설탕'],original:'설탕 섞기'}
 ]},
 {id:'source-b',name:'기본 1버전',required:['설탕'],variants:[
  {key:'b',label:'원본 정량',required:['설탕'],original:'설탕 5g'}
 ]}
];
const original=structuredClone(fixture),originalSources=structuredClone(sources);

const legacy=await auditNutritionState(fixture);
assert.equal(legacy.recipes.audited,1);
assert.equal(legacy.recipes.complete,1,'Historical no-gap series must not be silently rewritten');
assert.equal(legacy.recipes.quantifiedComplete,0,'A saved zero-amount edit must not claim nutrient completeness');
assert.equal(legacy.recipes.noQuantifiedRows,1);
assert.equal(legacy.recipes.calculationReady,0);
assert.match(formatNutritionAudit(legacy),/QUANTIFIED KCAL\/NA COVERAGE: 0\/1/);

const result=await auditVisibleNutritionLibrary(fixture,sources,[]);
assert.deepEqual(Object.fromEntries(Object.entries(result.groups).map(([key,v])=>[key,v.audited])),
 {user:3,edited:1,unedited:2});
assert.equal(result.summary.audited,6);
assert.equal(result.summary.nutrientComplete,5,'Legacy no-gap metric counts three empty recipes as before');
assert.equal(result.summary.quantifiedNutrientComplete,2,'Only quantified sugar recipes have complete kcal/sodium');
assert.equal(result.summary.noQuantifiedRows,3,'Unquantified direct, edited, and unedited recipes all count once');
assert.equal(result.summary.calculationReady,2,'No-quantity recipes and missing-label products are not calculation-ready');
assert.equal(result.groups.user.nutrientComplete,2);
assert.equal(result.groups.user.quantifiedNutrientComplete,1);
assert.equal(result.groups.edited.nutrientComplete,1);
assert.equal(result.groups.edited.quantifiedNutrientComplete,0);
assert.equal(result.groups.unedited.nutrientComplete,2);
assert.equal(result.groups.unedited.quantifiedNutrientComplete,1);
assert.equal(result.groups.user.rows.find(row=>row.name==='사용자 제품정보 누락')?.energyMissing,1);
assert.equal(result.groups.user.rows.find(row=>row.name==='사용자 제품정보 누락')?.sodiumMissing,1);
const report=formatVisibleNutritionCoverage(result);
assert.match(report,/VISIBLE LIBRARY: 6 versions audited; quantified kcal\/Na coverage 2; calculation-ready 2; historical no-gap including zero rows 5; no included quantified rows 3/);
assert.match(report,/3 audited; quantified kcal\/Na coverage 1; calculation-ready 1; historical no-gap including zero rows 2/);
assert.match(report,/1 audited; quantified kcal\/Na coverage 0; calculation-ready 0; historical no-gap including zero rows 1/);
assert.match(report,/2 audited; quantified kcal\/Na coverage 1; calculation-ready 1; historical no-gap including zero rows 2/);
assert.match(report,/=== COMPLETE VISIBLE LIBRARY — SINGLE-INGREDIENT BLOCKER PRIORITIES ===/);
assert.match(report,/Exactly one ingredient missing kcal\/sodium: 1 versions; potential calculation-ready after verified resolution: 1 versions/);
assert.match(report,/- 영양불명A: 1 otherwise review-free versions \/ 1 one-ingredient-gap versions/);
assert.match(report,/=== COMPLETE VISIBLE RECIPE LIBRARY — WARNING TRIAGE ===/);
assert.match(report,/- 필수 재료 계량 누락: 3 warnings in 3 visible versions/);
assert.match(report,/- 설탕: 3 visible versions, 3 warnings/);
assert.match(report,/Coverage limits: historical no-gap includes zero-quantity recipes/);
assert.deepEqual(fixture,original,'No saved recipe, override, stock or state may be changed by audits');
assert.deepEqual(sources,originalSources,'No source recipe is modified by the audit');
console.log('Legacy gap-free counts remain stable, but the real quantified nutrient coverage excludes zero-row recipes in all library groups.');
