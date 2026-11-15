import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {menuPickReasons,menuPickWeight,pickMenu,pickMenus,priorityIngredientWeight} from '../public/menu-picker.js';
// The nutrition resolver imports data.js, which loads JSON via top-level fetch.
// Set the existing test-only file fixture before dynamically importing it.
globalThis.fetch=async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(fileURLToPath(url),'utf8'))});
const {recipeEnergyLabel}=await import('../public/nutrition-ui.js');
const {createNutritionResolver}=await import('../public/nutrition-resolver.js');

const read=path=>fs.readFileSync(path,'utf8');
const fail=message=>{throw new Error(message);};
const expect=(condition,message)=>{if(!condition)fail(message);};

const app=read('public/app.js');
const browser=read('public/recipe-browser-controller.js');
const picker=read('public/menu-picker.js');
const index=read('public/index.html');
const style=read('public/style.css');
// Reusing a resolver must not alter nutrition output, including direct stock edits.
const sampleRecipe={id:'resolver-reuse-check',name:'달걀 테스트',required:['달걀'],steps:['달걀 50g'],variantKey:null};
for(const stockOverrides of [{},{달걀:{nutrition:{energy:{value:155,amount:100,unit:'g',kind:'user'}}}}]){
 const context={pantry:['달걀'],stockOverrides,ingredientHistory:[],ingredientDetectionRules:[],sourceEdits:[]};
 expect(JSON.stringify(recipeEnergyLabel(sampleRecipe,context,createNutritionResolver(context)))===JSON.stringify(recipeEnergyLabel(sampleRecipe,context)),'Shared resolver must produce identical energy labels for current stock data');
}
expect(browser.includes('const revision=++energyRevision;')&&browser.includes('energyLabel:pendingEnergy'),'The recipe grid must paint without awaiting nutrition calculations');
expect(browser.includes('queueEnergy(visible,context,revision)')&&browser.indexOf("$('recipe-grid').innerHTML=cards.length")<browser.indexOf('queueEnergy(visible,context,revision)'),'Grid paint must precede background nutrition work');
expect(browser.includes("new Worker(new URL('./recipe-energy-worker.js")&&browser.includes('energyWorker.onmessage='),'Worker must be used for off-main-thread energy work');
expect(browser.includes('if(job.revision!==energyRevision)return;')&&browser.includes('data?.revision!==energyRevision')&&browser.includes('fallbackEnergy(job)'),'Outdated energy replies must be discarded and worker failures must yield a fallback');
const worker=read('public/recipe-energy-worker.js');
expect(!worker.includes('fetch(')&&!worker.includes('localStorage')&&worker.includes('revision!==latestRevision'),'Worker must not read external data or send stale responses');
const deferred=[],replies=[],workerScope={postMessage:value=>replies.push(value)};
new Function('self','recipeEnergyLabel','createNutritionResolver','setTimeout',
 worker.replace(/^import .*?;\s*$/gm,''))(
 workerScope,
 (recipe,context,resolve)=>({text:String(resolve(recipe.id)),title:'fixture'}),
 context=>id=>context.values[id],
 callback=>deferred.push(callback)
);
workerScope.onmessage({data:{revision:1,recipes:[{id:'old-a'},{id:'old-b'}],context:{values:{'old-a':10,'old-b':11}}}});
workerScope.onmessage({data:{revision:2,recipes:[{id:'new-a'},{id:'new-b'},{id:'new-c'}],context:{values:{'new-a':20,'new-b':21,'new-c':22}}}});
for(let steps=0;deferred.length&&steps<12;steps++)deferred.shift()();
expect(replies.length===1&&replies[0].revision===2&&replies[0].labels.map(x=>x.text).join(',')==='20,21,22','Rapid tab/search changes must return energy for the newest result only');

expect(app.includes("import {installRecipeBrowserController} from './recipe-browser-controller.js"),'app.js must install the recipe browser controller');
expect((app.match(/recipeBrowser=installRecipeBrowserController\(/g)||[]).length===1,'app.js must create one recipe browser controller');
expect(app.includes('allRecipes,evaluate,evaluationSnapshot,filteredBase,visibleRecipes'),'Recipe browser must receive the cached evaluation snapshot boundary');
expect(['filters','selectedVariants','pantry','stockOverrides','cookingHistory','lastCooked','sourceEdits'].every(field=>app.match(/recipeBrowser=installRecipeBrowserController\(\{\s*getContext:\(\)=>\(\{([^}]+)\}/)?.[1].split(',').includes(field)),'Recipe browser context must include pantry metadata, cumulative history, and derived recent cooking state');
expect(app.includes('pantryController.render();recipeBrowser.renderRecipes();'),'Global render must delegate recipe-list rendering to the browser controller');
expect(app.includes('renderRecipes:renderRecipeList')&&app.includes('const renderRecipeList=()=>recipeBrowser.renderRecipes();'),'Recipe dialog mutations must rerender through the browser controller');
expect(app.includes('recipeBrowser.renderFilterButtons();render();'),'Initial filter rendering must go through the browser controller');
expect(app.includes('const categoryIconPaths={'),'Recipe category icons must stay explicitly mapped');
expect(app.includes('data-category="${c}"'),'Recipe category SVGs must expose their category for per-type sizing');
expect(style.includes('.category-icon svg{width:22px;height:22px}')&&style.includes('svg[data-category="soup"]{width:21px;height:21px}')&&style.includes('svg[data-category="main"]')&&style.includes('width:23px;height:23px'),'Recipe category icon sizing must keep soup unchanged while enlarging the smaller symbols');
for(const id of ['noodles','rice','bread','main','soup','side','snack','sauce','drink'])expect(app.includes(` ${id}:'`),`Missing dedicated recipe category icon: ${id}`);
expect(app.includes('M5 4h14')&&app.includes('M7.5 5c-2 1.1'),'Noodle icon must keep one horizontal chopstick and clearly wavier long noodles');
expect(app.includes('M4 12h16c-.6 4.4')&&app.includes('M5 12c.1-1.4')&&app.includes('M9 19v2h6v-2'),'Rice icon must stay centered with a rounded bowl, bumpy rice mound, and narrow foot');
expect(app.includes('M2.5 12c0-2.9')&&app.includes('M7 10.3l1.7 1.2'),'Bread icon must use a longer rounded baguette with three inset scores');
expect(app.includes('<ellipse cx="12" cy="12.7" rx="9.5" ry="6.3"/>')&&app.includes('M4.5 12.7c2.5-3.1'),'Meat and seafood icon must show a larger fish clearly on a plate');
expect(app.includes('M3.5 16h17c-.8 3')&&app.includes('M8 15v-3.5'),'Side icon must read as a substantial vegetable side dish');
expect(app.includes('M4 14h16l-1.5 6')&&app.includes('M6 13 9 6l3 7'),'Snack icon must use a generic basket of chips rather than a fries-only symbol');
expect(app.includes('M5 15h14c-.7 3.2')&&app.includes('M6.5 14c.8-2.8'),'Sauce icon must emphasize a visible dipping-sauce swirl above a compact bowl');
expect(app.includes(`soup:'<path d="M3 11h18a9 9 0 0 1-18 0Z"/><path d="M7 7V3m5 4V3m5 4V3"/>'`),'Soup must keep the preferred legacy bowl-and-steam icon');

expect(browser.includes("import {createRecipePager} from './recipe-pagination.js';"),'Recipe browser must own pagination');
expect(browser.includes("import {menuPickReasons,pickMenus} from './menu-picker.js';"),'Recipe browser must use the weighted multi-menu picker and recommendation reasons');
expect(browser.includes("import {cookingCount,latestCookedAt} from './cooking-history.js';"),'Recipe browser must use canonical cumulative history helpers for cooking-based sort explanations');
expect(browser.includes("import {categories,efforts,getStock} from './data.js"),'Recipe browser must resolve pantry priority metadata through canonical stock details');
expect(browser.includes('const recipePager=createRecipePager(24);'),'Recipe browser must retain the 24-card page size');
expect(browser.includes('function renderFilterButtons(){'),'Recipe browser must own filter button rendering');
expect(browser.includes('function renderRecipes(){'),'Recipe browser must own recipe-grid rendering');
expect(browser.includes('const normalizeFilters=value=>'),'Recipe browser must normalize incomplete cached filter state');
expect(browser.includes("availability=['ready','near','far','all'].includes(filters.availability)?filters.availability:base.availability"),'Invalid or missing availability filters must recover to ready');
expect(browser.includes("rating=['all','unrated','rated','3','4','4.5','5'].includes(String(filters.rating))?String(filters.rating):base.rating"),'Invalid or missing rating filters must recover to all');
expect(browser.includes('const {all,evaluated,evaluatedById}=evaluationSnapshot();'),'Recipe rendering must reuse the model evaluation snapshot across filter/search-only changes');
expect(!browser.includes('const all=allRecipes(),evaluated=all.map(evaluate)'),'Recipe rendering must not recompute every recipe availability on each search keystroke');
expect(browser.includes("$('recipe-search').addEventListener('input'"),'Recipe browser must own recipe search input');
expect(browser.includes('searchTimer=setTimeout'),'Recipe browser must own recipe search debounce');
expect(browser.includes('clearTimeout(searchTimer);searchTimer=null;'),'Filter reset must cancel any pending search debounce');
expect(browser.includes("if($('recipe-search').value!==value)return;"),'A stale debounce callback must not reapply a search value after another UI path cleared the field');
expect(browser.includes('searchTimer=null;'),'Search debounce must release its pending timer marker after firing');
expect(browser.includes("$('category-filters').addEventListener('click'"),'Recipe browser must own category filters');
expect(browser.includes("$('rating-filters').addEventListener('click'"),'Recipe browser must own rating filters');
expect(browser.includes("$('effort-filters').addEventListener('click'"),'Recipe browser must own effort filters');
expect(browser.includes("document.querySelector('.availability-tabs').addEventListener('click'"),'Recipe browser must own availability tabs');
expect(browser.includes("$('load-more-recipes').addEventListener('click'"),'Recipe browser must own load-more pagination');
expect(browser.includes("$('recipe-grid').addEventListener('click'"),'Recipe browser must own recipe-card click routing');
expect(browser.includes("$('recipe-grid').addEventListener('keydown'"),'Recipe browser must own keyboard card opening');
expect(browser.includes("$('pick-menu').addEventListener('click'"),'Recipe browser must own ready-menu recommendations');
expect(browser.includes('const {filters,pantry,stockOverrides,lastCooked}=getContext()'),'Menu recommendations must read all picker state from the injected app context');
expect(browser.includes("priority&&(detail.status==='available'||detail.status==='curry')"),'Only usable current ingredients may influence priority picker weighting');
expect(browser.includes('const picks=pickMenus(pool,{count:3,excludeIds:lastRecommendedIds,lastCooked,priorityDates}'),'Menu recommendations must request three weighted picks and avoid the previous set when possible');
expect(browser.includes('menuPickReasons(recipe,{lastCooked,priorityDates})'),'Recommendation cards must explain why each menu was surfaced');
expect(browser.includes("showRecipe(item.dataset.recommendationId,true)"),'Recommendation cards must open the existing recipe detail in today-pick mode');
expect(index.includes('id="menu-recommendations"'),'The main page must provide a dedicated recommendation panel');
expect(!index.includes('id="only-custom"')&&!index.includes('id="custom-count"')&&!index.includes('직접 추가·수정'),'The redundant direct-add recipe filter must stay removed');
expect(!browser.includes('onlyCustom')&&!browser.includes("$('custom-count')"),'Recipe browser must not keep dead direct-add filtering state');
expect(index.includes('오늘 추천 3개'),'The primary recommendation action must describe the three-pick behavior');
expect(!index.includes('id="result-description"')&&!browser.includes('availabilityText')&&!browser.includes('sortLabel'),'The results toolbar must not repeat availability and sort state in a redundant helper sentence');
expect(!index.includes('여러 재료는 줄바꿈 · 위치는 다음 화면에서 선택'),'Pantry add form must omit redundant multiline/location helper copy');
expect(!index.includes('내 레시피와 재고는 서버와 자동 동기화돼요.'),'Recipe editor must omit redundant sync/backup helper copy');
expect(index.includes('<option value="cooked">최근 먹은 순</option>')&&index.includes('<option value="popular">많이 먹은 순</option>'),'Recipe sorting must expose recent-eating and cumulative-frequency views');
expect(index.includes('<details class="menu-foot"><summary>ⓘ 재료 매칭 기준</summary>'),'Long matching guidance must be collapsed behind a concise disclosure');
expect(style.includes('.menu-recommendation-list{'),'Recommendation UI must have a dedicated responsive presentation');
expect(browser.includes("historyLabel:cookingSortLabel(r.id,filters.sort,cookingHistory)"),'Cooking-based sorts must pass one conditional explanation into recipe cards');
expect(browser.includes("if(sort!=='cooked'&&sort!=='popular')return ''"),'Default recipe cards must not gain cooking-history clutter outside cooking-based sorts');
expect(style.includes('.history-sort-note{'),'Conditional cooking-sort explanations must have authored styling');
expect(!browser.includes('readLastCooked'),'Recipe browser must not re-read recent cooking state behind the app context');
expect(!picker.includes('localStorage'),'Pure picker math must not read browser storage directly');
expect(!browser.includes('pool[Math.floor(Math.random()*pool.length)]'),'Uniform random selection must not return');
expect(browser.includes("installRatingInputs([$('recipe-grid')],saveRating);"),'Recipe browser must own grid rating input bindings');
expect(browser.includes('if(handleRatingClick(event,saveRating))return;'),'Grid rating clicks must be consumed before card actions');
expect(browser.includes("else if(event.target.closest('[data-empty=\"pantry\"]'))openPantry();"),'Empty recipe state must still open pantry through the injected boundary');

const now=Date.parse('2026-09-17T09:00:00Z');
const today=menuPickWeight({id:'today',rating:3},{lastCooked:{today:new Date(now-6*60*60*1000).toISOString()},now});
const threeDays=menuPickWeight({id:'three',rating:3},{lastCooked:{three:new Date(now-2*86400000).toISOString()},now});
const old=menuPickWeight({id:'old',rating:3},{lastCooked:{old:new Date(now-20*86400000).toISOString()},now});
expect(today<threeDays&&threeDays<old,'Recently cooked menus must receive progressively lower picker weight');
expect(Math.abs(menuPickWeight({id:'low',rating:1},{now})-0.9)<1e-9,'One-star preference adjustment must stay mild');
expect(Math.abs(menuPickWeight({id:'high',rating:5},{now})-1.1)<1e-9,'Five-star preference adjustment must stay mild');

const priorityRecipe={id:'priority',rating:3,matches:[{actual:'우유'}]};
expect(Math.abs(priorityIngredientWeight(priorityRecipe,{priorityDates:{우유:'2026-09-17'},now})-1.6)<1e-9,'Due-today priority ingredients should get the strongest bounded picker boost');
expect(Math.abs(priorityIngredientWeight(priorityRecipe,{priorityDates:{우유:'2026-09-20'},now})-1.45)<1e-9,'Priority ingredients within three days should get a moderate picker boost');
expect(Math.abs(priorityIngredientWeight(priorityRecipe,{priorityDates:{우유:'2026-09-23'},now})-1.25)<1e-9,'Priority ingredients within seven days should get a smaller picker boost');
expect(Math.abs(priorityIngredientWeight(priorityRecipe,{priorityDates:{우유:'2026-09-28'},now})-1.1)<1e-9,'Priority ingredients within fourteen days should get only a light picker boost');
expect(priorityIngredientWeight(priorityRecipe,{priorityDates:{우유:'2026-10-20'},now})===1,'Distant priority dates should not bias menu picking');
expect(priorityIngredientWeight({id:'other',matches:[{actual:'두부'}]},{priorityDates:{우유:'2026-09-17'},now})===1,'Priority weighting must use the actually matched pantry ingredient only');
const justCookedPriority=menuPickWeight(priorityRecipe,{lastCooked:{priority:new Date(now-6*60*60*1000).toISOString()},priorityDates:{우유:'2026-09-17'},now});
expect(justCookedPriority<menuPickWeight({id:'fresh',rating:3,matches:[]},{now}),'Priority ingredients must not overpower the strong same-day recent-cooking penalty');

const deterministic=pickMenu([{id:'first',rating:3},{id:'second',rating:3}],{lastPicked:'first',random:()=>0,now});
expect(deterministic?.id==='second','The picker must avoid immediately repeating the previous random choice when alternatives exist');

const batch=pickMenus([{id:'a',rating:3},{id:'b',rating:3},{id:'c',rating:3},{id:'d',rating:3}],{count:3,excludeIds:['a'],random:()=>0,now});
expect(batch.length===3&&new Set(batch.map(item=>item.id)).size===3,'Three menu recommendations must be unique');
expect(!batch.some(item=>item.id==='a'),'A previous recommendation should be avoided when three fresh alternatives exist');
const priorityReasons=menuPickReasons({id:'reason',rating:4.5,time:20,matches:[{actual:'우유'}]},{lastCooked:{reason:new Date(now-20*86400000).toISOString()},priorityDates:{우유:'2026-09-17'},now});
expect(priorityReasons[0]==='소비 우선 · 우유 오늘','Recommendation reasons must expose a matched priority ingredient without implying an official expiry date');
expect(priorityReasons.includes('최근 2주 이상 안 먹음'),'Recommendation reasons must explain long-unseen menus');
const ratingReasons=menuPickReasons({id:'rating-reason',rating:4.5,time:15,matches:[]},{lastCooked:{'rating-reason':new Date(now-2*60*60*1000).toISOString()},now});
expect(ratingReasons.includes('내 별점 ★4.5'),'Recommendation reasons should surface strong personal ratings when relevant');

for(const stale of [
 "$('recipe-search').addEventListener('input'",
 "$('category-filters').addEventListener('click'",
 "$('load-more-recipes').addEventListener('click'",
 "$('recipe-grid').addEventListener('click'",
 "$('pick-menu').addEventListener('click'",
 'const recipePager=createRecipePager(24);',
 'function renderFilterButtons(){',
 'function resetFilters(){'
])expect(!app.includes(stale),`Recipe browser behavior must not remain in app.js: ${stale}`);

expect(!browser.includes('createRecipeCardEnergyCache')&&!browser.includes('cachedEnergyLabel')&&browser.includes('energyLabel:pendingEnergy'),'Card energy must not revive stale cross-render caching');
expect(browser.includes("window.matchMedia?.('(max-width:760px)')")&&browser.includes("if(event.matches)resetMobileFilterView()"),'Mobile filter must return to collapsed state on desktop-to-mobile transition');
expect(browser.includes("mobileFilters.textContent=collapsed?'펼치기 +':'접기 −'"),'Mobile recipe filter must show clear open and close controls');
expect(!app.includes("document.querySelector('.quick-access')"),'Rejected duplicate quick-navigation toolbar must not be wired again');
console.log('Recipe browser controller boundary check passed.');

