// Product-specific identity, evidence and recipe-parsing rules. The private
// deployment repository carries the rules for its own pantry and recipe notes;
// this shared version has the same exports and applies no rules.

export function preferredDrainedAmountInStep(){return null;}
export function drainedCanProduct(){return null;}
export function sourceSalinityPercent(){return null;}
export function sourcePackRule(){return null;}
export const quantityWarningExtras=[];
export const headingNameRewrites=[];

export function createProductRules(){
 return {
  noteProductKey:()=>undefined,
  preparedNutritionFor:()=>null,
  sourceSpecificNutritionFor:()=>null,
  blocksStockProduct:()=>false,
  bridgeHeldProduct:raw=>raw,
  singleHeldVariant:()=>null,
  managedMeasuredBridge:()=>false,
  legacyPastaProducts:[],
  quantityWarningOnly:{}
 };
}
