import fs from 'node:fs';
import assert from 'node:assert/strict';
import {stockPriorityDate,priorityBasis} from '../public/pantry-priority.js';
import {withVersions} from '../public/recipe-versions.js';
import {extractIngredientDraft} from '../public/ingredient-draft.js';

const custom=stockPriorityDate('바나나',{status:'available',addedAt:'2026-10-01T00:00:00+09:00',locations:['실온'],priorityRule:{amount:7,unit:'days'}},new Date('2026-10-02T12:00:00+09:00'));
assert.equal(custom?.value,'2026-10-08','A custom pantry priority period must work even when the built-in room-temperature rule is absent');
assert.match(priorityBasis(custom),/직접 설정 · 7일/,'Custom pantry priority basis must explain the user-defined period');
const unsupported=stockPriorityDate('바나나',{status:'available',addedAt:'2026-10-01T00:00:00+09:00',locations:['실온']},new Date('2026-10-02T12:00:00+09:00'));
assert.equal(unsupported,null,'The custom override must not silently change built-in unsupported storage rules');

const relabeled=withVersions({id:'source-test',variants:[{key:'one',label:'기록 1'}]},[{sourceId:'source-test',variantKey:'one',label:'1인분',recipe:{}}]);
assert.equal(relabeled.variants[0].label,'1인분','Edited serving/version labels must replace stale raw variant labels');

assert.deepEqual(extractIngredientDraft('깨\n후추 약간',['볶은 깨','생 깨','후추']),['깨','후추'],'Standalone short ingredient names and qualitative amounts must be drafted');

const view=fs.readFileSync('public/recipe-view-controller.js','utf8');
assert.match(view,/visibleIds\.has\(id\)/,'Related-recipe graph must only include visible recipe IDs');
assert.doesNotMatch(view,/삭제된 연결 레시피|· 삭제됨/,'Deleted related recipes must not remain as disabled/deleted placeholders');
const editor=fs.readFileSync('public/recipe-editor.js','utf8');
assert.match(editor,/availableIds\.has\(id\)/,'Recipe editor must prune missing or hidden related recipe IDs');
assert.doesNotMatch(editor,/\(삭제됨\)/,'Hidden recipes must not remain in related-recipe choices');
const display=fs.readFileSync('public/recipe-display.js','utf8');
assert.match(display,/r\.variantKey==='base'/,'A custom synthetic base serving must expose the serving/version delete control');
const dialog=fs.readFileSync('public/recipe-dialog-controller.js','utf8');
assert.match(dialog,/promoted\.recipe/,'Deleting a custom base serving must promote another authored serving without deleting the recipe group');
const validation=fs.readFileSync('public/state-validation.js','utf8');
assert.match(validation,/priorityRule=validatePriorityRule\(v\.priorityRule\)/,'Custom pantry priority rules must survive persisted-state validation');
const stock=fs.readFileSync('public/stock-editor.js','utf8');
assert.match(stock,/stock-priority-rule-amount/,'Stock editor must expose a user-defined automatic priority period');

console.log('Reported pantry/recipe regression checks passed.');
