import fs from 'node:fs';
import {cookModeHTML,emptyRecipeGridHTML,recipeCardHTML,recipeDetailHTML} from '../public/recipe-display.js';

const app=fs.readFileSync('public/app.js','utf8');
const browser=fs.readFileSync('public/recipe-browser-controller.js','utf8');
const view=fs.readFileSync('public/recipe-view-controller.js','utf8');
const display=fs.readFileSync('public/recipe-display.js','utf8');
const fail=message=>{throw new Error(message);};
const expect=(condition,message)=>{if(!condition)fail(message);};

expect(view.includes("import {cookingBody,recipeCopyText,recipeDetailHTML,cookModeHTML} from './recipe-display.js"),'Recipe view controller must import detail/cook recipe display renderers');
expect(browser.includes("import {recipeCardHTML,emptyRecipeGridHTML} from './recipe-display.js"),'Recipe browser controller must import card/empty recipe display renderers');
expect(view.includes('innerHTML=recipeDetailHTML({recipe,base,random'),'Recipe detail DOM must be populated from recipeDetailHTML');
expect(view.includes('lastCookedAt:lastCooked[recipe.id]||\'\''),'Recipe view must retain the compatibility latest cooking timestamp');
expect(view.includes('cookingHistory:cookingHistory[recipe.id]||[]'),'Recipe view must pass cumulative cooking history to the display renderer');
expect(view.includes('canRecordCooked:!!canRecordCooked()'),'Recipe view must pass write capability to the display renderer');
expect(view.includes('innerHTML=cookModeHTML(recipe,text,{canRecordCooked:!!canRecordCooked()})'),'Cook mode DOM must be populated from cookModeHTML with explicit write capability');
expect(!app.includes('numberedSteps(')&&!view.includes('numberedSteps('),'Step display interpretation must not return to app.js or recipe view controller');
expect(!app.includes('class="recipe-manage"')&&!view.includes('class="recipe-manage"'),'Recipe management markup must stay in recipe-display.js');
expect(display.includes('export function recipeDetailHTML'),'recipe-display.js must own recipe detail markup');
expect(display.includes('export function cookModeHTML'),'recipe-display.js must own focused cooking markup');
expect(browser.includes('recipeCardHTML({recipe:r,iconHTML:icon(r.category)'),'Recipe browser must delegate card markup to recipeCardHTML');
expect(browser.includes("cards.length?cards.join(''):emptyRecipeGridHTML()"),'Recipe browser must delegate empty state markup to emptyRecipeGridHTML');
expect(!app.includes('<article class="recipe-card"')&&!browser.includes('<article class="recipe-card"'),'Recipe card markup must stay in recipe-display.js');
expect(display.includes('export function recipeCardHTML'),'recipe-display.js must own recipe card markup');
expect(display.includes('export function emptyRecipeGridHTML'),'recipe-display.js must own empty recipe grid markup');

const card=recipeCardHTML({
 recipe:{id:'source-card',name:'카드 <요리>',summary:'설명 & 요약',time:15,variantLabel:'2인분',variants:[{key:'one'},{key:'two'}],custom:false,missing:[{name:'소금'}],matches:[{name:'감자',available:true,reason:'해동 필요'},{name:'소금',available:false,reason:'재고 없음'}],prep:'10분 대기',pairing:'탄산수 & 레몬',servingNote:'곁들임 있음'},
 iconHTML:'<svg data-card-icon></svg>',ratingMarkup:'<div data-card-rating></div>',clockHTML:'<svg data-card-clock></svg>',effortLabel:'보통 <2>',categoryLabel:'메인 & 식사',relatedCount:2,historyLabel:'먹은 기록 3회 · 최근 9/18'
});
expect(card.includes('class="recipe-card"')&&card.includes('data-recipe-id="source-card"'),'Recipe card must keep its keyboard-focusable identity');
expect(card.includes('재료 1개 부족·확인')&&card.includes('ingredients-block shortage-block'),'Missing recipes must keep their shortage summary');
expect(card.includes('해동 필요')&&card.includes('소금 (재고 없음)'),'Availability and shortage reasons must remain visible');
expect(card.includes('10분 대기')&&card.includes('추천 음료·곁들임')&&card.includes('함께 만드는 구성 보기 · 2개 연결'),'Preparation, pairing, and related-menu cues must remain visible');
expect(!card.includes('기준 ·')&&!card.includes('개 기록 선택'),'Recipe cards must not repeat variant-selection helper text below the existing variant label');
expect(card.includes('data-copy-card="source-card"'),'Recipe cards must retain direct copy controls');
expect(card.includes('카드 &lt;요리&gt;')&&card.includes('설명 &amp; 요약')&&card.includes('보통 &lt;2&gt;')&&card.includes('메인 &amp; 식사'),'Card-authored text and labels must be HTML escaped');
expect(card.includes('data-card-icon')&&card.includes('data-card-rating')&&card.includes('data-card-clock'),'Trusted icon, rating, and clock markup must be preserved');
expect(card.includes('history-sort-note')&&card.includes('먹은 기록 3회 · 최근 9/18'),'Cooking-based sorts may add one compact explanation without changing default card density');

const readyCard=recipeCardHTML({recipe:{id:'user-card',name:'내 요리',summary:'',time:5,custom:true,missing:[],matches:[],prep:'',variants:[]},effortLabel:'쉬움',categoryLabel:'간식'});
expect(readyCard.includes('✓ 재료 준비됨')&&readyCard.includes('간식')&&!readyCard.includes('직접 추가·수정'),'Recipe cards must always show the food type instead of ownership labels');
expect(!readyCard.includes('shortage-block'),'Ready cards must not build hidden shortage DOM');

const empty=emptyRecipeGridHTML();
expect(empty.includes('data-empty="all"')&&empty.includes('data-empty="pantry"'),'Empty recipe grid must retain recovery actions');

const recipe={
 id:'source-test',name:'테스트 <레시피>',summary:'요약 & 설명',time:20,effort:'2',variantKey:'two',variantLabel:'2인분',source:true,userVariant:false,
 missing:[{name:'소금'}],matches:[{name:'감자',available:true},{name:'소금',available:false,reason:'재고 없음'}],optional:['후추','파슬리'],
 prep:'10분 대기',steps:['팬을 달군다','굽는다'],original:'원래 <기록>',note:'메모\n둘째 줄'
};
const base={variants:[{key:'one',label:'1인분'},{key:'two',label:'2인분'}]};
const html=recipeDetailHTML({
 recipe,base,edited:true,cookingText:'수정한 <조리 기록>',productNotes:[{name:'제품 <A>',note:'첫 줄\n둘째 & 줄'}],
 contextHTML:'<section data-test-context>안전한 내부 컨텍스트</section>',clockHTML:'<svg data-test-clock></svg>',effortLabel:'보통 <단계>',
 optionalAvailability:[{name:'후추',available:true},{name:'파슬리',available:false}],ratingMarkup:'<div data-test-rating></div>',
 lastCookedAt:'2026-09-17T08:30:00.000Z',cookingHistory:['2026-09-17T08:30:00.000Z','2026-09-10T12:00:00.000Z'],canRecordCooked:true
});
expect(html.includes('재료 1개 부족·확인')&&!html.includes('필수 재료 1개 부족·확인'),'Detail shortage status must match the recipe card wording');
expect(html.includes('class="variant-picker"')&&html.includes('value="two" selected'),'Variant picker must preserve the selected variant');
expect(html.includes('감자')&&html.includes('required-item lacking')&&html.includes('재고 없음'),'Required ingredient availability must remain visible');
expect(html.includes('후추 ✓')&&!html.includes('파슬리 ✓'),'Optional ingredient availability must remain accurate');
expect(html.includes('사용할 제품·재고 메모 1')&&html.includes('둘째 &amp; 줄'),'Product notes must render and escape authored text');
expect(html.includes('내가 수정한 조리 기록')&&html.includes('업로드한 원래 기록 보기'),'Edited source recipes must expose current and original records');
expect(html.includes('id="hide-recipe-variant"')&&html.includes('id="reset-source-edit"'),'Source variant management controls must remain available');
expect(html.includes('id="open-cook-mode"')&&html.includes('id="copy-recipe"'),'Recipe actions must remain in the detail renderer');
expect(html.includes('class="recipe-action-icon"')&&html.includes('<span class="recipe-action-copy-icon" aria-hidden="true">⧉</span>'),'Recipe detail actions must show the magnifier and the same copy glyph used on recipe cards');
expect(html.includes('&lt;레시피&gt;')&&html.includes('보통 &lt;단계&gt;'),'Recipe-authored text and labels must be HTML escaped');
expect(html.includes('data-test-context')&&html.includes('data-test-rating'),'Pre-rendered trusted context and rating markup must be preserved');
expect(html.includes('recent-cooking-note')&&html.includes('recent-cooking-actions'),'Recent cooking must have a compact dedicated action row');
expect(html.includes('최근 조리')&&html.includes('id="mark-cooked"')&&html.includes('✓ 먹었어요')&&html.includes('id="clear-cooked"'),'Writable recipe detail must make recent cooking recording discoverable');
expect(html.includes('총 2회')&&html.includes('먹은 기록 2회 보기·편집'),'Recipe detail must summarize cumulative cooking count behind a compact editable disclosure');
expect((html.match(/data-edit-cooked=/g)||[]).length===2&&html.includes('id="cooking-history-new"')&&html.includes('id="add-cooked-record"'),'Writable recipe detail must support editing dates and adding past cooking records');
expect((html.match(/data-remove-cooked=/g)||[]).length===2,'Writable recipe detail must allow exact deletion of individual cooking records');

const readOnlyRecent=recipeDetailHTML({recipe:{name:'읽기 전용',summary:'',time:5,missing:[],matches:[],optional:[],steps:['끝'],source:false},base:{variants:[]},effortLabel:'쉬움',cookingHistory:['2026-09-17T08:30:00.000Z','2026-09-11T08:30:00.000Z'],canRecordCooked:false});
expect(readOnlyRecent.includes('최근 조리')&&readOnlyRecent.includes('먹은 기록 2회 보기'),'Read-only detail must still show existing cumulative cooking history');
expect(!readOnlyRecent.includes('data-edit-cooked')&&!readOnlyRecent.includes('id="cooking-history-new"'),'Read-only detail must render cooking dates as text instead of editable controls');
expect(!readOnlyRecent.includes('id="mark-cooked"')&&!readOnlyRecent.includes('id="clear-cooked"')&&!readOnlyRecent.includes('data-remove-cooked'),'Read-only detail must not expose cooking-history mutation controls');
const readOnlyEmpty=recipeDetailHTML({recipe:{name:'미기록',summary:'',time:5,missing:[],matches:[],optional:[],steps:['끝'],source:false},base:{variants:[]},effortLabel:'쉬움',canRecordCooked:false});
expect(!readOnlyEmpty.includes('최근 조리'),'Read-only detail without history should not add empty cooking-history UI');

const readyDetail=recipeDetailHTML({recipe:{name:'준비된 요리',summary:'',time:5,missing:[],matches:[],optional:[],steps:['끝'],source:false},base:{variants:[]},effortLabel:'쉬움'});
expect(readyDetail.includes('✓ 재료 준비됨')&&!readyDetail.includes('사용 가능한 필수 재료 있음'),'Ready detail status must match the recipe card wording');
const prepDetail=recipeDetailHTML({recipe:{name:'사전 준비 요리',summary:'',time:5,missing:[],matches:[],optional:[],steps:['끝'],source:false,prep:'10분 해동'},base:{variants:[]},effortLabel:'쉬움'});
expect(prepDetail.includes('✓ 재료 준비됨')&&!prepDetail.includes('✓ 재료 있음 · 사전 준비')&&prepDetail.includes('10분 해동'),'Prep status badges must stay compact while the separate prep note remains visible');

const timeMismatch=recipeDetailHTML({recipe:{name:'시간 점검',summary:'',time:40,missing:[],matches:[],optional:[],steps:['양파를 5분 볶아요.','물을 넣고 10분 끓여요.'],source:false},base:{variants:[]},effortLabel:'쉬움',cookingText:'양파를 5분 볶아요.\n물을 넣고 10분 끓여요.'});
expect(timeMismatch.includes('recipe-time-review')&&timeMismatch.includes('현재 40분')&&timeMismatch.includes('본문 추정'),'Large timer-backed differences must be visible without mutating the saved time');
const timeClose=recipeDetailHTML({recipe:{name:'시간 근접',summary:'',time:16,missing:[],matches:[],optional:[],steps:['양파를 5분 볶아요.','물을 넣고 10분 끓여요.'],source:false},base:{variants:[]},effortLabel:'쉬움',cookingText:'양파를 5분 볶아요.\n물을 넣고 10분 끓여요.'});
expect(!timeClose.includes('recipe-time-review'),'Small differences must not add noisy time review UI');

const simple=recipeDetailHTML({recipe:{name:'간단 요리',summary:'',time:5,missing:[],matches:[],optional:[],steps:['팬을 달군다','굽는다'],source:false},base:{variants:[]},effortLabel:'쉬움'});
expect(simple.includes('<ol><li>팬을 달군다</li><li>굽는다</li></ol>'),'Plain custom recipe steps must remain an ordered list');
expect(simple.includes('id="delete-recipe"')&&!simple.includes('id="hide-recipe"'),'Custom recipes must keep their own deletion control');

const authored=recipeDetailHTML({recipe:{name:'번호 요리',summary:'',time:5,missing:[],matches:[],optional:[],steps:['1. 첫 단계','2. 둘째 단계'],source:false},base:{variants:[]},effortLabel:'쉬움'});
expect(authored.includes('class="cooking-step-list"')&&authored.includes('value="1"')&&authored.includes('첫 단계'),'Already-numbered authored steps must remain display text instead of being renumbered');

const random=recipeDetailHTML({recipe:{name:'랜덤',summary:'',time:1,missing:[],matches:[],optional:[],steps:['끝'],source:false},base:{variants:[]},random:true});
expect(random.includes('오늘 고른 메뉴'),'Random menu status must remain distinct');

const cook=cookModeHTML({name:'요리 <이름>',variantLabel:'2인분 & 반'},'1. <굽기>\n2. 먹기',{canRecordCooked:true});
expect(cook.includes('id="close-cook-mode"')&&cook.includes('cook-mode-record'),'Focused cooking view must keep its return control and record container');
expect(cook.includes('class="cook-mode-top-actions"')&&cook.includes('id="mark-cooked-cook"'),'Writable focused cooking view must expose the cooking record action beside the header label');
expect(!cook.includes('조리를 마쳤다면')&&!cook.includes('cook-mode-finish'),'Focused cooking view must not spend vertical space on a separate completion footer');
expect(cook.includes('요리 &lt;이름&gt;')&&cook.includes('2인분 &amp; 반')&&cook.includes('&lt;굽기&gt;'),'Focused cooking view must escape recipe content');
const readOnlyCook=cookModeHTML({name:'읽기 전용'},'끝',{canRecordCooked:false});
expect(!readOnlyCook.includes('mark-cooked-cook'),'Read-only focused cooking view must not expose cooking-history mutation controls');

console.log('Recipe display boundary check passed.');


const nutrientDetail=recipeDetailHTML({recipe:{name:'test',steps:['계란 100g'],matches:[]},nutritionHTML:'<section data-test-nutrition>영양</section>'});
expect(nutrientDetail.indexOf('data-test-nutrition')>nutrientDetail.indexOf('cooking-layout')&&nutrientDetail.indexOf('data-test-nutrition')<nutrientDetail.indexOf('recipe-detail-actions'),'Nutrition immediately follows cooking text, before secondary actions');
expect(recipeCardHTML({recipe:{name:'test',time:15},energyLabel:{text:'700kcal',title:'전체 열량'}}).includes('700kcal'),'Recipe cards expose total energy next to time and portion');
