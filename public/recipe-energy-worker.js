import {recipeEnergyLabel} from './nutrition-ui.js';
import {createNutritionResolver} from './nutrition-resolver.js';

// Same-origin browser worker. Compute display-only energy labels without
// blocking the recipe grid, input events or the main browser thread.
// All user context stays in this local worker; there are no save/API calls.
let latestRevision=0;

self.onmessage=({data})=>{
 const {revision,recipes,context}=data||{};
 if(!Number.isSafeInteger(revision)||!Array.isArray(recipes)||recipes.length>128||
    !context||typeof context!=='object')return;
 latestRevision=revision;
 let resolver;
 try{resolver=createNutritionResolver(context);}
 catch{self.postMessage({revision,error:true});return;}
 const labels=[];
 let index=0;
 const work=()=>{
  if(revision!==latestRevision)return; // A newer search/tab won the race.
  try{
   for(let n=0;n<2&&index<recipes.length;n++,index++){
    labels.push(recipeEnergyLabel(recipes[index],context,resolver));
   }
  }catch{self.postMessage({revision,error:true});return;}
  if(index<recipes.length)setTimeout(work,0);
  else self.postMessage({revision,labels});
 };
 setTimeout(work,0);
};
