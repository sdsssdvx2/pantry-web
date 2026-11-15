import * as VOCAB from './kitchen-vocabulary.js';
import {migrateRecipeGroupMeta,validateRecipeGroupMeta} from './recipe-group-meta.js';
import {validateRatings} from './ratings.js';
import {validateCuration,validateLibrary} from './backup-validation.js?v=20260919-1';
import {isKnownLegacySeedLibrary,sameRecipeLibrary} from './library-identity.js';
import {hash,legacyFingerprint,legacyHashes,validText,validateCookingHistory,validateCustom,validateEdits,validateHidden,validateHiddenVariants,validatePurgedVariants,validateIngredientHistory,validateItems,validateRecipe,validateStock} from './state-validation.js?v=20260919-5';
import {latestCookedMap} from './cooking-history.js';
import {PANTRY_GROUP_VERSION,migratePantryStockGroups} from './pantry-groups.js?v=20260919-2';
import {RECIPE_CATEGORY_VERSION,migrateRecipeCategoryEdits} from './recipe-categories.js?v=20260919-2';
import {migratePromotedGrainState} from './recipe-content-migrations.js?v=20261016-1';
import {createInitialIngredientDetectionRules,normalizeIngredientDetectionRules} from './ingredient-detection.js?v=20261018-2';

const legacyIngredientHistorySeed=VOCAB.legacyIngredientHistorySeed;

const detectionSeedNames=(items,history,stock)=>[...items,...history.map(item=>item.name),...Object.keys(stock||{})];

export const createKitchenDefaults=initialPantry=>({
 items:[...initialPantry],custom:[],stock:{},history:[],ingredientDetectionRules:createInitialIngredientDetectionRules(initialPantry),historySeedVersion:0,pantryGroupVersion:PANTRY_GROUP_VERSION,recipeCategoryVersion:RECIPE_CATEGORY_VERSION,edits:[],recipeGroupMeta:{},hidden:[],hiddenVariants:[],trashPurgedVariants:[],trashPurged:[],ratings:{},cookingHistory:{},lastCooked:{},curation:null
});

export function loadKitchenState({readRaw,initialPantry,seedRecipes,canSave=false,backupLegacyRaw=()=>{}}){
 let builtInRecipes=seedRecipes,restoredLibrary=null,compactedLibrary=false,migrated=false,pantryGroupsMigrated=false,recipeCategoriesMigrated=false,unreadableState=null,storageOK=true,raw=null;
 const bundle=state=>({state,builtInRecipes,restoredLibrary,compactedLibrary,migrated,pantryGroupsMigrated,recipeCategoriesMigrated,unreadableState,storageOK});
 try{
  raw=readRaw();
  if(!raw)return bundle(createKitchenDefaults(initialPantry));
  const d=JSON.parse(raw);
  if(![1,2].includes(d.version))throw Error();
  let legacyCuration=null;
  if(d.library){
   const library=validateLibrary(d.library,validText,validateRecipe,seedRecipes);
   if(sameRecipeLibrary(library.recipes,seedRecipes)||isKnownLegacySeedLibrary(library.recipes,seedRecipes)){
    legacyCuration=library.curation;
    compactedLibrary=true;
   }else{
    restoredLibrary=library;
    builtInRecipes=library.recipes;
   }
  }
  const savedCuration=d.curation===undefined?legacyCuration:validateCuration(d.curation,validText);
  const validatedCustom=validateCustom(d.recipes||[]);
  const editMigration=migrateRecipeCategoryEdits(validateEdits(d.edits||[],builtInRecipes,validatedCustom),Number.isInteger(d.recipeCategoryVersion)?d.recipeCategoryVersion:1);
  let cookingHistory=validateCookingHistory(d.cookingHistory,d.lastCooked||{});
  const contentMigration=migratePromotedGrainState({
   custom:validatedCustom,
   edits:editMigration.edits,
   ratings:validateRatings(d.ratings||{}),
   cookingHistory
  });
  const custom=contentMigration.custom,edits=contentMigration.edits,ratings=contentMigration.ratings;
  cookingHistory=contentMigration.cookingHistory;
  recipeCategoriesMigrated=editMigration.changed||contentMigration.changed;
  const recipeGroupMeta=migrateRecipeGroupMeta(validateRecipeGroupMeta(d.recipeGroupMeta||{},validText),[...builtInRecipes,...custom],edits);
  const lastCooked=latestCookedMap(cookingHistory);
  if(d.version===1){
   if(canSave)backupLegacyRaw(raw);
   migrated=true;
   const defaults=createKitchenDefaults(initialPantry),history=validateIngredientHistory(d.history||[]);
   const ingredientDetectionRules=d.ingredientDetectionRules===undefined?createInitialIngredientDetectionRules(detectionSeedNames(defaults.items,history,defaults.stock)):normalizeIngredientDetectionRules(d.ingredientDetectionRules);
   return bundle({...defaults,custom:custom.filter(r=>!legacyHashes.has(hash(legacyFingerprint(d.recipes.find(x=>x.id===r.id))))),history,ingredientDetectionRules,historySeedVersion:Number.isInteger(d.historySeedVersion)?d.historySeedVersion:0,recipeCategoryVersion:editMigration.version,edits,recipeGroupMeta,hidden:validateHidden(d.hidden||[],builtInRecipes),hiddenVariants:validateHiddenVariants(d.hiddenVariants||[],builtInRecipes,edits,custom),trashPurgedVariants:validatePurgedVariants(d.trashPurgedVariants||[],builtInRecipes),trashPurged:validateHidden(d.trashPurged||[],builtInRecipes),ratings,cookingHistory,lastCooked,curation:savedCuration});
  }
  const items=validateItems(d.items),history=validateIngredientHistory(d.history||[]),stockMigration=migratePantryStockGroups(validateStock(d.stock||{}),Number.isInteger(d.pantryGroupVersion)?d.pantryGroupVersion:1);
  pantryGroupsMigrated=stockMigration.changed;
  const ingredientDetectionRules=d.ingredientDetectionRules===undefined?createInitialIngredientDetectionRules(detectionSeedNames(items,history,stockMigration.stock)):normalizeIngredientDetectionRules(d.ingredientDetectionRules);
  return bundle({items,custom,stock:stockMigration.stock,history,ingredientDetectionRules,historySeedVersion:Number.isInteger(d.historySeedVersion)?d.historySeedVersion:0,pantryGroupVersion:stockMigration.version,recipeCategoryVersion:editMigration.version,edits,recipeGroupMeta,hidden:validateHidden(d.hidden||[],builtInRecipes),hiddenVariants:validateHiddenVariants(d.hiddenVariants||[],builtInRecipes,edits,custom),trashPurgedVariants:validatePurgedVariants(d.trashPurgedVariants||[],builtInRecipes),trashPurged:validateHidden(d.trashPurged||[],builtInRecipes),ratings,cookingHistory,lastCooked,curation:savedCuration});
 }catch{
  storageOK=false;
  try{unreadableState=raw??readRaw();}catch{}
  builtInRecipes=seedRecipes;
  restoredLibrary=null;
  return bundle(createKitchenDefaults(initialPantry));
 }
}

export function applyLegacyIngredientHistorySeed({pantry,stockOverrides,ingredientHistory,historySeedVersion}){
 if(historySeedVersion>=1)return {pantry,stockOverrides,ingredientHistory,historySeedVersion,changed:false};
 const history=[...ingredientHistory];
 let stock=stockOverrides;
 for(const [name,group,notes] of legacyIngredientHistorySeed){
  if(pantry.includes(name)||history.some(item=>item.name===name))continue;
  history.push({name,archivedAt:''});
  if(!Object.hasOwn(stock,name))stock={...stock,[name]:{group,status:'available',locations:[],notes}};
 }
 return {pantry,stockOverrides:stock,ingredientHistory:history,historySeedVersion:1,changed:true};
}

export function buildKitchenSnapshot({seedRevision,pantry,customRecipes,stockOverrides,ingredientHistory,ingredientDetectionRules,historySeedVersion,pantryGroupVersion=PANTRY_GROUP_VERSION,recipeCategoryVersion=RECIPE_CATEGORY_VERSION,sourceEdits,recipeGroupMeta,hiddenSources,hiddenVariants,purgedVariants,purgedSources,ratings,cookingHistory,curationOverride,restoredLibrary}){
 const lastCooked=latestCookedMap(cookingHistory);
 return {version:2,seedRevision,items:pantry,recipes:customRecipes,stock:stockOverrides,history:ingredientHistory,ingredientDetectionRules:normalizeIngredientDetectionRules(ingredientDetectionRules||[]),historySeedVersion,pantryGroupVersion,recipeCategoryVersion,edits:sourceEdits,recipeGroupMeta,hidden:hiddenSources,hiddenVariants,trashPurgedVariants:purgedVariants,trashPurged:purgedSources,ratings,cookingHistory,lastCooked,...(curationOverride!==null?{curation:curationOverride}:{}),...(restoredLibrary?{library:restoredLibrary}:{})};
}
