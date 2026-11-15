import assert from 'node:assert/strict';
import {parseRecipeAmounts,calculateRecipeNutrition} from '../public/nutrition.js';

// A conditional sugar/honey alternative inside parentheses must not cause
// adjacent weighed cream cheese, butter, egg yolk or condensed milk to vanish
// from the intake total. This is the structure of a saved 6-piece bread recipe.
const raw='크림치즈 80g + 버터 80g 휘핑 + (이미 설탕 들어간 식빵 믹스 쓸 경우엔 넣지 말기: 설탕 60g/꿀 40g 부피 2배가 되도록 휘핑) + 노른자 52g (약 3개) 부피 3배가 되도록 휘핑 + 연유 64g 가볍게 휘핑';
const parsed=parseRecipeAmounts(raw,['크림치즈','버터','달걀','연유']);
assert.equal(parsed.body,raw,'Do not change the saved recipe instructions');
const byName=name=>parsed.rows.find(row=>row.name===name);
for(const [name,amount] of [['크림치즈',80],['버터',80],['노른자',52],['연유',64]]){
 const row=byName(name);
 assert(row,`Must retain quantified ${name}`);
 assert.equal(row.amount,amount);
 assert.equal(row.included,true,`A nested alternative must not exclude ${name}`);
}
const sugar=byName('설탕');
assert(sugar);
assert.equal(sugar.amount,60);
assert.equal(sugar.included,false,'Unselected conditional sugar cannot enter the total');
assert(sugar.optional,'Keep the conditional preparation excluded');

const metric=value=>({value,amount:100,unit:'g',kind:'generic'});
const resolve=name=>({name,nutrition:{energy:metric(100),sodium:metric(0)},reason:''});
resolve.quantityCandidates=name=>name==='달걀'?['노른자']:[];
const calculated=calculateRecipeNutrition(parsed,resolve);
assert.equal(calculated.totals.energy.value,276,'Only 80+80+52+64g of the measured foods may contribute');
assert.equal(calculated.totals.energy.known,4);
assert.equal(calculated.totals.energy.missing,0);
assert.equal(calculated.totals.sodium.value,0);
assert.equal(calculated.warnings.includes('분량 미확인: 달걀'),false,'Measured egg yolk is not a missing egg input');
assert.equal(calculated.partial,false,'This controlled fixture has complete active nutrient data');

// An owner exclusion must still override parser defaults without mutating
// any saved nutritionPlan.
const settings={servings:1,overrides:[{key:byName('버터').key,included:false,percent:100,ingredient:''}]};
const saved=structuredClone(settings);
const ownerExcluded=calculateRecipeNutrition(parsed,resolve,settings);
assert.deepEqual(settings,saved);
assert.equal(ownerExcluded.totals.energy.value,196);
assert(ownerExcluded.warnings.includes('분량 미확인: 버터'));
assert(ownerExcluded.partial);

// At top level, the left side can be a *combination* of multiple ingredients.
// Do not auto-select the first member of that mixture just because '+' exists.
const combination=parseRecipeAmounts('우지 2g + 땅콩기름 1.5g / 땅콩기름 4g',['우지','땅콩기름']);
assert.equal(combination.rows.length,3);
assert(combination.rows.every(row=>!row.included),'A top-level mixture alternative must stay excluded');
const mixtureTotal=calculateRecipeNutrition(combination,resolve);
assert.equal(mixtureTotal.totals.energy.known,0);
assert(mixtureTotal.partial);

// Parenthesized nutrition ratios should not erase neighboring weighed foods.
const ratio=parseRecipeAmounts('설탕 10g + (영양표 2g/100g 참고) + 버터 5g',['설탕','버터']);
assert.equal(ratio.rows.find(row=>row.name==='설탕')?.included,true);
assert.equal(ratio.rows.find(row=>row.name==='버터')?.included,true);

// A fractional onion quantity next to a *different*, nested slash choice
// must not become a top-level alternative for the whole preparation line.
const fractionalNested=parseRecipeAmounts(
 '버터 10g + (꿀 5g/설탕 10g 선택) + 양파 1/2개 (60g)',
 ['버터','꿀','설탕','양파'],
);
assert.equal(fractionalNested.rows.find(row=>row.name==='버터')?.included,true);
const onion=fractionalNested.rows.find(row=>row.name==='양파');
assert(onion);
assert.equal(onion.amount,60);
assert.equal(onion.included,true,'1/2 is a fraction, not an alternative slash');
assert.equal(fractionalNested.rows.find(row=>row.name==='꿀')?.included,false);

// A top-level 100g/125g choice remains review-only, not a confirmed 100g
// contribution. The same is true for a slash-delimited sweetener alternative.
const variant=parseRecipeAmounts('소바 100g/125g',['소바']);
assert(variant.rows.every(row=>!row.included));
const sweetener=parseRecipeAmounts('요거트 100g + 블루베리 60g + 꿀 10g / 연유 12g');
assert(sweetener.rows.every(row=>!row.included));

// The other ingredients may be fully measured while a required fat/sweetener
// combination is not selected. That is not a finished edible intake total.
const completeFood=['감자 100g','우지 2g + 땅콩기름 1.5g / 땅콩기름 4g'].join('\n');
const fatParsed=parseRecipeAmounts(completeFood,['감자','우지','땅콩기름']);
const unchosenFat=calculateRecipeNutrition(fatParsed,resolve);
assert.equal(unchosenFat.totals.energy.known,1,'Known potato still counts once');
assert.equal(unchosenFat.totals.energy.value,100);
assert(unchosenFat.warnings.some(w=>w.startsWith('대체 재료·분량 선택 확인:')));
assert.equal(unchosenFat.partial,true,'Unchosen nonoptional fat must block the complete badge');
assert.equal(unchosenFat.warnings.some(w=>w.startsWith('분량 미확인:')),false,'Input amounts were written; the choice is unknown');

// An owner selection stops the *unchosen group* warning, without silently
// clearing that ingredient's existing review note for confirmation.
const chosenFat=fatParsed.rows.find(row=>row.name==='우지');
assert(chosenFat);
const fatSettings={servings:1,overrides:[{key:chosenFat.key,included:true,percent:100,ingredient:''}]};
const fatSettingsBefore=structuredClone(fatSettings);
const chosen=calculateRecipeNutrition(fatParsed,resolve,fatSettings);
assert.deepEqual(fatSettings,fatSettingsBefore);
assert.equal(chosen.warnings.some(w=>w.startsWith('대체 재료·분량 선택 확인:')),false);
assert.equal(chosen.totals.energy.value,102);
assert.equal(chosen.partial,true,'Existing choice review must remain until explicitly resolved');

// Optional toppings are not required; do not reintroduce a warning simply
// because the owner did not choose either optional ingredient.
const optionalFat=parseRecipeAmounts('감자 100g\n(우지 2g / 땅콩기름 4g 선택)',['감자']);
const optionalTotal=calculateRecipeNutrition(optionalFat,resolve);
assert.equal(optionalTotal.warnings.some(w=>w.startsWith('대체 재료·분량 선택 확인:')),false);
assert.equal(optionalTotal.partial,false);
assert.equal(optionalTotal.totals.energy.value,100);

// A microwave-timing slash is not a weighed ingredient alternative.
const method=parseRecipeAmounts('1. 양파 40g 전자레인지 1분 / 약불로 10초 예열한 팬에 버터 15g 넣기',
 ['양파','버터']);
const methodTotal=calculateRecipeNutrition(method,resolve);
assert.equal(methodTotal.warnings.some(w=>w.startsWith('대체 재료·분량 선택 확인:')),false,
 'Do not invent a food-selection warning from slash-delimited cooking methods');


// A sauce's already-finished weight range is not an ingredient choice.
const finishedWeight=parseRecipeAmounts(
 '설탕 10g\n4. 소스 완성 무게 155g/157g 안되면 물 추가',
 ['설탕'],
);
const finishedTotal=calculateRecipeNutrition(finishedWeight,resolve);
assert.equal(finishedTotal.warnings.some(w=>w.startsWith('대체 재료·분량 선택 확인:')),false);

// A specific noodle serving weight is a genuine unresolved input choice.
const servingChoice=calculateRecipeNutrition(parseRecipeAmounts('소바 100g/125g',['소바']),resolve);
assert.equal(servingChoice.warnings.some(w=>w.startsWith('대체 재료·분량 선택 확인:')),true);
assert.equal(servingChoice.partial,true);

// The original generic "condensed milk / honey" requirement already has a
// missing requirement warning; avoid adding a redundant selection warning.
const genericChoice=calculateRecipeNutrition(
 parseRecipeAmounts('과일 100g\n연유 8g/아카시아꿀 5g',['과일','연유 / 아카시아꿀']),resolve
);
assert(genericChoice.warnings.includes('분량 미확인: 연유 / 아카시아꿀'));
assert.equal(genericChoice.warnings.some(w=>w.startsWith('대체 재료·분량 선택 확인:')),false);


// An explicit owner choice can finish a *standalone* two-food alternative,
// without altering the original text, stored quantities or saved row keys.
const simpleText='감자 100g\n우지 10g / 땅콩기름 10g';
const simpleParsed=parseRecipeAmounts(simpleText,['감자','우지','땅콩기름']);
const simpleRows=simpleParsed.rows.filter(row=>row.review==='대체안 중 사용할 조합을 선택해 주세요.');
assert.equal(simpleRows.length,2);
assert.equal(simpleParsed.body,simpleText);
for(const selected of simpleRows){
 const choice={servings:1,overrides:[{key:selected.key,included:true,percent:100,ingredient:''}]};
 const snapshot=structuredClone(choice);
 const result=calculateRecipeNutrition(simpleParsed,resolve,choice);
 assert.deepEqual(choice,snapshot,'Owner choice must not mutate the saved plan');
 assert.equal(result.totals.energy.value,110,'Exactly one weighed oil choice contributes');
 assert.deepEqual(result.warnings,[]);
 assert.equal(result.partial,false,'A valid explicit one-of-two food choice can be complete');
 assert.equal(result.rows.find(row=>row.key===selected.key)?.review,'');
 assert.equal(result.rows.filter(row=>row.included).length,2);
 assert.equal(result.rows.filter(row=>row.review==='대체안 중 사용할 조합을 선택해 주세요.').length,1);
}
const bothSettings={servings:1,overrides:simpleRows.map(row=>({key:row.key,included:true,percent:100,ingredient:''}))};
const both=calculateRecipeNutrition(simpleParsed,resolve,bothSettings);
assert.equal(both.totals.energy.value,120,'Never silently exclude or change the owner choices');
assert.equal(both.partial,true,'Selecting both exclusive alternatives must remain incomplete');
assert(both.warnings.some(w=>w.includes('두 대체안을 모두 포함했어요')));

// A slash-delimited required label is satisfied by *one* exact selected food.
// This must not convert the unselected second option into required intake.
const combined=parseRecipeAmounts('과일 100g\n연유 8g/아카시아꿀 5g',['과일','연유 / 아카시아꿀']);
const combinedRows=combined.rows.filter(row=>row.review==='대체안 중 사용할 조합을 선택해 주세요.');
assert.equal(combinedRows.length,2);
assert(combined.warnings.includes('분량 미확인: 연유 / 아카시아꿀'));
for(const selected of combinedRows){
 const result=calculateRecipeNutrition(combined,resolve,{servings:1,overrides:[{key:selected.key,included:true,percent:100,ingredient:''}]});
 assert.equal(result.warnings.includes('분량 미확인: 연유 / 아카시아꿀'),false);
 assert.deepEqual(result.warnings,[]);
 assert.equal(result.partial,false);
 assert.equal(result.totals.energy.value,100+selected.amount);
}
const combinedBoth=calculateRecipeNutrition(combined,resolve,{servings:1,
 overrides:combinedRows.map(row=>({key:row.key,included:true,percent:100,ingredient:''}))});
assert.equal(combinedBoth.warnings.includes('분량 미확인: 연유 / 아카시아꿀'),false,
 'Both quantities are measured; the remaining issue is duplicate alternative inclusion');
assert(combinedBoth.warnings.some(w=>w.includes('두 대체안을 모두 포함했어요')));
assert(combinedBoth.partial);

// Selection is *not* automatically confirmed when a slash separates a
// multi-ingredient mixture or a one-row amount shorthand.
assert.equal(chosen.rows.find(row=>row.name==='우지')?.review,
 '대체안 중 사용할 조합을 선택해 주세요.');
assert.equal(chosen.partial,true);
assert.equal(servingChoice.partial,true);

console.log('Nested alternatives exclude only their own segment; top-level mixture choices and owner overrides remain protected.');
