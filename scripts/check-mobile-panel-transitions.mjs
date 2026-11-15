import assert from 'node:assert/strict';
import fs from 'node:fs';

// Run the actual event wiring from the production controller modules in a
// synthetic DOM. No browser login, stock data, network, or filesystem writes.
const pantry=fs.readFileSync('public/pantry-controller.js','utf8');
const recipe=fs.readFileSync('public/recipe-browser-controller.js','utf8');
const capture=(source,start,end)=>{
 const first=source.indexOf(start);
 assert(first>=0,'Missing responsive handler start: '+start);
 const last=source.indexOf(end,first);
 assert(last>first,'Missing responsive handler end: '+end);
 return source.slice(first,last);
};
const classList=initial=>{
 const values=new Set(initial);
 return {
  add:x=>values.add(x),remove:x=>values.delete(x),
  toggle(x){if(values.has(x)){values.delete(x);return false;}values.add(x);return true;},
  contains:x=>values.has(x)
 };
};
function fixture(initialClass){
 const button={listeners:{},attributes:{},textContent:'펼치기 +',
  addEventListener(event,callback){this.listeners[event]=callback;},
  setAttribute(name,value){this.attributes[name]=value;}};
 const panel={classList:classList([initialClass])};
 let resized=null;
 const window={matchMedia(query){
  assert.equal(query,'(max-width:760px)');
  return {addEventListener(type,callback){assert.equal(type,'change');resized=callback;}};
 }};
 const events=()=>{assert.equal(typeof resized,'function');return resized;};
 return {button,panel,window,events};
}
const pantryUI=fixture('pantry');
const pantryBlock=capture(pantry," const pantryPanel=document.querySelector?.('.pantry')","\n return {render,renderHistory,open};");
new Function('document','$','window',pantryBlock)(
 {querySelector:selector=>{assert.equal(selector,'.pantry');return pantryUI.panel;}},
 id=>{assert.equal(id,'pantry-toggle');return pantryUI.button;},pantryUI.window
);
pantryUI.button.listeners.click();
assert(pantryUI.panel.classList.contains('expanded'));
assert.equal(pantryUI.button.attributes['aria-expanded'],'true');
pantryUI.events()({matches:false}); // desktop: do not force a reset
assert(pantryUI.panel.classList.contains('expanded'));
pantryUI.events()({matches:true}); // return to phone-sized window
assert(!pantryUI.panel.classList.contains('expanded'));
assert.equal(pantryUI.button.attributes['aria-expanded'],'false');
assert.equal(pantryUI.button.textContent,'펼치기 +');
pantryUI.button.listeners.click(); // user can expand again
assert(pantryUI.panel.classList.contains('expanded'));
pantryUI.events()({matches:true}); // both panels return to the same collapsed state
assert(!pantryUI.panel.classList.contains('expanded'));

const recipeUI=fixture('filters');
recipeUI.panel.classList.add('mobile-filters-collapsed');
recipeUI.button.closest=selector=>{assert.equal(selector,'.filters');return recipeUI.panel;};
const recipeBlock=capture(recipe," const mobileFilters=$('menu-filters-toggle');","\n $('reset-filters').addEventListener");
new Function('$','window',recipeBlock)(id=>{
 assert.equal(id,'menu-filters-toggle');return recipeUI.button;
},recipeUI.window);
recipeUI.button.listeners.click();
assert(!recipeUI.panel.classList.contains('mobile-filters-collapsed'));
recipeUI.events()({matches:false});
assert(!recipeUI.panel.classList.contains('mobile-filters-collapsed'));
recipeUI.events()({matches:true});
assert(recipeUI.panel.classList.contains('mobile-filters-collapsed'));
assert.equal(recipeUI.button.attributes['aria-expanded'],'false');
assert.equal(recipeUI.button.textContent,'펼치기 +');
assert.equal(pantryUI.button.attributes['aria-expanded'],recipeUI.button.attributes['aria-expanded']);
console.log('Responsive pantry and recipe-filter panels re-collapse consistently at mobile width.');
