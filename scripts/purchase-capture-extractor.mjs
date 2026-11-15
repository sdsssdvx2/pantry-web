#!/usr/bin/env node
import {pathToFileURL} from 'node:url';
import {normalizeProductUrl} from '../src/food-research.js';

const MAX_STDIN_BYTES=512_000;
const MAX_TEXT_CHARS=250_000;
const MAX_PRODUCTS=40;
const MAX_VALUE=1800;

const FOOD_CATEGORY_RE=/(?:^|[\s/>|,;·_-])(?:food|foods|grocery|groceries|beverage|beverages|ingredient|ingredients|meal|meals|snack|snacks|produce|dairy|meat|seafood|bakery|식품|식료품|식재료|음료|간식|농산물|축산물|수산물|유제품|베이커리|채소|과일|정육|수산)(?:$|[\s/>|,;·_-])/i;
const NONFOOD_CATEGORY_RE=/(?:food\s*(?:storage|container)|pet\s*food|electronics?|computer|digital|container|cookware|kitchenware|appliance|equipment|utensil|cosmetic|beauty|보관용기|식품보관|주방용품|조리도구|가전|전자제품|컴퓨터|디지털|반려동물|화장품|생활용품)/i;
const SENSITIVE_LABEL_RE=/^(?:주문번호|주문ID|주문아이디|주문자|주문일시|주문금액|결제|결제정보|결제수단|환불|환불정보|배송지|배송주소|배송메모|주소|수령인|받는사람|연락처|전화|휴대폰|이메일|카드|카드번호|계좌|계좌번호|고객|고객정보|회원|회원정보|쿠폰|쿠폰번호|개인통관|개인통관번호|통관번호|세션|토큰|인증)$/i;

const clean=(value,max=MAX_VALUE)=>String(value??'').normalize('NFKC').replace(/\u0000/g,'').trim().slice(0,max);
const labelKey=value=>clean(value,80).toLowerCase().replace(/[\s._\-/()[\]]+/g,'');
const yes=value=>/^(?:1|true|yes|y|예|네|맞음|식품)$/i.test(clean(value,40));

function safeProductUrl(value){
 const text=clean(value,2000);
 if(!text)return '';
 try{return normalizeProductUrl(text);}
 catch{return '';}
}

function safeBarcode(value){
 const digits=clean(value,40).replace(/\D/g,'');
 return /^\d{8,14}$/.test(digits)?digits:'';
}

function parseQuantity(value){
 const text=clean(value,80).replaceAll(',','');
 const match=text.match(/^(\d+(?:\.\d+)?)\s*([\p{L}%]+)?$/u);
 if(!match)return '';
 const n=Number(match[1]);
 if(!Number.isFinite(n)||n<=0)return '';
 return String(n)+(match[2]||'');
}

function parseBasis(value){
 const text=clean(value,100).replace(/㎖/g,'ml');
 const match=text.match(/(\d+(?:\.\d+)?)\s*(g|ml)\b/i);
 if(!match)return null;
 const amount=Number(match[1]);
 if(!Number.isFinite(amount)||amount<=0)return null;
 return {basisAmount:amount,basisUnit:match[2].toLowerCase()==='ml'?'ml':'g'};
}

function parseMetric(value,targetUnit){
 const text=clean(value,100).replaceAll(',','').replace(/㎎/g,'mg').replace(/밀리그램/gi,'mg').replace(/그램/gi,'g');
 if(!text||/(?:미만|이하|less\s+than|<)/i.test(text))return null;
 if(targetUnit==='kcal'){
  const match=text.match(/(\d+(?:\.\d+)?)\s*(?:kcal|calories?)\b/i);
  return match?Number(match[1]):null;
 }
 const match=text.match(/(\d+(?:\.\d+)?)\s*(mg|g)\b/i);
 if(!match)return null;
 const n=Number(match[1]);
 if(!Number.isFinite(n)||n<0)return null;
 const unit=match[2].toLowerCase();
 if(targetUnit==='mg')return unit==='g'?n*1000:n;
 return unit==='mg'?n/1000:n;
}

const LABEL_FIELD=new Map([
 ['상품명','name'],['제품명','name'],['주문상품','name'],['구매상품','name'],
 ['브랜드','brand'],['상표','brand'],['제조사','brand'],
 ['용량','pack'],['중량','pack'],['내용량','pack'],['규격','pack'],
 ['바코드','barcode'],['gtin','barcode'],['ean','barcode'],
 ['상품url','productUrl'],['제품url','productUrl'],['상품링크','productUrl'],['제품링크','productUrl'],
 ['원재료','ingredients'],['원재료명','ingredients'],['원재료및함량','ingredients'],
 ['알레르기','allergens'],['알레르기정보','allergens'],['알레르기유발물질','allergens'],
 ['보관방법','storage'],['보관조건','storage'],
 ['소비기한','shelfLife'],['유통기한','shelfLife'],['품질유지기한','shelfLife'],
 ['카테고리','category'],['상품분류','category'],['분류','category'],
 ['수량','orderQuantity'],['주문수량','orderQuantity'],
 ['식품여부','foodFlag'],['식품','foodFlag'],
 ['영양기준','nutritionBasis'],['영양정보기준','nutritionBasis'],['기준량','nutritionBasis'],['1회제공량','nutritionBasis'],
 ['열량','energyKcal'],['칼로리','energyKcal'],
 ['나트륨','sodiumMg'],['탄수화물','carbsG'],['당류','sugarsG'],['지방','fatG'],['총지방','fatG'],
 ['포화지방','saturatedFatG'],['단백질','proteinG'],['식이섬유','fiberG'],
 ['콜레스테롤','cholesterolMg'],['트랜스지방','transFatG'],
]);

const METRIC_UNITS={
 energyKcal:'kcal',sodiumMg:'mg',carbsG:'g',sugarsG:'g',fatG:'g',
 saturatedFatG:'g',proteinG:'g',fiberG:'g',cholesterolMg:'mg',transFatG:'g',
};

function parseLabeledLine(line){
 const match=clean(line,2200).match(/^\s*([^:：]{1,40})\s*[:：]\s*(.+?)\s*$/);
 if(!match)return null;
 const rawLabel=clean(match[1],80);
 if(SENSITIVE_LABEL_RE.test(rawLabel))return {sensitive:true};
 const field=LABEL_FIELD.get(labelKey(rawLabel));
 if(!field)return null;
 return {field,value:clean(match[2])};
}

function finalizeBlock(block){
 if(!block?.name)return null;
 const product={
  name:clean(block.name,180),
  brand:clean(block.brand,180),
  pack:clean(block.pack,120),
  barcode:safeBarcode(block.barcode),
  productUrl:safeProductUrl(block.productUrl),
  ingredients:clean(block.ingredients,1800),
  allergens:clean(block.allergens,1200),
  storage:clean(block.storage,1200),
  shelfLife:clean(block.shelfLife,1200),
 };
 const basis=parseBasis(block.nutritionBasis);
 if(basis){
  const nutrition={...basis};let metrics=0;
  for(const [field,unit] of Object.entries(METRIC_UNITS)){
   const n=parseMetric(block[field],unit);
   if(n===null||!Number.isFinite(n)||n<0)continue;
   nutrition[field]=n;metrics++;
  }
  if(metrics)product.nutrition=nutrition;
 }
 const category=clean(block.category,300);
 const explicitlyFood=yes(block.foodFlag);
 const explicitlyNonFood=category&&NONFOOD_CATEGORY_RE.test(category);
 const foodEvidence=!!(
  explicitlyFood||
  (category&&FOOD_CATEGORY_RE.test(' '+category+' '))||
  product.ingredients||
  product.allergens||
  product.nutrition
 );
 const orderQuantity=parseQuantity(block.orderQuantity);
 return {
  product:{
   ...product,
   ...(category?{category}:{}),
   ...(orderQuantity?{orderQuantity}:{}),
  },
  foodEligible:!explicitlyNonFood&&foodEvidence,
  explicitlyNonFood:!!explicitlyNonFood,
 };
}

export function extractLabeledPurchaseText(value){
 const text=clean(value,MAX_TEXT_CHARS);
 if(!text)return {foodProducts:[],reviewCandidates:[],stats:{lines:0,blocks:0,sensitiveLines:0,ignoredLines:0}};
 const lines=text.split(/\r?\n/).slice(0,5000);
 const blocks=[];let current=null;let sensitiveLines=0,ignoredLines=0;
 const flush=()=>{
  if(!current)return;
  const item=finalizeBlock(current);
  if(item)blocks.push(item);
  current=null;
 };
 for(const line of lines){
  const parsed=parseLabeledLine(line);
  if(parsed?.sensitive){sensitiveLines++;continue;}
  if(!parsed){if(clean(line))ignoredLines++;continue;}
  if(parsed.field==='name'){
   flush();
   current={name:parsed.value};
   continue;
  }
  if(!current){ignoredLines++;continue;}
  if(current[parsed.field]==null||current[parsed.field]==='')current[parsed.field]=parsed.value;
 }
 flush();
 if(blocks.length>MAX_PRODUCTS)throw Error('한 artifact에서 라벨형 상품 블록을 40개 넘게 추출할 수 없어요.');

 const foodProducts=[];const reviewCandidates=[];const seen=new Set();
 for(const item of blocks){
  if(item.explicitlyNonFood)continue;
  const fingerprint=JSON.stringify(item.product);
  if(seen.has(fingerprint))continue;
  seen.add(fingerprint);
  if(item.foodEligible)foodProducts.push({...item.product,foodEligible:true});
  else reviewCandidates.push({...item.product,needs_review:true});
 }
 return {
  foodProducts,
  reviewCandidates,
  stats:{lines:lines.length,blocks:blocks.length,sensitiveLines,ignoredLines},
 };
}

function safeSummary(result){
 return {
  foodProductCount:result.foodProducts.length,
  reviewCandidateCount:result.reviewCandidates.length,
  stats:result.stats,
  foodProducts:result.foodProducts,
  reviewCandidates:result.reviewCandidates,
 };
}

async function readStdin(){
 const chunks=[];let size=0;
 for await(const chunk of process.stdin){
  size+=chunk.length;
  if(size>MAX_STDIN_BYTES)throw Error('입력 JSON이 너무 커요.');
  chunks.push(chunk);
 }
 if(!size)throw Error('stdin으로 JSON을 전달해 주세요.');
 return Buffer.concat(chunks).toString('utf8');
}

async function main(){
 try{
  const input=JSON.parse(await readStdin());
  const text=input?.sanitized_text??input?.sanitizedText??input?.text??'';
  const result=extractLabeledPurchaseText(text);
  process.stdout.write(JSON.stringify(safeSummary(result))+'\n');
 }catch(error){
  console.error('PURCHASE_CAPTURE_EXTRACTOR=HOLD; '+(error?.message||'입력을 처리하지 못했어요.'));
  process.exitCode=2;
 }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
