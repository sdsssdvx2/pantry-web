import {groups,getStock,normalize} from './data.js?v=20260919-6';
import {locations,parseIngredients} from './pantry-tools.js';
import {searchKey} from './search-utils.js?v=20260919-1';
import {validateItems,validateStock,validatePriorityDate} from './state-validation.js?v=20260919-5';
import {pantryGroupIcon} from './pantry-groups.js?v=20260919-2';
import {stockPriorityDate,stockAutomaticPriorityDate,priorityRuleByArea,pantryDateValue,priorityBasis} from './pantry-priority.js';
import {storageArea} from './pantry-storage-rules.js';
import {ensureIngredientDetectionRule,renameIngredientDetectionRule} from './ingredient-detection.js?v=20261018-2';
import {installStockNutritionEditor} from './nutrition-ui.js';

const $=id=>document.getElementById(id);
const escapeHTML=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const addedLabel=value=>{const date=new Date(value);return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium'}).format(date):'';};
const updateGroupIcon=()=>{const target=$('stock-group-icon'),index=Number($('stock-edit-group')?.value);if(target)target.innerHTML=pantryGroupIcon(Number.isInteger(index)?index:5);};

export function installStockEditor({getContext,applyContext,persist,render,toast}){
 const nutritionEditor=installStockNutritionEditor($('stock-nutrition-editor'));
 let stockName=null,stockFocus=null,stockAdding=false,ingredientDrafts=[],draftIndex=0,stockBaseline='',stockAddedBaseline='',priorityRules={},priorityRuleEditArea='custom';
 const ensurePriorityRuleFields=()=>{
  if($('stock-priority-rule-amount')||typeof document.createElement!=='function')return;
  const start=$('stock-priority-start');if(!start?.insertAdjacentElement)return;
  const wrap=document.createElement('div');
  wrap.className='priority-rule-editor';
  wrap.innerHTML='<label for="stock-priority-rule-amount">자동 계산 기간 <span class="field-optional">직접 설정 · 선택</span></label><div class="custom-location-row"><input id="stock-priority-rule-amount" type="number" min="1" max="3650" step="1" inputmode="numeric" placeholder="예: 7"><select id="stock-priority-rule-unit" aria-label="자동 계산 기간 단위"><option value="days">일</option><option value="months">개월</option></select><button id="stock-priority-rule-clear" class="text-button" type="button">기본 규칙 사용</button></div><p class="field-help">여러 보관 위치가 있으면 현재 가장 빠른 목표를 만드는 위치의 기간만 수정해요. 다른 위치의 규칙은 그대로 유지됩니다.</p>';
  start.insertAdjacentElement('afterend',wrap);
 };
 ensurePriorityRuleFields();
 const readPriorityRule=()=>{
  const amount=$('stock-priority-rule-amount'),unit=$('stock-priority-rule-unit');
  if(!amount||!unit||!String(amount.value).trim())return null;
  return {amount:Number(amount.value),unit:unit.value};
 };
 const setPriorityRuleFields=rule=>{
  if($('stock-priority-rule-amount'))$('stock-priority-rule-amount').value=rule?.amount||'';
  if($('stock-priority-rule-unit'))$('stock-priority-rule-unit').value=rule?.unit==='months'?'months':'days';
 };
 const priorityRulePayload=()=>Object.keys(priorityRules).length?{byArea:Object.fromEntries(Object.entries(priorityRules).map(([area,rule])=>[area,{...rule}]))}:null;
 const stableValue=value=>Array.isArray(value)?value.map(stableValue):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stableValue(value[key])])):value;
 const stateSnapshot=value=>JSON.stringify(stableValue(value??null));
 const stockTargetState=(context,name)=>({
  present:context.pantry.includes(name),
  override:Object.hasOwn(context.stockOverrides,name)?context.stockOverrides[name]:null,
  history:context.ingredientHistory.find(item=>item.name===name)||null
 });

 function locationOptions(selected=[]){
  const {pantry,stockOverrides}=getContext();
  const options=[...locations],known=new Set(options.map(item=>item[0]));
  for(const value of [...pantry.flatMap(name=>getStock(name,stockOverrides).locations),...selected]){
   if(!known.has(value)){
    options.push([value,'내가 추가한 위치',value,'']);
    known.add(value);
   }
  }
  return options;
 }

 function selectedLocations(){
  return [...$('location-picker').querySelectorAll('input:checked')].map(input=>input.value);
 }

 function selectedAreas(){return [...new Set(selectedLocations().map(storageArea).filter(Boolean))];}

 function priorityDetail({automatic=false}={}){
  const detail={group:Number($('stock-edit-group').value),status:$('stock-edit-status').value,locations:selectedLocations(),notes:$('stock-edit-notes').value.split('\n'),addedAt:$('stock-edit-added').value,priorityDate:automatic?'':$('stock-edit-priority').value,priorityStartDate:$('stock-priority-start').value,priorityRule:priorityRulePayload()};
  const existing=getStock(stockName,getContext().stockOverrides);
  if(existing.status==='incoming'&&detail.status==='available'){
   if(detail.addedAt===stockAddedBaseline)detail.addedAt=pantryDateValue();
   if(detail.priorityStartDate===existing.priorityStartDate)detail.priorityStartDate='';
  }
  return detail;
 }

 function fastestRuleArea(){
  const priority=stockAutomaticPriorityDate($('stock-edit-name').value,priorityDetail({automatic:true}));
  return priority?.plan?.area||selectedAreas()[0]||'custom';
 }

 function selectFastestRuleArea(){
  priorityRuleEditArea=fastestRuleArea();
  setPriorityRuleFields(priorityRules[priorityRuleEditArea]||null);
 }

 function updateSelectedLocations(){
  const values=selectedLocations();
  $('selected-locations').textContent=values.length?`선택 ${values.length}곳: `+values.join(' / '):'아직 선택한 위치가 없어요. 나중에 지정해도 됩니다.';
  selectFastestRuleArea();
  updatePriorityPreview();
 }

 function updatePriorityPreview(){
  const target=$('stock-priority-preview');if(!target)return;
  const detail=priorityDetail();
  const priority=stockPriorityDate($('stock-edit-name').value,detail);
  target.textContent=detail.status==='incoming'?'도착 후 계산':priority?`${priority.source==='auto'?'자동 계산':'직접 지정'} · ${priority.value}${priority.source==='auto'?`\n${priorityBasis(priority)}`:''}`:'자동 목표 미지정';
  const reference=$('stock-priority-reference'),source=priority?.plan?.reference;
  reference.hidden=!source;
  if(source){reference.href=source.url;reference.textContent=`${source.name} · 참고 범위 ${priority.plan.range}`;}else reference.removeAttribute('href');
 }

 function renderLocations(selected=[]){
  const options=locationOptions(selected),areas=[...new Set(options.map(item=>item[1]))];
  $('location-picker').innerHTML=areas.map(area=>`<details class="location-area" ${options.some(item=>item[1]===area&&selected.includes(item[0]))?'open':''}><summary>${escapeHTML(area)}</summary><div class="location-options">${options.filter(item=>item[1]===area).map(([value,_,label,hint])=>`<label class="location-choice"><input type="checkbox" value="${escapeHTML(value)}" ${selected.includes(value)?'checked':''}><span>${escapeHTML(label)}${hint?` <small>(${escapeHTML(hint)})</small>`:''}</span></label>`).join('')}</div></details>`).join('');
  updateSelectedLocations();
 }

 function open(name,adding=false,options={}){
  const {pantry,stockOverrides,ingredientHistory}=getContext();
  stockName=name;
  stockBaseline=stateSnapshot(stockTargetState({pantry,stockOverrides,ingredientHistory},name));
  stockAdding=adding;
  stockFocus=document.activeElement;
  const record=getStock(name,stockOverrides),draft=adding?ingredientDrafts[draftIndex]:null;
  priorityRules=priorityRuleByArea(name,record);
  priorityRuleEditArea='custom';
  $('stock-form').reset();
  $('stock-error').textContent='';
  $('stock-title').textContent='식재료 정보';
  $('stock-edit-name').value=name;
  $('stock-draft-info').hidden=!adding;
  $('stock-draft-info').textContent=adding?`${draftIndex+1} / ${ingredientDrafts.length} · ${pantry.includes(name)?'이미 있는 재료에 메모를 합쳐요.':ingredientHistory.some(item=>item.name===name)?'이전 식재료 기록을 찾았어요. 예전 제품 메모를 불러왔어요.':'새 재료를 추가해요.'} 괄호 속 설명도 메모에 합쳤어요. 확인 후 저장하세요.`:'';
  $('stock-edit-status').value=adding&&ingredientHistory.some(item=>item.name===name)?'available':record.status;
  $('stock-edit-group').innerHTML=groups.map((group,index)=>`<option value="${index}">${group}</option>`).join('');
  $('stock-edit-group').value=record.group;
  updateGroupIcon();
  const alreadyPresent=pantry.includes(name),addedAt=record.addedAt||'';
  $('stock-added-info').textContent=adding&&!alreadyPresent?'재고에 저장하면 오늘 날짜를 추가일로 기록해요.':addedAt?`재고에 추가 · ${addedLabel(addedAt)}`:'추가일 기록 없음 · 앞으로 새로 추가하는 재료부터 자동 기록해요.';
  $('stock-edit-priority').value=record.priorityDate||'';
  stockAddedBaseline=adding&&!alreadyPresent?pantryDateValue():pantryDateValue(addedAt);
  $('stock-edit-added').value=stockAddedBaseline;
  $('stock-priority-start').value=adding&&!alreadyPresent?'':record.priorityStartDate||'';
  const editorNotes=[...new Set([...record.notes,...(draft?.notes||[])])];
  $('stock-edit-notes').value=editorNotes.join('\n');
  nutritionEditor.open(name,stockOverrides,editorNotes,{autoResearch:adding||!!options.autoResearch});
  renderLocations(record.locations);
  $('save-stock').textContent=adding?(draftIndex+1<ingredientDrafts.length?'저장하고 다음 재료':'재료 저장'):'재료 정보 저장';
  if(!$('stock-dialog').open)$('stock-dialog').showModal();
  $('close-stock').focus();
 }

 function restore(name){
  ingredientDrafts=[{name,notes:[]}];
  draftIndex=0;
  open(name,true);
 }

 $('add-form').addEventListener('submit',event=>{
  event.preventDefault();
  try{
   const {pantry,ingredientHistory}=getContext();
   ingredientDrafts=parseIngredients($('ingredient-input').value,normalize).map(row=>{
    const archived=ingredientHistory.find(item=>searchKey(item.name)===searchKey(row.name));
    return archived?{...row,name:archived.name}:row;
   });
   validateItems([...pantry,...ingredientDrafts.map(row=>row.name)]);
   draftIndex=0;
   $('input-message').textContent='';
   open(ingredientDrafts[0].name,true);
  }catch(error){
   $('input-message').textContent=error.message;
  }
 });

 $('stock-edit-group').addEventListener('change',()=>{updateGroupIcon();selectFastestRuleArea();updatePriorityPreview();});
 for(const id of ['stock-edit-name','stock-edit-status','stock-edit-added','stock-edit-priority','stock-priority-start','stock-edit-notes'])$(id)?.addEventListener('input',updatePriorityPreview);
 const updatePriorityRule=()=>{
  const rule=readPriorityRule(),area=priorityRuleEditArea||fastestRuleArea();
  if(rule)priorityRules={...priorityRules,[area]:rule};
  else{priorityRules={...priorityRules};delete priorityRules[area];}
  updatePriorityPreview();
 };
 const clearCurrentPriorityRule=()=>{
  const area=priorityRuleEditArea||fastestRuleArea();
  priorityRules={...priorityRules};delete priorityRules[area];
  selectFastestRuleArea();
  updatePriorityPreview();
 };
 $('stock-priority-rule-amount')?.addEventListener('input',updatePriorityRule);
 $('stock-priority-rule-unit')?.addEventListener('input',updatePriorityRule);
 $('stock-priority-auto').addEventListener('click',()=>{$('stock-edit-priority').value='';clearCurrentPriorityRule();});
 $('stock-priority-rule-clear')?.addEventListener('click',clearCurrentPriorityRule);
 $('location-picker').addEventListener('change',updateSelectedLocations);
 $('add-location').addEventListener('click',()=>{
  const name=$('custom-location').value.trim();
  if(!name)return;
  const selected=selectedLocations();
  if(selected.length>=30){
   $('stock-error').textContent='위치는 최대 30곳까지 선택할 수 있어요.';
   return;
  }
  renderLocations([...new Set([...selected,name])]);
  $('custom-location').value='';
 });
 $('close-stock').addEventListener('click',()=>$('stock-dialog').close());

 $('stock-form').addEventListener('submit',async event=>{
  event.preventDefault();
  try{
   if($('custom-location').value.trim())throw Error('직접 적은 위치 옆의 추가 버튼을 눌러 선택해 주세요.');
   const context=getContext();
   if(stateSnapshot(stockTargetState(context,stockName))!==stockBaseline)throw Error('다른 기기에서 이 식재료 정보가 변경되거나 삭제됐어요. 창을 닫고 최신 내용을 확인한 뒤 다시 수정해 주세요.');
   const existing=getStock(stockName,context.stockOverrides),isNewCycle=stockAdding&&!context.pantry.includes(stockName);
   const record={group:Number($('stock-edit-group').value),status:$('stock-edit-status').value,locations:selectedLocations(),notes:$('stock-edit-notes').value.split('\n').filter(Boolean),priorityDate:$('stock-edit-priority').value,priorityRule:priorityRulePayload(),addedAt:isNewCycle?new Date().toISOString():(existing.addedAt||'')};
   const addedDate=validatePriorityDate($('stock-edit-added').value);
   const nutrition=nutritionEditor.read(record.notes);
   if(nutrition)record.nutrition=nutrition;
   if(addedDate!==stockAddedBaseline)record.addedAt=addedDate?new Date(addedDate+'T00:00:00+09:00').toISOString():'';
   else if(existing.status==='incoming'&&record.status==='available')record.addedAt=new Date().toISOString();
   const priorityStartDate=validatePriorityDate($('stock-priority-start').value);
   if(priorityStartDate&&!(existing.status==='incoming'&&record.status==='available'&&priorityStartDate===existing.priorityStartDate))record.priorityStartDate=priorityStartDate;
   const name=validateItems([$('stock-edit-name').value])[0];
   if(name!==stockName&&context.pantry.includes(name))throw Error('같은 이름의 재료가 이미 있어요. 이름을 구분해서 저장해 주세요.');
   const validated=validateStock({[name]:record});
   const items=validateItems([...context.pantry.filter(item=>item!==stockName),name]);
   const previous={stockOverrides:context.stockOverrides,pantry:context.pantry,ingredientHistory:context.ingredientHistory,ingredientDetectionRules:context.ingredientDetectionRules};
   const nextStock={...context.stockOverrides,...validated};
   if(name!==stockName)delete nextStock[stockName];
   const nextHistory=context.ingredientHistory.filter(item=>item.name!==name);
   let nextDetectionRules=context.ingredientDetectionRules||[];
   if(name!==stockName)nextDetectionRules=renameIngredientDetectionRule(nextDetectionRules,stockName,name);
   else if(stockAdding)nextDetectionRules=ensureIngredientDetectionRule(nextDetectionRules,name);
   applyContext({stockOverrides:nextStock,pantry:items,ingredientHistory:nextHistory,ingredientDetectionRules:nextDetectionRules});
   if(!persist()){
    applyContext(previous);
    render();
    $('stock-error').textContent='브라우저에 저장하지 못했어요. 입력 내용을 복사해 보관하고 다시 시도해 주세요.';
    return;
   }
   const inboxCommit=await nutritionEditor.commitInbox?.();
   const inboxWarning=inboxCommit&&!inboxCommit.ok
    ?' 재료는 저장됐지만 구매에서 받은 상품정보의 완료 표시는 저장하지 못했어요. 다음에 다시 표시될 수 있어요.'
    :'';
   if(stockAdding){
    draftIndex++;
    $('ingredient-input').value=ingredientDrafts.slice(draftIndex).map(row=>row.name+row.notes.map(note=>'('+note+')').join('')).join('\n');
    if(draftIndex<ingredientDrafts.length){
     render();
     open(ingredientDrafts[draftIndex].name,true);
     toast('저장했어요. 다음 재료의 위치를 골라 주세요.'+inboxWarning);
     return;
    }
    $('pantry-search').value='';
    $('stock-location').value='';
    $('stock-status').value='';
   }
   render();
   $('stock-dialog').close();
   toast('재료·보관 위치·메모를 저장했어요.'+inboxWarning);
  }catch(error){
   $('stock-error').textContent=error.message;
  }
 });

 $('stock-dialog').addEventListener('close',()=>{if(stockFocus?.isConnected)stockFocus.focus();else $('pantry-search').focus();});
 return {open,restore};
}

