import assert from 'node:assert/strict';
import {appendProductPageEvidence,canAutoStageFoodResearch,extractResearchHints,stageFoodResearchCandidate} from '../public/food-research-ui.js';

assert.deepEqual(
 extractResearchHints(['새 제품','상품 링크: https://shop.example/p/1','바코드: 8801234567890']),
 {url:'https://shop.example/p/1',barcode:'8801234567890'}
);

const notesField={value:'기존 메모',maxLength:8000,dispatchEvent(){}};
assert.equal(appendProductPageEvidence(notesField,{
 url:'https://shop.example/p/1',brand:'브랜드',manufacturer:'테스트식품',barcode:'8801234567890',pack:'300g',
 ingredients:'토마토, 소금',allergens:'대두 함유',storage:'개봉 후 냉장',shelfLife:'제조일로부터 12개월',nutritionText:'100g당 120kcal'
}),true);
assert.match(notesField.value,/기존 메모/);
assert.match(notesField.value,/바코드: 8801234567890/);
assert.match(notesField.value,/원재료: 토마토, 소금/);
assert.match(notesField.value,/알레르기: 대두 함유/);
assert.match(notesField.value,/표시 보관기간·기한: 제조일로부터 12개월/);
assert.match(notesField.value,/제조사·생산자: 테스트식품/);
assert.match(notesField.value,/상품 영양표 문구: 100g당 120kcal/);
assert.equal(appendProductPageEvidence(notesField,{
 url:'https://shop.example/p/1',brand:'브랜드',manufacturer:'테스트식품',barcode:'8801234567890',pack:'300g',
 ingredients:'토마토, 소금',allergens:'대두 함유',storage:'개봉 후 냉장',shelfLife:'제조일로부터 12개월',nutritionText:'100g당 120kcal'
}),false);

const makeRow=()=>{const fields={
 '[data-value]':{value:''},'[data-amount]':{value:''},'[data-unit]':{value:''},
 '[data-evidence-source]':{value:''},'[data-evidence-url]':{value:''},'[data-evidence-note]':{value:''},
};return {fields,querySelector(selector){return fields[selector]||null;}};};
const energy=makeRow(),sodium=makeRow();
const rows={energy,sodium};
const target={
 querySelector(selector){
  const match=String(selector).match(/\[data-nutrient="([^"]+)"\]/);
  return match?rows[match[1]]||null:null;
 },
 querySelectorAll(selector){return selector==='[data-nutrient]'?Object.values(rows):[];}
};
assert.equal(canAutoStageFoodResearch(target),true);
const staged=stageFoodResearchCandidate(target,{
 kind:'product',confidence:'barcode',source:{name:'테스트 출처',url:'https://data.example/item'},
 identity:{name:'테스트 제품',manufacturer:'테스트 브랜드',barcode:'8801234567890',pack:'300g',ingredients:'토마토, 소금',allergens:'대두'},note:'바코드 일치',
 metrics:{
  energy:{value:100,amount:100,unit:'g'},
  sodium:{value:250,amount:100,unit:'g'}
 }
},{notesField});
assert.deepEqual(staged,['energy','sodium']);
assert.equal(energy.fields['[data-value]'].value,100);
assert.equal(energy.fields['[data-evidence-source]'].value,'테스트 출처');
assert.equal(sodium.fields['[data-value]'].value,250);
assert.equal(canAutoStageFoodResearch(target),false);
assert.match(notesField.value,/영양자료 제조사·브랜드: 테스트 브랜드/);
assert.match(notesField.value,/영양자료 제품 용량: 300g/);

console.log('food research UI checks passed');
