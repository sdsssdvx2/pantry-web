import {isUnknownKfindIdentity,hasKfindPackAmount} from './kfind-identity.js';
import * as parseRules from './nutrition-product-rules.js';
// Pure calculation and validation. Missing information is never a zero.
export const NUTRIENTS={energy:['열량','kcal'],sodium:['나트륨','mg'],carbs:['탄수화물','g'],sugars:['당류','g'],fat:['지방','g'],saturatedFat:['포화지방','g'],protein:['단백질','g'],fiber:['식이섬유','g'],cholesterol:['콜레스테롤','mg'],transFat:['트랜스지방','g']};
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const positive=(v,max)=>typeof v==='number'&&Number.isFinite(v)&&v>0&&v<=max;
const text=(v,max=500)=>typeof v==='string'&&v.length<=max?v.trim():'';
export const nutritionKey=v=>String(v||'').normalize('NFKC').toLowerCase().replace(/\s+/g,'');
export function validateNutrition(value){
 if(value==null)return undefined;
 if(!object(value))throw Error('영양정보 형식을 확인해 주세요.');
 const out={};
 if(Object.hasOwn(value,'productKey')){if(value.productKey!==null&&(typeof value.productKey!=='string'||!value.productKey.trim()||value.productKey.length>150))throw Error('연결 제품을 확인해 주세요.');out.productKey=value.productKey;}
 if(value.ignoreNotes===true)out.ignoreNotes=true;
 // Optional provenance for a K-FIND candidate explicitly reviewed by the owner.
 // This identifies the source record, not regulatory verification of a package.
 if(Object.hasOwn(value,'kfindEvidence')){
  const e=value.kfindEvidence;
  const limits={code:100,name:220,manufacturer:220,importer:220,pack:75,reportNo:100,basis:5,dataDate:40};
  if(!object(e)||e.dataset!=='K-FIND'||Object.keys(e).some(k=>k!=='dataset'&&!Object.hasOwn(limits,k)))
   throw Error('K-FIND 제품 식별 자료를 확인해 주세요.');
  const fields={};
  for(const [key,max] of Object.entries(limits)){
   if(typeof e[key]!=='string'||e[key].length>max||
      (['code','name','manufacturer'].includes(key)&&isUnknownKfindIdentity(e[key]))||
      (key==='pack'&&!hasKfindPackAmount(e[key])))
    throw Error('K-FIND 식별 항목과 확인 가능한 포장 용량을 확인해 주세요.');
   fields[key]=(['importer','reportNo'].includes(key)&&isUnknownKfindIdentity(e[key]))?'':e[key].trim();
  }
  if(!['100g','100ml'].includes(fields.basis))throw Error('K-FIND 영양 기준량을 확인해 주세요.');
  out.kfindEvidence={dataset:'K-FIND',...fields};
 }
 for(const key of Object.keys(NUTRIENTS)){
  const n=value[key];if(n===null){out[key]=null;continue;}if(n===undefined)continue;
  if(!object(n)||typeof n.value!=='number'||!Number.isFinite(n.value)||n.value<0||n.value>1e7||!positive(n.amount,1e6)||!['g','ml','piece'].includes(n.unit))throw Error(`${NUTRIENTS[key][0]}의 수치와 기준량을 확인해 주세요.`);
  const kind=['user','product','generic','estimate'].includes(n.kind)?n.kind:'user';
  const url=text(n.url,2000);if(url&&!/^https:\/\//i.test(url))throw Error('영양정보 출처는 https 주소로 입력해 주세요.');
  out[key]={value:n.value,amount:n.amount,unit:n.unit,kind,...(text(n.source)?{source:text(n.source)}:{}),...(url?{url}:{}),...(text(n.note,1000)?{note:text(n.note,1000)}:{})};
 }
 // Records of attempted research must survive even without any nutrient
 // number. They are provenance notes, never verified kcal/sodium values.
 if(Object.hasOwn(value,'researchNote')){
  if(typeof value.researchNote!=='string'||value.researchNote.length>2000)throw Error('영양자료 조사 메모 길이를 확인해 주세요.');
  if(value.researchNote.trim())out.researchNote=value.researchNote.trim();
 }
 if(Object.hasOwn(value,'researchUrl')){
  if(typeof value.researchUrl!=='string'||value.researchUrl.length>2000)throw Error('영양자료 링크를 확인해 주세요.');
  if(value.researchUrl.trim()){
   if(!/^https:\/\//i.test(value.researchUrl.trim()))throw Error('영양자료 링크는 https 주소로 입력해 주세요.');
   out.researchUrl=value.researchUrl.trim();
  }
 }
 for(const key of ['gramsPerMl','gramsPerPiece'])if(value[key]===null){out[key]=null;}else if(value[key]!=null&&value[key]!==''){
  if(!positive(value[key],key==='gramsPerMl'?30:1e6))throw Error('mL 또는 1개에 해당하는 g을 확인해 주세요.');
  out[key]=value[key];
 }
 if(value.conversionNote)out.conversionNote=text(value.conversionNote,1000);
 return out;
}
export function validateRecipeNutrition(value){
 if(value==null)return undefined;
 if(!object(value)||!positive(value.servings,1000)||!Array.isArray(value.overrides)||value.overrides.length>500)throw Error('영양 계산의 인분과 재료 설정을 확인해 주세요.');
 const seen=new Set();
 const overrides=value.overrides.map(row=>{
  if(!object(row)||!text(row.key,400)||seen.has(row.key)||typeof row.included!=='boolean'||!Number.isFinite(row.percent)||row.percent<0||row.percent>100)throw Error('영양 계산 재료 설정을 확인해 주세요.');
  // Reject malformed provenance identity instead of silently dropping it.
  if(Object.hasOwn(row,'evidenceFor')&&!text(row.evidenceFor,150))throw Error('영양 근거의 연결 식재료를 확인해 주세요.');
  if(Object.hasOwn(row,'evidencePreparation')&&(typeof row.evidencePreparation!=='string'||row.evidencePreparation.length>100))throw Error('영양 근거의 조리 상태를 확인해 주세요.');
  if(Object.hasOwn(row,'evidenceProductKey')&&(typeof row.evidenceProductKey!=='string'||row.evidenceProductKey.length>150))throw Error('영양 근거의 연결 제품을 확인해 주세요.');
  seen.add(row.key);
  return {key:row.key,included:row.included,percent:row.percent,ingredient:text(row.ingredient,150),
   ...(row.evidenceFor?{evidenceFor:text(row.evidenceFor,150)}:{}),
   ...(typeof row.evidencePreparation==='string'?{evidencePreparation:text(row.evidencePreparation,100)}:{}),
   ...(typeof row.evidenceProductKey==='string'?{evidenceProductKey:text(row.evidenceProductKey,150)}:{}),
   ...(row.nutrition!==undefined?{nutrition:validateNutrition(row.nutrition)}:{})};
 });
 return {servings:value.servings,overrides};
}

// The owner measures cooking quantities on a scale, including historic mL labels.
// This relabels recipe quantities only; product nutrition denominators stay intact.
export function gramCookingText(value=''){
 return String(value).replace(/(\d(?:[\d.,~～〜–—-]|\s)*)(?:mL|ml|㎖|밀리리터)(?![A-Za-z])/g,'$1g');
}
const number=String.raw`(?:\d+\s*\/\s*\d+|\d+(?:,\d{3})*(?:\.\d+)?)`;
const quantity=new RegExp(`(${number})(?:\\s*[~～〜–—-]\\s*(${number}))?\\s*(kg|mg|g|개(?!월)|알|장|봉|팩|캔|쪽|판(?!용)|큰술|작은술|T|ts|t|방울|조각)(?![A-Za-z])`,'g');
const numeric=v=>v.includes('/')?v.split('/').map(Number).reduce((a,b)=>a/b):Number(v.replaceAll(',',''));
const spoonMilliliters=unit=>unit==='T'||unit==='큰술'?15:unit==='t'||unit==='ts'||unit==='작은술'?5:null;
const instruction=/^\s*(?:\d+\s*[.)]\s*|Step\s*\d+)/i;
const cleanName=v=>v.replace(/^\s*[•·*\-]\s*/,'').replace(/^\s*\d+(?:-\d+)*[.)]\s*/,'').replace(/\([^)]*\)/g,'').replace(/^(?:재료|소스|양념)\s*[:：]\s*/,'').replace(/(?:약|총)\s*$/,'').trim();
const headingRewrites=parseRules.headingNameRewrites.map(([pattern,name])=>[new RegExp(pattern),name]);
const parsedName=v=>headingRewrites.reduce((text,[pattern,name])=>text.replace(pattern,name),cleanName(v)).replace(/^\(/,'').replace(/\s*(?:\d+\s*(?:꼬집|포))?\s*\([^)]*$/,'').replace(/\s*\d+(?:\.\d+)?(?:\s*[~～〜–—-]\s*\d+(?:\.\d+)?)?\s*(?:조각|슬라이스)$/,'').replace(/^.*[:：]\s*(?=\S)/,'').replace(/^(?:\d+(?:\.\d+)?\s*도(?:\s*\/\s*\d+(?:\.\d+)?\s*도)?(?:로)?\s*)예열하고\s+/,'').replace(/^끝나기\s+\d+(?:\.\d+)?(?:\s*[~～〜–—-]\s*\d+(?:\.\d+)?)?\s*(?:분|초)\s+전에\s+/,'').replace(/^불\s*끄고\s+/,'').replace(/^빵\s+윗면[·ㆍ]아랫면에\s+/,'').replace(/^빵은\s+/,'').replace(/^(?:달걀|계란)\s*\d+(?:\.\d+)?\s+(?:다시마물|물)$/,'').replace(/[:：]\s*$/,'').replace(/^[^가-힣A-Za-z]+/u,'').trim();
const nonFoodCountName=v=>/(?:그릇|접시|종지|위생봉투)$/.test(v);
// Preparation state is intentionally conservative. It is metadata for nutrition
// resolution only and never changes the displayed ingredient name or saved recipe.
const preparationFor=v=>/(?:기름|오일)[^+\/\n]{0,32}(?:빼|뺀|제거|짜|짠)/.test(v)?'drainedOil':'';
function segments(line,required=[]){
 const result=[];let depth=0,start=0;
 for(let i=0;i<line.length;i++){
  if(line[i]==='(')depth++;else if(line[i]===')')depth=Math.max(0,depth-1);
  const afterConnector=line.startsWith('두르고',i)?line.slice(i+3).trimStart():'';
  const cookingConnector=depth===0&&afterConnector&&[...line.slice(start,i).matchAll(quantity)].length&&required.some(candidate=>{
   const name=String(candidate||'').trim();
   return name&&afterConnector.startsWith(name)&&new RegExp(`^\\s*${quantity.source}`).test(afterConnector.slice(name.length));
  });
  if(depth===0&&(cookingConnector||line[i]==='+'||/[,，]/.test(line[i])&&/^\s*[가-힣]/.test(line.slice(i+1))||line[i]==='/'&&/\d\s*(?:g|개|알)\s*$/.test(line.slice(0,i))&&/^\s*[가-힣]/.test(line.slice(i+1)))){
   result.push({text:line.slice(start,i),start});
   if(cookingConnector){i+=2;start=i+1;}else start=i+1;
  }
 }
 result.push({text:line.slice(start),start});
 // Some imported prose keeps several quantified ingredients in one sentence
 // without + or commas. Split only before an exact declared required ingredient
 // that is immediately quantified and is anchored by a previously parseable,
 // top-level food quantity. Ambiguous legacy run-ons and `1개당 ... 30g` stay
 // on the older conservative path.
 const declared=[...new Set(required.map(candidate=>String(candidate||'').trim()).filter(Boolean))].sort((a,b)=>b.length-a.length);
 const split=[];
 for(const part of result){
  const boundaries=[];
  for(const candidate of declared){
   let searchFrom=0,index=-1;
   while((index=part.text.indexOf(candidate,searchFrom))>=0){
    searchFrom=index+candidate.length;
    if(index===0)continue;
    const previous=part.text[index-1]||'';
    if(/[가-힣A-Za-z0-9]/.test(previous)||depthAt(part.text,index)>0)continue;
    const before=part.text.slice(0,index),after=part.text.slice(index+candidate.length);
    if(!new RegExp(`^\\s*${quantity.source}`).test(after))continue;
    const priorMatches=[...before.matchAll(quantity)].filter(match=>depthAt(part.text,match.index)===0&&!conditionalTimingCount(part.text,match)&&!dimensionReferenceCount(part.text,match));
    const prior=priorMatches.at(-1);if(!prior)continue;
    const priorTail=before.slice(prior.index+prior[0].length);
    if(/^\s*당\s*$/.test(priorTail))continue;
    if(!parsedName(before.slice(0,prior.index)))continue;
    boundaries.push(index);
   }
  }
  const points=[...new Set(boundaries)].sort((a,b)=>a-b);
  if(!points.length){split.push(part);continue;}
  let localStart=0;
  for(const point of points){
   if(point>localStart)split.push({text:part.text.slice(localStart,point),start:part.start+localStart});
   localStart=point;
  }
  split.push({text:part.text.slice(localStart),start:part.start+localStart});
 }
 return split;
}
const depthAt=(line,index)=>[...line.slice(0,index)].reduce((n,c)=>c==='('?n+1:c===')'?Math.max(0,n-1):n,0);
const conditionalTimingCount=(segment,match)=>{
 if(!['개','알','장','봉','팩','캔','쪽','판'].includes(match?.[3])||depthAt(segment,match.index)<=0)return false;
 const open=segment.lastIndexOf('(',match.index);if(open<0)return false;
 const before=segment.slice(Math.max(0,open-32),open),after=segment.slice(match.index+match[0].length);
 const durationEnd=/\d+(?:\.\d+)?(?:\s*[~～〜–—-]\s*\d+(?:\.\d+)?)?\s*(?:분|초)\s*$/;
 const conditionalDuration=/^\s*면\s*\d+(?:\.\d+)?(?:\s*[~～〜–—-]\s*\d+(?:\.\d+)?)?\s*(?:분|초)(?![가-힣A-Za-z0-9])/;
 return durationEnd.test(before)&&conditionalDuration.test(after);
};
const dimensionReferenceCount=(segment,match)=>{
 if(!['개','알','장','봉','팩','캔','쪽','판'].includes(match?.[3]))return false;
 const after=segment.slice(match.index+match[0].length);
 return /^\s*높이(?:로|에|만큼|정도)?(?=\s|$)/.test(after);
};
// A conditional final batch target is not an additional food quantity.
const conditionalBatchTarget=(segment,match,fromStep)=>
 fromStep&&match?.[3]==='g'&&depthAt(segment,match.index)>0&&
 /\(\s*총\s*$/.test(segment.slice(0,match.index))&&
 /^\s*안\s*되면\s*(?:물|육수)\s*(?:넣|추가)/.test(segment.slice(match.index+match[0].length));
const cuttingInstructionFragment=(segment,match)=>{
 if(match?.[3]!=='조각')return false;
 const before=segment.slice(0,match.index);
 // Recipe-title layout recipes (1쌍: 토마토 1조각 + ...) are geometry,
 // not the actual amount consumed or an ingredient-list entry.
 if(/\d+\s*쌍\s*[:：]/.test(before))return true;
 // A note about how to make an optional preparation is not an added portion.
 if(/^\s*\([^)]*경우\s*[:：]/.test(segment))return true;
 // In already-running cooking prose, fragment counts usually refer back to
 // a listed ingredient (e.g. '...섞어둔 액체 소스... 냉동 마늘 1조각').
 // Do not create extra unidentified ingredients or spurious quantity warnings.
 if(before.length>=24&&/(?:넣고|섞어|만들|준비|꺼내)/.test(before))return true;
 // '바나나를 6조각으로 자르기' describes preparation, not six consumed pieces.
 const after=segment.slice(match.index+match[0].length);
 return /^\s*(?:으로|로)\s*(?:자르|썰|나누|쪼개|등분|깨)/.test(after);
};
// A preparation note can contain a number without introducing another food.
// Suppress only exact, single-quantity non-ingredient instructions: never
// suppress a mixed line containing a second measured ingredient.
const nonIngredientQuantityInstruction=(segment,matches,line='',fromStep=false)=>{
 if(matches.length!==1)return false;
 const match=matches[0],before=segment.slice(0,match.index),after=segment.slice(match.index+match[0].length);
 // A bowl of water placed alongside noodle/sauce bowls in the kimchi fridge
 // is chilling setup, not a second 500g addition to an already measured sauce.
 // Require both the full cooling-bowl context and an isolated water segment.
 if(fromStep&&match[3]==='g'&&/^\s*볼에\s*물\s*$/.test(before)&&/^\s*넣기\s*$/.test(after)&&
  /^\s*\d+\s*[.)]\s*김치냉장고에[^\n]{0,160}(?:소스용|면용)\s*그릇[^\n]*,\s*볼에\s*물\s*\d+(?:\.\d+)?\s*g\s*넣기\s*$/.test(line))return true;
 // Pasta water reserved to use later is not a second portion added to food.
 // Its actual usage is separately measured in the ingredient list.
 if(match[3]==='g'&&/\(\s*면수\s*$/.test(before)&&/^\s*남겨놓기\s*\)/.test(after))return true;
 // '... 안전해지는 것은 아님. 1개 무게가 다르므로 ...' is advice
 // about weighing the already listed egg, not a second egg to count.
 if(match[3]==='개'&&match[1]==='1'&&/(?:[.!?]\s*|^)$/.test(before)&&
  /^\s*무게가\s*다르므로\s*껍데기\s*제외한\s*g으로\s*계량하기/.test(after))return true;
 return false;
};
const noodleChillingBath=(name,section,line)=>
 /면\s*삶기/.test(section)&&/^\s*얼음물\s*(?:\([^)]*\))?\s*[:：]/.test(line)&&
 /^(?:찬물|얼음)$/.test(name);
const recipeBasisHeading=(line,lines,index,required=[])=>{
  const next=lines.slice(index+1).find(candidate=>candidate.trim())?.trim()||'';
  // A recipe-yield header (🍹 name 1인분 (360g)) is not a second food input.
  // Require an ingredient block, pictographic heading, subsequent measured
  // ingredients and no exact declared product of that name.
  const previous=lines.slice(0,index).reverse().find(candidate=>candidate.trim())?.trim()||'';
  const yieldTitle=line.match(/^\s*[•·*]\s*[\p{Extended_Pictographic}\uFE0F]+\s*(.+?)\s+\d+(?:\.\d+)?\s*인분\s*\(\s*\d+(?:\.\d+)?\s*g\s*\)\s*$/u);
  if(previous==='[재료]'&&yieldTitle&&
    !required.some(candidate=>nutritionKey(candidate)===nutritionKey(yieldTitle[1]))&&
    /\d+(?:\.\d+)?\s*g(?:\s|$|\()/.test(next))return true;
  // Existing finished-yield heading followed by an explicit ingredient section.
  if(/^(?:재료|\[재료\]|【재료】)$/.test(next)&&/^\s*[•·*]\s*.+?\d+(?:,\d{3})*(?:\.\d+)?\s*(?:kg|mg|g)\s*\([^)]*(?:개|장|인분)[^)]*\)\s*기준\s*$/.test(line))return true;
  // Some source-only sauce recipes name the *food they accompany* in their
  // heading: "(200g 기준)", "(치킨 240g용)", or "1인분 250g 기준".
  // The reference serving is NOT 200–250g of sauce or another ingredient.
  // Exclude only an explicitly contextual sauce title followed by a separate
  // quantified ingredient line. A measured ingredient named "토마토 소스"
  // must remain a valid row even when its amount is followed by "기준".
  const reference=/\d+(?:,\d{3})*(?:\.\d+)?\s*g\s*(?:용|기준)/;
  const contextual=/\([^)]*\d+(?:,\d{3})*(?:\.\d+)?\s*g\s*(?:용|기준)\s*\)\s*$/.test(line)||
    /1인분\s+\d+(?:,\d{3})*(?:\.\d+)?\s*g\s*기준\s*$/.test(line);
  if(!contextual||!reference.test(line)||!/^\s*[•·*]\s*(?!소스\s)\S.{4,}소스/.test(line))return false;
  const headingName=line.replace(/^\s*[•·*]\s*/,'')
    .replace(/\s*\([^)]*\d+(?:,\d{3})*(?:\.\d+)?\s*g\s*(?:용|기준)\s*\)\s*$/,'')
    .replace(/\s*1인분\s+\d+(?:,\d{3})*(?:\.\d+)?\s*g\s*기준\s*$/,'').trim();
  if(required.some(item=>nutritionKey(item)===nutritionKey(headingName)))return false;
  if(/^\s*(?:\d+\s*[.)]|Step\s+\d+)/i.test(next))return false;
  return /^\s*\S.+?\d+(?:\.\d+)?\s*(?:kg|mg|g|mL|ml)(?![A-Za-z])/.test(next);
};
const discardedScallionRoot=(name,body)=>/대파\s*뿌리/.test(name)&&(
 /대파\s*뿌리[^\n]{0,80}(?:버리|건져)/.test(body)||
 /(?:체로\s*걸러|체에\s*걸러|거른)[^\n]{0,100}(?:맑은\s*)?(?:액체|국물)(?:만|만을)/.test(body)
);
const listedStepRepeat=(name,rows,required)=>{
 const listed=rows.filter(row=>!row.fromStep),key=nutritionKey(name);
 const exact=listed.filter(row=>nutritionKey(row.name)===key);
 if(exact.length)return exact;
 const tokens=String(name).trim().split(/\s+/),tail=nutritionKey(tokens.at(-1)||name);
 if(tail.length<2)return [];
 const bridges=required.filter(candidate=>nutritionKey(candidate).endsWith(tail));
 if(bridges.length!==1)return [];
 const bridge=nutritionKey(bridges[0]);
 const matches=listed.filter(row=>[row.name,row.sourceName].some(value=>nutritionKey(value).endsWith(bridge)));
 return matches.length===1?matches:[];
};

// Deployment rules may recognize one exactly written drained-can amount.
const preferredDrainedTunaInStep=line=>parseRules.preferredDrainedAmountInStep(line,{numeric,quantity});

// A curing-salt coating that is rinsed from fish, or kombu discarded after
// steeping, must not be counted as fully eaten. The absorbed/extracted
// nutrients are genuinely unknown rather than zero.
const rinsedFishCuringSalt=(name,body)=>
 /^(?:굵은\s*소금|히말라야\s*핑크\s*소금)$/.test(name)&&
 /(?:연어|광어)/.test(body)&&/소금[^\n]{0,90}(?:앞뒤|펴바르|뿌리기)/.test(body)&&
 /(?:흐르는\s*찬물에\s*\d+\s*초[^\n]{0,45}헹구|(?:연어|광어)[^\n]{0,65}찬물에[^\n]{0,40}헹구)/.test(body);
const removedMeasuredKelp=(name,body)=>
 /^(?:건다시마|다시마)$/.test(name)&&
 /다시마(?:를|는)?\s*(?:제거|버리|건져)|다시마\s+건져서\s+버리/.test(body);
// Quantified bonito flakes may be a garnish (eaten) or spent dashi solids.
// Only explicit *bonito-specific* disposal, or a bonito-steeping step followed
// immediately by keeping strained clear liquid, can exclude the dry input.
// Never infer disposal merely because another ingredient is lifted or sieved.
const removedMeasuredBonito=(name,body)=>{
 if(name!=='가쓰오부시')return false;
 const lines=body.split('\n');
 for(let i=0;i<lines.length;i++){
  const line=lines[i];
  if(!line.includes('가쓰오부시'))continue;
  // "가쓰오부시 버리기", "체로 가쓰오부시 제거" and similar.
  if(/가쓰오부시\s*(?:를|는|만)?\s*(?:버리|제거|건져서\s*(?:버리|제거))/.test(line))
   return true;
  // "가쓰오부시 넣고 2분 → 체로 걸러서 버리기".
  if(/가쓰오부시[^\n]{0,125}체(?:에|로)\s*(?:가쓰오부시\s*)?걸러(?:서)?\s*(?:버리|폐기|제거)/.test(line))
   return true;
  // Separate sequential dashi steps: steep bonito then retain *only* clear
  // strained broth. Limit scope to the next two lines to avoid unrelated
  // later egg sieving or disposal of other foods.
  if(/가쓰오부시[^\n]{0,110}(?:우리기|우려|우린|넣고\s*\d+(?:\.\d+)?\s*분)/.test(line)&&
    lines.slice(i+1,i+3).some(next=>
     /체(?:에|로)\s*걸러[^\n]{0,95}맑은\s*(?:액체|국물)만/.test(next)))
   return true;
 }
 return false;
};
// Straining a blended/puréed food can remove calorie-bearing solids: keep
// the input row visible, but prevent a fully verified *intake* claim.
const strainedBlendedIngredients=body=>
 /(?:갈고|갈아서|곱게\s*갈기|으깨고)[\s\S]{0,180}(?:고운\s*)?체(?:에|로)[^\n]{0,60}(?:거르|걸러)/.test(body);

export function parseRecipeAmounts(raw='',required=[]){
 const body=gramCookingText(raw),lines=body.split('\n');
 const firstStep=lines.findIndex(line=>instruction.test(line));
 // A separate ingredient block owns quantities, even when steps repeat them.
 const hasList=firstStep>0&&lines.slice(0,firstStep).some(line=>/\d\s*(?:kg|g|개|알|장|봉|팩|캔|판)(?![A-Za-z])/.test(line));
 const rows=[],warnings=[],counts=new Map();let section='',offset=0;
 // An explicitly quantified homemade dressing is a component recipe, not
 // an additional packaged ingredient when some of it is served later.
 const listedDressingSection=hasList&&lines.slice(0,firstStep).some(line=>/^\s*[\[【][^\]】]*드레싱[\]】]\s*$/.test(line));
 // A prepared dressing can be portioned in stages. Serving the remainder
 // proves that all listed batch ingredients are eaten; a single aliquot
 // does not. Never invent a proportional nutrient estimate from this text.
 const remainingDressingServed=lines.slice(Math.max(0,firstStep)).some(line=>{
  const mention=line.match(/(?:남은|나머지)\s*드레싱(?:을|도|까지)?/);
  if(!mention)return false;
  const tail=line.slice(mention.index+mention[0].length);
  const action=tail.search(/(?:넣|붓|뿌리|담|곁들|마무리|먹)/);
  if(action<0||action>100)return false;
  const connector=tail.search(/[→+,，]/);
  const prefix=tail.slice(0,Math.min(action,connector<0?action:connector));
  // The owner's instructions use arrows between cooking stages. A portion
  // written immediately after the arrow STILL qualifies the dressing:
  // "남은 드레싱 → 절반만 넣기" is not proof of whole-batch intake.
  // Do not confuse "남은 드레싱 → 호두 조금 → ... 마무리" with dressing
  // portioning: here the small quantity describes the separate walnut.
  const afterConnector=connector>=0&&connector<action?
   tail.slice(connector+1,action).trimStart():'';
  const partial=/(?:절반|반만|반\s*정도|일부|조금|소량|그\s*중|\d+(?:\.\d+)?\s*g\b)/;
  if(partial.test(prefix)||new RegExp('^(?:'+partial.source+')').test(afterConnector))return false;
  if(/(?:보관|냉장|남겨|버리|폐기)/.test(tail.slice(0,action)))return false;
  // "안 넣고 다른 양념으로 마무리" and "넣지 않고 마무리" are
  // both negative, even when a later finishing verb appears on the line.
  const untilAction=tail.slice(0,action+35);
  if(/안\s*(?:넣|붓|뿌리|담|먹|곁들|사용|쓰)|(?:넣|붓|뿌리|먹|담|곁들이|사용하?|쓰)지\s*(?:않|말)/.test(untilAction))return false;
  return true;
 });
 // The recipe separately prepares a marinade and reserves a small part
 // for another dish; the reserved portion is not more food in this recipe.
 const preparedZuke=hasList&&lines.slice(0,firstStep).some(line=>/^\s*\[즈케장\]\s*\(미리 만들어 놔도 됨\)\s*$/.test(line));
 for(let lineIndex=0;lineIndex<lines.length;lineIndex++){
  const line=lines[lineIndex],heading=line.match(/^\s*[\[【](.+?)[\]】]\s*$/);
  if(heading){section=heading[1];offset+=line.length+1;continue;}
  if(recipeBasisHeading(line,lines,lineIndex,required)){offset+=line.length+1;continue;}
  const fromStep=hasList&&lineIndex>=firstStep;
  // Post-draining scale readings are the *same food*, not a second serving.
  // The subsequent seasoning is an optional change to an already listed choice.
  const hasPackTofu=rows.some(row=>!row.fromStep&&/순두부$/.test(row.name)&&row.unit==='g');
  if(fromStep&&hasPackTofu&&/^\s*\d+[.)]\s*이때 두부 무게는 \d+(?:\.\d+)?g으로 줄어듦\.\s*쯔유 넣기\.\s*$/.test(line)){
   warnings.push('물 제거 후 두부 무게는 새 재료가 아니에요. 포장 중량 대비 실제 섭취량과 영양성분 차이는 미확인입니다.');
   offset+=line.length+1;continue;
  }
  if(fromStep&&hasPackTofu&&rows.some(row=>!row.fromStep&&row.name==='쯔유')&&
    /^\s*\d+[.)]\s*먹기 직전에 물 버리고 참기름, 통깨 뿌려 먹기\(간이 부족한 거 같을 때만 쯔유 \d+(?:\.\d+)?\s*[~～〜–—-]\s*\d+(?:\.\d+)?g 추가\)\s*$/.test(line)){
   warnings.push('조건부로 추가하는 쯔유는 기본 합계에 포함하지 않았어요. 실제로 선택한 쯔유량과 남긴 물·간장을 확인해 주세요.');
   offset+=line.length+1;continue;
  }
  // An explicit small/large serving replacement is not a second ingredient list.
  // Preserve the original instructions but never add variant-only quantities to
  // the base nutrition total or compare them against the base ingredient list.
  const replacementServingExamples=fromStep&&/작은\s*잔\s*[:：]/.test(line)&&/큰\s*잔\s*[:：]/.test(line)&&/재료\s*목록을\s*교체/.test(line)&&/함께\s*넣지\s*않/.test(line);
  if(replacementServingExamples){offset+=line.length+1;continue;}
  // Alternatives cannot all be counted as one meal.
  const preferredTuna=preferredDrainedTunaInStep(line);
  // A slash must separate ingredient alternatives, not be an unrelated
  // fraction such as "양파 1/2" elsewhere on the same line.
  const alternativeSlashes=preferredTuna?[]:[...line.matchAll(/\s\/\s|\d\s*(?:g|개|알)\s*\//g)]
   .map(match=>match.index+match[0].lastIndexOf('/'));
  const topLevelSlash=alternativeSlashes.some(index=>depthAt(line,index)===0);
  const scan=preferredTuna?[{text:line,start:0,special:preferredTuna}]:segments(line,required);
  for(const {text:segment,start,special} of scan){
   // A nested slash excludes only its own segment. A top-level slash
   // can select one mixture rather than a single ingredient, so keep
   // conservative whole-line exclusion pending an explicit owner choice.
   const alternative=topLevelSlash||alternativeSlashes.some(index=>index>=start&&index<start+segment.length);
   const matches=special?[special.match]:[...segment.matchAll(quantity)].filter(match=>!conditionalTimingCount(segment,match)&&!dimensionReferenceCount(segment,match)&&!cuttingInstructionFragment(segment,match)&&!conditionalBatchTarget(segment,match,fromStep));if(!matches.length||nonIngredientQuantityInstruction(segment,matches,line,fromStep))continue;
   // The first 85g is the canned package mass, NOT the edible tuna after
   // draining. Only the exact owner ingredient-list phrasing proves the
   // separately stated 65g drained solids; do not generalize to other cans.
   const drainedCanName=!fromStep&&matches.length===2?parseRules.drainedCanProduct(segment):null;
   const drainedCanSource=Boolean(drainedCanName)&&
    Number(matches[0][1])>Number(matches[1][1])&&Number(matches[1][1])>0;
   let match=drainedCanSource?matches[1]:matches[0];
   const gramMatches=matches.filter(m=>['g','kg','mg'].includes(m[3]));
   const colon=segment.search(/[:：]/);
   // Imported multi-recipe notes can begin with a numbered recipe title and its
   // parenthesized finished weight before a colon, followed by the first real
   // ingredient in the same `+` segment. Prefer that post-colon gram only for
   // the narrow `(약|총 N g): ingredient N g` heading shape.
   const numberedYieldPrefix=colon>0&&/^\s*\d+(?:-\d+)*[.)]\s*/.test(segment)&&/\(\s*(?:약|총)\s*\d+(?:,\d{3})*(?:\.\d+)?\s*(?:kg|mg|g)\s*\)\s*$/.test(segment.slice(0,colon));
   const headingIngredientGram=numberedYieldPrefix?gramMatches.find(m=>m.index>colon):null;
   const grams=headingIngredientGram||gramMatches.find(m=>depthAt(segment,m.index)===0)||gramMatches[0];
   if(headingIngredientGram)match=headingIngredientGram;
   let name=special?'참치':drainedCanSource?drainedCanName:parsedName(segment.slice(0,match.index));
   // Measured oil poured into a pan is an edible ingredient even when the
   // cooking location precedes its name. Do not infer a product or nutrient
   // value; leave the exact oil identity for resolver/manual confirmation.
   // This does not match fat explicitly retained in a pan for later use.
   const panOil=name.match(/(?:^|\s)팬에\s*(참치기름|올리브유)$/)?.[1];
   if(panOil&&new RegExp('팬에\\s*'+panOil+'\\s*\\d+(?:\\.\\d+)?\\s*(?:g|T|큰술)\\s*(?:두르|\\+)').test(line))name=panOil;
   if(grams&&['개','알','장','봉','팩','캔','쪽','판'].includes(match[3])){
    const between=segment.slice(match.index+match[0].length,grams.index),perItem=between.match(/^\s*당\s+(.+)$/s);
    if(perItem)name=parsedName(perItem[1]);
   }
   if(/^(?:총량|총|전체|완성량|완성 무게|분량)$/.test(name))continue;
   if(!name||name.length>100||/^[\d.\s]+$/.test(name))continue;
   // Counts of obvious serving vessels/tools are instructions, not food.
   if(nonFoodCountName(name)&&matches.some(m=>['개','장'].includes(m[3])))continue;
   // Some imported notes keep a cooking-location prefix inside a nominal
   // [재료] block. Strip it only when the remaining suffix uniquely identifies
   // one of the recipe's declared required ingredients.
   if(hasList&&!fromStep&&/^(?:예열한\s+)?에어프라이어에\s+/.test(name)){
    const listedCandidates=required.filter(candidate=>nutritionKey(name).endsWith(nutritionKey(candidate))).sort((a,b)=>b.length-a.length);
    if(listedCandidates.length===1)name=listedCandidates[0];
   }
   const sourceName=name;
   // Preserve a verified sauce-batch qualifier before cleanName removes the
   // parenthesized source text. Do NOT put this in the saved ingredient name
   // or infer it from another step's target salinity.
   const sourceSalinityPercent=parseRules.sourceSalinityPercent(name,segment.slice(0,match.index));
   // Some imported notes attach a unitless count directly to a declared
   // ingredient before a parenthesized gram amount (e.g. 딸기요거트1(85g)).
   // Remove that count only when the remaining text exactly matches one declared
   // required ingredient, so numbered product names are preserved.
   const attachedCount=name.match(/^(.+?)\s*(\d+)$/);
   if(attachedCount){
    const declared=required.filter(candidate=>nutritionKey(candidate)===nutritionKey(attachedCount[1]));
    if(declared.length===1)name=declared[0];
   }
   // "양파 1/2 (60~70g)" describes a fractional part of the explicitly
   // required onion, not a new ingredient called "양파 1/2".
   // Preserve the documented gram range and original source spelling; do not
   // strip fractions belonging to exact product names or unverified prose.
   const fractionalPart=name.match(/^(.+?)\s+\d+\s*\/\s*\d+$/);
   if(fractionalPart&&gramMatches.some(gram=>depthAt(segment,gram.index)>0)&&
      !required.some(candidate=>nutritionKey(candidate)===nutritionKey(name))){
    const declared=required.filter(candidate=>nutritionKey(candidate)===nutritionKey(fractionalPart[1]));
    if(declared.length===1)name=declared[0];
   }
   if(!hasList||fromStep){
    // `달걀물`/`계란물` is beaten egg, not a later occurrence of an earlier
    // `물` row. Prefer the explicitly declared egg ingredient and preserve the
    // concrete sourceName; without a declared egg, keep it unresolved instead
    // of suffix-matching it to water.
    const beatenEgg=name.match(/^(달걀|계란)물$/);
    const declaredEgg=beatenEgg&&(required.find(candidate=>nutritionKey(candidate)===nutritionKey(beatenEgg[1]))||required.find(candidate=>/^(?:달걀|계란)$/.test(candidate)));
    // In prose, resolve the last explicit ingredient before the quantity.
    const candidates=beatenEgg?(declaredEgg?[declaredEgg]:[]):[...required,...rows.filter(r=>!r.fromStep).map(r=>r.name)].filter(n=>nutritionKey(name).endsWith(nutritionKey(n))).sort((a,b)=>b.length-a.length);
    if(candidates.length)name=candidates[0];
    else if(fromStep&&/가장자리에.*(?:소스|양념)$/.test(name)&&segment.includes('('))continue;
    else if(/넣|섞|볶|끓|팬에|냄비에|후에|분간|초간|덜고|남기|밭쳐|낮추|대신|한\s*장마다|원문\s*기준|절반에/.test(name)){warnings.push(`분량 확인: ${segment.trim()}`);continue;}
   }
   // Prefer an explicit gram weight over a count only when it still describes
   // the same item (e.g. 달걀 2개 약 100g), not a later run-on ingredient.
   const countUnit=['개','알','장','봉','팩','캔','쪽','판','조각'].includes(match[3]);
   const countToGram=grams&&countUnit&&grams.index>match.index?segment.slice(match.index+match[0].length,grams.index):'';
   const sameItemGram=!countUnit||!grams||grams===match||/^\s*당\s+.+$/s.test(countToGram)||/^\s*(?:\(?\s*)?(?:약|총|당|기준)?\s*(?:[=≈≒]\s*)?(?:\)?\s*)?$/.test(countToGram);
   if(grams&&sameItemGram&&!drainedCanSource)match=grams;
   const unit=match[3],factor=unit==='kg'?1000:unit==='mg'?0.001:1;
   const repeat=segment.slice(match.index+match[0].length).match(/^\s*[x×]\s*(\d+(?:\.\d+)?)/i),multiplier=repeat?Number(repeat[1]):1;
   const low=numeric(match[1])*factor*multiplier,high=match[2]?numeric(match[2])*factor*multiplier:low;
   const canonicalUnit=['g','kg','mg'].includes(unit)?'g':['개','알','장','봉','팩','캔','쪽','판'].includes(unit)?'piece':unit==='방울'?'drop':unit==='조각'?'fragment':'spoon';
   if(fromStep){
    const listed=listedStepRepeat(name,rows,required);
    if(listed.length){
     const comparable=listed.filter(row=>row.unit===canonicalUnit);
     const listedAmount=comparable.reduce((sum,row)=>sum+row.maxAmount,0);
     // Gross can weight is not eaten after draining. Ignore it only when a
     // separate drained gram amount exactly matches the ingredient list.
     const mention=line.lastIndexOf(name);
     const canPrep=mention>=0?line.slice(mention+name.length).match(/^\s*(\d+(?:\.\d+)?)\s*g\s+캔\s+\d+개의\s+기름을\s+충분히\s+빼\s+약\s+(\d+(?:\.\d+)?)\s*g\s+준비하기/):null;
     const measuredDrained=comparable.length&&canonicalUnit==='g'&&canPrep&&numeric(canPrep[1])===low&&numeric(canPrep[2])===listedAmount;
     // A quantified, strained blanching bath is not additional food water.
     const strainedBlanch=name==='물'&&canonicalUnit==='g'&&/냄비에\s*물\s*\d+(?:\.\d+)?g\s*넣고\s*강불/.test(line)&&/체에\s*밭쳐/.test(line)&&/물기\s*빼기/.test(line);
     if(comparable.length&&low>listedAmount&&!measuredDrained&&!strainedBlanch)warnings.push(`분량 불일치: ${name}의 조리 단계 분량이 재료 목록보다 많아요. 목록을 함께 수정해 주세요.`);
     continue;
    }
   }
   const baseKey=nutritionKey(section+'|'+name),occurrence=counts.get(baseKey)||0;counts.set(baseKey,occurrence+1);
   const optional=/^\s*\(/.test(line)||/^\s*\(/.test(segment)||/선택|취향/.test(segment)||/선택/.test(section);
   // Moving 12g of dressing already made from the listed components cannot
   // add a new 12g of purchased dressing to the nutrient total. Keep its
   // portion visible; whether any remainder is actually eaten still matters.
   const dressingAliquot=fromStep&&name==='드레싱'&&listedDressingSection&&
     !required.some(candidate=>nutritionKey(candidate)===nutritionKey('드레싱'))&&
     !rows.some(row=>!row.fromStep&&nutritionKey(row.name)===nutritionKey('드레싱'))&&
     rows.filter(row=>!row.fromStep&&row.section.includes('드레싱')&&row.unit==='g').length>=2;
      const reservedZuke=fromStep&&name==='즈케장'&&preparedZuke&&
     /^\s*\d+[.)]\s*즈케장\s+\d+(?:\.\d+)?g은 덮밥용으로 따로 용기에 담아 남겨두기\s*$/.test(line);
const chillingBath=noodleChillingBath(name,section,line);
   const process=/면수|삶을\s*물|육수용|삶는\s*물/.test(name)||(/소바유/.test(name)&&/\(면\s*삶은\s*물\)/.test(segment))||(/면|삶기/.test(section)&&/소금/.test(name))||chillingBath;
   const extraction=discardedScallionRoot(name,body)||(/육수|즈케장/.test(section)&&/다시마|가쓰오|멸치|대파/.test(name));
   const preparation=preparationFor(segment);
   const rinsedCure=rinsedFishCuringSalt(name,body);
   const removedKelp=removedMeasuredKelp(name,body);
   const strainedBonito=removedMeasuredBonito(name,body);
   if(dressingAliquot&&!optional&&!alternative&&!remainingDressingServed)
    warnings.push('드레싱 일부 사용 확인: 만든 드레싱 전량과 실제 먹은 양이 다를 수 있어요. 나머지 드레싱의 섭취 여부를 확인해 주세요.');
   if(rinsedCure&&!optional&&!alternative)warnings.push('염장 후 헹군 소금은 전량 섭취하지 않아요. 실제 흡수된 나트륨은 미확인입니다.');
   if(removedKelp&&!optional&&!alternative)warnings.push('제거한 다시마의 투입 무게를 전량 섭취한 것으로 계산할 수 없어요. 우러난 성분은 미확인입니다.');
   if(strainedBonito&&!optional&&!alternative)warnings.push('거른 가쓰오부시나 건져 버린 가쓰오부시를 전량 먹은 것으로 계산하지 않아요. 우러난 성분의 영양량은 미확인입니다.');
   if(reservedZuke)warnings.push('덮밥용으로 남겨둔 즈케장 분량은 이 연어에 별도로 투입하지 않았어요. 절임장 실제 섭취량을 확인해 주세요.');
   rows.push({key:baseKey+'|'+occurrence,name,sourceName,...(sourceSalinityPercent==null?{}:{sourceSalinityPercent}),section,amount:low,maxAmount:high,unit:canonicalUnit,originalUnit:unit,line:lineIndex,start:offset+start+match.index,end:offset+start+match.index+match[0].length+(repeat?.[0].length||0),optional,fromStep,preparation,intakeUncertain:(process&&!chillingBath&&/(?:소금|염)$/.test(name))||(extraction&&!removedKelp&&!strainedBonito),review:strainedBonito?'육수에 우려내고 제거한 가쓰오부시: 우러난 영양성분 확인 필요':reservedZuke?'다른 요리용으로 따로 보관한 즈케장: 이 연어의 합계 제외':rinsedCure?'헹궈낸 염장용 소금: 실제 흡수량·나트륨 미확인':removedKelp?'조리 후 제거한 다시마: 실제 우러난 영양량 미확인':dressingAliquot?'이미 계량한 드레싱 일부를 덜어 쓰는 양: 중복 합산하지 않음. 남긴 양이 있으면 섭취량 별도 확인':alternative?'대체안 중 사용할 조합을 선택해 주세요.':drainedCanSource?'85g 캔 총중량 대신 기름 제거 후 65g 고형분으로 계산: 실제 회수량 확인':special?'대체 캔 구성 중 기름을 뺀 참치의 권장 투입량으로 계산: 실제 사용량 확인':chillingBath?'면 헹굼용 얼음물: 섭취하지 않는 냉각수':process?'삶은 물·면수의 실제 섭취량 확인':extraction?'건더기를 거르는 육수 재료: 추출되는 영양량 확인':canonicalUnit==='drop'?'방울당 무게는 확인되지 않았어요. 실제 사용량(g)을 입력해 주세요.':canonicalUnit==='fragment'?'조각당 무게는 확인되지 않았어요. 실제 사용량(g)을 입력해 주세요.':high!==low?'범위의 작은 양으로 계산':canonicalUnit==='spoon'?'저울로 잰 g을 입력해 주세요.':fromStep?'조리 단계에서 추가한 재료예요. 재료 목록과 함께 확인해 주세요.':'',included:!optional&&!alternative&&!process&&!extraction&&!dressingAliquot&&!rinsedCure&&!removedKelp&&!strainedBonito&&!reservedZuke});
  }
  offset+=line.length+1;
 }
  if(preparedZuke&&/연어\s+꺼내고,\s*즈케장도\s+충분히\s+붓기/.test(body))
  warnings.push('즈케장 재료의 조리 전 투입량은 실제 먹은 절임장 양과 다를 수 있어요. 연어에 흡수된 성분·남은 절임장을 확인해 주세요.');
if(strainedBlendedIngredients(body))warnings.push('갈거나 으깬 재료를 체에 거른 뒤 먹는 양은 투입량과 다를 수 있어요. 걸러낸 고형분의 영양량을 확인해 주세요.');
 if(!rows.length)warnings.push('계산할 분량을 찾지 못했어요. 재료명 뒤에 g을 적어 주세요.');
 if(rows.length&&!hasList&&firstStep>=0)warnings.push('조리 단계에서 분량을 찾았어요. 반복된 양과 빠진 재료를 확인해 주세요. 재료 목록을 조리 순서 위에 따로 적으면 중복을 줄일 수 있어요.');
 // "건져놓기" (keep the cooked noodles) and "건져서 다시 넣기"
 // (temporarily move food) are NOT evidence of discarded ingredients.
 // Require an explicit discard verb after lifting; keep all other
 // curing, marinating, discarded-oil and leftover-sauce safeguards.
 const discardedAfterLifting=/건져(?:서|내서|낸?\s*(?:후|뒤)?)?\s*(?:버리|폐기|제거)/.test(body);
 if(discardedAfterLifting||/절임|절이|재우|재워|기름.*(?:닦|버리)|양념.*(?:남|버리)/.test(body))
  warnings.push('양념·기름을 남기는 조리법이에요. 투입량 합계와 실제 먹는 양이 다를 수 있어요.');
 // Required ingredients with no detected quantity remain explicit gaps.
 // Require exact ingredient identity unless the recipe itself provides
  // unambiguous evidence for a physical form or a specifically named product.
  // A substring alone is never sufficient (김치 != 김; 참치기름 != 참치).
  // Quantity evidence only, never product/brand/nutrient identity. A recipe
  // can say "에멘탈 10g" while requiring a named Emmental cheese. It proves
  // a measured cheese type, NOT which package supplied its nutrient values.
  // Keep alternative ("A / B") requirements unresolved.
  const quantityShortNameMatches=(requiredName,measuredName)=>{
   const tokens=value=>String(value||'').normalize('NFKC').toLowerCase().trim()
    .split(/\s+/).filter(Boolean);
   if(/[\/|]/.test(requiredName)||/[\/|]/.test(measuredName)||
      /(?:\s|^)(?:또는|or)(?:\s|$)/i.test(requiredName))return false;
   const full=tokens(requiredName),short=tokens(measuredName);
   if(!full.length||!short.length||full.join('')===short.join(''))return false;
   const qualified=long=>{
    const words=tokens(long);
    // Long exact product tail: e.g. "<brand> <multi-word product name>"
    // is measured as "<multi-word product name> 12g".
    const uniqueProductTail=short.length>=3&&short.join('').length>=9&&
     words.length>short.length&&
     words.slice(-short.length).join(' ')===short.join(' ');
    if(uniqueProductTail)return true;
    // These named cheese types can be measured with cutting/form words.
    // Generic "치즈", brand alone, or a seasoning/sauce never qualifies.
    const namedCheeseTypes=new Set(['에멘탈','모짜렐라']);
    const cheeseForms=new Set(['치즈','슬라이스','슈레드']);
    return namedCheeseTypes.has(short[0])&&
     short.slice(1).every(word=>cheeseForms.has(word))&&
     words.includes(short[0])&&words.includes('치즈');
   };
   // If two required products could own the short quantity, do not silently
   // choose one; owner choice is necessary. Exact long names win separately.
   return qualified(requiredName)&&required.filter(qualified).length===1;
  };
  const requiredHasMeasuredRow=(name,row)=>{
   const requiredKey=nutritionKey(name),actualKey=nutritionKey(row.name);
   if(actualKey===requiredKey)return true;
   if(quantityShortNameMatches(name,row.name))return true;
   // Fried garlic sliced into chips is still the same fried garlic. This is
   // quantity identity only; never assign a product's nutrients from here.
   if(requiredKey.length>=3&&actualKey===requiredKey+'슬라이스')return true;
   // In single-line imported notes the title may spell out a specific
   // product while the amount uses its short food noun: "<full pizza> ... 피자 1판".
   // Do not generalize a bare noun from one recipe to an unrelated product.
   const last=String(name).trim().split(/\s+/).at(-1);
   return requiredKey.length>=6&&last&&nutritionKey(last)===actualKey&&
    (lines[row.line]||'').includes(name);
  };
  // Keep source rows that initially satisfied each requirement. A quantity
  // written for an optional/process-only ingredient may not be consumed.
  const requiredEvidence=[];
  for(const name of required){
   const sourceRows=rows.filter(row=>requiredHasMeasuredRow(name,row));
   if(!sourceRows.length)warnings.push('분량 미확인: '+name);
   else requiredEvidence.push({name,rowKeys:sourceRows.map(row=>row.key)});
  }
 return {body,rows,warnings:[...new Set(warnings)],hasList,requiredEvidence};
}

export function nutrientForAmount(metric,quantity,unit,profile={},originalUnit=''){
 // A drop is not a standardized volume or weight: never infer kcal/Na from its count.
 if(!metric||unit==='drop'||unit==='fragment')return null;
 let value=quantity;
 if(unit==='spoon'){
  const mlPerSpoon=spoonMilliliters(originalUnit);if(!mlPerSpoon)return null;
  const ml=quantity*mlPerSpoon;
  value=metric.unit==='ml'?ml:metric.unit==='g'&&profile.gramsPerMl?ml*profile.gramsPerMl:null;
 }else if(unit!==metric.unit){
  let grams=unit==='g'?quantity:unit==='piece'&&profile.gramsPerPiece?quantity*profile.gramsPerPiece:null;
  if(grams==null)return null;
  value=metric.unit==='g'?grams:metric.unit==='ml'&&profile.gramsPerMl?grams/profile.gramsPerMl:metric.unit==='piece'&&profile.gramsPerPiece?grams/profile.gramsPerPiece:null;
 }
 return value==null?null:metric.value*value/metric.amount;
}

export function calculateRecipeNutrition(parsed,resolve,settings={servings:1,overrides:[]}){
 const overrides=new Map((settings.overrides||[]).map(row=>[row.key,row]));
 const totals=Object.fromEntries(Object.keys(NUTRIENTS).map(key=>[key,{value:0,known:0,missing:0}]));
 // Both catalog ambiguity and owner-defined detection-rule ambiguity
 // must remain unresolved; neither is evidence of a measured product.
 const unresolvedReason=reason=>reason==='제품·식재료 연결 확인 필요'||
  reason==='여러 식재료가 연결돼요. 사용할 제품을 선택해 주세요.'||
  reason==='자동 감지 규칙이 여러 식재료에 연결돼요. 사용할 제품을 선택해 주세요.';
 const quantityIdentityKey=name=>{const key=nutritionKey(name);return key==='계란'||key==='달걀'?nutritionKey('달걀'):key;};
 const quantityWarningExtras=new Map(parseRules.quantityWarningExtras.map(([name,extras])=>[nutritionKey(name),extras]));
 // Quantity-only identity for explicit preparation/form words. This does not
 // resolve a product, choose nutrients, or equate arbitrary substrings
 // (butter cookies are not butter; tuna oil is not tuna).
 const verifiedQuantityForm=(requiredName,measuredName)=>{
  const normalized=name=>String(name||'').normalize('NFKC').toLowerCase().trim().replace(/\s+/g,' ');
  const required=normalized(requiredName),measured=normalized(measuredName);
  if(required.length<2)return false;
  if(['냉동','냉장','해동','드라이'].some(form=>measured===form+' '+required))return true;
  // Cutting a weighed ingredient does not turn it into another food. Match
  // the *entire* measured label with a known preparation modifier, not an
  // arbitrary substring: '잘게 부순 김치' must never satisfy '김'.
  const cuttingForms=['잘게 부순','부순','잘게 다진','다진','잘게 썬','썬','채 썬','채썬','반으로 자른'];
  if(cuttingForms.some(form=>measured===form+' '+required))return true;
  // Concatenated physical forms used by the saved recipes. Do not
  // generalize prefixes like 생/포기 to unrelated foods (e.g. 생크림).
  if(required==='감자'&&measured==='생감자')return true;
  if(required==='김치'&&measured==='포기김치')return true;
  // A measured plain Greek yogurt with its brand/descriptors still counts
  // as the recipe's Greek yogurt quantity, not as another food product.
  if(required==='그릭요거트'&&
     (measured==='그릭요거트 플레인'||measured.endsWith(' 그릭요거트 플레인')))return true;
  return false;
 };
 // Exact, original one-pack evidence, not a generic 390g weighed portion.
 // Keep a distinct local name: the calculator already declares sourceLines
 // for resolving alternatives later in this same function.
 const sourcePackLines=String(parsed?.body||'').split('\n');
 const sourcePackRule=row=>parseRules.sourcePackRule(row,sourcePackLines[row.line]||'');
 const resolveRow=row=>{
  const overrideIngredient=overrides.get(row.key)?.ingredient;
  const ingredient=overrideIngredient||row.name;
  const sourceName=row.sourceName||row.name;
  const context={preparation:row.preparation||'',rawName:ingredient,sourceName,ownerSelectedIngredient:!!overrideIngredient,...(row.sourceSalinityPercent==null?{}:{sourceSalinityPercent:row.sourceSalinityPercent})};
  // Only a weighed, original ingredient-list mention of a specific dry pasta
  // shape may use its already-stored generic USDA reference. This is never a
  // license to choose the owner pantry's mixed pasta brand or to invent grams.
  if(!overrideIngredient&&!row.fromStep&&row.unit==='g'&&row.amount>0&&
   (sourceName==='제멜리'||sourceName==='카사레체')&&nutritionKey(ingredient)===nutritionKey(sourceName))
   context.sourceWeighedDryPasta=true;
  const packRule=sourcePackRule(row);
  if(packRule)context.sourcePackSizeGrams=packRule.grams;
  const primary=resolve(ingredient,context);
  if(overrideIngredient||nutritionKey(sourceName)===nutritionKey(ingredient)||!unresolvedReason(primary?.reason))return primary;
  const sourced=resolve(sourceName,{...context,rawName:sourceName});
  return unresolvedReason(sourced?.reason)?primary:sourced;
 };
 const resolvedRows=parsed.rows.map(row=>({row,resolved:resolveRow(row)}));
 // Keep the exact same row deduplication for both calculated totals and
 // required-quantity evidence. A repeated cooking step is not a new portion.
 const listedNames=new Set(resolvedRows.filter(({row})=>!row.fromStep).map(({row,resolved})=>nutritionKey(resolved?.name||row.name)));
 const calculatedRows=resolvedRows.filter(({row,resolved})=>!row.fromStep||!listedNames.has(nutritionKey(resolved?.name||row.name)));
 // Optional/unselected, process-only, manually excluded and zero-percent
 // rows cannot prove that a required ingredient is present in the meal.
 // A user-selected alternative with an explicit include override can.
 const quantityEvidence=calculatedRows.filter(({row})=>
  (overrides.get(row.key)?.included??row.included)&&
  (overrides.get(row.key)?.percent??100)>0
 );
 const resolvedQuantityNames=new Set(quantityEvidence.filter(({resolved})=>!unresolvedReason(resolved?.reason)).map(({row,resolved})=>quantityIdentityKey(resolved?.name||row.name)));
 const quantifiedQuantityNames=new Set(quantityEvidence.flatMap(({row})=>[row.name,row.sourceName].filter(Boolean).map(quantityIdentityKey)));
 // Recheck parser-verified quantities against active calculated rows. The
 // parser cannot know if an ordinary required row was manually excluded.
 // Explicitly optional, unselected variations remain valid exclusions.
 const activeQuantityKeys=new Set(quantityEvidence.map(({row})=>row.key));
 const parserRowsByKey=new Map(parsed.rows.map(row=>[row.key,row]));
 // A measured ingredient in cooking water or strained broth is not an
 // unknown *input* amount; what remains in the eaten food is unmeasured.
 // Keep the resulting intake uncertainty separate from "분량 미확인".
 // Deliberately optional items and explicitly suppressed 0%/excluded rows
 // must not introduce a new warning about the recipe's chosen variation.
 const requiredSourceKeys=new Set((parsed.requiredEvidence||[]).flatMap(item=>item.rowKeys||[]));
 const uncertainIntakeNames=[...new Set(calculatedRows.filter(({row})=>{
  const override=overrides.get(row.key);
  return row.intakeUncertain&&!row.optional&&requiredSourceKeys.has(row.key)&&
   !(override?.included??row.included)&&(override?.percent??100)>0&&
   override?.included!==false&&override?.percent!==0;
 }).map(({row})=>row.name))];
 const intakeWarning=uncertainIntakeNames.length?
  '실제 섭취량 확인: '+uncertainIntakeNames.join('·')+
  '의 투입량은 계량되어 있지만 조리 후 실제 흡수·추출되어 먹는 양은 확인되지 않았어요.':null;
 const inactiveRequired=(parsed.requiredEvidence||[]).filter(item=>
  !item.rowKeys?.some(key=>activeQuantityKeys.has(key))&&
  // Only restore a missing amount after an explicit saved decision to
  // exclude an originally edible, non-optional measured row. Ingredients
  // omitted by the parser (broth extraction, discarded kombu, noodle-water
  // salt, alternative choices or optional garnishes) *were* measured:
  // their issue is intake/choice, not a missing input quantity. Their
  // existing preparation and review notes must retain their meaning.
  item.rowKeys?.some(key=>{
   const row=parserRowsByKey.get(key),override=overrides.get(key);
   return row?.included&&!row.optional&&override&&
    (override.included===false||(override.percent!=null&&override.percent<=0));
  })
 ).map(item=>'분량 미확인: '+item.name);
 // A required, unchosen food/serving alternative must not masquerade as
 // a finished edible total merely because all *other* foods have known
 // nutrients. Reject a cooking-method slash ("1분 / 약불...") as food evidence.
 // Excluded optional choices and explicit nonzero owner selections are separate.
 const unchosenAlternatives=[];
 const confirmedChoices=[];
 const recognizedChoices=[];
 const conflictingChoices=[];
 const foodAlternative=/\d+(?:\.\d+)?\s*(?:g|개|알)\s*\/\s*(?:[가-힣A-Za-z][가-힣A-Za-z ]{0,32}\s*)?\d+(?:\.\d+)?\s*(?:g|개|알)/;
 const measuredRequirements=new Set((parsed.requiredEvidence||[]).flatMap(item=>item.rowKeys||[]));
 const sourceLines=parsed.body.split('\n');
 const alternativeGroups=new Map();
 for(const {row} of calculatedRows){
  if(row.optional||row.review!=='대체안 중 사용할 조합을 선택해 주세요.')continue;
  const group=alternativeGroups.get(row.line)||[];group.push(row);
  alternativeGroups.set(row.line,group);
 }
 for(const [lineIndex,group] of alternativeGroups){
  // Only a complete, standalone two-way list of weighed foods can be
  // resolved by one explicit owner include choice. A '+' mixture or a
  // "100g/125g" shorthand must remain under review.
  const compact=(sourceLines[lineIndex]||'').replace(/\s+/g,'');
  const simple=group.length===2&&group.every(row=>row.unit==='g'&&!row.fromStep)&&
   compact===group.map(row=>(row.sourceName||row.name)+row.amount+row.originalUnit).join('/');
  if(simple){
   const selected=group.filter(row=>(overrides.get(row.key)?.included??row.included)&&
    (overrides.get(row.key)?.percent??100)>0);
   if(selected.length)recognizedChoices.push({group,selected});
   if(selected.length===1)confirmedChoices.push(selected[0].key);
   if(selected.length===2)conflictingChoices.push(
    '대체 재료·분량 선택 확인: 두 대체안을 모두 포함했어요 ('+group.map(row=>row.name).join(' / ')+').'
   );
  }
  // Avoid promoting nonfood instructions such as "sauce finished at 155g/157g"
  // and duplicate missing-quantity warnings for generic "honey / syrup" labels.
  if(!group.some(row=>measuredRequirements.has(row.key)))continue;
  const choice=(sourceLines[lineIndex]||'').match(foodAlternative)?.[0];
  if(!choice)continue;
  if(group.some(row=>(overrides.get(row.key)?.included??row.included)&&
   (overrides.get(row.key)?.percent??100)>0))continue;
  const named=[...new Set(group.filter(row=>measuredRequirements.has(row.key)).map(row=>row.name))];
  const label=named.length<=2?named.join(' / ')+' ('+choice.trim()+')':choice.trim();
  unchosenAlternatives.push('대체 재료·분량 선택 확인: '+label);
 }
 // Existing and restored warnings share the same alias/form safeguards.
 const confirmedChoiceKeys=new Set(confirmedChoices);
 const warnings=[...new Set([...parsed.warnings,...inactiveRequired,...unchosenAlternatives,...conflictingChoices,...(intakeWarning?[intakeWarning]:[])].filter(warning=>{
  const match=warning.match(/^분량 미확인:\s*(.+)$/);if(!match)return true;
  const requiredName=match[1];
  const slashParts=requiredName.split(/\s*\/\s*/).map(nutritionKey);
  // An owner-selected, explicitly weighed member of this exact alternative
  // pair is a measured amount. Selecting *both* still raises the conflict
  // warning above, never a clean result.
  if(slashParts.length===2&&recognizedChoices.some(({group})=>
   group.every(row=>slashParts.includes(nutritionKey(row.name)))&&
   group.every(row=>slashParts.includes(nutritionKey(row.sourceName||row.name)))
  ))return false;
  if(quantityEvidence.some(({row})=>
   verifiedQuantityForm(requiredName,row.name)||verifiedQuantityForm(requiredName,row.sourceName)||
   resolve.quantityEvidenceMatches?.(requiredName,row.name)||
   resolve.quantityEvidenceMatches?.(requiredName,row.sourceName)
  ))return false;
  // Keep pre-dictionary compatibility for old recipes, but allow a saved,
  // explicitly customized detection rule to withdraw a legacy alias.
  const legacyCandidates=(quantityWarningExtras.get(quantityIdentityKey(requiredName))||[])
   .filter(candidate=>resolve.legacyQuantityEvidenceAllowed?.(requiredName,candidate)!==false);
  const candidateKeys=[...(resolve.quantityCandidates?.(requiredName)||[]),...legacyCandidates].map(quantityIdentityKey);
  // A broad resolved pantry identity is insufficient for a specific
  // pasta shape or a required name owned by conflicting detection rules.
  // Check BEFORE legacy candidate fallbacks so old hardcoded aliases
  // cannot override an intentionally ambiguous owner dictionary.
  if(resolve.quantityRequiresExactEvidence?.(requiredName))return true;
  if(candidateKeys.some(key=>quantifiedQuantityNames.has(key)))return false;
  const required=resolve(requiredName,{rawName:requiredName,sourceName:requiredName});
  if(!required?.name||unresolvedReason(required?.reason))return true;
  return !resolvedQuantityNames.has(quantityIdentityKey(required.name));
 }))];
 const rows=calculatedRows.map(({row,resolved})=>{
  const override=overrides.get(row.key),included=override?.included??row.included,percent=override?.percent??100;
  // Recipe-local owner corrections are not product/catalog edits. Each
  // explicit value (including null = confirmed unknown) replaces only
  // that metric while unrelated automatic values retain their sources.
  const baseProfile=resolved?.nutrition||{};
  // Another product must never inherit this row's manual nutrient evidence.
  // Retain the old evidence in the plan so switching back restores it.
  // Resolve to the *current actual pantry product*, never prefer the stale
  // saved override. A stock item may also change its productKey while its
  // human-facing ingredient name stays exactly the same.
  const currentIdentity=resolved?.name||override?.ingredient||row.name;
  const currentProductKey=resolved?.productKey||'';
  // Keep legacy/unbound evidence, but never apply it to an unverified product.
  const evidenceBound=Boolean(override?.evidenceFor&&
   Object.hasOwn(override,'evidencePreparation')&&
   Object.hasOwn(override,'evidenceProductKey'));
  const hasLocalEvidence=Boolean(override?.nutrition&&Object.keys(override.nutrition).length>0);
  const evidenceDormant=Boolean(hasLocalEvidence&&(
   !evidenceBound||
   nutritionKey(override.evidenceFor)!==nutritionKey(currentIdentity)||
   (Object.hasOwn(override,'evidencePreparation')&&override.evidencePreparation!==(row.preparation||''))||
   (Object.hasOwn(override,'evidenceProductKey')&&override.evidenceProductKey!==currentProductKey)
  ));
  const profile=override?.nutrition&&!evidenceDormant?
   {...baseProfile,...override.nutrition}:baseProfile;
  const values={};
  for(const key of Object.keys(NUTRIENTS)){
   const v=nutrientForAmount(profile[key],row.amount,row.unit,profile,row.originalUnit);values[key]=v==null?null:v*percent/100;
   if(included&&percent>0){if(v==null)totals[key].missing++;else{totals[key].known++;totals[key].value+=values[key];}}
  }
  let review=row.review;
  // The same pork-belly fat can appear in the source meat dish and again in
  // a later fried-rice recipe. Keep the numeric proxy in the ingredient row
  // but explicitly preserve uncertainty and cross-recipe reallocation review.
  if(row.name==='삼겹살 굽고 덜어둔 기름'&&included&&percent>0)
   review=[review,'삼겹살에서 따로 회수한 기름: 순수 라드 열량은 상한에 가까운 참고값이에요. 육즙·수분 비율과 나트륨은 미확인이고, 원래 삼겹살 요리 열량에 같은 지방이 이미 포함돼 있으면 함께 합산할 때 중복될 수 있어요.'].filter(Boolean).join(' · ');
  // The pack-level label may include sauce; don't certify the edible meal.
  const packReview=sourcePackRule(row)?.review;
  if(packReview&&included&&percent>0)
   review=[review,packReview].filter(Boolean).join(' · ');
  if(review==='대체안 중 사용할 조합을 선택해 주세요.'&&confirmedChoiceKeys.has(row.key))review='';
  if(row.unit==='spoon'&&review==='저울로 잰 g을 입력해 주세요.')review=['energy','sodium'].some(key=>profile[key]&&values[key]==null)?review:'';
  return {...row,review,included,percent,ingredient:resolved?.name||override?.ingredient||row.name,
   profile,baseProfile,evidenceDormant,resolvedProductKey:currentProductKey,values,resolution:resolved?.reason||''};
 });
 const servings=positive(settings.servings,1000)?settings.servings:1;
 // Only rows actually contributing to totals may invalidate a calculated
 // result. Excluded/0%-use alternatives can retain useful review notes
 // without making a complete result look incomplete in the recipe UI.
 const activeRows=rows.filter(row=>row.included&&row.percent>0);
 return {rows,totals,servings,warnings,excluded:rows.filter(r=>!r.included||r.percent===0),
  partial:activeRows.length===0||warnings.length>0||activeRows.some(row=>row.review)||['energy','sodium'].some(key=>totals[key].missing>0)};
}
