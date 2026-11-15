import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

// Match the established offline backup tests: no production APIs or secrets.
const nativeFetch=globalThis.fetch;
globalThis.fetch=async input=>{
 const u=input instanceof URL?input:new URL(String(input));
 if(u.protocol!=='file:')return nativeFetch(input);
 try{return {ok:true,json:async()=>JSON.parse(fs.readFileSync(fileURLToPath(u),'utf8'))};}
 catch{return {ok:false,json:async()=>{throw Error('Offline catalog unavailable');}};}
};
const {parseKitchenBackup,buildKitchenRestoreState}=await import('../public/backup-tools.js');
const metric={value:80,amount:40,unit:'g',kind:'user',source:'보유 제품 영양표',
 url:'https://example.org/label',note:'2026년 포장 40g 기준'};
const note={researchNote:'제조사 후면 자료가 없어 나트륨 검증 대기',
 researchUrl:'https://example.org/verify'};
const stock={status:'available',locations:[],notes:[],
 nutrition:{energy:metric,sodium:null,...note,gramsPerMl:1.2,conversionNote:'실측 1.2g/mL'}};
const recipe={
 id:'user-evidence-roundtrip',name:'증거 보존 테스트',category:'main',
 effort:2,time:15,required:['시험용 소스'],optional:[],summary:'격리 테스트',steps:['[재료]','시험용 소스 40g','[조리]','1. 섞기'],note:'',
 nutritionPlan:{servings:2,overrides:[{
  key:'시험용 소스|0',included:true,percent:100,ingredient:'시험용 소스',
  evidenceFor:'시험용 소스',evidenceProductKey:'product-A',nutrition:{energy:metric,sodium:null,...note}
 }]}
};
const raw={version:2,items:['시험용 소스'],stock:{'시험용 소스':stock},
 recipes:[recipe],history:[],edits:[],recipeGroupMeta:{},hidden:[],
 hiddenVariants:[],trashPurgedVariants:[],trashPurged:[],ratings:{},cookingHistory:{}};
const imported=parseKitchenBackup(JSON.parse(JSON.stringify(raw)));
assert.equal(imported.stock['시험용 소스'].nutrition.energy.url,metric.url);
assert.equal(imported.stock['시험용 소스'].nutrition.energy.note,metric.note);
assert.equal(imported.stock['시험용 소스'].nutrition.researchNote,note.researchNote);
assert.equal(imported.stock['시험용 소스'].nutrition.researchUrl,note.researchUrl);
assert.equal(imported.stock['시험용 소스'].nutrition.sodium,null);
const savedPlan=imported.recipes[0].nutritionPlan;
assert.equal(savedPlan.overrides[0].evidenceFor,'시험용 소스');
assert.equal(savedPlan.overrides[0].evidenceProductKey,'product-A');
assert.equal(savedPlan.overrides[0].nutrition.energy.source,metric.source);
assert.equal(savedPlan.overrides[0].nutrition.researchNote,note.researchNote);
assert.equal(savedPlan.overrides[0].nutrition.sodium,null);
const restored=buildKitchenRestoreState(imported,{replace:true,currentState:raw,seedRevision:'isolated-test'});
assert.equal(restored.recipes[0].nutritionPlan.overrides[0].nutrition.energy.url,metric.url);
assert.deepEqual(restored.stock['시험용 소스'].nutrition,imported.stock['시험용 소스'].nutrition);
const reparsed=parseKitchenBackup({...raw,version:2,
 stock:restored.stock,recipes:restored.recipes});
assert.deepEqual(reparsed.recipes[0].nutritionPlan,savedPlan,'Backup parsing is idempotent');
const invalid=structuredClone(raw);
invalid.recipes[0].nutritionPlan.overrides[0].nutrition.researchUrl='http://unsafe.invalid';
assert.throws(()=>parseKitchenBackup(invalid),/https/);
assert.equal(raw.stock['시험용 소스'].nutrition.energy.value,80,
 'No mutation of original stock records during offline import/restore');
// Candidate identity evidence must survive both backup validation and
// a detached restore without promoting product matching or changing nutrition.
const detached=structuredClone(raw);
const provenance={
 dataset:'K-FIND',code:'P113-501050200-0379',name:'스리라차핫칠리시즈닝(255g)',
 manufacturer:'HUY FONG FOODS, INC.',importer:'케이제이씨컴퍼니',
 pack:'255g',reportNo:'24US15O00D9',basis:'100g',dataDate:'2026-09-29'
};
detached.stock['시험용 소스'].nutrition.kfindEvidence=provenance;
const reviewed=parseKitchenBackup(detached);
assert.deepEqual(reviewed.stock['시험용 소스'].nutrition.kfindEvidence,provenance,
 'Validated offline backup retains structured K-FIND source identity');
const reviewedRestored=buildKitchenRestoreState(reviewed,{replace:true,currentState:raw,seedRevision:'isolated-test'});
assert.deepEqual(reviewedRestored.stock['시험용 소스'].nutrition.kfindEvidence,provenance,
 'Detached restore must retain the source without changing numeric evidence');
assert.equal(reviewedRestored.stock['시험용 소스'].nutrition.energy.value,metric.value);
assert.equal(raw.stock['시험용 소스'].nutrition.kfindEvidence,undefined,
 'Detached restore must not mutate the owner source fixture');
const invalidSource=structuredClone(detached);
invalidSource.stock['시험용 소스'].nutrition.kfindEvidence.basis='100kg';
assert.throws(()=>parseKitchenBackup(invalidSource),/K-FIND 영양 기준량/);
for(const [field,placeholder] of [['pack','-'],['manufacturer','해당 없음'],['code','N/A']]){
 const bad=structuredClone(detached);
 bad.stock['시험용 소스'].nutrition.kfindEvidence[field]=placeholder;
 assert.throws(()=>parseKitchenBackup(bad),/K-FIND 식별 항목/,
  'Importing an untrusted backup may not restore a fake K-FIND label identity: '+field);
}
assert.equal(raw.stock['시험용 소스'].nutrition.kfindEvidence,undefined,
 'Rejected backup tests must leave the original owner fixture unchanged');
console.log('K-FIND source identity backup/restore compatibility PASS (offline).');

console.log('Nutrition evidence backup parse and isolated replace-restore PASS (no production writes).');
