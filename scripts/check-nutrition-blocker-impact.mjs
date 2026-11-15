import assert from 'node:assert/strict';
import {analyzeNutritionSingleBlockers} from '../public/nutrition-blocker-impact.js';
// Synthetic only. A candidate never changes the underlying nutrition data.
const rows=(names,warnings=[],review=false)=>({rows:names.map(name=>({
 included:true,percent:100,ingredient:name,name,review:review?'amount?':'',
 profile:{},values:{energy:null,sodium:null}
})),warnings});
const resolved={};
const recipes=[
 {id:'built-in',name:'실험 레시피',variants:[
  {key:'a',original:'OK'}, {key:'b',original:'WARNING'},
  {key:'c',original:'MULTIPLE'}, {key:'d',original:'ZERO_PERCENT'},
  {key:'e',original:'CONVERSION'}, {key:'f',original:'REVIEW'},
  {key:'g',original:'MIXED_CONVERSION'},
  {key:'h',original:'UNRESOLVED_IDENTITY'},
  {key:'i',original:'DORMANT_EVIDENCE'}
 ]},
 {id:'edited',name:'수정 레시피',variants:[{key:'base',original:'OLD'}]},
 {id:'custom',name:'개인 레시피',steps:['SINGLE']},
 {id:'body-only',name:'본문 계량 레시피',required:[],steps:['BODY_ONLY']},
 {id:'unversioned-original',original:'UNVERSIONED_ORIGINAL',steps:[]},
 {id:'empty',steps:['']},
 // A duplicate version must never inflate the count.
 {id:'built-in',variants:[{key:'a',original:'OK'}]}
];
const sources=[{sourceId:'edited',variantKey:'base',recipe:{
 steps:['EDITED'],required:['verified'],nutritionPlan:{servings:2,overrides:[]}
}}];
let editedPlan=false;
const calc=(parsed,_resolve,plan)=>{
 const tag=parsed.tag;
 if(tag==='EDITED'){assert.equal(plan.servings,2);editedPlan=true;}
 if(tag==='OK'||tag==='EDITED'||tag==='SINGLE')return rows(['샬롯']);
 if(tag==='BODY_ONLY')return rows(['본문 전용']);
 if(tag==='UNVERSIONED_ORIGINAL')return rows(['샬롯']);
 if(tag==='UNRESOLVED_IDENTITY')return {rows:[{
  included:true,percent:100,ingredient:'샬롯',name:'샬롯',profile:{},
  resolution:'제품·식재료 연결 확인 필요',values:{energy:null,sodium:null}
 }],warnings:[]};
 if(tag==='DORMANT_EVIDENCE')return {rows:[{
  included:true,percent:100,ingredient:'샬롯',name:'샬롯',profile:{},
  evidenceDormant:true,values:{energy:null,sodium:null}
 }],warnings:[]};
 if(tag==='WARNING')return rows(['샬롯'],['분량 확인 필요']);
 if(tag==='MULTIPLE')return rows(['샬롯','청하']);
 if(tag==='REVIEW')return rows(['샬롯'],[],true);
 if(tag==='ZERO_PERCENT')return {rows:[{included:true,percent:0,
  ingredient:'샬롯',values:{energy:null,sodium:null}}],warnings:[]};
 if(tag==='CONVERSION')return {rows:[{included:true,percent:100,
  ingredient:'샬롯',profile:{energy:{value:100}},values:{energy:null,sodium:5}}],warnings:[]};
 if(tag==='MIXED_CONVERSION')return {rows:[{included:true,percent:100,
  ingredient:'샬롯',profile:{sodium:{value:8}},
  values:{energy:null,sodium:null}}],warnings:[]};
 if(tag==='OLD')throw Error('Saved edit must supersede old source');
 return rows([]);
};
const input={recipes,sourceEdits:sources,eligibleNames:['샬롯','청하','본문 전용'],resolve:()=>resolved,
 parseRecipeAmounts:(raw,required)=>({tag:raw,required}),calculateRecipeNutrition:calc};
const after=analyzeNutritionSingleBlockers(input);
assert(editedPlan);
assert.deepEqual(after.byName.get('샬롯'),{singleBlockerVersions:7,reviewFreeCandidates:4},
 'Unresolved product identity is not a single nutrient fix; dormant evidence requires review');
assert.deepEqual(after.byName.get('본문 전용'),{singleBlockerVersions:1,reviewFreeCandidates:1},
 'A measured body-only ingredient must count even with zero required-name mentions');
assert.deepEqual(after.examplesByName.get('본문 전용'),{clean:['본문 계량 레시피'],review:[]});
assert.deepEqual(after.examplesByName.get('샬롯')?.clean,
 ['실험 레시피','수정 레시피','개인 레시피'],
 'Only the first three distinct review-free titles are retained');
assert.equal(after.byName.has('청하'),false);
assert.equal(after.versions,13);
assert.equal(after.quantified,12);
assert.equal(after.errors,0);
assert.deepEqual(recipes[0].variants[0],{key:'a',original:'OK'});
assert.deepEqual(sources[0].recipe.nutritionPlan,{servings:2,overrides:[]});
const caught=analyzeNutritionSingleBlockers({...input,calculateRecipeNutrition:()=>{
 throw Error('A private recipe error');}});
assert(caught.errors>0&&caught.byName.size===0);
const noEligible=analyzeNutritionSingleBlockers({...input,eligibleNames:[],
 parseRecipeAmounts(){throw Error('Must skip expensive parsing when nothing is missing');}});
assert.deepEqual(noEligible.byName,new Map());
assert.deepEqual(noEligible.examplesByName,new Map());
assert.equal(noEligible.versions,0);
const originalCalc=(await import('../public/nutrition.js'));
const authored=originalCalc.parseRecipeAmounts('본문 전용 재료 10g',[]);
assert(authored.rows.some(row=>row.name==='본문 전용 재료'),
 'The real parser must recognize measured ingredients absent from required-name lists');
const realImpact=analyzeNutritionSingleBlockers({
 recipes:[{id:'body-only-real-parser',required:[],steps:['본문 전용 재료 10g']}],
 eligibleNames:['본문 전용 재료'],resolve:name=>({name,nutrition:{}}),
 parseRecipeAmounts:originalCalc.parseRecipeAmounts,
 calculateRecipeNutrition:originalCalc.calculateRecipeNutrition
});
assert.equal(realImpact.byName.get('본문 전용 재료')?.singleBlockerVersions,1,
 'The live calculator should expose a real body-only single nutrient blocker');
const ambiguousLive=analyzeNutritionSingleBlockers({
 recipes:[{id:'identity-unresolved',required:['본문 전용 재료'],steps:['본문 전용 재료 10g']}],
 eligibleNames:['본문 전용 재료'],
 resolve:name=>({name,reason:'자동 감지 규칙이 여러 식재료에 연결돼요. 사용할 제품을 선택해 주세요.',nutrition:{}}),
 parseRecipeAmounts:originalCalc.parseRecipeAmounts,
 calculateRecipeNutrition:originalCalc.calculateRecipeNutrition
});
assert.equal(ambiguousLive.byName.size,0,
 'The real calculator must not call an ambiguous food identity a one-label nutrient fix');
const ambiguousDirect=analyzeNutritionSingleBlockers({
 recipes:[{id:'identity-unresolved-direct',steps:['본문 전용 재료 10g']}],
 eligibleNames:['본문 전용 재료'],
 resolve:name=>({name,reason:'제품·식재료 연결 확인 필요',nutrition:{}}),
 parseRecipeAmounts:originalCalc.parseRecipeAmounts,
 calculateRecipeNutrition:originalCalc.calculateRecipeNutrition
});
assert.equal(ambiguousDirect.byName.size,0,
 'A product-selection-required resolver result must not count as a nutrient-only blocker');
assert.throws(()=>analyzeNutritionSingleBlockers({}),/CALLBACKS_REQUIRED/);
console.log('NUTRITION_SINGLE_BLOCKER_IMPACT=PASS; INCLUDED_ROWS_ONLY=YES; WARNINGS_PRESERVED=YES; LIVE_STATE_WRITES=NO');
