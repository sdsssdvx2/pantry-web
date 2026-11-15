import assert from 'node:assert/strict';
import {parseRecipeAmounts,calculateRecipeNutrition} from '../public/nutrition.js';

const pastaLines=[
 '맛소금 2.5g',
 '물 500g',
 '파스타면 100g',
 '면수 20g',
 '버터 5g',
 '1. 파스타면을 끓는 물에 넣기',
 '2. 다시 끓으면 중불로 낮추기 (면수 30g 남겨놓기)',
 '3. 면수 20g 넣고 버터와 버무리기'
];
const pasta=parseRecipeAmounts(pastaLines.join('\n'),['맛소금','파스타면','버터']);
assert.equal(pasta.rows.filter(row=>row.name==='버터').length,1,'Reserved water must never consume a measured butter row');
assert.equal(pasta.rows.filter(row=>row.name==='면수').length,1,'Reserved water must not add a second noodle-water row');
assert.equal(pasta.rows.find(row=>row.name==='면수')?.included,false,'Noodle cooking water remains process-only, not complete nutrition');
assert.equal(pasta.warnings.some(w=>w.includes('면수 30g 남겨놓기')),false,
 'An independently reserved portion of cooking water is not an extra ingredient');
assert.equal(pasta.warnings.some(w=>w.startsWith('분량 불일치: 버터')),false,
 'Repeating a measured ingredient exactly in cooking steps must remain safe');

const exactLiveReservations=[25,30,35].map(amount=>
 parseRecipeAmounts(['[재료]','파스타면 100g','면수 20g','[조리]',
  '2. 팔팔 끓으면 중불로 낮추기 (면수 '+amount+'g 남겨놓기)'].join('\n'),['파스타면'])
);
for(const parsed of exactLiveReservations){
 assert.equal(parsed.rows.length,2);
 assert.equal(parsed.warnings.some(w=>w.startsWith('분량 확인:')),false);
}
const conditional=parseRecipeAmounts('[재료]\n버터 10g\n[조리]\n1. 버터 넣고 25초 버무리기 (뻑뻑하면 면수 5g씩 추가)',['버터']);
assert.equal(conditional.warnings.some(w=>w.includes('면수 5g씩 추가')),true,
 'Conditional additions must keep their review warning; added volume is unverified');

const retainedFat=parseRecipeAmounts('[재료]\n삼겹살 300g\n[조리]\n1. 고기는 덜고 나온 기름은 약 8g만 남기기.',['삼겹살']);
assert.equal(retainedFat.warnings.some(w=>w.includes('기름은 약 8g만 남기기')),true,
 'Retained or discarded fat is not automatically the edible fat quantity');

const mixed=parseRecipeAmounts('[재료]\n버터 5g\n[조리]\n1. 다시 끓으면 중불로 낮추기 (면수 30g 남겨놓기) 버터 6g 추가',['버터']);
assert(mixed.warnings.some(w=>w.startsWith('분량 확인:')||w.startsWith('분량 불일치:')),
 'A mixed instruction with another measured ingredient must not be silently suppressed');

const note='알코올과 시나몬을 넣어도 날달걀이 안전해지는 것은 아님. 1개 무게가 다르므로 껍데기 제외한 g으로 계량하기.';
for(const [eggName,grams] of [['달걀',100],['달걀 노른자',51]]){
 const egg=parseRecipeAmounts([eggName+' '+grams+'g','설탕 33g',note].join('\n'),[eggName,'설탕']);
 assert.deepEqual(egg.rows.map(r=>[r.name,r.amount,r.unit]),[[eggName,grams,'g'],['설탕',33,'g']]);
 assert.equal(egg.warnings.some(w=>w.includes('1개 무게가 다르므로')),false,
  'A weighing safety note is not another egg serving');
}
const actualCount=parseRecipeAmounts('달걀 1개 무게가 다르므로 껍데기 제외한 g으로 계량하기.',['달걀']);
assert.equal(actualCount.rows.some(r=>r.name==='달걀'&&r.amount===1&&r.unit==='piece'),true,
 'A real, explicitly named egg count must stay countable');
const ordinaryFood=parseRecipeAmounts('버터 5g 추가',['버터']);
assert.equal(ordinaryFood.rows[0]?.amount,5,'Ordinary food weights must remain parseable');

const resolver=name=>({name,nutrition:{
 energy:{value:700,amount:100,unit:'g',kind:'generic'},
 sodium:{value:200,amount:100,unit:'g',kind:'generic'}
}});
const before=parseRecipeAmounts(['버터 5g','면수 20g'].join('\n'),['버터']);
const after=parseRecipeAmounts(['버터 5g','면수 20g','2. 다시 끓으면 중불로 낮추기 (면수 30g 남겨놓기)'].join('\n'),['버터']);
const b=calculateRecipeNutrition(before,resolver),a=calculateRecipeNutrition(after,resolver);
assert.equal(a.totals.energy.value,b.totals.energy.value,'A reserved-water instruction must not change energy');
assert.equal(a.totals.sodium.value,b.totals.sodium.value,'A reserved-water instruction must not change sodium');
assert.equal(a.rows.length,b.rows.length,'No extra nutrition rows from water reservation');

console.log('Non-ingredient instructions no longer produce false warnings or nutrient rows; conditional amounts, real counts and retained-fat warnings remain.');
