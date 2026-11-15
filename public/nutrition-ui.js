import {NUTRIENTS,nutritionKey,parseRecipeAmounts,calculateRecipeNutrition,validateNutrition,validateRecipeNutrition,gramCookingText} from './nutrition.js';
import {ingredientNutrition,createNutritionResolver,nutritionProductKey} from './nutrition-resolver.js';
import {measurableMissingRequired,appendMeasuredMissingGram,inspectMissingQuantityWarnings} from './nutrition-missing-quantity.js';
import {productDetails,productNutrition} from './nutrition-data.js';
import {nutritionSourceFields,nutritionMetricRows,readNutritionEvidence,sameNutritionEvidence,fillNutritionEvidence,readNutritionProofDraft,createStockProductSwitchGuard} from './nutrition-evidence-editor.js';
import {installKfindCandidateReview} from './kfind-candidates-ui.js';
import {invalidateKfindFileRead} from './kfind-candidates.js';
import {stageKfindEvidenceIntoStockForm,preserveKfindSourceAfterOwnerEdit} from './kfind-evidence.js';
import {installFoodIntakeInboxPanel,installFoodResearchPanel,stageFoodResearchCandidate,canAutoStageFoodResearch,appendProductPageEvidence} from './food-research-ui.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const productHTML=name=>{const p=productDetails[name];return p?`<details class="nutrition-product-info"><summary>제품 자료 · ${esc(p.name)}</summary><p>${esc(p.pack)}</p><p>${esc(p.ingredients)}</p>${p.composition?`<p>${esc(p.composition)}</p>`:''}<p>${esc(p.note)}</p><a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">제품 출처</a>${p.labelUrl?` · <a href="${esc(p.labelUrl)}" target="_blank" rel="noopener noreferrer">표시 이미지 보기</a>`:''}</details>`:'';};
const fmt=v=>Number(v.toFixed(1)).toLocaleString('ko-KR');
const kinds={user:'직접 기록',product:'제품 표시',generic:'일반 식품 추정',estimate:'추정'};
const valueText=(total,unit,divisor=1)=>total.known?`${fmt(total.value/divisor)} ${unit}${total.missing?' + 미확인':''}`:'미확인';
const sourceText=p=>[...new Set(Object.keys(NUTRIENTS).map(k=>p[k]&&kinds[p[k].kind]).filter(Boolean))].join(' · ');
const notesHTML=p=>[...new Set(Object.values(p).filter(n=>n?.note).map(n=>n.note))].map(note=>`<small>${esc(note)}</small>`).join('');
const sourcesHTML=p=>[...new Map(Object.values(p).filter(n=>n?.url).map(n=>[n.url,n])).values()].map(n=>`<a href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">${esc(n.source||'출처')}</a>`).join(' · ');
export const inferredServings=r=>Number(String(r.variantLabel||'').match(/(\d+(?:\.\d+)?)\s*인분/)?.[1])||1;
export function recipeNutritionResult(recipe,text,context,settings=recipe.nutritionPlan,resolve=createNutritionResolver(context)){
 return calculateRecipeNutrition(parseRecipeAmounts(text,recipe.required||[]),resolve,settings||{servings:inferredServings(recipe),overrides:[]});
}
export function recipeEnergyLabel(recipe,context={},resolve){
 const edited=(context.sourceEdits||[]).some(e=>e.sourceId===recipe.id&&(e.variantKey||null)===(recipe.variantKey||null));
 const body=recipe.source&&!edited?recipe.original:(recipe.steps||[]).join('\n');
 const result=recipeNutritionResult(recipe,body||'',context,undefined,resolve),energy=result.totals.energy;
 if(!energy.known)return {text:'열량 미확인',title:'재료의 분량이나 영양정보를 입력하면 계산돼요.'};
 const incomplete=energy.missing>0||result.warnings.length>0||result.rows.some(r=>r.included&&r.percent>0&&r.review);
 return {text:`${Math.round(energy.value).toLocaleString('ko-KR')}kcal${incomplete?' + 미확인':''}`,title:incomplete?'전체 분량 중 확인된 재료의 열량만 합산했어요.':'이 레시피 전체 분량의 예상 열량이에요.'};
}
export function nutritionSummaryHTML(result,{details=true}={}){
 const metric=(key,divisor)=>valueText(result.totals[key],NUTRIENTS[key][1],divisor);
 const rows=result.rows;
 const others=`<div class="nutrition-other"><table><thead><tr><th>영양성분</th><th>전체</th><th>1인분</th></tr></thead><tbody>${['energy','sodium','carbs','protein','fat','sugars','saturatedFat','fiber','cholesterol','transFat'].map(key=>`<tr><th>${NUTRIENTS[key][0]}</th><td>${metric(key,1)}</td><td>${metric(key,result.servings)}</td></tr>`).join('')}</tbody></table></div>`;
 return `<section class="nutrition-summary" aria-label="레시피 영양 계산"><div class="nutrition-heading"><h3>영양정보 <small>전체 분량</small></h3><span>${result.partial?'일부 미확인':'재료 기준 추정'}</span></div><div class="nutrition-totals"><div><span>열량</span><strong>${metric('energy',1)}</strong></div><div><span>나트륨</span><strong>${metric('sodium',1)}</strong></div></div><details class="nutrition-expanded"><summary>상세 영양정보</summary><p class="nutrition-per-serving">${fmt(result.servings)}인분으로 나누면 1인분당 <b>${metric('energy',result.servings)}</b> · 나트륨 <b>${metric('sodium',result.servings)}</b></p>${others}${details?`<details><summary>재료별 계산과 출처 ${rows.length}개</summary><div class="nutrition-breakdown">${rows.map(row=>`<div class="nutrition-breakdown-row"><div><strong>${esc(row.name)}</strong> <span>${fmt(row.amount)}${row.unit==='g'?'g':esc(row.originalUnit)}</span><small>${esc(row.ingredient)} · ${esc(sourceText(row.profile)||'영양정보 미확인')}${row.profile.conversionNote?' · 단위 환산은 추정':''}${!row.included||row.percent===0?' · 합계 제외':''}${row.percent!==100?` · 사용량의 ${fmt(row.percent)}% 반영`:''}</small><small class="nutrition-source">${sourcesHTML(row.profile)}${row.profile.conversionNote?`<br>${esc(row.profile.conversionNote)}`:''}</small>${notesHTML(row.profile)}${row.profile.researchNote?`<small>조사 기록: ${esc(row.profile.researchNote)}</small>`:''}${row.profile.researchUrl?`<small class="nutrition-source"><a href="${esc(row.profile.researchUrl)}" target="_blank" rel="noopener noreferrer">확인 중인 참고 자료</a></small>`:''}${(row.review||row.resolution)?`<small>${esc([row.review,row.resolution].filter(Boolean).join(' · '))}</small>`:''}</div><span>${row.included&&row.percent>0?(row.values.energy==null?'열량 미확인':fmt(row.values.energy)+' kcal'):'—'}<br>${row.included&&row.percent>0?(row.values.sodium==null?'나트륨 미확인':fmt(row.values.sodium)+' mg'):'—'}</span></div>`).join('')}</div>${result.warnings.length?`<ul class="nutrition-warnings">${result.warnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul>`:''}<p class="field-help">이 목록은 계산 결과이므로 직접 덮어쓰지 않아요. 수정하려면 레시피 편집 → 영양 계산 → 계산 재료 확인·수정에서 각 재료의 ‘영양값·출처 보정’을 이용하거나, 공통 제품 정보는 식재료 편집에서 수정하세요.</p><p class="field-help">조리 전 투입량 기준입니다. 삶은 물·거르는 육수·대체안은 자동 합계에서 제외하고 확인 대상으로 표시해요. 국물·양념을 남기면 실제 섭취량이 달라집니다. 나트륨만으로 짠맛을 단정하지 않아요.</p></details>`:''}</details></section>`;
}

export function installStockNutritionEditor(target){
 if(!target?.querySelector)return {open(){},read(){return undefined;}};
 let current={},saved={},automatic={},resetMetrics=new Set(),productSwitch=null,stagedKfind=null,stagedInboxIds=new Set();
 const kfindSession={rows:[],filename:''};
 const editor={
  open(name,stock,notes=[],options={}){
   invalidateKfindFileRead(kfindSession); // Retire an unfinished file read from the prior stock editor.
   saved=structuredClone(stock[name]?.nutrition||{});
   stagedKfind=null;
   stagedInboxIds=new Set();
   current=ingredientNutrition(name,stock);
   // Reset only owner corrections; keep linked automatic reference intact.
   const referenceRecord={...(stock[name]?.nutrition||{})};
   for(const key of Object.keys(NUTRIENTS))delete referenceRecord[key];
   automatic=ingredientNutrition(name,{...stock,[name]:{...stock[name],nutrition:referenceRecord}});
   resetMetrics=new Set();
   const productKey=nutritionProductKey(name,stock);
   productSwitch=createStockProductSwitchGuard(productKey);
   const brief=key=>{const n=current[key];return n?`${key==='sodium'?'나트륨 ':''}${fmt(n.value)}${NUTRIENTS[key][1]} / ${fmt(n.amount)}${n.unit==='piece'?'개':n.unit==='ml'?'mL':'g'}`:`${NUTRIENTS[key][0]} 미확인`;};
   target.innerHTML=`<details class="nutrition-stock"><summary>영양정보 <span class="nutrition-stock-brief">${brief('energy')} · ${brief('sodium')}</span></summary><p class="field-help">영양표의 수치와 기준량을 그대로 적으세요. 레시피는 g으로 계산해요. 기존 제품 메모는 그대로 남습니다.</p><label class="field-label">영양정보에 연결할 제품<select data-product-profile><option value="">연결 안 함 · 직접 입력</option>${Object.keys(productNutrition).map(key=>`<option value="${esc(key)}" ${productKey===key?'selected':''}>${esc(key)}</option>`).join('')}</select></label><p class="field-help">다른 제품을 사면 연결 제품을 바꾸거나 해제한 뒤 영양표를 입력할 수 있어요.</p><div data-product-switch-warning hidden role="status" aria-live="polite"><p class="field-help">연결할 제품이 바뀌면 이전 영양값·출처·환산·조사 기록을 새 상품에 그대로 적용할 수 없어요. 적용 버튼을 누르면 현재 입력한 수동 기록도 초기화됩니다. 지금 기록을 보존하려면 취소하세요.</p><button type="button" class="text-button" data-confirm-product-switch>기존 수동 기록 초기화하고 제품 변경 적용</button><button type="button" class="text-button" data-cancel-product-switch>제품 변경 취소 · 기존 기록 유지</button></div><div class="nutrition-field-table"><div class="nutrition-field-head"><span>영양성분</span><span>표시 수치</span><span>기준량</span><span>기준 단위</span></div>${Object.entries(NUTRIENTS).map(([key,[label,unit]],i)=>{const n=current[key];return `${i===2?'</div><details class="nutrition-extra-fields"><summary>그 외 영양성분 8개</summary><div class="nutrition-field-table">':''}<div class="nutrition-field-row" data-nutrient="${key}"><label for="nutrition-${key}">${label}<small>${unit}</small></label><input id="nutrition-${key}" data-value type="number" min="0" step="any" inputmode="decimal" value="${esc(n?.value??'')}" placeholder="미확인"><input data-amount aria-label="${label} 기준량" type="number" min="0.001" step="any" inputmode="decimal" value="${esc(n?.amount||100)}"><select data-unit aria-label="${label} 기준 단위">${[['g','g당'],['ml','mL당'],['piece','개당']].map(([v,l])=>`<option value="${v}" ${n?.unit===v?'selected':''}>${l}</option>`).join('')}</select><details class="nutrition-proof-fields"><summary>근거·출처 수정</summary>${nutritionSourceFields(n)}<button type="button" class="text-button" data-reset-stock-metric>자동값으로 되돌리기</button></details></div>`;}).join('')}</div></details><details class="nutrition-conversion"><summary>mL·개를 g으로 환산하는 기준</summary><label>1mL의 무게(g)<input data-density type="number" min="0.001" step="any" inputmode="decimal" value="${current.gramsPerMl||''}" placeholder="제품 정보 또는 실측값"></label><label>1개의 먹는 부분 무게(g)<input data-piece type="number" min="0.001" step="any" inputmode="decimal" value="${current.gramsPerPiece||''}" placeholder="껍데기·포장 제외"></label><label>단위 환산 근거·출처<textarea data-conversion-note maxlength="1000" rows="2" placeholder="밀도·개당 무게를 확인한 자료와 적용 조건">${esc(current.conversionNote||'')}</textarea></label><p class="field-help">환산 기준이 없으면 다른 단위는 미확인으로 표시해요. 메모를 바꾸면 이 재료의 개인 기록으로 저장되고 자동 원본은 변경되지 않아요.</p></details><details class="nutrition-research"><summary>미확인 자료 조사 기록</summary><label>확인 중인 내용·미확인 사유<textarea data-research-note maxlength="2000" rows="3" placeholder="예: 보유 포장 영양표가 없고 동명의 다른 제품만 확인됨">${esc(current.researchNote||'')}</textarea></label><label>확인 중인 참고 링크 (https)<input data-research-url type="url" maxlength="2000" value="${esc(current.researchUrl||'')}" placeholder="https://..."></label><p class="field-help">조사 기록만 남겨도 열량·나트륨은 확인된 것으로 취급하지 않아요.</p></details><details class="nutrition-references"><summary>자동으로 채운 값의 참고 자료 (원본)</summary><p class="field-help">아래의 자동 원본은 그대로 보존돼요. 현재 보유 제품의 수치·출처·링크·근거는 위 영양성분별 ‘근거·출처 수정’에서 별도로 보정할 수 있어요. 저장하면 레시피 계산에도 반영돼요.</p>${sourcesHTML(automatic)}${productKey?productHTML(productKey):''}</details></details>`;
   const refPanel=target.querySelector('.nutrition-references');
   if(refPanel?.insertAdjacentElement&&typeof document!=='undefined'){
    const notesField=document.getElementById('stock-edit-notes');
    const stageCandidate=(candidate,{automatic=false,page=null}={})=>{
     if(automatic&&!canAutoStageFoodResearch(target))return false;
     const staged=stageFoodResearchCandidate(target,candidate,{notesField,page});
     if(!staged.length)return false;
     for(const key of staged)resetMetrics.delete(key);
     target.querySelector('.nutrition-stock').open=true;
     return true;
    };
    const inbox=document.createElement('details');
    inbox.className='nutrition-kfind-review';
    refPanel.insertAdjacentElement('beforebegin',inbox);
    installFoodIntakeInboxPanel(inbox,{name,notesField,onStage:stageCandidate,onDraftApplied:item=>stagedInboxIds.add(item.id)});
    const research=document.createElement('details');
    research.className='nutrition-kfind-review';
    refPanel.insertAdjacentElement('beforebegin',research);
    installFoodResearchPanel(research,{name,notes,auto:!!options.autoResearch,profile:current,
     onPageEvidence:page=>appendProductPageEvidence(notesField,page),
     onStage:stageCandidate
    });
    const lookup=document.createElement('details');
    lookup.className='nutrition-kfind-review';
    refPanel.insertAdjacentElement('beforebegin',lookup);
    installKfindCandidateReview(lookup,{name,profile:current,session:kfindSession,onStage:proposal=>{
     stageKfindEvidenceIntoStockForm(target,proposal,{saved,current,resetMetrics,productSwitch,linkedProductKey:productKey});
     stagedKfind=proposal;
     target.querySelector('.nutrition-stock').open=true;
    }});
   }
   const select=target.querySelector('[data-product-profile]');
   const warning=target.querySelector('[data-product-switch-warning]');
   select?.addEventListener('change',event=>{
    warning.hidden=!productSwitch.choose(event.target.value);
   });
   target.querySelector('[data-cancel-product-switch]')?.addEventListener('click',()=>{
    select.value=productSwitch.cancel()||'';
    warning.hidden=true;
   });
   target.querySelector('[data-confirm-product-switch]')?.addEventListener('click',()=>{
    const changed=productSwitch.confirm();
    if(!changed.changed)return;
    // The owner explicitly approved discarding evidence for the old product.
    // Keep stock name, notes and all non-nutrition properties unchanged.
    editor.open(name,{...stock,[name]:{...stock[name],nutrition:{
     productKey:changed.productKey,ignoreNotes:true
    }}},notes);
    target.querySelector('.nutrition-stock').open=true;
   });
  },
  read(notes){
   // Never silently save the old evidence while the select shows another product.
   productSwitch?.assertReady();
   // Store only explicit overrides. Derived labels and notes remain live sources.
   const out={};
   if(Object.hasOwn(saved,'productKey'))out.productKey=saved.productKey;
   if(saved.ignoreNotes)out.ignoreNotes=true;
   for(const row of target.querySelectorAll('[data-nutrient]')){
    const key=row.dataset.nutrient;
    if(resetMetrics.has(key))continue;
    const metric=readNutritionEvidence(row,key,current[key]);
    if(metric===null){
     // A cleared known value is unknown, never a verified zero.
     if(current[key]!==undefined||Object.hasOwn(saved,key))out[key]=null;
    }else if(!sameNutritionEvidence(current[key],metric))out[key]=metric;
    else if(Object.hasOwn(saved,key))out[key]=saved[key];
   }
   for(const [key,selector] of [['gramsPerMl','[data-density]'],['gramsPerPiece','[data-piece]']]){
    const field=target.querySelector(selector);
    // A partially typed number can report badInput while its value is empty.
    // Treat that as invalid, not a deliberate removal of a saved conversion.
    if(field?.validity?.badInput)throw Error('단위 환산 숫자 입력을 확인해 주세요.');
    const v=field?.value;
    if(v){if(Number(v)!==current[key])out[key]=Number(v);else if(Object.hasOwn(saved,key))out[key]=saved[key];}
    else if(current[key]!==undefined)out[key]=null;
   }
   const noteField=target.querySelector('[data-conversion-note]');
   const noteValue=noteField?String(noteField.value||'').trim():String(current.conversionNote||'').trim();
   const originalNote=String(current.conversionNote||'').trim();
   // A density/piece weight correction invalidates the old measurement
   // evidence until the owner reviews the source. Never silently drop their
   // original note or attribute a stale numeric claim to a different value.
   const basisChanged=['gramsPerMl','gramsPerPiece'].some(key=>
    Object.hasOwn(out,key)&&out[key]!==saved[key]);
   if(originalNote&&basisChanged&&(!noteValue||noteValue===originalNote))
    throw Error('단위 환산값을 변경했어요. 새로운 환산 근거를 다시 입력해 주세요.');
   if(noteField&&noteValue!==originalNote){
    if(noteValue)out.conversionNote=noteValue;
   }else if(saved.conversionNote){
    out.conversionNote=saved.conversionNote;
   }
   for(const [key,selector] of [['researchNote','[data-research-note]'],['researchUrl','[data-research-url]']]){
    const field=target.querySelector(selector);
    if(!field)continue;
    const value=String(field.value||'').trim();
    if(value!==String(current[key]||'').trim()){if(value)out[key]=value;}
    else if(Object.hasOwn(saved,key))out[key]=saved[key];
   }
   if(stagedKfind){
    // Explicitly unlink the generic/product catalog for this reviewed package.
    // Missing K-FIND nutrients must stay unknown, including after reopening.
    out.productKey=null;
    for(const [key,metric] of Object.entries(stagedKfind.metrics))
     if(!sameNutritionEvidence(out[key],metric))
      throw Error('K-FIND에서 임시 입력한 영양값이나 출처가 변경됐어요. 이 상태로 공식 후보를 인용할 수 없어요. 편집창을 닫고 다시 검토해 주세요.');
    out.kfindEvidence=stagedKfind.kfindEvidence;
   }else if(saved.kfindEvidence){
    Object.assign(out,preserveKfindSourceAfterOwnerEdit(saved,out));
   }
   return validateNutrition(out);
  },
  async commitInbox(){
   const ids=[...stagedInboxIds];
   const failed=[];
   for(const id of ids){
    try{
     const response=await fetch('/api/food-research/intake-inbox/'+encodeURIComponent(id),{
      method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','Accept':'application/json'},
      body:JSON.stringify({status:'applied'})
     });
     const data=await response.json().catch(()=>({}));
     if(!response.ok||data.status!=='applied')throw Error(data.message||'받은 상품정보 적용 완료 상태를 저장하지 못했어요.');
     stagedInboxIds.delete(id);
    }catch{failed.push(id);}
   }
   return {ok:failed.length===0,failed,total:ids.length};
  }
 };
 target.addEventListener?.('input',event=>{
  const row=event.target.closest?.('[data-nutrient]');if(row)resetMetrics.delete(row.dataset.nutrient);
 });
 target.addEventListener?.('change',event=>{
  const row=event.target.closest?.('[data-nutrient]');if(row)resetMetrics.delete(row.dataset.nutrient);
 });
 target.addEventListener?.('click',event=>{
  const button=event.target.closest?.('[data-reset-stock-metric]');if(!button)return;
  const row=button.closest('[data-nutrient]');if(!row)return;
  fillNutritionEvidence(row,automatic[row.dataset.nutrient]);
  resetMetrics.add(row.dataset.nutrient);
  button.textContent='자동값 복원 대기 · 재료 저장 시 확정';
 });
 return editor;
}

export function installRecipeNutritionEditor(target,getContext){
 if(!target?.querySelector)return {open(){},read(){return undefined;},refresh(){}};
 const body=document.getElementById('recipe-steps');let settings={servings:1,overrides:[]},result=null,activeProofRowKey=null,lastMeasuredAppend=null;
 let flushOpenProof=()=>true;
 const recipe=()=>({required:document.getElementById('recipe-required').value.split(/[,，、;\n]+/).map(s=>s.trim()).filter(Boolean)});
 const missingControlsHTML=(recipeData,raw,calculated)=>{
  const input={body:raw,required:recipeData.required,warnings:calculated.warnings};
  const names=measurableMissingRequired(input);
  const {alternatives,possible}=inspectMissingQuantityWarnings(input);
  // Read-only guidance. Never change nutritional totals, required identity
  // or the authored recipe when encountering a similarly named measured row.
  const review=alternatives.length||possible.length?
   '<section class="nutrition-missing-quantity" aria-label="분량 누락 원인 확인"><h4>이미 계량한 재료·대체안 확인</h4>'+
   '<p class="field-help">계량 기록이 있어도 같은 재료인지 확정할 수 없어요. 실제 제품·투입량을 확인한 뒤, 필요하면 필수 재료명과 원문 또는 감지 규칙을 일치시켜 주세요. 이 안내는 영양 계산값을 바꾸지 않아요.</p>'+
   (possible.length?'<ul>'+possible.map(item=>'<li>'+esc(item.name)+' — 기존 계량 후보: '+
    item.matches.map(m=>esc(m.name)+' '+(m.grams===null?'단위 확인 필요':esc(String(m.grams))+'g')).join(' / ')+'</li>').join('')+'</ul>':'')+
   (alternatives.length?'<p class="field-help">대체 재료 또는 이름 구분 확인: '+alternatives.map(esc).join(' / ')+
    '. 실제 사용할 재료를 선택하고 그 양을 원문에 명시해 주세요.</p>':'')+
   '</section>':'';
  if(!names.length)return review;
  return review+'<section class="nutrition-missing-quantity" aria-label="미계량 재료 직접 추가"><h4>분량 미확인 재료 직접 계량 ('+names.length+'개)</h4>'+
   '<p class="field-help">실제로 잰 g만 입력하세요. 이름 표기만 다른 동일 재료라면 자동 감지 설정부터 확인하세요. 기존 조리 문장은 유지하고 편집 초안 끝에 계량 기록을 추가합니다. 저장 전 수정·삭제할 수 있어요.</p>'+
   names.map(name=>'<div class="nutrition-missing-quantity-row" data-missing-ingredient="'+esc(name)+'">'+
   '<label>'+esc(name)+' 사용량(g)<input data-missing-grams type="number" min="0.001" max="1000000" step="any" inputmode="decimal" aria-label="'+esc(name)+' 실측 사용량(g)" placeholder="실측 g"></label>'+
   '<button type="button" class="text-button" data-add-missing-grams>계량값 추가</button>'+
   '<small data-missing-error role="alert" aria-live="polite"></small></div>').join('')+'</section>';
 };
 const proofRowHTML=row=>row.evidenceDormant?
  `<section class="nutrition-row-proof" data-proof-panel><p class="nutrition-proof-pending">다른 제품·조리 상태에 대해 저장했던 영양 근거가 보류 중이에요. 지금 수정하면 과거 기록을 덮어쓸 수 있어요. 이전 제품을 다시 선택하면 이전 근거가 되살아납니다.</p><button type="button" class="text-button" data-replace-dormant-proof>이전 보정을 삭제하고 현재 제품의 새 근거 작성</button></section>`:
  `<section class="nutrition-row-proof" data-proof-panel><p class="field-help">이 값과 출처는 이 레시피에만 적용돼요. 원본 자동 참고 자료와 다른 레시피, 재고 영양값은 바뀌지 않아요. 확인된 포장·조리 상태에 맞는 값을 입력하고 근거를 적어 주세요. 숫자를 지우면 ‘미확인’으로 남고 0으로 취급하지 않아요.</p>${nutritionMetricRows(row.profile)}<div class="nutrition-proof-conversions"><label>1mL의 무게(g)<input type="number" min="0.001" step="any" data-proof-density value="${esc(row.profile.gramsPerMl??'')}" placeholder="미확인"></label><label>1개의 먹는 부분 무게(g)<input type="number" min="0.001" step="any" data-proof-piece value="${esc(row.profile.gramsPerPiece??'')}" placeholder="미확인"></label><label>단위 환산 근거<textarea data-proof-conversion-note maxlength="1000" rows="2">${esc(row.profile.conversionNote||'')}</textarea></label></div><div class="nutrition-research"><label>확인 중인 자료·실제 섭취·추출 상태 기록<textarea data-proof-research-note maxlength="2000" rows="3">${esc(row.profile.researchNote||'')}</textarea></label><label>확인 중인 참고 링크 (https)<input type="url" data-proof-research-url maxlength="2000" value="${esc(row.profile.researchUrl||'')}"></label><p class="field-help">확인 메모는 레시피별 조사·조리 기록입니다. 적었다고 흡수된 영양량이 증명되거나 계산 경고가 없어지지는 않아요.</p></div><button type="button" class="text-button" data-reset-row-proof>이 레시피의 영양값·출처 보정 전부 취소</button><p class="nutrition-proof-error" data-proof-error role="alert" aria-live="polite"></p></section>`;
 const refresh=({skipProofFlush=false}={})=>{
  if(!skipProofFlush&&!flushOpenProof())return;
  if(lastMeasuredAppend&&body.value!==lastMeasuredAppend.after)lastMeasuredAppend=null;
  const disclosures=[...target.querySelectorAll('details')].map(d=>d.open);
  result=recipeNutritionResult(recipe(),body.value,getContext(),settings);
  target.innerHTML=`<div class="nutrition-editor"><div class="nutrition-heading"><h3>영양 계산</h3><label>인분<input data-servings aria-label="영양 계산 인분" type="number" min="0.1" step="0.1" value="${settings.servings}"></label></div><div role="status" aria-live="polite">${nutritionSummaryHTML(result,{details:false})}</div><details><summary>계산 재료 확인·수정 ${result.rows.length}개</summary><p class="field-help">사용량 수정은 본문의 해당 재료 목록에 반영돼요. 조리 단계에 같은 수치를 다시 썼다면 함께 확인해 주세요. 반영 비율은 투입량의 일정 비율을 계산에 사용하는 추정치이며, 실제 육수 추출·절임 흡수량을 증명하지 않아요. 제품 연결과 합계 포함 여부를 바꿀 수 있어요. 선택 재료·대체안·삶는 물은 사용할 것만 체크하세요.</p><datalist id="nutrition-products">${[...new Set([...(getContext().pantry||[]),...Object.keys(getContext().stockOverrides||{})])].map(n=>`<option value="${esc(n)}"></option>`).join('')}</datalist>${result.rows.map((row,i)=>`<div class="nutrition-edit-row" data-row="${i}"><label class="nutrition-include"><input data-include type="checkbox" ${row.included?'checked':''}>${esc(row.name)}${row.section?` <small>${esc(row.section)}</small>`:''}</label><div class="nutrition-row-controls"><label>사용량<input data-quantity aria-label="${esc(row.name)} 사용량" type="number" min="0" step="any" value="${row.amount}"><small>${row.unit==='g'?'g':esc(row.originalUnit)}</small></label><label>반영 비율<input data-percent aria-label="${esc(row.name)} 반영 비율" type="number" min="0" max="100" step="any" value="${row.percent}"><small>%</small></label><label class="nutrition-product-label">계산에 쓸 식재료<input data-product list="nutrition-products" aria-label="${esc(row.name)} 계산 제품" value="${esc(row.ingredient)}"></label></div><small>${esc(sourceText(row.profile)||'영양정보 미확인')}${(row.review||row.resolution)?' · '+esc([row.review,row.resolution].filter(Boolean).join(' · ')):''}</small>${activeProofRowKey===row.key?proofRowHTML(row):''}<button type="button" class="text-button" data-edit-proof>${activeProofRowKey===row.key?'영양값·근거 수정 닫기':'이 재료의 영양값·출처 보정'}</button>${!row.evidenceDormant?'<button type="button" class="text-button" data-review-intake>섭취·추출 근거 기록</button>':''}${row.evidenceDormant?'<small class="nutrition-proof-pending">다른 제품·조리 상태용으로 저장한 영양 보정은 보류 중이에요. 이전 제품을 다시 선택하면 되살아나요.</small>':''}${row.unit==='piece'&&row.profile.gramsPerPiece?`<button type="button" class="text-button" data-to-grams>약 ${fmt(row.amount*row.profile.gramsPerPiece)}g으로 본문 바꾸기</button>`:''}</div>`).join('')}${missingControlsHTML(recipe(),body.value,result)}${lastMeasuredAppend&&body.value===lastMeasuredAppend.after?`<div class="nutrition-measured-feedback" role="status">${esc(lastMeasuredAppend.name)} 실측값을 초안에 추가했어요. <button type="button" class="text-button" data-undo-measured>방금 추가 취소</button></div>`:''}${result.warnings.length?`<ul class="nutrition-warnings">${result.warnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul>`:''}</details></div>`;
  [...target.querySelectorAll('details')].forEach((d,i)=>{if(disclosures[i]!==undefined)d.open=disclosures[i];});
 };
 // Recalculate the visible total without replacing focused evidence inputs.
 // A full redraw on every change/blur destroys the next click and interrupts
 // multi-field product-label transcription.
 const refreshTotalsOnly=()=>{
  result=recipeNutritionResult(recipe(),body.value,getContext(),settings);
  const status=target.querySelector('.nutrition-editor [role="status"]');
  if(status)status.innerHTML=nutritionSummaryHTML(result,{details:false});
 };
 const saveOverride=(row,changes)=>{const old=settings.overrides.find(x=>x.key===row.key)||{key:row.key,included:row.included,percent:row.percent,ingredient:row.ingredient};settings.overrides=[...settings.overrides.filter(x=>x.key!==row.key),{...old,...changes}];};
 const currentEvidence=row=>{
  const saved=settings.overrides.find(item=>item.key===row.key);
  // Editing a note cannot accidentally reactivate old unbound evidence.
  const bound=Boolean(saved?.evidenceFor&&Object.hasOwn(saved,'evidencePreparation')&&
   Object.hasOwn(saved,'evidenceProductKey'));
  return bound&&nutritionKey(saved.evidenceFor)===nutritionKey(row.ingredient)&&
   saved.evidencePreparation===(row.preparation||'')&&
   saved.evidenceProductKey===(row.resolvedProductKey||'')?
   {...saved.nutrition||{}}:{};
 };
 // Every redraw must validate visible evidence before replacing its inputs.
 flushOpenProof=()=>{
  const proof=target.querySelector('[data-proof-panel]');
  if(!proof)return true;
  const parent=proof.closest('[data-row]'),row=parent&&result?.rows[Number(parent.dataset.row)];
  if(!row||row.evidenceDormant)return true;
  try{
   const next=readNutritionProofDraft(proof,row.profile,currentEvidence(row));
   saveOverride(row,{nutrition:next,evidenceFor:row.ingredient,
    evidencePreparation:row.preparation||'',evidenceProductKey:row.resolvedProductKey||''});
   const message=proof.querySelector('[data-proof-error]');if(message)message.textContent='';
   return true;
  }catch(error){
   const message=proof.querySelector('[data-proof-error]');if(message)message.textContent=error.message;
   return false;
  }
 };
 target.addEventListener('change',event=>{
  const field=event.target;
  if(field.matches('[data-servings]')){if(!flushOpenProof())return;const n=Number(field.value);if(n>0&&n<=1000)settings.servings=n;refresh();return;}
  const parent=field.closest('[data-row]'),row=parent&&result.rows[Number(parent.dataset.row)];if(!row)return;
  const proof=field.closest('[data-proof-panel]');
  if(proof){
   if(row.evidenceDormant)return; // Old evidence is never overwritten by incidental edits.
   try{
    const next=readNutritionProofDraft(proof,row.profile,currentEvidence(row));
    saveOverride(row,{nutrition:next,evidenceFor:row.ingredient,evidencePreparation:row.preparation||'',evidenceProductKey:row.resolvedProductKey||''});
    const message=proof.querySelector('[data-proof-error]');if(message)message.textContent='';
    refreshTotalsOnly();
   }catch(error){const message=proof.querySelector('[data-proof-error]');if(message)message.textContent=error.message;}
   return;
  }
  if(!flushOpenProof())return;
  if(field.matches('[data-quantity]')){
   const n=Number(field.value);if(!Number.isFinite(n)||n<0)return;
   const text=gramCookingText(body.value);body.value=text.slice(0,row.start)+n+(row.unit==='g'?'g':row.originalUnit)+text.slice(row.end);body.dispatchEvent(new Event('input',{bubbles:true}));
  }else if(field.matches('[data-include]'))saveOverride(row,{included:field.checked});
  else if(field.matches('[data-percent]')){const n=Number(field.value);if(n>=0&&n<=100)saveOverride(row,{percent:n});}
  else if(field.matches('[data-product]'))saveOverride(row,{ingredient:field.value.trim()});
  refresh();
 });
 target.addEventListener('keydown',event=>{
  if(event.key!=='Enter'||event.isComposing||!event.target.matches?.('[data-missing-grams]'))return;
  // Numeric input lives inside recipe <form>. Enter must not submit it.
  event.preventDefault();
  event.target.closest('[data-missing-ingredient]')?.querySelector('[data-add-missing-grams]')?.click();
 });
 target.addEventListener('click',event=>{
  if(event.target.closest('[data-undo-measured]')){
   if(!flushOpenProof())return;
   const last=lastMeasuredAppend;
   if(!last||body.value!==last.after)return;
   lastMeasuredAppend=null;
   body.value=last.before;
   body.dispatchEvent(new CustomEvent('input',{bubbles:true,detail:{nutritionMeasuredEdit:true}}));
   return;
  }
  const measured=event.target.closest('[data-add-missing-grams]');
  if(measured){
   const line=measured.closest('[data-missing-ingredient]');
   const field=line?.querySelector('[data-missing-grams]');
   const message=line?.querySelector('[data-missing-error]');
   try{
    if(!flushOpenProof())return;
    if(!field||field.validity?.badInput||!field.checkValidity())
     throw Error('실제로 잰 올바른 g 수치를 입력해 주세요.');
    const name=line.dataset.missingIngredient,grams=Number(field.value);
    const next=appendMeasuredMissingGram({
     body:body.value,required:recipe().required,warnings:result.warnings,name,grams
    });
    if(recipeNutritionResult(recipe(),next,getContext(),settings).warnings.includes('분량 미확인: '+name))
     throw Error('재료 연결이 모호해 추가하지 않았어요. 자동 감지 설정을 확인해 주세요.');
    lastMeasuredAppend={before:body.value,after:next,name};
    body.value=next;
    body.dispatchEvent(new CustomEvent('input',{bubbles:true,detail:{nutritionMeasuredEdit:true}}));
   }catch(error){if(message)message.textContent=error.message;field?.focus();}
   return;
  }
  const button=event.target.closest('[data-edit-proof],[data-review-intake],[data-replace-dormant-proof],[data-reset-row-proof],[data-reset-row-metric],[data-to-grams]');if(!button)return;
  const parent=button.closest('[data-row]'),row=parent&&result.rows[Number(parent.dataset.row)];if(!row)return;
  if(button.matches('[data-review-intake]')){
   if(!flushOpenProof())return;
   activeProofRowKey=row.key;
   refresh({skipProofFlush:true});
   // Bound nutrition proof already keeps researchNote in this recipe only
   // and disables old evidence for a different product or preparation.
   target.querySelector('[data-row="'+parent.dataset.row+'"] [data-proof-research-note]')?.focus();
   return;
  }
  if(button.matches('[data-edit-proof]')){if(!flushOpenProof())return;activeProofRowKey=activeProofRowKey===row.key?null:row.key;refresh({skipProofFlush:true});return;}
  if(button.matches('[data-replace-dormant-proof]')){
   if(!row.evidenceDormant)return;
   saveOverride(row,{nutrition:{},evidenceFor:row.ingredient,evidencePreparation:row.preparation||'',evidenceProductKey:row.resolvedProductKey||''});
   refresh({skipProofFlush:true});return;
  }
  if(button.matches('[data-reset-row-proof]')){saveOverride(row,{nutrition:{},evidenceFor:row.ingredient,evidencePreparation:row.preparation||'',evidenceProductKey:row.resolvedProductKey||''});refresh({skipProofFlush:true});return;}
  if(button.matches('[data-reset-row-metric]')){
   const metricRow=button.closest('[data-nutrient]'),key=metricRow?.dataset.nutrient;
   if(!key||!Object.hasOwn(NUTRIENTS,key))return;
   // The explicitly reset metric is replaced first; every other open field
   // remains subject to strict validation and must not be silently discarded.
   fillNutritionEvidence(metricRow,row.baseProfile?.[key]);
   if(!flushOpenProof())return;
   const next={...currentEvidence(row)};delete next[key];
   saveOverride(row,{nutrition:validateNutrition(next),evidenceFor:row.ingredient,evidencePreparation:row.preparation||'',evidenceProductKey:row.resolvedProductKey||''});
   refresh({skipProofFlush:true});return;
  }
  if(!flushOpenProof())return;
  const text=gramCookingText(body.value);
  body.value=text.slice(0,row.start)+Number((row.amount*row.profile.gramsPerPiece).toFixed(2))+'g'+text.slice(row.end);body.dispatchEvent(new Event('input',{bubbles:true}));refresh();
 });
 body.addEventListener('input',refresh);
 document.getElementById('recipe-required').addEventListener('input',refresh);
 return {open(r={}){activeProofRowKey=null;lastMeasuredAppend=null;settings=r.nutritionPlan?structuredClone(r.nutritionPlan):{servings:inferredServings(r),overrides:[]};refresh({skipProofFlush:true});},refresh,read(){
  for(const proof of target.querySelectorAll('[data-proof-panel]')){
   const parent=proof.closest('[data-row]'),row=parent&&result.rows[Number(parent.dataset.row)];
   if(!row||row.evidenceDormant)continue;
   const next=readNutritionProofDraft(proof,row.profile,currentEvidence(row));
   saveOverride(row,{nutrition:next,evidenceFor:row.ingredient,evidencePreparation:row.preparation||'',evidenceProductKey:row.resolvedProductKey||''});
   const error=proof.querySelector('[data-proof-error]');if(error)error.textContent='';
  }
  if([...target.querySelectorAll('[data-proof-error]')].some(el=>el.textContent?.trim()))throw Error('영양정보 근거 입력 오류를 먼저 수정해 주세요.');
  const active=new Set(result?.rows.map(r=>r.key));
  return validateRecipeNutrition({...settings,overrides:settings.overrides.filter(r=>active.has(r.key))});
 }};
}
