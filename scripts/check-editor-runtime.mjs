import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

// Exercise the real submit handler and validators against an isolated form.
// No production state or browser storage is touched.
globalThis.fetch=async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(fileURLToPath(url),'utf8'))});
class Field extends EventTarget{
 constructor(){super();this.value='';this.textContent='';this.innerHTML='';this.open=false;this.isConnected=true;}
 focus(){}
 reset(){for(const field of fields.values())field.value='';}
 showModal(){this.open=true;}
 close(){this.open=false;this.dispatchEvent(new Event('close'));}
}
const fields=new Map([...fs.readFileSync('public/index.html','utf8').matchAll(/id="([^"]+)"/g)].map(([,id])=>[id,new Field()]));
globalThis.document={getElementById:id=>fields.get(id)||null,activeElement:null};
const {installRecipeEditor}=await import('../public/recipe-editor.js');
let context={builtInRecipes:[],customRecipes:[],sourceEdits:[],recipeGroupMeta:{},hiddenSources:[],hiddenVariants:[],filters:{availability:'ready',query:''},selectedVariants:{}};
let saves=0,shown=null,writable=true;
const editor=installRecipeEditor({getContext:()=>context,applyContext:next=>Object.assign(context,next),persist:()=>{saves++;return writable;},render(){},showRecipe:id=>{shown=id;},toast(){},isGroupedRecipe:()=>false});
const fill=()=>{for(const [id,value] of Object.entries({'recipe-name':'테스트 볶음밥','recipe-category':'rice','recipe-effort':'2','recipe-time':'10','recipe-required':'즉석밥, 달걀','recipe-optional':'참기름','recipe-steps':'즉석밥 200g\n1. 달걀을 볶는다.\n2. 밥을 넣는다.'}))fields.get(id).value=value;};
const submit=()=>fields.get('recipe-form').dispatchEvent(new Event('submit',{cancelable:true}));
editor.open();fill();submit();
assert.equal(fields.get('recipe-error').textContent,'','A valid recipe must save without runtime errors');
assert.equal(saves,1);assert.equal(context.customRecipes.length,1);
assert.deepEqual(context.customRecipes[0].required,['즉석밥','달걀']);
assert.equal(shown,context.customRecipes[0].id);assert.equal(fields.get('editor-dialog').open,false);
const original=context.customRecipes[0];
editor.open({...original,custom:true});fields.get('recipe-name').value='수정한 볶음밥';submit();
assert.equal(context.customRecipes.length,1);assert.equal(context.customRecipes[0].name,'수정한 볶음밥');
editor.open({...context.customRecipes[0],custom:true},false,true);fields.get('recipe-version-label').value='2인분';submit();
assert.equal(context.sourceEdits.length,1);assert.equal(context.sourceEdits[0].label,'2인분');
assert.equal(context.sourceEdits[0].sourceId,original.id);
editor.open({...context.customRecipes[0],custom:true});
context.customRecipes=[{...context.customRecipes[0],name:'다른 기기 변경'}];submit();
assert.match(fields.get('recipe-error').textContent,/다른 기기/);assert.equal(saves,3);
editor.open();fill();writable=false;submit();
assert.equal(context.customRecipes.length,1);assert.equal(fields.get('editor-dialog').open,true);
assert.match(fields.get('recipe-error').textContent,/저장하지 못/);
console.log('Recipe create, edit, version, conflict, and rollback runtime checks passed.');
