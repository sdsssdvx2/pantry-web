import {sameString} from './auth-service.js';
import {normalizeProductUrl,researchFood} from './food-research.js';

const MAX_BODY_BYTES=64_000;
const SENSITIVE_KEY=/(?:^|_)(?:order(?:id|no|number)?|payment|refund|shipping|address|phone|mobile|email|card|account|customer|recipient|cookie|session|token|auth|personalcustoms|customsnumber)(?:_|$)/i;
const NUTRITION_METRICS={
 energyKcal:'energy',
 sodiumMg:'sodium',
 carbsG:'carbs',
 sugarsG:'sugars',
 fatG:'fat',
 saturatedFatG:'saturatedFat',
 proteinG:'protein',
 fiberG:'fiber',
 cholesterolMg:'cholesterol',
 transFatG:'transFat',
};
const MAX_NUTRIENT_VALUE=1_000_000;
const MAX_BASIS_AMOUNT=100_000;
const MIN_SERVICE_TOKEN_CHARS=32;
const MAX_INBOX_PENDING=200;
const MAX_INBOX_RETURN=50;

export function isFoodIntakeServiceRequest(request,env={}){
 const expected=String(env.PURCHASE_INTAKE_TOKEN||'');
 if(expected.length<MIN_SERVICE_TOKEN_CHARS)return false;
 const header=String(request?.headers?.get?.('authorization')||'');
 const match=header.match(/^Bearer ([A-Za-z0-9._~-]{32,512})$/);
 return !!match&&sameString(match[1],expected);
}

const clean=(value,max=1000)=>String(value??'').normalize('NFKC').trim().slice(0,max);
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object||{},key);

function rejectSensitiveKeys(value,path='root'){
 if(!value||typeof value!=='object')return;
 if(Array.isArray(value)){for(let i=0;i<value.length;i++)rejectSensitiveKeys(value[i],path+'['+i+']');return;}
 for(const [key,item] of Object.entries(value)){
  if(SENSITIVE_KEY.test(key))throw Error('식재료 intake에는 주문·결제·배송·개인정보 필드를 포함할 수 없어요.');
  rejectSensitiveKeys(item,path+'.'+key);
 }
}

function onlyKeys(object,allowed,label){
 for(const key of Object.keys(object||{}))if(!allowed.has(key))throw Error(label+'에 허용되지 않은 필드가 있어요: '+key);
}

function isoDate(value){
 const text=clean(value,80);
 if(!text)return '';
 const date=new Date(text);
 if(!Number.isFinite(date.getTime()))throw Error('capturedAt 날짜를 확인해 주세요.');
 return date.toISOString();
}

function sha256(value){
 const text=clean(value,80).toLowerCase();
 if(!text)return '';
 if(!/^[a-f0-9]{64}$/.test(text))throw Error('contentSha256 형식을 확인해 주세요.');
 return text;
}

function barcode(value){
 const digits=clean(value,24).replace(/\D/g,'');
 if(!digits)return '';
 if(!/^\d{8,14}$/.test(digits))throw Error('상품 바코드는 8~14자리 숫자여야 해요.');
 return digits;
}

function positiveNumber(value){
 if(value==null||String(value).trim()==='')return null;
 const n=Number(value);
 if(!Number.isFinite(n)||n<=0)return null;
 return n;
}

function nutritionNumber(value,label){
 if(value==null||String(value).trim()==='')return null;
 const n=Number(value);
 if(!Number.isFinite(n)||n<0||n>MAX_NUTRIENT_VALUE)throw Error(label+' 영양 수치를 확인해 주세요.');
 return n;
}

function normalizeIntakeNutrition(value){
 if(value==null)return null;
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('상품 nutrition 형식을 확인해 주세요.');
 const allowed=new Set(['basisAmount','basisUnit',...Object.keys(NUTRITION_METRICS)]);
 onlyKeys(value,allowed,'product.nutrition');
 const basisAmount=positiveNumber(value.basisAmount);
 if(!basisAmount||basisAmount>MAX_BASIS_AMOUNT)throw Error('상품 nutrition 기준량을 확인해 주세요.');
 const basisUnit=clean(value.basisUnit,10).toLowerCase();
 if(!['g','ml'].includes(basisUnit))throw Error('상품 nutrition 기준 단위는 g 또는 ml여야 해요.');
 const out={basisAmount,basisUnit};
 let count=0;
 for(const field of Object.keys(NUTRITION_METRICS)){
  const n=nutritionNumber(value[field],field);
  if(n===null)continue;
  out[field]=n;count++;
 }
 if(!count)throw Error('상품 nutrition에는 하나 이상의 영양 수치가 필요해요.');
 return out;
}

export function normalizeFoodIntakeEvent(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('식재료 intake 형식을 확인해 주세요.');
 rejectSensitiveKeys(input);
 onlyKeys(input,new Set(['schemaVersion','eventId','capturedAt','source','product','quantity']),'식재료 intake');
 if(Number(input.schemaVersion)!==1)throw Error('지원하는 식재료 intake schemaVersion은 1이에요.');

 const source=input.source&&typeof input.source==='object'&&!Array.isArray(input.source)?input.source:{};
 const product=input.product&&typeof input.product==='object'&&!Array.isArray(input.product)?input.product:{};
 const quantity=input.quantity&&typeof input.quantity==='object'&&!Array.isArray(input.quantity)?input.quantity:{};
 onlyKeys(source,new Set(['merchant','domain','archiveArtifactId','contentSha256']),'source');
 onlyKeys(product,new Set(['name','brand','pack','barcode','productUrl','ingredients','allergens','storage','shelfLife','nutrition']),'product');
 onlyKeys(quantity,new Set(['value','unit']),'quantity');

 const name=clean(product.name,180);
 if(!name)throw Error('상품명이 필요해요.');
 const productUrl=product.productUrl?normalizeProductUrl(product.productUrl):'';
 const unit=clean(quantity.unit,30);
 const q=positiveNumber(quantity.value);
 return {
  schemaVersion:1,
  eventId:clean(input.eventId,160),
  capturedAt:isoDate(input.capturedAt),
  source:{
   merchant:clean(source.merchant,120),
   domain:clean(source.domain,180).toLowerCase(),
   archiveArtifactId:clean(source.archiveArtifactId,200),
   contentSha256:sha256(source.contentSha256),
  },
  product:{
   name,
   brand:clean(product.brand,180),
   pack:clean(product.pack,120),
   barcode:barcode(product.barcode),
   productUrl,
   ingredients:clean(product.ingredients,1800),
   allergens:clean(product.allergens,1200),
   storage:clean(product.storage,1200),
   shelfLife:clean(product.shelfLife,1200),
   ...(product.nutrition!=null?{nutrition:normalizeIntakeNutrition(product.nutrition)}:{}),
  },
  quantity:q?{value:q,unit}:null,
 };
}

export function validateFoodIntakeServiceProvenance(event){
 const value=normalizeFoodIntakeEvent(event);
 if(!value.eventId)throw Error('서비스 intake에는 eventId가 필요해요.');
 if(!value.capturedAt)throw Error('서비스 intake에는 capturedAt이 필요해요.');
 if(!value.source.archiveArtifactId)throw Error('서비스 intake에는 archiveArtifactId가 필요해요.');
 if(!value.source.contentSha256)throw Error('서비스 intake에는 contentSha256이 필요해요.');
 if(!value.source.merchant&&!value.source.domain)throw Error('서비스 intake에는 merchant 또는 domain이 필요해요.');
 return value;
}

export function foodIntakeResearchInput(event){
 const normalized=normalizeFoodIntakeEvent(event);
 return {
  name:normalized.product.name,
  barcode:normalized.product.barcode,
  url:normalized.product.productUrl,
 };
}

export function foodIntakeNutritionCandidate(event){
 const value=normalizeFoodIntakeEvent(event);
 const nutrition=value.product.nutrition;
 if(!nutrition)return null;
 const metrics={};
 for(const [field,metric] of Object.entries(NUTRITION_METRICS)){
  if(!own(nutrition,field))continue;
  metrics[metric]={value:nutrition[field],amount:nutrition.basisAmount,unit:nutrition.basisUnit};
 }
 if(Object.keys(metrics).length<2)return null;
 const p=value.product,s=value.source;
 const sourceName=s.merchant||s.domain||'구매 캡처';
 return {
  id:'purchase-intake:nutrition',
  provider:'purchase-intake',
  source:{name:sourceName+' · 캡처 영양표',url:p.productUrl},
  identity:{
   name:p.name,manufacturer:p.brand,barcode:p.barcode,pack:p.pack,
   ingredients:p.ingredients,allergens:p.allergens,storage:p.storage,shelfLife:p.shelfLife,
  },
  basis:{amount:nutrition.basisAmount,unit:nutrition.basisUnit,label:`${nutrition.basisAmount}${nutrition.basisUnit==='ml'?'mL':'g'}`},
  metrics,
  kind:'product',
  confidence:'captured-product',
  autoEligible:false,
  note:[
   '구매/보관 캡처에서 전달된 구조화 영양표',
   s.contentSha256&&'upstream 캡처 SHA-256 메타데이터 포함',
   '자동 저장 없음 · 실제 제품과 기준량 확인 후 적용',
  ].filter(Boolean).join(' · '),
 };
}

export function foodIntakeEvidenceNotes(event){
 const value=normalizeFoodIntakeEvent(event);
 const p=value.product,s=value.source;
 return [
  s.merchant&&`구매처: ${s.merchant}`,
  p.productUrl&&`상품 페이지: ${p.productUrl}`,
  p.brand&&`브랜드: ${p.brand}`,
  p.barcode&&`바코드: ${p.barcode}`,
  p.pack&&`제품 용량: ${p.pack}`,
  p.ingredients&&`원재료: ${p.ingredients}`,
  p.allergens&&`알레르기: ${p.allergens}`,
  p.storage&&`보관방법: ${p.storage}`,
  p.shelfLife&&`표시 보관기간·기한: ${p.shelfLife}`,
 ].filter(Boolean);
}

export async function handleFoodIntakePreview(request,env,fetchImpl=fetch,{requireServiceProvenance=false}={}){
 if(request.method!=='POST')return new Response(JSON.stringify({error:'method_not_allowed'}),{status:405,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
 const length=Number(request.headers.get('content-length')||0);
 if(length>MAX_BODY_BYTES)return new Response(JSON.stringify({error:'payload_too_large'}),{status:413,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
 let body;
 try{body=await request.json();}catch{return new Response(JSON.stringify({error:'invalid_json'}),{status:400,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});}
 try{
  const intake=requireServiceProvenance?validateFoodIntakeServiceProvenance(body):normalizeFoodIntakeEvent(body);
  const research=await researchFood(foodIntakeResearchInput(intake),env,fetchImpl);
  const intakeCandidate=foodIntakeNutritionCandidate(intake);
  return new Response(JSON.stringify({
   intake,
   evidenceNotes:foodIntakeEvidenceNotes(intake),
   ...(intakeCandidate?{intakeCandidate}:{}),
   research,
   writes:false,
  }),{status:200,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
 }catch(error){
  return new Response(JSON.stringify({error:'invalid_food_intake',message:error?.message||'식재료 intake를 확인해 주세요.'}),{status:400,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
 }
}

const intakeJson=(data,status=200)=>new Response(JSON.stringify(data),{
 status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
});

function inboxSourceLabel(event){
 return event.source.merchant||event.source.domain||'구매 캡처';
}

function inboxItem(event,row={}){
 return {
  id:event.eventId,
  status:clean(row.status||'pending',20),
  capturedAt:event.capturedAt,
  receivedAt:clean(row.received_at,80),
  reviewedAt:clean(row.reviewed_at,80),
  sourceLabel:clean(row.source_label,160)||inboxSourceLabel(event),
  intake:event,
  evidenceNotes:foodIntakeEvidenceNotes(event),
  ...(foodIntakeNutritionCandidate(event)?{intakeCandidate:foodIntakeNutritionCandidate(event)}:{}),
 };
}

function inboxEventFromRow(row){
 try{
  return validateFoodIntakeServiceProvenance(JSON.parse(String(row?.event_json||'')));
 }catch{return null;}
}

async function readInboxRow(env,id){
 return env.DB.prepare(
  'SELECT id,event_json,product_name,source_label,captured_at,received_at,status,reviewed_at FROM food_intake_inbox WHERE id=?'
 ).bind(id).first();
}

export async function handleFoodIntakeStore(request,env){
 if(request.method!=='POST')return intakeJson({error:'method_not_allowed'},405);
 const length=Number(request.headers.get('content-length')||0);
 if(length>MAX_BODY_BYTES)return intakeJson({error:'payload_too_large'},413);
 let body;
 try{body=await request.json();}catch{return intakeJson({error:'invalid_json'},400);}
 let event;
 try{event=validateFoodIntakeServiceProvenance(body);}
 catch(error){return intakeJson({error:'invalid_food_intake',message:error?.message||'식재료 intake를 확인해 주세요.'},400);}
 const serialized=JSON.stringify(event);
 try{
  const existing=await readInboxRow(env,event.eventId);
  if(existing){
   if(String(existing.event_json)!==serialized)return intakeJson({error:'event_conflict',message:'같은 eventId에 다른 상품정보가 이미 있어요.'},409);
   return intakeJson({ok:true,id:event.eventId,duplicate:true,status:existing.status||'pending',writes:'inbox-only'});
  }
  const count=await env.DB.prepare("SELECT COUNT(*) AS count FROM food_intake_inbox WHERE status='pending'").first();
  if(Number(count?.count||0)>=MAX_INBOX_PENDING)
   return intakeJson({error:'inbox_full',message:'확인하지 않은 구매 상품정보가 너무 많아요. 먼저 받은 상품정보를 확인해 주세요.'},429);
  const now=new Date().toISOString();
  const result=await env.DB.prepare(
   "INSERT OR IGNORE INTO food_intake_inbox (id,event_json,product_name,source_label,captured_at,received_at,status) VALUES (?,?,?,?,?,?,'pending')"
  ).bind(event.eventId,serialized,event.product.name,inboxSourceLabel(event),event.capturedAt,now).run();
  if(Number(result?.meta?.changes||0)>0)
   return intakeJson({ok:true,id:event.eventId,duplicate:false,status:'pending',writes:'inbox-only'},202);
  const raced=await readInboxRow(env,event.eventId);
  if(raced&&String(raced.event_json)===serialized)
   return intakeJson({ok:true,id:event.eventId,duplicate:true,status:raced.status||'pending',writes:'inbox-only'});
  return intakeJson({error:'event_conflict',message:'같은 eventId에 다른 상품정보가 이미 있어요.'},409);
 }catch{
  return intakeJson({error:'inbox_unavailable',message:'받은 상품정보함을 사용할 수 없어요.'},503);
 }
}

function inboxLike(value){
 return '%'+String(value||'').replace(/[\\%_]/g,char=>'\\'+char)+'%';
}

export async function handleFoodIntakeInbox(request,env,url){
 if(request.method==='GET'&&url.pathname==='/api/food-research/intake-inbox'){
  const name=clean(url.searchParams.get('name'),180);
  try{
   let rows;
   if(name){
    rows=await env.DB.prepare(
     "SELECT id,event_json,product_name,source_label,captured_at,received_at,status,reviewed_at FROM food_intake_inbox WHERE status='pending' AND product_name LIKE ? ESCAPE '\\' ORDER BY received_at DESC LIMIT ?"
    ).bind(inboxLike(name),MAX_INBOX_RETURN).all();
   }else{
    rows=await env.DB.prepare(
     "SELECT id,event_json,product_name,source_label,captured_at,received_at,status,reviewed_at FROM food_intake_inbox WHERE status='pending' ORDER BY received_at DESC LIMIT ?"
    ).bind(MAX_INBOX_RETURN).all();
   }
   const items=[];
   for(const row of rows?.results||[]){
    const event=inboxEventFromRow(row);
    if(event)items.push(inboxItem(event,row));
   }
   return intakeJson({items,count:items.length,limit:MAX_INBOX_RETURN});
  }catch{return intakeJson({error:'inbox_unavailable',message:'받은 상품정보함을 읽을 수 없어요.'},503);}
 }
 const match=url.pathname.match(/^\/api\/food-research\/intake-inbox\/([^/]+)$/);
 if(!match)return intakeJson({error:'not_found'},404);
 if(request.method!=='POST')return intakeJson({error:'method_not_allowed'},405);
 let body;
 try{body=await request.json();}catch{return intakeJson({error:'invalid_json'},400);}
 const status=clean(body?.status,20);
 if(!['applied','dismissed'].includes(status))return intakeJson({error:'invalid_status'},400);
 let id;
 try{id=decodeURIComponent(match[1]);}catch{return intakeJson({error:'invalid_id'},400);}
 if(!id||id.length>160)return intakeJson({error:'invalid_id'},400);
 try{
  const now=new Date().toISOString();
  const result=await env.DB.prepare(
   "UPDATE food_intake_inbox SET status=?,reviewed_at=? WHERE id=? AND status='pending'"
  ).bind(status,now,id).run();
  if(Number(result?.meta?.changes||0)<1){
   const row=await readInboxRow(env,id);
   if(!row)return intakeJson({error:'not_found'},404);
   return intakeJson({ok:true,id,status:row.status,unchanged:true});
  }
  return intakeJson({ok:true,id,status,reviewedAt:now});
 }catch{return intakeJson({error:'inbox_unavailable',message:'받은 상품정보 상태를 저장할 수 없어요.'},503);}
}

