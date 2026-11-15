import assert from 'node:assert/strict';
import {parseRecipeAmounts,calculateRecipeNutrition} from '../public/nutrition.js';

const eggProfile={
 energy:{value:70,amount:1,unit:'piece',kind:'generic'},
 sodium:{value:70,amount:1,unit:'piece',kind:'generic'}
};
const riceProfile={
 energy:{value:130,amount:100,unit:'g',kind:'generic'},
 sodium:{value:1,amount:100,unit:'g',kind:'generic'}
};
const resolve=name=>{
 if(name==='계란')return {name:'계란',nutrition:eggProfile,reason:''};
 if(name==='달걀')return {name:'달걀',nutrition:eggProfile,reason:''};
 if(name==='밥')return {name:'밥',nutrition:riceProfile,reason:''};
 return {name,nutrition:{},reason:'제품·식재료 연결 확인 필요'};
};

const parsed=parseRecipeAmounts('[재료]\n계란 2개\n밥 200g',['달걀','밥']);
assert.ok(parsed.warnings.includes('분량 미확인: 달걀'),'Parser should keep its literal-name warning before resolution');
const calculated=calculateRecipeNutrition(parsed,resolve);
assert.ok(!calculated.warnings.includes('분량 미확인: 달걀'),'Resolved 계란 quantity must satisfy a 달걀 requirement');
assert.equal(calculated.rows.find(row=>row.name==='계란')?.amount,2);

const unrelated=parseRecipeAmounts('[재료]\n계란말이 2개',['달걀']);
const unrelatedCalculated=calculateRecipeNutrition(unrelated,name=>({name,nutrition:eggProfile,reason:''}));
assert.ok(unrelatedCalculated.warnings.includes('분량 미확인: 달걀'),'Do not treat other egg-containing names as the same ingredient');

const reverse=parseRecipeAmounts('[재료]\n달걀 2개',['계란']);
const reverseCalculated=calculateRecipeNutrition(reverse,resolve);
assert.ok(!reverseCalculated.warnings.includes('분량 미확인: 계란'),'The exact synonym bridge should work in both directions for quantity warnings');

console.log('Egg quantity warnings treat exact 계란/달걀 synonyms as the same ingredient without broad egg-name collapsing.');
