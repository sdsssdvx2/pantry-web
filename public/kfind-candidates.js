import {isUnknownKfindIdentity} from './kfind-identity.js';
// K-FIND export adapter. Read-only: do not assert product identity or write nutrition.
export const REQUIRED_COLUMNS=[
 '식품코드','식품명','영양성분 함량 기준량','에너지(kcal)','나트륨(mg)',
 '제조사명','수입업체명','품목제조보고번호','식품 중량'
];
const HEADERS={
 code:'식품코드',name:'식품명',basis:'영양성분 함량 기준량',
 energy:'에너지(kcal)',sodium:'나트륨(mg)',carbs:'탄수화물(g)',
 sugars:'당류(g)',protein:'단백질(g)',fat:'지방(g)',
 saturatedFat:'포화지방산(g)',transFat:'트랜스지방산(g)',
 cholesterol:'콜레스테롤(mg)',fiber:'식이섬유(g)',
 manufacturer:'제조사명',importer:'수입업체명',
 reportNo:'품목제조보고번호',pack:'식품 중량',date:'데이터기준일자'
};
const hnorm=v=>String(v??'').normalize('NFKC').replace(/\s+/g,'').trim();
const clean=(v,max=220)=>String(v??'').trim().slice(0,max);
const identity=(v,max=220)=>isUnknownKfindIdentity(v)?'':clean(v,max);
export const kfindKey=v=>clean(v).normalize('NFKC').toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu,'');
const numeric=v=>{
 if(v===null||v===undefined||String(v).trim()===''||String(v).trim()==='-')return null;
 const t=String(v).trim();
 if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(t))return null;
 const n=Number(t.replaceAll(',',''));
 return Number.isFinite(n)&&n>=0?n:null;
};
export function parseKfindTable(table,{maxRows=4000}={}){
 if(!Array.isArray(table)||!Array.isArray(table[0])||table.length<2)
  throw Error('K-FIND 엑셀의 표와 머리글을 찾지 못했어요.');
 if(table.length>maxRows+1||table[0].length>100)
  throw Error('검색 결과가 너무 커요. 공식 K-FIND에서 범위를 좁혀 내려받아 주세요.');
 const headers=table[0].map(hnorm),positions={};
 for(const [key,name] of Object.entries(HEADERS)){
  const col=hnorm(name),indexes=headers.flatMap((h,i)=>h===col?[i]:[]);
  if(indexes.length>1)throw Error('중복된 영양 DB 열: '+name);
  positions[key]=indexes.length?indexes[0]:-1;
 }
 for(const name of REQUIRED_COLUMNS)if(!headers.includes(hnorm(name)))
  throw Error('K-FIND 공식 내보내기 열이 없어요: '+name);
 const data=[], nutrientKeys=['energy','sodium','carbs','sugars','protein','fat','saturatedFat','transFat','cholesterol','fiber'];
 for(let i=1;i<table.length;i++){
  const row=table[i];
  if(!Array.isArray(row))throw Error('잘못된 영양 DB 행: '+(i+1));
  const get=k=>positions[k]===-1?'':row[positions[k]];
  const code=identity(get('code'),100),name=identity(get('name'));
  if(!code&&!name)continue;
  if(!code||!name)throw Error('식품코드·식품명 없는 행: '+(i+1));
  const nutrition=Object.fromEntries(nutrientKeys.map(k=>[k,numeric(get(k))]));
  data.push({
   code,name,basis:clean(get('basis'),45),manufacturer:identity(get('manufacturer')),
   importer:identity(get('importer')),reportNo:identity(get('reportNo'),100),
   pack:identity(get('pack'),75),date:clean(get('date'),40),nutrition
  });
 }
 if(!data.length)throw Error('식품 데이터가 없는 파일이에요.');
 return data;
}
export function findKfindConflicts(data){
 const groups=new Map(),conflicts=new Set();
 for(const row of data){
  const key=['name','manufacturer','importer','pack','basis'].map(k=>kfindKey(row[k])).join('|');
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(row);
 }
 for(const group of groups.values()){
  if(group.length<2)continue;
  for(const key of ['energy','sodium','carbs','sugars','protein','fat']){
   const values=new Set(group.map(x=>x.nutrition[key]).filter(v=>v!==null));
   if(values.size>1){group.forEach(r=>conflicts.add(r.code));break;}
  }
 }
 return conflicts;
}
const numberText=v=>v===null?'미확인':Number(v).toLocaleString('ko-KR');
const normPack=v=>kfindKey(v).replace(/ml/g,'ml');
export function searchKfindCandidates(data,query,{manufacturer='',importer='',pack='',reportNo='',limit=25}={}){
 const terms=String(query??'').normalize('NFKC').split(/[\s,/·]+/).map(kfindKey)
  .filter(x=>x.length>=3&&!['소스','제품','식품'].includes(x));
 if(!terms.length)return {total:0,candidates:[]};
 const conflictCodes=findKfindConflicts(data),scores=[];
 for(const row of data){
  const food=kfindKey(row.name),maker=kfindKey(row.manufacturer);
  const score=terms.reduce((sum,t)=>sum+(food.includes(t)?5:maker.includes(t)?3:0),0);
  if(score<=0)continue;
  const reasons=[];
  if(manufacturer&&kfindKey(manufacturer)!==maker)reasons.push('제조사 불일치');
  if(importer&&kfindKey(importer)!==kfindKey(row.importer))reasons.push('수입업체 불일치');
  if(pack&&normPack(pack)!==normPack(row.pack))reasons.push('용량 불일치');
  if(reportNo&&kfindKey(reportNo)!==kfindKey(row.reportNo))reasons.push('신고번호 불일치');
  if(conflictCodes.has(row.code))reasons.push('동일 식품·규격의 수치 충돌');
  if(!/^100(?:g|ml)$/i.test(hnorm(row.basis)))reasons.push('영양 기준량 확인 필요');
  scores.push({row,score,reasons,verified:false});
 }
 scores.sort((a,b)=>b.score-a.score||a.row.name.localeCompare(b.row.name,'ko')||a.row.code.localeCompare(b.row.code));
 const lim=Math.max(1,Math.min(40,Number.isInteger(limit)?limit:25));
 return {total:scores.length,candidates:scores.slice(0,lim),conflictCount:scores.filter(x=>conflictCodes.has(x.row.code)).length};
}
export function kfindCandidateSummary(row,profile={}){
 const n=row.nutrition,basis=hnorm(row.basis);
 const comparable=basis==='100g'&&['energy','sodium'].every(k=>profile[k]?.amount===100&&profile[k]?.unit==='g');
 const difference=comparable&&['energy','sodium'].some(k=>n[k]!==null&&Number.isFinite(profile[k]?.value)&&Math.abs(n[k]-profile[k].value)>1e-7);
 return {
  calories:numberText(n.energy)+' kcal',sodium:numberText(n.sodium)+' mg',
  sugars:numberText(n.sugars)+' g',basis:row.basis,
  difference,differenceNotice:difference?'현재 기록과 수치가 다름':'',
  source:'식약처 K-FIND 검색 결과 · 자동 적용 금지'
 };
}

// Separate the file's async read from candidate ownership. An older XLSX
// read must never replace rows selected after it, including across stock
// editor reopens. This is a browser-local generation token, not a server lock.
export function invalidateKfindFileRead(session){
 if(!session||typeof session!=='object')throw Error('K-FIND 검토 상태를 확인해 주세요.');
 const prev=Number.isSafeInteger(session.readGeneration)&&session.readGeneration>=0?session.readGeneration:0;
 session.readGeneration=prev>=Number.MAX_SAFE_INTEGER-1?1:prev+1;
 return session.readGeneration;
}

export async function readKfindCandidateFile(session,file,reader){
 const generation=invalidateKfindFileRead(session);
 session.rows=[];
 session.filename='';
 if(!file||typeof file.name!=='string'||!/\.xlsx$/i.test(file.name)||
  !Number.isSafeInteger(file.size)||file.size<=0||file.size>4*1024*1024)
  return {state:'invalid',message:'K-FIND 검색 결과 .xlsx만 가능해요 (4MB 이하). 전체 200MB DB는 사용할 수 없어요.'};
 try{
  if(typeof reader!=='function')throw Error('엑셀 읽기 기능을 확인할 수 없어요.');
  const sheets=await reader(file);
  if(session.readGeneration!==generation)return {state:'stale'};
  if(!Array.isArray(sheets)||!Array.isArray(sheets[0]?.data))
   throw Error('엑셀 시트 구조를 확인할 수 없어요.');
  const rows=parseKfindTable(sheets[0].data,{maxRows:4000});
  if(session.readGeneration!==generation)return {state:'stale'};
  session.rows=rows;session.filename=file.name;
  return {state:'ready',count:rows.length};
 }catch(error){
  if(session.readGeneration!==generation)return {state:'stale'};
  session.rows=[];session.filename='';
  return {state:'error',message:error?.message||'파일 구조를 확인할 수 없어요.'};
 }
}
