import {detectIngredientRules,detectionNamesFromInput,normalizeIngredientDetectionRules} from './ingredient-detection.js?v=20261018-2';

const quantityNumber=String.raw`(?:\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?(?:\s*(?:~|～|∼|〜|-|–|—)\s*\d+(?:[.,]\d+)?)?)`;
const quantityUnit=String.raw`(?:kg|mg|g|mL|ml|L|개입|개|알|장|쪽|조각|토막|마리|봉|팩|캔|스틱|큰술|작은술|테이블스푼|티스푼|스푼|컵|줌|꼬집|줄기|잎|방울|T|t)`;
const quantityRE=new RegExp(String.raw`(?:^|[\s(（])(?:약\s*)?${quantityNumber}\s*${quantityUnit}(?=\s|$|[)）+·,，、/]|[가-힣])`,'i');
const qualitativeAmountRE=/(?:^|[\s(（])(?:약간|조금|적당량|취향껏|한\s*꼬집)(?=\s|$|[)）+·,，、/])/;
const instructionRE=/^\s*(?:\d+\s*[.)]|[①②③④⑤⑥⑦⑧⑨⑩]|(?:조리|만드는\s*법|방법|과정)\s*[:：])/;
const actionWords=/^(?:넣고|넣어|섞고|섞어|가열|끓이기|끓이고|볶기|볶고|볶아|굽기|굽고|구워|데우기|데우고|썰기|썰고|다지기|다지고|갈기|갈고|갈아|붓기|붓고|담기|담고|올리기|올리고|뿌리기|뿌리고|익히기|익히고|해동|전자레인지|에어프라이어)(?=\s|$)/;
const genericNameTokens=new Set(['재료','필수 재료','소스','양념','토핑','베이스','면']);
const escapeHTML=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

function amountMatch(value){
 const matches=[value.match(quantityRE),value.match(qualitativeAmountRE)].filter(Boolean);
 return matches.sort((a,b)=>a.index-b.index)[0]||null;
}

function knownIngredientNames(root=document){
 const names=new Set();
 root.querySelectorAll('#ingredient-options option').forEach(o=>{if(o.value)names.add(o.value.trim());});
 root.querySelectorAll('.ingredient-name').forEach(b=>{const text=b.childNodes[0]?.textContent?.trim();if(text)names.add(text);});
 return [...names].filter(Boolean).sort((a,b)=>b.length-a.length);
}

function cleanIngredient(segment){
 let s=segment.trim().replace(/^[•·*\-–—]\s*/,'');
 s=s.replace(/^(?:재료|필수\s*재료|소스|양념|토핑|면|베이스)\s*[:：]\s*/,'');
 const amount=amountMatch(s);
 if(amount)s=s.slice(0,amount.index).trim();
 s=s.replace(/\([^)]*\)|（[^）]*）/g,' ').trim();
 s=s.replace(/[,:：+·\-–—]+$/g,'').trim();
 s=s.replace(/\s*(?:약간|조금|적당량|취향껏|한\s*꼬집)\s*$/,'').trim();
 if(!s||s==='물'||s.length>80||actionWords.test(s))return '';
 if(/^\[[^\]]+\]$/.test(s)||/^【[^】]+】$/.test(s))return '';
 return s;
}

// Legacy parser stays exported for old fixtures/imports. The live editor uses
// the user-managed rule dictionary when getRules is supplied.
export function extractIngredientDraft(text,known=knownIngredientNames()){
 const out=[];
 const add=name=>{name=name.trim();if(name&&name!=='물'&&!out.includes(name))out.push(name);};
 for(const raw of String(text||'').split(/\r?\n/)){
  const line=raw.trim();if(!line)continue;
  if(instructionRE.test(line)&&!quantityRE.test(line))break;
  if(/^\s*(?:\[[^\]]+\]|【[^】]+】)\s*$/.test(line))continue;
  const parts=line.split(/\s*\+\s*|\s+[·]\s+/);
  for(const part of parts){
   if(amountMatch(part)){add(cleanIngredient(part));continue;}
   const normalized=cleanIngredient(part);if(!normalized)continue;
   const hit=known.find(name=>normalized===name||normalized.startsWith(name+' ')||normalized.startsWith(name+'('));
   if(hit){add(hit);continue;}
   if(!genericNameTokens.has(normalized)&&known.some(name=>name.split(/\s+/).includes(normalized)))add(normalized);
  }
 }
 return out;
}

function createManualRuleId(){
 const uuid=globalThis.crypto?.randomUUID?.();
 return `ingredient-manual-${uuid||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
}

function ensureSettingsUI(root,getRules,saveRules,toast){
 if(typeof saveRules!=='function'||typeof root.createElement!=='function')return;
 const helper=root.getElementById('ingredient-draft-helper'),draftButton=root.getElementById('ingredient-draft-button');
 if(!helper||!draftButton||root.getElementById('ingredient-detection-settings'))return;
 const settingsButton=root.createElement('button');
 settingsButton.type='button';settingsButton.id='ingredient-detection-settings';settingsButton.className='text-button';settingsButton.textContent='자동 감지 설정';
 draftButton.insertAdjacentElement('afterend',settingsButton);

 if(!root.getElementById('ingredient-detection-style')){
  const style=root.createElement('style');style.id='ingredient-detection-style';
  style.textContent=`#ingredient-detection-dialog{width:min(900px,calc(100vw - 28px));max-height:88vh;padding:0;border:0;border-radius:16px}#ingredient-detection-dialog::backdrop{background:rgba(16,22,18,.42)}.ingredient-detection-panel{padding:16px;display:grid;gap:9px}.ingredient-detection-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.ingredient-detection-head h2{margin:0}.ingredient-detection-help{margin:3px 0 0;font-size:.82rem;line-height:1.42;color:var(--muted,#66706a)}.ingredient-detection-toolbar{display:flex;gap:7px;flex-wrap:wrap}.ingredient-detection-toolbar input{flex:1 1 260px}.ingredient-detection-columns,.ingredient-detection-row{display:grid;grid-template-columns:minmax(145px,.78fr) minmax(260px,1.4fr) 28px;gap:8px;align-items:center}.ingredient-detection-columns{position:sticky;top:0;z-index:2;padding:5px 8px 4px;border-bottom:1px solid var(--line,#d8ddd7);background:var(--paper,#fff);font-size:.76rem;font-weight:700;color:var(--muted,#66706a)}.ingredient-detection-list{display:block;max-height:57vh;overflow:auto;border-top:1px solid var(--line,#d8ddd7);border-bottom:1px solid var(--line,#d8ddd7)}.ingredient-detection-row{position:relative;min-height:38px;padding:3px 8px;border-bottom:1px solid var(--line,#d8ddd7)}.ingredient-detection-row:last-child{border-bottom:0}.ingredient-detection-cell{display:block;min-width:0}.ingredient-detection-row input{width:100%;box-sizing:border-box;min-height:32px;padding:5px 6px;border:1px solid transparent!important;border-radius:6px!important;background:transparent!important;box-shadow:none!important;color:inherit}.ingredient-detection-row input:hover{border-color:var(--line,#d8ddd7)!important}.ingredient-detection-row input:focus{border-color:var(--green,#58745f)!important;background:var(--paper,#fff)!important;outline:none}.ingredient-detection-mobile-label{display:none}.ingredient-detection-row [data-rule-delete]{width:26px;height:26px;padding:0;border:0;border-radius:50%;font-size:18px;line-height:1;color:var(--muted,#66706a);opacity:.62}.ingredient-detection-row [data-rule-delete]:hover,.ingredient-detection-row [data-rule-delete]:focus-visible{opacity:1;background:rgba(160,55,45,.09);color:#a33}.ingredient-detection-actions{display:flex;justify-content:flex-end;gap:8px}.ingredient-detection-error{min-height:1.2em;color:#a33;margin:0}@media(max-width:620px){#ingredient-detection-dialog{width:min(100vw - 18px,560px);max-height:92vh;border-radius:14px}.ingredient-detection-panel{padding:12px;gap:8px}.ingredient-detection-head{padding-right:2px}.ingredient-detection-help{font-size:.78rem}.ingredient-detection-toolbar{display:grid;grid-template-columns:1fr auto}.ingredient-detection-toolbar input{min-width:0}.ingredient-detection-columns{display:none}.ingredient-detection-list{max-height:59vh}.ingredient-detection-row{display:grid;grid-template-columns:1fr;padding:6px 34px 6px 4px;gap:4px}.ingredient-detection-cell{display:grid;grid-template-columns:48px minmax(0,1fr);align-items:center;gap:6px}.ingredient-detection-mobile-label{display:block;font-size:.71rem;font-weight:700;color:var(--muted,#66706a);white-space:nowrap}.ingredient-detection-row input{min-height:30px;padding:4px 5px}.ingredient-detection-row [data-rule-delete]{position:absolute;right:3px;top:50%;transform:translateY(-50%)}.ingredient-detection-actions{position:sticky;bottom:0;padding-top:7px;background:var(--paper,#fff)}}`;
  root.head?.append(style);
 }
 const dialog=root.createElement('dialog');dialog.id='ingredient-detection-dialog';
 dialog.innerHTML=`<form id="ingredient-detection-form" class="ingredient-detection-panel"><div class="ingredient-detection-head"><div><h2>자동 감지 식재료</h2><p class="ingredient-detection-help">감지할 이름은 쉼표로 여러 개 적을 수 있고 공백 차이는 무시해요. 식재료를 새로 등록하면 자동으로 규칙이 추가돼요. 영양 계산의 계량 재료 이름도 여기서 관리하며, 영양 계산은 같은 규칙의 표시명·감지 이름·연결된 원래 재고명이 정확히 일치할 때만 분량을 인정해요. 예: 표시 ‘쯔유’, 감지할 이름 ‘쯔유, 혼쯔유’. 연결된 원래 재고명도 계량 확인에 사용되지만 제품 영양값은 별도 확인이 필요해요.</p></div><button id="ingredient-detection-close" class="icon-button" type="button" aria-label="닫기">✕</button></div><div class="ingredient-detection-toolbar"><input id="ingredient-detection-search" type="search" placeholder="표시 이름·감지 이름 검색"><button id="ingredient-detection-add" class="outline-button" type="button">＋ 감지 항목 추가</button></div><div class="ingredient-detection-columns"><span>표시 이름</span><span>감지할 이름</span><span></span></div><div id="ingredient-detection-list" class="ingredient-detection-list"></div><p id="ingredient-detection-error" class="ingredient-detection-error" aria-live="polite"></p><div class="ingredient-detection-actions"><button id="ingredient-detection-cancel" class="outline-button" type="button">취소</button><button class="primary" type="submit">설정 저장</button></div></form>`;
 root.body.append(dialog);
 const list=root.getElementById('ingredient-detection-list'),search=root.getElementById('ingredient-detection-search'),error=root.getElementById('ingredient-detection-error');
 let working=[],original=new Map();
 const render=()=>{
  const q=String(search.value||'').normalize('NFKC').replace(/\s+/g,'').toLowerCase();
  const visible=working.filter(rule=>!q||[rule.displayName,...rule.detectNames,rule.sourceName].some(value=>String(value||'').normalize('NFKC').replace(/\s+/g,'').toLowerCase().includes(q)));
  list.innerHTML=visible.length?visible.map(rule=>`<div class="ingredient-detection-row" data-rule-id="${escapeHTML(rule.id)}"><label class="ingredient-detection-cell"><span class="ingredient-detection-mobile-label">표시</span><input aria-label="표시 이름" data-rule-display maxlength="150" value="${escapeHTML(rule.displayName)}"></label><label class="ingredient-detection-cell"><span class="ingredient-detection-mobile-label">감지</span><input aria-label="감지할 이름" data-rule-detect maxlength="3200" value="${escapeHTML(rule.detectNames.join(', '))}" placeholder="예: 수좌빙, 수좌병, 쇼좌빙"></label><button class="text-button danger-text" type="button" data-rule-delete title="삭제" aria-label="${escapeHTML(rule.displayName)} 감지 항목 삭제">×</button></div>`).join(''):'<p class="field-help">조건에 맞는 감지 항목이 없어요.</p>';
 };
 const syncVisibleInputs=()=>{
  for(const row of list.querySelectorAll('[data-rule-id]')){
   const rule=working.find(item=>item.id===row.dataset.ruleId);if(!rule)continue;
   rule.displayName=row.querySelector('[data-rule-display]').value;
   rule.detectNames=detectionNamesFromInput(row.querySelector('[data-rule-detect]').value);
  }
 };
 const open=()=>{
  working=normalizeIngredientDetectionRules(getRules?.()||[]).map(rule=>({...rule,detectNames:[...(rule.detectNames||[])]}));
  original=new Map(working.map(rule=>[rule.id,JSON.stringify([rule.displayName,rule.detectNames])]));
  search.value='';error.textContent='';render();dialog.showModal();search.focus();
 };
 settingsButton.addEventListener('click',open);
 search.addEventListener('input',()=>{syncVisibleInputs();render();});
 list.addEventListener('input',event=>{
  const row=event.target.closest('[data-rule-id]');if(!row)return;
  const rule=working.find(item=>item.id===row.dataset.ruleId);if(!rule)return;
  if(event.target.matches('[data-rule-display]'))rule.displayName=event.target.value;
  if(event.target.matches('[data-rule-detect]'))rule.detectNames=detectionNamesFromInput(event.target.value);
 });
 list.addEventListener('click',event=>{
  const button=event.target.closest('[data-rule-delete]');if(!button)return;
  const row=button.closest('[data-rule-id]');working=working.filter(rule=>rule.id!==row.dataset.ruleId);render();
 });
 root.getElementById('ingredient-detection-add').addEventListener('click',()=>{
  syncVisibleInputs();const rule={id:createManualRuleId(),sourceName:'',displayName:'',detectNames:[],customized:true};working.push(rule);search.value='';render();
  const row=list.querySelector(`[data-rule-id="${rule.id}"]`);row?.querySelector('[data-rule-display]')?.focus();
 });
 const close=()=>dialog.close();
 root.getElementById('ingredient-detection-close').addEventListener('click',close);
 root.getElementById('ingredient-detection-cancel').addEventListener('click',close);
 root.getElementById('ingredient-detection-form').addEventListener('submit',event=>{
  event.preventDefault();syncVisibleInputs();error.textContent='';
  try{
   const before=working.length;
   const next=normalizeIngredientDetectionRules(working.map(rule=>({...rule,customized:rule.customized||original.get(rule.id)!==JSON.stringify([rule.displayName,rule.detectNames])})));
   const result=saveRules(next);
   if(result===false||result?.ok===false)throw Error(result?.error||'자동 감지 설정을 저장하지 못했어요.');
   dialog.close();toast?.(next.length<before?`겹치는 감지 항목을 통합해 ${next.length}개를 저장했어요.`:`자동 감지 식재료 ${next.length}개를 저장했어요.`);
  }catch(saveError){error.textContent=saveError.message;}
 });
}

export function installIngredientDraft(rootOrOptions=document,maybeOptions={}){
 const root=rootOrOptions?.getElementById?rootOrOptions:document;
 const options=rootOrOptions?.getElementById?maybeOptions:(rootOrOptions||{});
 const {getRules,saveRules,toast}=options;
 const steps=root.getElementById('recipe-steps');
 const required=root.getElementById('recipe-required');
 const button=root.getElementById('ingredient-draft-button');
 const note=root.getElementById('ingredient-draft-note');
 const form=root.getElementById('recipe-form');
 if(!steps||!required||!button||!note)return;
 ensureSettingsUI(root,getRules,saveRules,toast);
 let timer=null,autoDraftActive=false,manualRequiredEdit=false,writingRequired=false;
 const findDraft=()=>typeof getRules==='function'?detectIngredientRules(steps.value,getRules()||[]):extractIngredientDraft(steps.value,knownIngredientNames(root));
 const writeRequired=names=>{
  writingRequired=true;
  try{
   required.value=names.join(', ');
   required.dispatchEvent(new Event('input',{bubbles:true}));
  }finally{writingRequired=false;}
 };
 const apply=(merge=false,manual=false)=>{
  const found=findDraft();
  const current=required.value.split(/[,，、;\n]+/).map(s=>s.trim()).filter(Boolean);
  if(!found.length){
   if(!manual&&autoDraftActive&&current.length)writeRequired([]);
   if(manual)note.textContent=steps.value.trim()?'필수 재료 초안을 자동으로 찾지 못했어요. 자동 감지 설정을 확인해 주세요.':'먼저 아래 조리 순서를 입력해 주세요.';
   return false;
  }
  if(!merge&&(manualRequiredEdit||(current.length&&!autoDraftActive)))return false;
  const next=merge?[...new Set([...current,...found])]:found;
  if(!merge){autoDraftActive=true;manualRequiredEdit=false;}
  if(manual){autoDraftActive=false;manualRequiredEdit=true;}
  writeRequired(next);
  note.textContent=merge&&current.length?`필수 재료 ${found.length}개를 찾아 기존 목록과 합쳤어요. 저장 전 확인해 주세요.`:`필수 재료 초안 ${found.length}개를 채웠어요. 저장 전 확인해 주세요.`;
  return true;
 };
 steps.addEventListener('input',event=>{
  clearTimeout(timer);
  // An explicit owner measurement must refresh the nutrition UI, but
  // must not regenerate/silently replace the required ingredient list.
  if(event.detail?.nutritionMeasuredEdit)return;
  timer=setTimeout(()=>{if(autoDraftActive||(!manualRequiredEdit&&!required.value.trim()))apply(false,false);},260);
 });
 required.addEventListener('input',()=>{if(!writingRequired){autoDraftActive=false;manualRequiredEdit=true;}});
 form?.addEventListener('reset',()=>{clearTimeout(timer);autoDraftActive=false;manualRequiredEdit=false;});
 button.addEventListener('click',()=>apply(true,true));
 button.dataset.ready='true';
 return {apply};
}