import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {storageArea} from '../public/pantry-storage-rules.js';
import {priorityRuleByArea,stockPriorityDate} from '../public/pantry-priority.js';

globalThis.fetch=async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(fileURLToPath(url),'utf8'))});
const {validatePriorityRule,validateStock}=await import('../public/state-validation.js');

const areaKey=values=>[...new Set(values.map(storageArea).filter(Boolean))].sort().join('|');
assert.equal(areaKey(['우리 냉동실 · 1 가루']),'frozen');
assert.equal(areaKey(['보조 냉동실 · 4 빵']),'frozen');
assert.equal(areaKey(['우리 냉장고 · 안쪽']),'chilled');
assert.equal(areaKey(['실온 · 식재료']),'room');
assert.equal(areaKey(['우리 냉동실 · 1 가루']),areaKey(['보조 냉동실 · 4 빵']),'Moving within the same storage area must keep one shared override');

const now=new Date('2026-10-03T12:00:00+09:00');
const base={
 group:2,status:'available',notes:[],addedAt:'2026-10-02T00:00:00+09:00',
 locations:['우리 냉장고 · 안쪽','우리 냉동실 · 1 가루']
};
let priority=stockPriorityDate('바나나',base,now);
assert.equal(priority.plan.area,'chilled','Mixed chilled/frozen storage should display the faster chilled target');
assert.equal(priority.plan.amount,7);

const chilledCustom={...base,priorityRule:{byArea:{chilled:{amount:10,unit:'days'}}}};
priority=stockPriorityDate('바나나',chilledCustom,now);
assert.equal(priority.plan.area,'chilled');
assert.equal(priority.plan.amount,10,'Editing the fastest chilled rule should only override chilled storage');
assert.equal(priority.customRule,true);

const frozenOnly={...chilledCustom,locations:['우리 냉동실 · 1 가루']};
priority=stockPriorityDate('바나나',frozenOnly,now);
assert.equal(priority.plan.area,'frozen');
assert.equal(priority.plan.amount,3);
assert.equal(priority.plan.unit,'months','Removing chilled storage must reveal the untouched frozen default');
assert.equal(priority.customRule,false);

priority=stockPriorityDate('바나나',chilledCustom,now);
assert.equal(priority.plan.area,'chilled');
assert.equal(priority.plan.amount,10,'Re-enabling chilled storage must restore its saved override');

const sameArea={...base,locations:['우리 냉동실 · 1 가루','보조 냉동실 · 4 빵'],priorityRule:{byArea:{frozen:{amount:5,unit:'months'}}}};
priority=stockPriorityDate('바나나',sameArea,now);
assert.equal(priority.plan.area,'frozen');
assert.equal(priority.plan.amount,5,'Multiple freezer locations must share the same frozen override');

const cleared={...base,priorityRule:{byArea:{}}};
priority=stockPriorityDate('바나나',cleared,now);
assert.equal(priority.plan.area,'chilled');
assert.equal(priority.plan.amount,7,'Clearing the current area override must reveal its default rule again');

const labeledOpened={
 ...base,
 locations:['우리 냉장고 · 안쪽'],
 priorityStartDate:'2026-10-03',
 notes:['상품 페이지: https://shop.example/item/1','보관방법: 개봉 후 냉장보관, 5일 이내 섭취']
};
priority=stockPriorityDate('테스트 소스',labeledOpened,now);
assert.equal(priority.plan.area,'chilled');
assert.equal(priority.plan.amount,5);
assert.equal(priority.plan.unit,'days');
assert.equal(priority.plan.productEvidence,true,'Explicit post-open product label period should outrank generic category defaults only after an opening/storage date is supplied');
assert.equal(priority.plan.reference.url,'https://shop.example/item/1');

const notOpenedYet={...labeledOpened,priorityStartDate:''};
priority=stockPriorityDate('테스트 소스',notOpenedYet,now);
assert.equal(priority.plan.amount,7,'Without an opening date, the existing chilled category target must remain in use');
assert.equal(!!priority.plan.productEvidence,false,'A post-open label period must never be anchored to purchase/addition date');

const manufacturedShelf={
 ...base,
 locations:['우리 냉장고 · 안쪽'],
 priorityStartDate:'2026-10-03',
 notes:['상품 페이지: https://shop.example/item/2','보관방법: 냉장보관','표시 보관기간·기한: 제조일로부터 12개월']
};
priority=stockPriorityDate('테스트 소스',manufacturedShelf,now);
assert.equal(priority.plan.amount,7,'Manufacture-relative shelf life must leave the existing chilled category target intact');
assert.equal(!!priority.plan.productEvidence,false,'Manufacture-relative shelf life must not be converted into a pantry date from the owner opening/storage date');

const ownerOverride={...labeledOpened,priorityRule:{byArea:{chilled:{amount:3,unit:'days'}}}};
priority=stockPriorityDate('테스트 소스',ownerOverride,now);
assert.equal(priority.plan.amount,3);
assert.equal(priority.customRule,true,'Owner custom storage period must remain higher priority than extracted product evidence');

const slowerChilled={...base,priorityRule:{byArea:{chilled:{amount:120,unit:'days'}}}};
priority=stockPriorityDate('바나나',slowerChilled,now);
assert.equal(priority.plan.area,'frozen','The same earliest-date comparator must choose frozen when a chilled override becomes slower');

const legacy={...base,priorityRule:{amount:10,unit:'days'}};
assert.deepEqual(priorityRuleByArea('바나나',legacy,now),{chilled:{amount:10,unit:'days'}},'Legacy single rules should migrate to the area that previously had the fastest default');
priority=stockPriorityDate('바나나',legacy,now);
assert.equal(priority.plan.area,'chilled');
assert.equal(priority.plan.amount,10);

const persistedRule={byArea:{chilled:{amount:10,unit:'days'},frozen:{amount:4,unit:'months'}}};
assert.deepEqual(validatePriorityRule(persistedRule),persistedRule,'State validation must preserve storage-area overrides');
const validatedStock=validateStock({바나나:{...base,priorityRule:persistedRule}});
assert.deepEqual(validatedStock.바나나.priorityRule,persistedRule,'Kitchen-state load/save validation must retain storage-area overrides');

console.log('Per-area storage-period checks passed.');

// Opened condiments and dry pantry staples get quality targets, never expiry warnings.
{
 const {storagePlan}=await import('../public/pantry-storage-rules.js');
 const {priorityLabel}=await import('../public/pantry-priority.js');
 const mayo=storagePlan('마요네즈',{group:4,notes:[]},'chilled');
 assert.equal(mayo.amount,2);assert.equal(mayo.unit,'months');assert.equal(mayo.qualityOnly,true);
 assert.ok(mayo.reference?.url,'Quality targets cite their storage chart');
 assert.equal(storagePlan('실론 시나몬 파우더',{group:4,notes:[]},'room').amount,24);
 assert.equal(storagePlan('엑스트라버진 올리브유',{group:4,notes:[]},'room').amount,3);
 assert.equal(storagePlan('히말라야 핑크 소금',{group:4,notes:[]},'room'),null,'Salt never gets a date');
 assert.equal(storagePlan('황설탕',{group:4,notes:[]},'room'),null,'Sugar never gets a date');
 const opened=stockPriorityDate('마요네즈',{group:4,status:'available',notes:[],addedAt:'2026-07-01T00:00:00+09:00',locations:['우리 냉장고 · 문짝']},now);
 assert.equal(opened.quality,true,'Opened condiment targets use the quality colour, not an expiry warning');
 assert.equal(priorityLabel(opened),'개봉 품질');
}
console.log('opened condiment quality target checks passed');
