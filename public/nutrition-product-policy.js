import * as VOCAB from './kitchen-vocabulary.js';
import {nutritionKey} from './nutrition.js';
import {productBrandPattern} from './nutrition-data.js';

// Product identity can be in a stock memo instead of the ingredient name.
// These names must never inherit a generic food's missing nutrients.
const productNames=new Set(VOCAB.productIdentityNames.map(nutritionKey));
const brands=productBrandPattern;

export function needsProductNutrition(name,notes=[]){
 return productNames.has(nutritionKey(name))||brands.test(name)||notes.some(note=>brands.test(note));
}
