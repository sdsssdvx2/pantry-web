import assert from 'node:assert/strict';
import {
 extractProductPageEvidence,
 normalizeOpenFoodFacts,
 normalizeProductUrl,
 normalizePublicNutritionRows,
 parsePublicNutritionGrid,
 rawFormMatch,
 researchFood,
} from '../src/food-research.js';

const publicPayload={response:{header:{resultCode:'00'},body:{items:[
 {foodCd:'P1',foodNm:'테스트 두부',dataCd:'P',typeNm:'가공식품',nutConSrtrQua:'100g',enerc:'85',nat:'15',prot:'9.2',fatce:'4.5',chocdf:'2.1',sugar:'0.5',mkrNm:'테스트식품',foodSize:'300g',itemMnftrRptNo:'1234',crtrYmd:'2026-11-01'},
 {foodCd:'P2',foodNm:'테스트 두부 매운맛',dataCd:'P',typeNm:'가공식품',nutConSrtrQua:'100g',enerc:'90',nat:'200',prot:'8.5'}
]}}};
const normalized=normalizePublicNutritionRows(publicPayload,'테스트 두부');
assert.equal(normalized.length,2);
assert.equal(normalized[0].identity.name,'테스트 두부');
assert.equal(normalized[0].metrics.energy.value,85);
assert.equal(normalized[0].metrics.sodium.value,15);
assert.equal(normalized[0].basis.unit,'g');
assert.equal(normalized[0].exactName,true);
assert.equal(normalized[1].exactName,false);
assert.equal(normalized[0].kind,'product');

const gridCells=Array(45).fill('');
Object.assign(gridCells,{
 0:'R-GRID-1',1:'양파',2:'R',3:'원재료성식품',4:'40',5:'100g',7:'1.1',8:'0.1',10:'9.3',11:'4.2',12:'1.7',
 17:'4',26:'0',27:'0.04',28:'0',32:'100g',35:'대한민국',38:'공식 원재료',44:'2026-10-29'
});
const publicGridHtml='<table><tbody><tr class="contentsTr">'+gridCells.map(value=>'<td>'+value+'</td>').join('')+'</tr></tbody></table>';
const gridRows=parsePublicNutritionGrid(publicGridHtml);
assert.equal(gridRows.length,1);
assert.equal(gridRows[0].foodNm,'양파');
assert.equal(gridRows[0].nat,'4');
assert.equal(gridRows[0].mkrNm,'공식 원재료');
const normalizedGrid=normalizePublicNutritionRows({items:gridRows},'양파');
assert.equal(normalizedGrid[0].kind,'generic');
assert.equal(normalizedGrid[0].metrics.energy.value,40);
assert.equal(normalizedGrid[0].metrics.sodium.value,4);

const off=normalizeOpenFoodFacts({product:{
 code:'8801234567890',
 product_name_ko:'테스트 우유',
 brands:'테스트',
 quantity:'900 mL',
 nutriments:{
  'energy-kcal_100g':65,
  sodium_100g:0.05,
  carbohydrates_100g:4.8,
  sugars_100g:4.8,
  fat_100g:3.5,
  'saturated-fat_100g':2.2,
  proteins_100g:3.2,
  cholesterol_100g:0.012,
 }
}},'8801234567890');
assert.equal(off.identity.name,'테스트 우유');
assert.equal(off.metrics.sodium.value,50);
assert.equal(off.metrics.cholesterol.value,12);
assert.equal(off.confidence,'barcode');
assert.equal(normalizeOpenFoodFacts({product:{code:'8809999999999',nutriments:{'energy-kcal_100g':100}}},'8801234567890'),null);

const html=`<!doctype html><html><head><script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"신생몰 테스트 소스","brand":{"name":"브랜드A"},"gtin13":"8801234567890","weight":"320g","additionalProperty":[{"@type":"PropertyValue","name":"원재료명","value":"토마토, 양파, 소금"},{"@type":"PropertyValue","name":"알레르기정보","value":"대두 함유"},{"@type":"PropertyValue","name":"보관방법","value":"개봉 후 냉장보관"},{"@type":"PropertyValue","name":"소비기한","value":"제조일로부터 12개월"}]}
</script></head><body></body></html>`;
const page=extractProductPageEvidence(html,'https://shop.example/item/1');
assert.deepEqual(page,{
 structured:true,
 url:'https://shop.example/item/1',
 name:'신생몰 테스트 소스',
 brand:'브랜드A',
 barcode:'8801234567890',
 sku:'',
 pack:'320g',
 ingredients:'토마토, 양파, 소금',
 storage:'개봉 후 냉장보관',
 shelfLife:'제조일로부터 12개월',
 allergens:'대두 함유',
 manufacturer:'',
 nutritionText:'',
 nutritionBasis:null,
 nutritionMetrics:{},
});

const nutritionHtml=`<!doctype html><html><head><script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"영양표 테스트 제품","brand":{"name":"테스트브랜드"},"additionalProperty":[
 {"@type":"PropertyValue","name":"영양성분 함량 기준량","value":"30g"},
 {"@type":"PropertyValue","name":"열량","value":"120 kcal"},
 {"@type":"PropertyValue","name":"나트륨","value":"0.24 g"},
 {"@type":"PropertyValue","name":"탄수화물","value":"18 g"},
 {"@type":"PropertyValue","name":"당류","value":"3 g"},
 {"@type":"PropertyValue","name":"지방","value":"4.5 g"},
 {"@type":"PropertyValue","name":"포화지방","value":"1.2 g"},
 {"@type":"PropertyValue","name":"단백질","value":"2000 mg"},
 {"@type":"PropertyValue","name":"콜레스테롤","value":"12 mg"},
 {"@type":"PropertyValue","name":"트랜스지방","value":"0.5 g 미만"}
]}
</script></head><body></body></html>`;
const nutritionPage=extractProductPageEvidence(nutritionHtml,'https://shop.example/item/nutrition');
assert.deepEqual(nutritionPage.nutritionBasis,{amount:30,unit:'g',label:'30g'});
assert.equal(nutritionPage.nutritionMetrics.energy.value,120);
assert.equal(nutritionPage.nutritionMetrics.sodium.value,240);
assert.equal(nutritionPage.nutritionMetrics.protein.value,2);
assert.equal(nutritionPage.nutritionMetrics.cholesterol.value,12);
assert.equal(nutritionPage.nutritionMetrics.transFat,undefined);
assert.match(nutritionPage.nutritionText,/영양성분 함량 기준량: 30g/);

let pageNutritionCalls=0;
const pageNutritionResearch=await researchFood({url:'https://shop.example/item/nutrition'},{},async url=>{
 pageNutritionCalls++;
 const text=String(url);
 if(text.startsWith('https://shop.example/'))return new Response(nutritionHtml,{status:200,headers:{'content-type':'text/html'}});
 if(text.startsWith('https://www.data.go.kr/'))return new Response('<table><tbody></tbody></table>',{status:200,headers:{'content-type':'text/html; charset=utf-8'}});
 throw Error('unexpected product nutrition URL '+text);
});
assert.equal(pageNutritionCalls,2);
assert.equal(pageNutritionResearch.autoStageId,'product-page:nutrition');
assert.equal(pageNutritionResearch.candidates[0].provider,'product-page-nutrition');
assert.equal(pageNutritionResearch.candidates[0].confidence,'product-page');
assert.equal(pageNutritionResearch.candidates[0].metrics.sodium.value,240);
assert.equal(pageNutritionResearch.candidates[0].basis.amount,30);

const noBasisNutritionHtml=`<script type="application/ld+json">{"@type":"Product","name":"기준량 없는 제품","additionalProperty":[
 {"name":"열량","value":"120 kcal"},{"name":"나트륨","value":"240 mg"},{"name":"단백질","value":"2 g"}
]}</script>`;
const noBasisResearch=await researchFood({url:'https://shop.example/item/no-basis'},{},async url=>{
 const text=String(url);
 if(text.startsWith('https://shop.example/'))return new Response(noBasisNutritionHtml,{status:200,headers:{'content-type':'text/html'}});
 if(text.startsWith('https://www.data.go.kr/'))return new Response('<table><tbody></tbody></table>',{status:200,headers:{'content-type':'text/html; charset=utf-8'}});
 throw Error('unexpected no-basis URL '+text);
});
assert.equal(noBasisResearch.candidates.some(item=>item.provider==='product-page-nutrition'),false);
assert.equal(noBasisResearch.autoStageId,'');

const gmarketDisclosure=extractProductPageEvidence(`<!doctype html><head><meta property="og:title" content="단일 제품"></head><body><table>
<tr><th>생산자 및 소재지(수입품의 경우 생산자, 수입자 및 제조국)</th><td>씨제이제일제당(주) 진천공장</td></tr>
<tr><th>제조연월일, 소비기한(유통기한) 또는 품질유지기한</th><td>제조년월일로부터 9개월</td></tr>
<tr><th>원재료명 및 함량</th><td>찰현미 34%, 현미 19%, 흑미 14%</td></tr>
<tr><th>알레르기 유발물질 함유</th><td>아황산류 함유</td></tr>
<tr><th>영양성분</th><td>총 내용량 200 g / 나트륨 0 mg, 탄수화물 61 g, 단백질 9 g</td></tr>
</table></body>`,'https://shop.example/item/gmarket-shape');
assert.equal(gmarketDisclosure.manufacturer,'씨제이제일제당(주) 진천공장');
assert.equal(gmarketDisclosure.ingredients,'찰현미 34%, 현미 19%, 흑미 14%');
assert.equal(gmarketDisclosure.allergens,'아황산류 함유');
assert.equal(gmarketDisclosure.shelfLife,'제조년월일로부터 9개월');
assert.equal(gmarketDisclosure.nutritionMetrics.sodium.value,0);
assert.equal(gmarketDisclosure.nutritionMetrics.carbs.value,61);
assert.equal(gmarketDisclosure.nutritionMetrics.protein.value,9);

const per100Disclosure=extractProductPageEvidence(`<!doctype html><body><table>
<tr><th>영양성분</th><td>100g 당 열량 155 kcal, 나트륨 320 mg, 탄수화물 27 g, 단백질 4 g</td></tr>
</table></body>`,'https://shop.example/item/per100');
assert.deepEqual(per100Disclosure.nutritionBasis,{amount:100,unit:'g',label:'100g'});
assert.equal(per100Disclosure.nutritionMetrics.energy.value,155);
assert.equal(per100Disclosure.nutritionMetrics.sodium.value,320);
assert.equal(per100Disclosure.nutritionMetrics.protein.value,4);

const multiOptionHtml=`<!doctype html><head><meta property="og:title" content="테스트밥 7종 특가"></head><body><table>
<tr><th>영양성분</th><td>총 내용량 200g / 나트륨 250mg, 탄수화물 68g, 단백질 6g</td></tr>
</table></body>`;
const multiOptionResearch=await researchFood({url:'https://shop.example/item/multi'},{},async url=>{
 const text=String(url);
 if(text.startsWith('https://shop.example/'))return new Response(multiOptionHtml,{status:200,headers:{'content-type':'text/html'}});
 if(text.startsWith('https://www.data.go.kr/'))return new Response('<table><tbody></tbody></table>',{status:200,headers:{'content-type':'text/html; charset=utf-8'}});
 throw Error('unexpected multi-option URL '+text);
});
const multiOptionCandidate=multiOptionResearch.candidates.find(item=>item.provider==='product-page-nutrition');
assert.ok(multiOptionCandidate);
assert.equal(multiOptionCandidate.autoEligible,false);
assert.equal(multiOptionResearch.autoStageId,'');
assert.match(multiOptionCandidate.note,/수동 적용/);

const internalIdOnly=extractProductPageEvidence(`<script type="application/ld+json">{"@type":"Product","name":"내부번호 상품","productID":"1234567890123","sku":"SHOP-123"}</script>`,'https://shop.example/internal');
assert.equal(internalIdOnly.barcode,'');
assert.equal(internalIdOnly.sku,'SHOP-123');

const disclosure=extractProductPageEvidence(`<!doctype html><head><meta property="og:title" content="테스트 라면 5입"></head><body><table>
<tr><th>생산자 및 소재지</th><td>(주)테스트식품</td></tr>
<tr><th>제조연월일, 유통기한(소비기한) 또는 품질유지기한</th><td>발송일 기준 28일 이상 남은 상품</td></tr>
<tr><th>포장단위별 내용물의 용량(중량), 수량</th><td>130g*5입</td></tr>
<tr><th>원재료 및 함량</th><td>소맥분, 팜유</td></tr>
<tr><th>영양성분(영양정보)</th><td>1봉지당(130g) 525kcal</td></tr>
<tr><th>식품 등의 표시, 광고에 관한 법률에 따른 소비자안전을 위한 주의사항</th><td>직사광선을 피하고 서늘한 곳에 보관하세요</td></tr>
</table></body>`,'https://shop.example/item/notice');
assert.equal(disclosure.structured,false);
assert.equal(disclosure.name,'테스트 라면 5입');
assert.equal(disclosure.manufacturer,'(주)테스트식품');
assert.equal(disclosure.pack,'130g*5입');
assert.equal(disclosure.ingredients,'소맥분, 팜유');
assert.match(disclosure.shelfLife,/28일 이상/);
assert.match(disclosure.storage,/서늘한 곳/);
assert.equal(disclosure.nutritionText,'1봉지당(130g) 525kcal');

const kurlyShape=extractProductPageEvidence(`<!doctype html><head><meta property="og:title" content="[차려낸] 햄 가득 송탄식 부대찌개"></head><body>
<div>알레르기정보</div><div>우유, 대두, 밀, 새우, 돼지고기, 토마토 함유</div>
<div>소비기한(또는 유통기한)정보</div><div>수령일 포함 최소 4일 이상 남은 상품을 보내드립니다.</div>
<div>1. 중량 : 1팩(678g)</div>
<div>이렇게 보관하세요</div><div>1. 0~10℃ 사이에서 냉장 보관하세요.</div>
<table>
<tr><th>생산자 및 소재지 (또는 생산자, 수입자 및 제조국)</th><td>상품설명 및 상품이미지 참조</td></tr>
<tr><th>영양성분표시</th><td>상품설명 및 상품이미지 참조</td></tr>
<tr><th>포장단위별 내용물의 용량(중량), 수량, 크기</th><td>상품설명 및 상품이미지 참조</td></tr>
<tr><th>원재료명 및 함량</th><td>상품설명 및 상품이미지 참조</td></tr>
</table></body>`,'https://www.kurly.com/goods/1001207466');
assert.equal(kurlyShape.pack,'1팩(678g)');
assert.match(kurlyShape.allergens,/우유, 대두, 밀/);
assert.match(kurlyShape.shelfLife,/최소 4일 이상/);
assert.match(kurlyShape.storage,/0~10℃.*냉장 보관/);
assert.equal(kurlyShape.manufacturer,'');
assert.equal(kurlyShape.ingredients,'');
assert.equal(kurlyShape.nutritionText,'');
assert.equal(kurlyShape.nutritionBasis,undefined);
assert.deepEqual(kurlyShape.nutritionMetrics,undefined);

assert.equal(normalizeProductUrl('https://example.com/item#review'),'https://example.com/item');
assert.equal(normalizeProductUrl('http://item.gmarket.co.kr/Item?goodscode=3721632164'),'https://item.gmarket.co.kr/Item?goodscode=3721632164');
assert.throws(()=>normalizeProductUrl('ftp://example.com/item'),/공개 https/);
assert.throws(()=>normalizeProductUrl('https://127.0.0.1/item'),/공개 https/);
assert.throws(()=>normalizeProductUrl('https://metadata.internal/item'),/공개 https/);
assert.throws(()=>normalizeProductUrl('https://shop.example/order/complete?orderNo=123'),/주문·결제/);
assert.throws(()=>normalizeProductUrl('https://shop.example/item/1?token=secret'),/주문·결제 식별정보/);
assert.equal(normalizeProductUrl('https://shop.example/vp/products/123?itemId=456'),'https://shop.example/vp/products/123?itemId=456');

const calls=[];
const fakeFetch=async input=>{
 const url=String(input);calls.push(url);
 if(url.startsWith('https://shop.example/'))return new Response(html,{status:200,headers:{'content-type':'text/html'}});
 if(url.startsWith('https://world.openfoodfacts.org/'))return new Response(JSON.stringify({product:{
  code:'8801234567890',product_name:'신생몰 테스트 소스',brands:'브랜드A',quantity:'320g',
  nutriments:{'energy-kcal_100g':120,sodium_100g:0.4,carbohydrates_100g:18,proteins_100g:2}
 }}),{status:200,headers:{'content-type':'application/json'}});
 if(url.startsWith('https://api.data.go.kr/'))return new Response(JSON.stringify(publicPayload),{status:200,headers:{'content-type':'application/json'}});
 throw Error('unexpected '+url);
};
const result=await researchFood({name:'테스트 두부',url:'https://shop.example/item/1'},{PUBLIC_DATA_SERVICE_KEY:'demo-key'},fakeFetch);
assert.equal(result.page.barcode,'8801234567890');
assert.equal(result.query.effectiveName,'신생몰 테스트 소스');
assert.equal(result.autoStageId,'off:8801234567890');
assert.equal(result.candidates.some(item=>item.provider==='open-food-facts'),true);
assert.equal(result.candidates.some(item=>item.provider==='public-nutrition'),true);
assert.equal(calls.length,3);
assert.match(calls.find(url=>url.startsWith('https://api.data.go.kr/')),/foodNm=/);

const genericPayload={response:{header:{resultCode:'00'},body:{items:[{foodCd:'R1',foodNm:'양파',dataCd:'R',typeNm:'원재료성식품',nutConSrtrQua:'100g',enerc:'40',nat:'4',prot:'1.1',chocdf:'9.3'}]}}};
const generic=await researchFood({name:'양파'},{PUBLIC_DATA_SERVICE_KEY:'demo'},async url=>{
 assert.ok(String(url).startsWith('https://api.data.go.kr/'));
 return new Response(JSON.stringify(genericPayload),{status:200,headers:{'content-type':'application/json'}});
});
assert.match(generic.autoStageId,/^public:/);
assert.equal(generic.candidates[0].kind,'generic');

let fallbackCalls=0;
const fallbackAfterApi=await researchFood({name:'양파'},{PUBLIC_DATA_SERVICE_KEY:'bad-key'},async url=>{
 fallbackCalls++;
 const text=String(url);
 if(text.startsWith('https://api.data.go.kr/'))return new Response('upstream failure',{status:503});
 if(text.startsWith('https://www.data.go.kr/data/15100064/standard.do?'))
  return new Response(publicGridHtml,{status:200,headers:{'content-type':'text/html; charset=utf-8'}});
 throw Error('unexpected fallback URL '+text);
});
assert.equal(fallbackCalls,2);
assert.equal(fallbackAfterApi.sources.publicNutrition.mode,'public-grid-after-openapi');
assert.equal(fallbackAfterApi.sources.publicNutrition.ok,true);
assert.match(fallbackAfterApi.sources.publicNutrition.error,/OpenAPI 실패 후/);
assert.match(fallbackAfterApi.autoStageId,/^public:/);

let noKeyCalls=0;
const noKey=await researchFood({name:'양파'},{},async url=>{
 noKeyCalls++;
 const text=String(url);
 assert.match(text,/^https:\/\/www\.data\.go\.kr\/data\/15100064\/standard\.do\?/);
 assert.match(text,/searchKeyword1=/);
 assert.match(text,/colCondition=FOOD_NM/);
 return new Response(publicGridHtml,{status:200,headers:{'content-type':'text/html; charset=utf-8'}});
});
assert.equal(noKeyCalls,1);
assert.equal(noKey.sources.publicNutrition.enabled,true);
assert.equal(noKey.sources.publicNutrition.ok,true);
assert.equal(noKey.sources.publicNutrition.mode,'public-grid');
assert.match(noKey.autoStageId,/^public:/);
assert.equal(noKey.candidates[0].identity.name,'양파');

const manyRows=[];
for(let i=0;i<55;i++){
 const cells=[...gridCells];
 cells[0]='P-'+i;
 cells[1]=i===54?'양파':'양파 가공 후보 '+i;
 cells[2]=i===54?'R':'P';
 cells[3]=i===54?'원재료성식품':'가공식품';
 manyRows.push('<tr class="contentsTr">'+cells.map(value=>'<td>'+value+'</td>').join('')+'</tr>');
}
const many=await researchFood({name:'양파'},{},async()=>new Response('<table><tbody>'+manyRows.join('')+'</tbody></table>',{
 status:200,headers:{'content-type':'text/html; charset=utf-8'}
}));
assert.equal(many.candidateCountTotal,55);
assert.equal(many.candidates.length,40);
assert.equal(many.candidates[0].identity.name,'양파');
assert.match(many.autoStageId,/^public:/);

// Raw pantry names match the DB's "<name>_생것" entry, not processed products.
assert.equal(rawFormMatch('양파_생것','양파'),'plain');
assert.equal(rawFormMatch('양파_샬롯_생것','샬롯'),'plain');
assert.equal(rawFormMatch('양파_샬롯_생것','양파'),'variety');
assert.equal(rawFormMatch('양파_데친것','양파'),'');
assert.equal(rawFormMatch('양파즙','양파'),'');
const rawPayload={items:[
 {foodCd:'P9',foodNm:'양파',dataCd:'P',typeNm:'가공식품',nutConSrtrQua:'100ml',enerc:'43',nat:'14'},
 {foodCd:'R2',foodNm:'양파_데친것',dataCd:'R',typeNm:'원재료성 식품',nutConSrtrQua:'100g',enerc:'28',nat:'2'},
 {foodCd:'R1',foodNm:'양파_생것',dataCd:'R',typeNm:'원재료성 식품',nutConSrtrQua:'100g',enerc:'29',nat:'2'},
 {foodCd:'R3',foodNm:'양파_샬롯_생것',dataCd:'R',typeNm:'원재료성 식품',nutConSrtrQua:'100g',enerc:'80',nat:'0'},
]};
const rawGrid='<table>'+rawPayload.items.map(row=>{const cells=Array(45).fill('');Object.assign(cells,{0:row.foodCd,1:row.foodNm,2:row.dataCd,3:row.typeNm,4:row.enerc,5:row.nutConSrtrQua,17:row.nat});return '<tr class="contentsTr">'+cells.map(c=>`<td>${c}</td>`).join('')+'</tr>';}).join('')+'</table>';
const raw=await researchFood({name:'양파'},{},async()=>new Response(rawGrid,{headers:{'content-type':'text/html'}}));
assert.equal(raw.candidates[0].identity.name,'양파_생것');
assert.equal(raw.autoStageId,'public:R1:100g');
assert.equal(raw.candidates.find(c=>c.identity.name==='양파').kind,'product');

// Live grid behaviour (2026-11-15): one page of 499 rows sorted by name; for "사과" processed
// products fill it, and "사과_생것" is reachable only with a second, narrower query.
const fullPage=[];
for(let i=0;i<499;i++){
 const cells=Array(45).fill('');
 Object.assign(cells,{0:'P'+i,1:'건조사과 '+i,2:'P',3:'가공식품',4:'300',5:'100g',17:'10'});
 fullPage.push('<tr class="contentsTr">'+cells.map(c=>`<td>${c}</td>`).join('')+'</tr>');
}
const appleRaw=(()=>{const cells=Array(45).fill('');Object.assign(cells,{0:'R-APPLE',1:'사과_생것',2:'R',3:'원재료성 식품',4:'53',5:'100g',17:'1'});return '<table><tr class="contentsTr">'+cells.map(c=>`<td>${c}</td>`).join('')+'</tr></table>';})();
const appleUrls=[];
const apple=await researchFood({name:'사과'},{},async url=>{
 const text=String(url);appleUrls.push(decodeURIComponent(new URL(text).searchParams.get('searchKeyword1')));
 return new Response(text.includes(encodeURIComponent('사과_생것'))?appleRaw:'<table>'+fullPage.join('')+'</table>',{headers:{'content-type':'text/html'}});
});
assert.deepEqual(appleUrls,['사과','사과_생것']);
assert.equal(apple.candidates[0].identity.name,'사과_생것');
assert.equal(apple.candidates[0].rawForm,'plain');
assert.equal(apple.autoStageId,'public:R-APPLE:100g');
// A page that is not full, or that already has the raw entry, costs no extra request.
let oneCall=0;
await researchFood({name:'양파'},{},async()=>{oneCall++;return new Response(rawGrid,{headers:{'content-type':'text/html'}});});
assert.equal(oneCall,1);

console.log('food research service checks passed');
