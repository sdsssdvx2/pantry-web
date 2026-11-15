// Owner-confirmed missing ingredient grams, appended to a recipe draft only.
// Never infer quantities, select products, overwrite source text, or zero gaps.
import {nutritionKey,parseRecipeAmounts} from './nutrition.js';
const unknown=n=>'분량 미확인: '+n;
const safe=n=>typeof n==='string'&&n.length>0&&n.length<=150&&n===n.trim()&&!/[\r\n\[\]【】\/\\+|;<>]/.test(n);
const collision=(n,rows)=>rows.some(r=>{
 const a=nutritionKey(n),b=nutritionKey(r.name);
 return a===b||(a.length>=2&&b.length>=2&&(a.includes(b)||b.includes(a)));
});
export function measurableMissingRequired({body='',required=[],warnings=[]}={}){
 const rows=parseRecipeAmounts(body,required).rows;
 return [...new Set(required.map(n=>String(n||'').trim()))].filter(n=>
  safe(n)&&warnings.includes(unknown(n))&&!collision(n,rows));
}
export function appendMeasuredMissingGram({body='',required=[],warnings=[],name,grams}={}){
 if(!measurableMissingRequired({body,required,warnings}).includes(name))
  throw Error('이미 계량된 재료와 중복되거나 제품·감지 이름 확인이 먼저 필요해요.');
 if(typeof grams!=='number'||!Number.isFinite(grams)||grams<0.001||grams>1000000)
  throw Error('저울로 확인한 0.001g 이상 1,000,000g 이하의 수치를 입력해 주세요.');
 const raw=String(body);
 // Continue an existing trailing measurement section instead of making
 // one new heading per ingredient. A later heading starts a fresh section.
 const lastHeading=[...raw.matchAll(/(?:^|\n)\[([^\]\n]+)\](?=\n|$)/g)].at(-1)?.[1];
 const suffix=lastHeading==='추가 계량'
  ?(raw.endsWith('\n')?'':'\n')+name+' '+String(grams)+'g'
  :(raw.endsWith('\n')?'\n':'\n\n')+'[추가 계량]\n'+name+' '+String(grams)+'g';
 const next=raw+suffix;
 // Existing recipe validation allows at most 250 steps and 80,000 chars.
 if(next.length>80000||next.split('\n').length>250)
  throw Error('계량을 추가하면 레시피 저장 길이 제한을 넘어요. 원문을 직접 정리해 주세요.');
 const parsed=parseRecipeAmounts(next,required);
 if(!parsed.rows.some(r=>nutritionKey(r.name)===nutritionKey(name)&&r.unit==='g'&&r.amount===grams&&r.included&&!r.optional)||
   parsed.warnings.includes(unknown(name)))
  throw Error('새 계량 기록을 정확히 인식하지 못했어요. 자동 감지 설정을 확인해 주세요.');
 return next;
}


const normalizedPhrase=v=>String(v||'').normalize('NFKC').toLowerCase().trim().replace(/\s+/g,' ');
const vagueIngredient=new Set(['소스','기름','물','면','김','소금','후추','우유','버터','치즈','참치','국물','밥','가루']);
// Advisory only: an already weighed similar name is NOT verified product,
// nutrient provenance, absorption, or an authorized ingredient substitution.
export function inspectMissingQuantityWarnings({body='',required=[],warnings=[]}={}){
 const pending=[...new Set(required.map(n=>String(n||'').trim()))].filter(n=>warnings.includes(unknown(n)));
 const alternatives=pending.filter(n=>/[/|]/.test(n)).slice(0,20);
 const rows=parseRecipeAmounts(body,required).rows,possible=[];
 for(const name of pending){
  if(!safe(name)||vagueIngredient.has(normalizedPhrase(name)))continue;
  const wanted=normalizedPhrase(name);
  const matches=rows.filter(row=>{
   if(!row.included||row.optional||row.fromStep||!Number.isFinite(row.amount)||row.amount<=0)return false;
   const existing=normalizedPhrase(row.name);
   return !/[/|]/.test(existing)&&existing!==wanted&&existing.endsWith(' '+wanted);
  }).slice(0,2).map(row=>({name:row.name,grams:row.unit==='g'?row.amount:null,unit:row.unit}));
  if(matches.length)possible.push({name,matches});
  if(possible.length>=20)break;
 }
 return {alternatives,possible};
}
