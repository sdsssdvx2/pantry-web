// Estimate a recipe's hands-on wall-clock time from its own text.
// The estimate is only a suggestion: the editor never overwrites a saved time
// and the detail view only hints when the text clearly disagrees.
const clean=value=>String(value??'').normalize('NFKC');

const totalRE=/(?:총\s*(?:소요\s*|조리\s*)?시간|전체\s*(?:소요\s*)?시간|소요\s*시간)\s*[:：]?\s*(?:약\s*)?(\d+(?:\.\d+)?)\s*(시간|분)(?:\s*(\d+(?:\.\d+)?)\s*분)?/;
// "(…총 4분 30초…)" inside a single step replaces the step's partial timers.
const lineTotalRE=/총\s*(?:약\s*)?(\d+(?:\.\d+)?)\s*(시간|분|초)(?:\s*(\d+(?:\.\d+)?)\s*(분|초))?/;
const durationRE=/(\d+(?:\.\d+)?)\s*(?:[~～〜–—-]\s*(\d+(?:\.\d+)?)\s*)?(초|분|시간)(?!\s*(?:전|후에?\s*추가|이내에?\s*(?:먹|드시|섭취)))/g;
const strongPassiveRE=/해동|숙성|불리|불려|불린|재우|재워|재운|절이|절여|발효|하룻밤|반나절|밤새|냉장고?\s*(?:에서|에)?\s*(?:\d|하루)|냉동실?\s*(?:에서|에)?\s*\d/;
const softPassiveRE=/(?:냉장|냉동)(?:고|실)?(?:에|에서)?\s*(?:넣|두|보관)|실온(?:에|에서)?\s*(?:두|놓|보관|\d)|식히|식혀|굳히|굳혀|휴지|레스팅|뜸/;
const concurrentRE=/그\s*동안|동시에|한편|사이(?:에|동안)|기다리는\s*동안|[는은한]\s*동안/;
const boilWaterRE=/팔팔\s*끓으면|물이\s*끓으면|물을?\s*끓여|면수/;
const pastaUntimedRE=/(?:면|파스타|스파게티|국수|소면|우동|라면)[^.]{0,20}(?:넣|삶)[^.]{0,30}(?:권장\s*시간|포장\s*(?:지|표시)|봉지\s*표시)/;
const heatWaitRE=/끓기\s*시작하면|끓어\s*오르면|끓어오르면|끓으면|끓을\s*때|\d+\s*(?:~\s*\d+\s*)?도\s*(?:가\s*)?되면|달궈지면|달군\s*(?:팬|냄비)|기름이\s*뜨거워지면/;
const cookingHeaderRE=/^[\[(【<]?\s*(?:조리(?:\s*(?:순서|방법|과정))?|만드는\s*(?:법|방법)|만들기|요리\s*순서|순서|방법|레시피)\s*[\])】>]?\s*[:：]?$/;
const sectionHeaderRE=/^[\[(【<][^\])】>]{1,30}[\])】>]\s*$/;
const numberedRE=/^\s*\d+\s*[.)]\s*/;
const stepTitleRE=/^(?:step|단계)\s*\d+|^\d+\s*단계/i;
// A single wait of 90+ minutes is a marinade/rest/cure, not hands-on cooking.
const LONG_WAIT_MINUTES=90;
const quantityRE=/\d+(?:\.\d+)?\s*(?:kg|g|mg|ml|mL|ML|l|L|개|큰술|작은술|스푼|숟가락|T|t|컵|장|쪽|알|줌|꼬집|인분|조각|모|봉지?|팩|캔|대|줄기|송이|cm|mm|%)/;
const verbRE=/(?:넣|볶|끓|굽|구워|섞|붓|부어|두르|올리|뿌리|담|데우|데피|익히|삶|튀기|튀겨|졸이|졸여|뒤집|자르|잘라|썰|다지|젓|저어|찌|쪄|녹이|녹여|흔들|버무|바르|발라|빼|건지|식히|식혀|꺼내|덮|조리|굽기|마무리)/;
const knifeCueRE=/채\s*썰|썰기|썰어|다지기|다져|다진\s*(?!마늘\s*\d|생강\s*\d)|자르기|잘라|손질|껍질|깍둑|슬라이스|강판|갈아|나박|어슷/;

const minutes=(value,unit)=>unit==='시간'?value*60:unit==='초'?value/60:value;
const roundMinutes=value=>Math.max(1,Math.round(value));

function durations(text){
 const out=[],seen=new Set();
 for(const match of text.matchAll(durationRE)){
  // "파 볶기 (1분 30초) … 1분 30초간 볶습니다" repeats one timer as a title.
  const signature=match[0].replace(/\s+/g,'');
  if(seen.has(signature))continue;
  seen.add(signature);
  const a=minutes(Number(match[1]),match[3]),b=minutes(Number(match[2]||match[1]),match[3]);
  if(!Number.isFinite(a)||!Number.isFinite(b)||a<0||b<0)continue;
  // "양면 1분씩", "앞뒤로 2분씩" and "2분씩 3번" repeat the same timer.
  const after=text.slice((match.index||0)+match[0].length,(match.index||0)+match[0].length+12);
  const before=text.slice(Math.max(0,(match.index||0)-14),match.index||0);
  let repeat=1;
  if(/^\s*씩/.test(after)){
   const count=after.match(/^\s*씩\s*(\d+)\s*(?:번|회)/);
   if(count)repeat=Math.min(10,Number(count[1]));
   else if(/양면|앞뒤|각각|각\s*면|두\s*면|한\s*면씩/.test(before))repeat=2;
  }
  out.push({min:Math.min(a,b)*repeat,max:Math.max(a,b)*repeat,text:match[0]});
 }
 return out;
}

function lineTotal(text){
 const match=text.match(lineTotalRE);
 if(!match)return null;
 let value=minutes(Number(match[1]),match[2]);
 if(match[3])value+=minutes(Number(match[3]),match[4]);
 return Number.isFinite(value)&&value>0?value:null;
}

function actionEstimate(text){
 // Rough hands-on minutes for an untimed step. Kept deliberately small: a
 // timed recipe is driven by its timers, not by the number of verbs.
 if(/예열/.test(text))return /오븐|에어\s*프라이어|에어프라이기/.test(text)?5:2;
 if(/오븐|에어\s*프라이어|에어프라이기/.test(text)&&/굽|구워|돌리|넣/.test(text))return 12;
 if(/튀기|튀겨/.test(text))return 6;
 if(/삶|끓이|끓여|졸이|졸여|찌|쪄|익히|익혀|조리/.test(text))return 4;
 if(/굽|구워|볶/.test(text))return 4;
 if(knifeCueRE.test(text))return 3;
 if(/섞|버무|휘핑|반죽|치대|젓|저어|풀어|녹이|녹여|데우|데피/.test(text))return 1;
 if(/넣|붓|부어|뒤집|건지|꺼내|덜어|담|올리|뿌리|마무리|제거|버리|두르|바르|발라|곁들/.test(text))return 0.5;
 return 0;
}

function looksLikeIngredient(line){
 if(numberedRE.test(line))return false;
 if(!quantityRE.test(line))return false;
 // "양파 140g (3mm 채썰기)" is an ingredient row even though it carries a
 // prep note; a real step normally starts with a verb phrase or a timer.
 const head=line.replace(/\([^)]*\)/g,' ');
 return !verbRE.test(head)||/^[^\s]+(?:\s+[^\s]+){0,4}\s+\d/.test(head)&&!/(?:고|며|서|면)\s/.test(head);
}

function splitLines(source){
 return source.split(/\r?\n/).map(line=>line.replace(/\s+/g,' ').trim()).filter(Boolean);
}

function partition(lines){
 const headerIndex=lines.findIndex(line=>cookingHeaderRE.test(line));
 if(headerIndex>=0)return {ingredients:lines.slice(0,headerIndex),steps:lines.slice(headerIndex+1).filter(line=>!sectionHeaderRE.test(line)&&!stepTitleRE.test(line))};
 const firstNumbered=lines.findIndex(line=>numberedRE.test(line));
 if(firstNumbered>0)return {ingredients:lines.slice(0,firstNumbered),steps:lines.slice(firstNumbered).filter(line=>!sectionHeaderRE.test(line)&&!stepTitleRE.test(line))};
 const ingredients=[],steps=[];
 for(const line of lines){
  if(sectionHeaderRE.test(line)||stepTitleRE.test(line))continue;
  (looksLikeIngredient(line)?ingredients:steps).push(line);
 }
 return {ingredients,steps};
}

function subSteps(line){
 const body=line.replace(numberedRE,'');
 return body.split(/\s*(?:→|->|⇒|➜)\s*|(?<=[.!?。])\s+(?=\S)/).map(part=>part.trim()).filter(Boolean);
}

function passiveWait(part,ds){
 if(!ds.length)return 0;
 const max=ds.reduce((sum,d)=>sum+d.max,0);
 if(strongPassiveRE.test(part)||ds.some(d=>d.max>=LONG_WAIT_MINUTES))return max;
 if(softPassiveRE.test(part)&&max>=20)return max;
 return 0;
}

export function estimateRecipeTime(text=''){
 const source=clean(text);
 if(!source.trim())return null;
 const total=source.match(totalRE);
 if(total){
  let value=minutes(Number(total[1]),total[2]);
  if(total[3])value+=Number(total[3]);
  if(Number.isFinite(value)&&value>0&&value<=1440)return {
   minutes:roundMinutes(value),min:roundMinutes(value),max:roundMinutes(value),
   activeMinutes:roundMinutes(value),passiveMinutes:0,confidence:'high',basis:'explicit-total',
   timedSteps:1,estimatedSteps:0,reason:`본문의 전체 소요시간 ${total[0].replace(/^.*?(\d)/,'$1')}을 사용`
  };
 }

 const {ingredients,steps}=partition(splitLines(source));
 let prep=0;
 for(const line of ingredients)if(knifeCueRE.test(line))prep+=1.5;
 prep=Math.min(prep,12);

 let timerMin=0,timerMax=0,actionTime=0,passiveMax=0,timedSteps=0,estimatedSteps=0,concurrent=false,stepCount=0;
 for(const line of steps){
  const override=lineTotal(line);
  let lineTimed=false,lineTimerMin=0,lineTimerMax=0;
  for(const part of subSteps(line)){
   const ds=durations(part);
   const passive=passiveWait(part,ds);
   if(passive){passiveMax+=passive;continue;}
   stepCount++;
   const isConcurrent=concurrentRE.test(part);
   if(isConcurrent)concurrent=true;
   const heatWait=boilWaterRE.test(part)&&heatWaitRE.test(part)?6:heatWaitRE.test(part)?3:0;
   const untimedPasta=pastaUntimedRE.test(part)?9:0;
   if(ds.length){
    lineTimed=true;
    const min=ds.reduce((sum,d)=>sum+d.min,0),max=ds.reduce((sum,d)=>sum+d.max,0);
    if(isConcurrent){
     // Work done while another timer runs only adds its own longest timer.
     lineTimerMin+=Math.max(...ds.map(d=>d.min));lineTimerMax+=Math.max(...ds.map(d=>d.max));
    }else{lineTimerMin+=min;lineTimerMax+=max;}
    actionTime+=heatWait+untimedPasta+0.3;
   }else{
    if(isConcurrent)continue;
    const estimate=actionEstimate(part)+heatWait+untimedPasta;
    if(!estimate)continue;
    actionTime+=estimate;
    estimatedSteps++;
   }
  }
  if(override&&lineTimed){lineTimerMin=override;lineTimerMax=override;}
  if(lineTimed){timedSteps++;timerMin+=lineTimerMin;timerMax+=lineTimerMax;}
 }
 // Untimed prose steps are uncertain; cap their contribution so a long list of
 // small verbs does not outweigh the recipe's explicit timers.
 actionTime=Math.min(actionTime,timedSteps?30:45);
 const base=prep+actionTime;
 const activeMin=timerMin+base*0.75,activeMax=timerMax+base*1.25;
 if(activeMax<=0)return null;
 const midpoint=(timerMin+timerMax)/2+base;
 const timerShare=(timerMin+timerMax)/2/Math.max(1,midpoint);
 const confidence=timedSteps>=2&&timerShare>=0.4?'high':timedSteps>=1?'medium':'low';
 return {
  minutes:roundMinutes(midpoint),
  min:roundMinutes(activeMin),
  max:roundMinutes(Math.max(activeMax,activeMin)),
  activeMinutes:roundMinutes(midpoint),
  passiveMinutes:passiveMax?roundMinutes(passiveMax):0,
  confidence,
  basis:timedSteps?'timers-and-actions':'actions-only',
  timedSteps,
  estimatedSteps,
  concurrent,
  reason:timedSteps
   ?`조리 단계의 명시 시간 ${timedSteps}개와 손질·가열 대기 등 짧은 작업 시간을 합산`
   :'본문 동작 수를 기준으로 한 낮은 신뢰도 추정',
 };
}

// The detail view hints only when a confident estimate clearly disagrees with
// the saved time. Small differences are expected and not worth a warning.
export function recipeTimeNeedsReview(estimate,current){
 const saved=Number(current);
 if(!estimate||estimate.confidence!=='high'||!(saved>0))return false;
 const difference=Math.abs(estimate.minutes-saved);
 return difference>=Math.max(10,saved*0.4);
}

export function recipeTimeSuggestionText(estimate,current){
 if(!estimate)return '';
 const range=estimate.min===estimate.max?`${estimate.minutes}분`:`약 ${estimate.minutes}분 (${estimate.min}~${estimate.max}분)`;
 const waiting=estimate.passiveMinutes?` · 해동·숙성 등 별도 대기 약 ${estimate.passiveMinutes}분`:'';
 const currentText=Number(current)>0?`현재 ${Number(current)}분 · `:'';
 const confidence=estimate.confidence==='high'?'근거 충분':estimate.confidence==='medium'?'중간 신뢰도':'낮은 신뢰도';
 return `${currentText}본문 추정 ${range} (${confidence})${waiting}`;
}
