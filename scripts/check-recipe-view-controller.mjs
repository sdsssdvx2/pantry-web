import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const fail=message=>{throw new Error(message);};
const expect=(condition,message)=>{if(!condition)fail(message);};

const app=read('public/app.js');
const view=read('public/recipe-view-controller.js');
const ratingController=read('public/rating-controller.js');

expect(app.includes("import {installRecipeViewController} from './recipe-view-controller.js"),'app.js must import the recipe view controller');
expect(app.includes('const recipeView=installRecipeViewController({'),'app.js must install one recipe view controller');
expect(app.includes('showRecipe:recipeView.showRecipe'),'Editors and dialog must receive recipe view navigation through the controller');
expect(app.includes('copyRecipeToClipboard:recipeView.copyRecipeToClipboard'),'Recipe browser/dialog copy actions must use the recipe view controller');
expect(app.includes('refreshRelated:recipeView.refreshRelated'),'Recipe browser must use the recipe view related-index boundary');
expect(app.includes('relatedIds:recipeView.relatedIds'),'Recipe browser must use controller related ids');
expect(app.includes('recipeView.showRecipe(activeRecipe,false,true)'),'Global rerenders must restore open recipe detail through the view controller');
expect(ratingController.includes('active();'),'Rating refresh must resolve the active detail through the injected recipe view boundary');
expect(app.includes('if(recipeWasOpen&&!recipeView.active())recipeView.closeRecipe();'),'External state application must close invalid detail through the view controller');

expect(view.includes("import {cookingBody,recipeCopyText,recipeDetailHTML,cookModeHTML} from './recipe-display.js"),'Recipe view must own detail/cook display orchestration');
expect(view.includes("import {getStock,matchIngredient} from './data.js"),'Recipe view must own detail availability preparation');
expect(view.includes("import {copyText} from './clipboard.js';"),'Recipe view must own recipe-copy delivery');
expect(view.includes('export function installRecipeViewController'),'Recipe view controller must expose explicit installation');
expect(view.includes('function refreshRelated('),'Recipe view must own related recipe indexing');
expect(view.includes('relatedSource=null'),'Recipe view must remember the source array used for the related index');
expect(view.includes('if(evaluated===relatedSource)return;'),'Recipe view must skip rebuilding related links for the same evaluated snapshot');
expect(view.includes('relatedSource=evaluated;'),'Recipe view must replace the related-index source when evaluation state changes');
expect(view.includes('refreshRelated(evaluated=evaluationSnapshot().evaluated)'), 'Detail navigation must reuse the current availability snapshot');
expect(view.includes('refreshRelated();'),'Opening a recipe must still request a fresh related index from current model state');

expect(view.includes('function recipeContextHTML('),'Recipe view must own related/pairing detail context assembly');
expect(view.includes('function active(){'),'Recipe view must own active recipe evaluation');
expect(view.includes('function recipeCookingText('),'Recipe view must own detail cooking-text preparation');
expect(view.includes("return base?evaluate(base).name:'';"),'Copied related-recipe names must use the same evaluated edited name as the detail link');
expect(view.includes('async function copyRecipeToClipboard('),'Recipe view must own recipe copy flow');
expect(view.includes('function showRecipe('),'Recipe view must own recipe detail rendering');
expect(view.includes('innerHTML=recipeDetailHTML({recipe,base,random'),'Recipe view must delegate detail markup to recipeDetailHTML');
expect(view.includes('function showCookMode(){'),'Recipe view must own focused cooking rendering');
expect(view.includes('innerHTML=cookModeHTML(recipe,text,{canRecordCooked:!!canRecordCooked()})'),'Recipe view must delegate focused cooking markup to cookModeHTML with explicit write capability');
expect(view.includes("$('recipe-dialog').addEventListener('close'"),'Recipe view must own cross-view focus restoration');

for(const stale of [
 'let relatedIndex=new Map();',
 'function refreshRelated(',
 'function relatedIds(',
 'function recipeContextHTML(',
 'function active(){',
 'function recipeRawBody(',
 'function recipeRelatedNames(',
 'function recipeCookingText(',
 'async function copyRecipeToClipboard(',
 'function showRecipe(',
 'function showCookMode(){',
 'function closeRecipe(){',
 "$('recipe-dialog').addEventListener('close'"
])expect(!app.includes(stale),`Recipe view behavior must not remain in app.js: ${stale}`);

console.log('Recipe view controller boundary check passed.');
