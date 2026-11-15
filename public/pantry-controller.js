import {groups,catalog,normalize,getStock,ingredientIdentity} from './data.js?v=20260919-6';
import {locationFilters,pantryLocationSearchText} from './pantry-tools.js';
import {priorityPantryItems} from './pantry-priority.js';
import {stockPriorityDate,sortPantryByPriority,priorityLabel,priorityBasis} from './pantry-priority.js';
import {createSearchMatcher} from './search-utils.js?v=20260919-1';
import {statusNames} from './state-validation.js?v=20260919-5';
import {pantryGroupIcon} from './pantry-groups.js?v=20260919-2';
import {createNutritionResolver} from './nutrition-resolver.js';
import {rankNutritionGaps} from './nutrition-gap-priority.js';



const $=id=>document.getElementById(id);
const escapeHTML=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const PANTRY_GROUP_PREF='mlk-pantry-collapsed-groups-v2';
const defaultCollapsedGroups=()=>new Set(groups.map((_,index)=>index));

function ingredientSearchMatch(name,detail,matcher,query){
 const text=[name,detail.notes.join(' '),pantryLocationSearchText(detail.locations)].filter(Boolean).join(' ');
 return !matcher||matcher(text)||matcher(text.replace(/달걀/g,'계란'))||matcher(text.replace(/계란/g,'달걀'))||(!/\d\s*번/.test(query)&&ingredientIdentity(query)===ingredientIdentity(name));
}

function loadCollapsedGroups(){
 try{
  const raw=localStorage.getItem(PANTRY_GROUP_PREF);
  if(raw===null)return defaultCollapsedGroups();
  const stored=JSON.parse(raw);
  if(!Array.isArray(stored))return defaultCollapsedGroups();
  return new Set(stored.filter(index=>Number.isInteger(index)&&index>=0&&index<groups.length));
 }catch{return defaultCollapsedGroups();}
}

function saveCollapsedGroups(collapsedGroups){
 try{localStorage.setItem(PANTRY_GROUP_PREF,JSON.stringify([...collapsedGroups].sort((a,b)=>a-b)));}catch{}
}

function createStockLookup(stockOverrides){
 const cache=new Map();
 return name=>{
  if(!cache.has(name))cache.set(name,getStock(name,stockOverrides));
  return cache.get(name);
 };
}

export function installPantryController({getContext,applyContext,allRecipes,stockEditor,persist,renderApp,updateStorageState,toast}){
 const collapsedGroups=loadCollapsedGroups();
 let searchTimer=null,priorityExpanded=false;
 // The expensive cross-recipe review runs only when the owner opens the list.
 let nutritionReview=null,nutritionVisible=10,estimateVisible=10;
 const metricName=key=>key==='energy'?'열량':'나트륨';
 function renderNutritionReviewItems(){
  const list=$('nutrition-review-list'),summary=nutritionReview;
  if(!list||!summary||document.documentElement.dataset.access!=='owner')return;
  const itemHTML=(row,estimated=false)=>{
   const metric=estimated?row.estimated.map(metricName).join('·')+' 추정치':
    row.missing.map(metricName).join('·')+' 미확인';
   const reason=row.needsIdentity?' · 제품 선택 필요':
    row.requiresProductLabel?' · 제품 영양표 확인 필요':'';
   const linked=row.mentions?' · 필수 버전 '+row.mentions+'개':'';
   return '<button type="button" class="nutrition-review-item" data-review-stock="'+escapeHTML(row.name)+'">'+
    '<strong>'+escapeHTML(row.name)+'</strong><small>'+escapeHTML(metric+reason+linked)+'</small></button>';
  };
  const missing=summary.missingRows.slice(0,nutritionVisible).map(row=>itemHTML(row)).join('')||
   '<p class="pantry-empty">확인할 영양성분 누락 재료가 없어요.</p>';
  const estimatesOpen=!!list.querySelector('.nutrition-review-estimates')?.open;
  const estimates=summary.estimateRows.length?
   '<details class="nutrition-review-estimates"'+(estimatesOpen?' open':'')+'><summary>참고 추정치 '+summary.estimateOnlyTotal+'개</summary>'+
   '<div class="nutrition-review-estimate-items">'+
   summary.estimateRows.slice(0,estimateVisible).map(row=>itemHTML(row,true)).join('')+
   '</div><button type="button" id="nutrition-estimates-more" class="outline-button"'+
   (estimateVisible>=summary.estimateRows.length?' hidden':'')+'>다음 추정치 10개 보기</button></details>':'';
  list.innerHTML=missing+estimates;
  const more=$('nutrition-review-more');
  if(more){
   more.hidden=nutritionVisible>=summary.missingRows.length;
   more.textContent='누락 재료 다음 '+Math.min(10,Math.max(0,summary.missingRows.length-nutritionVisible))+'개 보기';
  }
 }
 function renderNutritionReview(){
  const panel=$('nutrition-review-panel'),count=$('nutrition-review-count');
  if(!panel?.open||document.documentElement.dataset.access!=='owner')return;
  const state=getContext(),resolve=createNutritionResolver({
   pantry:state.pantry,stockOverrides:state.stockOverrides,
   ingredientHistory:state.ingredientHistory||[],
   ingredientDetectionRules:state.ingredientDetectionRules||[]
  });
  // Inventory-first triage is fast and accurate for this screen. Do not run
  // the expensive per-recipe nutrient calculator on the UI thread.
  nutritionReview=rankNutritionGaps({
   pantry:state.pantry,recipes:allRecipes(),sourceEdits:state.sourceEdits||[],
   resolve,stockDetail:createStockLookup(state.stockOverrides)
  });
  if(count)count.textContent=String(nutritionReview.missingTotal);
  const description=$('nutrition-review-description');
  if(description)description.textContent='열량·나트륨이 비어 있는 재료 '+nutritionReview.missingTotal+
   '개. 재료를 누르면 무료 자료 자동 조사와 제품 영양정보 편집을 함께 시작해요.';
  renderNutritionReviewItems();
 }

 function renderHistory(stockForOverride=null){
  const {ingredientHistory,stockOverrides}=getContext();
  const box=$('ingredient-history'),list=$('history-list'),count=$('history-count');
  if(!box||!list||!count)return;
  count.textContent=ingredientHistory.length;
  if($('history-search-count'))$('history-search-count').textContent=`(${ingredientHistory.length})`;
  box.hidden=!ingredientHistory.length;
  const query=($('history-search')?.value||'').trim(),matchSearch=query?createSearchMatcher(query):null,stockFor=stockForOverride||createStockLookup(stockOverrides);
  const rows=ingredientHistory.filter(item=>{
   const detail=stockFor(item.name);
   return ingredientSearchMatch(item.name,detail,matchSearch,query);
  });
  list.innerHTML=rows.length?rows.map(item=>{
   const detail=stockFor(item.name),date=item.archivedAt?new Date(item.archivedAt).toLocaleDateString('ko-KR'):'이전 기록';
   return '<div class="history-item"><div><strong>'+escapeHTML(item.name)+'</strong><small>'+escapeHTML(groups[detail.group]||'')+' · '+date+(detail.notes.length?' · '+escapeHTML(detail.notes[0]):'')+'</small></div><div class="history-actions"><button class="outline-button" data-history-restore="'+escapeHTML(item.name)+'">다시 추가</button><button class="text-button danger-text" data-history-delete="'+escapeHTML(item.name)+'">완전 삭제</button></div></div>';
  }).join(''):'<p class="pantry-empty">검색 결과가 없어요.</p>';
  window.dispatchEvent(new CustomEvent('mlk-pantry-rendered'));
 }

 function archiveIngredient(name){
  const context=getContext();
  if(!name||!context.pantry.includes(name))return false;
  const previous={pantry:context.pantry,ingredientHistory:context.ingredientHistory,stockOverrides:context.stockOverrides};
  const stockOverrides={...context.stockOverrides},stored=stockOverrides[name];
  if(stored?.priorityDate){stockOverrides[name]={...stored};delete stockOverrides[name].priorityDate;}
  if(stored?.priorityStartDate){stockOverrides[name]={...stockOverrides[name]};delete stockOverrides[name].priorityStartDate;}
  applyContext({
   pantry:context.pantry.filter(item=>item!==name),
   ingredientHistory:[{name,archivedAt:new Date().toISOString()},...context.ingredientHistory.filter(item=>item.name!==name)],
   stockOverrides
  });
  const saved=persist();
  if(!saved)applyContext(previous);
  renderApp();
  if(saved)toast('이전 식재료로 옮겼어요. 메모와 제품 정보는 보관돼요.');
  return saved;
 }

 function renderPriority(stockForOverride=null){
  const box=$('pantry-priority'),list=$('pantry-priority-list'),count=$('pantry-priority-count');
  if(!box||!list||!count)return;
  const {pantry,stockOverrides}=getContext(),stockFor=stockForOverride||createStockLookup(stockOverrides);
  const result=priorityPantryItems(pantry,stockFor,new Date(),priorityExpanded?1000:6),toggle=$('pantry-priority-toggle');
  box.hidden=!result.items.length;
  count.textContent=result.total>result.items.length?`${result.items.length}/${result.total}`:String(result.total);
  if(toggle){toggle.hidden=result.total<=6;toggle.textContent=priorityExpanded?'접기':'전체 보기';toggle.setAttribute('aria-expanded',String(priorityExpanded));}
  list.innerHTML=result.items.map(item=>`<div class="priority-item-row"><button type="button" class="priority-item priority-${item.quality?'quality':item.urgency}" title="${escapeHTML(priorityBasis(item))}" data-priority-stock="${escapeHTML(item.name)}"><span>${escapeHTML(item.name)}</span><small>${item.source==='auto'?priorityLabel(item)+' · ':''}${escapeHTML(item.dateLabel)} · ${escapeHTML(item.relativeLabel)}</small></button><button type="button" class="priority-remove" data-remove="${escapeHTML(item.name)}" title="이전 식재료로 옮기기" aria-label="${escapeHTML(item.name)} 이전 식재료로 옮기기">×</button></div>`).join('');
 }

 function visibleGroupIndexes(pantry,stockOverrides){
  const stockFor=createStockLookup(stockOverrides),visible=new Set(pantry.map(name=>stockFor(name).group));
  return groups.map((_,index)=>index).filter(index=>visible.has(index));
 }

 function updateGroupToggle(visible,filtersActive=false){
  const button=$('pantry-groups-toggle');
  if(!button)return;
  button.disabled=filtersActive||!visible.length;
  button.title=filtersActive?'검색·필터 중에는 결과 그룹을 자동으로 펼쳐요.':'';
  button.textContent=visible.length&&visible.every(index=>!collapsedGroups.has(index))?'모두 접기':'모두 펼치기';
 }

 function render(refreshControls=true){
  const {pantry,stockOverrides,ingredientHistory}=getContext();
  const rawSearch=$('pantry-search').value,search=rawSearch.trim(),matchSearch=search?createSearchMatcher(search):null,location=$('stock-location').value,status=$('stock-status').value,sort=$('stock-sort')?.value||'default';
  const filtersActive=!!(search||location||status);
  const pantryOrder=new Map(pantry.map((name,index)=>[name,index])),stockFor=createStockLookup(stockOverrides);
  const matching=pantry.filter(name=>{
   const detail=stockFor(name);
   return (!location||detail.locations.some(value=>value.startsWith(location)))
    &&(!status||(status==='available'?detail.status==='available':status==='incoming'?detail.status==='incoming':detail.status!=='available'&&detail.status!=='incoming'))
    &&ingredientSearchMatch(name,detail,matchSearch,search);
  });

  const historySearch=$('history-search-results'),includeHistory=!!$('include-history-search')?.checked&&!!search;
  if(historySearch){
   const archived=includeHistory?ingredientHistory.filter(item=>{
    const detail=stockFor(item.name);
    return ingredientSearchMatch(item.name,detail,matchSearch,search);
   }):[];
   historySearch.hidden=!includeHistory;
   historySearch.innerHTML=includeHistory?(archived.length?'<div class="history-inline-head">이전 식재료에서 찾음 <strong>'+archived.length+'</strong></div>'+archived.map(item=>{
    const detail=stockFor(item.name);
    return '<div class="history-inline-item"><div><strong>'+escapeHTML(item.name)+'</strong><small>'+escapeHTML(groups[detail.group]||'')+(detail.notes.length?' · '+escapeHTML(detail.notes[0]):'')+'</small></div><button class="outline-button" data-history-restore="'+escapeHTML(item.name)+'">다시 추가</button></div>';
   }).join(''):'<p class="pantry-empty">이전 식재료에도 검색 결과가 없어요.</p>'):'';
  }

  $('pantry-count').textContent=pantry.length;
  $('pantry-badge').textContent=pantry.length;
  renderPriority(stockFor);
  if(refreshControls)renderNutritionReview();
  const visible=[],matchingByGroup=groups.map(()=>[]);
  for(const name of matching)matchingByGroup[stockFor(name).group]?.push(name);
  function ingredientTag(name,withPriority=false){
   const detail=stockFor(name),priority=withPriority&&detail.status!=='incoming'?stockPriorityDate(name,detail):null;
   const dateLabel=priority?`${priority.source==='auto'?priorityLabel(priority)+' · ':''}${priority.dateLabel} · ${priority.relativeLabel}`:detail.status==='incoming'?'도착 후 계산':'날짜 미지정';
   return `<span class="ingredient-tag ${detail.status==='incoming'?'stock-incoming':detail.status!=='available'?'stock-attention':''}"><button class="ingredient-name" data-stock="${escapeHTML(name)}" title="제품·보관 위치 보기">${escapeHTML(name)}${detail.status!=='available'?` <small>${statusNames[detail.status]}</small>`:''}${withPriority?`<small class="ingredient-priority-date">${escapeHTML(dateLabel)}</small>`:''}</button><button data-remove="${escapeHTML(name)}" aria-label="${escapeHTML(name)} 삭제">×</button></span>`;
  }
  const groupedHTML=groups.map((group,index)=>{
   let items=matchingByGroup[index];
   if(sort==='oldest')items=[...items].sort((a,b)=>{
    const aa=Date.parse(stockFor(a).addedAt||''),bb=Date.parse(stockFor(b).addedAt||'');
    const av=Number.isFinite(aa),bv=Number.isFinite(bb);
    if(av!==bv)return av?-1:1;
    return av&&aa!==bb?aa-bb:(pantryOrder.get(a)||0)-(pantryOrder.get(b)||0);
   });
   if(!items.length)return '';
   visible.push(index);
   const open=filtersActive||!collapsedGroups.has(index);
   return `<details class="ingredient-group" data-pantry-group="${index}" ${open?'open':''}><summary>${pantryGroupIcon(index)}<span class="pantry-group-label">${escapeHTML(group)}</span><span class="pantry-group-count">${items.length}</span></summary><div class="ingredient-tags">${items.map(name=>ingredientTag(name)).join('')}</div></details>`;
  }).join('');
  $('pantry-list').innerHTML=(sort==='priority'&&matching.length?`<div class="pantry-priority-order">${sortPantryByPriority(matching,stockFor).map(name=>ingredientTag(name,true)).join('')}</div>`:groupedHTML)||'<p class="pantry-empty">조건에 맞는 재료가 없어요.</p>';
  if($('pantry-groups-toggle'))$('pantry-groups-toggle').hidden=sort==='priority';
  updateGroupToggle(visible,filtersActive);

  if(refreshControls){
   $('ingredient-options').innerHTML=[...new Set([...Object.keys(catalog),...ingredientHistory.map(item=>item.name),...allRecipes().flatMap(recipe=>recipe.required).map(normalize)])]
    .filter(name=>!pantry.includes(name)&&!name.includes('/'))
    .map(name=>`<option value="${escapeHTML(name)}"></option>`).join('');
   const foundLocations=[...new Set(pantry.flatMap(name=>stockFor(name).locations.map(value=>value.split(' · ')[0])))];
   const configured=new Set(locationFilters.map(([value])=>value));
   const ordered=[...locationFilters,...foundLocations.filter(value=>!configured.has(value)).map(value=>[value,value])];
   $('stock-location').innerHTML='<option value="">모든 장소</option>'+ordered.map(([value,label])=>`<option value="${escapeHTML(value)}">${escapeHTML(label)}</option>`).join('');
   $('stock-location').value=ordered.some(([value])=>value===location)?location:'';
    window.dispatchEvent(new CustomEvent('mlk-select-sync',{detail:{id:'stock-location'}}));
   updateStorageState();
   renderHistory(stockFor);
  }else{
   window.dispatchEvent(new CustomEvent('mlk-pantry-rendered'));
  }
 }

 function open(){
  document.querySelector('.pantry').classList.add('expanded');
  $('pantry-toggle').setAttribute('aria-expanded','true');
  $('pantry-toggle').textContent='접기 −';
  $('ingredient-input').focus();
  $('ingredient-input').scrollIntoView({block:'center',behavior:'smooth'});
 }

 $('pantry-list').addEventListener('click',event=>{
  const remove=event.target.closest('[data-remove]'),info=event.target.closest('[data-stock]');
  if(remove){archiveIngredient(remove.dataset.remove);return;}
  if(info)stockEditor.open(info.dataset.stock);
 });

 $('pantry-priority-toggle')?.addEventListener('click',()=>{priorityExpanded=!priorityExpanded;renderPriority();});
 $('nutrition-review-panel')?.addEventListener('toggle',event=>{
  if(event.target===$('nutrition-review-panel')&&event.target.open){
   nutritionVisible=10;estimateVisible=10;renderNutritionReview();
  }
 });
 $('nutrition-review-more')?.addEventListener('click',()=>{
  if(document.documentElement.dataset.access!=='owner'||!nutritionReview)return;
  nutritionVisible=Math.min(nutritionReview.missingRows.length,nutritionVisible+10);
  renderNutritionReviewItems();
 });
 $('nutrition-review-list')?.addEventListener('click',event=>{
  if(document.documentElement.dataset.access!=='owner'||!nutritionReview)return;
  if(!event.target.closest('#nutrition-estimates-more'))return;
  estimateVisible=Math.min(nutritionReview.estimateRows.length,estimateVisible+10);
  renderNutritionReviewItems();
 });
 $('nutrition-review-list')?.addEventListener('click',event=>{
  const target=event.target.closest('[data-review-stock]');
  if(target&&document.documentElement.dataset.access==='owner'&&
     getContext().pantry.includes(target.dataset.reviewStock))
   stockEditor.open(target.dataset.reviewStock,false,{autoResearch:true});
 });
 $('pantry-priority-list')?.addEventListener('click',event=>{
  const remove=event.target.closest('[data-remove]');
  if(remove){archiveIngredient(remove.dataset.remove);return;}
  const item=event.target.closest('[data-priority-stock]');
  if(item)stockEditor.open(item.dataset.priorityStock);
 });

 $('pantry-list').addEventListener('toggle',event=>{
  const detail=event.target.closest?.('[data-pantry-group]');
  if(!detail||$('pantry-search').value.trim()||$('stock-location').value||$('stock-status').value)return;
  const index=Number(detail.dataset.pantryGroup);
  if(!Number.isInteger(index))return;
  if(detail.open)collapsedGroups.delete(index);else collapsedGroups.add(index);
  saveCollapsedGroups(collapsedGroups);
  const {pantry,stockOverrides}=getContext();
  updateGroupToggle(visibleGroupIndexes(pantry,stockOverrides));
 },true);

 $('pantry-groups-toggle')?.addEventListener('click',()=>{
  if($('pantry-search').value.trim()||$('stock-location').value||$('stock-status').value)return;
  const {pantry,stockOverrides}=getContext(),visible=visibleGroupIndexes(pantry,stockOverrides);
  const allOpen=visible.every(index=>!collapsedGroups.has(index));
  for(const index of visible){if(allOpen)collapsedGroups.add(index);else collapsedGroups.delete(index);}
  saveCollapsedGroups(collapsedGroups);
  render(false);
 });

 $('history-search')?.addEventListener('input',()=>renderHistory());
 $('include-history-search')?.addEventListener('change',()=>render(false));

 function handleHistoryClick(event){
  const restore=event.target.closest('[data-history-restore]'),remove=event.target.closest('[data-history-delete]');
  if(restore){stockEditor.restore(restore.dataset.historyRestore);return;}
  if(!remove)return;
  const context=getContext(),name=remove.dataset.historyDelete;
  const previous={ingredientHistory:context.ingredientHistory,stockOverrides:context.stockOverrides};
  const stockOverrides={...context.stockOverrides};delete stockOverrides[name];
  applyContext({ingredientHistory:context.ingredientHistory.filter(item=>item.name!==name),stockOverrides});
  const saved=persist();
  if(!saved)applyContext(previous);
  renderApp();
  if(saved)toast('이전 식재료 기록을 완전히 삭제했어요.');
 }
 $('history-list')?.addEventListener('click',handleHistoryClick);
 $('history-search-results')?.addEventListener('click',handleHistoryClick);

 $('pantry-search').addEventListener('input',()=>{
  clearTimeout(searchTimer);
  searchTimer=setTimeout(()=>render(false),140);
 });
 $('stock-location').addEventListener('change',()=>render(false));
 $('stock-status').addEventListener('change',()=>render(false));
 $('stock-sort')?.addEventListener('change',()=>render(false));
 const pantryPanel=document.querySelector?.('.pantry'),pantryToggle=$('pantry-toggle');
 const resetMobilePantryView=()=>{
  if(!pantryPanel||!pantryToggle)return;
  pantryPanel.classList.remove('expanded');
  pantryToggle.setAttribute('aria-expanded','false');
  pantryToggle.textContent='펼치기 +';
 };
 pantryToggle?.addEventListener('click',()=>{
  if(!pantryPanel)return;
  const expanded=pantryPanel.classList.toggle('expanded');
  pantryToggle.setAttribute('aria-expanded',String(expanded));
  pantryToggle.textContent=expanded?'접기 −':'펼치기 +';
 });
 // Match the recipe filters when desktop returns to the mobile breakpoint.
 // Inventory and collapsed ingredient groups are not changed.
 window.matchMedia?.('(max-width:760px)')?.addEventListener?.('change',event=>{
  if(event.matches)resetMobilePantryView();
 });

 return {render,renderHistory,open};
}
