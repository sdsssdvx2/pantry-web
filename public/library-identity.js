function sameValue(left,right){
  if(left===right) return true;
  if(Array.isArray(left)||Array.isArray(right)){
    if(!Array.isArray(left)||!Array.isArray(right)||left.length!==right.length) return false;
    for(let i=0;i<left.length;i+=1) if(!sameValue(left[i],right[i])) return false;
    return true;
  }
  if(!left||!right||typeof left!=='object'||typeof right!=='object') return false;
  const leftKeys=Object.keys(left).sort(),rightKeys=Object.keys(right).sort();
  if(leftKeys.length!==rightKeys.length) return false;
  for(let i=0;i<leftKeys.length;i+=1){
    if(leftKeys[i]!==rightKeys[i]||!sameValue(left[leftKeys[i]],right[rightKeys[i]])) return false;
  }
  return true;
}

export function sameRecipeLibrary(left,right){
  return Array.isArray(left)&&Array.isArray(right)&&sameValue(left,right);
}

const legacyHiddenIds=new Set(['source-note-3','source-note-15','source-note-46']);

function normalizeKnownLegacyRecipe(stored,current){
  if(!stored||!current||stored.id!==current.id)return stored;
  if(stored.id==='source-53'){
    if(!Array.isArray(stored.variants)||!Array.isArray(current.variants)||!stored.variants.length||!current.variants.length)return stored;
    return {...stored,variants:stored.variants.map((variant,index)=>index===0?{...variant,label:current.variants[0].label}:variant)};
  }
  if(legacyHiddenIds.has(stored.id)){
    if(!Object.hasOwn(current,'internalHidden'))return stored;
    return {...stored,internalHidden:current.internalHidden};
  }
  if(stored.id==='source-note-173'){
    if(!Array.isArray(current.required))return stored;
    const normalized={...stored,required:[...current.required]};
    if(Array.isArray(stored.variants)&&Array.isArray(current.variants)&&stored.variants.length===current.variants.length){
      normalized.variants=stored.variants.map((variant,index)=>{
        const currentVariant=current.variants[index];
        if(!variant||!currentVariant||variant.key!==currentVariant.key||!Array.isArray(currentVariant.required))return variant;
        return {...variant,required:[...currentVariant.required]};
      });
    }
    return normalized;
  }
  return stored;
}

// A pre-cleanup app release persisted the then-current built-in library whenever
// cooking notes changed. Recognize only that exact known stale shape. Every other
// field must still match the deployed seed, so genuinely restored libraries remain pinned.
export function isKnownLegacySeedLibrary(stored,seed){
  if(!Array.isArray(stored)||!Array.isArray(seed)||stored.length!==seed.length)return false;
  for(let i=0;i<stored.length;i+=1){
    if(stored[i]?.id!==seed[i]?.id)return false;
    if(sameValue(stored[i],seed[i]))continue;
    if(!sameValue(normalizeKnownLegacyRecipe(stored[i],seed[i]),seed[i]))return false;
  }
  return true;
}
