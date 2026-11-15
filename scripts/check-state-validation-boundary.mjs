import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

const app=fs.readFileSync('public/app.js','utf8');
const validation=fs.readFileSync('public/state-validation.js','utf8');
const kitchenState=fs.existsSync('public/kitchen-state.js')?fs.readFileSync('public/kitchen-state.js','utf8'):'';
const stateOwner=kitchenState||app;

function assert(condition,message){if(!condition)throw new Error(message);}

for(const file of ['public/app.js','public/state-validation.js',...(kitchenState?['public/kitchen-state.js']:[])]){
 execFileSync(process.execPath,['--check',file],{stdio:'inherit'});
}

assert(stateOwner.includes("from './state-validation.js"),'Persisted-state owner must import the state validation module');
if(kitchenState){
 assert(app.includes("from './kitchen-state.js"),'app.js must delegate persisted-state validation to kitchen-state.js');
 assert(!app.includes("from './state-validation.js"),'app.js must not re-own persisted-state validation after delegation');
}
assert(app.includes('let storageOK=true,migrated=false,compactedLibrary=false,unreadableState=null,historySeeded=false,pantryGroupsMigrated=false,recipeCategoriesMigrated=false;'),'app.js must keep state persistence and taxonomy-migration flags declared');
assert(stateOwner.includes('hidden:validateHidden(d.hidden||[],builtInRecipes)'),'State loading must validate hidden sources against the active recipe library');
assert(stateOwner.includes('trashPurged:validateHidden(d.trashPurged||[],builtInRecipes)'),'State loading must validate purged sources against the active recipe library');
assert(stateOwner.includes('trashPurgedVariants:validatePurgedVariants(d.trashPurgedVariants||[],builtInRecipes)'),'State loading must validate permanently deleted variants against the active recipe library');
assert(stateOwner.includes('cookingHistory=validateCookingHistory(d.cookingHistory,d.lastCooked||{})'),'State loading must migrate legacy recent cooking timestamps into cumulative history');
assert(stateOwner.includes('lastCooked=latestCookedMap(cookingHistory)'),'State loading must derive the latest cooking timestamp from cumulative history');
assert(app.includes('cookingHistory=state.cookingHistory||{}'),'Runtime state must retain validated cumulative cooking history');
assert(validation.includes('const priorityDate=validatePriorityDate(v.priorityDate)'),'Stock validation must normalize the optional pantry priority date');
assert(validation.includes('...(priorityDate?{priorityDate}:{})'),'Empty priority dates must not be persisted into stock overrides');
assert(validation.includes("addedAt=validateTimestamp(v.addedAt,'식재료 추가 시각을 확인해 주세요.')"),'Stock validation must preserve valid automatic pantry addition timestamps');
assert(validation.includes('...(addedAt?{addedAt}:{})'),'Missing pantry addition dates must remain absent instead of being invented');

for(const localDefinition of [
 'function validText(',
 'function validateItems(',
 'function validateRecipe(',
 'function validateCustom(',
 'function validatePriorityDate(',
 'function validateStock(',
 'function validateEdits(',
 'function validateHidden(',
 'function validateHiddenVariants(',
 'function validatePurgedVariants(',
 'function validateIngredientHistory(',
 'function validateLastCooked(',
 'function validateCookingHistory(',
 'const statusNames=',
 'const legacyHashes='
]){
 assert(!app.includes(localDefinition),`app.js must not redefine extracted state validation helper: ${localDefinition}`);
 if(kitchenState)assert(!kitchenState.includes(localDefinition),`kitchen-state.js must reuse state-validation.js instead of redefining helper: ${localDefinition}`);
}

for(const exportedHelper of [
 'export const statusNames=',
 'export const legacyHashes=',
 'export function validText(',
 'export function validateItems(',
 'export function validateRecipe(',
 'export function validateCustom(',
 'export function validatePriorityDate(',
 'export function validateStock(',
 'export function validateEdits(',
 'export function validateHidden(',
 'export const variantStateKey=',
 'export function validateHiddenVariants(',
 'export function validatePurgedVariants(',
 'export function validateIngredientHistory(',
 'export function validateLastCooked(',
 'export function validateCookingHistory('
]){
 assert(validation.includes(exportedHelper),`state-validation.js is missing: ${exportedHelper}`);
}

console.log('State validation module boundary is explicit and syntactically valid.');
