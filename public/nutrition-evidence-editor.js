// Owner-edited evidence is separate from the shared automatic catalog.
// Used by both global stock fields and recipe-local row corrections.
import {NUTRIENTS,validateNutrition} from './nutrition.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function nutritionSourceFields(metric={}){
 return `<div class="nutrition-proof-meta"><label>출처 이름<input data-evidence-source maxlength="500" value="${esc(metric?.source||'')}" placeholder="직접 확인한 라벨·자료명"></label><label>출처 주소 (https)<input data-evidence-url type="url" maxlength="2000" value="${esc(metric?.url||'')}" placeholder="https://..."></label><label>확인 근거·포장 정보<textarea data-evidence-note maxlength="1000" rows="2" placeholder="제품명, 포장 버전, 생것/조리 후, 확인일 등">${esc(metric?.note||'')}</textarea></label></div>`;
}
export function nutritionMetricRows(profile={}){
 return Object.entries(NUTRIENTS).map(([key,[label,unit]])=>{
  const n=profile[key];
  return `<div class="nutrition-proof-row" data-nutrient="${key}"><strong>${esc(label)} <small>${esc(unit)}</small></strong><div class="nutrition-proof-measure"><label>표시 수치<input data-value type="number" min="0" step="any" value="${esc(n?.value??'')}" placeholder="미확인"></label><label>기준량<input data-amount type="number" min="0.001" step="any" value="${esc(n?.amount||100)}"></label><label>단위<select data-unit>${[['g','g'],['ml','mL'],['piece','개']].map(([v,l])=>`<option value="${v}" ${n?.unit===v?'selected':''}>${l}</option>`).join('')}</select></label></div>${nutritionSourceFields(n)}<button type="button" class="text-button" data-reset-row-metric>이 영양성분 자동값으로 복원</button></div>`;
 }).join('');
}
export function readNutritionEvidence(row,key,baseline){
 if(!Object.hasOwn(NUTRIENTS,key))throw Error('영양성분 항목을 확인해 주세요.');
 const valueInput=row.querySelector('[data-value]');
 const amountInput=row.querySelector('[data-amount]');
 // Invalid number input can have value='' even though the user did not clear
 // the field. Never interpret a browser badInput as an explicit unknown.
 if(valueInput?.validity?.badInput||amountInput?.validity?.badInput)
  throw Error(`${NUTRIENTS[key][0]}의 숫자 입력을 확인해 주세요.`);
 const rawValue=valueInput?.value;
 const val=rawValue===undefined?undefined:String(rawValue).trim();
 if(val===undefined)throw Error('영양값 입력란을 찾지 못했어요.');
 // Validate the visible source URL before interpreting a blank numeric field
 // as a deliberate clear-to-unknown. Recipe-local evidence has always
 // enforced this; the stock editor must provide the identical fail-closed rule.
 // A legacy numeric-only mock may return its unit field for unknown selectors.
 const unitField=row.querySelector('[data-unit]');
 const urlInput=row.querySelector('[data-evidence-url]');
 if(urlInput&&urlInput!==unitField){
  const sourceURL=String(urlInput.value??'').trim();
  if(sourceURL&&!/^https:\/\//i.test(sourceURL))throw Error('영양정보 출처는 https 주소로 입력해 주세요.');
 }
 if(val==='')return null; // explicit unknown, never a zero
 const value=Number(val),amount=Number(amountInput?.value),unit=unitField?.value;
 // A legacy/test-only editor can provide numeric controls without the new
 // provenance controls. In that case preserve the existing source metadata.
 const fieldValue=(selector,fallback)=>{
  const field=row.querySelector(selector);
  return field&&field!==unitField?String(field.value??'').trim():fallback||'';
 };
 const source=fieldValue('[data-evidence-source]',baseline?.source);
 const url=fieldValue('[data-evidence-url]',baseline?.url);
 const note=fieldValue('[data-evidence-note]',baseline?.note);
 return validateNutrition({[key]:{value,amount,unit,kind:'user',...(source?{source}:{}),...(url?{url}:{}),...(note?{note}:{})}})[key];
}
// Read every nutrient together so an invalid value cannot be hidden by
// changing another field. Unchanged derived values remain automatic.
export function readNutritionProofDraft(proof,profile={},existing={}){
 if(!proof?.querySelectorAll)throw Error('영양 근거 입력창을 찾지 못했어요.');
 const next={...existing};
 for(const row of proof.querySelectorAll('[data-nutrient]')){
  const key=row.dataset?.nutrient;
  if(!Object.hasOwn(NUTRIENTS,key))throw Error('영양성분 항목을 확인해 주세요.');
  const valueInput=row.querySelector('[data-value]');
  if(valueInput?.validity?.badInput)throw Error(`${NUTRIENTS[key][0]}의 수치를 확인해 주세요.`);
  // readNutritionEvidence validates source URL even when the numeric
  // field is blank, for stock and recipe edits through one code path.
  const evidence=readNutritionEvidence(row,key,profile[key]);
  if(evidence===null){
   if(profile[key]!==undefined||Object.hasOwn(existing,key))next[key]=null;
  }else if(!sameNutritionEvidence(profile[key],evidence)){
   next[key]=evidence;
  }
 }
 for(const [key,selector] of [['gramsPerMl','[data-proof-density]'],['gramsPerPiece','[data-proof-piece]']]){
  const field=proof.querySelector(selector);
  if(!field)continue;
  if(field.validity?.badInput)throw Error('단위 환산 수치를 확인해 주세요.');
  const value=String(field.value??'').trim();
  if(value!==String(profile[key]??'').trim())next[key]=value===''?null:Number(value);
 }
 // Existing manual OR automatic measurement provenance cannot describe a
 // different density/piece value. Keep the saved data schema unchanged:
 // a new measurement must carry a revised, nonempty evidence note.
 const previousNote=String(profile.conversionNote??'').trim();
 const noteField=proof.querySelector('[data-proof-conversion-note]');
 const draftNote=noteField?String(noteField.value??'').trim():previousNote;
 const changedBasis=['gramsPerMl','gramsPerPiece'].some(key=>
  Object.hasOwn(next,key)&&next[key]!==profile[key]);
 if(previousNote&&changedBasis&&(!draftNote||draftNote===previousNote))
  throw Error('단위 환산값을 변경했어요. 새로운 환산 근거를 다시 입력해 주세요.');
 for(const [key,selector] of [
  ['conversionNote','[data-proof-conversion-note]'],
  ['researchNote','[data-proof-research-note]'],
  ['researchUrl','[data-proof-research-url]']
 ]){
  const field=proof.querySelector(selector);
  if(!field)continue;
  const value=String(field.value??'').trim();
  if(value!==String(profile[key]??'').trim()){
   if(value)next[key]=value;
   else delete next[key];
  }
 }
 return validateNutrition(next);
}
// Choosing another product is NOT consent to erase the owner's current label,
// conversion basis, investigation notes or unsaved edits. A separate explicit
// confirmation must be required before rebuilding a stock evidence editor.
export function createStockProductSwitchGuard(initialKey=null){
 const original=initialKey||null;
 let pending=undefined;
 return {
  choose(value){
   const next=value||null;
   pending=next===original?undefined:next;
   return pending!==undefined;
  },
  hasPending(){return pending!==undefined;},
  cancel(){pending=undefined;return original;},
  assertReady(){if(pending!==undefined)throw Error('연결 제품 변경을 적용하거나 취소한 뒤 식재료를 저장해 주세요.');},
  confirm(){
   if(pending===undefined)return {changed:false,productKey:original};
   const selected=pending;
   pending=undefined;
   return {changed:true,productKey:selected};
  }
 };
}
export function sameNutritionEvidence(a,b){
 if(!a||!b)return !a&&!b;
 return a.value===b.value&&a.amount===b.amount&&a.unit===b.unit&&
  (a.source||'')===(b.source||'')&&(a.url||'')===(b.url||'')&&(a.note||'')===(b.note||'');
}
export function fillNutritionEvidence(row,n){
 const fields={'[data-value]':n?.value??'','[data-amount]':n?.amount||100,
  '[data-unit]':n?.unit||'g','[data-evidence-source]':n?.source||'',
  '[data-evidence-url]':n?.url||'','[data-evidence-note]':n?.note||''};
 for(const [selector,value] of Object.entries(fields)){const input=row.querySelector(selector);if(input)input.value=value;}
}
