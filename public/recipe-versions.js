// Authored serving versions share the existing menu ID and its rating.
const sourceEditIndexes=new WeakMap();

function editsForSource(edits,sourceId){
 let cached=sourceEditIndexes.get(edits);
 if(!cached){
  cached=new Map();
  for(const edit of edits){
   if(!cached.has(edit.sourceId))cached.set(edit.sourceId,[]);
   cached.get(edit.sourceId).push(edit);
  }
  sourceEditIndexes.set(edits,cached);
 }
 return cached.get(sourceId)||[];
}

export function withVersions(base,edits){
 const ownEdits=editsForSource(edits,base.id);
 const existingKeys=base.variants?new Set(base.variants.map(v=>v.key)):null;
 const labels=new Map(ownEdits.filter(edit=>edit.label).map(edit=>[edit.variantKey,edit.label]));
 const labelChanged=!!base.variants?.some(variant=>labels.has(variant.key)&&labels.get(variant.key)!==variant.label);
 const added=ownEdits.filter(edit=>edit.label&&!existingKeys?.has(edit.variantKey)&&edit.variantKey!=='base');
 if(!added.length&&!labelChanged)return base;
 const variants=(base.variants||[{...base,key:'base',label:base.variantLabel||'기본 기록',original:'',userVariant:true}]).map(variant=>labels.has(variant.key)?{...variant,label:labels.get(variant.key)}:variant);
 return {...base,variants:[...variants,...added.map(e=>({...e.recipe,key:e.variantKey,label:e.label,original:'',userVariant:true}))]};
}
