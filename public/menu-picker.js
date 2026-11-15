import {priorityDateInfo} from './pantry-priority.js';

const DAY=86400000;

function clampRandom(value){
 const n=Number(value);
 if(!Number.isFinite(n))return 0;
 return Math.min(Math.max(n,0),0.999999999);
}

export function priorityIngredientWeight(recipe,{priorityDates={},now=Date.now()}={}){
 let weight=1;
 const current=now instanceof Date?now:new Date(now);
 for(const match of recipe?.matches||[]){
  const actual=match?.actual,info=actual?priorityDateInfo(priorityDates?.[actual],current):null;
  if(!info)continue;
  const candidate=info.days<=0?1.6:info.days<=3?1.45:info.days<=7?1.25:info.days<=14?1.1:1;
  weight=Math.max(weight,candidate);
 }
 return weight;
}

export function menuPickWeight(recipe,{lastCooked={},priorityDates={},now=Date.now()}={}){
 const cookedAt=Date.parse(lastCooked?.[recipe?.id]||'');
 let recency=1;
 if(Number.isFinite(cookedAt)){
  const age=Math.max(0,Number(now)-cookedAt);
  recency=age<DAY?0.08:age<3*DAY?0.2:age<7*DAY?0.45:age<14*DAY?0.75:1;
 }
 const rating=Number(recipe?.rating||0);
 const preference=!rating?1:0.85+0.05*Math.min(Math.max(rating,1),5);
 return recency*preference*priorityIngredientWeight(recipe,{priorityDates,now});
}

export function pickMenu(pool,{lastPicked=null,lastCooked={},priorityDates={},now=Date.now(),random=Math.random}={}){
 let candidates=Array.isArray(pool)?pool.filter(Boolean):[];
 if(!candidates.length)return null;
 if(candidates.length>1&&lastPicked)candidates=candidates.filter(recipe=>recipe.id!==lastPicked);
 if(!candidates.length)return null;
 const weighted=candidates.map(recipe=>({recipe,weight:Math.max(menuPickWeight(recipe,{lastCooked,priorityDates,now}),0.0001)}));
 const total=weighted.reduce((sum,item)=>sum+item.weight,0);
 let needle=clampRandom(random())*total;
 for(const item of weighted){
  needle-=item.weight;
  if(needle<=0)return item.recipe;
 }
 return weighted.at(-1)?.recipe||null;
}


export function menuPickReasons(recipe,{lastCooked={},priorityDates={},now=Date.now()}={}){
 const reasons=[],current=now instanceof Date?now:new Date(now);
 const priority=(recipe?.matches||[]).map(match=>{
  const actual=match?.actual,info=actual?priorityDateInfo(priorityDates?.[actual],current):null;
  return actual&&info&&info.days<=14?{actual,info}:null;
 }).filter(Boolean).sort((a,b)=>a.info.days-b.info.days)[0];
 if(priority)reasons.push(`소비 우선 · ${priority.actual} ${priority.info.relativeLabel}`);
 const cookedAt=Date.parse(lastCooked?.[recipe?.id]||'');
 if(!Number.isFinite(cookedAt))reasons.push('최근 조리 기록 없음');
 else{
  const days=Math.floor(Math.max(0,Number(current)-cookedAt)/DAY);
  if(days>=14)reasons.push('최근 2주 이상 안 먹음');
  else if(days>=7)reasons.push('최근 1주 이상 안 먹음');
  else if(days>=3)reasons.push('최근 3일 이상 안 먹음');
 }
 const rating=Number(recipe?.rating||0);
 if(rating>=4)reasons.push(`내 별점 ★${Number.isInteger(rating)?rating:rating.toFixed(1)}`);
 if(reasons.length<2)reasons.push('필수 재료 모두 있음');
 if(reasons.length<2&&recipe?.time)reasons.push(`약 ${recipe.time}분`);
 return [...new Set(reasons)].slice(0,2);
}

export function pickMenus(pool,{count=3,excludeIds=[],lastCooked={},priorityDates={},now=Date.now(),random=Math.random}={}){
 const source=Array.isArray(pool)?pool.filter(Boolean):[];
 if(!source.length)return [];
 const limit=Math.max(1,Math.min(source.length,Math.floor(Number(count)||3)));
 const excluded=new Set((Array.isArray(excludeIds)?excludeIds:[excludeIds]).filter(Boolean));
 const fresh=source.filter(recipe=>!excluded.has(recipe.id));
 let candidates=fresh.length>=limit?fresh:[...source];
 const picks=[];
 while(candidates.length&&picks.length<limit){
  const recipe=pickMenu(candidates,{lastCooked,priorityDates,now,random});
  if(!recipe)break;
  picks.push(recipe);
  candidates=candidates.filter(item=>item.id!==recipe.id);
 }
 return picks;
}
