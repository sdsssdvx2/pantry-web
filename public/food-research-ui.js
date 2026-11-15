import {NUTRIENTS} from './nutrition.js';
import {fillNutritionEvidence} from './nutrition-evidence-editor.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const text=value=>String(value??'').trim();

export function extractResearchHints(notes=[]){
 const joined=(Array.isArray(notes)?notes:[notes]).map(text).filter(Boolean).join('\n');
 const url=joined.match(/https:\/\/[^\s<>"')\]]+/i)?.[0]?.replace(/[.,;]+$/,'')||'';
 const labeled=joined.match(/(?:바코드|barcode|gtin|ean)\s*[:：#-]?\s*(\d{8,14})/i)?.[1]||'';
 return {url,barcode:labeled};
}

export function canAutoStageFoodResearch(target){
 const rows=[...(target.querySelectorAll?.('[data-nutrient]')||[])];
 if(!rows.length)return false;
 return rows.every(row=>!text(row.querySelector?.('[data-value]')?.value));
}

function evidenceFor(candidate,key){
 const metric=candidate?.metrics?.[key];
 if(!metric)return null;
 const identity=candidate.identity||{};
 const evidenceClass=candidate.confidence==='barcode'?'바코드 일치 제품 데이터'
  :candidate.confidence==='product-page'?'사용자가 지정한 공개 상품 페이지의 표시 영양정보'
  :candidate.confidence==='raw-form'?'국가 식품영양성분 DB 원재료(생것) 기준 · 조리·가공 상태 확인'
  :'자동 검색 후보 · 저장 전 제품/조리 상태 확인';
 const note=[
  candidate.note,
  evidenceClass,
  identity.name&&identity.name!==candidate.name?identity.name:'',
 ].filter(Boolean).join(' · ').slice(0,1000);
 return {
  value:Number(metric.value),
  amount:Number(metric.amount),
  unit:metric.unit,
  kind:['product','generic','estimate'].includes(candidate.kind)?candidate.kind:'estimate',
  source:text(candidate.source?.name)||'자동 조사',
  url:text(candidate.source?.url),
  ...(note?{note}:{}),
 };
}

function uniqueLines(value){
 return [...new Set(String(value||'').split(/\r?\n/).map(line=>line.trim()).filter(Boolean))];
}

function appendEvidenceLines(notesField,additions=[]){
 if(!notesField)return false;
 const lines=additions.filter(Boolean).map(text);
 if(!lines.length)return false;
 const before=uniqueLines(notesField.value),keys=new Set(before.map(line=>line.normalize('NFKC')));
 const next=[...before];
 for(const line of lines)if(!keys.has(line.normalize('NFKC'))){
  next.push(line);keys.add(line.normalize('NFKC'));
 }
 const joined=next.join('\n');
 if(joined.length>Number(notesField.maxLength||8000))return false;
 if(joined===notesField.value)return false;
 notesField.value=joined;
 notesField.dispatchEvent(new Event('input',{bubbles:true}));
 return true;
}

export function appendProductPageEvidence(notesField,page){
 if(!page)return false;
 return appendEvidenceLines(notesField,[
  page.url&&`상품 페이지: ${page.url}`,
  page.brand&&`브랜드: ${page.brand}`,
  page.manufacturer&&`제조사·생산자: ${page.manufacturer}`,
  page.barcode&&`바코드: ${page.barcode}`,
  page.pack&&`제품 용량: ${page.pack}`,
  page.ingredients&&`원재료: ${page.ingredients}`,
  page.allergens&&`알레르기: ${page.allergens}`,
  page.storage&&`보관방법: ${page.storage}`,
  page.shelfLife&&`표시 보관기간·기한: ${page.shelfLife}`,
  page.nutritionText&&`상품 영양표 문구: ${page.nutritionText}`,
 ]);
}

export function appendCandidateEvidence(notesField,candidate){
 const identity=candidate?.identity||{};
 return appendEvidenceLines(notesField,[
  identity.manufacturer&&`영양자료 제조사·브랜드: ${identity.manufacturer}`,
  identity.importer&&`영양자료 수입업체: ${identity.importer}`,
  identity.barcode&&`바코드: ${identity.barcode}`,
  identity.pack&&`영양자료 제품 용량: ${identity.pack}`,
  identity.ingredients&&`원재료: ${identity.ingredients}`,
  identity.allergens&&`알레르기: ${identity.allergens}`,
  identity.storage&&`보관방법: ${identity.storage}`,
  identity.shelfLife&&`표시 보관기간·기한: ${identity.shelfLife}`,
 ]);
}

export function stageFoodResearchCandidate(target,candidate,{notesField,page}={}){
 const staged=[];
 for(const key of Object.keys(NUTRIENTS)){
  const row=target.querySelector?.(`[data-nutrient="${key}"]`);
  const evidence=evidenceFor(candidate,key);
  if(!row||!evidence)continue;
  fillNutritionEvidence(row,evidence);
  staged.push(key);
 }
 appendCandidateEvidence(notesField,candidate);
 if(page)appendProductPageEvidence(notesField,page);
 return staged;
}

function metricSummary(candidate){
 const labels={energy:'열량',sodium:'나트륨',protein:'단백질',carbs:'탄수화물',fat:'지방',sugars:'당류'};
 return Object.entries(labels).filter(([key])=>candidate.metrics?.[key]).slice(0,4).map(([key,label])=>{
  const metric=candidate.metrics[key],unit=NUTRIENTS[key]?.[1]||'';
  return `${label} ${Number(metric.value).toLocaleString('ko-KR')}${unit}`;
 }).join(' · ');
}

function identitySummary(candidate){
 const i=candidate.identity||{};
 return [
  i.name,
  i.manufacturer&&`제조사/브랜드 ${i.manufacturer}`,
  i.importer&&`수입 ${i.importer}`,
  i.pack&&`용량 ${i.pack}`,
  i.barcode&&`바코드 ${i.barcode}`,
 ].filter(Boolean).join(' · ');
}

function statusText(name,status){
 if(!status?.enabled)return name==='공공 영양 DB'&&status?.error?status.error:`${name} · 이번 조회에서 사용 안 함`;
 if(status.ok){
  if(status.error)return `${name} · ${status.error}`;
  if(name==='공공 영양 DB'&&status.mode==='public-grid')return `${name} · 공식 공개 그리드 조회 완료 · API 키 불필요`;
  if(name==='공공 영양 DB'&&status.mode==='public-grid-after-openapi')return `${name} · OpenAPI 대신 공식 공개 그리드 사용`;
  if(name==='공공 영양 DB'&&status.mode==='openapi')return `${name} · 공식 OpenAPI 조회 완료`;
  return `${name} · 조회 완료`;
 }
 return `${name} · ${status.error||'조회 실패'}`;
}

async function labelImageDataUrl(file){
 if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('제품 라벨 사진은 JPEG·PNG·WebP만 사용할 수 있어요.');
 if(file.size>10_000_000)throw Error('라벨 사진 원본은 10MB 이하로 선택해 주세요.');
 if(typeof createImageBitmap!=='function')throw Error('이 브라우저에서는 라벨 사진 압축을 사용할 수 없어요.');
 const bitmap=await createImageBitmap(file);
 try{
  const max=1800,scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height));
  const width=Math.max(1,Math.round(bitmap.width*scale)),height=Math.max(1,Math.round(bitmap.height*scale));
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('라벨 사진을 처리할 수 없어요.');
  ctx.drawImage(bitmap,0,0,width,height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.86));
  if(!blob||blob.size>2_050_000)throw Error('사진을 충분히 줄이지 못했어요. 라벨 부분만 잘라 다시 선택해 주세요.');
  return await new Promise((resolve,reject)=>{
   const reader=new FileReader();
   reader.onload=()=>resolve(String(reader.result||''));
   reader.onerror=()=>reject(Error('라벨 사진을 읽지 못했어요.'));
   reader.readAsDataURL(blob);
  });
 }finally{bitmap.close?.();}
}

export function installFoodResearchPanel(host,{name,notes=[],auto=false,onStage,onPageEvidence}={}){
 if(!host||typeof document==='undefined')return {run(){return Promise.resolve(null);}};
 const hints=extractResearchHints(notes);
 host.innerHTML=`<summary>식재료 정보 자동 조사 · 공식 DB / 상품 페이지 / 바코드</summary>
  <p class="field-help">새 재료는 한 번 자동 조회하고, 정확히 식별된 결과만 <b>저장 전 입력 초안</b>으로 채워요. 쇼핑몰 로그인 쿠키나 주문 개인정보는 보내지 않고 공개 상품 페이지만 읽습니다. 애매한 동명 제품은 자동 확정하지 않아요.</p>
  <div class="nutrition-kfind-filters">
   <label>찾을 식품·제품명<input type="search" data-food-research-name maxlength="150"></label>
   <label>바코드 · GTIN (선택)<input type="text" inputmode="numeric" data-food-research-barcode maxlength="14" placeholder="8~14자리"></label>
   <label>상품 링크 (선택)<input type="url" data-food-research-url maxlength="2000" placeholder="https://..."></label>
  </div>
  <button type="button" class="outline-button" data-food-research-run>무료 자료에서 다시 찾기</button>
  <p class="field-help">상품 링크는 쿠팡·네이버·컬리·G마켓뿐 아니라 공개 Product JSON-LD를 제공하는 다른 쇼핑몰도 공통 방식으로 분석합니다. 사이트가 봇 접근을 막거나 로그인 전용이면 실패할 수 있어요.</p>
  <p data-food-research-status class="field-help" role="status" aria-live="polite"></p>
  <div data-food-research-sources class="field-help"></div>
  <div data-food-research-results class="nutrition-kfind-results"></div>
  <details class="nutrition-kfind-review" data-food-ai-panel>
   <summary>라벨 사진 무료 AI 판독 · 선택</summary>
   <p class="field-help">제품 포장 라벨만 선택하세요. 영수증·주문완료 화면·주소·전화번호·결제정보가 있는 이미지는 사용하지 마세요. 버튼을 눌렀을 때만 사진을 설정된 무료 AI(OpenRouter 무료 모델 또는 Google Gemini 무료 API)에 전송해요. 한 곳이 사용량 한도·장애일 때만 다른 무료 제공자로 한 번 넘기고, 잘못된 답은 다시 요청하지 않아요. 무료 API는 제공자가 입력을 서비스 개선에 사용할 수 있어요.</p>
   <label>제품 라벨 사진<input type="file" accept="image/jpeg,image/png,image/webp" data-food-ai-file></label>
   <button type="button" class="outline-button" data-food-ai-run>선택한 라벨 사진 1회 분석</button>
   <p class="field-help" data-food-ai-status role="status" aria-live="polite"></p>
   <div data-food-ai-result class="nutrition-kfind-results"></div>
  </details>`;
 const nameField=host.querySelector('[data-food-research-name]');
 const barcodeField=host.querySelector('[data-food-research-barcode]');
 const urlField=host.querySelector('[data-food-research-url]');
 const runButton=host.querySelector('[data-food-research-run]');
 const status=host.querySelector('[data-food-research-status]');
 const sources=host.querySelector('[data-food-research-sources]');
 const results=host.querySelector('[data-food-research-results]');
 const aiFile=host.querySelector('[data-food-ai-file]');
 const aiButton=host.querySelector('[data-food-ai-run]');
 const aiStatus=host.querySelector('[data-food-ai-status]');
 const aiResult=host.querySelector('[data-food-ai-result]');
 nameField.value=name||'';
 barcodeField.value=hints.barcode||'';
 urlField.value=hints.url||'';
 let requestId=0,lastData=null,autoUsed=false;

 const render=data=>{
  lastData=data;
  const sourceRows=[
   ['공개 상품 페이지',data.sources?.productPage],
   ['Open Food Facts 바코드',data.sources?.openFoodFacts],
   ['공공 영양 DB',data.sources?.publicNutrition],
  ];
  sources.innerHTML=sourceRows.map(([label,value])=>`<div>• ${esc(statusText(label,value))}</div>`).join('');
  if(data.page&&!data.page.variantAmbiguous&&typeof onPageEvidence==='function')onPageEvidence(data.page);
  const candidates=Array.isArray(data.candidates)?data.candidates:[];
  const total=Number(data.candidateCountTotal||candidates.length);
  const limited=total>candidates.length?`<p class="field-help">후보 ${total.toLocaleString('ko-KR')}건 중 정확 일치 우선 상위 ${candidates.length}건만 표시해요.</p>`:'';
  results.innerHTML=limited+(candidates.length?candidates.map((candidate,index)=>`<article class="nutrition-kfind-card" data-food-candidate="${index}">
    <strong>${esc(identitySummary(candidate)||candidate.source?.name||'영양 후보')}</strong>
    <small>${esc(candidate.basis?.label||'기준량 미확인')} · ${esc(metricSummary(candidate))}</small>
    <small>${esc(candidate.source?.name||'출처')} · ${candidate.confidence==='barcode'?'바코드 일치':candidate.confidence==='product-page'?'상품 페이지 영양표':candidate.exactName?'이름 정확 일치':candidate.rawForm==='plain'?'원재료 생것 기준 일치':'검색 후보'}</small>
    <button type="button" class="text-button" data-food-candidate-apply="${index}">이 수치를 저장 전 입력칸에 채우기</button>
   </article>`).join(''):'<p class="field-help">자동으로 적용할 영양 후보가 없어요. 아래 K-FIND 엑셀 검토나 직접 라벨 입력을 사용할 수 있어요.</p>');
  const autoCandidate=candidates.find(candidate=>candidate.id===data.autoStageId);
  if(auto&&!autoUsed&&autoCandidate&&typeof onStage==='function'){
   autoUsed=true;
   const applied=onStage(autoCandidate,{automatic:true,page:data.page})!==false;
   if(applied)status.textContent='정확도가 높은 후보를 저장 전 입력칸에 자동으로 채웠어요. 식재료 저장 전에 제품과 기준량을 확인하세요.';
  }
 };

 results.addEventListener('click',event=>{
  const button=event.target.closest('[data-food-candidate-apply]');if(!button||!lastData)return;
  const candidate=lastData.candidates?.[Number(button.dataset.foodCandidateApply)];
  if(!candidate||typeof onStage!=='function')return;
  const applied=onStage(candidate,{automatic:false,page:lastData.page});
  status.textContent=applied===false?'현재 입력값을 유지했어요.':'후보를 저장 전 입력칸에 채웠어요. 실제 제품 라벨·상품명을 확인한 뒤 식재료 정보를 저장하세요.';
 });

 const run=async()=>{
  const id=++requestId;
  const params=new URLSearchParams();
  if(text(nameField.value))params.set('name',text(nameField.value));
  if(text(barcodeField.value))params.set('barcode',text(barcodeField.value));
  if(text(urlField.value))params.set('url',text(urlField.value));
  if(![...params.keys()].length){status.textContent='식재료 이름, 바코드 또는 상품 링크 중 하나를 입력해 주세요.';return null;}
  runButton.disabled=true;status.textContent='무료 자료에서 식재료 정보를 찾는 중…';sources.textContent='';results.textContent='';
  try{
   const response=await fetch('/api/food-research?'+params.toString(),{credentials:'same-origin',headers:{'Accept':'application/json'}});
   const data=await response.json().catch(()=>({}));
   if(id!==requestId)return null;
   if(!response.ok)throw Error(data.message||'자동 조사 요청에 실패했어요.');
   render(data);
   if(data.page?.variantAmbiguous)status.textContent='여러 옵션·제품이 함께 있는 상품 페이지로 보여 자동 입력과 메모 반영을 보류했어요. 정확한 옵션을 확인한 뒤 후보를 직접 적용하세요.';
   else if(!data.autoStageId)status.textContent=data.candidates?.length?'후보를 찾았어요. 정확한 제품인지 확인한 뒤 적용하세요.':'확정 가능한 영양 후보를 찾지 못했어요.';
   return data;
  }catch(error){
   if(id===requestId)status.textContent='자동 조사 중단: '+(error?.message||'자료를 가져오지 못했어요.');
   return null;
  }finally{if(id===requestId)runButton.disabled=false;}
 };
 aiButton?.addEventListener('click',async()=>{
  const file=aiFile?.files?.[0];
  if(!file){aiStatus.textContent='먼저 제품 포장 라벨 사진을 선택해 주세요.';return;}
  aiButton.disabled=true;aiResult.replaceChildren();aiStatus.textContent='선택한 라벨 사진을 무료 AI로 1회 판독하는 중…';
  try{
   const imageDataUrl=await labelImageDataUrl(file);
   const response=await fetch('/api/food-research/ai',{
    method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','Accept':'application/json'},
    body:JSON.stringify({name:text(nameField.value),sourceUrl:text(urlField.value),imageDataUrl,approveRemote:true})
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(data.message||'무료 AI 라벨 판독에 실패했어요.');
   const candidate=data.candidate;
   if(!candidate)throw Error('라벨 판독 결과를 받지 못했어요.');
   const card=document.createElement('article');card.className='nutrition-kfind-card';
   card.innerHTML=`<strong>${esc(identitySummary(candidate)||'라벨 판독 후보')}</strong><small>${esc(candidate.basis?.label||'영양 기준량 미확인')} · ${esc(metricSummary(candidate))}</small><small>무료 AI 사진 판독 · 미검증 · 실제 라벨 대조 필수</small><button type="button" class="text-button">이 판독값을 저장 전 입력칸에 채우기</button>`;
   card.querySelector('button').addEventListener('click',()=>{
    const applied=typeof onStage==='function'?onStage(candidate,{automatic:false,page:null}):false;
    aiStatus.textContent=applied===false?'현재 입력값을 유지했어요.':'AI 판독값을 저장 전 초안에 채웠어요. 실제 라벨과 다시 대조한 뒤 식재료 정보를 저장하세요.';
   });
   aiResult.append(card);
   aiStatus.textContent='사진 판독 후보를 만들었어요. 아직 저장되지 않았고 실제 라벨 확인이 필요해요.';
  }catch(error){aiStatus.textContent='AI 라벨 판독 중단: '+(error?.message||'사진을 분석하지 못했어요.');}
  finally{aiButton.disabled=false;}
 });
 runButton.addEventListener('click',run);
 if(auto)queueMicrotask(run);
 return {run};
}

export function installFoodIntakeInboxPanel(host,{name,notesField,onStage,onDraftApplied}={}){
 if(!host||typeof document==='undefined')return {refresh(){return Promise.resolve([]);}};
 host.hidden=true;
 host.innerHTML=`<summary>구매에서 받은 상품정보 <span data-food-inbox-count></span></summary>
  <p class="field-help">주문번호·결제·배송·주소 같은 개인정보는 저장하지 않고, Purchase Intelligence가 정제한 상품명·바코드·영양표·보관정보만 여기에 대기해요. 직접 적용하거나 건너뛰기 전에는 식재료 정보가 바뀌지 않아요.</p>
  <p class="field-help" data-food-inbox-status role="status" aria-live="polite"></p>
  <div data-food-inbox-results class="nutrition-kfind-results"></div>`;
 const status=host.querySelector('[data-food-inbox-status]');
 const results=host.querySelector('[data-food-inbox-results]');
 const count=host.querySelector('[data-food-inbox-count]');
 let items=[],requestId=0;

 const mark=async(item,nextStatus)=>{
  const response=await fetch('/api/food-research/intake-inbox/'+encodeURIComponent(item.id),{
   method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','Accept':'application/json'},
   body:JSON.stringify({status:nextStatus})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.message||'받은 상품정보 상태를 저장하지 못했어요.');
 };

 const render=()=>{
  count.textContent=items.length?`· ${items.length}건`:'';
  host.hidden=!items.length;
  if(!items.length){results.replaceChildren();status.textContent='';return;}
  results.innerHTML=items.map((item,index)=>{
   const p=item.intake?.product||{},candidate=item.intakeCandidate;
   const captured=item.capturedAt?new Date(item.capturedAt).toLocaleDateString('ko-KR'):'';
   return `<article class="nutrition-kfind-card" data-food-inbox-item="${index}">
    <strong>${esc([p.name,p.brand,p.pack].filter(Boolean).join(' · ')||'받은 상품정보')}</strong>
    <small>${esc([item.sourceLabel,captured&&'캡처 '+captured].filter(Boolean).join(' · '))}</small>
    <small>${candidate?esc((candidate.basis?.label||'기준량 미확인')+' · '+metricSummary(candidate)):'영양표 수치 없음 · 제품/보관 메모만 적용 가능'}</small>
    <div>
     <button type="button" class="text-button" data-food-inbox-apply="${index}">${candidate?'상품정보·영양값 적용':'상품정보 메모 적용'}</button>
     <button type="button" class="text-button" data-food-inbox-dismiss="${index}">이번 항목 건너뛰기</button>
    </div>
   </article>`;
  }).join('');
 };

 const refresh=async()=>{
  const id=++requestId;
  const query=new URLSearchParams();
  if(text(name))query.set('name',text(name));
  status.textContent='구매에서 받은 상품정보를 확인하는 중…';
  try{
   const response=await fetch('/api/food-research/intake-inbox?'+query.toString(),{credentials:'same-origin',headers:{'Accept':'application/json'}});
   const data=await response.json().catch(()=>({}));
   if(id!==requestId||!host.isConnected)return [];
   if(!response.ok)throw Error(data.message||'받은 상품정보를 불러오지 못했어요.');
   items=Array.isArray(data.items)?data.items:[];
   render();
   if(items.length){
    const nutritionPanel=host.closest('details.nutrition-stock');
    if(nutritionPanel)nutritionPanel.open=true;
   }
   status.textContent=items.length?'현재 식재료 이름과 맞는 대기 항목을 찾았어요. 실제 제품인지 확인한 뒤 적용하세요.':'';
   return items;
  }catch(error){
   if(id===requestId&&host.isConnected){host.hidden=false;status.textContent='받은 상품정보 확인 중단: '+(error?.message||'대기함을 읽지 못했어요.');}
   return [];
  }
 };

 results.addEventListener('click',async event=>{
  const apply=event.target.closest('[data-food-inbox-apply]');
  const dismiss=event.target.closest('[data-food-inbox-dismiss]');
  const button=apply||dismiss;
  if(!button)return;
  const index=Number(apply?.dataset.foodInboxApply??dismiss?.dataset.foodInboxDismiss);
  const item=items[index];if(!item)return;
  button.disabled=true;
  try{
   if(apply){
    const notesChanged=appendEvidenceLines(notesField,item.evidenceNotes||[]);
    const staged=item.intakeCandidate&&typeof onStage==='function'
      ?onStage(item.intakeCandidate,{automatic:false,page:null})!==false
      :false;
    if(!notesChanged&&!staged)throw Error('적용할 상품정보가 없어요.');
    if(typeof onDraftApplied==='function')onDraftApplied(item);
    items=items.filter((_,i)=>i!==index);render();
    status.textContent='받은 상품정보를 저장 전 초안에 반영했어요. 재료 정보 저장이 성공한 뒤에만 받은 항목을 적용 완료로 처리합니다.';
   }else{
    await mark(item,'dismissed');
    items=items.filter((_,i)=>i!==index);render();
    status.textContent='이 항목을 건너뛰었어요. 식재료 정보는 바꾸지 않았습니다.';
   }
  }catch(error){status.textContent='받은 상품정보 처리 중단: '+(error?.message||'처리하지 못했어요.');button.disabled=false;}
 });
 queueMicrotask(refresh);
 return {refresh};
}

