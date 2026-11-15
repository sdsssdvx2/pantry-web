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
 const data=await import(`../public/data.js?italian-five-cheese-alias=${Date.now()}`);
 const fiveCheese='슈레드 이탈리안 5치즈';
 const plainMozzarella='슈레드 모짜렐라 치즈';

 assert.equal(data.normalize('슈레드 모짜렐라 이탈리안 5치즈'),fiveCheese);
 assert.equal(data.normalize('이탈리안 모짜렐라 5치즈'),fiveCheese);
 assert.equal(data.normalize('이탈리안 5치즈'),fiveCheese);

 const pantry=[plainMozzarella,fiveCheese,'트리플 슈레드 치즈'];
 const match=data.matchIngredient('슈레드 모짜렐라 이탈리안 5치즈',pantry,{}, {name:'명란 감자 크림 치즈 그라탕'});
 assert.equal(match.actual,fiveCheese);
 assert.equal(match.available,true);
 assert.deepEqual(match.held,[fiveCheese]);

 assert.equal(data.normalize('모짜렐라 치즈'),plainMozzarella,'Plain mozzarella must stay separate from the five-cheese blend');
 assert.equal(data.normalize('슈레드 모짜렐라 치즈'),plainMozzarella,'The held plain mozzarella product must stay unchanged');
 assert.equal(data.normalize('슈레드 모짜렐라 이탈리안 5치즈 소스'),'슈레드 모짜렐라 이탈리안 5치즈 소스','Sauce wording must not collapse into the cheese blend');
 console.log('Exact owner wording resolves to the held Italian five-cheese blend without broadening mozzarella matching.');
}finally{
 globalThis.fetch=originalFetch;
}
