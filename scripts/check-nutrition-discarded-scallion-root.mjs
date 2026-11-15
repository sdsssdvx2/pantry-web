import assert from 'node:assert/strict';
import {parseRecipeAmounts,calculateRecipeNutrition} from '../public/nutrition.js';

const missingResolver=name=>({name,nutrition:{}});

const discarded=parseRecipeAmounts(`[재료]
대파 뿌리 1개
물 500g
[조리]
1. 물에 대파 뿌리를 넣고 끓이기
2. 불 끄고, 대파 뿌리 약간 눌렀다가 버리기`,['대파 뿌리']);
const discardedRoot=discarded.rows.find(row=>row.name==='대파 뿌리');
assert.ok(discardedRoot,'Explicit scallion-root ingredient must still be parsed');
assert.equal(discardedRoot.included,false,'A scallion root explicitly discarded after extraction must not count as fully eaten');
assert.match(discardedRoot.review,/건더기를 거르는 육수 재료/);
assert.equal(calculateRecipeNutrition(discarded,missingResolver).totals.energy.missing,1,'Only the still-included water row may remain missing; discarded root itself must not add another gap');

const strained=parseRecipeAmounts(`[재료]
대파 뿌리 2개
간장 100g
생강 10g
[조리]
1. 모두 끓인 뒤 식히기
2. 체로 걸러서(누르지 말기) 맑은 액체만 남기기`,['대파 뿌리']);
const strainedRoot=strained.rows.find(row=>row.name==='대파 뿌리');
assert.ok(strainedRoot);
assert.equal(strainedRoot.included,false,'A scallion root removed when only strained liquid is kept must be excluded');

const eaten=parseRecipeAmounts(`[재료]
대파 뿌리 1개
[조리]
1. 대파 뿌리를 잘게 썰어 넣고 그대로 먹기`,['대파 뿌리']);
const eatenRoot=eaten.rows.find(row=>row.name==='대파 뿌리');
assert.ok(eatenRoot);
assert.equal(eatenRoot.included,true,'Scallion root must not be globally excluded when the recipe does not discard or strain it');
assert.equal(calculateRecipeNutrition(eaten,missingResolver).totals.energy.missing,1,'An eaten scallion root with no nutrition data must remain an explicit gap');

const broth=parseRecipeAmounts(`[육수]
대파 10g
다시마 5g
물 500g`);
assert.equal(broth.rows.find(row=>row.name==='대파').included,false,'Existing broth-extraction behavior must remain intact');
assert.equal(broth.rows.find(row=>row.name==='다시마').included,false,'Existing kombu broth-extraction behavior must remain intact');

console.log('Discarded scallion-root detection and conservative extraction boundaries passed.');
