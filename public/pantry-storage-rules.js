import * as VOCAB from './kitchen-vocabulary.js';
const wordsPattern=(words,extra=[])=>new RegExp([...words,...extra].join('|'));
const cerealWords=wordsPattern(['시리얼','그래놀라','크리스피롤'],VOCAB.storageCerealBrands);
const cookieWords=wordsPattern(['쿠키','비스킷','크래커','웨이퍼','전병','과자'],VOCAB.storageCookieBrands);
const noExpiryWords=wordsPattern(['소금','^설탕$','황설탕','흑설탕','맛소금','얼음','생수','탄산수'],VOCAB.storageNoExpiryBrands);
const cannedWords=wordsPattern(['통조림','참치$','캔$'],VOCAB.storageCannedBrands);
// These are stock-rotation targets, not expiry or safety predictions. Ranges
// come from the references below; "기본 목표" rows are application defaults.
// Match food names within their pantry group, never ingredients in a sauce's
// notes or the suggested contents printed on a storage-location label.
const HOME='https://food.unl.edu/free-resource/food-storage/';
const COLD='https://www.foodsafety.gov/food-safety-charts/cold-food-storage-charts';
const CREAM='https://www.dairy.com.au/you-ask-we-answer/can-cream-be-frozen-then-thawed';
const SOURCES={home:{name:'Nebraska Extension',url:HOME},cold:{name:'FoodSafety.gov',url:COLD},cream:{name:'Dairy Australia',url:CREAM}};
const plan=(food,amount,unit='days',range='',source='')=>({food,amount,unit,periodLabel:`${amount}${unit==='months'?'개월':'일'}`,range,reference:SOURCES[source]||null});
const months=(food,amount,range='',source='home')=>plan(food,amount,'months',range,range?source:'');
const days=(food,amount,range='',source='home')=>plan(food,amount,'days',range,range?source:'');
const shelfStable=/분말|파우더|시즈닝|가루|건조|말린|캔|통조림/;
const egg=/^(?:(?:난각번호)?\s*\d+\s*번\s*)?(?:달걀|계란)(?:\s*\(\d+번\))?$/;

export function storageArea(location){
 const label=String(location).split(/[·(（]/)[0];
 return /냉동/.test(label)?'frozen':/냉장/.test(label)?'chilled':/실온/.test(label)?'room':null;
}
export const storageLabels={frozen:'냉동',chilled:'냉장',room:'실온'};

function evidenceUrl(notes=[]){
 const line=(notes||[]).map(String).find(value=>/^상품 페이지:\s*https:\/\//.test(value.trim()));
 if(!line)return '';
 try{
  const url=new URL(line.trim().replace(/^상품 페이지:\s*/,''));return url.protocol==='https:'?url.toString():'';
 }catch{return '';}
}

export function productStoragePlan(detail={},area){
 if(!detail.priorityStartDate)return null;
 const lines=(detail.notes||[]).map(value=>String(value||'').trim()).filter(Boolean);
 const evidence=lines.filter(line=>/^(?:보관방법|표시 보관기간·기한|소비기한|유통기한)\s*[:：]/.test(line)).join(' · ');
 if(!/(?:개봉|해동)\s*후/.test(evidence))return null;
 const areaPattern=area==='chilled'?/냉장/:area==='frozen'?/냉동/:area==='room'?/실온/:null;
 if(!areaPattern||!areaPattern.test(evidence))return null;
 const match=evidence.match(/(?:개봉|해동)\s*후[^\n·]{0,120}?(\d+(?:\.\d+)?)\s*(?:[~～〜–—-]\s*(\d+(?:\.\d+)?)\s*)?(일|주|개월|달)/);
 if(!match)return null;
 const first=Number(match[1]),second=Number(match[2]||match[1]);
 if(!Number.isFinite(first)||!Number.isFinite(second)||first<=0||second<=0)return null;
 const lower=Math.min(first,second),unitText=match[3];
 let amount,unit;
 if(unitText==='주'){amount=Math.max(1,Math.ceil(lower*7));unit='days';}
 else if(unitText==='개월'||unitText==='달'){amount=Math.max(1,Math.ceil(lower));unit='months';}
 else{amount=Math.max(1,Math.ceil(lower));unit='days';}
 if((unit==='days'&&amount>3650)||(unit==='months'&&amount>120))return null;
 const label=match[0].replace(/\s+/g,' ').trim();
 return {
  food:/해동\s*후/.test(match[0])?'제품 표시 · 해동 후':'제품 표시 · 개봉 후',
  amount,unit,periodLabel:`${amount}${unit==='months'?'개월':'일'}`,
  range:label,
  reference:{name:'제품 표시 정보',url:evidenceUrl(lines)},
  productEvidence:true,
 };
}

export function storagePlan(name,detail,area){
 const product=productStoragePlan(detail,area);
 if(product)return product;
 const group=detail.group,n=String(name).replace(/\s+/g,''),notes=(detail.notes||[]).join(' ');
 if(/^(?:얼음|물|생수)$/.test(n)||/^(?:천일염|히말라야핑크)?소금$|^설탕$/.test(n))return null;
 if(area==='frozen'){
  if(/아이스크림|젤라[또토]|셔벗|샤베트/.test(n))return months('아이스크림',3,'2~4개월');
  if(group===3&&!shelfStable.test(n)){
   if(/생크림|휘핑크림/.test(n))return months('생크림',3,'3개월','cream');
   if(/버터/.test(n))return months('버터',6,'6~9개월');
   if(/슈레드|잘게썬치즈|갈아놓은치즈/.test(n))return months('슈레드 치즈',4,'3~4개월');
   if(/크림치즈|사워크림|리코타/.test(n))return months('부드러운 유제품 기본 목표',2);
   if(/치즈/.test(n))return months('치즈',6,'6개월');
   if(/우유/.test(n))return months('우유',3,'3개월');
   if(/요거트|요구르트/.test(n))return months('요거트',2,'1~2개월');
   if(egg.test(name))return null;
   if(/전란액|흰자|노른자|계란물|달걀물/.test(n))return months('껍질 없는 달걀',12,'12개월','cold');
  }
  if(group===1&&!shelfStable.test(n)){
   if(/베이컨/.test(n))return months('베이컨',1,'1개월','cold');
   if(/소시지|소세지|햄/.test(n))return months('가공육',2,'1~2개월','cold');
   if(/어묵|훈제|양념|완자|미트볼|구이/.test(n))return months('조리·가공 식품 기본 목표',3);
   if(/다짐|다진|분쇄/.test(n))return months('다진 고기',4,'3~4개월','cold');
   if(/닭가슴|닭다리|닭안심|닭날개|닭고기|생닭/.test(n))return months('닭고기 조각',9,'9개월','cold');
   if(/한우|소고기|쇠고기|돼지|삼겹|목살|등심|안심|채끝|양고기/.test(n))return months('덩어리 고기',6,'4~12개월','cold');
   if(/연어|고등어|꽁치|참치|삼치/.test(n))return months('지방 많은 생선',3,'2~3개월','cold');
   if(/가자미|대구|명태|볼락|광어|흰살/.test(n))return months('흰살 생선',6,'4~8개월','cold');
   if(/새우|오징어/.test(n))return months('새우·오징어',6,'6~18개월','cold');
  }
  if(group===0&&/빵|바게트|치아바타|베이글|식빵/.test(n))return months('빵',3,'3~5개월');
  if(group===2&&!shelfStable.test(n)){
   if(/바나나/.test(n))return months('바나나',3,'2~3개월');
   if(/블루베리|딸기|복숭아|파인애플/.test(n))return months('과일',10,'8~12개월');
   if(/양파|당근|브로콜리|시금치|양배추/.test(n))return months('채소',10,'10~12개월');
   return months('채소·과일 기본 목표',8);
  }
  if(group===5&&/피자/.test(n))return months('피자',2,'1~2개월','cold');
  if(group===5&&/너겟|패티/.test(n))return months('너겟·패티',3,'1~3개월','cold');
  if(group===4&&/육수|스톡/.test(n))return months('육수·소스 기본 목표',3);
  return months('냉동 식재료 기본 목표',3);
 }
 if(area==='chilled'){
  if(group===3&&!shelfStable.test(n)){
   if(egg.test(name))return days('달걀',28,'3~5주','cold');
   if(/미개봉|개봉 전/.test(notes))return null;
   if(/생크림|휘핑크림/.test(n))return days('생크림 기본 목표',7);
   if(/우유/.test(n))return days('우유',7,'7일');
   if(/버터/.test(n))return months('버터',2,'1~2개월');
   if(/크림치즈|브리|까망베르/.test(n))return days('부드러운 치즈',14,'1~2주');
   if(/치즈/.test(n))return months('치즈 기본 목표',1);
   if(/요거트|요구르트|사워크림/.test(n))return days('발효 유제품',14,'1~2주');
  }
  if(group===1&&!shelfStable.test(n)){
   if(/베이컨|소시지|소세지|햄/.test(n))return days('가공육 기본 목표',7);
   if(/다짐|다진|닭|오리|생선|새우|오징어|가자미|대구|명태|볼락|광어|연어/.test(n))return days('고기·생선 기본 목표',2);
   return days('고기·해산물 기본 목표',3);
  }
  if(group===2&&!shelfStable.test(n))return days('채소·과일 기본 목표',7);
  if(group===5)return days('간편식 기본 목표',3);
  return openedCondimentPlan(n,'chilled');
 }
 if(area==='room'){
  if(group===1||group===3)return null;
  if(group===0&&/빵|바게트|치아바타|베이글|떡/.test(n))return days('빵·떡 기본 목표',3);
  if(group===2&&/감자|양파/.test(n))return months('감자·양파',1,'1개월');
  if(group===0)return months('곡물·면 기본 목표',6);
  if(group===6&&/호두|견과|아몬드|피스타치오|잣/.test(n))return months('견과 기본 목표',3);
  return openedCondimentPlan(n,'room');
 }
 return null;
}

// Opened-pantry quality targets (Nebraska Extension "Food Storage" chart,
// shorter end of each range). These are quality checks, not safety dates:
// they are shown without the expiry warning colour, like frozen targets.
const quality=(food,amount,unit,range)=>({...plan(food,amount,unit,range,'home'),qualityOnly:true});
function openedCondimentPlan(n,area){
 if(noExpiryWords.test(n))return null;
 if(area==='chilled'){
  if(/마요네즈/.test(n))return quality('개봉 마요네즈',2,'months','2개월');
  if(/케첩|케찹/.test(n))return quality('개봉 케첩',6,'months','6개월');
  if(/머스터드|겨자/.test(n))return quality('개봉 머스터드',12,'months','1년');
  if(/드레싱/.test(n))return quality('개봉 드레싱',1,'months','1~3개월');
  if(/잼|마멀레이드|콩포트/.test(n))return quality('개봉 잼',6,'months','6~12개월');
  if(/피클|할라피뇨/.test(n))return quality('개봉 피클',1,'months','1~3개월');
  if(/살사/.test(n))return quality('개봉 살사',1,'months','1개월');
  if(/바비큐|bbq|돈까스소스|돈가스소스|칠리소스|스리라차|핫소스|굴소스|데리야끼/i.test(n))return quality('개봉 소스',4,'months','4개월');
  if(/올리브유|아보카도유|식용유|카놀라유|해바라기유|포도씨유|땅콩기름|참기름|들기름|고추기름|산초유/.test(n))return quality('개봉 식용유',4,'months','4개월');
  return null;
 }
 if(/땅콩버터|아몬드버터/.test(n))return quality('개봉 땅콩버터',2,'months','2~3개월');
 if(/꿀|벌꿀/.test(n))return quality('꿀',24,'months','2년');
 if(/식초/.test(n))return quality('개봉 식초',12,'months','1년');
 if(/올리브유|아보카도유|식용유|카놀라유|해바라기유|포도씨유|땅콩기름|참기름|들기름|고추기름|산초유/.test(n))return quality('개봉 식용유',3,'months','3~5개월');
 if(/튀김가루|부침가루|믹스|호떡/.test(n)&&!/커피|티|차$|음료/.test(n))return quality('가루 믹스',12,'months','12~18개월');
 if(/^통|통후추|통펜넬|통계피|정향|팔각/.test(n)&&!/통조림|통마늘/.test(n))return quality('통 향신료',36,'months','3~4년');
 if(/타임|로즈마리|오레가노|파슬리|딜|월계수|바질$|건바질|허브/.test(n))return quality('말린 허브',12,'months','1~2년');
 if(/분말|파우더|가루|시즈닝|파프리카|시나몬|계피|육두구|후추|페페론치노|고춧가루/.test(n))return quality('가루 향신료·시즈닝',24,'months','2~3년');
 if(cerealWords.test(n))return quality('개봉 시리얼',2,'months','2~3개월');
 if(cookieWords.test(n))return quality('포장 쿠키·과자',2,'months','2개월');
 if(cannedWords.test(n))return quality('통조림',12,'months','12~18개월');
 return null;
}
