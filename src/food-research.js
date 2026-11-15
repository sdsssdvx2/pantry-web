import {SITE_CONFIG} from '../public/site-config.js';
const PUBLIC_DATA_ENDPOINT='https://api.data.go.kr/openapi/tn_pubr_public_nutri_info_api';
const PUBLIC_DATA_PAGE='https://www.data.go.kr/data/15100064/standard.do';
const OFF_API='https://world.openfoodfacts.org/api/v3/product/';
const OFF_PRODUCT='https://world.openfoodfacts.org/product/';
const MAX_PAGE_BYTES=3_500_000;
const MAX_PUBLIC_GRID_BYTES=4_500_000;
const MAX_PUBLIC_GRID_ROWS=500;
const PUBLIC_GRID_PAGE_ROWS=499;
const MAX_RETURN_CANDIDATES=40;
const USER_AGENT=SITE_CONFIG.userAgent;

const metricFields={
 energy:['enerc',1],
 sodium:['nat',1],
 carbs:['chocdf',1],
 sugars:['sugar',1],
 fat:['fatce',1],
 saturatedFat:['fasat',1],
 protein:['prot',1],
 fiber:['fibtg',1],
 cholesterol:['chole',1],
 transFat:['fatrn',1],
};
const offFields={
 energy:['energy-kcal_100g',1],
 sodium:['sodium_100g',1000],
 carbs:['carbohydrates_100g',1],
 sugars:['sugars_100g',1],
 fat:['fat_100g',1],
 saturatedFat:['saturated-fat_100g',1],
 protein:['proteins_100g',1],
 fiber:['fiber_100g',1],
 cholesterol:['cholesterol_100g',1000],
 transFat:['trans-fat_100g',1],
};

const clean=v=>String(v??'').trim();
const key=v=>clean(v).normalize('NFKC').toLowerCase().replace(/[^0-9a-z가-힣]+/g,'');
const number=v=>{
 if(typeof v==='number')return Number.isFinite(v)&&v>=0?v:null;
 const text=clean(v).replaceAll(',','');
 if(!text||/^(?:-|—|해당없음|미상|trace)$/i.test(text))return null;
 const match=text.match(/-?\d+(?:\.\d+)?/);
 if(!match)return null;
 const n=Number(match[0]);
 return Number.isFinite(n)&&n>=0?n:null;
};
const array=v=>Array.isArray(v)?v:v==null?[]:[v];

function rowsFromPayload(payload){
 const body=payload?.response?.body??payload?.body??payload;
 const items=body?.items?.item??body?.items??body?.data??payload?.items??payload?.data??[];
 return array(items).filter(row=>row&&typeof row==='object'&&!Array.isArray(row));
}

function basisFrom(value){
 const text=clean(value).replace(/㎖/g,'ml');
 const match=text.match(/(\d+(?:\.\d+)?)\s*(g|ml)\b/i);
 if(!match)return null;
 const amount=Number(match[1]);
 if(!Number.isFinite(amount)||amount<=0)return null;
 return {amount,unit:match[2].toLowerCase()==='ml'?'ml':'g',label:`${amount}${match[2].toLowerCase()==='ml'?'mL':'g'}`};
}

function metricsFrom(row,fields,basis){
 const metrics={};
 for(const [metric,[field,multiplier]] of Object.entries(fields)){
  const n=number(row?.[field]);
  if(n===null)continue;
  metrics[metric]={value:n*multiplier,amount:basis.amount,unit:basis.unit};
 }
 return metrics;
}

function identityNote(identity){
 return [
  identity.manufacturer&&`제조사 ${identity.manufacturer}`,
  identity.importer&&`수입업체 ${identity.importer}`,
  identity.company&&`업체 ${identity.company}`,
  identity.pack&&`식품중량 ${identity.pack}`,
  identity.reportNo&&`품목제조보고번호 ${identity.reportNo}`,
  identity.dataDate&&`데이터기준일 ${identity.dataDate}`,
 ].filter(Boolean).join(' · ');
}

function htmlCellText(value){
 return decodeHtml(String(value||'').replace(/<br\s*\/?\s*>/gi,' ').replace(/<[^>]+>/g,' '))
  .replace(/\s+/g,' ').trim();
}

export function parsePublicNutritionGrid(html){
 const rows=[];
 for(const match of String(html||'').matchAll(/<tr\b[^>]*class=["'][^"']*\bcontentsTr\b[^"']*["'][^>]*>([\s\S]*?)<\/tr>/gi)){
  if(rows.length>=MAX_PUBLIC_GRID_ROWS)break;
  const cells=[...match[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(item=>htmlCellText(item[1]));
  if(cells.length<45)continue;
  rows.push({
   foodCd:cells[0],foodNm:cells[1],dataCd:cells[2],typeNm:cells[3],enerc:cells[4],nutConSrtrQua:cells[5],
   prot:cells[7],fatce:cells[8],chocdf:cells[10],sugar:cells[11],fibtg:cells[12],nat:cells[17],
   chole:cells[26],fasat:cells[27],fatrn:cells[28],foodSize:cells[32],cooNm:cells[35],
   itemMnftrRptNo:cells[36],companyNm:cells[37],mkrNm:cells[38],imptrNm:cells[39],crtrYmd:cells[44],
  });
 }
 return rows;
}

// The national DB names raw ingredients "양파_생것" or "파_대파_생것", so a pantry
// item called "양파" never matched exactly and the raw entry ranked below
// processed products. "plain" = "<name>_생것"; "variety" = a named cultivar.
export function rawFormMatch(name,requestedName){
 const wanted=key(requestedName);
 if(!wanted)return '';
 const parts=clean(name).split('_').map(part=>key(part)).filter(Boolean);
 if(parts.length<2||parts.at(-1)!=='생것')return '';
 if(parts.length===2&&parts[0]===wanted)return 'plain';
 if(parts.length===3&&parts[1]===wanted)return 'plain';
 return parts.slice(0,-1).includes(wanted)?'variety':'';
}

export function normalizePublicNutritionRows(payload,requestedName=''){
 const rows=rowsFromPayload(payload);
 return rows.map((row,index)=>{
  const basis=basisFrom(row.nutConSrtrQua??row.NUT_CONSRV_VOL??row.nutritionReferenceAmount??'');
  if(!basis)return null;
  const name=clean(row.foodNm??row.FOOD_NM_KR??row.foodName);
  if(!name)return null;
  const identity={
   name,
   code:clean(row.foodCd??row.FOOD_CD),
   type:clean(row.typeNm??row.DB_CLASS_NM??row.foodTypeName),
   manufacturer:clean(row.mkrNm??row.MAKER_NM),
   importer:clean(row.imptrNm??row.IMPORTER_NM),
   company:clean(row.companyNm??row.COMPANY_NM),
   pack:clean(row.foodSize??row.FOOD_SIZE),
   reportNo:clean(row.itemMnftrRptNo??row.ITEM_REPORT_NO),
   origin:clean(row.cooNm??row.COO_NM),
   dataDate:clean(row.crtrYmd??row.UPDATE_DATE??row.CRT_YMD),
  };
  const metrics=metricsFrom(row,metricFields,basis);
  if(!Object.keys(metrics).length)return null;
  const productSpecific=(clean(row.dataCd??row.DATA_CD)==='P')||/가공식품/.test(identity.type);
  const rawForm=!productSpecific&&rawFormMatch(name,requestedName);
  return {
   id:`public:${identity.code||index}:${basis.label}`,
   provider:'public-nutrition',
   source:{name:'전국통합식품영양성분정보',url:PUBLIC_DATA_PAGE},
   identity,
   basis,
   metrics,
   kind:productSpecific?'product':'generic',
   exactName:key(name)===key(requestedName),
   ...(rawForm?{rawForm}:{}),
   confidence:key(name)===key(requestedName)?'exact-name':rawForm==='plain'?'raw-form':'candidate',
   note:identityNote(identity),
  };
 }).filter(Boolean);
}

export function normalizeOpenFoodFacts(payload,barcode=''){
 const product=payload?.product;
 if(!product||typeof product!=='object')return null;
 const requested=clean(barcode).replace(/\D/g,'');
 const code=clean(product.code||requested).replace(/\D/g,'');
 if(!/^\d{8,14}$/.test(code)||(requested&&code!==requested))return null;
 const basis={amount:100,unit:'g',label:'100g'};
 const nutriments=product.nutriments||{};
 const metrics=metricsFrom(nutriments,offFields,basis);
 if(!Object.keys(metrics).length)return null;
 const brand=Array.isArray(product.brands_tags)?clean(product.brands_tags[0]):clean(product.brands);
 const identity={
  name:clean(product.product_name_ko||product.product_name||product.generic_name_ko||product.generic_name),
  code,
  barcode:code,
  manufacturer:brand,
  pack:clean(product.quantity),
  ingredients:clean(product.ingredients_text_ko||product.ingredients_text),
  allergens:array(product.allergens_tags).map(clean).filter(Boolean).join(', '),
 };
 return {
  id:`off:${code}`,
  provider:'open-food-facts',
  source:{name:'Open Food Facts · 바코드 제품',url:OFF_PRODUCT+encodeURIComponent(code)},
  identity,
  basis,
  metrics,
  kind:'product',
  exactBarcode:true,
  confidence:'barcode',
  note:[brand&&`브랜드 ${brand}`,identity.pack&&`표시 용량 ${identity.pack}`].filter(Boolean).join(' · '),
 };
}

function productNodes(value,out=[]){
 if(!value||typeof value!=='object')return out;
 if(Array.isArray(value)){for(const item of value)productNodes(item,out);return out;}
 const type=array(value['@type']).map(clean);
 if(type.some(t=>t.toLowerCase()==='product'))out.push(value);
 if(value['@graph'])productNodes(value['@graph'],out);
 return out;
}

function parseJsonLd(html){
 const values=[];
 const re=/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
 for(const match of html.matchAll(re)){
  const raw=match[1].trim();
  if(!raw||raw.length>500_000)continue;
  try{values.push(JSON.parse(raw));}catch{}
 }
 return values;
}

function brandName(value){
 if(typeof value==='string')return clean(value);
 if(Array.isArray(value))return value.map(brandName).find(Boolean)||'';
 return clean(value?.name);
}

function additionalProperties(product){
 const map=new Map();
 for(const item of [...array(product?.additionalProperty),...array(product?.specification)]){
  if(!item||typeof item!=='object')continue;
  const name=clean(item.name||item.propertyID),value=clean(item.value);
  if(name&&value&&!map.has(name))map.set(name,value);
 }
 return map;
}

function nutritionBasisFromText(value){
 const text=clean(value).replace(/㎖/g,'ml');
 const patterns=[
  /(\d+(?:\.\d+)?)\s*(g|ml)\s*(?:당|기준)(?=$|[\s/(),·|])/i,
  /(?:영양성분(?:함량)?\s*기준량|1회\s*제공량|serving\s*size)\s*[:：]?\s*\(?\s*(\d+(?:\.\d+)?)\s*(g|ml)\b/i,
  /(?:1\s*(?:회|봉지|팩|개|병|캔)\s*당)\s*[:：]?\s*\(?\s*(\d+(?:\.\d+)?)\s*(g|ml)\b/i,
  /(?:총\s*내용량)\s*[:：]?\s*\(?\s*(\d+(?:\.\d+)?)\s*(g|ml)\b/i,
 ];
 for(const pattern of patterns){
  const match=text.match(pattern);
  if(!match)continue;
  const amount=Number(match[1]);
  if(!Number.isFinite(amount)||amount<=0)continue;
  const unit=match[2].toLowerCase()==='ml'?'ml':'g';
  return {amount,unit,label:`${amount}${unit==='ml'?'mL':'g'}`};
 }
 return null;
}

function boundedNutritionValue(value,targetUnit){
 const text=clean(value).replaceAll(',','').replace(/㎎/g,'mg').replace(/밀리그램/g,'mg').replace(/그램/g,'g');
 if(!text||/(?:미만|이하|less\s+than|<)/i.test(text))return null;
 const energy=text.match(/(\d+(?:\.\d+)?)\s*(kcal|calories?)\b/i);
 if(targetUnit==='kcal')return energy?Number(energy[1]):null;
 const mass=text.match(/(\d+(?:\.\d+)?)\s*(mg|g)\b/i);
 if(!mass)return null;
 const n=Number(mass[1]);
 if(!Number.isFinite(n)||n<0)return null;
 const unit=mass[2].toLowerCase();
 if(targetUnit==='mg')return unit==='g'?n*1000:n;
 if(targetUnit==='g')return unit==='mg'?n/1000:n;
 return null;
}

const pageNutritionSpecs={
 energy:{labels:[/^(?:열량|칼로리|calories?|energy)$/i],unit:'kcal'},
 sodium:{labels:[/^(?:나트륨|sodium(?:content)?)$/i],unit:'mg'},
 carbs:{labels:[/^(?:탄수화물|carbohydrate(?:content)?|carbohydrates?)$/i],unit:'g'},
 sugars:{labels:[/^(?:당류|sugar(?:content)?|sugars?)$/i],unit:'g'},
 fat:{labels:[/^(?:지방|총지방|fat(?:content)?|total\s*fat)$/i],unit:'g'},
 saturatedFat:{labels:[/^(?:포화지방(?:산)?|saturated\s*fat(?:content)?)$/i],unit:'g'},
 protein:{labels:[/^(?:단백질|protein(?:content)?)$/i],unit:'g'},
 fiber:{labels:[/^(?:식이섬유|fiber(?:content)?)$/i],unit:'g'},
 cholesterol:{labels:[/^(?:콜레스테롤|cholesterol(?:content)?)$/i],unit:'mg'},
 transFat:{labels:[/^(?:트랜스지방(?:산)?|trans\s*fat(?:content)?)$/i],unit:'g'},
};

function pageNutritionFromText(text){
 const source=clean(text);
 const basis=nutritionBasisFromText(source);
 if(!basis)return null;
 const metrics={};
 const labelText={
  energy:'(?:열량|칼로리|calories?|energy)',
  sodium:'(?:나트륨|sodium(?:content)?)',
  carbs:'(?:탄수화물|carbohydrate(?:content)?|carbohydrates?)',
  sugars:'(?:당류|sugar(?:content)?|sugars?)',
  fat:'(?:^|[\\s·|,;])(?:지방|총지방|fat(?:content)?|total\\s*fat)',
  saturatedFat:'(?:포화지방(?:산)?|saturated\\s*fat(?:content)?)',
  protein:'(?:단백질|protein(?:content)?)',
  fiber:'(?:식이섬유|fiber(?:content)?)',
  cholesterol:'(?:콜레스테롤|cholesterol(?:content)?)',
  transFat:'(?:트랜스지방(?:산)?|trans\\s*fat(?:content)?)',
 };
 for(const [metric,spec] of Object.entries(pageNutritionSpecs)){
  const re=new RegExp(labelText[metric]+'\\s*[:：]?\\s*(\\d+(?:[,.]\\d+)*)\\s*(kcal|calories?|mg|g)\\b','i');
  const match=source.match(re);
  if(!match)continue;
  const around=source.slice((match.index||0),Math.min(source.length,(match.index||0)+match[0].length+8));
  if(/(?:미만|이하|less\\s+than|<)/i.test(around))continue;
  const value=boundedNutritionValue(match[1]+match[2],spec.unit);
  if(value!==null)metrics[metric]={value,amount:basis.amount,unit:basis.unit};
 }
 return Object.keys(metrics).length?{basis,metrics}:null;
}

function pageNutritionFromProduct(product,fallbackText=''){
 const props=additionalProperties(product);
 const direct=product?.nutrition&&typeof product.nutrition==='object'&&!Array.isArray(product.nutrition)?product.nutrition:null;
 const basisProp=[...props].find(([name])=>/(?:영양성분.*기준량|1회.*제공량|serving\s*size)/i.test(name))?.[1]||'';
 const basis=clean(direct?.servingSize)?basisFrom(direct.servingSize)
  :basisProp?basisFrom(basisProp)
  :nutritionBasisFromText(fallbackText);
 const pairs=[];
 for(const [name,value] of props){
  if(/(?:영양|열량|칼로리|나트륨|탄수화물|당류|지방|단백질|식이섬유|콜레스테롤|serving|calorie|sodium|carbohydrate|sugar|fat|protein|fiber|cholesterol)/i.test(name))
   pairs.push(`${name}: ${value}`);
 }
 const nutritionText=[pairs.join(' · '),fallbackText].filter(Boolean).join(' · ');
 if(!basis)return {nutritionText,...(pageNutritionFromText(nutritionText)||{})};
 const metrics={};
 const directFields={
  energy:'calories',sodium:'sodiumContent',carbs:'carbohydrateContent',sugars:'sugarContent',fat:'fatContent',
  saturatedFat:'saturatedFatContent',protein:'proteinContent',fiber:'fiberContent',cholesterol:'cholesterolContent',transFat:'transFatContent',
 };
 for(const [metric,spec] of Object.entries(pageNutritionSpecs)){
  let raw=direct?.[directFields[metric]];
  if(raw==null){
   for(const [name,value] of props)if(spec.labels.some(pattern=>pattern.test(name))){raw=value;break;}
  }
  const value=boundedNutritionValue(raw,spec.unit);
  if(value!==null)metrics[metric]={value,amount:basis.amount,unit:basis.unit};
 }
 if(Object.keys(metrics).length)return {nutritionText,basis,metrics};
 return {nutritionText,...(pageNutritionFromText(nutritionText)||{})};
}

function pageNutritionCandidate(page){
 const basis=page?.nutritionBasis,metrics=page?.nutritionMetrics||{};
 if(!basis||Object.keys(metrics).length<2)return null;
 return {
  id:'product-page:nutrition',
  provider:'product-page-nutrition',
  source:{name:'공개 상품 페이지 · 표시 영양정보',url:page.url||''},
  identity:{
   name:clean(page.name),manufacturer:clean(page.brand||page.manufacturer),barcode:clean(page.barcode),
   pack:clean(page.pack),ingredients:clean(page.ingredients),allergens:clean(page.allergens),
   storage:clean(page.storage),shelfLife:clean(page.shelfLife),
  },
  basis,metrics,kind:'product',exactUrl:true,confidence:'product-page',
  autoEligible:!page.variantAmbiguous,
  note:page.variantAmbiguous
   ?'여러 옵션/제품 가능성이 있는 공개 상품 페이지의 표시 영양정보 · 옵션 확인 후 수동 적용'
   :'사용자가 지정한 공개 상품 페이지의 구조화/표시 영양정보 · 저장 전 제품과 기준량 확인',
 };
}

function quantityText(value){
 if(value==null)return '';
 if(typeof value==='string'||typeof value==='number')return clean(value);
 if(Array.isArray(value))return value.map(quantityText).find(Boolean)||'';
 if(typeof value==='object'){
  const amount=clean(value.value??value.maxValue??value.minValue);
  const unit=clean(value.unitText||value.unitCode);
  if(amount)return [amount,unit].filter(Boolean).join('');
  return clean(value.name);
 }
 return '';
}

function labeledText(text,labelPattern,max=700){
 const match=clean(text).match(new RegExp(`(?:${labelPattern})\\s*[:：]\\s*([^\\n|•]{2,${max}})`,'i'));
 return clean(match?.[1]);
}

function decodeHtml(value){
 return String(value||'')
  .replace(/&nbsp;|&#160;/gi,' ')
  .replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'")
  .replace(/&lt;/gi,'<').replace(/&gt;/gi,'>');
}

function visibleText(html){
 return decodeHtml(String(html||'')
  .replace(/<(?:script|style|noscript)\b[^>]*>[\s\S]*?<\/(?:script|style|noscript)>/gi,' ')
  .replace(/<(?:br|\/p|\/div|\/li|\/tr|\/td|\/th|\/dt|\/dd|\/section|\/article|\/h[1-6])\b[^>]*>/gi,'\n')
  .replace(/<[^>]+>/g,' '))
  .split(/\r?\n/).map(line=>line.replace(/\s+/g,' ').trim()).filter(Boolean);
}

const noticeLabels=[
 '식품의 유형',
 '생산자 및 소재지(수입품의 경우 생산자, 수입자 및 제조국)','생산자 및 소재지',
 '제조연월일, 유통기한(소비기한) 또는 품질유지기한','제조연월일, 소비기한(유통기한) 또는 품질유지기한',
 '제조연월일','유통기한','소비기한','품질유지기한',
 '포장단위별 내용물의 용량(중량), 수량, 크기','포장단위별 내용물의 용량(중량), 수량','내용물의 용량',
 '원재료명 및 함량','원재료 및 함량','원재료명',
 '영양성분표시','영양성분(영양정보)','영양성분','알레르기정보','알레르기 유발물질 함유',
 '식품 등의 표시, 광고에 관한 법률에 따른 소비자안전을 위한 주의사항','보관방법','보관조건',
 'A/S 책임자 및 소비자상담 관련 전화번호'
];
const noticeKey=value=>clean(value).replace(/\s+/g,'').replace(/[：:]/g,'');
function noticeValue(lines,labelPatterns){
 const keys=labelPatterns.map(noticeKey);
 for(let i=0;i<lines.length;i++){
  const line=lines[i],compact=noticeKey(line);
  const key=keys.find(value=>compact===value||compact.startsWith(value));
  if(!key)continue;
  const original=labelPatterns[keys.indexOf(key)];
  const rawTail=line.slice(Math.min(line.length,original.length));
  const sameLine=rawTail.replace(/^\s*[:：]?\s*/,'').trim();
  const looksLikeLabelContinuation=/^(?:\(|[,，]|및(?:\s|$)|또는(?:\s|$))/i.test(sameLine);
  if(sameLine&&!looksLikeLabelContinuation&&noticeKey(sameLine)!==key)return sameLine.slice(0,1500);
  for(let j=i+1;j<Math.min(lines.length,i+4);j++){
   if(noticeLabels.some(label=>noticeKey(lines[j]).startsWith(noticeKey(label))))break;
   if(lines[j])return lines[j].slice(0,1500);
  }
 }
 return '';
}
function concreteNoticeValue(value){
 const text=clean(value);
 if(!text)return '';
 if(/^(?:상품(?:설명|상세)(?:\s*및\s*상품이미지)?\s*참조|상품설명\s*및\s*상품이미지\s*참조|상세정보\s*참조|상품페이지\s*참조)$/i.test(text))return '';
 return text;
}

function visibleLabeledValue(lines,labels,max=1500){
 for(const line of lines){
  const text=clean(line).replace(/^\d+[.)]?\s*/,'');
  for(const label of labels){
   if(!text.startsWith(label))continue;
   const rest=text.slice(label.length);
   if(!/^\s*[:：]/.test(rest))continue;
   const value=concreteNoticeValue(rest.replace(/^\s*[:：]\s*/,''));
   if(value)return value.slice(0,max);
  }
 }
 return '';
}

function storageCueValue(lines){
 for(let i=0;i<lines.length;i++){
  if(!/^(?:이렇게\s*)?보관(?:하세요|방법)?$/i.test(clean(lines[i])))continue;
  for(let j=i+1;j<Math.min(lines.length,i+4);j++){
   const value=clean(lines[j]).replace(/^\d+[.)]?\s*/,'');
   if(/냉장|냉동|실온|보관|직사광선|서늘/.test(value))return value.slice(0,1200);
  }
 }
 return '';
}

function genericPageEvidence(html,url){
 const lines=visibleText(html);
 const metaTitle=clean(String(html||'').match(/<meta\b[^>]*(?:property|name)=["']og:title["'][^>]*content=["']([^"']+)/i)?.[1]
  ||String(html||'').match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g,' '));
 const manufacturer=concreteNoticeValue(noticeValue(lines,['생산자 및 소재지(수입품의 경우 생산자, 수입자 및 제조국)','생산자 및 소재지']));
 const pack=concreteNoticeValue(noticeValue(lines,['포장단위별 내용물의 용량(중량), 수량, 크기','포장단위별 내용물의 용량(중량), 수량','내용물의 용량']))
  ||visibleLabeledValue(lines,['중량','내용량','용량'],500);
 const ingredients=concreteNoticeValue(noticeValue(lines,['원재료명 및 함량','원재료 및 함량','원재료명']));
 const allergens=concreteNoticeValue(noticeValue(lines,['알레르기정보','알레르기 유발물질 함유']));
 const shelfLife=concreteNoticeValue(noticeValue(lines,['제조연월일, 유통기한(소비기한) 또는 품질유지기한','제조연월일, 소비기한(유통기한) 또는 품질유지기한','소비기한','유통기한','품질유지기한']));
 const storageDirect=concreteNoticeValue(noticeValue(lines,['보관방법','보관조건']));
 const safety=concreteNoticeValue(noticeValue(lines,['식품 등의 표시, 광고에 관한 법률에 따른 소비자안전을 위한 주의사항']));
 const storage=storageDirect||storageCueValue(lines)||(/보관|냉장|냉동|실온|직사광선|서늘/.test(safety)?safety:'');
 const nutritionText=concreteNoticeValue(noticeValue(lines,['영양성분표시','영양성분(영양정보)','영양성분']));
 const nutrition=pageNutritionFromText(nutritionText);
 const variantAmbiguous=/(?:택\s*1|옵션\s*선택|\d+\s*종(?:\s|$)|여러\s*종)/i.test(metaTitle);
 return {
  structured:false,url,name:metaTitle,brand:'',barcode:'',sku:'',pack,ingredients,allergens,storage,shelfLife,
  manufacturer,nutritionText,
  ...(variantAmbiguous?{variantAmbiguous:true}:{}),
  ...(nutrition?{nutritionBasis:nutrition.basis,nutritionMetrics:nutrition.metrics}:{})
 };
}

function pageProductEvidence(product,url){
 const props=additionalProperties(product);
 const prop=(pattern)=>{
  for(const [name,value] of props)if(pattern.test(name))return value;
  return '';
 };
 const description=clean(product.description);
 const barcode=clean(product.gtin14||product.gtin13||product.gtin12||product.gtin8||product.gtin).replace(/\D/g,'');
 const ingredients=prop(/원재료|ingredients?/i)||labeledText(description,'원재료(?:명)?|ingredients?',600);
 const storage=prop(/보관|storage/i)||labeledText(description,'보관(?:방법|조건)?|storage(?: instructions?)?',500);
 const shelfLife=prop(/소비기한|유통기한|품질유지기한|shelf\s*life|expir/i)||labeledText(description,'소비기한|유통기한|품질유지기한|shelf\\s*life|expir(?:y|ation)',500);
 const allergens=prop(/알레르기|allergen/i)||labeledText(description,'알레르기(?:정보)?|allergens?',500);
 const pack=quantityText(product.weight||product.size)||prop(/용량|중량|규격|quantity|weight/i);
 const nutrition=pageNutritionFromProduct(product,prop(/영양성분|영양정보|nutrition/i));
 return {
  url,
  name:clean(product.name),
  brand:brandName(product.brand),
  barcode:/^\d{8,14}$/.test(barcode)?barcode:'',
  sku:clean(product.sku||product.mpn||product.productID),
  pack,
  ingredients,
  storage,
  shelfLife,
  allergens,
  nutritionText:nutrition.nutritionText||'',
  ...(nutrition.basis?{nutritionBasis:nutrition.basis,nutritionMetrics:nutrition.metrics}:{})
 };
}

export function extractProductPageEvidence(html,url=''){
 const generic=genericPageEvidence(html,url);
 const products=parseJsonLd(String(html||'')).flatMap(value=>productNodes(value));
 if(products.length){
  const ranked=products.map(product=>pageProductEvidence(product,url)).sort((a,b)=>
   Number(!!b.barcode)-Number(!!a.barcode)||Number(!!b.name)-Number(!!a.name));
  const distinctNames=new Set(ranked.map(item=>key(item.name)).filter(Boolean));
  const product=ranked[0];
  return {
   ...generic,...product,structured:true,
   manufacturer:product.manufacturer||generic.manufacturer||'',
   pack:product.pack||generic.pack||'',ingredients:product.ingredients||generic.ingredients||'',
   allergens:product.allergens||generic.allergens||'',storage:product.storage||generic.storage||'',
   shelfLife:product.shelfLife||generic.shelfLife||'',nutritionText:product.nutritionText||generic.nutritionText||'',
   nutritionBasis:product.nutritionBasis||generic.nutritionBasis||null,
   nutritionMetrics:product.nutritionMetrics||generic.nutritionMetrics||{},
   ...(generic.variantAmbiguous||distinctNames.size>1?{variantAmbiguous:true}:{}),
  };
 }
 return generic.name||generic.pack||generic.ingredients||generic.shelfLife||generic.nutritionText?generic:null;
}

function unsafeHost(hostname){
 const host=hostname.toLowerCase().replace(/^\[|\]$/g,'');
 if(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')||host.endsWith('.lan')||host.endsWith('.home'))return true;
 if(/^127\./.test(host)||/^10\./.test(host)||/^169\.254\./.test(host)||/^0\./.test(host))return true;
 const v4=host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
 if(v4){
  const nums=v4.slice(1).map(Number);
  if(nums.some(n=>n>255))return true;
  if(nums[0]===192&&nums[1]===168)return true;
  if(nums[0]===172&&nums[1]>=16&&nums[1]<=31)return true;
 }
 if(host==='::1'||host.startsWith('fc')||host.startsWith('fd')||host.startsWith('fe80:'))return true;
 return false;
}

export function normalizeProductUrl(value){
 if(!clean(value))return '';
 let url;
 try{url=new URL(clean(value));}catch{throw Error('상품 링크 형식을 확인해 주세요.');}
 if(url.protocol==='http:')url.protocol='https:';
 if(url.protocol!=='https:'||url.username||url.password||unsafeHost(url.hostname))throw Error('공개 https 상품 링크만 사용할 수 있어요.');
 if(url.port&&url.port!=='443')throw Error('상품 링크의 포트를 확인해 주세요.');
 const path=(url.pathname||'/').toLowerCase();
 if(/(?:^|\/)(?:login|logout|signin|sign-in|account|mypage|my-page|checkout|cart|orders?|purchases?|payments?|pay|receipts?)(?:\/|$)/i.test(path))
  throw Error('주문·결제·로그인 페이지는 자동 분석하지 않아요. 공개 상품 상세 링크를 사용해 주세요.');
 const sensitiveQuery=/^(?:order(?:id|no|number)?|payment|payid|receipt|session|token|auth|member|customer|address)$/i;
 for(const key of url.searchParams.keys())if(sensitiveQuery.test(key))
  throw Error('주문·결제 식별정보가 포함된 링크는 자동 분석하지 않아요. 공개 상품 상세 링크를 사용해 주세요.');
 url.hash='';
 return url.toString();
}

async function timedFetch(fetchImpl,url,options={},timeoutMs=5000){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{return await fetchImpl(url,{...options,signal:controller.signal});}
 finally{clearTimeout(timer);}
}

async function fetchProductPage(fetchImpl,sourceUrl){
 let url=normalizeProductUrl(sourceUrl);
 for(let redirects=0;redirects<3;redirects++){
  const response=await timedFetch(fetchImpl,url,{redirect:'manual',headers:{'User-Agent':USER_AGENT,'Accept':'text/html,application/xhtml+xml'}},5000);
  if(response.status>=300&&response.status<400){
   const location=response.headers.get('location');
   if(!location)throw Error('상품 페이지 이동 주소를 확인하지 못했어요.');
   url=normalizeProductUrl(new URL(location,url).toString());
   continue;
  }
  if(!response.ok)throw Error(`상품 페이지를 읽지 못했어요 (HTTP ${response.status}).`);
  const type=clean(response.headers.get('content-type')).toLowerCase();
  if(type&&!type.includes('text/html')&&!type.includes('application/xhtml+xml'))throw Error('HTML 상품 페이지만 자동 분석할 수 있어요.');
  const declared=Number(response.headers.get('content-length')||0);
  if(declared>MAX_PAGE_BYTES)throw Error('상품 페이지가 자동 분석 크기 제한을 넘어요.');
  const html=await response.text();
  if(html.length>MAX_PAGE_BYTES)throw Error('상품 페이지가 자동 분석 크기 제한을 넘어요.');
  return extractProductPageEvidence(html,url);
 }
 throw Error('상품 페이지 이동 횟수가 너무 많아요.');
}

function serviceKey(value){
 const raw=clean(value);
 if(!raw)return '';
 if(raw.includes('%')){try{return decodeURIComponent(raw);}catch{}}
 return raw;
}

async function fetchPublicNutrition(fetchImpl,name,apiKey){
 const url=new URL(PUBLIC_DATA_ENDPOINT);
 url.searchParams.set('serviceKey',serviceKey(apiKey));
 url.searchParams.set('pageNo','1');
 url.searchParams.set('numOfRows','100');
 url.searchParams.set('type','json');
 url.searchParams.set('foodNm',name);
 const response=await timedFetch(fetchImpl,url,{headers:{'Accept':'application/json'}},5500);
 if(!response.ok)throw Error(`공공 영양 API HTTP ${response.status}`);
 const payload=await response.json();
 const resultCode=clean(payload?.response?.header?.resultCode);
 if(resultCode&&resultCode!=='00')throw Error(clean(payload?.response?.header?.resultMsg)||`공공 영양 API 오류 ${resultCode}`);
 return normalizePublicNutritionRows(payload,name);
}

async function fetchPublicNutritionGrid(fetchImpl,name,requestedName=name){
 const url=new URL(PUBLIC_DATA_PAGE);
 url.searchParams.set('searchKeyword1',name);
 url.searchParams.set('colCondition','FOOD_NM');
 const response=await timedFetch(fetchImpl,url,{
  headers:{'User-Agent':USER_AGENT,'Accept':'text/html,application/xhtml+xml'},
  cf:{cacheTtl:21600,cacheEverything:true},
 },6500);
 if(!response.ok)throw Error(`공공 영양 공개 그리드 HTTP ${response.status}`);
 const type=clean(response.headers.get('content-type')).toLowerCase();
 if(type&&!type.includes('text/html')&&!type.includes('application/xhtml+xml'))throw Error('공공 영양 공개 그리드 응답 형식 오류');
 const declared=Number(response.headers.get('content-length')||0);
 if(declared>MAX_PUBLIC_GRID_BYTES)throw Error('공공 영양 공개 그리드 응답이 너무 커요.');
 const html=await response.text();
 if(html.length>MAX_PUBLIC_GRID_BYTES)throw Error('공공 영양 공개 그리드 응답이 너무 커요.');
 const rows=parsePublicNutritionGrid(html);
 const normalized=normalizePublicNutritionRows({items:rows},requestedName);
 // The public grid returns only the first page (499 rows, sorted by name) and
 // ignores pageIndex, so for "사과"/"우유" processed products fill the page.
 normalized.truncated=rows.length>=PUBLIC_GRID_PAGE_ROWS;
 return normalized;
}

// Live check 2026-11-15: "사과" → 499 processed rows, no "사과_생것"; a second
// query for "<name>_생것" returns exactly the raw entry. Only when the first
// page was full and had no exact or raw-form match: at most one extra request.
async function fetchPublicNutritionGridWithRaw(fetchImpl,name){
 const rows=await fetchPublicNutritionGrid(fetchImpl,name);
 if(!rows.truncated||rows.some(item=>item.exactName||item.rawForm)||/_생것$/.test(name))return rows;
 let raw=[];
 try{raw=await fetchPublicNutritionGrid(fetchImpl,`${name}_생것`,name);}catch{return rows;}
 const seen=new Set(raw.map(item=>item.id));
 const merged=[...raw,...rows.filter(item=>!seen.has(item.id))];
 merged.truncated=true;
 merged.rawFollowUp=raw.length;
 return merged;
}

async function fetchOpenFoodFacts(fetchImpl,barcode){
 const fields='code,product_name,product_name_ko,generic_name,generic_name_ko,brands,brands_tags,quantity,nutriments,ingredients_text,ingredients_text_ko,allergens_tags';
 const url=OFF_API+encodeURIComponent(barcode)+'.json?fields='+encodeURIComponent(fields);
 const response=await timedFetch(fetchImpl,url,{headers:{'User-Agent':USER_AGENT,'Accept':'application/json'}},4500);
 if(response.status===404)return null;
 if(!response.ok)throw Error(`Open Food Facts HTTP ${response.status}`);
 return normalizeOpenFoodFacts(await response.json(),barcode);
}

const sourceStatus=(enabled,ok,error='')=>({enabled,ok,...(error?{error}: {})});

function candidateRank(item){
 if(item?.provider==='open-food-facts'&&item?.exactBarcode)return 0;
 if(item?.provider==='product-page-nutrition'&&item?.exactUrl)return 1;
 if(item?.provider==='public-nutrition'&&item?.exactName&&item?.kind==='generic')return 2;
 if(item?.provider==='public-nutrition'&&item?.rawForm==='plain')return 2.5;
 if(item?.provider==='public-nutrition'&&item?.rawForm==='variety')return 3;
 if(item?.provider==='public-nutrition'&&item?.exactName)return 3.5;
 if(item?.exactName)return 4;
 return 5;
}

function presentCandidates(items){
 return items.map((item,index)=>({item,index}))
  .sort((a,b)=>candidateRank(a.item)-candidateRank(b.item)
   ||Number(b.item?.basis?.unit==='g')-Number(a.item?.basis?.unit==='g')
   ||key(a.item?.identity?.name).length-key(b.item?.identity?.name).length
   ||a.index-b.index)
  .slice(0,MAX_RETURN_CANDIDATES).map(entry=>entry.item);
}

export async function researchFood(input,env={},fetchImpl=fetch){
 const originalName=clean(input?.name).slice(0,150);
 const originalBarcode=clean(input?.barcode).replace(/\D/g,'').slice(0,18);
 if(originalBarcode&&!/^\d{8,14}$/.test(originalBarcode))throw Error('바코드는 8~14자리 숫자로 입력해 주세요.');
 const requestedUrl=normalizeProductUrl(input?.url||'');
 if(!originalName&&!originalBarcode&&!requestedUrl)throw Error('식재료 이름, 바코드 또는 상품 링크 중 하나가 필요해요.');

 let page=null,pageError='';
 if(requestedUrl){
  try{page=await fetchProductPage(fetchImpl,requestedUrl);}
  catch(error){pageError=error?.message||'상품 페이지 자동 분석에 실패했어요.';}
 }
 const effectiveName=clean((page?.structured&&page?.name)||originalName||page?.name).slice(0,150);
 const effectiveBarcode=clean(originalBarcode||page?.barcode).replace(/\D/g,'');
 const candidates=[];
 const sources={productPage:sourceStatus(!!requestedUrl,!!page,pageError)};
 const pageCandidate=pageNutritionCandidate(page);
 if(pageCandidate)candidates.push(pageCandidate);

 if(effectiveBarcode&&/^\d{8,14}$/.test(effectiveBarcode)){
  try{
   const item=await fetchOpenFoodFacts(fetchImpl,effectiveBarcode);
   if(item)candidates.push(item);
   sources.openFoodFacts=sourceStatus(true,true,item?'':'바코드 제품 없음');
  }catch(error){sources.openFoodFacts=sourceStatus(true,false,error?.message||'조회 실패');}
 }else sources.openFoodFacts=sourceStatus(false,false);

 const apiKey=serviceKey(env.PUBLIC_DATA_SERVICE_KEY);
 if(effectiveName){
  if(apiKey){
   try{
    const rows=await fetchPublicNutrition(fetchImpl,effectiveName,apiKey);
    candidates.push(...rows);
    sources.publicNutrition={...sourceStatus(true,true,rows.length?'':'검색 결과 없음'),mode:'openapi'};
   }catch(apiError){
    try{
     const rows=await fetchPublicNutritionGridWithRaw(fetchImpl,effectiveName);
     candidates.push(...rows);
     sources.publicNutrition={
      ...sourceStatus(true,true,rows.length?'OpenAPI 실패 후 공식 공개 그리드 사용':'OpenAPI 실패 후 공개 그리드 검색 결과 없음'),
      mode:'public-grid-after-openapi',
     };
    }catch(gridError){
     sources.publicNutrition={
      ...sourceStatus(true,false,gridError?.message||apiError?.message||'조회 실패'),
      mode:'openapi-and-public-grid-failed',
     };
    }
   }
  }else{
   try{
    const rows=await fetchPublicNutritionGridWithRaw(fetchImpl,effectiveName);
    candidates.push(...rows);
    sources.publicNutrition={...sourceStatus(true,true,rows.length?'':'검색 결과 없음'),mode:'public-grid'};
   }catch(error){
    sources.publicNutrition={...sourceStatus(true,false,error?.message||'조회 실패'),mode:'public-grid'};
   }
  }
 }else sources.publicNutrition=sourceStatus(false,false);

 const exactPublic=candidates.filter(item=>item.provider==='public-nutrition'&&item.exactName);
 const exactGeneric=exactPublic.filter(item=>item.kind==='generic');
 let autoStageId='';
 const off=candidates.find(item=>item.provider==='open-food-facts'&&item.exactBarcode&&Object.keys(item.metrics).length>=2);
 const pageNutrition=candidates.find(item=>item.provider==='product-page-nutrition'&&item.exactUrl&&item.autoEligible&&Object.keys(item.metrics).length>=2);
 if(off)autoStageId=off.id;
 else if(pageNutrition)autoStageId=pageNutrition.id;
 else if(exactGeneric.length===1&&Object.keys(exactGeneric[0].metrics).length>=2)autoStageId=exactGeneric[0].id;
 else if(!exactGeneric.length){
  // Same food in the same raw state, e.g. pantry "양파" ↔ DB "양파_생것".
  // Duplicate rows with identical values (the DB repeats some entries) count once.
  const plain=candidates.filter(item=>item.provider==='public-nutrition'&&item.rawForm==='plain'&&item.basis?.unit==='g'&&Object.keys(item.metrics).length>=2);
  const distinct=new Set(plain.map(item=>JSON.stringify(item.metrics)));
  if(plain.length&&distinct.size===1)autoStageId=plain[0].id;
 }

 const candidateCountTotal=candidates.length;
 const visibleCandidates=presentCandidates(candidates);
 return {
  query:{name:originalName,barcode:originalBarcode,url:requestedUrl,effectiveName,effectiveBarcode},
  page,
  sources,
  candidates:visibleCandidates,
  candidateCountTotal,
  autoStageId,
 };
}

export async function handleFoodResearch(request,env,fetchImpl=fetch){
 if(request.method!=='GET')return new Response(JSON.stringify({error:'method_not_allowed'}),{status:405,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
 const url=new URL(request.url);
 try{
  const data=await researchFood({name:url.searchParams.get('name'),barcode:url.searchParams.get('barcode'),url:url.searchParams.get('url')},env,fetchImpl);
  return new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
 }catch(error){
  return new Response(JSON.stringify({error:'invalid_request',message:error?.message||'자동 조사 요청을 확인해 주세요.'}),{status:400,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
 }
}
