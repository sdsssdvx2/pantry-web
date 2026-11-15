import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {requireKitchenDataset} from './sample-data.mjs';
requireKitchenDataset('check-nutrition-egg-yolk-quantity-warning.mjs');

const originalFetch=globalThis.fetch;
globalThis.fetch=async input=>{
 const url=input instanceof URL?new URL(input.href):new URL(String(input));
 url.search='';url.hash='';
 const value=JSON.parse(await readFile(fileURLToPath(url),'utf8'));
 return {ok:true,json:async()=>value};
};

try{
 const [{parseRecipeAmounts,calculateRecipeNutrition},{createNutritionResolver}]=await Promise.all([
  import(`../public/nutrition.js?egg-yolk-warning=${Date.now()}`),
  import(`../public/nutrition-resolver.js?egg-yolk-warning=${Date.now()}`)
 ]);
 const resolve=createNutritionResolver({pantry:['달걀']});
 const directYolk=resolve('계란 노른자',{rawName:'계란 노른자',sourceName:'계란 노른자'});
 assert.notEqual(directYolk.name,'달걀','기존 resolver가 노른자를 통달걀 identity로 바꾸면 안 됩니다.');
 assert.match(directYolk.nutrition?.energy?.source||'',/Egg, yolk/i,'노른자는 기존 전용 generic nutrition profile을 유지해야 합니다.');
 for(const line of ['계란 노른자 1개','버터 12g + 계란 노른자 1개 + 레몬즙 1.5g']){
  const parsed=parseRecipeAmounts(line,['달걀']);
  assert(parsed.warnings.includes('분량 미확인: 달걀'),'parser 단계에서는 노른자와 통달걀 required를 동일 identity로 취급하면 안 됩니다.');
  const calculated=calculateRecipeNutrition(parsed,resolve);
  assert.equal(calculated.warnings.includes('분량 미확인: 달걀'),false,'정량된 계란 노른자 1개는 달걀 required의 false missing-quantity warning만 제거해야 합니다.');
  const yolk=calculated.rows.find(row=>row.sourceName==='계란 노른자'||row.name==='계란 노른자');
  assert(yolk,'계란 노른자 정량 행 자체는 보존되어야 합니다.');
  assert.equal(yolk.amount,1);
  assert.equal(yolk.unit,'piece');
  assert.notEqual(yolk.ingredient,'달걀','warning-only 후보 때문에 노른자를 통달걀 identity로 자동 연결하면 안 됩니다.');
  assert.deepEqual(yolk.profile,directYolk.nutrition,'warning-only 후보는 기존 노른자 전용 nutrition profile을 바꾸면 안 됩니다.');
  assert.equal(yolk.profile?.gramsPerPiece,17,'기존 노른자 1개 환산값을 보존해야 합니다.');
 }

 const bareParsed=parseRecipeAmounts('크림치즈 80g + 버터 80g + 노른자 52g (약 3개) + 연유 64g',['달걀']);
 assert(bareParsed.warnings.includes('분량 미확인: 달걀'),'parser 단계에서는 bare 노른자와 통달걀 required를 동일 identity로 취급하면 안 됩니다.');
 const bareCalculated=calculateRecipeNutrition(bareParsed,resolve);
 assert.equal(bareCalculated.warnings.includes('분량 미확인: 달걀'),false,'정량된 bare 노른자 52g은 달걀 required의 false missing-quantity warning만 제거해야 합니다.');
 const bareYolk=bareCalculated.rows.find(row=>row.sourceName==='노른자'||row.name==='노른자');
 assert(bareYolk,'bare 노른자 정량 행 자체는 보존되어야 합니다.');
 assert.equal(bareYolk.amount,52);
 assert.equal(bareYolk.unit,'g');
 assert.notEqual(bareYolk.ingredient,'달걀','warning-only 후보 때문에 bare 노른자를 통달걀 identity로 자동 연결하면 안 됩니다.');

 const wholeEgg=parseRecipeAmounts('달걀 1개',['계란 노른자']);
 const reverse=calculateRecipeNutrition(wholeEgg,resolve);
 assert.equal(reverse.warnings.includes('분량 미확인: 계란 노른자'),true,'통달걀 1개가 특정 노른자 required를 역방향으로 만족시키면 안 됩니다.');

 const omelet=parseRecipeAmounts('계란말이 1개',['달걀']);
 const unrelated=calculateRecipeNutrition(omelet,resolve);
 assert.equal(unrelated.warnings.includes('분량 미확인: 달걀'),true,'계란말이 같은 다른 식품까지 달걀 분량으로 간주하면 안 됩니다.');

 console.log('Egg-yolk quantities suppress only the generic egg missing-quantity warning.');
}finally{
 globalThis.fetch=originalFetch;
}
