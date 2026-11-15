import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {validateFoodIntakeServiceProvenance} from '../src/food-intake.js';

const token='purchase-intelligence-producer-local-token-1234567890';

function runProducer(args,input,{withToken=false}={}){
 return new Promise((resolve,reject)=>{
  const env={...process.env};
  if(withToken)env.PURCHASE_INTAKE_TOKEN=token;
  else delete env.PURCHASE_INTAKE_TOKEN;
  delete env.MLK_PURCHASE_INTAKE_ENDPOINT;
  const child=spawn(process.execPath,['scripts/purchase-intelligence-producer.mjs',...args],{
   env,stdio:['pipe','pipe','pipe'],
  });
  let stdout='',stderr='';
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  child.stdout.on('data',chunk=>stdout+=chunk);
  child.stderr.on('data',chunk=>stderr+=chunk);
  child.on('error',reject);
  child.on('close',code=>resolve({code,stdout,stderr}));
  child.stdin.end(JSON.stringify(input));
 });
}

const artifact={
 archive_artifact_id:'pa-artifact-food-1',
 source_url:'https://shop.example/orders/secret-order-42?session=do-not-copy',
 merchant:'테스트 식품몰',
 captured_at:'2026-11-14T12:00:00+09:00',
 content_sha256:'a'.repeat(64),
 orderId:'ORDER-SECRET-42',
 payment:{cardNumber:'4111111111111111'},
 address:'PRIVATE ADDRESS',
 structured_data:{
  order_lines:[
   {
    orderId:'ORDER-LINE-SECRET',
    quantity:2,
    product_identity:{
     name:'양파 1kg',
     brand:'테스트팜',
     pack:'1kg',
     product_url:'https://shop.example/product/onion-1kg',
     ingredients:'양파 100%',
     storage:'냉장보관',
     nutrition:{basisAmount:100,basisUnit:'g',energyKcal:40,sodiumMg:4,proteinG:1.1},
    },
   },
   {
    quantity:1,
    product_identity:{name:'USB-C 케이블',category:'Electronics',brand:'테스트전자'},
   },
  ],
 },
};

const first=await runProducer([],artifact);
assert.equal(first.code,0,first.stderr);
const firstPayload=JSON.parse(first.stdout);
assert.equal(firstPayload.schemaVersion,1);
assert.equal(firstPayload.eventCount,1);
assert.equal(firstPayload.networkRequests,0);
assert.equal(firstPayload.stats.sourceRecords,2);
assert.equal(firstPayload.stats.skippedNonFood,1);
const event=firstPayload.events[0];
assert.deepEqual(event,validateFoodIntakeServiceProvenance(event));
assert.equal(event.product.name,'양파 1kg');
assert.equal(event.product.brand,'테스트팜');
assert.equal(event.quantity.value,2);
assert.equal(event.source.domain,'shop.example');
assert.equal(event.source.archiveArtifactId,'pa-artifact-food-1');
assert.equal(event.product.nutrition.energyKcal,40);
assert.equal(event.product.nutrition.sodiumMg,4);
assert.match(event.eventId,/^pi-food-v1:[0-9a-f]{48}$/);
assert.doesNotMatch(first.stdout,/ORDER-SECRET|411111|PRIVATE ADDRESS|session=do-not-copy/);

const again=await runProducer([],artifact);
assert.equal(again.code,0,again.stderr);
assert.equal(JSON.parse(again.stdout).events[0].eventId,event.eventId,'same artifact must produce stable event id');

const dry=await runProducer(['--dry-run'],artifact);
assert.equal(dry.code,0,dry.stderr);
assert.match(dry.stdout,/PURCHASE_INTELLIGENCE_PRODUCER=DRY_RUN_PASS/);
assert.match(dry.stdout,/EVENTS=1/);
assert.match(dry.stdout,/SKIPPED_NONFOOD=1/);
assert.match(dry.stdout,/NETWORK_REQUESTS=0/);
assert.doesNotMatch(dry.stdout,/양파|ORDER-SECRET|411111/);

const freshArtifact={
 archiveArtifactId:'pa-fresh-produce-1',
 sourceUrl:'https://fresh.example/order/1',
 capturedAt:'2026-11-14T03:00:00Z',
 contentSha256:'b'.repeat(64),
 domain:'fresh.example',
 structuredData:{
  foodProducts:[{name:'깐마늘 500g',pack:'500g',storage:'냉장보관'}],
 },
};
const fresh=await runProducer([],freshArtifact);
assert.equal(fresh.code,0,fresh.stderr);
const freshPayload=JSON.parse(fresh.stdout);
assert.equal(freshPayload.eventCount,1);
assert.equal(freshPayload.events[0].product.name,'깐마늘 500g');

const unsafeUrlArtifact={
 archiveArtifactId:'pa-unsafe-product-url-1',
 sourceUrl:'https://shop.example/orders/source-order-1',
 capturedAt:'2026-11-14T03:30:00Z',
 contentSha256:'f'.repeat(64),
 merchant:'테스트 식품몰',
 structuredData:{
  foodProducts:[{
   name:'감자 1kg',
   productUrl:'https://shop.example/orders/private-123?token=secret-token-value',
   pack:'1kg',
  }],
 },
};
const unsafeUrl=await runProducer([],unsafeUrlArtifact);
assert.equal(unsafeUrl.code,0,unsafeUrl.stderr);
const unsafeUrlPayload=JSON.parse(unsafeUrl.stdout);
assert.equal(unsafeUrlPayload.eventCount,1);
assert.equal(unsafeUrlPayload.events[0].product.productUrl,'');
assert.doesNotMatch(unsafeUrl.stdout,/private-123|secret-token-value/);

const foodStorageContainerArtifact={
 archiveArtifactId:'pa-food-storage-container-1',
 sourceUrl:'https://home.example/order/1',
 capturedAt:'2026-11-14T03:40:00Z',
 contentSha256:'1'.repeat(64),
 domain:'home.example',
 structuredData:{
  products:[{name:'밀폐용기 2L',category:'Home > Kitchen > Food Storage Containers'}],
 },
};
const containerBlocked=await runProducer([],foodStorageContainerArtifact);
assert.equal(containerBlocked.code,2);
assert.match(containerBlocked.stderr,/자동 전달할 식품 상품을 찾지 못했어요/);

const schemaArtifact={
 archive_artifact_id:'pa-schema-order-1',
 source_url:'https://mall.example/order/abc',
 merchant:'Schema Mall',
 captured_at:'2026-11-14T04:00:00Z',
 content_sha256:'c'.repeat(64),
 structured_data:{
  '@context':'https://schema.org',
  '@type':'Order',
  orderedItem:[
   {
    '@type':'OrderItem',
    orderQuantity:3,
    orderedItem:{
     '@type':'Product',
     name:'뿌리채소 영양밥 200g',
     category:'Food & Beverage',
     brand:{'@type':'Brand',name:'테스트식품'},
     gtin13:'8801234567890',
     url:'https://mall.example/product/rice-200g',
     nutrition:{
      '@type':'NutritionInformation',
      servingSize:'200 g',
      calories:'335 kcal',
      sodiumContent:'0.24 g',
      carbohydrateContent:'73 g',
      proteinContent:'8 g',
     },
    },
   },
   {
    '@type':'OrderItem',
    orderQuantity:1,
    orderedItem:{
     '@type':'Product',
     name:'휴대용 충전기',
     category:'Electronics',
     brand:'테스트전자',
    },
   },
  ],
 },
};
const schemaRun=await runProducer([],schemaArtifact);
assert.equal(schemaRun.code,0,schemaRun.stderr);
const schemaPayload=JSON.parse(schemaRun.stdout);
assert.equal(schemaPayload.eventCount,1);
const schemaEvent=schemaPayload.events[0];
assert.equal(schemaEvent.product.barcode,'8801234567890');
assert.equal(schemaEvent.quantity.value,3);
assert.equal(schemaEvent.product.nutrition.basisAmount,200);
assert.equal(schemaEvent.product.nutrition.energyKcal,335);
assert.equal(schemaEvent.product.nutrition.sodiumMg,240);
assert.equal(schemaEvent.product.nutrition.carbsG,73);
assert.equal(schemaEvent.product.nutrition.proteinG,8);

const objectSellerArtifact={
 archiveArtifactId:'pa-object-seller-1',
 capturedAt:'2026-11-14T06:00:00Z',
 contentSha256:'e'.repeat(64),
 sourceUrl:'https://grocer.example/order/object-seller',
 structuredData:{
  seller:{'@type':'Organization',name:'객체 상점'},
  foodProducts:[{
   name:'우유 1L',
   foodEligible:true,
   nutrition:{basisAmount:'100',basisUnit:'ml',energyKcal:'65',proteinG:'3.2'},
  }],
 },
};
const objectSeller=await runProducer([],objectSellerArtifact);
assert.equal(objectSeller.code,0,objectSeller.stderr);
const objectSellerPayload=JSON.parse(objectSeller.stdout);
assert.equal(objectSellerPayload.eventCount,1);
assert.equal(objectSellerPayload.events[0].source.merchant,'객체 상점');
assert.equal(objectSellerPayload.events[0].product.nutrition.basisAmount,100);
assert.equal(objectSellerPayload.events[0].product.nutrition.energyKcal,65);
assert.equal(objectSellerPayload.events[0].product.nutrition.proteinG,3.2);

const textOnlyArtifact={
 archive_artifact_id:'pa-text-only-food-1',
 source_url:'https://shop.example/orders/private-order-1?session=secret',
 merchant:'텍스트 식품몰',
 captured_at:'2026-11-14T07:00:00Z',
 content_sha256:'2'.repeat(64),
 sanitized_text:[
  '주문번호: SECRET-ORDER-1',
  '배송지: PRIVATE ADDRESS',
  '상품명: 국내산 양파 1kg',
  '카테고리: 식품 > 농산물 > 채소',
  '수량: 2개',
  '원재료: 양파 100%',
  '보관방법: 냉장보관',
  '영양기준: 100g',
  '열량: 40 kcal',
  '나트륨: 4 mg',
  '단백질: 1.1 g',
  '상품명: USB-C 케이블',
  '카테고리: Electronics',
 ].join('\n'),
};
const textOnly=await runProducer([],textOnlyArtifact);
assert.equal(textOnly.code,0,textOnly.stderr);
const textOnlyPayload=JSON.parse(textOnly.stdout);
assert.equal(textOnlyPayload.eventCount,1);
assert.equal(textOnlyPayload.stats.extractedFoodProducts,1);
assert.equal(textOnlyPayload.stats.reviewCandidates,0);
assert.equal(textOnlyPayload.events[0].product.name,'국내산 양파 1kg');
assert.equal(textOnlyPayload.events[0].quantity.value,2);
assert.equal(textOnlyPayload.events[0].quantity.unit,'개');
assert.equal(textOnlyPayload.events[0].product.nutrition.energyKcal,40);
assert.doesNotMatch(textOnly.stdout,/SECRET-ORDER|PRIVATE ADDRESS|session=secret|USB-C 케이블/);

const reviewOnlyArtifact={
 archive_artifact_id:'pa-text-review-only-1',
 source_url:'https://shop.example/orders/2',
 captured_at:'2026-11-14T07:10:00Z',
 content_sha256:'3'.repeat(64),
 domain:'shop.example',
 sanitized_text:'상품명: 정체 불명 신상품\n수량: 1개',
};
const reviewOnly=await runProducer([],reviewOnlyArtifact);
assert.equal(reviewOnly.code,2);
assert.match(reviewOnly.stderr,/REVIEW_REQUIRED/);
assert.match(reviewOnly.stderr,/1개/);
assert.doesNotMatch(reviewOnly.stderr,/정체 불명 신상품/);

const siteCaptureArtifact={
 archive_artifact_id:'pa-site-capture-kurly-1',
 source_url:'https://www.kurly.com/mypage/order',
 merchant:'컬리',
 captured_at:'2026-11-14T07:15:00Z',
 content_sha256:'6'.repeat(64),
 structured_data:{
  purchase_capture:{
   orderProducts:[{
    goodsName:'저온살균 우유 900mL',
    qty:'2',
    categoryName:'식품 > 유제품',
    brandName:'테스트목장',
    capacity:'900mL',
    url:'https://www.kurly.com/goods/999',
    storageInstructions:'냉장보관',
    nutrition:{basisAmount:100,basisUnit:'ml',energyKcal:65,proteinG:3.2},
    orderId:'KURLY-SECRET-ORDER',
    recipient:'PRIVATE NAME',
    address:'PRIVATE ADDRESS',
   }],
  },
 },
};
const siteCapture=await runProducer([],siteCaptureArtifact);
assert.equal(siteCapture.code,0,siteCapture.stderr);
const siteCapturePayload=JSON.parse(siteCapture.stdout);
assert.equal(siteCapturePayload.eventCount,1);
assert.equal(siteCapturePayload.stats.siteAdapter,'kurly');
assert.equal(siteCapturePayload.stats.siteAdapterRecords,1);
assert.equal(siteCapturePayload.events[0].product.name,'저온살균 우유 900mL');
assert.equal(siteCapturePayload.events[0].quantity.value,2);
assert.equal(siteCapturePayload.events[0].product.storage,'냉장보관');
assert.equal(siteCapturePayload.events[0].product.nutrition.energyKcal,65);
assert.doesNotMatch(siteCapture.stdout,/KURLY-SECRET-ORDER|PRIVATE NAME|PRIVATE ADDRESS/);

const siteCaptureDry=await runProducer(['--dry-run'],siteCaptureArtifact);
assert.equal(siteCaptureDry.code,0,siteCaptureDry.stderr);
assert.match(siteCaptureDry.stdout,/SITE_ADAPTER=kurly/);
assert.match(siteCaptureDry.stdout,/SITE_ADAPTER_RECORDS=1/);
assert.match(siteCaptureDry.stdout,/NETWORK_REQUESTS=0/);
assert.doesNotMatch(siteCaptureDry.stdout,/저온살균 우유|KURLY-SECRET/);

const acceptedOfferArtifact={
 archive_artifact_id:'pa-schema-accepted-offer-1',
 source_url:'https://mall.example/orders/accepted',
 merchant:'Accepted Offer Mall',
 captured_at:'2026-11-14T07:20:00Z',
 content_sha256:'4'.repeat(64),
 structured_data:{
  '@context':'https://schema.org',
  '@type':'Order',
  acceptedOffer:{
   '@type':'Offer',
   itemOffered:{
    '@type':'Product',
    name:'테스트 요거트 100g',
    category:'Food > Dairy',
    brand:{'@type':'Brand',name:'테스트유업'},
    nutrition:{
     '@type':'NutritionInformation',
     servingSize:'100 g',
     calories:'80 kcal',
     proteinContent:'4 g',
    },
   },
  },
 },
};
const acceptedOffer=await runProducer([],acceptedOfferArtifact);
assert.equal(acceptedOffer.code,0,acceptedOffer.stderr);
const acceptedOfferPayload=JSON.parse(acceptedOffer.stdout);
assert.equal(acceptedOfferPayload.eventCount,1);
assert.equal(acceptedOfferPayload.events[0].product.name,'테스트 요거트 100g');
assert.equal(acceptedOfferPayload.events[0].product.brand,'테스트유업');
assert.equal(acceptedOfferPayload.events[0].product.nutrition.energyKcal,80);
assert.equal(acceptedOfferPayload.events[0].quantity,null,'Offer without actual order quantity must not guess one');

const defaultQuantityArtifact={
 archive_artifact_id:'pa-schema-default-quantity-1',
 source_url:'https://mall.example/orders/default-one',
 merchant:'Default Quantity Mall',
 captured_at:'2026-11-14T07:30:00Z',
 content_sha256:'5'.repeat(64),
 structured_data:{
  '@context':'https://schema.org',
  '@type':'Order',
  orderedItem:{
   '@type':'OrderItem',
   orderedItem:{
    '@type':'Product',
    name:'테스트 두유 190mL',
    category:'Food > Beverage',
    nutrition:{
     '@type':'NutritionInformation',
     servingSize:'190 ml',
     calories:'120 kcal',
     proteinContent:'6 g',
    },
   },
  },
 },
};
const defaultQuantity=await runProducer([],defaultQuantityArtifact);
assert.equal(defaultQuantity.code,0,defaultQuantity.stderr);
const defaultQuantityPayload=JSON.parse(defaultQuantity.stdout);
assert.equal(defaultQuantityPayload.eventCount,1);
assert.equal(defaultQuantityPayload.events[0].quantity.value,1);

let requests=0;
let received=null;
const server=createServer(async(req,res)=>{
 try{
  requests++;
  assert.equal(req.method,'POST');
  assert.equal(req.url,'/api/food-research/intake');
  assert.equal(req.headers.authorization,'Bearer '+token);
  let raw='';for await(const chunk of req)raw+=chunk;
  received=JSON.parse(raw);
  assert.deepEqual(received,validateFoodIntakeServiceProvenance(received));
  res.writeHead(202,{'content-type':'application/json; charset=utf-8'});
  res.end(JSON.stringify({ok:true,id:received.eventId,duplicate:false,status:'pending',writes:'inbox-only'}));
 }catch(error){
  res.writeHead(500,{'content-type':'application/json'});
  res.end(JSON.stringify({error:'fixture_assertion',message:String(error?.message||error)}));
 }
});
await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
const endpoint='http://127.0.0.1:'+server.address().port;
try{
 const send=await runProducer(['--send','--endpoint',endpoint],artifact,{withToken:true});
 assert.equal(send.code,0,send.stderr);
 assert.match(send.stdout,/PURCHASE_INTELLIGENCE_PRODUCER=PASS/);
 assert.match(send.stdout,/EVENTS=1/);
 assert.match(send.stdout,/SENT=1/);
 assert.match(send.stdout,/AUTO_RETRY=NO/);
 assert.equal(requests,1);
 assert.equal(received.product.name,'양파 1kg');

 const nonFood={
  archive_artifact_id:'pa-nonfood-only',
  source_url:'https://shop.example/order/2',
  captured_at:'2026-11-14T05:00:00Z',
  content_sha256:'d'.repeat(64),
  structured_data:{products:[{name:'키보드',category:'Electronics'}]},
 };
 const blocked=await runProducer(['--send','--endpoint',endpoint],nonFood,{withToken:true});
 assert.equal(blocked.code,2);
 assert.match(blocked.stderr,/자동 전달할 식품 상품을 찾지 못했어요/);
 assert.equal(requests,1,'non-food artifact must fail before network');
}finally{
 await new Promise(resolve=>server.close(resolve));
}

console.log('PURCHASE_INTELLIGENCE_PRODUCER_CHECK=PASS; PA_CONTRACT=PASS; SANITIZED_TEXT=PASS; SITE_ADAPTER=PASS; REVIEW_HOLD=PASS; NONFOOD_FILTER=PASS; SCHEMA_ORDER=PASS; SCHEMA_ACCEPTED_OFFER=PASS; ORDERITEM_DEFAULT_QTY=PASS; NUTRITION_UNITS=PASS; SENSITIVE_OUTPUT=0; STABLE_EVENT_ID=PASS; SEND=1; AUTO_RETRY=NO');
