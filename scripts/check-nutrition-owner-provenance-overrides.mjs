import assert from 'node:assert/strict';
import {parseRecipeAmounts,calculateRecipeNutrition,validateNutrition,validateRecipeNutrition} from '../public/nutrition.js';

// A single recipe can override its own nutrient evidence without modifying
// any catalog, pantry record, or recipe text. All data is synthetic.
const original='[재료]\n시험용 소스 40g\n[조리]\n1. 섞기';
const parsed=parseRecipeAmounts(original,['시험용 소스']);
assert.equal(parsed.rows.length,1);
const key=parsed.rows[0].key;
const base={
 energy:{value:200,amount:100,unit:'g',kind:'product',source:'상품 표시',url:'https://example.org/old',note:'기존 자동 정보'},
 sodium:{value:500,amount:100,unit:'g',kind:'product',source:'상품 표시',url:'https://example.org/old'},
 protein:{value:4,amount:100,unit:'g',kind:'generic',source:'일반 식품'}
};
const resolve=name=>({name,nutrition:base});
const initial=calculateRecipeNutrition(parsed,resolve);
assert.equal(initial.totals.energy.value,80);
assert.equal(initial.totals.sodium.value,200);
assert.equal(initial.rows[0].profile.energy.source,'상품 표시');
const manual={
 energy:{value:120,amount:40,unit:'g',kind:'user',
  source:'내 보유 포장 뒷면',url:'https://example.org/new',note:'40g 기준 직접 확인'},
 sodium:null,
 gramsPerMl:1.2
};
const plan=validateRecipeNutrition({servings:2,overrides:[
 {key,included:true,percent:50,ingredient:'시험용 소스',evidenceFor:'시험용 소스',evidencePreparation:'',evidenceProductKey:'',nutrition:manual}
]});
assert.deepEqual(plan,validateRecipeNutrition(JSON.parse(JSON.stringify(plan))));
const modified=calculateRecipeNutrition(parsed,resolve,plan);
assert.equal(modified.totals.energy.value,60,'120 kcal for 40g at 50%');
assert.equal(modified.totals.sodium.missing,1,'explicitly unknown does not become 0');
assert.equal(modified.totals.protein.value,0.8,'unmodified source remains inherited');
assert.equal(modified.rows[0].profile.energy.kind,'user');
assert.equal(modified.rows[0].profile.energy.url,'https://example.org/new');
assert.equal(modified.rows[0].profile.energy.note,'40g 기준 직접 확인');
assert.equal(modified.rows[0].profile.sodium,null);
assert.equal(modified.rows[0].baseProfile.energy.source,'상품 표시');
assert.equal(modified.rows[0].profile.gramsPerMl,1.2);
assert.equal(modified.partial,true,'an unknown sodium prevents a complete result');
const alternate=validateRecipeNutrition({servings:2,overrides:[
 {key,included:true,percent:50,ingredient:'시험용 다른 소스',evidenceFor:'시험용 소스',evidencePreparation:'',evidenceProductKey:'',nutrition:manual}
]});
const different=calculateRecipeNutrition(parsed,resolve,alternate);
assert.equal(different.rows[0].evidenceDormant,true,'Another product must not inherit stale manual values');
assert.equal(different.totals.energy.value,40,'Base 200 kcal/100g at 40g x 50%');
assert.equal(different.totals.sodium.value,100,'Suspended unknown must not hide new product sodium');
const back=calculateRecipeNutrition(parsed,resolve,plan);
assert.equal(back.rows[0].evidenceDormant,false,'Switching back revives the old value');
assert.equal(back.totals.energy.value,60);
// The resolver may map a saved, stable ingredient label to a different
// underlying product; comparing against the stale override.ingredient
// silently applied an obsolete label to the new product.
const oldBrand=()=>({name:'시험용 소스',nutrition:base,productKey:'brand-A'});
const newBrand=()=>({name:'시험용 소스',nutrition:base,productKey:'brand-B'});
const productPlan=validateRecipeNutrition({servings:1,overrides:[{
 key,included:true,percent:100,ingredient:'시험용 소스',
 evidenceFor:'시험용 소스',evidencePreparation:'',evidenceProductKey:'brand-A',
 nutrition:{energy:manual.energy}
}]});
assert.equal(calculateRecipeNutrition(parsed,oldBrand,productPlan).totals.energy.value,120);
const productChanged=calculateRecipeNutrition(parsed,newBrand,productPlan);
assert.equal(productChanged.rows[0].evidenceDormant,true,'Product link replacement suspends the old label');
assert.equal(productChanged.totals.energy.value,80,'New product uses its own catalog data');
assert.equal(productChanged.rows[0].resolvedProductKey,'brand-B');
assert.equal(calculateRecipeNutrition(parsed,oldBrand,productPlan).rows[0].evidenceDormant,false);
const redirected=()=>({name:'다른 실제 상품',nutrition:base});
const staleName=calculateRecipeNutrition(parsed,redirected,plan);
assert.equal(staleName.rows[0].evidenceDormant,true,
 'Resolved actual product identity must win over old saved selection');
assert.equal(staleName.totals.energy.value,40);
const prepared=structuredClone(parsed);
prepared.rows[0].preparation='drainedOil';
const prepDifferent=calculateRecipeNutrition(prepared,resolve,plan);
assert.equal(prepDifferent.rows[0].evidenceDormant,true,
 'A raw product label cannot silently apply after the recipe changes to drained oil');
assert.equal(prepDifferent.totals.energy.value,40);
assert.equal(calculateRecipeNutrition(parsed,resolve,plan).rows[0].evidenceDormant,false,
 'Switching back to the original preparation restores evidence');
assert.equal(parsed.body,original,'recipe text must never be modified');
assert.equal(base.energy.value,200,'product catalog source is immutable');
assert.equal(base.sodium.value,500,'global stock profile is immutable');
const restored=calculateRecipeNutrition(parsed,resolve,
 validateRecipeNutrition({servings:1,overrides:[{key,included:true,percent:100,ingredient:'시험용 소스'}]}));
assert.equal(restored.totals.energy.value,80);
assert.equal(restored.totals.sodium.value,200);
assert.equal(restored.rows[0].profile.energy.url,'https://example.org/old');
const research=validateNutrition({researchNote:'보유 제품 영양표 미확인',researchUrl:'https://example.org/research'});
assert.equal(research.researchNote,'보유 제품 영양표 미확인');
assert.equal(research.researchUrl,'https://example.org/research');
const researchOnly=validateRecipeNutrition({servings:1,overrides:[
 {key,included:true,percent:100,ingredient:'시험용 소스',evidenceFor:'시험용 소스',evidencePreparation:'',evidenceProductKey:'',nutrition:research}
]});
const unresolvedResearch=calculateRecipeNutrition(parsed,()=>({name:'시험용 소스',nutrition:{}}),researchOnly);
assert.equal(unresolvedResearch.totals.energy.missing,1,'Research notes never count as known energy');
assert.equal(unresolvedResearch.totals.sodium.missing,1,'Research notes never count as known sodium');
assert.equal(unresolvedResearch.rows[0].profile.researchNote,research.researchNote);
assert.equal(unresolvedResearch.partial,true);
assert.throws(()=>validateNutrition({researchUrl:'http://unsafe.invalid'}),/https/);
const zero=calculateRecipeNutrition(parsed,resolve,
 validateRecipeNutrition({servings:1,overrides:[{key,included:true,percent:100,ingredient:'시험용 소스',evidenceFor:'시험용 소스',evidencePreparation:'',evidenceProductKey:'',nutrition:{
  energy:{value:0,amount:40,unit:'g',kind:'user',source:'확인된 제로'}
 }}]}));
assert.equal(zero.totals.energy.value,0,'verified 0 is distinct from unknown');
assert.equal(zero.totals.energy.missing,0);
assert.throws(()=>validateRecipeNutrition({servings:1,overrides:[
 {key,included:true,percent:100,ingredient:'시험용 소스',nutrition:{energy:{value:20,amount:40,unit:'g',url:'http://unsafe.invalid'}}}
]}),/https/);
assert.throws(()=>validateNutrition({sodium:{value:-3,amount:100,unit:'g'}}),/수치/);
// Incomplete or imported legacy binding is preserved but cannot auto-apply.
for(const identity of [{},{evidenceFor:'시험용 소스',evidencePreparation:''}]){
 const orphan=validateRecipeNutrition({servings:1,overrides:[{key,included:true,percent:100,
  ingredient:'시험용 소스',...identity,nutrition:{energy:manual.energy}}]});
 const safe=calculateRecipeNutrition(parsed,resolve,orphan);
 assert.equal(safe.rows[0].evidenceDormant,true);
 assert.equal(safe.totals.energy.value,80,'Do not borrow unbound proof');
}
for(const identity of [
 {evidenceFor:'x'.repeat(151),evidencePreparation:'',evidenceProductKey:''},
 {evidenceFor:'시험용 소스',evidencePreparation:'x'.repeat(101),evidenceProductKey:''},
 {evidenceFor:'시험용 소스',evidencePreparation:'',evidenceProductKey:'x'.repeat(151)}
]){
 assert.throws(()=>validateRecipeNutrition({servings:1,overrides:[{key,included:true,percent:100,
  ingredient:'시험용 소스',...identity,nutrition:{energy:manual.energy}}]}),/영양 근거/);
}
const emptyCorrection=validateRecipeNutrition({servings:1,overrides:[{
 key,included:true,percent:100,ingredient:'시험용 소스',
 evidenceFor:'시험용 소스',evidencePreparation:'',evidenceProductKey:'brand-A',nutrition:{}
}]});
assert.equal(calculateRecipeNutrition(parsed,newBrand,emptyCorrection).rows[0].evidenceDormant,false,
 'An empty override must not show a misleading dormant warning');
console.log('Recipe-local nutrient evidence corrections: source, value, null, reset, validation, percent, and global immutability PASS.');
