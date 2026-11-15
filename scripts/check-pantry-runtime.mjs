import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
globalThis.fetch=async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(fileURLToPath(url),'utf8'))});
// Dispatch the real input callback with an Event, not a synthetic stock lookup.
class Field{
 constructor(){this.value='';this.innerHTML='';this.textContent='';this.listeners=new Map();}
 addEventListener(type,listener){this.listeners.set(type,listener);}
}
const fields=new Map([...fs.readFileSync('public/index.html','utf8').matchAll(/id="([^"]+)"/g)].map(([,id])=>[id,new Field()]));
globalThis.document={getElementById:id=>fields.get(id)||null};
globalThis.window=new EventTarget();
globalThis.localStorage={getItem:()=>null};
const {installPantryController}=await import('../public/pantry-controller.js');
installPantryController({getContext:()=>({ingredientHistory:[{name:'치킨스톡'},{name:'즉석밥'}],stockOverrides:{}})});
fields.get('history-search').value='치킨';
fields.get('history-search').listeners.get('input')(new Event('input'));
assert.match(fields.get('history-list').innerHTML,/치킨스톡/);
assert.doesNotMatch(fields.get('history-list').innerHTML,/즉석밥/);
fields.get('history-search').value='없는식재료';
fields.get('history-search').listeners.get('input')(new Event('input'));
assert.match(fields.get('history-list').innerHTML,/검색 결과가 없어요/);
console.log('Archived pantry input-event search checks passed.');
