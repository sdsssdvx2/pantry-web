import assert from 'node:assert/strict';
import fs from 'node:fs';

// The production browser controllers transitively import data.js, which uses
// fetch() for hosted JSON. Never run that file:// fetch in Node CI. Evaluate the
// ACTUAL controller and recipe-detail markup in an isolated dependency harness.
const stripImports=s=>s.replace(/^import .*?;\s*$/gm,'').replace(/^export /gm,'');
const markupSource=fs.readFileSync(new URL('../public/recipe-display.js',import.meta.url),'utf8');
const markup=new Function('cookingLayoutHTML','gramCookingText',
 stripImports(markupSource)+'\nreturn {cookingBody,recipeCopyText,recipeDetailHTML,cookModeHTML};'
)(raw=>'<div class="cooking-layout">'+String(raw)+'</div>',raw=>String(raw));
const controllerSource=fs.readFileSync(new URL('../public/recipe-view-controller.js',import.meta.url),'utf8');
const installRecipeViewController=new Function(
 'recipeNutritionResult','nutritionSummaryHTML','cookingBody','recipeCopyText',
 'recipeDetailHTML','cookModeHTML','getStock','matchIngredient','copyText',
 stripImports(controllerSource)+'\nreturn installRecipeViewController;'
)(
 ()=>({totals:{energy:{known:false},rows:[]}}),
 ()=>'<section class="nutrition-summary">독립 영양 계산 표시</section>',
 markup.cookingBody,markup.recipeCopyText,markup.recipeDetailHTML,markup.cookModeHTML,
 ()=>({notes:[]}),()=>({available:false}),async()=>true
);

// Minimal DOM for exercising the REAL detail controller. No Chrome login,
// network, production storage or personal recipe data is involved.
const oldDocument=globalThis.document,oldRAF=globalThis.requestAnimationFrame;
const callbacks=[];
let currentPending=null,html='',focuses=0;
const content={
 classList:{add(){},remove(){}},
 style:{setProperty(){}},
 addEventListener(){},
 get innerHTML(){return html;},
 set innerHTML(value){
  if(currentPending)currentPending.isConnected=false;
  html=value;
  currentPending=value.includes('data-recipe-nutrition-pending')?
   {isConnected:true,output:null,set outerHTML(next){this.output=next;}}:null;
 },
 querySelector(selector){
  return selector==='[data-recipe-nutrition-pending]'?currentPending:null;
 },
 querySelectorAll(){return [];}
};
const dialog={open:false,addEventListener(){},showModal(){this.open=true;},close(){this.open=false;},scrollTop:0};
const closeButton={focus(){focuses++;}};
const elements={'dialog-content':content,'recipe-dialog':dialog,'close-dialog':closeButton};
globalThis.document={activeElement:{isConnected:true,focus(){}},getElementById:id=>elements[id]||null};
globalThis.requestAnimationFrame=fn=>{callbacks.push(fn);return callbacks.length;};
const base={id:'scratch-recipe',name:'합성 쌀밥',category:'rice',effort:1,time:10,summary:'합성 데이터',
 required:['쌀'],optional:[],steps:['쌀 100g'],matches:[],missing:[],related:[],
 source:false,custom:true,variantKey:null,variants:[],original:'',rating:0};
const state={activeRecipe:null,builtInRecipes:[base],customRecipes:[],sourceEdits:[],hiddenSources:[],
 pantry:[],stockOverrides:{},ingredientHistory:[],ingredientDetectionRules:[],cookingHistory:{},lastCooked:{}};
const controller=installRecipeViewController({
 getContext:()=>state,applyContext:next=>Object.assign(state,next),allRecipes:()=>[base],
 evaluate:()=>base,evaluationSnapshot:()=>({evaluated:[]}),
 toast(){throw Error('No user toast expected');},escapeHTML:s=>String(s),
 effortName:()=>'',clock:'',ratingHTML:()=>'',canRecordCooked:()=>false
});
const settle=()=>new Promise(resolve=>setTimeout(resolve,10));
try{
 controller.showRecipe(base.id);
 const first=currentPending;
 assert(dialog.open&&focuses===1,'Recipe modal opens and focuses before async nutrition');
 assert(html.includes('합성 쌀밥')&&html.includes('영양정보 계산 중…'),
  'Recipe details render without waiting for nutrition');
 assert.equal(first.output,null,'No nutrition calculation before first paint');
 assert.equal(callbacks.length,1);
 callbacks.shift()();await settle();
 assert(first.output?.includes('nutrition-summary'),'Actual full nutrition arrives after first frame');

 controller.showRecipe(base.id);
 const stale=currentPending;
 controller.showRecipe(base.id);
 const latest=currentPending;
 callbacks.shift()();callbacks.shift()();await settle();
 assert.equal(stale.output,null,'Old recipe render cannot overwrite a newer view');
 assert(latest.output?.includes('nutrition-summary'),'Latest recipe receives nutrition');

 controller.showRecipe(base.id);
 const closed=currentPending;controller.closeRecipe();
 callbacks.shift()();await settle();
 assert.equal(closed.output,null,'Closed modal does not accept stale nutrition');
 assert.equal(state.activeRecipe,base.id,'Only in-memory active selection changed');
 console.log('RECIPE_DETAILS_FIRST_PAINT=PASS; STALE_NUTRITION_NOT_APPLIED=PASS; NO_STORAGE_WRITE=PASS');
}finally{
 if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;
 if(oldRAF===undefined)delete globalThis.requestAnimationFrame;else globalThis.requestAnimationFrame=oldRAF;
}
