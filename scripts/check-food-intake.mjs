import assert from 'node:assert/strict';
import {
 foodIntakeEvidenceNotes,
 foodIntakeNutritionCandidate,
 foodIntakeResearchInput,
 handleFoodIntakePreview,
 isFoodIntakeServiceRequest,
 normalizeFoodIntakeEvent,
 validateFoodIntakeServiceProvenance,
} from '../src/food-intake.js';

const serviceToken='purchase-intake-test-token-1234567890';
const serviceRequest=new Request('https://kitchen.example/api/food-research/intake-preview',{
 method:'POST',headers:{authorization:'Bearer '+serviceToken}
});
assert.equal(isFoodIntakeServiceRequest(serviceRequest,{PURCHASE_INTAKE_TOKEN:serviceToken}),true);
assert.equal(isFoodIntakeServiceRequest(serviceRequest,{PURCHASE_INTAKE_TOKEN:'wrong-token-that-is-long-enough-123456'}),false);
assert.equal(isFoodIntakeServiceRequest(serviceRequest,{PURCHASE_INTAKE_TOKEN:'short'}),false);
assert.equal(isFoodIntakeServiceRequest(new Request(serviceRequest.url),{PURCHASE_INTAKE_TOKEN:serviceToken}),false);

const event={
 schemaVersion:1,
 eventId:'purchase-line:fixture-1',
 capturedAt:'2026-11-14T01:02:03+09:00',
 source:{
  merchant:'테스트몰',
  domain:'shop.example',
  archiveArtifactId:'artifact-safe-1',
  contentSha256:'a'.repeat(64),
 },
 product:{
  name:'양파',
  brand:'테스트농장',
  pack:'1.5kg',
  barcode:'',
  productUrl:'https://shop.example/product/123',
  ingredients:'양파 100%',
  allergens:'',
  storage:'개봉 후 냉장보관, 5일 이내 섭취',
  shelfLife:'수령 후 냉장 보관',
  nutrition:{
   basisAmount:100,basisUnit:'g',energyKcal:40,sodiumMg:4,carbsG:9.3,proteinG:1.1,
  },
 },
 quantity:{value:1,unit:'봉'},
};
const normalized=normalizeFoodIntakeEvent(event);
assert.equal(validateFoodIntakeServiceProvenance(event).eventId,'purchase-line:fixture-1');
for(const [label,bad] of [
 ['eventId',{...event,eventId:''}],
 ['capturedAt',{...event,capturedAt:''}],
 ['archiveArtifactId',{...event,source:{...event.source,archiveArtifactId:''}}],
 ['contentSha256',{...event,source:{...event.source,contentSha256:''}}],
 ['merchant/domain',{...event,source:{...event.source,merchant:'',domain:''}}],
]){
 assert.throws(()=>validateFoodIntakeServiceProvenance(bad),new RegExp(label==='merchant/domain'?'merchant 또는 domain':label));
}
assert.equal(normalized.product.name,'양파');
assert.equal(normalized.product.productUrl,'https://shop.example/product/123');
assert.equal(normalized.source.contentSha256,'a'.repeat(64));
assert.deepEqual(normalized.product.nutrition,{
 basisAmount:100,basisUnit:'g',energyKcal:40,sodiumMg:4,carbsG:9.3,proteinG:1.1,
});
const captured=foodIntakeNutritionCandidate(event);
assert.equal(captured.provider,'purchase-intake');
assert.equal(captured.confidence,'captured-product');
assert.equal(captured.autoEligible,false);
assert.deepEqual(captured.basis,{amount:100,unit:'g',label:'100g'});
assert.equal(captured.metrics.energy.value,40);
assert.equal(captured.metrics.sodium.value,4);
assert.equal(captured.metrics.carbs.value,9.3);
assert.match(captured.note,/자동 저장 없음/);
assert.deepEqual(foodIntakeResearchInput(event),{name:'양파',barcode:'',url:'https://shop.example/product/123'});
const notes=foodIntakeEvidenceNotes(event);
assert(notes.includes('구매처: 테스트몰'));
assert(notes.includes('제품 용량: 1.5kg'));
assert(notes.includes('보관방법: 개봉 후 냉장보관, 5일 이내 섭취'));

assert.throws(()=>normalizeFoodIntakeEvent({...event,payment:{amount:1000}}),/주문·결제·배송·개인정보/);
assert.throws(()=>normalizeFoodIntakeEvent({...event,source:{...event.source,orderId:'secret'}}),/주문·결제·배송·개인정보/);
assert.throws(()=>normalizeFoodIntakeEvent({...event,product:{...event.product,productUrl:'https://shop.example/order/complete'}}),/주문·결제·로그인/);
assert.throws(()=>normalizeFoodIntakeEvent({...event,product:{...event.product,barcode:'123'}}),/8~14자리/);
assert.throws(()=>normalizeFoodIntakeEvent({...event,schemaVersion:2}),/schemaVersion은 1/);
assert.throws(()=>normalizeFoodIntakeEvent({...event,product:{...event.product,nutrition:{basisAmount:100,basisUnit:'oz',energyKcal:40}}}),/g 또는 ml/);
assert.throws(()=>normalizeFoodIntakeEvent({...event,product:{...event.product,nutrition:{basisAmount:0,basisUnit:'g',energyKcal:40}}}),/기준량/);
assert.throws(()=>normalizeFoodIntakeEvent({...event,product:{...event.product,nutrition:{basisAmount:100,basisUnit:'g',sodiumMg:-1}}}),/영양 수치/);
assert.throws(()=>normalizeFoodIntakeEvent({...event,product:{...event.product,nutrition:{basisAmount:100,basisUnit:'g',energyKcal:40,unknown:1}}}),/허용되지 않은 필드/);
assert.equal(foodIntakeNutritionCandidate({...event,product:{...event.product,nutrition:{basisAmount:100,basisUnit:'g',energyKcal:40}}}),null);

const gridCells=Array(45).fill('');
Object.assign(gridCells,{
 0:'R-GRID-1',1:'양파',2:'R',3:'원재료성식품',4:'40',5:'100g',7:'1.1',8:'0.1',10:'9.3',11:'4.2',
 12:'1.7',17:'4',26:'0',27:'0.04',28:'0',32:'100g',35:'대한민국',38:'공식 원재료',44:'2026-10-29'
});
const publicGridHtml='<table><tbody><tr class="contentsTr">'+gridCells.map(value=>'<td>'+value+'</td>').join('')+'</tr></tbody></table>';
let calls=0;
const fakeFetch=async input=>{
 const url=String(input);calls++;
 if(url.startsWith('https://shop.example/product/123'))return new Response('<html><head><meta property="og:title" content="양파"></head></html>',{status:200,headers:{'content-type':'text/html'}});
 if(url.startsWith('https://www.data.go.kr/data/15100064/standard.do?'))return new Response(publicGridHtml,{status:200,headers:{'content-type':'text/html'}});
 throw Error('unexpected '+url);
};
const request=new Request('https://kitchen.example/api/food-research/intake-preview',{
 method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(event)
});
const response=await handleFoodIntakePreview(request,{},fakeFetch);
assert.equal(response.status,200);
const payload=await response.json();
assert.equal(payload.writes,false);
assert.equal(payload.intake.product.name,'양파');
assert.equal(payload.intakeCandidate.provider,'purchase-intake');
assert.equal(payload.intakeCandidate.autoEligible,false);
assert.equal(payload.intakeCandidate.metrics.protein.value,1.1);
assert.equal(payload.research.sources.publicNutrition.mode,'public-grid');
assert.match(payload.research.autoStageId,/^public:/);
assert.equal(payload.evidenceNotes.some(line=>line.startsWith('상품 페이지: ')),true);
assert.equal(calls,2);

const blockedEvent={...event,product:{...event.product,productUrl:'https://blocked.example/product/1'}};
const blockedRequest=new Request('https://kitchen.example/api/food-research/intake-preview',{
 method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(blockedEvent)
});
const blockedResponse=await handleFoodIntakePreview(blockedRequest,{},async input=>{
 const url=String(input);
 if(url.startsWith('https://blocked.example/'))return new Response('blocked',{status:403,headers:{'content-type':'text/html'}});
 if(url.startsWith('https://www.data.go.kr/'))return new Response('upstream blocked',{status:503});
 throw Error('unexpected '+url);
});
assert.equal(blockedResponse.status,200);
const blockedPayload=await blockedResponse.json();
assert.equal(blockedPayload.intakeCandidate.provider,'purchase-intake');
assert.equal(blockedPayload.intakeCandidate.metrics.energy.value,40);
assert.equal(blockedPayload.research.sources.productPage.ok,false);
assert.equal(blockedPayload.research.sources.publicNutrition.ok,false);

const sensitiveRequest=new Request('https://kitchen.example/api/food-research/intake-preview',{
 method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...event,address:'secret'})
});
const sensitiveResponse=await handleFoodIntakePreview(sensitiveRequest,{},async()=>{throw Error('must not fetch');});
assert.equal(sensitiveResponse.status,400);
assert.match((await sensitiveResponse.json()).message,/주문·결제·배송·개인정보/);

console.log('food intake contract checks passed');
