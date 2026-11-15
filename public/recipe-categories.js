import * as VOCAB from './kitchen-vocabulary.js';
export const RECIPE_CATEGORY_VERSION=2;

export const categories=[
 ['all','전체'],
 ['noodles','면·파스타'],
 ['rice','밥'],
 ['bread','빵'],
 ['main','고기·해산물'],
 ['soup','국·수프'],
 ['side','곁들임'],
 ['snack','간식'],
 ['sauce','소스'],
 ['drink','음료·디저트']
];


const legacyCategoryTransitions=new Map([
 ['source-285',{from:['snack'],to:'bread'}],
 ['source-287',{from:['snack'],to:'side'}],
 ['source-273',{from:['snack'],to:'main'}],
 ['source-274',{from:['snack'],to:'main'}],
 ['source-257',{from:['snack'],to:'main'}],
 ['source-34',{from:['snack'],to:'main'}],
 ['source-96',{from:['snack'],to:'main'}],
 ['source-205',{from:['main'],to:'side'}],
 ['source-253',{from:['snack'],to:'main'}],
 ['source-272',{from:['noodles'],to:'snack'}],
 ['source-152',{from:['snack'],to:'side'}],
 ['source-187',{from:['snack'],to:'bread'}],
 ['source-188',{from:['snack'],to:'bread'}],
 ['source-189',{from:['snack'],to:'bread'}],
 ['source-102',{from:['snack'],to:'bread'}],
 ['source-99',{from:['snack'],to:'bread'}],
 ['source-51',{from:['main'],to:'side'}],
 ['source-53',{from:['main'],to:'side'}],
 ['source-186-1',{from:['snack'],to:'drink'}],
 ['source-186-2',{from:['snack'],to:'drink'}],
 ['source-note-27',{from:['snack'],to:'drink'}],
 ['source-note-36',{from:['snack'],to:'drink'}],
 ['source-note-39',{from:['snack'],to:'bread'}],
 ['source-note-40',{from:['snack'],to:'bread'}],
 ['source-note-42',{from:['snack'],to:'bread'}],
 ['source-note-104',{from:['snack'],to:'drink'}],
 ['source-note-105',{from:['snack'],to:'bread'}],
 ['source-note-107',{from:['snack'],to:'drink'}],
 ['source-note-122',{from:['snack'],to:'drink'}],
 ['source-note-168',{from:['main','snack'],to:'rice'}],
 ['source-note-173',{from:['snack'],to:'drink'}],
 ['source-note-185',{from:['snack'],to:'drink'}],
 ['source-note-190-1',{from:['snack'],to:'bread'}],
 ['source-note-190-2',{from:['snack'],to:'bread'}],
 ['source-note-190-3',{from:['snack'],to:'bread'}],
 ['source-note-191',{from:['snack'],to:'bread'}],
 ['source-note-192',{from:['snack'],to:'bread'}],
 ['source-note-222',{from:['snack'],to:'main'}],
 ['source-note-246',{from:['main'],to:'rice'}],
]);

export function migrateRecipeCategoryEdits(edits=[],version=1){
 if(version>=RECIPE_CATEGORY_VERSION)return {edits,version,changed:false};
 let changed=false;
 const next=edits.map(edit=>{
  const transition=legacyCategoryTransitions.get(edit?.sourceId),category=edit?.recipe?.category;
  if(!transition||!transition.from.includes(category))return edit;
  changed=true;
  return {...edit,recipe:{...edit.recipe,category:transition.to}};
 });
 return {edits:next,version:RECIPE_CATEGORY_VERSION,changed:true};
}

const clean=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
const hasAny=(value,terms)=>terms.some(term=>value.includes(term));

export function inferRecipeCategory(recipe={},fallback='side'){
 const name=clean(recipe.name);
 const required=clean(Array.isArray(recipe.required)?recipe.required.join(' '):recipe.required);
 if(!name)return fallback;

 // Explicit sauces win unless the title clearly names a complete dish.
 const sauceTitle=/소스(?:\s*[·(]|$)/.test(name)||hasAny(name,VOCAB.recipeSauceTitleWords)||/용 .*간장/.test(name);
 if(sauceTitle)return 'sauce';
 if(hasAny(name,['계란찜','달걀찜']))return 'side';

 // Sweet breads and plated sweets belong with desserts, not the bread meal category.
 if(hasAny(name,VOCAB.recipeDrinkWords))return 'drink';

 if(/소바(?!바)/.test(name)||hasAny(name,VOCAB.recipeNoodleWords))return 'noodles';
 if(hasAny(name,['덮밥','볶음밥','초밥','유부초밥','카츠동','카레','노른자밥']))return 'rice';
 if(hasAny(name,['샌드위치','치아바타','바게트','베이글','브루스케타','카나페','피자','소시지빵','식빵','토스트','마늘빵','빠네','빵']))return 'bread';
 if(hasAny(name,['수프','포타주','어묵탕','육개장','김치찌개','계란국','콩국']))return 'soup';

 if(hasAny(name,VOCAB.recipeSnackWords))return 'snack';

 if(hasAny(name,VOCAB.recipeSideWords))return 'side';

 if(hasAny(name,VOCAB.recipeMainWords))return 'main';

 // For vague titles, structural staples in the required ingredients provide a useful first guess.
 if(hasAny(required,['파스타면','푸실리','스파게티면','우동면','소바','라면','국수']))return 'noodles';
 if(hasAny(required,['밥','즉석밥','쌀','유부초밥',...VOCAB.recipeRiceProducts]))return 'rice';
 if(hasAny(required,['식빵','치아바타','바게트','베이글','소시지빵','피자']))return 'bread';
 if(hasAny(required,['삼겹살','돼지고기','소고기','쇠고기','만두','창펀','돈까스','치킨','닭가슴','닭다리','막창','폭립','훈제오리','오징어','열빙어','전복','황태','가자미','볼락','연어','광어','참치','명란']))return 'main';

 return fallback;
}
