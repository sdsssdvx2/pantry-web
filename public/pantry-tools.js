import {locations,locationFilters} from './storage-layout.js';
export {locations,locationFilters};

const locationLabelByValue=new Map(locations.map(([value,,label])=>[value,label]));
const cleanLocationSearchLabel=value=>String(value||'').replace(/\s*[（(][^()（）]*[）)]\s*/g,' ').replace(/\s+/g,' ').trim();

// Pantry text search intentionally indexes only the leaf label the user sees
// (e.g. "맨 위 선반", "얼음칸", "1번 칸"). Parent freezer/fridge names and
// parenthetical hints are excluded because the dedicated location filter already
// handles top-level areas and hints are descriptive rather than location names.
export function pantryLocationSearchText(values=[]){
 const labels=[];
 for(const raw of values||[]){
  const value=String(raw||'').trim();
  if(!value)continue;
  let label=locationLabelByValue.get(value);
  if(label===undefined){
   const parts=value.split(' · ');
   label=parts.length>1?parts.slice(1).join(' · '):value;
  }
  label=cleanLocationSearchLabel(label);
  if(!label||label==='전체'||labels.includes(label))continue;
  labels.push(label);
 }
 return labels.join(' ');
}

// Only split separators outside parentheses. Nutritional commas and nested
// annotations are kept verbatim, without an AI call or nutrition inference.
export function parseIngredients(text, normalize) {
 if(typeof text!=='string'||text.length>30000)throw Error('한 번에 30,000자까지 입력할 수 있어요.');
 const pairs={'(':')','（':'）'}, closers=new Set(Object.values(pairs));
 let stack=[],name='',note='',notes=[],rows=[];
 function finish(){
  const cleaned=name.trim().replace(/^[•·]\s*/, '');
  if(cleaned){if(cleaned.length>150)throw Error('재료 이름은 150자 이하로 적어 주세요. 설명은 괄호 안에 넣어 주세요.');rows.push({name:normalize(cleaned),notes:notes.filter(Boolean)});}
  else if(notes.length)throw Error('괄호 앞에 재료 이름을 적어 주세요.');
  name='';note='';notes=[];
 }
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(pairs[c]){if(stack.length)note+=c;stack.push(pairs[c]);continue;}
  if(closers.has(c)){if(stack.pop()!==c)throw Error('괄호가 맞지 않아요. 여는 괄호와 닫는 괄호를 확인해 주세요.');if(stack.length)note+=c;else{notes.push(note.trim());note='';}continue;}
  if(stack.length){note+=c;continue;}
  const thousands=c===','&&/\d/.test(text[i-1]||'')&&/^\d{3}(?:\D|$)/.test(text.slice(i+1));
  if(/[,，、;\n\r]/.test(c)&&!thousands)finish();else name+=c;
 }
 if(stack.length)throw Error('닫는 괄호가 빠졌어요. 메모 끝에 괄호를 닫아 주세요.');
 finish();
 if(!rows.length)throw Error('추가할 재료를 입력해 주세요.');
 if(rows.length>100)throw Error('한 번에 재료 100개까지 추가할 수 있어요.');
 const merged=new Map();
 for(const row of rows){const old=merged.get(row.name);if(old)old.notes=[...new Set([...old.notes,...row.notes])];else merged.set(row.name,row);}
 for(const r of merged.values())if(r.notes.join('\n').length>8000)throw Error('재료별 메모는 8,000자까지 저장할 수 있어요.');
 return [...merged.values()];
}
