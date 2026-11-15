import * as VOCAB from './kitchen-vocabulary.js';
export const PANTRY_GROUP_VERSION=3;

export const groups=[
 '곡물·면·빵',
 '고기·해산물',
 '채소·과일',
 '달걀·유제품',
 '소스·조미료',
 '간편식',
 '과자·견과',
 '음료'
];

const exactGroups=new Map(VOCAB.pantryExactGroups);

const contains=(value,terms)=>terms.some(term=>value.includes(term));
const translatedLegacy=[0,1,3,2,4,5,7];

export function inferPantryGroup(name,fallback=5){
 const raw=String(name||'').normalize('NFKC').trim();
 const exact=exactGroups.get(raw);
 if(Number.isInteger(exact))return exact;
 const value=raw.toLowerCase().replace(/\s+/g,' ');

 // Ready-to-eat or multi-component foods take precedence over their ingredient words.
 if(contains(value,VOCAB.pantryReadyMealWords))return 5;

 if(contains(value,VOCAB.pantrySweetSnackWords))return 6;
 if(contains(value,['호두','피스타치오','잣','견과','해바라기씨','하루견과']))return 6;

 if(contains(value,VOCAB.pantryDrinkWords))return 7;

 if(contains(value,VOCAB.pantrySeasoningWords))return 4;

 if(contains(value,VOCAB.pantryDairyWords))return 3;

 if(contains(value,['삼겹살','돼지고기','소고기','사각어묵','쇠고기','훈제오리','오리고기','닭가슴','닭다리','명란','과메기','황태','가자미','볼락','멸치','전복','열빙어','고등어','오징어','새우','참치','연어','육회']))return 1;

 if(contains(value,['쌀','밥','면','파스타','우동','소바','떡','빵','바게트','치아바타','가루','믹스','누룽지','메밀','귀리','밀가루']))return 0;

 if(contains(value,['딸기','블루베리','베리','귤','사과','배','바나나','아보카도','금귤','체리','그린빈','무','마늘','대파','샬롯','양파','생강','감자','고구마','단호박','옥수수','스위트콘','김치','우엉','연근','팽이버섯','파슬리','귤피','두부','대두','콩']))return 2;

 return Number.isInteger(fallback)&&fallback>=0&&fallback<groups.length?fallback:5;
}

export function migratePantryStockGroups(stock={},version=1){
 if(version>=PANTRY_GROUP_VERSION)return {stock,version:PANTRY_GROUP_VERSION,changed:false};
 const next=Object.create(null);
 let changed=false;
 for(const [name,record] of Object.entries(stock)){
  const fallback=version>=2?(Number.isInteger(record?.group)?record.group:5):(translatedLegacy[record?.group]??5);
  const group=inferPantryGroup(name,fallback);
  next[name]={...record,group};
  if(group!==record?.group)changed=true;
 }
 return {stock:next,version:PANTRY_GROUP_VERSION,changed:true};
}

const iconPaths=[
 '<path d="M12 21V4M12 8c-3 0-5-1.5-6-4 3 0 5 1.5 6 4Zm0 5c-3 0-5-1.5-6-4 3 0 5 1.5 6 4Zm0 5c-3 0-5-1.5-6-4 3 0 5 1.5 6 4Zm0-10c3 0 5-1.5 6-4-3 0-5 1.5-6 4Zm0 5c3 0 5-1.5 6-4-3 0-5 1.5-6 4Zm0 5c3 0 5-1.5 6-4-3 0-5 1.5-6 4Z"/>',
 '<path d="M3 12c3-4.8 8.5-6.5 13-3l4-3v12l-4-3c-4.5 3.5-10 1.8-13-3Z"/><circle cx="7" cy="11" r=".8" fill="currentColor" stroke="none"/>',
 '<path d="M12 21c-4.5 0-8-3.5-8-8 0-3 1.8-5.4 4.5-6.7C9.2 4 10.4 3 12 3s2.8 1 3.5 3.3C18.2 7.6 20 10 20 13c0 4.5-3.5 8-8 8Z"/><path d="M12 6c1.5 0 2.8-.7 3.8-2"/>',
 '<path d="M8 3h6l3 4v14H7V7l1-4Z"/><path d="M7 7h10M11 3v4"/><path d="M10 12h4v5h-4Z"/>',
 '<path d="M8 3h8l1 5H7l1-5Z"/><path d="M6 8h12l1 13H5L6 8Z"/><circle cx="10" cy="5.5" r=".55" fill="currentColor" stroke="none"/><circle cx="14" cy="5.5" r=".55" fill="currentColor" stroke="none"/><path d="M9 13h6"/>',
 '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M12 5v14M3 12h18"/>',
 '<circle cx="12" cy="12" r="8"/><circle cx="9" cy="9" r="1" fill="currentColor" stroke="none"/><circle cx="14.5" cy="8.5" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="14" r="1" fill="currentColor" stroke="none"/><circle cx="9.5" cy="15" r="1" fill="currentColor" stroke="none"/>',
 '<path d="M6 7h12l-1 14H7L6 7Z"/><path d="M13 7l2-5h4"/>'
];

export function pantryGroupIcon(index){
 return `<svg class="pantry-group-icon" viewBox="0 0 24 24" aria-hidden="true">${iconPaths[index]||iconPaths[5]}</svg>`;
}
