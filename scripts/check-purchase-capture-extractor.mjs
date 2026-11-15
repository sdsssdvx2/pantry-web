import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {extractLabeledPurchaseText} from './purchase-capture-extractor.mjs';

function runCli(input){
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['scripts/purchase-capture-extractor.mjs'],{stdio:['pipe','pipe','pipe']});
  let stdout='',stderr='';
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  child.stdout.on('data',chunk=>stdout+=chunk);
  child.stderr.on('data',chunk=>stderr+=chunk);
  child.on('error',reject);
  child.on('close',code=>resolve({code,stdout,stderr}));
  child.stdin.end(JSON.stringify(input));
 });
}

const text=[
 '주문번호: ORDER-SECRET-777',
 '배송지: PRIVATE ADDRESS',
 '카드: 1234-****-****-5678',
 '상품명: 국내산 양파 1kg',
 '카테고리: 식품 > 농산물 > 채소',
 '수량: 2개',
 '브랜드: 테스트팜',
 '용량: 1kg',
 '상품링크: https://shop.example/product/onion-1kg',
 '원재료: 양파 100%',
 '보관방법: 냉장보관',
 '영양기준: 100g',
 '열량: 40 kcal',
 '나트륨: 4 mg',
 '단백질: 1.1 g',
 '',
 '상품명: USB-C 케이블',
 '카테고리: 전자제품',
 '수량: 1개',
 '',
 '상품명: 이름만 있는 신상품',
 '수량: 1개',
 '',
 '상품명: 감자 1kg',
 '식품여부: 예',
 '상품링크: https://shop.example/orders/private-123?token=secret-token',
].join('\n');

const result=extractLabeledPurchaseText(text);
assert.equal(result.foodProducts.length,2);
assert.equal(result.reviewCandidates.length,1);
assert.ok(result.stats.sensitiveLines>=3);
assert.equal(result.foodProducts[0].name,'국내산 양파 1kg');
assert.equal(result.foodProducts[0].orderQuantity,'2개');
assert.equal(result.foodProducts[0].nutrition.basisAmount,100);
assert.equal(result.foodProducts[0].nutrition.energyKcal,40);
assert.equal(result.foodProducts[0].nutrition.sodiumMg,4);
assert.equal(result.foodProducts[0].nutrition.proteinG,1.1);
assert.equal(result.foodProducts[1].name,'감자 1kg');
assert.equal(result.foodProducts[1].productUrl,'','order/token URL must be stripped');
assert.equal(result.reviewCandidates[0].name,'이름만 있는 신상품');
assert.equal(result.reviewCandidates[0].needs_review,true);
assert.ok(!JSON.stringify(result).includes('ORDER-SECRET-777'));
assert.ok(!JSON.stringify(result).includes('PRIVATE ADDRESS'));
assert.ok(!JSON.stringify(result).includes('1234-'));
assert.ok(!JSON.stringify(result).includes('secret-token'));
assert.ok(!JSON.stringify(result).includes('USB-C 케이블'),'explicit non-food category must be dropped');

const orderProductLabel=extractLabeledPurchaseText([
 '주문번호: SECRET-123',
 '주문상품: 플레인 요거트 100g',
 '카테고리: 식품 > 유제품',
].join('\n'));
assert.equal(orderProductLabel.foodProducts.length,1);
assert.equal(orderProductLabel.foodProducts[0].name,'플레인 요거트 100g');
assert.equal(orderProductLabel.stats.sensitiveLines,1);

const bounded=extractLabeledPurchaseText([
 '상품명: 저염 테스트 식품',
 '카테고리: 식품',
 '영양기준: 100g',
 '나트륨: 5mg 미만',
 '단백질: 3g',
].join('\n'));
assert.equal(bounded.foodProducts.length,1);
assert.equal(bounded.foodProducts[0].nutrition.proteinG,3);
assert.equal('sodiumMg' in bounded.foodProducts[0].nutrition,false,'bounded nutrient must not become exact');

const duplicate=extractLabeledPurchaseText([
 '상품명: 우유 1L',
 '카테고리: 식품 > 유제품',
 '상품명: 우유 1L',
 '카테고리: 식품 > 유제품',
].join('\n'));
assert.equal(duplicate.foodProducts.length,1);

const cli=await runCli({sanitized_text:text});
assert.equal(cli.code,0,cli.stderr);
const cliPayload=JSON.parse(cli.stdout);
assert.equal(cliPayload.foodProductCount,2);
assert.equal(cliPayload.reviewCandidateCount,1);
assert.doesNotMatch(cli.stdout,/ORDER-SECRET|PRIVATE ADDRESS|1234-|secret-token|USB-C 케이블/);

console.log('PURCHASE_CAPTURE_EXTRACTOR_CHECK=PASS; LABELED_BLOCKS=PASS; SENSITIVE_LINES_DROPPED=PASS; NONFOOD_DROP=PASS; REVIEW_QUEUE=PASS; BOUNDED_NUTRIENT_DROP=PASS; UNSAFE_URL_DROP=PASS');
