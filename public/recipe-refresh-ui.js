import {inspectRefresh,applyRefresh,undoRefresh,validateRefreshPlan,refreshKey} from './recipe-refresh.js';
import {downloadBackupData} from './download-file.js?v=20260919-1';

export function installRecipeRefresh({getContext,applyContext,persist,render,snapshot,toast}){
 const button=document.getElementById('open-recipe-refresh');
 const dialog=document.createElement('dialog');dialog.id='recipe-refresh-dialog';
 dialog.innerHTML=`<div class="recipe-editor"><div class="dialog-top"><span class="eyebrow">RECIPE REFRESH</span><button type="button" class="icon-button" data-close aria-label="레시피 정비 닫기">✕</button></div><h2>레시피 정비안</h2><p>정비 파일을 불러오면 지금 레시피와 비교해요. 검토 이후 직접 고친 레시피와 숨긴 레시피는 건너뛰고, 개인 메모·별점·조리 기록은 유지해요.</p><label class="field-label">정비 파일 선택<input type="file" accept=".json,application/json" data-file></label><details class="refresh-paste"><summary>정비 내용 붙여넣기</summary><label class="field-label">복사한 정비 내용<textarea data-paste rows="5" spellcheck="false" maxlength="16000000"></textarea></label><button type="button" class="outline-button" data-load-paste>붙여넣은 정비안 불러오기</button></details><p data-message role="status"></p><div class="editor-actions"><button type="button" class="primary-button" data-apply disabled>선택한 정비 적용</button><button type="button" class="outline-button" data-undo>이 브라우저의 마지막 정비 되돌리기</button></div><p class="field-help">적용 전 전체 백업을 다운로드해요. 되돌리기는 정비 이후 추가 수정이 없는 항목에만 적용돼요. 기기 간 저장 상태는 상단 표시에서 확인해 주세요.</p><div data-list></div></div>`;
 document.body.append(dialog);
 const $=selector=>dialog.querySelector(selector),message=text=>$('[data-message]').textContent=text;
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const storageKey='mlk-recipe-refresh-receipt-v1';let plan=null,receipt=[];
 try{const saved=JSON.parse(localStorage.getItem(storageKey)||'[]');if(Array.isArray(saved))receipt=saved;}catch{}
 function draw(){
  $('[data-undo]').disabled=!receipt.length;
  if(!plan)return;
  const rows=inspectRefresh(getContext(),plan),ready=rows.filter(r=>r.status==='ready').length;
  message(`적용 가능 ${ready}개 · 이미 반영 ${rows.filter(r=>r.status==='applied').length}개 · 이후 수정/숨김 ${rows.filter(r=>['changed','missing'].includes(r.status)).length}개`);
  $('[data-apply]').disabled=!ready;
  $('[data-list]').innerHTML=rows.map(r=>`<details class="refresh-row"><summary><input type="checkbox" data-patch="${esc(refreshKey(r))}" ${r.status==='ready'?'checked':'disabled'} aria-label="${esc(r.name)} 정비 선택"> ${esc(r.name)} · ${esc(r.label||'기본')} <small>${{ready:'적용 가능',applied:'반영됨',changed:'직접 수정됨 · 유지',missing:'숨김/없음 · 유지'}[r.status]}</small></summary><p>${esc(r.reason)}</p>${r.required?`<p class="field-help">재료 목록도 함께 갱신: ${esc(r.required.join(', '))}</p>`:''}<div class="refresh-comparison"><div><h3>현재 기록</h3><pre>${esc(r.body??r.before)}</pre></div><div><h3>정비안</h3><pre>${esc(r.after)}</pre></div></div></details>`).join('');
 }
 button.addEventListener('click',()=>{draw();dialog.showModal();});
 $('[data-close]').addEventListener('click',()=>dialog.close());
 $('[data-load-paste]').addEventListener('click',()=>{
  try{plan=validateRefreshPlan(JSON.parse($('[data-paste]').value));draw();}
  catch(error){plan=null;$('[data-list]').replaceChildren();$('[data-apply]').disabled=true;message('정비 내용을 읽지 못했어요. 전체 내용을 복사했는지 확인해 주세요.');}
 });
 $('[data-file]').addEventListener('change',async event=>{
  try{const file=event.target.files[0];if(!file)return;if(file.size>16000000)throw Error('정비 파일이 너무 커요.');plan=validateRefreshPlan(JSON.parse(await file.text()));draw();}catch(error){plan=null;$('[data-list]').replaceChildren();$('[data-apply]').disabled=true;message(error.message);}
 });
 $('[data-apply]').addEventListener('click',()=>{
  try{
   const before=getContext(),selected=new Set([...dialog.querySelectorAll('[data-patch]:checked')].map(el=>el.dataset.patch)),next=applyRefresh(before,plan,selected);
   if(!next.receipt.length){draw();return;}
   downloadBackupData(snapshot(),'my-kitchen-before-recipe-refresh.json');
   // Keep rollback information before touching the recipe state.
   const previousReceipt=receipt;localStorage.setItem(storageKey,JSON.stringify(next.receipt));
   applyContext(next);
   if(!persist()){applyContext(before);localStorage.setItem(storageKey,JSON.stringify(previousReceipt));throw Error('저장하지 못해 기존 레시피를 유지했어요.');}
   receipt=next.receipt;render();draw();toast(`${receipt.length}개 레시피를 정비했어요. 서버 저장 상태를 확인해 주세요.`);
  }catch(error){message(error.message);}
 });
 $('[data-undo]').addEventListener('click',()=>{
  try{const before=getContext(),next=undoRefresh(before,receipt);if(!next.reverted){message('정비 후 추가 수정된 항목은 유지했어요.');return;}
   applyContext(next);if(!persist()){applyContext(before);throw Error('되돌리기를 저장하지 못했어요.');}
   receipt=next.remaining;localStorage.setItem(storageKey,JSON.stringify(receipt));render();draw();message(`${next.reverted}개를 되돌렸어요. 추가 수정된 ${receipt.length}개는 유지했어요.`);
  }catch(error){message(error.message);}
 });
}
