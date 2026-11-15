// Optional read-only K-FIND Excel search inside the owner stock editor.
// The file stays in browser memory and never enters any save/sync payload.
import {searchKfindCandidates,kfindCandidateSummary,readKfindCandidateFile} from './kfind-candidates.js';
import {prepareKfindEvidence} from './kfind-evidence.js';
let readerPromise=null;
function localXlsxReader(){
 if(typeof globalThis.readXlsxFile==='function')return Promise.resolve(globalThis.readXlsxFile);
 if(readerPromise)return readerPromise;
 readerPromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src='./vendor/read-excel-file-9.3.14.min.js';
  script.async=true;
  script.onload=()=>typeof globalThis.readXlsxFile==='function'
   ?resolve(globalThis.readXlsxFile):reject(Error('엑셀 읽기 기능을 실행할 수 없어요.'));
  script.onerror=()=>reject(Error('내장 엑셀 읽기 파일을 불러오지 못했어요.'));
  document.head.append(script);
 }).catch(e=>{readerPromise=null;throw e;});
 return readerPromise;
}
const make=(tag,content='',className='')=>{
 const el=document.createElement(tag);
 el.textContent=String(content??'');
 if(className)el.className=className;
 return el;
};
const display=v=>String(v??'').trim()||'미확인';
export function installKfindCandidateReview(host,{name,profile={},session,onStage}){
 if(!host||typeof document==='undefined')return;
 host.innerHTML='<summary>공식 K-FIND 엑셀 후보 비교 · 라벨 대조 후 수동 입력</summary>'+
  '<p class="field-help">식약처 ‘목록다운로드’ .xlsx를 브라우저에서만 분석해요. 충분히 식별한 후보만 저장 전 편집칸에 임시로 채울 수 있고, 파일 자체는 서버·D1로 전송하지 않아요.</p>'+
  '<label>검색 결과 엑셀 (.xlsx, 최대 4MB)<input type="file" accept=".xlsx" data-kfind-file></label>'+
  '<div class="nutrition-kfind-filters"><label>찾을 식품명<input type="search" data-kfind-query placeholder="예: 스리라차"></label>'+
  '<label>현재 제품 수입업체 (선택)<input type="text" data-kfind-importer maxlength="180" placeholder="라벨의 수입업체"></label>'+
  '<label>현재 제품 용량 (선택)<input type="text" data-kfind-pack maxlength="75" placeholder="예: 481g"></label></div>'+
  '<p class="field-help">같은 제조사·제품명이어도 수입업체·규격·품목제조보고번호가 다를 수 있어요. 검색 후보는 절대로 동일 상품이 확정된 값이 아닙니다.</p>'+
  '<p data-kfind-status role="status" aria-live="polite"></p><div data-kfind-result class="nutrition-kfind-results"></div><div data-kfind-review></div>'+
  '<p class="field-help"><a href="https://various.foodsafetykorea.go.kr/nutrient/general/food/firstList.do" target="_blank" rel="noopener noreferrer">K-FIND 공식 검색·목록다운로드</a> · 내장 XLSX 리더: read-excel-file 9.3.14 (MIT)</p>';
 const file=host.querySelector('[data-kfind-file]');
 const query=host.querySelector('[data-kfind-query]');
 const importer=host.querySelector('[data-kfind-importer]');
 const pack=host.querySelector('[data-kfind-pack]');
 const status=host.querySelector('[data-kfind-status]');
 const output=host.querySelector('[data-kfind-result]');
 const reviewPanel=host.querySelector('[data-kfind-review]');
 query.value=name||'';
 const source=profile.energy?.source||profile.sodium?.source||'';
 const reference=profile.energy?.note||profile.sodium?.note||'';
 const im=String(source).match(/수입원\s*([^·]+?)(?=\s*·|$)/);
 if(im)importer.value=im[1].trim();
 const wt=String(reference).match(/총\s*(\d+(?:\.\d+)?)\s*g\b/i);
 if(wt)pack.value=wt[1]+'g';
 function reviewCandidate(item){
  reviewPanel.replaceChildren();
  reviewPanel.append(make('h4','보유 제품 라벨과 직접 대조'));
  reviewPanel.append(make('p','선택 후보: '+item.row.name+' / '+item.row.code+' · 기존 제품 정보·영양값은 아직 바뀌지 않았어요. 라벨의 제품명·제조사·수입업체·용량을 직접 입력하세요. 신고번호는 별도로 동일성이 입증되지 않으며, 현재 다운로드한 파일 밖에도 다른 신고번호·영양값이 존재할 수 있어요.','field-help'));
  if(item.reasons.length)reviewPanel.append(make('p','검색 비교 경고: '+item.reasons.join(' · '),'field-help'));
  const fields={};
  for(const [key,label] of [['name','라벨 식품명'],['manufacturer','라벨 제조사'],['importer','라벨 수입업체 (없으면 비움)'],['pack','라벨 용량·규격']]){
   const wrapper=make('label',label);
   const input=make('input');
   input.type='text';input.maxLength=key==='pack'?75:220;
   input.setAttribute('autocomplete','off');
   wrapper.append(input);reviewPanel.append(wrapper);fields[key]=input;
  }
  const consent=make('label','본인이 현재 보유한 제품의 라벨과 K-FIND 검색 후보를 대조했습니다. 숫자는 우선 편집 초안에만 입력하며 저장 버튼을 누르기 전까지 D1에 반영되지 않습니다.');
  const checkbox=make('input');checkbox.type='checkbox';consent.prepend(checkbox);reviewPanel.append(consent);
  const button=make('button','확인한 후보 수치를 저장 전 입력칸에만 채우기','text-button');
  button.type='button';reviewPanel.append(button);
  const message=make('p','','field-help');message.setAttribute('role','status');reviewPanel.append(message);
  button.addEventListener('click',()=>{
   try{
    if(!checkbox.checked)throw Error('실제 제품 라벨 대조 확인란을 선택해 주세요.');
    const evidence=prepareKfindEvidence(item.row,session.rows,Object.fromEntries(Object.entries(fields).map(([key,input])=>[key,input.value])));
    if(typeof onStage!=='function')throw Error('영양정보 편집창을 확인해 주세요.');
    onStage(evidence);
    message.textContent='저장되지 않은 편집 초안에만 반영했어요. 다른 입력값과 출처를 확인한 뒤 식재료 정보 저장을 눌러야 확정됩니다.';
   }catch(error){message.textContent='반영 중단: '+(error?.message||'제품 확인에 실패했어요.');}
  });
 }
 function render(){
  output.replaceChildren();
  reviewPanel.replaceChildren();
  if(!session.rows?.length){
   status.textContent='엑셀 파일을 선택하면 다른 제품·영양값 충돌을 포함해 후보를 표시해요.';
   return;
  }
  const result=searchKfindCandidates(session.rows,query.value,{
   importer:importer.value,pack:pack.value,limit:25
  });
  status.textContent='현재 브라우저에 '+session.rows.length+'건을 불러왔어요. 검색 일치 '+
   result.total+'건'+(result.total>25?' (25건만 표시)':'')+
   ' · 수치 충돌 후보 '+(result.conflictCount||0)+'건. 모두 미확정입니다.';
  if(!result.candidates.length){
   output.append(make('p','현재 파일에서 일치하는 식품을 찾지 못했어요. 다른 검색어 또는 K-FIND 다운로드 파일을 확인해 주세요.'));
   return;
  }
  const table=make('table');
  table.setAttribute('aria-label','K-FIND 영양정보 후보');
  const header=make('thead');
  const thRow=make('tr');
  for(const label of ['식품명','제조사·수입업체','용량·기준','열량 / 기준량','나트륨 / 기준량','식품코드·신고번호','판정']){
   thRow.append(make('th',label));
  }
  header.append(thRow);table.append(header);
  const body=make('tbody');
  for(const item of result.candidates){
   const data=item.row,n=kfindCandidateSummary(data,profile);
   const row=make('tr');
   const warn=item.reasons.length?item.reasons.join(' · '):'동일 상품 미입증';
   if(item.reasons.length)row.className='nutrition-kfind-warning';
   for(const cell of [
    data.name,display(data.manufacturer)+' / '+display(data.importer),
    display(data.pack)+' / '+display(data.basis),n.calories,n.sodium,
    data.code+' / '+display(data.reportNo),
    warn+(n.differenceNotice?' · '+n.differenceNotice:'')
   ])row.append(make('td',cell));
   const action=make('button','라벨 대조·입력 검토','text-button');
   action.type='button';action.addEventListener('click',()=>reviewCandidate(item));
   row.lastElementChild.append(action);
   body.append(row);
  }
  table.append(body);output.append(table);
 }
 for(const field of [query,importer,pack]){
  field.addEventListener('input',render);
  field.addEventListener('keydown',event=>{if(event.key==='Enter')event.preventDefault();});
 }
 file.addEventListener('change',async()=>{
  const chosen=file.files?.[0];
  if(!chosen)return;
  // No bytes leave the browser; each new read invalidates pending old reads.
  file.value='';
  output.replaceChildren();
  reviewPanel.replaceChildren();
  status.textContent='엑셀을 이 브라우저에서만 분석하고 있어요…';
  const result=await readKfindCandidateFile(session,chosen,async blob=>{
   const read=await localXlsxReader();
   return read(blob);
  });
  if(result.state==='stale'||host.isConnected===false)return;
  if(result.state==='ready')render();
  else status.textContent=result.state==='invalid'?result.message:
   'K-FIND 엑셀 확인 실패: '+result.message;
 });
 render();
}
