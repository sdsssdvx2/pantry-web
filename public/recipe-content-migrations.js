// These three were temporary custom copies made immediately before the recipes were
// promoted into the built-in library. They are safe to collapse into the promoted ids.
const legacyCustomTargets=new Map([
 ['user-7c3745ac-a86c-4fea-bc7b-d44ae31ec69b','source-grain-20261016-01'],
 ['user-807e8d6e-c7df-4699-b821-3189d47cf5c5','source-grain-20261016-04'],
 ['user-4c5ebc16-e24e-454c-8855-19acf89ffab6','source-grain-20261016-06'],
]);

const uniqueTimes=values=>[...new Set((values||[]).filter(value=>Number.isFinite(Date.parse(value))))].sort((a,b)=>Date.parse(b)-Date.parse(a));

export function migratePromotedGrainState({custom=[],edits=[],ratings={},cookingHistory={}}={}){
 let changed=false;

 // The historical source-edit cleanup has already run. Keep later owner edits.
 const nextEdits=edits;

 const removedCustomIds=[];
 const nextCustom=custom.filter(recipe=>{
  const remove=legacyCustomTargets.has(recipe?.id);
  if(remove){changed=true;removedCustomIds.push(recipe.id);}
  return !remove;
 });

 if(!removedCustomIds.length)return {custom:nextCustom,edits:nextEdits,ratings,cookingHistory,changed};

 const nextRatings={...ratings};
 const nextCookingHistory={...cookingHistory};
 for(const oldId of removedCustomIds){
  const targetId=legacyCustomTargets.get(oldId);
  const oldRating=Number(nextRatings[oldId])||0;
  if(oldRating>0&&!(Number(nextRatings[targetId])>0))nextRatings[targetId]=oldRating;
  delete nextRatings[oldId];

  const merged=uniqueTimes([...(nextCookingHistory[targetId]||[]),...(nextCookingHistory[oldId]||[])]);
  if(merged.length)nextCookingHistory[targetId]=merged;
  delete nextCookingHistory[oldId];
 }

 return {custom:nextCustom,edits:nextEdits,ratings:nextRatings,cookingHistory:nextCookingHistory,changed};
}

