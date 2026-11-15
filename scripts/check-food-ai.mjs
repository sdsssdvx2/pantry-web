import assert from 'node:assert/strict';
import {analyzeFoodLabel,foodAiProviders,geminiLabelJson,handleFoodAi,normalizeAiLabelResult} from '../src/food-ai.js';

const normalized=normalizeAiLabelResult({
 productName:'테스트 우유',brand:'브랜드A',barcode:'8801234567890',pack:'900mL',
 ingredients:'원유 100%',allergens:'우유',storage:'냉장보관',shelfLife:'제조일로부터 14일',
 basisAmount:100,basisUnit:'ml',
 nutrition:{energy:65,sodium:50,carbs:4.8,sugars:4.8,fat:3.5,saturatedFat:2.2,protein:3.2,fiber:null,cholesterol:12,transFat:null}
},{model:'free-vision'});
assert.equal(normalized.identity.barcode,'8801234567890');
assert.equal(normalized.metrics.energy.value,65);
assert.equal(normalized.metrics.sodium.value,50);
assert.equal(Object.hasOwn(normalized.metrics,'fiber'),false);
assert.equal(Object.hasOwn(normalized.metrics,'transFat'),false);
assert.equal(normalized.kind,'estimate');
assert.equal(normalized.confidence,'ai-unverified');
assert.match(normalized.note,/미검증/);

let calls=0,requestBody=null;
const fakeFetch=async (_url,options)=>{
 calls++;requestBody=JSON.parse(options.body);
 return new Response(JSON.stringify({
  model:'particle-ai/particle-1:free',
  choices:[{finish_reason:'stop',message:{content:JSON.stringify({
   productName:'테스트 소스',brand:'브랜드B',barcode:null,pack:'300g',
   ingredients:'토마토, 소금',allergens:null,storage:'개봉 후 냉장',shelfLife:'제조일로부터 12개월',
   basisAmount:100,basisUnit:'g',
   nutrition:{energy:120,sodium:400,carbs:18,sugars:5,fat:4,saturatedFat:1,protein:2,fiber:null,cholesterol:null,transFat:null}
  })}}]
 }),{status:200,headers:{'content-type':'application/json'}});
};
const image='data:image/jpeg;base64,'+Buffer.from('fake-image').toString('base64');
const candidate=await analyzeFoodLabel({
 name:'테스트 소스',sourceUrl:'https://shop.example/vp/products/123?itemId=456',imageDataUrl:image,approveRemote:true
},{OPENROUTER_API_KEY:'secret'},fakeFetch);
assert.equal(calls,1);
assert.equal(requestBody.model,'openrouter/free');
assert.equal(requestBody.temperature,0);
assert.equal(requestBody.response_format.type,'json_schema');
assert.equal(requestBody.response_format.json_schema.strict,true);
assert.equal(requestBody.provider.require_parameters,true);
assert.deepEqual(requestBody.provider.max_price,{prompt:0,completion:0});
assert.deepEqual(requestBody.plugins,[{id:'response-healing'}]);
assert.equal(requestBody.messages[1].content.some(part=>part.type==='image_url'),true);
assert.equal(candidate.identity.storage,'개봉 후 냉장');
assert.equal(candidate.metrics.energy.value,120);

let incompleteCalls=0;
await assert.rejects(
 ()=>analyzeFoodLabel(
  {imageDataUrl:image,approveRemote:true},
  {OPENROUTER_API_KEY:'secret'},
  async()=>{incompleteCalls++;return new Response(JSON.stringify({
   model:'nvidia/nemotron-3.5-super-vl:free',
   choices:[{finish_reason:'length',message:{content:'{}'}}],
  }),{status:200,headers:{'content-type':'application/json'}});}
 ),
 /완전하게 종료되지 않았어요/
);
assert.equal(incompleteCalls,1,'incomplete response must not auto-retry');

let schemaCalls=0;
await assert.rejects(
 ()=>analyzeFoodLabel(
  {imageDataUrl:image,approveRemote:true},
  {OPENROUTER_API_KEY:'secret'},
  async()=>{schemaCalls++;return new Response(JSON.stringify({
   model:'nvidia/nemotron-3.5-super-vl:free',
   choices:[{finish_reason:'stop',message:{content:JSON.stringify({
    productName:'테스트',brand:null,barcode:null,pack:null,ingredients:null,allergens:null,
    storage:null,shelfLife:null,basisAmount:100,basisUnit:'g',
    nutrition:{energy:10,sodium:null,carbs:null,sugars:null,fat:null,saturatedFat:null,protein:null,fiber:null,cholesterol:null},
   })}}],
  }),{status:200,headers:{'content-type':'application/json'}});}
 ),
 /스키마와 일치하지 않아요/
);
assert.equal(schemaCalls,1,'schema-invalid response must not auto-retry');

let blockedCalls=0;
await assert.rejects(
 ()=>analyzeFoodLabel({imageDataUrl:image,approveRemote:true},{},async()=>{blockedCalls++;}),
 /아직 연결되지 않았어요/
);
assert.equal(blockedCalls,0);
await assert.rejects(
 ()=>analyzeFoodLabel({imageDataUrl:image,approveRemote:false},{OPENROUTER_API_KEY:'secret'},async()=>{blockedCalls++;}),
 /명시적 동의/
);
assert.equal(blockedCalls,0);
await assert.rejects(
 ()=>analyzeFoodLabel({sourceUrl:'https://shop.example/order/complete?orderNo=123',imageDataUrl:image,approveRemote:true},{OPENROUTER_API_KEY:'secret'},async()=>{blockedCalls++;}),
 /주문·결제/
);
assert.equal(blockedCalls,0);

const request=new Request('https://kitchen.example/api/food-research/ai',{
 method:'POST',headers:{'content-type':'application/json'},
 body:JSON.stringify({name:'테스트',imageDataUrl:image,approveRemote:true})
});
const handled=await handleFoodAi(request,{OPENROUTER_API_KEY:'secret'},fakeFetch);
assert.equal(handled.status,200);
const handledJson=await handled.json();
assert.equal(handledJson.candidate.confidence,'ai-unverified');
assert.equal(calls,2);

console.log('food AI label checks passed; REQUIRE_PARAMETERS=PASS; RESPONSE_HEALING=PASS; FINISH_REASON=PASS; LOCAL_SCHEMA_VALIDATION=PASS; AUTO_RETRY=NO');

// Gemini free API: optional second free provider, used first only by preference.
{
 const image='data:image/png;base64,'+Buffer.from('fake-image').toString('base64');
 assert.deepEqual(foodAiProviders({}).map(p=>p.id),[]);
 assert.deepEqual(foodAiProviders({OPENROUTER_API_KEY:'a',GEMINI_API_KEY:'b'}).map(p=>p.id),['openrouter','gemini']);
 assert.deepEqual(foodAiProviders({OPENROUTER_API_KEY:'a',GEMINI_API_KEY:'b',FOOD_AI_PROVIDER:'gemini'}).map(p=>p.id),['gemini','openrouter']);
 const geminiAnswer={candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({productName:'라벨 두부',basisAmount:100,basisUnit:'g',nutrition:{energy:85,sodium:12}})}]}}],modelVersion:'gemini-test'};
 const fixed=geminiLabelJson(geminiAnswer);
 assert.equal(fixed.brand,null,'Dropped members are restored as null, never 0');
 assert.equal(fixed.nutrition.fat,null);
 assert.throws(()=>geminiLabelJson({candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'{}'}]}}]}),/완전하게/);
 const calls=[];
 const fetchImpl=async(url,init)=>{
  calls.push(String(url));
  if(String(url).includes('openrouter'))return new Response(JSON.stringify({error:{message:'rate limited'}}),{status:429});
  const body=JSON.parse(init.body);
  assert.equal(init.headers['x-goog-api-key'],'gem-key');
  assert.equal(body.contents[0].parts[1].inline_data.mime_type,'image/png');
  assert.equal(body.generationConfig.responseMimeType,'application/json');
  return new Response(JSON.stringify(geminiAnswer),{status:200});
 };
 const both={OPENROUTER_API_KEY:'or-key',GEMINI_API_KEY:'gem-key'};
 const result=await analyzeFoodLabel({imageDataUrl:image,approveRemote:true},both,fetchImpl);
 assert.equal(result.provider,'gemini-free-label');
 assert.equal(result.metrics.energy.value,85);
 assert.equal(result.kind,'estimate');
 assert.equal(calls.length,2,'quota error on one free provider moves to the other exactly once');
 // A malformed answer is not retried on the other provider.
 const badCalls=[];
 await assert.rejects(analyzeFoodLabel({imageDataUrl:image,approveRemote:true},both,async url=>{badCalls.push(String(url));return new Response(JSON.stringify({choices:[{finish_reason:'length',message:{content:'{}'}}]}),{status:200});}));
 assert.equal(badCalls.length,1);
 await assert.rejects(analyzeFoodLabel({imageDataUrl:image,approveRemote:false},{GEMINI_API_KEY:'k'},async()=>{throw Error('network used');}),/동의/);
}
console.log('food AI Gemini fallback checks passed');
