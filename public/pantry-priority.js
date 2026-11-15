import {storagePlan,storageArea,storageLabels} from './pantry-storage-rules.js';
const DAY=86400000;
const dateFormat=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'});
const PRIORITY_AREAS=new Set(['room','chilled','frozen','custom']);

function utcDayFromParts(year,month,day){return Date.UTC(year,month-1,day);}

// Keep calendar dates stable across devices, including ones outside Korea.
export function pantryDateValue(value=new Date()){
 if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value))return value;
 const date=new Date(value);if(!Number.isFinite(date.getTime()))return '';
 return dateFormat.format(date);
}

export function priorityDateInfo(value,now=new Date()){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
 const [year,month,day]=value.split('-').map(Number),target=utcDayFromParts(year,month,day);
 const check=new Date(target);
 if(check.getUTCFullYear()!==year||check.getUTCMonth()!==month-1||check.getUTCDate()!==day)return null;
 const todayParts=pantryDateValue(now).split('-').map(Number);
 const today=utcDayFromParts(...todayParts);
 const days=Math.round((target-today)/DAY);
 return {
  value,
  days,
  dateLabel:`${year!==todayParts[0]?year+'.':''}${month}.${day}.`,
  relativeLabel:days<0?`${Math.abs(days)}일 지남`:days===0?'오늘':days===1?'내일':`${days}일 남음`,
  urgency:days<0?'overdue':days<=3?'urgent':days<=7?'soon':'later'
 };
}

function targetDate(anchor,plan){
 const [year,month,day]=anchor.split('-').map(Number);
 if(plan.unit==='days')return new Date(utcDayFromParts(year,month,day)+plan.amount*DAY).toISOString().slice(0,10);
 const end=new Date(Date.UTC(year,month-1+plan.amount+1,0));
 return new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth(),Math.min(day,end.getUTCDate()))).toISOString().slice(0,10);
}

function customPriorityPlan(rule){
 if(!rule||typeof rule!=='object'||Array.isArray(rule))return null;
 const amount=Number(rule.amount),unit=rule.unit;
 if(!Number.isInteger(amount)||amount<1||!['days','months'].includes(unit))return null;
 return {food:'직접 설정',amount,unit,periodLabel:`${amount}${unit==='months'?'개월':'일'}`,range:'',reference:null,custom:true};
}

function selectedAreas(detail){return [...new Set((detail.locations||[]).map(storageArea))];}
function defaultPlanRows(name,detail,areas,anchor){
 return areas.map(area=>{
  if(!area)return null;
  const rule=storagePlan(name,detail,area);
  return rule?{...rule,area,value:targetDate(anchor,rule)}:null;
 });
}

// New saves keep one custom period per storage area. Legacy {amount,unit}
// records are mapped to the area that would otherwise produce the earliest
// automatic target, which matches the editor's "edit the fastest rule" model.
export function priorityRuleByArea(name,detail={},now=new Date()){
 const stored=detail.priorityRule;
 if(!stored||typeof stored!=='object'||Array.isArray(stored))return {};
 const out={};
 if(stored.byArea&&typeof stored.byArea==='object'&&!Array.isArray(stored.byArea)){
  for(const [area,rule] of Object.entries(stored.byArea))if(PRIORITY_AREAS.has(area)&&customPriorityPlan(rule))out[area]={amount:Number(rule.amount),unit:rule.unit};
  return out;
 }
 const legacy=customPriorityPlan(stored);if(!legacy)return {};
 const areas=selectedAreas(detail).filter(Boolean);
 let area=areas[0]||'custom';
 const anchor=pantryDateValue(detail.priorityStartDate||detail.addedAt);
 if(areas.length&&priorityDateInfo(anchor,now)){
  const defaults=defaultPlanRows(name,detail,areas,anchor).filter(Boolean).sort((a,b)=>a.value.localeCompare(b.value));
  if(defaults[0]?.area)area=defaults[0].area;
 }
 out[area]={amount:legacy.amount,unit:legacy.unit};
 return out;
}

function automaticPriority(name,detail={},now=new Date()){
 if(detail.status==='incoming'||(!detail.priorityStartDate&&!detail.addedAt))return null;
 const anchor=pantryDateValue(detail.priorityStartDate||detail.addedAt);
 if(!priorityDateInfo(anchor,now))return null;
 const areas=selectedAreas(detail),rules=priorityRuleByArea(name,detail,now);
 if(!areas.length){
  const custom=customPriorityPlan(rules.custom);if(!custom)return null;
  const plan={...custom,area:'custom',value:targetDate(anchor,custom)},info=priorityDateInfo(plan.value,now);
  return {...info,source:'auto',anchor,anchorSource:detail.priorityStartDate?'storage':'added',planDays:Math.round((Date.parse(plan.value)-Date.parse(anchor))/DAY),plan,mixed:false,quality:false,customRule:true};
 }
 if(areas.some(area=>!area))return null;
 const plans=areas.map(area=>{
  const custom=customPriorityPlan(rules[area]);
  const rule=custom||storagePlan(name,detail,area);
  return rule?{...rule,area,value:targetDate(anchor,rule)}:null;
 });
 if(plans.some(plan=>!plan))return null;
 const plan=plans.sort((a,b)=>a.value.localeCompare(b.value))[0],info=priorityDateInfo(plan.value,now);
 return {...info,source:'auto',anchor,anchorSource:detail.priorityStartDate?'storage':'added',planDays:Math.round((Date.parse(plan.value)-Date.parse(anchor))/DAY),plan,mixed:areas.length>1,quality:plan.area==='frozen'||!!plan.qualityOnly,customRule:!!plan.custom};
}

export function stockPriorityDate(name,detail={},now=new Date()){
 const manual=priorityDateInfo(detail.priorityDate,now);
 if(manual)return {...manual,source:'manual'};
 return automaticPriority(name,detail,now);
}

export function stockAutomaticPriorityDate(name,detail={},now=new Date()){return automaticPriority(name,{...detail,priorityDate:''},now);}

export function priorityLabel(info){return info?.source==='auto'?(info.customRule?'직접 계산':info.quality?(info.plan?.area==='frozen'?'냉동 품질':'개봉 품질'):'자동'):'직접 지정';}
export function priorityBasis(info){
 if(info?.source!=='auto')return '';
 const {plan,anchor,anchorSource,mixed}=info,suffix=mixed?' · 여러 보관 장소 중 빠른 목표':'';
 if(plan.custom){const area=storageLabels[plan.area];return `${area?area+' · ':''}직접 설정 · ${plan.periodLabel} (${anchorSource==='storage'?'보관 기준일':'추가일'} ${anchor})${suffix}`;}
 return `${storageLabels[plan.area]} · ${plan.food} · ${plan.periodLabel} (${anchorSource==='storage'?'보관 기준일':'추가일'} ${anchor})${suffix}`;
}

export function sortPantryByPriority(pantry,getStock,now=new Date()){
 return pantry.map((name,index)=>({name,index,date:getStock(name).status==='incoming'?null:stockPriorityDate(name,getStock(name),now)}))
  .sort((a,b)=>(a.date?.value||'9999').localeCompare(b.date?.value||'9999')||a.index-b.index).map(row=>row.name);
}

export function priorityPantryItems(pantry,getStock,now=new Date(),limit=6){
 const rows=[];
 for(const name of pantry||[]){
  const detail=getStock(name);
  if(!detail||detail.status==='incoming')continue;
  const info=stockPriorityDate(name,detail,now);if(!info)continue;
  rows.push({name,status:detail.status,...info});
 }
 rows.sort((a,b)=>a.value.localeCompare(b.value)||a.name.localeCompare(b.name,'ko'));
 return {items:rows.slice(0,limit),total:rows.length};
}
