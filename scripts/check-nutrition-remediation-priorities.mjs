import assert from 'node:assert/strict';
import {auditNutritionState,formatNutritionAudit,installLocalJsonFetch,nutritionWarningType} from './nutrition-audit-lib.mjs';
import {auditVisibleNutritionLibrary,formatVisibleNutritionCoverage} from './nutrition-catalog-coverage.mjs';
import {requireKitchenDataset} from './sample-data.mjs';
requireKitchenDataset('check-nutrition-remediation-priorities.mjs');

const samples={
 reserve:'분량 확인: 다시 끓으면 중불로 낮추기 (면수 30g 남겨놓기)',
 conditional:'분량 확인: 7. 면수 넣고 25초 버무리기 (뻑뻑하면 면수 5g씩 추가)',
 fat:'분량 확인: 2. 오리는 덜고 팬에는 오리기름 4g만 남기기',
 substitute:'분량 확인: 꿀 대신 올리고당 30g으로 교체. 둘을 함께 넣지 않기.',
 missing:'분량 미확인: 삼겹살',
 intake:'실제 섭취량 확인: 소금의 투입량은 계량되어 있지만 조리 후 실제 흡수·추출되어 먹는 양은 확인되지 않았어요.',
 mismatch:'분량 불일치: 계란의 조리 단계 분량이 재료 목록보다 많아요.',
 generic:'분량 확인: 알코올과 시나몬을 넣어도 날달걀이 안전해지는 것은 아님. 1개 무게가 다르므로 껍데기 제외한 g으로 계량하기.',
 noRows:'계산할 분량을 찾지 못했어요. 재료명 뒤에 g을 적어 주세요.',
 discard:'양념·기름을 남기는 조리법이에요. 투입량 합계와 실제 먹는 양이 다를 수 있어요.',
 step:'조리 단계에서 분량을 찾았어요. 반복된 양과 빠진 재료를 확인해 주세요.'
};
for(const [key,want] of Object.entries({
 reserve:'reserveWater',conditional:'conditionalWater',fat:'retainedFat',substitute:'substitution',
 missing:'missing',intake:'intake',mismatch:'mismatch',generic:'quantityContext',noRows:'noRows',discard:'discard',step:'stepSource'
}))assert.equal(nutritionWarningType(samples[key]),want,'Warning taxonomy must not hide or conflate '+key);
assert.equal(nutritionWarningType('알 수 없는 경고'),'other');

const fakeA='영양자료없는가상A',fakeB='영양자료없는가상B';
const make=(id,name,lines,required=[fakeA])=>({id,name,required,steps:lines});
const fixtures=[
 make('solo-a','A one',['영양자료없는가상A 10g']),
 make('range-a','A range',['영양자료없는가상A 5~10g']),
 make('solo-b','B one',['영양자료없는가상B 3g'],[fakeB]),
 make('double','A and B',['영양자료없는가상A 2g','영양자료없는가상B 4g'],[fakeA,fakeB]),
 make('repeat-a','A repeated',['영양자료없는가상A 2g','영양자료없는가상A 3g']),
 make('optional-b','A with excluded B',['영양자료없는가상A 3g','(영양자료없는가상B 4g 선택)'],[fakeA,fakeB]),
 make('zero','No quantities',['영양자료없는가상A 섞기']),
 make('sugar','Verified sugar',['설탕 10g'],['설탕'])
];
const snap={version:7,updatedAt:'2026-11-05T00:00:00Z',state:{
 items:['설탕'],stock:{},history:[],edits:[],recipes:fixtures,custom:[],
 ingredientDetectionRules:[]
}};
installLocalJsonFetch();
const original=structuredClone(snap);
const legacy=await auditNutritionState({...snap,state:{...snap.state,custom:fixtures}});
assert.deepEqual(snap,original,'Read-only nutrition audit must never modify owner state');
const a=legacy.remediation;
assert(a,'Remediation summary must be generated');
assert.equal(a.singleBlockerRecipes,5,'Exactly one unresolved ingredient across five recipes; no double-counting multiple rows or metrics');
assert.equal(a.possibleReadyRecipes,4,'Range review blocks immediate calculation readiness');
const first=a.singleBlockers.find(row=>row.ingredient===fakeA);
const second=a.singleBlockers.find(row=>row.ingredient===fakeB);
assert(first,'A product with four single-blocker recipes must appear');
assert.deepEqual([first.nutrientOnlyRecipes,first.possibleReadyRecipes],[4,3]);
assert.deepEqual([second.nutrientOnlyRecipes,second.possibleReadyRecipes],[1,1]);
assert(!a.singleBlockers.some(row=>row.ingredient==='설탕'),'Verified sugar is not a nutrient blocker');
assert.equal(legacy.recipes.calculationReady,1,'Potential fixes must not inflate current readiness');
assert.equal(legacy.recipes.noQuantifiedRows,1,'Zero-quantity recipes cannot be treated as a single nutrient blocker');
assert.deepEqual(legacy.recipes.rows.find(row=>row.name==='A and B')?.warnings,[],
 'A multi-ingredient unresolved recipe should not gain an invented quantity warning');

const report=formatNutritionAudit(legacy);
assert.match(report,/PRIORITIZED SINGLE-INGREDIENT NUTRIENT BLOCKERS/);
assert.match(report,/exactly one distinct ingredient missing kcal or sodium: 5; of these, 4/);
assert.match(report,/QUANTITY \/ PREPARATION WARNING TRIAGE/);
assert.match(report,/RECIPE QUANTITY \/ PREPARATION WARNINGS/);
assert.match(report,/No automatic nutrient substitution or calculation changes/);

const expanded=await auditVisibleNutritionLibrary(snap,[],[]);
assert.deepEqual(snap,original,'Extended user/catalog audit must also leave owner state unchanged');
assert.equal(expanded.summary.audited,8);
assert.equal(expanded.groups.user.remediation.singleBlockerRecipes,5);
assert.equal(expanded.groups.user.remediation.possibleReadyRecipes,4);
const expandedText=formatVisibleNutritionCoverage(expanded);
assert.match(expandedText,/=== COMPLETE VISIBLE LIBRARY — SINGLE-INGREDIENT BLOCKER PRIORITIES ===/);
assert.match(expandedText,/Exactly one ingredient missing kcal\/sodium: 5 versions; potential calculation-ready after verified resolution: 4 versions/);
assert.match(expandedText,/- 영양자료없는가상A: 3 otherwise review-free versions \/ 4 one-ingredient-gap versions/);
assert.match(expandedText,/- 영양자료없는가상B: 1 otherwise review-free versions \/ 1 one-ingredient-gap versions/);
assert.match(expandedText,/One missing nutrient ingredient: 5 recipes; 4 have no other automated quantity\/review flags/);
assert.match(expandedText,/potential fix 영양자료없는가상A: 3 otherwise review-free recipes/);
assert.match(expandedText,/Coverage limits:/);

console.log('Nutrition blocker prioritization and warning triage preserve missing values, historical coverage, saved data and review flags.');
