import * as VOCAB from './kitchen-vocabulary.js';
const conciseDefaults=[
 {match:name=>name.includes('치킨스톡'),displayName:'치킨스톡',detectNames:['치킨스톡']},
 {match:name=>name.includes('훈제오리'),displayName:'훈제오리',detectNames:['훈제오리']},
 {match:name=>name.includes('그릭요거트'),displayName:'그릭 요거트',detectNames:['그릭 요거트']},
 {match:name=>name.includes('건파슬리'),displayName:'파슬리',detectNames:['파슬리']},
 {match:name=>name.includes('볶은호두'),displayName:'호두',detectNames:['호두']},
 {match:name=>name.includes('디종머스터드'),displayName:'디종머스터드',detectNames:['디종머스터드']},
 {match:name=>name.includes('아보카도유'),displayName:'아보카도유',detectNames:['아보카도유']},
 {match:name=>name.includes('올리브유'),displayName:'올리브유',detectNames:['올리브유']},
 {match:name=>name.includes('볶은깨'),displayName:'깨',detectNames:['깨']},
 {match:name=>name.includes('생와사비'),displayName:'와사비',detectNames:['와사비']},
 {match:name=>name.includes('중국샬롯'),displayName:'샬롯',detectNames:['샬롯']},
 {match:name=>name.includes('통흑후추'),displayName:'흑후추',detectNames:['흑후추']},
 {match:name=>name.includes('에멘탈')&&name.includes('슈레드'),displayName:'에멘탈 슈레드 치즈',detectNames:['에멘탈 슈레드']},
 {match:name=>name.includes('화이트와인'),displayName:'화이트 와인',detectNames:['화이트 와인']},
 {match:name=>name==='바나나'||VOCAB.detectionBananaNames.includes(name),displayName:'바나나',detectNames:['바나나']},
 {match:name=>name.includes('수좌빙')||name.includes('수좌병')||name.includes('쇼좌빙'),displayName:'수좌빙',detectNames:['수좌빙','수좌병','쇼좌빙']}
];

const cleanName=value=>String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim();

export function normalizeIngredientDetectionText(value){
 return cleanName(value).toLocaleLowerCase('ko-KR').replace(/\s+/g,'');
}

function hashName(value){
 let h=2166136261;
 for(const ch of String(value)){h^=ch.codePointAt(0);h=Math.imul(h,16777619);}
 return (h>>>0).toString(36);
}

function uniqueRuleId(name,used=new Set()){
 const base=`ingredient-${hashName(normalizeIngredientDetectionText(name))}`;
 let id=base,n=2;
 while(used.has(id))id=`${base}-${n++}`;
 return id;
}

function compactDetectionNames(values=[],preserveExplicitAliases=false){
 const names=[...new Set(values.map(cleanName).filter(Boolean))];
 // A manually managed longer name is meaningful for exact quantity evidence,
 // even when the short name already covers it in the draft substring detector.
 if(preserveExplicitAliases)return names;
 return names.filter((name,index)=>{
  const key=normalizeIngredientDetectionText(name);
  return !names.some((other,otherIndex)=>{
   if(index===otherIndex)return false;
   const otherKey=normalizeIngredientDetectionText(other);
   return otherKey&&otherKey.length<key.length&&key.includes(otherKey);
  });
 });
}

function rulesOverlap(a,b){
 const keys=new Set((a.detectNames||[]).map(normalizeIngredientDetectionText).filter(Boolean));
 return (b.detectNames||[]).some(name=>keys.has(normalizeIngredientDetectionText(name)));
}

function preferredRule(a,b,detectNames){
 const remaining=new Set(detectNames.map(normalizeIngredientDetectionText));
 const candidates=[a,b];
 const exact=candidates.filter(rule=>remaining.has(normalizeIngredientDetectionText(rule.displayName)));
 if(exact.length)return exact[0];
 return candidates.reduce((best,rule)=>normalizeIngredientDetectionText(rule.displayName).length<normalizeIngredientDetectionText(best.displayName).length?rule:best);
}

function mergeRulePair(a,b){
 const detectNames=compactDetectionNames([...(a.detectNames||[]),...(b.detectNames||[])],!!(a.customized||b.customized));
 const primary=preferredRule(a,b,detectNames),secondary=primary===a?b:a;
 return {
  ...primary,
  sourceName:primary.sourceName||secondary.sourceName||'',
  detectNames,
  customized:!!(a.customized||b.customized)
 };
}

function mergeNormalizedRules(rows){
 const result=[];
 for(const source of rows){
  let current={...source,detectNames:[...(source.detectNames||[])]};
  const overlaps=[];
  for(let i=0;i<result.length;i++)if(rulesOverlap(result[i],current))overlaps.push(i);
  if(!overlaps.length){result.push(current);continue;}
  const insertAt=overlaps[0];
  for(const index of overlaps)current=mergeRulePair(result[index],current);
  for(let i=overlaps.length-1;i>=0;i--)result.splice(overlaps[i],1);
  result.splice(insertAt,0,current);
 }
 return result;
}

function reusableRuleIndex(rows,sourceName){
 const sourceKey=normalizeIngredientDetectionText(sourceName);
 if(!sourceKey)return -1;
 const matches=[];
 rows.forEach((rule,index)=>{
  for(const detectName of rule.detectNames||[]){
   const key=normalizeIngredientDetectionText(detectName);
   if(key&&sourceKey.includes(key))matches.push({index,length:key.length});
  }
 });
 if(!matches.length)return -1;
 const longest=Math.max(...matches.map(match=>match.length));
 const indexes=[...new Set(matches.filter(match=>match.length===longest).map(match=>match.index))];
 return indexes.length===1?indexes[0]:-1;
}

export function createDefaultIngredientDetectionRule(sourceName,usedIds=new Set()){
 const clean=cleanName(sourceName),compact=normalizeIngredientDetectionText(clean);
 const preset=conciseDefaults.find(item=>item.match(compact));
 return {
  id:uniqueRuleId(clean,usedIds),
  sourceName:clean,
  displayName:preset?.displayName||clean,
  detectNames:preset?.detectNames||[clean],
  customized:!!preset
 };
}

export function createInitialIngredientDetectionRules(names=[]){
 const rows=[],seen=new Set(),used=new Set();
 for(const raw of names){
  const name=cleanName(raw),key=normalizeIngredientDetectionText(name);
  if(!name||seen.has(key))continue;
  seen.add(key);
  if(reusableRuleIndex(rows,name)>=0)continue;
  const rule=createDefaultIngredientDetectionRule(name,used);
  used.add(rule.id);rows.push(rule);
 }
 return normalizeIngredientDetectionRules(rows);
}

export function ensureIngredientDetectionRule(rules,sourceName){
 const name=cleanName(sourceName),key=normalizeIngredientDetectionText(name);
 if(!name)return [...(rules||[])];
 const rows=normalizeIngredientDetectionRules(rules||[]);
 const linked=rows.find(rule=>normalizeIngredientDetectionText(rule.sourceName)===key);
 if(linked)return rows;
 const manual=rows.find(rule=>!rule.sourceName&&normalizeIngredientDetectionText(rule.displayName)===key);
 if(manual){manual.sourceName=name;return rows;}
 if(reusableRuleIndex(rows,name)>=0)return rows;
 const used=new Set(rows.map(rule=>rule.id));
 rows.push(createDefaultIngredientDetectionRule(name,used));
 return normalizeIngredientDetectionRules(rows);
}

export function renameIngredientDetectionRule(rules,oldName,newName){
 const oldKey=normalizeIngredientDetectionText(oldName),name=cleanName(newName);
 const rows=normalizeIngredientDetectionRules(rules||[]);
 const linked=rows.find(rule=>normalizeIngredientDetectionText(rule.sourceName)===oldKey);
 if(!linked)return ensureIngredientDetectionRule(rows,name);
 linked.sourceName=name;
 if(!linked.customized){linked.displayName=name;linked.detectNames=[name];}
 return normalizeIngredientDetectionRules(rows);
}

export function detectIngredientRules(text,rules=[]){
 const haystack=normalizeIngredientDetectionText(text);
 if(!haystack)return [];
 const hits=[];
 let ruleOrder=0;
 for(const rule of rules){
  const display=cleanName(rule?.displayName),names=Array.isArray(rule.detectNames)?rule.detectNames:[];
  if(!display){ruleOrder++;continue;}
  for(const name of names){
   const needle=normalizeIngredientDetectionText(name);
   if(!needle)continue;
   let from=0;
   while(from<=haystack.length-needle.length){
    const index=haystack.indexOf(needle,from);
    if(index<0)break;
    hits.push({display,index,end:index+needle.length,length:needle.length,order:ruleOrder});
    from=index+Math.max(needle.length,1);
   }
  }
  ruleOrder++;
 }
 if(!hits.length)return [];
 const specificHits=hits.filter(hit=>!hits.some(other=>
  other!==hit&&
  other.display!==hit.display&&
  other.length>hit.length&&
  other.index<=hit.index&&
  other.end>=hit.end
 ));
 const matches=new Map();
 for(const hit of specificHits){
  const previous=matches.get(hit.display);
  if(!previous||hit.index<previous.index||(hit.index===previous.index&&hit.length>previous.length))matches.set(hit.display,hit);
 }
 return [...matches.values()].sort((a,b)=>a.index-b.index||a.order-b.order).map(item=>item.display);
}

// Nutrition uses the *same owner-managed dictionary* as ingredient draft
// detection, but a gram amount is evidence only when both written names
// match exactly within one unambiguous rule. Draft substring matching can
// identify words inside "버터쿠키" / "김치"; it must never be reused here.
export function detectionRuleProvesMeasuredQuantity(requiredName,measuredName,rules=[]){
 const required=normalizeIngredientDetectionText(requiredName);
 const measured=normalizeIngredientDetectionText(measuredName);
 if(!required||!measured||!Array.isArray(rules))return false;
 const members=rule=>[
  rule?.displayName,rule?.sourceName,
  ...(Array.isArray(rule?.detectNames)?rule.detectNames:[])
 ].map(normalizeIngredientDetectionText).filter(Boolean);
 const requiredOwners=[],measuredOwners=[];
 for(const rule of rules){
  const names=members(rule);
  if(names.includes(required))requiredOwners.push(rule);
  if(names.includes(measured))measuredOwners.push(rule);
 }
 if(requiredOwners.length!==1||measuredOwners.length!==1||
  requiredOwners[0]!==measuredOwners[0])return false;
 const rule=requiredOwners[0];
 const display=normalizeIngredientDetectionText(rule.displayName);
 const source=normalizeIngredientDetectionText(rule.sourceName);
 // The known pasta shape family includes genuinely different types:
 // weighed "카사레체" cannot prove the required "제멜리". Do not
 // impose this rule on ordinary owner-managed synonyms (계란/달걀,
 // 라드/돼지기름) or product labels in other detection rules.
 if(source===display&&display===normalizeIngredientDetectionText('파스타면')&&
  required!==display&&required!==measured)return false;
 // An exact required product name still needs more than generic grams.
 if(required===source&&required!==display)return false;
 if(measured===display&&required!==display&&required.length>=measured.length)return false;
 return true;
}

export function detectionNamesFromInput(value){
 return [...new Set(String(value||'').split(/[,，、\n]+/).map(cleanName).filter(Boolean))];
}

// UI-side validation deliberately lives here so ingredient-draft.js stays
// independent from the persisted-state validation module and its data imports.
export function normalizeIngredientDetectionRules(values){
 if(!Array.isArray(values)||values.length>2000)throw Error('자동 감지 식재료는 최대 2,000개까지 저장할 수 있어요.');
 const ids=new Set();
 const normalized=values.map(value=>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('자동 감지 식재료 설정을 확인해 주세요.');
  const id=cleanName(value.id),sourceName=cleanName(value.sourceName),displayName=cleanName(value.displayName);
  if(!id||id.length>120||!/^[a-z0-9._:-]+$/i.test(id)||ids.has(id))throw Error('자동 감지 식재료 ID를 확인해 주세요.');
  ids.add(id);
  if(!displayName||displayName.length>150)throw Error('자동 감지 식재료의 표시 이름을 입력해 주세요.');
  const sourceKey=normalizeIngredientDetectionText(sourceName);
  const preset=!value.customized&&sourceKey?conciseDefaults.find(item=>item.match(sourceKey)):null;
  const resolvedDisplay=preset?.displayName||displayName;
  const detectNames=compactDetectionNames(preset?.detectNames||(Array.isArray(value.detectNames)?value.detectNames:[]),!!(value.customized||preset));
  if(!detectNames.length||detectNames.length>20||detectNames.some(name=>name.length>150))throw Error('감지할 이름은 식재료마다 1~20개까지 입력할 수 있어요.');
  return {id,sourceName,displayName:resolvedDisplay,detectNames,customized:!!(value.customized||preset)};
 });
 const merged=mergeNormalizedRules(normalized);
 if(merged.some(rule=>rule.detectNames.length>20))throw Error('감지할 이름은 식재료마다 1~20개까지 입력할 수 있어요.');
 return merged;
}
