import fs from 'node:fs';
const read=path=>fs.readFileSync(path,'utf8');
const fail=message=>{throw new Error(message);};
const app=read('public/app.js');
const pantry=read('public/pantry-ui.js');
const pantryCopy=read('public/pantry-copy.js');
const pantryController=read('public/pantry-controller.js');
const stockEditor=read('public/stock-editor.js');
const bootstrap=read('public/bootstrap.js');
const index=read('public/index.html');
const review=read('public/nutrition-gap-priority.js');
if(!pantryController.includes('ingredientHistory:state.ingredientHistory||[]'))
 fail('Nutrition review must use the calculator resolver historical identity authority');
if(!index.includes('id="nutrition-review-panel"')||!index.includes('id="nutrition-review-list"'))
 fail('Owner must be able to open a read-only nutrition gap priority list');
if(!pantryController.includes('data-review-stock')||!pantryController.includes("stockEditor.open(target.dataset.reviewStock,false,{autoResearch:true})"))
 fail('Nutrition review entries must open the existing stock editor with one targeted automatic research request');
if(!review.includes('rankNutritionGaps'))fail('Nutrition triage should be pure and independently testable');
// The owner reported tens of seconds of UI blocking. The pantry nutrient
// queue must NOT run the per-recipe calculator or render recipe-specific audits.
// Deep quantity/provenance analysis belongs in an explicitly requested workflow.
if(pantryController.includes('analyzeNutritionSingleBlockers')||
   pantryController.includes('calculateRecipeNutrition')||
   pantryController.includes('renderRecipeMeasurementReview'))
 fail('Opening stock nutrition review must not synchronously calculate all recipes');
if(!pantryController.includes('nutritionReview=rankNutritionGaps(')||
   !pantryController.includes('summary.missingRows.slice(0,nutritionVisible)')||
   !pantryController.includes('nutritionVisible=10')||
   !pantryController.includes('nutritionReview.estimateRows'))
 fail('Keep fast missing-metric inventory triage and bounded first ten results');
if(!pantryController.includes('escapeHTML(row.name)')||
   !pantryController.includes('escapeHTML(metric+reason+linked)')||
   !pantryController.includes('data-review-stock'))
 fail('Research queue must escape owner names and link only to existing stock editor');
if(!index.includes('id="nutrition-review-more"')||
   !pantryController.includes('estimateVisible=10')||
   !pantryController.includes('nutrition-review-estimates')||
   !pantryController.includes('nutritionReview.missingTotal'))
 fail('Missing metric priority, user paging and estimated values must remain separate');
if(!(index.indexOf('id="pantry-priority"')<index.indexOf('id="add-form"')&&
    index.indexOf('id="add-form"')<index.indexOf('id="pantry-search"')&&
    index.indexOf('id="pantry-list"')<index.indexOf('id="nutrition-review-panel"')))
 fail('Keep the familiar pantry priority, add, search and stock order; nutrient research belongs below stock');

const pantryStyle=read('public/pantry-ui.css');
if((app.match(/window\.addEventListener\('mlk-state-applied'/g)||[]).length!==1)fail('App must apply each synced state exactly once');
if(!pantryController.includes("new CustomEvent('mlk-pantry-rendered')"))fail('Pantry controller must emit an explicit pantry rendered event');
if(!pantry.includes('export function installPantryUI'))fail('Pantry UI must expose explicit installation');
if(pantry.includes('MutationObserver'))fail('Pantry UI must not observe DOM mutations');
if(/setTimeout\(decorate/.test(pantry))fail('Pantry UI must not use delayed decoration retries');
if(pantry.includes('mlk-state-applied'))fail('Pantry UI should react to render completion, not raw state events');
if(pantry.includes('document.documentElement.dataset.access'))fail('Pantry UI must receive permission explicitly');
if(!bootstrap.includes("import { installPantryUI } from './pantry-ui.js")||!bootstrap.includes('installPantryUI({ owner });'))fail('Bootstrap must own pantry UI installation');
if(!bootstrap.includes('else if (owner)'))fail('Owner-only managers must remain behind verified owner session');
if(index.includes('<script src="./pantry-ui.js"'))fail('Pantry UI must not have a second HTML module entrypoint');
if(pantry.includes('open-history')||pantry.includes('history-open'))fail('Previous pantry must use its single native details summary instead of a duplicate opener');
if(!pantryStyle.includes('.pantry-selects{display:flex;justify-content:flex-start;align-items:center;gap:6px;flex-wrap:nowrap}'))fail('Pantry filters must stay content-width and compact instead of stretching into equal grid columns');
if(!pantryStyle.includes('.pantry-title-tools h2{display:flex;align-items:center;white-space:nowrap;flex:0 0 auto}'))fail('Pantry title and count must stay together on one line');
if(!pantryStyle.includes('.pantry-title-tools .pantry-copy-button,.pantry-title-tools .pantry-groups-toggle{font-size:10px'))fail('Mobile pantry header tools must not grow enough to wrap the title');
if(!index.includes('id="pantry-groups-toggle"'))fail('Pantry must expose a group collapse control');
if(!index.includes('id="pantry-priority"')||!index.includes('id="pantry-priority-list"'))fail('Pantry must provide a hidden static priority summary region');
if(!index.includes('id="stock-edit-priority" type="date"'))fail('Stock editor must expose an optional priority date input');
if(!index.includes('id="stock-added-info"'))fail('Stock editor must surface the automatic pantry addition date without asking for manual entry');
if(!index.includes('id="stock-sort"')||!index.includes('value="oldest"'))fail('Pantry must expose an oldest-held sort without adding date-entry burden');
if(!index.includes('id="pantry-priority-toggle"'))fail('Priority summary must expose a compact show-all control when needed');
if(!pantryStyle.includes('.pantry-priority{')||!pantryStyle.includes('.priority-item{'))fail('Pantry priority summary must have dedicated compact styles');
if(!pantryStyle.includes('.priority-item-row{display:flex')||!pantryStyle.includes('.priority-remove{'))fail('Priority pantry rows must reserve a compact quick-archive control without shrinking the stock-detail target');
if(!pantryCopy.includes('stock.priorityDate')||!pantryCopy.includes('소비 우선일 ${stock.priorityDate}'))fail('Pantry copy text must preserve a configured priority date');
if(!pantryCopy.includes('stock.addedAt')||!pantryCopy.includes('재고 추가일 ${addedAt}'))fail('Pantry copy text must include a truthful automatic addition date when one exists');
if(!pantryController.includes('data-pantry-group')||!pantryController.includes('collapsedGroups'))fail('Pantry groups must preserve local collapse state across renders');
if(!pantryController.includes('function render(refreshControls=true)'))fail('Pantry filters must have a lightweight render path');
if(!pantryController.includes('setTimeout(()=>render(false),140)'))fail('Pantry search must avoid rebuilding unrelated controls');
if(!stockEditor.includes("if(draftIndex<ingredientDrafts.length){\n     render();\n     open(ingredientDrafts[draftIndex].name,true);"))fail('Intermediate ingredient saves must render once before advancing to the next stock editor');
if(!stockEditor.includes("addedAt:isNewCycle?new Date().toISOString():(existing.addedAt||'')"))fail('New and restored pantry cycles must automatically receive an addition timestamp while edits preserve it');
if(!stockEditor.includes("$('pantry-search').value='';\n    $('stock-location').value='';\n    $('stock-status').value='';")||!stockEditor.includes("render();\n   $('stock-dialog').close();"))fail('Final ingredient save must clear pantry filters before its single full render');
if(stockEditor.includes("$('stock-status').value='';renderPantry();"))fail('Final ingredient save must not redraw the pantry a second time');
if(!pantryController.includes('renderHistory(stockFor);')||!pantryController.includes("window.dispatchEvent(new CustomEvent('mlk-pantry-rendered'))"))fail('Lightweight pantry renders must preserve decoration without rebuilding history');
if(!pantryController.includes('filtersActive=!!(search||location||status)'))fail('Pantry search and filters must force matching groups open');
const style=read('public/style.css');
if(!style.includes('.ingredient-group>summary')||!style.includes('.ingredient-group:not([open])'))fail('Collapsible pantry groups must have native details/summary styles');
console.log('Pantry render event architecture check passed.');
