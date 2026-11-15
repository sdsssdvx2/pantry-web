import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {requireKitchenDataset} from './sample-data.mjs';
requireKitchenDataset('check-nutrition-fried-aromatics.mjs');

// The production resolver imports its real JSON catalogs, not mocked nutrient
// data. No external network, user DB, or personal state is touched.
globalThis.fetch=async input=>{
 const url=input instanceof URL?input:new URL(String(input));
 assert.equal(url.protocol,'file:','Only committed JSON fixtures may be read');
 return {ok:true,json:async()=>JSON.parse(fs.readFileSync(fileURLToPath(url),'utf8'))};
};
const {ingredientNutrition,createNutritionResolver,nutritionProductKey}=await import('../public/nutrition-resolver.js');
const {parseRecipeAmounts,calculateRecipeNutrition,nutrientForAmount}=await import('../public/nutrition.js');

const sourceCases=[
 ['튀긴 샬롯 슬라이스',{energy:473.2,sodium:105,carbs:48.5,sugars:19.3,fat:25.4,saturatedFat:10.9,protein:7.3,fiber:3.1}],
 ['튀긴 마늘 후레이크',{energy:464,sodium:32,carbs:60.5,fat:18.4,protein:14}]
];
for(const [name,values] of sourceCases){
 const profile=ingredientNutrition(name);
 for(const [key,value] of Object.entries(values)){
  const m=profile[key];
  assert.equal(m?.value,value,name+': '+key+' numeric reference');
  assert.equal(m?.amount,100,name+': '+key+' per-100g basis');
  assert.equal(m?.unit,'g');
  assert.equal(m?.kind,'estimate','Never claim a commercial analog is the user product');
  assert.match(m?.url||'',/^https:\/\//);
  assert.match(m?.note||'',/실제 보유품은/,'Actual saved product identity must be disclosed');
  assert.match(m?.note||'',/보유품 영양표가 아니라|그 포장 영양표가 아니라/,'No analogous label can be presented as exact');
  assert.match(m?.note||'',name==='튀긴 샬롯 슬라이스'
   ?/APT.*샬롯97%.*옥수수전분/
   :/토호식품.*슬라이스 아님.*마늘90%/,'Distinct recipe and formulation of the held product');
  assert.doesNotMatch(m?.note||'',/브랜드 미확인 보유/,'Actual brands have already been identified');
 }
 assert.equal(profile.cholesterol,undefined,'Commercial exemplar does not measure cholesterol');
 assert.equal(profile.transFat,undefined,'Do not invent trans fat');
 assert.equal(profile.gramsPerPiece,undefined,'Do not invent garlic flake or shallot slice weight');
 assert.equal(nutrientForAmount(profile.energy,1,'piece',profile),null,'Piece count needs measured grams');
 assert.equal(nutrientForAmount(profile.energy,10,'g',profile),valueFor(values.energy,10));
 const userStock={[name]:{notes:['열량 350kcal/100g · 나트륨 222mg/100g']}};
 const ownerBefore=structuredClone(userStock);
 const label=ingredientNutrition(name,userStock);
 assert.equal(label.energy.value,350,'Owner label outranks generic analog');
 assert.equal(label.sodium.value,222,'Owner label sodium outranks generic analog');
 assert.equal(label.energy.kind,'user');
 assert.deepEqual(userStock,ownerBefore,'Never modify private saved notes');
 assert.equal(ingredientNutrition(name,{[name]:{nutrition:{productKey:null}}}).energy,undefined,
  'Explicit owner unlink disallows both analog and generic fallback');
 assert.equal(nutritionProductKey(name),null,'Unbranded names do not become exact product keys');
}
function valueFor(v,grams){return v*grams/100}

const held=['튀긴 샬롯 슬라이스','튀긴 마늘 후레이크'];
const resolver=createNutritionResolver({pantry:held,stockOverrides:{}});
for(const name of held){
 assert.equal(resolver(name).name,name);
 assert.equal(resolver(name).nutrition.energy.value,name===held[0]?473.2:464);
}
// A distinctly named sliced garnish now has a source-graded generic *estimate*
// even if the owner's separately held granular TOHO flakes are in stock.
// This is NOT proof of a product-identity link between slices and granules.
assert.equal(resolver('튀긴마늘 슬라이스').name,'튀긴마늘 슬라이스');
assert.equal(resolver('튀긴마늘 슬라이스').nutrition.energy?.value,440,
 'Slice form can use a separate unbranded reference without acquiring the flake value');

const recipe=parseRecipeAmounts('[재료]\n튀긴 샬롯 슬라이스 4g\n튀긴 마늘 후레이크 3g\n[조리]\n1. 접시에 뿌리기',held);
assert.equal(recipe.rows.filter(x=>x.included).length,2,'Two measured fried aromatics');
const total=calculateRecipeNutrition(recipe,resolver);
assert.equal(total.totals.energy.missing,0);
assert.equal(total.totals.sodium.missing,0);
assert.ok(Math.abs(total.totals.energy.value-(473.2*0.04+464*0.03))<1e-8);
assert.ok(Math.abs(total.totals.sodium.value-(105*0.04+32*0.03))<1e-8);

// A separate saved slice product, if introduced later, must not silently
// inherit the existing flake identity or override an owner product selection.
const separate=createNutritionResolver({
 pantry:['튀긴마늘 슬라이스','튀긴 마늘 후레이크'],
 stockOverrides:{'튀긴마늘 슬라이스':{nutrition:{
  energy:{value:600,amount:100,unit:'g',kind:'user'},
  sodium:{value:600,amount:100,unit:'g',kind:'user'}
 }}}
});
assert.equal(separate('튀긴마늘 슬라이스').name,'튀긴마늘 슬라이스');
assert.equal(separate('튀긴마늘 슬라이스').nutrition.energy.value,600);
assert.equal(separate('튀긴 마늘 후레이크').nutrition.energy.value,464);
const unheld=createNutritionResolver({pantry:[],stockOverrides:{}});
assert.notEqual(unheld('튀긴마늘 슬라이스').name,'튀긴 마늘 후레이크',
 'A different item must not be assigned when no held garlic exists');
assert.equal(unheld('튀긴마늘 슬라이스').nutrition.energy?.value,440,
 'The reference is generic food evidence, not an invented held-product identity');

// Representative *dry ingredient* analog labels, not verified owner packaging.
for(const [name,energy,sodium,basis,dryGrams] of [
 ['건 연근',113,16,30,3],
 ['건 팽이버섯',187,40,100,2],
 ['귤피',377,5,100,1]
]){
 const profile=ingredientNutrition(name);
 assert.equal(profile.energy?.kind,'estimate',name+': analogous kcal source');
 assert.equal(profile.sodium?.kind,'estimate',name+': analogous sodium source');
 assert.equal(profile.energy?.value,energy);
 assert.equal(profile.sodium?.value,sodium);
 assert.equal(profile.energy?.amount,basis);
 assert.equal(profile.sodium?.amount,basis);
 assert.equal(profile.energy?.unit,'g');
 assert.equal(profile.sodium?.unit,'g');
 assert.match(profile.energy?.note||'',/포장.*아니라|추정치/);
 assert.equal(profile.sugars,undefined,name+': do not fabricate sugars');
 assert.equal(profile.transFat,undefined,name+': do not fabricate trans fat');
 assert.ok(Math.abs(nutrientForAmount(profile.energy,dryGrams,'g',profile)-energy*dryGrams/basis)<1e-9);
 assert.ok(Math.abs(nutrientForAmount(profile.sodium,dryGrams,'g',profile)-sodium*dryGrams/basis)<1e-9);
 const original={[name]:{notes:['열량 350kcal/100g · 나트륨 222mg/100g']}};
 const saved=structuredClone(original);
 const own=ingredientNutrition(name,original);
 assert.equal(own.energy?.kind,'user');
 assert.equal(own.sodium?.kind,'user');
 assert.equal(own.energy?.value,350);
 assert.equal(own.sodium?.value,222);
 assert.deepEqual(original,saved,'Do not touch owner-supplied stock notes');
 assert.equal(ingredientNutrition(name,{[name]:{nutrition:{productKey:null}}}).energy,undefined,
  'Explicit owner unlink must suppress analog food values');
}
console.log('DRIED_VEGETABLE_ANALOGS=PASS; ORIGINAL_DRY_GRAMS=PASS; UNKNOWN_NUTRIENTS_REMAIN_UNKNOWN=PASS');

// Source-graded generic SLICE, not the already separately identified TOHO
// crushed flakes. Nutrient identities and measured weight must not leak
// from the sliced benchmark into the owner's actual granular product.
const sliced=ingredientNutrition('튀긴마늘 슬라이스');
const sliceReference={energy:440,sodium:17,carbs:56.8,fat:22.6,protein:14.1,fiber:23.5};
for(const [key,value] of Object.entries(sliceReference)){
 const metric=sliced[key];
 assert.equal(metric?.value,value,'Sliced fried garlic analog '+key);
 assert.equal(metric?.amount,100);
 assert.equal(metric?.unit,'g');
 assert.equal(metric?.kind,'estimate','Unmeasured owner brand must not become a product label');
 assert.match(metric?.url||'',/^https:\/\//);
 assert.match(metric?.note||'',/보유품.*후레이크.*슬라이스가 아니므로/);
 assert.match(metric?.note||'',/유사제품 추정치/);
}
assert.equal(sliced.sugars,undefined,'Japanese 糖質 is not sugars');
assert.equal(sliced.saturatedFat,undefined);
assert.equal(sliced.transFat,undefined);
assert.equal(sliced.cholesterol,undefined);
assert.equal(sliced.gramsPerPiece,undefined,'Do not guess grams per fried slice');
assert.equal(nutrientForAmount(sliced.energy,5,'piece',sliced),null,
 'A recipe specifying only a piece count has unknown edible grams');
assert.equal(ingredientNutrition('튀긴 마늘 슬라이스').energy?.value,440,
 'Spacing variation resolves same physical slice form');
const crushed=ingredientNutrition('튀긴 마늘 후레이크');
assert.equal(crushed.energy?.value,464,'Owner granular flakes keep their separate benchmark');
assert.equal(crushed.sodium?.value,32);
const sliceResolver=createNutritionResolver({pantry:['튀긴 마늘 후레이크'],stockOverrides:{}});
const raw=['[재료]','튀긴마늘 슬라이스 5g','[조리]','1. 익힌 밥 위에 슬라이스 고명을 뿌려 먹기'].join('\n');
const parsed=parseRecipeAmounts(raw,['튀긴 마늘']);
const weighed=parsed.rows.find(row=>row.name==='튀긴마늘 슬라이스');
assert.equal(weighed?.included,true);
assert.equal(weighed?.amount,5);
assert.equal(weighed?.unit,'g');
const calculated=calculateRecipeNutrition(parsed,sliceResolver);
assert.ok(Math.abs(calculated.totals.energy.value-22)<1e-8,'5g edible slice ~22 kcal');
assert.ok(Math.abs(calculated.totals.sodium.value-0.85)<1e-8,'5g edible slice ~0.85mg sodium');
assert.equal(calculated.totals.energy.missing,0);
assert.equal(calculated.totals.sodium.missing,0);
assert.equal(ingredientNutrition('튀긴마늘 슬라이스',{'튀긴마늘 슬라이스':{nutrition:{productKey:null}}}).energy,undefined,
 'Explicit owner unlink has precedence over the generic sliced-food analog');
const ownerInputs={'튀긴마늘 슬라이스':{nutrition:{
 energy:{value:330,amount:100,unit:'g',kind:'user',source:'현물 확인'},
 sodium:{value:150,amount:100,unit:'g',kind:'user',source:'현물 확인'}
}}};
assert.equal(ingredientNutrition('튀긴마늘 슬라이스',ownerInputs).energy?.value,330);
assert.equal(ingredientNutrition('튀긴마늘 슬라이스',ownerInputs).sodium?.value,150);
console.log('GARLIC_SLICES=PASS; DRY_5G=22KCAL; PIECE_MASS_UNKNOWN; CRUSHED_FLAKES_UNCHANGED=YES');

console.log('FRIED_AROMATICS=PASS; NUTRIENT_REFERENCES=13; RECIPE_G_BASIS=PASS; OWNER_OVERRIDE=PASS; NO_UNVERIFIED_GARLIC_IDENTITY_BRIDGE=PASS');
