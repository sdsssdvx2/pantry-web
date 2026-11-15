function sortedUnique(values=[]){
 return [...new Set(values.filter(Boolean))].sort((a,b)=>Date.parse(b)-Date.parse(a));
}

export function latestCookedAt(history={},recipeId=''){
 const value=history?.[recipeId];
 return Array.isArray(value)&&value.length?value[0]:'';
}

export function latestCookedMap(history={}){
 const result={};
 for(const [id,values] of Object.entries(history||{})){
  const latest=Array.isArray(values)&&values.length?values[0]:'';
  if(latest)result[id]=latest;
 }
 return result;
}

export function cookingCount(history={},recipeId=''){
 return Array.isArray(history?.[recipeId])?history[recipeId].length:0;
}

export function addCookingRecord(history={},recipeId='',at=new Date().toISOString()){
 const iso=new Date(at).toISOString();
 const next={...(history||{})};
 next[recipeId]=sortedUnique([iso,...(Array.isArray(next[recipeId])?next[recipeId]:[])]);
 return next;
}

export function removeCookingRecord(history={},recipeId='',at=''){
 const next={...(history||{})};
 const values=(Array.isArray(next[recipeId])?next[recipeId]:[]).filter(value=>value!==at);
 if(values.length)next[recipeId]=values;else delete next[recipeId];
 return next;
}

export function replaceCookingRecord(history={},recipeId='',previousAt='',nextAt=''){
 const without=removeCookingRecord(history,recipeId,previousAt);
 return addCookingRecord(without,recipeId,nextAt);
}

export function mergeCookingHistory(...sources){
 const merged={};
 for(const source of sources){
  for(const [id,values] of Object.entries(source||{})){
   merged[id]=sortedUnique([...(merged[id]||[]),...(Array.isArray(values)?values:[])]);
  }
 }
 return merged;
}
