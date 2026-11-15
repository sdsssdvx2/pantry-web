import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const fail=message=>{throw new Error(message);};
const expect=(condition,message)=>{if(!condition)fail(message);};

const app=read('public/app.js');
const model=read('public/recipe-model.js');
const versions=read('public/recipe-versions.js');

expect(app.includes("import {createRecipeModel} from './recipe-model.js"),'app.js must import the extracted recipe model');
expect(app.includes('const recipeModel=createRecipeModel(()=>({builtInRecipes,customRecipes,sourceEdits,recipeGroupMeta,hiddenSources,hiddenVariants,purgedVariants,ratings,pantry,stockOverrides,cookingHistory,selectedVariants,filters}));'),'app.js must provide live recipe and cooking-history state through the model context getter');
expect(app.includes('const {allRecipes,isGroupedRecipe,evaluate,evaluationSnapshot,filteredBase,visibleRecipes}=recipeModel;'),'app.js must use the recipe model public boundary');

for(const local of [
 'function visibleVersionedRecipe(',
 'function allRecipes(',
 'function isGroupedRecipe(',
 'function matchVariant(',
 'function evaluate(',
 'function matchesCategories(',
 'function queryMatches(',
 'function filteredBase(',
 'function sourceChronologyRank(',
 'function recentModifiedRank(',
 'function visibleRecipes('
])expect(!app.includes(local),`Recipe model logic must not return to app.js: ${local}`);

for(const dependency of [
 "from './recipe-versions.js'",
 'applyRecipeGroupMeta',
 'matchIngredient',
 'matchesRating',
 'createSearchMatcher',
 'variantStateKey',
 'cookingCount',
 'latestCookedAt',
 'const recentIndexes=filters.sort===\'recent\'?recentSortIndexes(c):null;',
 "filters.sort==='cooked'",
 "filters.sort==='popular'"
])expect(model.includes(dependency),`recipe-model.js is missing required model behavior: ${dependency}`);

expect(model.includes('export function createRecipeModel(getContext)'),'recipe-model.js must expose a context-driven model factory');
expect(model.includes('const value=getContext();'),'Recipe model must read current app state on each operation');
expect(model.includes('const composeVariantWith=(base,v,c)=>{'),'Recipe model must separate searchable recipe composition from pantry availability matching');
expect(model.includes('const sourceEditIndexes=new WeakMap();'),'Recipe model must cache source-edit indexes by sourceEdits array identity');
expect(versions.includes('const sourceEditIndexes=new WeakMap();'),'Recipe version merging must cache edits by sourceEdits array identity');
expect(versions.includes('cached.get(edit.sourceId).push(edit);'),'Recipe version merging must group source edits once by recipe id');
expect(versions.includes('const existingKeys=base.variants?new Set(base.variants.map(v=>v.key)):null;'),'Recipe version merging must pre-index existing variant keys');
expect(!versions.includes('edits.filter(e=>e.sourceId===base.id'),'Recipe version merging must not rescan every source edit for each recipe');
expect(model.includes('if(!variants.has(edit.variantKey))variants.set(edit.variantKey,edit);'),'Source-edit indexing must preserve the first matching edit like Array.find');
expect(model.includes('const edit=sourceEditIndex(c.sourceEdits).get(base.id)?.get(v?.key);'),'Variant composition must use the indexed source edit lookup');
expect(!model.includes('c.sourceEdits.find('),'Variant composition must not rescan all source edits for every recipe variant');
expect(model.includes('const matchRecipeIngredientsWith=(r,c)=>{'),'Recipe model must keep ingredient availability matching behind an explicit boundary');
expect(model.includes('const evaluationSnapshotWith=c=>{'),'Recipe model must cache full availability evaluation independently of display filters');
expect(model.includes('const recentSortIndexes=c=>{'),'Recent sorting must index edit/custom metadata once per sort pass');
expect(model.includes('const edits=new Map();'),'Recent sorting must use an edit lookup map instead of rescanning source edits per recipe');
expect(model.includes('customIndex:new Map(c.customRecipes.map((recipe,index)=>[recipe.id,index]))'),'Recent sorting must pre-index custom recipe order');
expect(!model.includes('c.sourceEdits.forEach((edit,index)=>{if(edit.sourceId===r.id)'),'Recent sorting must not scan every edit separately for each recipe');
expect(model.includes('if(evaluationStateMatches(evaluationCache,c,selectedKey))return evaluationCache.value;'),'Recipe model must reuse availability evaluation while kitchen state is unchanged');
expect(model.includes('cached.stockOverrides===c.stockOverrides'),'Evaluation cache must invalidate when stock metadata changes');
expect(model.includes('cached.purgedVariants===c.purgedVariants'),'Evaluation cache must invalidate when permanent variant deletion state changes');
expect(model.includes("!(c.purgedVariants||[]).includes(key)"),'Permanently deleted recipe variants must stay out of visible version lists');
expect(model.includes('cached.selectedKey===selectedKey'),'Evaluation cache must notice selected-variant changes even when the selectedVariants object is mutated in place');
expect(!model.includes('cached.filters===c.filters'),'Display filter changes must not invalidate the expensive availability cache');
expect(!model.includes('filters.onlyCustom'),'Recipe model must not retain the redundant direct-add filter');
expect(model.includes('const {filters}=c,q=filters.query.trim(),matchSearch=q?createSearchMatcher(q):null'),'Recipe search must parse the current query once per filter pass');
expect(model.includes('if(!matchSearch)return true;'),'Recipe search helper must guard the matcher it actually receives');
expect(!model.includes('if(!q)return true;'),'Recipe search helper must not reference an out-of-scope query variable');
expect(model.includes('const matched=candidates.filter(r=>passes(r)&&queryMatches(r,matchSearch,filters))'),'Search must reject text/filter misses before any extra ingredient availability work');
expect(model.includes('evaluated?.variantKey===r.variantKey?evaluated:matchRecipeIngredientsWith(r,c)'),'Search must reuse the already-evaluated variant and independently match other variants');
expect(model.includes('includedCategories=new Set(Object.keys(filters.categories).filter(key=>filters.categories[key]===1))'),'Category inclusion filters must be indexed once per filter pass');
expect(model.includes("const cookingRanks=['cooked','popular'].includes(filters.sort)?new Map(list.map"),'Cooking sort metadata must be indexed once before sorting');
expect(!model.includes('const cookedRank=id=>Date.parse('),'Cooking sort comparators must not repeatedly parse the same latest-cooked timestamps');
expect(!model.includes('const variants=base.variants?.length?base.variants.map(v=>matchVariantWith(base,v,c))'),'Search must not rematch pantry availability for every candidate variant before text filtering');
expect(!model.includes('document.'),'Recipe model must remain DOM-independent');
expect(!model.includes("getElementById"),'Recipe model must remain DOM-independent');

console.log('Recipe model boundary check passed.');
