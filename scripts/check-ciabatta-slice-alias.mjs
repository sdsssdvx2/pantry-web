import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const originalFetch=globalThis.fetch;
globalThis.fetch=async input=>{
 const url=input instanceof URL?new URL(input.href):new URL(String(input));
 url.search='';url.hash='';
 const value=JSON.parse(await readFile(fileURLToPath(url),'utf8'));
 return {ok:true,json:async()=>value};
};
try{
 const data=await import(`../public/data.js?ciabatta-slice-alias=${Date.now()}`);
 assert.equal(data.normalize('치아바타 바게트 슬라이스'),'치아바타 바게트');
 assert.deepEqual(data.matchingNames('치아바타 바게트 슬라이스'),['치아바타 바게트']);
 const match=data.matchIngredient('치아바타 바게트 슬라이스',['치아바타 바게트'],{}, {name:'테스트 레시피'});
 assert.equal(match.actual,'치아바타 바게트');
 assert.equal(match.available,true);
 assert.equal(data.normalize('튀긴 샬롯 슬라이스'),'튀긴 샬롯 슬라이스','Known sliced products must keep their own canonical identity');
 console.log('Ciabatta slice wording resolves narrowly to the held ciabatta baguette.');
}finally{
 globalThis.fetch=originalFetch;
}
