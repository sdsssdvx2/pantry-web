#!/usr/bin/env node
import {pathToFileURL} from 'node:url';
import {normalizeProductUrl} from '../src/food-research.js';

const MAX_ITEMS=40;
const MAX_STDIN_BYTES=512_000;
const MAX_TEXT=1800;

const clean=(value,max=MAX_TEXT)=>String(value??'').normalize('NFKC').replace(/\u0000/g,'').trim().slice(0,max);
const asObject=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:null;
const asArray=value=>Array.isArray(value)?value:[];
const first=(object,names)=>{
 for(const name of names){
  if(object&&Object.prototype.hasOwnProperty.call(object,name)&&object[name]!=null&&String(object[name]).trim()!=='')return object[name];
 }
 return '';
};
const firstEither=(primary,fallback,names)=>first(primary,names)||first(fallback,names);
const brandText=value=>{
 if(typeof value==='string'||typeof value==='number')return clean(value,180);
 if(Array.isArray(value))return value.map(brandText).find(Boolean)||'';
 if(asObject(value))return clean(first(value,['name','brandName','manufacturer','maker']),180);
 return '';
};

const SITE_RULES={
 coupang:{
  domains:['coupang.com'],
  merchant:/쿠팡|coupang/i,
  arrays:['orderItems','order_items','items','products'],
  names:['productName','vendorItemName','itemName','goodsName','name','title'],
 },
 naver:{
  domains:['shopping.naver.com','m.shopping.naver.com','smartstore.naver.com','brand.naver.com'],
  merchant:/네이버|naver|스마트스토어/i,
  arrays:['productOrders','product_orders','orderItems','order_items','items','products'],
  names:['productOrderName','productName','itemName','goodsName','name','title'],
 },
 kurly:{
  domains:['kurly.com','www.kurly.com'],
  merchant:/컬리|마켓컬리|kurly/i,
  arrays:['orderProducts','order_products','orderItems','order_items','items','products'],
  names:['goodsName','productName','itemName','name','title'],
 },
 gmarket:{
  domains:['gmarket.co.kr','www.gmarket.co.kr','m.gmarket.co.kr'],
  merchant:/지마켓|g마켓|gmarket/i,
  arrays:['orderItems','order_items','items','products','goods'],
  names:['itemName','goodsName','productName','name','title'],
 },
};

function hostname(value){
 const text=clean(value,300).toLowerCase().replace(/^https?:\/\//,'').replace(/\/.*$/,'');
 return text.replace(/^www\./,'');
}

function siteFrom({domain='',merchant='',adapter=''}={}){
 const explicit=clean(adapter,30).toLowerCase();
 const explicitSite=Object.hasOwn(SITE_RULES,explicit)?explicit:'';
 const host=hostname(domain);
 let domainSite='';
 if(host){
  for(const [site,rule] of Object.entries(SITE_RULES)){
   if(rule.domains.some(candidate=>host===candidate.replace(/^www\./,'')||host.endsWith('.'+candidate.replace(/^www\./,'')))){
    domainSite=site;break;
   }
  }
 }
 if(explicitSite&&domainSite&&explicitSite!==domainSite)
  throw Error('사이트 주문 캡처 adapter와 source domain이 일치하지 않아요.');
 if(explicitSite)return explicitSite;
 if(domainSite)return domainSite;
 const seller=clean(merchant,180);
 for(const [site,rule] of Object.entries(SITE_RULES))if(seller&&rule.merchant.test(seller))return site;
 return '';
}

function safeUrl(value){
 const text=clean(value,2000);
 if(!text)return '';
 try{return normalizeProductUrl(text);}
 catch{return '';}
}

function safeBarcode(value){
 const digits=clean(value,40).replace(/\D/g,'');
 return /^\d{8,14}$/.test(digits)?digits:'';
}

function quantity(value,unitValue=''){
 if(value==null||value==='')return null;
 if(typeof value==='number'){
  if(!Number.isFinite(value)||value<=0)return null;
  return {value,unit:clean(unitValue,30)};
 }
 if(typeof value==='object'){
  const raw=first(value,['value','amount','count','quantity']);
  return quantity(raw,first(value,['unit','unitText','unit_name'])||unitValue);
 }
 const text=clean(value,80).replaceAll(',','');
 const match=text.match(/^(\d+(?:\.\d+)?)\s*([\p{L}%]+)?$/u);
 if(!match)return null;
 const n=Number(match[1]);
 return Number.isFinite(n)&&n>0?{value:n,unit:clean(match[2]||unitValue,30)}:null;
}

function packValue(item){
 const raw=first(item,['pack','netContent','net_content','weight','size','capacity','volume']);
 if(typeof raw==='object'){
  const amount=first(raw,['value','amount']);
  const unit=first(raw,['unit','unitText','unitCode']);
  return clean([amount,unit].filter(Boolean).join(''),120);
 }
 return clean(raw,120);
}

function plainNutrition(item){
 const value=asObject(item?.nutrition??item?.nutritionInformation??item?.nutrition_info);
 if(!value)return null;
 const out={};
 const allowed=[
  'basisAmount','basisUnit','servingSize','serving_size',
  'energyKcal','sodiumMg','carbsG','sugarsG','fatG','saturatedFatG',
  'proteinG','fiberG','cholesterolMg','transFatG',
  'calories','energy','sodiumContent','carbohydrateContent','sugarContent',
  'fatContent','saturatedFatContent','proteinContent','fiberContent',
  'cholesterolContent','transFatContent',
 ];
 for(const key of allowed){
  if(value[key]==null)continue;
  if(typeof value[key]==='string'||typeof value[key]==='number')out[key]=value[key];
 }
 return Object.keys(out).length?out:null;
}

function normalizeItem(item,rule){
 if(!asObject(item))return null;
 const nested=asObject(item.product??item.productIdentity??item.product_identity??item.goods??item.orderedItem);
 const source=nested||item;
 const name=clean(firstEither(source,item,rule.names),180);
 if(!name)return null;
 const product={
  name,
  brand:brandText(firstEither(source,item,['brand','brandName','manufacturer','maker'])),
  pack:packValue(source)||packValue(item),
  barcode:safeBarcode(firstEither(source,item,['barcode','gtin','gtin13','gtin14','ean'])),
  productUrl:safeUrl(firstEither(source,item,['productUrl','product_url','url','productLink','product_link','link'])),
  ingredients:clean(firstEither(source,item,['ingredients','ingredientText','ingredient_text','rawMaterials','raw_materials']),1800),
  allergens:clean(firstEither(source,item,['allergens','allergenText','allergen_text']),1200),
  storage:clean(firstEither(source,item,['storage','storageInstructions','storage_instructions']),1200),
  shelfLife:clean(firstEither(source,item,['shelfLife','shelf_life','expirationText','expiration_text','expires']),1200),
  category:clean(firstEither(source,item,['category','categoryName','category_name','productCategory','product_category']),300),
 };
 const nutrition=plainNutrition(source)||plainNutrition(item);
 if(nutrition)product.nutrition=nutrition;
 const q=quantity(
  first(item,['orderQuantity','order_quantity','quantity','qty','count','orderCount','order_count']),
  first(item,['quantityUnit','quantity_unit','unit'])
 );
 return {product_identity:product,...(q?{quantity:q.value,quantityUnit:q.unit}: {})};
}

function captureObject(structured){
 if(!asObject(structured))return null;
 return asObject(
  structured.purchase_capture??structured.purchaseCapture??
  structured.site_capture??structured.siteCapture
 );
}

export function adaptSitePurchaseCapture({domain='',merchant='',structured=null}={}){
 const capture=captureObject(structured);
 if(!capture)return {site:'',orderLines:[],stats:{sourceItems:0,acceptedItems:0,skippedItems:0}};
 const site=siteFrom({domain,merchant,adapter:first(capture,['adapter','site','merchantKey','merchant_key'])});
 if(!site)return {site:'',orderLines:[],stats:{sourceItems:0,acceptedItems:0,skippedItems:0}};
 const rule=SITE_RULES[site];
 let items=[];
 for(const key of rule.arrays){
  const values=asArray(capture[key]);
  if(values.length){items=values;break;}
 }
 if(!items.length&&asObject(capture.item))items=[capture.item];
 if(items.length>MAX_ITEMS)throw Error('사이트 주문 캡처 상품이 40개를 넘어요.');
 const orderLines=[];let skippedItems=0;
 for(const item of items){
  const normalized=normalizeItem(item,rule);
  if(!normalized){skippedItems++;continue;}
  orderLines.push(normalized);
 }
 return {
  site,
  orderLines,
  stats:{sourceItems:items.length,acceptedItems:orderLines.length,skippedItems},
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
  const result=adaptSitePurchaseCapture({
   domain:input?.domain??input?.source_domain??'',
   merchant:input?.merchant??'',
   structured:input?.structured_data??input?.structuredData??input,
  });
  process.stdout.write(JSON.stringify(result)+'\n');
 }catch(error){
  console.error('PURCHASE_SITE_ADAPTER=HOLD; '+(error?.message||'입력을 처리하지 못했어요.'));
  process.exitCode=2;
 }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
