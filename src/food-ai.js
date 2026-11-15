import {SITE_CONFIG} from '../public/site-config.js';
import {normalizeProductUrl} from './food-research.js';
const OPENROUTER_CHAT='https://openrouter.ai/api/v1/chat/completions';
const GEMINI_API='https://generativelanguage.googleapis.com/v1beta/models/';
const DEFAULT_GEMINI_MODEL='gemini-2.5-flash';
const FREE_MODEL='openrouter/free';
const MAX_IMAGE_DATA_URL=2_900_000;
const MAX_REQUEST_BYTES=3_200_000;

const clean=(value,max=1000)=>String(value??'').trim().slice(0,max);
const number=value=>{
 if(value===null||value===undefined||String(value).trim()==='')return null;
 const n=typeof value==='number'?value:Number(value);
 return Number.isFinite(n)&&n>=0?n:null;
};
const imageDataUrl=value=>{
 const text=clean(value,MAX_IMAGE_DATA_URL+100);
 if(!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(text)||text.length>MAX_IMAGE_DATA_URL)
  throw Error('라벨 사진은 JPEG·PNG·WebP 형식의 압축된 이미지여야 해요.');
 return text;
};

const schema={
 name:'food_label',
 strict:true,
 schema:{
  type:'object',
  additionalProperties:false,
  required:['productName','brand','barcode','pack','ingredients','allergens','storage','shelfLife','basisAmount','basisUnit','nutrition'],
  properties:{
   productName:{type:['string','null']},
   brand:{type:['string','null']},
   barcode:{type:['string','null']},
   pack:{type:['string','null']},
   ingredients:{type:['string','null']},
   allergens:{type:['string','null']},
   storage:{type:['string','null']},
   shelfLife:{type:['string','null']},
   basisAmount:{type:['number','null']},
   basisUnit:{type:['string','null'],enum:['g','ml',null]},
   nutrition:{
    type:'object',
    additionalProperties:false,
    required:['energy','sodium','carbs','sugars','fat','saturatedFat','protein','fiber','cholesterol','transFat'],
    properties:Object.fromEntries(['energy','sodium','carbs','sugars','fat','saturatedFat','protein','fiber','cholesterol','transFat'].map(key=>[key,{type:['number','null']}]))
   }
  }
 }
};

const TOP_LEVEL_FIELDS=['productName','brand','barcode','pack','ingredients','allergens','storage','shelfLife','basisAmount','basisUnit','nutrition'];
const NUTRITION_FIELDS=['energy','sodium','carbs','sugars','fat','saturatedFat','protein','fiber','cholesterol','transFat'];

function exactKeys(value,keys,label){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error(label+' 형식을 확인해 주세요.');
 const actual=Object.keys(value).sort(),expected=[...keys].sort();
 if(actual.length!==expected.length||actual.some((key,index)=>key!==expected[index]))
  throw Error(label+' 필드가 스키마와 일치하지 않아요.');
}
function nullableString(value,label){
 if(value!==null&&typeof value!=='string')throw Error(label+' 형식을 확인해 주세요.');
}
function nullableNumber(value,label){
 if(value!==null&&(typeof value!=='number'||!Number.isFinite(value)))throw Error(label+' 형식을 확인해 주세요.');
}
function validateAiLabelSchema(value){
 exactKeys(value,TOP_LEVEL_FIELDS,'AI 라벨 결과');
 for(const key of ['productName','brand','barcode','pack','ingredients','allergens','storage','shelfLife'])nullableString(value[key],key);
 nullableNumber(value.basisAmount,'basisAmount');
 if(value.basisUnit!==null&&!['g','ml'].includes(value.basisUnit))throw Error('basisUnit 형식을 확인해 주세요.');
 exactKeys(value.nutrition,NUTRITION_FIELDS,'AI 영양 결과');
 for(const key of NUTRITION_FIELDS)nullableNumber(value.nutrition[key],key);
 return value;
}

function assistantJson(payload){
 const choice=payload?.choices?.[0];
 if(!choice||choice.finish_reason!=='stop')
  throw Error('무료 AI 응답이 완전하게 종료되지 않았어요.');
 const content=choice.message?.content;
 let value=null;
 if(typeof content==='string'){
  const trimmed=content.trim().replace(/^\`\`\`(?:json)?\s*/i,'').replace(/\s*\`\`\`$/,'');
  try{value=JSON.parse(trimmed);}catch{}
 }else if(content&&typeof content==='object'&&!Array.isArray(content))value=content;
 if(!value)throw Error('무료 AI가 읽을 수 있는 구조화 결과를 돌려주지 않았어요.');
 return validateAiLabelSchema(value);
}

export function normalizeAiLabelResult(value,{model='',provider='openrouter'}={}){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('AI 라벨 결과 형식을 확인해 주세요.');
 const basisAmount=number(value.basisAmount);
 const basisUnit=['g','ml'].includes(value.basisUnit)?value.basisUnit:null;
 const identity={
  name:clean(value.productName,220),
  manufacturer:clean(value.brand,220),
  barcode:clean(value.barcode,20).replace(/\D/g,''),
  pack:clean(value.pack,100),
  ingredients:clean(value.ingredients,1500),
  allergens:clean(value.allergens,1000),
  storage:clean(value.storage,1000),
  shelfLife:clean(value.shelfLife,1000),
 };
 if(identity.barcode&&!/^\d{8,14}$/.test(identity.barcode))identity.barcode='';
 const metrics={};
 if(basisAmount&&basisUnit){
  for(const key of Object.keys(schema.schema.properties.nutrition.properties)){
   const n=number(value.nutrition?.[key]);
   if(n!==null)metrics[key]={value:n,amount:basisAmount,unit:basisUnit};
  }
 }
 return {
  id:'ai-label',
  provider:provider==='gemini'?'gemini-free-label':'openrouter-free-label',
  source:{name:provider==='gemini'?'Google Gemini 무료 API · 제품 라벨 판독':'OpenRouter 무료 AI · 제품 라벨 판독',url:''},
  identity,
  basis:basisAmount&&basisUnit?{amount:basisAmount,unit:basisUnit,label:`${basisAmount}${basisUnit==='ml'?'mL':'g'}`}:null,
  metrics,
  kind:'estimate',
  confidence:'ai-unverified',
  note:['AI 사진 판독 미검증',model&&`응답 모델 ${model}`,'실제 포장 라벨과 저장 전 직접 대조 필요'].filter(Boolean).join(' · '),
 };
}

function labelPrompt(input){
 const name=clean(input.name,150);
 const sourceUrl=input?.sourceUrl?normalizeProductUrl(input.sourceUrl):'';
 return [
  '식품 포장 라벨 사진에 실제로 보이는 내용만 추출하세요.',
  '보이지 않거나 확실하지 않은 항목은 null로 두고 절대 추측하지 마세요.',
  '영양성분은 사진에 적힌 동일한 기준량(basisAmount, basisUnit)에 해당하는 수치만 기록하세요.',
  '나트륨·콜레스테롤은 mg, 나머지 g, 열량은 kcal 숫자로 읽으세요.',
  '소비기한/유통기한이 제조일 기준 기간이면 그 문구 그대로 shelfLife에 넣고 실제 만료일로 계산하지 마세요.',
  name?`사용자가 입력한 제품명 참고: ${name}`:'',
  sourceUrl?`공개 상품 페이지 참고 주소: ${sourceUrl}`:'',
 ].filter(Boolean).join('\n');
}

async function timedPost(fetchImpl,url,headers,body){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25_000);
 try{
  return await fetchImpl(url,{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json','Accept':'application/json',...headers},body:JSON.stringify(body)});
 }catch(error){
  throw Object.assign(Error(error?.name==='AbortError'?'무료 AI 응답 시간이 초과됐어요.':'무료 AI에 연결하지 못했어요.'),{status:504,retryable:true});
 }finally{clearTimeout(timer);}
}

async function failure(response,label){
 let detail='';try{detail=clean((await response.json())?.error?.message,250);}catch{}
 const error=Error(detail||`${label} 요청 실패 (HTTP ${response.status})`);
 error.status=response.status===429?429:502;
 error.retryable=response.status===429||response.status>=500;
 return error;
}

async function analyzeWithOpenRouter(input,image,apiKey,fetchImpl){
 const body={
  model:FREE_MODEL,
  temperature:0,
  max_tokens:1200,
  provider:{require_parameters:true,max_price:{prompt:0,completion:0}},
  plugins:[{id:'response-healing'}],
  response_format:{type:'json_schema',json_schema:schema},
  messages:[
   {role:'system',content:'You extract food label facts conservatively. Return only schema-valid JSON and never infer missing facts.'},
   {role:'user',content:[
    {type:'text',text:labelPrompt(input)},
    {type:'image_url',image_url:{url:image}},
   ]}
  ]
 };
 const response=await timedPost(fetchImpl,OPENROUTER_CHAT,{
  'Authorization':`Bearer ${apiKey}`,
  ...(SITE_CONFIG.repositoryUrl?{'HTTP-Referer':SITE_CONFIG.repositoryUrl}:{}),
  'X-Title':SITE_CONFIG.appTitle,
 },body);
 if(!response.ok)throw await failure(response,'OpenRouter 무료 AI');
 const payload=await response.json();
 return normalizeAiLabelResult(assistantJson(payload),{model:clean(payload?.model,150),provider:'openrouter'});
}

// Gemini's responseSchema is an OpenAPI subset (nullable instead of type arrays).
function geminiSchema(node){
 if(node.type==='object'||(Array.isArray(node.type)&&node.type.includes('object')))
  return {type:'OBJECT',properties:Object.fromEntries(Object.entries(node.properties).map(([k,v])=>[k,geminiSchema(v)])),required:node.required};
 const types=Array.isArray(node.type)?node.type:[node.type];
 const base=types.includes('number')?'NUMBER':'STRING';
 return {type:base,nullable:types.includes('null'),...(node.enum?{enum:node.enum.filter(v=>v!==null)}:{})};
}

export function geminiLabelJson(payload){
 const candidate=payload?.candidates?.[0];
 if(!candidate||candidate.finishReason!=='STOP')throw Error('무료 AI 응답이 완전하게 종료되지 않았어요.');
 const text=(candidate.content?.parts||[]).map(part=>part?.text||'').join('').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
 let value=null;try{value=JSON.parse(text);}catch{}
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('무료 AI가 읽을 수 있는 구조화 결과를 돌려주지 않았어요.');
 // Gemini may drop null members; restore the exact contract, then validate.
 const nutrition=value.nutrition&&typeof value.nutrition==='object'&&!Array.isArray(value.nutrition)?value.nutrition:{};
 const fixed=Object.fromEntries(TOP_LEVEL_FIELDS.filter(key=>key!=='nutrition').map(key=>[key,value[key]??null]));
 fixed.nutrition=Object.fromEntries(NUTRITION_FIELDS.map(key=>[key,nutrition[key]??null]));
 return validateAiLabelSchema(fixed);
}

async function analyzeWithGemini(input,image,apiKey,model,fetchImpl){
 const [,mime,data]=image.match(/^data:(image\/[a-z]+);base64,(.+)$/i)||[];
 const body={
  systemInstruction:{parts:[{text:'You extract food label facts conservatively. Return only schema-valid JSON and never infer missing facts.'}]},
  contents:[{role:'user',parts:[{text:labelPrompt(input)},{inline_data:{mime_type:mime.toLowerCase(),data}}]}],
  generationConfig:{temperature:0,maxOutputTokens:1200,responseMimeType:'application/json',responseSchema:geminiSchema(schema.schema)},
 };
 const response=await timedPost(fetchImpl,GEMINI_API+encodeURIComponent(model)+':generateContent',{'x-goog-api-key':apiKey},body);
 if(!response.ok)throw await failure(response,'Gemini 무료 API');
 const payload=await response.json();
 return normalizeAiLabelResult(geminiLabelJson(payload),{model:clean(payload?.modelVersion||model,150),provider:'gemini'});
}

export function foodAiProviders(env={}){
 const providers=[];
 const openrouter=clean(env.OPENROUTER_API_KEY,500),gemini=clean(env.GEMINI_API_KEY,500);
 if(openrouter)providers.push({id:'openrouter',key:openrouter});
 if(gemini)providers.push({id:'gemini',key:gemini,model:clean(env.GEMINI_MODEL,80)||DEFAULT_GEMINI_MODEL});
 if(clean(env.FOOD_AI_PROVIDER).toLowerCase()==='gemini')providers.reverse();
 return providers;
}

export async function analyzeFoodLabel(input,env={},fetchImpl=fetch){
 const providers=foodAiProviders(env);
 if(!providers.length)throw Object.assign(Error('무료 AI 라벨 분석이 아직 연결되지 않았어요.'),{status:503});
 if(input?.approveRemote!==true)throw Error('라벨 사진을 외부 무료 AI로 보내는 명시적 동의가 필요해요.');
 const image=imageDataUrl(input.imageDataUrl);
 labelPrompt(input); // validates sourceUrl before any network call
 let lastError=null;
 for(const provider of providers){
  try{
   return provider.id==='gemini'
    ?await analyzeWithGemini(input,image,provider.key,provider.model,fetchImpl)
    :await analyzeWithOpenRouter(input,image,provider.key,fetchImpl);
  }catch(error){
   lastError=error;
   // Only quota/outage errors move to the other configured free provider.
   // A bad or incomplete answer is never retried.
   if(!error?.retryable)throw error;
  }
 }
 throw lastError;
}

export async function handleFoodAi(request,env,fetchImpl=fetch){
 if(request.method!=='POST')return new Response(JSON.stringify({error:'method_not_allowed'}),{status:405,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
 const length=Number(request.headers.get('content-length')||0);
 if(length>MAX_REQUEST_BYTES)return new Response(JSON.stringify({error:'payload_too_large'}),{status:413,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
 let body;
 try{body=await request.json();}catch{return new Response(JSON.stringify({error:'invalid_json'}),{status:400,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});}
 try{
  const candidate=await analyzeFoodLabel(body,env,fetchImpl);
  return new Response(JSON.stringify({candidate}),{status:200,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
 }catch(error){
  const status=Number(error?.status)||400;
  return new Response(JSON.stringify({error:status===503?'ai_unavailable':'ai_label_failed',message:error?.message||'라벨 사진을 분석하지 못했어요.'}),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
 }
}
