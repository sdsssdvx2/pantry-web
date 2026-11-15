import assert from 'node:assert/strict';
import fs from 'node:fs';

// Execute the real browser controller in an isolated DOM/worker fixture.
// This checks the complete filter -> grid paint -> async result path with
// no login, production data, network, or manual browser interaction.
let source=fs.readFileSync('public/recipe-browser-controller.js','utf8');
source=source.replace(/^import .*?;\s*$/gm,'').replace(/^export /gm,'')
 .replaceAll('import.meta.url','"https://fixture.invalid/recipe-browser-controller.js"');

class Field{
 constructor(){this.listeners={};this.attributes={};this.hidden=false;this.value='';this.textContent='';this.disabled=false;this.checked=false;}
 addEventListener(type,fn){this.listeners[type]=fn;}
 setAttribute(name,value){this.attributes[name]=value;}
 closest(selector){if(selector==='.filters')return filterPanel;if(selector==='.recipe-load-more')return loadMoreRow;return null;}
}
const fields=new Map();
const get=id=>{if(!fields.has(id))fields.set(id,new Field());return fields.get(id);};
const loadMoreRow={hidden:false};
const filterPanel={classList:{add(){},toggle(){return false;}}};
const slots=[];
const grid=get('recipe-grid');
let gridHTML='';
Object.defineProperty(grid,'innerHTML',{
 get:()=>gridHTML,
 set:value=>{
  gridHTML=value;
  slots.length=0;
  for(const _ of value.matchAll(/class="recipe-energy"/g))slots.push({textContent:'열량 계산 중…',title:''});
 }
});
grid.querySelectorAll=selector=>{assert.equal(selector,'.recipe-card .recipe-energy');return slots;};
const buttons=['ready','near','far','all'].map(id=>({dataset:{availability:id},setAttribute(){}}));
const tabs=new Field();
const document={
 getElementById:get,
 querySelector:selector=>{assert.equal(selector,'.availability-tabs');return tabs;},
 querySelectorAll:selector=>{assert.equal(selector,'[data-availability]');return buttons;}
};
const window={matchMedia:()=>({addEventListener(){}}),dispatchEvent(){}};
const timers=new Map();let nextTimer=0;
const setTimer=(fn,delay)=>{const id=++nextTimer;timers.set(id,{fn,delay});return id;};
const clearTimer=id=>timers.delete(id);
class FakeWorker{
 static instances=[];
 constructor(url,options){assert.equal(options.type,'module');assert(String(url).includes('recipe-energy-worker.js'));this.sent=[];this.terminated=false;FakeWorker.instances.push(this);}
 postMessage(request){this.sent.push(request);}
 terminate(){this.terminated=true;}
 fire(data){this.onmessage({data});}
}
const menu=[{id:'a',name:'가벼운 샐러드',category:'main',effort:1,time:5,missing:[],required:['오이'],variantKey:null},
 {id:'b',name:'달걀 볶음',category:'main',effort:1,time:10,missing:['달걀'],required:['달걀'],variantKey:null},
 {id:'c',name:'버섯 수프',category:'soup',effort:2,time:20,missing:['버섯','우유','생크림'],required:['버섯'],variantKey:null}];
const filters=()=>({categories:{},effort:'all',availability:'ready',sort:'recent',query:'',rating:'all',searchBody:false});
const state={filters:filters(),pantry:['오이'],stockOverrides:{},ingredientHistory:[],ingredientDetectionRules:[],sourceEdits:[],selectedVariants:{},cookingHistory:{},lastCooked:{}};
let synchronousEnergy=0,saved=0;
const deps={
 recipeEnergyLabel(){synchronousEnergy++;throw Error('Heavy nutrition must not run during grid paint');},
 createNutritionResolver(){throw Error('Resolver must not initialize on the UI thread');},
 categories:[['all','전체'],['main','메인'],['soup','국']],efforts:[['all','모든 수고'],['1','간단히']],getStock:()=>({}),
 recipeCardHTML:({energyLabel})=>'<article class="recipe-card"><span class="recipe-energy">'+energyLabel.text+'</span></article>',
 emptyRecipeGridHTML:()=>'<p>빈 결과</p>',
 ratingFilters:[['all','전체']],ratingHTML:()=>'',handleRatingClick:()=>false,installRatingInputs:()=>{},
 createRecipePager:size=>({page(ids){return {limit:Math.min(size,ids.length),hasMore:ids.length>size,remaining:Math.max(0,ids.length-size)};},more(){},reset(){}}),
 menuPickReasons:()=>[],pickMenus:()=>[],cookingCount:()=>0,latestCookedAt:()=>null,stockPriorityDate:()=>null
};
const names=Object.keys(deps);
const factory=new Function(...names,'document','window','Worker','setTimeout','clearTimeout','CustomEvent','requestAnimationFrame','URL',
 source+'\nreturn installRecipeBrowserController;');
const install=factory(...names.map(k=>deps[k]),document,window,FakeWorker,setTimer,clearTimer,class {},fn=>fn(),URL);
const controller=install({
 getContext:()=>state,
 applyContext:next=>Object.assign(state,next),
 allRecipes:()=>menu,evaluate:r=>r,
 evaluationSnapshot:()=>({all:menu,evaluated:menu,evaluatedById:new Map(menu.map(r=>[r.id,r]))}),
 filteredBase:all=>state.filters.query?all.filter(r=>r.name.includes(state.filters.query)):all,
 visibleRecipes:base=>base.filter(r=>state.filters.availability==='all'
  ||(state.filters.availability==='ready'?r.missing.length===0:
    state.filters.availability==='near'?r.missing.length>=1&&r.missing.length<=2:r.missing.length>=3)),
 refreshRelated(){},relatedIds:()=>[],showRecipe(){},copyRecipeToClipboard(){},saveRating(){saved++;},
 openPantry(){},escapeHTML:String,categoryName:()=>'',effortName:()=>'',icon:()=>'',clock:''
});
controller.renderFilterButtons();
controller.renderRecipes();
assert.equal(slots.length,1);
assert(gridHTML.includes('열량 계산 중…'),'First card paint must not await nutrition');
assert.equal(synchronousEnergy,0);
assert.equal(FakeWorker.instances.length,1);
const worker=FakeWorker.instances[0];
const first=worker.sent.at(-1);
assert.equal(first.recipes.length,1);

const changeTab=availability=>tabs.listeners.click({target:{closest:()=>({dataset:{availability}})}});
changeTab('near');assert.equal(slots.length,1);
changeTab('far');assert.equal(slots.length,1);
changeTab('all');assert.equal(slots.length,3);
assert.equal(synchronousEnergy,0,'Rapid filter changes must never run nutrition on the main thread');
const newest=worker.sent.at(-1);
assert.equal(newest.recipes.length,3);
worker.fire({revision:first.revision,labels:[{text:'잘못된 과거 값',title:'old'}]});
assert(slots.every(x=>x.textContent==='열량 계산 중…'),'Stale worker reply must not overwrite the current grid');
worker.fire({revision:newest.revision,labels:[{text:'50kcal',title:'a'},{text:'60kcal',title:'b'},{text:'70kcal',title:'c'}]});
assert.deepEqual(slots.map(x=>x.textContent),['50kcal','60kcal','70kcal']);

const search=get('recipe-search');
search.value='샐러드';
search.listeners.input({target:{value:search.value}});
const timer=[...timers.values()].find(x=>x.delay===180);
assert(timer,'Search must still debounce');
timer.fn();
assert.equal(state.filters.query,'샐러드');
assert.equal(slots.length,1);
assert.equal(worker.sent.at(-1).recipes[0].id,'a');
assert.equal(synchronousEnergy,0);
assert.equal(saved,0,'Filter and search must never persist');
console.log('Recipe grid smoke: ready/near/far/all, rapid stale responses, search and immediate paint PASS.');
