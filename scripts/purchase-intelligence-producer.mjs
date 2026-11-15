#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {validateFoodIntakeServiceProvenance} from '../src/food-intake.js';
import {normalizeProductUrl} from '../src/food-research.js';
import {extractLabeledPurchaseText} from './purchase-capture-extractor.mjs';
import {adaptSitePurchaseCapture} from './purchase-site-adapters.mjs';

const MAX_STDIN_BYTES=512_000;
const MAX_EVENTS=20;
const FOOD_CATEGORY_RE=/(?:^|[\s/>|,;·_-])(?:food|foods|grocery|groceries|beverage|beverages|ingredient|ingredients|meal|meals|snack|snacks|produce|dairy|meat|seafood|bakery|식품|식료품|식재료|음료|간식|농산물|축산물|수산물|유제품|베이커리)(?:$|[\s/>|,;·_-])/i;
const NONFOOD_CATEGORY_RE=/(?:food\s*(?:storage|container)|pet\s*food|electronics?|computer|digital|container|cookware|kitchenware|appliance|equipment|utensil|cosmetic|beauty|보관용기|식품보관|주방용품|조리도구|가전|전자제품|컴퓨터|디지털|반려동물|화장품|생활용품)/i;

const clean=(value,max=2000)=>String(value??'').normalize('NFKC').trim().slice(0,max);
const asArray=value=>Array.isArray(value)?value:value==null?[]:[value];
const first=(object,names)=>{
 for(const name of names){
  if(object&&Object.prototype.hasOwnProperty.call(object,name)&&object[name]!=null&&String(object[name]).trim()!=='')return object[name];
 }
 return '';
};

function fail(message){
 console.error('PURCHASE_INTELLIGENCE_PRODUCER=HOLD; '+message);
 process.exitCode=2;
}

function parseArgs(argv){
 const out={dryRun:false,send:false,endpoint:''};
 for(let i=0;i<argv.length;i++){
  const arg=argv[i];
  if(arg==='--dry-run'){out.dryRun=true;continue;}
  if(arg==='--send'){out.send=true;continue;}
  if(arg==='--endpoint'){
   const value=argv[++i];
   if(!value)throw Error('--endpoint 값이 필요해요.');
   out.endpoint=value;
   continue;
  }
  throw Error('알 수 없는 옵션이에요: '+arg);
 }
 if(out.dryRun&&out.send)throw Error('--dry-run과 --send는 함께 사용할 수 없어요.');
 return out;
}

async function readStdin(){
 const chunks=[];let size=0;
 for await(const chunk of process.stdin){
  size+=chunk.length;
  if(size>MAX_STDIN_BYTES)throw Error('Personal Archive artifact JSON이 너무 커요.');
  chunks.push(chunk);
 }
 if(!size)throw Error('stdin으로 Personal Archive artifact JSON을 전달해 주세요.');
 return Buffer.concat(chunks).toString('utf8');
}

function domainFromUrl(value){
 const text=clean(value,2000);
 if(!text)return '';
 try{
  const url=new URL(text);
  if(!['http:','https:'].includes(url.protocol))return '';
  return url.hostname.toLowerCase();
 }catch{return '';}
}

function safeProductUrl(value){
 const text=clean(value,2000);
 if(!text)return '';
 try{return normalizeProductUrl(text);}
 catch{return '';}
}

function typeNames(value){
 return asArray(value?.['@type']).map(item=>clean(item,80).toLowerCase());
}

function quantityValue(value){
 if(value==null||value==='')return null;
 if(typeof value==='number')return Number.isFinite(value)&&value>0?value:null;
 if(typeof value==='string'){
  const match=value.replaceAll(',','').match(/^\s*(\d+(?:\.\d+)?)\s*([\p{L}%]+)?\s*$/u);
  if(!match)return null;
  const n=Number(match[1]);
  return Number.isFinite(n)&&n>0?{value:n,unit:clean(match[2]||'',30)}:null;
 }
 if(typeof value==='object'){
  const raw=first(value,['value','maxValue','minValue','amount']);
  const n=Number(raw);
  if(!Number.isFinite(n)||n<=0)return null;
  return {value:n,unit:clean(first(value,['unitText','unit','unitCode']),30)};
 }
 return null;
}

function packText(value){
 if(value==null)return '';
 if(typeof value==='string'||typeof value==='number')return clean(value,120);
 if(typeof value==='object'){
  const amount=first(value,['value','maxValue','minValue','amount']);
  const unit=first(value,['unitText','unit','unitCode']);
  return clean([amount,unit].filter(Boolean).join(''),120);
 }
 return '';
}

function brandText(value){
 if(typeof value==='string')return clean(value,180);
 if(Array.isArray(value))return value.map(brandText).find(Boolean)||'';
 if(value&&typeof value==='object')return clean(first(value,['name','brandName']),180);
 return '';
}

function barcodeText(object){
 const raw=first(object,['barcode','gtin14','gtin13','gtin12','gtin8','gtin']);
 return clean(raw,30).replace(/\D/g,'');
}

function nutritionBasis(value){
 if(!value||typeof value!=='object')return null;
 const directAmount=Number(first(value,['basisAmount','amount']));
 const directUnit=clean(first(value,['basisUnit','unit']),10).toLowerCase().replace('㎖','ml');
 if(Number.isFinite(directAmount)&&directAmount>0&&['g','ml'].includes(directUnit))
  return {basisAmount:directAmount,basisUnit:directUnit};
 const serving=clean(first(value,['servingSize','serving_size']),120).replace(/㎖/g,'ml');
 const match=serving.match(/(\d+(?:\.\d+)?)\s*(g|ml)\b/i);
 if(!match)return null;
 return {basisAmount:Number(match[1]),basisUnit:match[2].toLowerCase()==='ml'?'ml':'g'};
}

function metricValue(raw,targetUnit,{normalizedNumber=false}={}){
 if(raw==null||raw==='')return null;
 if(normalizedNumber){
  const n=Number(raw);
  if(Number.isFinite(n)&&n>=0&&String(raw).trim()!=='')return n;
 }
 if(typeof raw==='number')return null;
 const text=clean(raw,120).replaceAll(',','').replace(/㎎/g,'mg').replace(/밀리그램/gi,'mg').replace(/그램/gi,'g');
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

function normalizeNutrition(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const basis=nutritionBasis(value);
 if(!basis)return null;
 const spec={
  energyKcal:{normalized:['energyKcal'],schema:['calories','energy'],unit:'kcal'},
  sodiumMg:{normalized:['sodiumMg'],schema:['sodiumContent'],unit:'mg'},
  carbsG:{normalized:['carbsG'],schema:['carbohydrateContent'],unit:'g'},
  sugarsG:{normalized:['sugarsG'],schema:['sugarContent'],unit:'g'},
  fatG:{normalized:['fatG'],schema:['fatContent'],unit:'g'},
  saturatedFatG:{normalized:['saturatedFatG'],schema:['saturatedFatContent'],unit:'g'},
  proteinG:{normalized:['proteinG'],schema:['proteinContent'],unit:'g'},
  fiberG:{normalized:['fiberG'],schema:['fiberContent'],unit:'g'},
  cholesterolMg:{normalized:['cholesterolMg'],schema:['cholesterolContent'],unit:'mg'},
  transFatG:{normalized:['transFatG'],schema:['transFatContent'],unit:'g'},
 };
 const out={...basis};let count=0;
 for(const [field,rule] of Object.entries(spec)){
  let n=null;
  for(const key of rule.normalized){
   if(value[key]!=null){n=metricValue(value[key],rule.unit,{normalizedNumber:true});break;}
  }
  if(n===null){
   for(const key of rule.schema){
    if(value[key]!=null){n=metricValue(value[key],rule.unit);break;}
   }
  }
  if(n===null||!Number.isFinite(n)||n<0)continue;
  out[field]=n;count++;
 }
 return count?out:null;
}

function explicitFoodSignal(record,product){
 const flags=[
  first(record,['foodEligible','food_eligible','isFood','is_food']),
  first(product,['foodEligible','food_eligible','isFood','is_food']),
 ];
 const category=clean(first(product,['category','productCategory','product_category'])||first(record,['category','productCategory','product_category']),300);
 if(category&&NONFOOD_CATEGORY_RE.test(category))return false;
 if(flags.some(flag=>flag===true||String(flag).toLowerCase()==='true'))return true;
 if(category&&FOOD_CATEGORY_RE.test(' '+category+' '))return true;
 if(normalizeNutrition(product.nutrition||product.nutritionInformation))return true;
 if(clean(first(product,['ingredients','ingredientText','ingredient_text']),200))return true;
 if(clean(first(product,['allergens','allergen','allergenText','allergen_text']),200))return true;
 return false;
}

function productFromRecord(record){
 if(!record||typeof record!=='object'||Array.isArray(record))return null;
 const nested=record.product_identity??record.productIdentity??record.product??record.orderedItem;
 const product=nested&&typeof nested==='object'&&!Array.isArray(nested)?nested:record;
 const name=clean(first(product,['name','productName','product_name','title']),180);
 if(!name||!explicitFoodSignal(record,product))return null;
 const nutrition=normalizeNutrition(product.nutrition||product.nutritionInformation);
 const result={
  name,
  brand:brandText(first(product,['brand','manufacturer'])),
  pack:packText(first(product,['pack','netContent','net_content','size','weight'])),
  barcode:barcodeText(product),
  productUrl:safeProductUrl(first(product,['productUrl','product_url','url'])),
  ingredients:clean(first(product,['ingredients','ingredientText','ingredient_text']),1800),
  allergens:clean(first(product,['allergens','allergen','allergenText','allergen_text']),1200),
  storage:clean(first(product,['storage','storageInstructions','storage_instructions']),1200),
  shelfLife:clean(first(product,['shelfLife','shelf_life','expires','expirationText','expiration_text']),1200),
  ...(nutrition?{nutrition}:{}),
 };
 return result;
}

function orderQuantityFromRecord(record){
 if(!record||typeof record!=='object')return null;
 const raw=first(record,['orderQuantity','order_quantity']);
 const q=quantityValue(raw);
 if(typeof q==='number')return {value:q,unit:''};
 if(q&&typeof q==='object')return q;
 const direct=record.quantity;
 if(typeof direct==='number'&&Number.isFinite(direct)&&direct>0)return {value:direct,unit:clean(record.quantityUnit||record.quantity_unit||'',30)};
 if(typeNames(record).includes('orderitem'))return {value:1,unit:''};
 return null;
}

function walkSchema(value,records,seen=new Set()){
 if(!value||typeof value!=='object')return;
 if(seen.has(value))return;
 seen.add(value);
 if(Array.isArray(value)){for(const item of value)walkSchema(item,records,seen);return;}
 const types=typeNames(value);
 if(types.includes('orderitem')){
  const product=value.orderedItem;
  if(product&&typeof product==='object')records.push({record:{...value,product},quantity:orderQuantityFromRecord(value),origin:'schema-order-item'});
 }
 if(types.includes('offer')){
  const product=value.itemOffered;
  if(product&&typeof product==='object')records.push({record:{...value,product},quantity:null,origin:'schema-accepted-offer'});
 }
 if(types.includes('product'))records.push({record:value,quantity:null,origin:'schema-product'});
 if(value['@graph'])walkSchema(value['@graph'],records,seen);
 if(types.includes('order')&&value.orderedItem)walkSchema(value.orderedItem,records,seen);
 if(types.includes('order')&&value.acceptedOffer)walkSchema(value.acceptedOffer,records,seen);
}

function collectRecords(structured,extracted,siteAdapter){
 const records=[];
 const add=(value,origin,explicitFood=false)=>{
  for(const item of asArray(value)){
   if(!item||typeof item!=='object'||Array.isArray(item))continue;
   const record=explicitFood?{...item,foodEligible:true}:item;
   records.push({record,quantity:orderQuantityFromRecord(item),origin});
  }
 };
 if(structured&&typeof structured==='object'){
  add(structured.food_products??structured.foodProducts,'food-products',true);
  add(structured.product_identity??structured.productIdentity,'product-identity',false);
  add(structured.order_lines??structured.orderLines,'order-lines',false);
  add(structured.products,'products',false);
  walkSchema(structured,records);
 }
 add(siteAdapter?.orderLines,'site-adapter-order-lines',false);
 add(extracted?.foodProducts,'sanitized-text-food-products',true);
 return records;
}

function stableEventId(meta,product,quantity,ordinal){
 const material=JSON.stringify({
  v:1,
  archiveArtifactId:meta.archiveArtifactId,
  contentSha256:meta.contentSha256,
  ordinal,
  product,
  quantity:quantity||null,
 });
 const digest=createHash('sha256').update(material).digest('hex');
 return 'pi-food-v1:'+digest.slice(0,48);
}

function normalizeArtifact(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Personal Archive artifact는 JSON object여야 해요.');
 const archiveArtifactId=clean(first(input,['archive_artifact_id','archiveArtifactId']),200);
 const capturedAt=clean(first(input,['captured_at','capturedAt']),80);
 const contentSha256=clean(first(input,['content_sha256','contentSha256']),80).toLowerCase();
 const sourceUrl=clean(first(input,['source_url','sourceUrl']),2000);
 const structuredRaw=input.structured_data??input.structuredData;
 const structured=structuredRaw&&typeof structuredRaw==='object'&&!Array.isArray(structuredRaw)?structuredRaw:{};
 const sanitizedText=clean(first(input,['sanitized_text','sanitizedText']),250_000);
 if(!Object.keys(structured).length&&!sanitizedText)throw Error('structured_data 또는 sanitized_text가 필요해요.');
 const extracted=extractLabeledPurchaseText(sanitizedText);
 const rawMerchant=first(input,['merchant','seller','sourceMerchant','source_merchant']);
 const merchant=brandText(rawMerchant)||brandText(structured.seller);
 const domain=clean(first(input,['domain','sourceDomain','source_domain']),180).toLowerCase()||domainFromUrl(sourceUrl);
 if(!archiveArtifactId)throw Error('archive_artifact_id가 필요해요.');
 if(!capturedAt)throw Error('captured_at이 필요해요.');
 if(!/^[a-f0-9]{64}$/.test(contentSha256))throw Error('content_sha256 형식을 확인해 주세요.');
 if(!merchant&&!domain)throw Error('merchant/domain 또는 source_url이 필요해요.');
 const siteAdapter=adaptSitePurchaseCapture({domain,merchant,structured});
 return {archiveArtifactId,capturedAt,contentSha256,merchant,domain,structured,extracted,siteAdapter};
}

function produceEvents(input){
 const meta=normalizeArtifact(input);
 const candidates=collectRecords(meta.structured,meta.extracted,meta.siteAdapter);
 const events=[];const fingerprints=new Set();let skippedNonFood=0;let skippedDuplicate=0;
 for(let i=0;i<candidates.length;i++){
  const entry=candidates[i];
  const product=productFromRecord(entry.record);
  if(!product){skippedNonFood++;continue;}
  const fingerprint=JSON.stringify({product,quantity:entry.quantity||null});
  if(fingerprints.has(fingerprint)){skippedDuplicate++;continue;}
  fingerprints.add(fingerprint);
  const event={
   schemaVersion:1,
   eventId:stableEventId(meta,product,entry.quantity,i),
   capturedAt:meta.capturedAt,
   source:{
    merchant:meta.merchant,
    domain:meta.domain,
    archiveArtifactId:meta.archiveArtifactId,
    contentSha256:meta.contentSha256,
   },
   product,
   ...(entry.quantity?{quantity:entry.quantity}:{}),
  };
  events.push(validateFoodIntakeServiceProvenance(event));
  if(events.length>MAX_EVENTS)throw Error('한 artifact에서 식품 이벤트를 20개 넘게 만들 수 없어요.');
 }
 if(!events.length){
  const reviewCount=meta.extracted?.reviewCandidates?.length||0;
  if(reviewCount)throw Error('REVIEW_REQUIRED; 안전하게 자동 판정하지 못한 상품 후보가 '+reviewCount+'개 있어요.');
  throw Error('자동 전달할 식품 상품을 찾지 못했어요. 명시적 foodEligible/category 또는 영양·원재료 근거가 필요해요.');
 }
 return {
  events,sourceRecords:candidates.length,skippedNonFood,skippedDuplicate,
  extractedFoodProducts:meta.extracted?.foodProducts?.length||0,
  reviewCandidates:meta.extracted?.reviewCandidates?.length||0,
  siteAdapter:meta.siteAdapter?.site||'',
  siteAdapterRecords:meta.siteAdapter?.orderLines?.length||0,
 };
}

function runClient(event,args){
 return new Promise((resolve,reject)=>{
  const childArgs=['scripts/purchase-intake-client.mjs'];
  if(args.endpoint)childArgs.push('--endpoint',args.endpoint);
  const child=spawn(process.execPath,childArgs,{env:{...process.env},stdio:['pipe','pipe','pipe']});
  let stdout='',stderr='';
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  child.stdout.on('data',chunk=>stdout+=chunk);
  child.stderr.on('data',chunk=>stderr+=chunk);
  child.on('error',reject);
  child.on('close',code=>resolve({code,stdout,stderr}));
  child.stdin.end(JSON.stringify(event));
 });
}

async function main(){
 let args;
 try{args=parseArgs(process.argv.slice(2));}catch(error){fail(error.message);return;}
 let raw,input,produced;
 try{
  raw=await readStdin();
  input=JSON.parse(raw);
  produced=produceEvents(input);
 }catch(error){fail(error?.message||'artifact를 처리하지 못했어요.');return;}

 if(args.dryRun){
  console.log([
   'PURCHASE_INTELLIGENCE_PRODUCER=DRY_RUN_PASS',
   'EVENTS='+produced.events.length,
   'SOURCE_RECORDS='+produced.sourceRecords,
   'SKIPPED_NONFOOD='+produced.skippedNonFood,
   'SKIPPED_DUPLICATE='+produced.skippedDuplicate,
   'EXTRACTED_FOOD='+produced.extractedFoodProducts,
   'REVIEW_CANDIDATES='+produced.reviewCandidates,
   'SITE_ADAPTER='+(produced.siteAdapter||'NONE'),
   'SITE_ADAPTER_RECORDS='+produced.siteAdapterRecords,
   'NETWORK_REQUESTS=0',
   'AUTO_RETRY=NO',
  ].join('; '));
  return;
 }

 if(!args.send){
  process.stdout.write(JSON.stringify({
   schemaVersion:1,
   eventCount:produced.events.length,
   events:produced.events,
   stats:{
    sourceRecords:produced.sourceRecords,
    skippedNonFood:produced.skippedNonFood,
    skippedDuplicate:produced.skippedDuplicate,
    extractedFoodProducts:produced.extractedFoodProducts,
    reviewCandidates:produced.reviewCandidates,
    siteAdapter:produced.siteAdapter,
    siteAdapterRecords:produced.siteAdapterRecords,
   },
   networkRequests:0,
  })+'\n');
  return;
 }

 let sent=0;
 for(const event of produced.events){
  let result;
  try{result=await runClient(event,args);}catch(error){fail('CLIENT_START_FAILED; '+(error?.name||'error'));return;}
  if(result.code!==0){
   const reason=clean(result.stderr||result.stdout,400).replace(/[\r\n]+/g,' ');
   fail('SEND_FAILED_AFTER='+sent+'; '+reason);
   return;
  }
  sent++;
 }
 console.log([
  'PURCHASE_INTELLIGENCE_PRODUCER=PASS',
  'EVENTS='+produced.events.length,
  'SENT='+sent,
  'SKIPPED_NONFOOD='+produced.skippedNonFood,
  'SKIPPED_DUPLICATE='+produced.skippedDuplicate,
  'EXTRACTED_FOOD='+produced.extractedFoodProducts,
  'REVIEW_CANDIDATES='+produced.reviewCandidates,
  'SITE_ADAPTER='+(produced.siteAdapter||'NONE'),
  'SITE_ADAPTER_RECORDS='+produced.siteAdapterRecords,
  'AUTO_RETRY=NO',
 ].join('; '));
}

await main();
