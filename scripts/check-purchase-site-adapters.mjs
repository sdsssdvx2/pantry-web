import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {adaptSitePurchaseCapture} from './purchase-site-adapters.mjs';

function assertSafe(result,forbidden){
 const text=JSON.stringify(result);
 for(const value of forbidden)assert.ok(!text.includes(value),'sensitive value leaked: '+value);
}

const fixtures=[
 {
  site:'coupang',domain:'www.coupang.com',merchant:'쿠팡',
  capture:{items:[{
   vendorItemName:'국내산 양파 1kg',quantity:'2개',categoryName:'식품 > 농산물 > 채소',
   brandName:'테스트팜',netContent:'1kg',productUrl:'https://www.coupang.com/vp/products/123',
   ingredients:'양파 100%',orderId:'ORDER-COUPANG-SECRET',recipient:'홍길동',address:'PRIVATE-ADDRESS-1',
  }]},
  name:'국내산 양파 1kg',q:2,unit:'개',
 },
 {
  site:'naver',domain:'shopping.naver.com',merchant:'네이버쇼핑',
  capture:{productOrders:[{
   productName:'플레인 그릭요거트 400g',orderQuantity:1,category:'식품 > 유제품',
   brand:'테스트유업',pack:'400g',productLink:'https://smartstore.naver.com/test/products/456',
   allergens:'우유',orderNo:'NAVER-SECRET-ORDER',buyerEmail:'secret@example.com',
  }]},
  name:'플레인 그릭요거트 400g',q:1,unit:'',
 },
 {
  site:'kurly',domain:'www.kurly.com',merchant:'컬리',
  capture:{orderProducts:[{
   goodsName:'저온살균 우유 900mL',qty:'3',categoryName:'식품 > 유제품',
   brandName:'테스트목장',capacity:'900mL',url:'https://www.kurly.com/goods/789',
   storageInstructions:'냉장보관',paymentMethod:'PRIVATE-CARD',
  }]},
  name:'저온살균 우유 900mL',q:3,unit:'',
 },
 {
  site:'gmarket',domain:'item.gmarket.co.kr',merchant:'G마켓',
  capture:{goods:[{
   itemName:'냉동 블루베리 1kg',count:'2',category:'식품 > 과일',
   brand:'테스트베리',weight:'1kg',link:'https://item.gmarket.co.kr/Item?goodscode=123456',
   storage:'냉동보관',cardNo:'4111-SECRET',
  }]},
  name:'냉동 블루베리 1kg',q:2,unit:'',
 },
];

for(const fixture of fixtures){
 const result=adaptSitePurchaseCapture({
  domain:fixture.domain,merchant:fixture.merchant,
  structured:{purchase_capture:{adapter:fixture.site,...fixture.capture}},
 });
 assert.equal(result.site,fixture.site);
 assert.equal(result.orderLines.length,1);
 assert.equal(result.stats.acceptedItems,1);
 assert.equal(result.orderLines[0].product_identity.name,fixture.name);
 assert.equal(result.orderLines[0].quantity,fixture.q);
 assert.equal(result.orderLines[0].quantityUnit,fixture.unit);
 assertSafe(result,['ORDER-COUPANG-SECRET','홍길동','PRIVATE-ADDRESS-1','NAVER-SECRET-ORDER','secret@example.com','PRIVATE-CARD','4111-SECRET']);
}

const mixedNested=adaptSitePurchaseCapture({
 domain:'shopping.naver.com',
 structured:{purchase_capture:{productOrders:[{
  productOrderName:'상위 주문행 상품명',
  orderQuantity:'2개',
  category:'식품 > 유제품',
  brand:{name:'혼합브랜드'},
  product:{
   productName:'중첩 플레인 요거트 400g',
   pack:'400g',
   allergens:'우유',
   productUrl:'https://smartstore.naver.com/test/products/987',
  },
  orderNo:'NESTED-SECRET',
 }]}}
});
assert.equal(mixedNested.site,'naver');
assert.equal(mixedNested.orderLines.length,1);
assert.equal(mixedNested.orderLines[0].product_identity.name,'중첩 플레인 요거트 400g');
assert.equal(mixedNested.orderLines[0].product_identity.brand,'혼합브랜드');
assert.equal(mixedNested.orderLines[0].product_identity.category,'식품 > 유제품');
assert.equal(mixedNested.orderLines[0].product_identity.allergens,'우유');
assert.equal(mixedNested.orderLines[0].quantity,2);
assert.equal(mixedNested.orderLines[0].quantityUnit,'개');
assertSafe(mixedNested,['NESTED-SECRET']);

const domainOnly=adaptSitePurchaseCapture({
 domain:'m.gmarket.co.kr',
 structured:{siteCapture:{items:[{itemName:'사과 2kg',quantity:1,category:'식품 > 과일'}]}},
});
assert.equal(domainOnly.site,'gmarket');
assert.equal(domainOnly.orderLines[0].product_identity.name,'사과 2kg');

const explicitAdapter=adaptSitePurchaseCapture({
 domain:'new-shop.example',
 structured:{purchase_capture:{adapter:'kurly',items:[{goodsName:'샐러드 200g',quantity:1,categoryName:'식품 > 채소'}]}},
});
assert.equal(explicitAdapter.site,'kurly');

assert.throws(
 ()=>adaptSitePurchaseCapture({
  domain:'www.kurly.com',
  structured:{purchase_capture:{adapter:'coupang',items:[{productName:'충돌 상품',quantity:1,category:'식품'}]}},
 }),
 /adapter와 source domain이 일치하지 않아요/
);

const unknown=adaptSitePurchaseCapture({
 domain:'unknown-shop.example',
 structured:{purchase_capture:{items:[{productName:'양파 1kg',quantity:1,category:'식품'}]}},
});
assert.equal(unknown.site,'');
assert.deepEqual(unknown.orderLines,[]);

const sensitiveUrl=adaptSitePurchaseCapture({
 domain:'coupang.com',
 structured:{purchase_capture:{items:[{
  productName:'감자 1kg',quantity:1,category:'식품 > 농산물',
  productUrl:'https://www.coupang.com/order/complete?token=private-token',
 }]}}
});
assert.equal(sensitiveUrl.orderLines.length,1);
assert.equal(sensitiveUrl.orderLines[0].product_identity.productUrl,'');
assertSafe(sensitiveUrl,['private-token']);

const nonObject=adaptSitePurchaseCapture({
 domain:'kurly.com',
 structured:{purchase_capture:{items:[null,'bad',{goodsName:'',quantity:1},{goodsName:'정상 식품',quantity:1,category:'식품'}]}},
});
assert.equal(nonObject.stats.sourceItems,4);
assert.equal(nonObject.stats.acceptedItems,1);
assert.equal(nonObject.stats.skippedItems,3);

await assert.rejects(async()=>{
 adaptSitePurchaseCapture({
  domain:'coupang.com',
  structured:{purchase_capture:{items:Array.from({length:41},(_,i)=>({productName:'상품'+i,quantity:1,category:'식품'}))}},
 });
},/40개/);

const cliInput={
 domain:'shopping.naver.com',
 structured_data:{purchase_capture:{productOrders:[{
  productName:'두유 190mL',orderQuantity:'2개',category:'식품 > 음료',
  nutrition:{basisAmount:190,basisUnit:'ml',energyKcal:120,proteinG:6},
  orderId:'CLI-SECRET',
 }]}},
};
const cli=await new Promise((resolve,reject)=>{
 const child=spawn(process.execPath,['scripts/purchase-site-adapters.mjs'],{stdio:['pipe','pipe','pipe']});
 let stdout='',stderr='';
 child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
 child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);
 child.on('error',reject);child.on('close',code=>resolve({code,stdout,stderr}));
 child.stdin.end(JSON.stringify(cliInput));
});
assert.equal(cli.code,0,cli.stderr);
const cliPayload=JSON.parse(cli.stdout);
assert.equal(cliPayload.site,'naver');
assert.equal(cliPayload.orderLines.length,1);
assert.equal(cliPayload.orderLines[0].product_identity.nutrition.energyKcal,120);
assert.doesNotMatch(cli.stdout,/CLI-SECRET/);

console.log('PURCHASE_SITE_ADAPTERS_CHECK=PASS; COUPANG=PASS; NAVER=PASS; KURLY=PASS; GMARKET=PASS; MIXED_NESTED_FIELDS=PASS; DOMAIN_ADAPTER_MISMATCH_HOLD=PASS; SENSITIVE_FIELDS_DROPPED=PASS; SENSITIVE_URL_DROPPED=PASS; UNKNOWN_SITE_NO_GUESS=PASS');
