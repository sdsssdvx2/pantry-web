import {recipeEnergyLabel} from './nutrition-ui.js';
import {createNutritionResolver} from './nutrition-resolver.js';
import {categories,efforts,getStock} from './data.js?v=20260919-6';
import {recipeCardHTML,emptyRecipeGridHTML} from './recipe-display.js?v=20260919-4';
import {ratingFilters,ratingHTML,handleRatingClick,installRatingInputs} from './ratings.js';
import {createRecipePager} from './recipe-pagination.js';
import {menuPickReasons,pickMenus} from './menu-picker.js';
import {cookingCount,latestCookedAt} from './cooking-history.js';
import {stockPriorityDate} from './pantry-priority.js';

const $=id=>document.getElementById(id);
const defaultFilters=()=>({categories:{},effort:'all',availability:'ready',sort:'recent',query:'',rating:'all',searchBody:false});
const normalizeFilters=value=>{
 const base=defaultFilters(),filters=value&&typeof value==='object'?value:{};
 const availability=['ready','near','far','all'].includes(filters.availability)?filters.availability:base.availability;
 const effort=['all','1','2','3','4','5'].includes(String(filters.effort))?String(filters.effort):base.effort;
 const sort=['recent','cooked','popular','rating','time','effort'].includes(filters.sort)?filters.sort:base.sort;
 const rating=['all','unrated','rated','3','4','4.5','5'].includes(String(filters.rating))?String(filters.rating):base.rating;
 const categories=filters.categories&&typeof filters.categories==='object'&&!Array.isArray(filters.categories)?filters.categories:{};
 return {...base,...filters,categories,availability,effort,sort,rating,query:typeof filters.query==='string'?filters.query:'',searchBody:!!filters.searchBody};
};

function cookingSortLabel(recipeId,sort,cookingHistory){
 if(sort!=='cooked'&&sort!=='popular')return '';
 const count=cookingCount(cookingHistory,recipeId),latest=latestCookedAt(cookingHistory,recipeId);
 if(!count||!latest)return '먹은 기록 없음';
 const date=new Date(latest),dateLabel=`${date.getMonth()+1}/${date.getDate()}`;
 return sort==='popular'?`먹은 기록 ${count}회 · 최근 ${dateLabel}`:`최근 ${dateLabel} · 총 ${count}회`;
}

function usablePriorityDates(pantry,stockOverrides){
 const result={};
 for(const name of pantry||[]){
  const detail=getStock(name,stockOverrides);
  const priority=stockPriorityDate(name,detail);
  if(priority&&(detail.status==='available'||detail.status==='curry'))result[name]=priority.value;
 }
 return result;
}

export function installRecipeBrowserController({
 getContext,applyContext,allRecipes,evaluate,evaluationSnapshot,filteredBase,visibleRecipes,refreshRelated,relatedIds,
 showRecipe,copyRecipeToClipboard,saveRating,openPantry,escapeHTML,categoryName,effortName,icon,clock
}){
 const recipePager=createRecipePager(24);
 let lastRecommendedIds=[],recommendationRefs=null,searchTimer=null;
 // Every grid update has a fresh generation. Never accept energy values from
 // an older search, inventory state or recipe variant selection.
 let energyRevision=0,energyWorker=null,energyWorkerUnavailable=false;
 let energyWatchdog=null,energyFallbackTimer=null,energyJob=null;
 const pendingEnergy={text:'열량 계산 중…',title:'현재 표시 중인 레시피의 영양정보를 계산하고 있어요.'};
 const energyRecipe=r=>({
  id:r.id,variantKey:r.variantKey||null,source:!!r.source,
  original:r.original||'',steps:r.steps||[],required:r.required||[],
  nutritionPlan:r.nutritionPlan,variantLabel:r.variantLabel||''
 });
 const workerEnergyContext=c=>({
  pantry:c.pantry||[],stockOverrides:c.stockOverrides||{},
  ingredientHistory:(c.ingredientHistory||[]).map(item=>({name:item.name})),
  ingredientDetectionRules:c.ingredientDetectionRules||[],
  sourceEdits:(c.sourceEdits||[]).map(edit=>({sourceId:edit.sourceId,variantKey:edit.variantKey||null}))
 });
 const applyEnergyLabels=(revision,labels)=>{
  if(revision!==energyRevision||!Array.isArray(labels))return false;
  const slots=$('recipe-grid').querySelectorAll('.recipe-card .recipe-energy');
  if(slots.length!==labels.length||labels.some(label=>typeof label?.text!=='string'||typeof label?.title!=='string'))return false;
  for(let i=0;i<slots.length;i++){
   slots[i].textContent=labels[i].text;
   slots[i].title=labels[i].title;
  }
  return true;
 };
 const fallbackEnergy=job=>{
  if(job.revision!==energyRevision)return;
  let index=0,resolver=null;
  const work=()=>{
   if(job.revision!==energyRevision)return;
   if(!resolver)resolver=createNutritionResolver(job.context);
   const slots=$('recipe-grid').querySelectorAll('.recipe-card .recipe-energy');
   if(slots.length!==job.recipes.length)return;
   // Fallback only: yield between cards so filter/search input stays usable.
   const i=index++;
   if(i>=job.recipes.length)return;
   try{
    const result=recipeEnergyLabel(job.recipes[i],job.context,resolver);
    slots[i].textContent=result.text;
    slots[i].title=result.title;
   }catch{
    slots[i].textContent='열량 계산 오류';
    slots[i].title='이 레시피의 영양정보 계산을 완료하지 못했어요.';
   }
   if(index<job.recipes.length)energyFallbackTimer=setTimeout(work,0);
  };
  if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>{
   if(job.revision===energyRevision)energyFallbackTimer=setTimeout(work,0);
  });
  else energyFallbackTimer=setTimeout(work,0);
 };
 const failEnergyWorker=()=>{
  if(energyWorker){energyWorker.terminate();energyWorker=null;}
  energyWorkerUnavailable=true;
  clearTimeout(energyWatchdog);
  if(energyJob?.revision===energyRevision)fallbackEnergy(energyJob);
 };
 const queueEnergy=(recipes,context,revision)=>{
  if(!recipes.length)return;
  const job={recipes,context,revision};
  energyJob=job;
  if(!energyWorkerUnavailable&&typeof Worker==='function'){
   try{
    if(!energyWorker){
     energyWorker=new Worker(new URL('./recipe-energy-worker.js?v=20261108-offthread-1',import.meta.url),{type:'module'});
     energyWorker.onmessage=({data})=>{
      if(data?.revision!==energyRevision)return;
      clearTimeout(energyWatchdog);
      if(data.error||!applyEnergyLabels(data.revision,data.labels))failEnergyWorker();
     };
     energyWorker.onerror=event=>{event.preventDefault?.();failEnergyWorker();};
     energyWorker.onmessageerror=failEnergyWorker;
    }
    energyWorker.postMessage({
     revision,recipes:recipes.map(energyRecipe),context:workerEnergyContext(context)
    });
    energyWatchdog=setTimeout(()=>{
     if(revision===energyRevision)failEnergyWorker();
    },5000);
    return;
   }catch{failEnergyWorker();return;}
  }
  fallbackEnergy(job);
 };

 function clearRecommendations(){
  const panel=$('menu-recommendations'),list=$('menu-recommendation-list');
  if(panel)panel.hidden=true;
  if(list)list.innerHTML='';
  $('pick-menu')?.setAttribute('aria-expanded','false');
  if($('pick-menu-label'))$('pick-menu-label').textContent='오늘 추천 3개';
  recommendationRefs=null;
 }

 function renderRecommendations(picks,{filters,lastCooked,evaluated,priorityDates}){
  const panel=$('menu-recommendations'),list=$('menu-recommendation-list'),summary=$('menu-recommendations-summary');
  if(!panel||!list||!picks.length)return;
  list.innerHTML=picks.map((recipe,index)=>{
   const reasons=menuPickReasons(recipe,{lastCooked,priorityDates});
   const version=recipe.variantLabel?` · ${escapeHTML(recipe.variantLabel)}`:'';
   return `<button type="button" class="menu-recommendation-card" data-recommendation-id="${escapeHTML(recipe.id)}"><span class="recommendation-rank">${index+1}</span><span class="recommendation-copy"><strong>${escapeHTML(recipe.name)}</strong><small>약 ${recipe.time}분 · ${escapeHTML(effortName(recipe.effort))}${version}</small><span class="recommendation-reasons">${reasons.map(reason=>`<em>${escapeHTML(reason)}</em>`).join('')}</span></span><span class="recommendation-arrow" aria-hidden="true">›</span></button>`;
  }).join('');
  if(summary)summary.textContent=picks.length>=3?'현재 조건에서 고른 세 가지예요 · 하나를 누르면 상세를 볼 수 있어요.':`현재 조건에서 추천할 수 있는 메뉴 ${picks.length}개예요.`;
  panel.hidden=false;
  $('pick-menu')?.setAttribute('aria-expanded','true');
  if($('pick-menu-label'))$('pick-menu-label').textContent='다시 추천 3개';
  recommendationRefs={filters,lastCooked,evaluated};
 }

 function renderFilterButtons(){
  const {filters}=getContext();
  $('rating-filters').innerHTML=ratingFilters.map(([v,l])=>`<button class="chip" data-rating-filter="${v}" aria-pressed="${v===filters.rating}">${l}</button>`).join('');
  $('category-filters').innerHTML=categories.filter(([v])=>v!=='all').map(([v,l])=>`<button class="chip ${filters.categories[v]===-1?'excluded':''}" data-category="${v}" aria-pressed="${!!filters.categories[v]}" aria-label="${l}${filters.categories[v]===-1?' 제외':filters.categories[v]===1?' 포함':''}">${filters.categories[v]===-1?'− ':''}${l}</button>`).join('');
  $('effort-filters').innerHTML=efforts.map(([v,l])=>`<button class="effort-chip" data-effort="${v}" aria-pressed="${v===filters.effort}">${v==='all'?'':`<span class="effort-dot" aria-hidden="true">${[1,2,3,4,5].map(i=>`<i class="${i<=Number(v)?'on':''}"></i>`).join('')}</span>`}${l}</button>`).join('');
 }

 function renderRecipes(){
  const context=getContext(),filters=normalizeFilters(context.filters),cookingHistory=context.cookingHistory,lastCooked=context.lastCooked;
  if(JSON.stringify(filters)!==JSON.stringify(context.filters))applyContext({filters});
  const {all,evaluated,evaluatedById}=evaluationSnapshot();
  if(recommendationRefs&&(recommendationRefs.filters!==filters||recommendationRefs.lastCooked!==lastCooked||recommendationRefs.evaluated!==evaluated))clearRecommendations();
  refreshRelated(evaluated);
  const base=filteredBase(all,evaluatedById),ready=base.filter(r=>!r.missing.length),near=base.filter(r=>r.missing.length>=1&&r.missing.length<=2),list=visibleRecipes(base),page=recipePager.page(list.map(r=>`${r.id}/${r.variantKey||''}`)),visible=list.slice(0,page.limit);
  $('ready-count').textContent=evaluated.filter(r=>!r.missing.length).length;
  $('tab-ready').textContent=ready.length;
  $('tab-near').textContent=near.length;
  $('tab-far').textContent=base.filter(r=>r.missing.length>=3).length;
  $('result-count').textContent=list.length;
  document.querySelectorAll('[data-availability]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.availability===filters.availability)));
  $('pick-menu').disabled=!ready.length;
  const revision=++energyRevision;
  clearTimeout(energyWatchdog);
  clearTimeout(energyFallbackTimer);
  // Build the familiar cards immediately, without synchronous nutrition work.
  // Energy labels fill in-place after the grid is already interactive.
  const cards=visible.map(r=>recipeCardHTML({recipe:r,iconHTML:icon(r.category),energyLabel:pendingEnergy,ratingMarkup:ratingHTML(r.id,r.name,r.rating,escapeHTML),clockHTML:clock,effortLabel:effortName(r.effort),categoryLabel:categoryName(r.category),relatedCount:relatedIds(r).length,historyLabel:cookingSortLabel(r.id,filters.sort,cookingHistory)}));
  $('recipe-grid').innerHTML=cards.length?cards.join(''):emptyRecipeGridHTML();
  queueEnergy(visible,context,revision);
  const more=$('load-more-recipes'),row=more?.closest('.recipe-load-more');
  if(more){more.hidden=!page.hasMore;if(row)row.hidden=!page.hasMore;more.textContent=page.hasMore?`더 보기 ${Math.min(24,page.remaining)}개`:'';}
 }

 function resetFilters(){
  clearTimeout(searchTimer);searchTimer=null;
  const filters=defaultFilters();
  applyContext({filters,selectedVariants:{}});
  $('search-body').checked=false;
  if($('search-notes'))$('search-notes').checked=false;
  $('sort').value='recent';
   window.dispatchEvent(new CustomEvent('mlk-select-sync',{detail:{id:'sort'}}));
  $('recipe-search').value='';
  recipePager.reset();
  renderFilterButtons();
  renderRecipes();
 }

 $('load-more-recipes').addEventListener('click',()=>{recipePager.more();renderRecipes();});
 $('category-filters').addEventListener('click',event=>{
  const button=event.target.closest('[data-category]');if(!button)return;
  const {filters}=getContext(),key=button.dataset.category,current=filters.categories[key]||0;
  applyContext({filters:{...filters,categories:{...filters.categories,[key]:current===1?-1:current===-1?0:1}}});
  renderFilterButtons();renderRecipes();
 });
 $('rating-filters').addEventListener('click',event=>{
  const button=event.target.closest('[data-rating-filter]');if(!button)return;
  const {filters}=getContext();applyContext({filters:{...filters,rating:button.dataset.ratingFilter}});renderFilterButtons();renderRecipes();
 });
 $('effort-filters').addEventListener('click',event=>{
  const button=event.target.closest('[data-effort]');if(!button)return;
  const {filters}=getContext();applyContext({filters:{...filters,effort:button.dataset.effort}});renderFilterButtons();renderRecipes();
 });
 document.querySelector('.availability-tabs').addEventListener('click',event=>{
  const button=event.target.closest('[data-availability]');if(!button)return;
  const {filters}=getContext();applyContext({filters:{...filters,availability:button.dataset.availability}});renderRecipes();
 });
 $('sort').addEventListener('change',event=>{const {filters}=getContext();applyContext({filters:{...filters,sort:event.target.value}});renderRecipes();});
 const mobileFilters=$('menu-filters-toggle');
 const filterPanel=mobileFilters?.closest('.filters');
 const resetMobileFilterView=()=>{
  if(!filterPanel||!mobileFilters)return;
  filterPanel.classList.add('mobile-filters-collapsed');
  mobileFilters.setAttribute('aria-expanded','false');
  mobileFilters.textContent='펼치기 +';
 };
 mobileFilters?.addEventListener('click',()=>{
  if(!filterPanel)return;
  const collapsed=filterPanel.classList.toggle('mobile-filters-collapsed');
  mobileFilters.setAttribute('aria-expanded',String(!collapsed));
  mobileFilters.textContent=collapsed?'펼치기 +':'접기 −';
 });
 // Moving from desktop back to mobile should restore the familiar collapsed
 // initial state, without changing category/effort/rating selections.
 window.matchMedia?.('(max-width:760px)')?.addEventListener?.('change',event=>{
  if(event.matches)resetMobileFilterView();
 });
 $('reset-filters').addEventListener('click',resetFilters);
 $('search-body').addEventListener('change',event=>{const {filters}=getContext();applyContext({filters:{...filters,searchBody:event.target.checked}});renderRecipes();});
 $('recipe-search').addEventListener('input',event=>{
  const value=event.target.value;clearTimeout(searchTimer);searchTimer=setTimeout(()=>{
   searchTimer=null;
   if($('recipe-search').value!==value)return;
   const {filters}=getContext();applyContext({filters:{...filters,query:value}});renderRecipes();
  },180);
 });
 $('recipe-grid').addEventListener('click',async event=>{
  if(handleRatingClick(event,saveRating))return;
  const copy=event.target.closest('[data-copy-card]');
  if(copy){const base=allRecipes().find(r=>r.id===copy.dataset.copyCard);if(base)await copyRecipeToClipboard(evaluate(base));return;}
  const detail=event.target.closest('[data-detail]');if(detail){showRecipe(detail.dataset.detail);return;}
  const card=event.target.closest('.recipe-card[data-recipe-id]');if(card){showRecipe(card.dataset.recipeId);return;}
  if(event.target.closest('[data-empty="all"]')){resetFilters();const {filters}=getContext();applyContext({filters:{...filters,availability:'all'}});renderRecipes();}
  else if(event.target.closest('[data-empty="pantry"]'))openPantry();
 });
 $('recipe-grid').addEventListener('keydown',event=>{if(!['Enter',' '].includes(event.key)||!event.target.matches('.recipe-card[data-recipe-id]'))return;event.preventDefault();showRecipe(event.target.dataset.recipeId);});
 $('pick-menu').addEventListener('click',()=>{
  const {filters,pantry,stockOverrides,lastCooked}=getContext();let pool=filteredBase().filter(r=>!r.missing.length);if(!pool.length)return;
  if(!Object.values(filters.categories).some(v=>v===1)&&pool.some(r=>!['sauce','side'].includes(r.category)))pool=pool.filter(r=>!['sauce','side'].includes(r.category));
  const priorityDates=usablePriorityDates(pantry,stockOverrides),evaluated=evaluationSnapshot().evaluated;
  const picks=pickMenus(pool,{count:3,excludeIds:lastRecommendedIds,lastCooked,priorityDates});if(!picks.length)return;
  lastRecommendedIds=picks.map(recipe=>recipe.id);
  renderRecommendations(picks,{filters,lastCooked,evaluated,priorityDates});
  $('menu-recommendations').scrollIntoView({block:'nearest',behavior:'smooth'});
 });
 $('menu-recommendation-list')?.addEventListener('click',event=>{
  const item=event.target.closest('[data-recommendation-id]');if(item)showRecipe(item.dataset.recommendationId,true);
 });
 $('close-menu-recommendations')?.addEventListener('click',clearRecommendations);
 installRatingInputs([$('recipe-grid')],saveRating);

 return {render:renderRecipes,renderRecipes,renderFilterButtons,resetFilters};
}

