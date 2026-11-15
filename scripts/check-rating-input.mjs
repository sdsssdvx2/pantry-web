import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const fail=message=>{throw new Error(message);};
const expect=(condition,message)=>{if(!condition)fail(message);};

const app=read('public/app.js');
const kitchenState=fs.existsSync('public/kitchen-state.js')?read('public/kitchen-state.js'):'';
const browserController=read('public/recipe-browser-controller.js');
const dialogController=read('public/recipe-dialog-controller.js');
const ratingController=read('public/rating-controller.js');
const ratings=read('public/ratings.js');
// Live-site workflows (they use the private share link) live only in the private
// data repository; the public code repository skips their contract checks.
const liveSmokePath='.github/workflows/rating-live-smoke.yml';
const liveSmoke=fs.existsSync(liveSmokePath)?read(liveSmokePath):null;

if(kitchenState){
 expect(app.includes("import {ratingHTML} from './ratings.js';"),'app.js must retain only detail rating markup from ratings.js after state validation delegation');
 expect(kitchenState.includes("import {validateRatings} from './ratings.js';"),'kitchen-state.js must own persisted rating validation');
}else{
 expect(app.includes("import {validateRatings,ratingHTML} from './ratings.js';"),'app.js must retain rating validation/detail markup dependencies before state delegation');
}
expect(ratingController.includes("import {ratingHTML,previewRating,installRatingInputs} from './ratings.js';"),'Rating controller must import dialog rating rendering/input helpers from ratings.js');
expect(browserController.includes("import {ratingFilters,ratingHTML,handleRatingClick,installRatingInputs} from './ratings.js';"),'Recipe browser controller must import grid rating helpers from ratings.js');
expect(dialogController.includes("import {handleRatingClick} from './ratings.js';"),'Recipe dialog controller must import rating click interpretation from ratings.js');
expect(ratingController.includes("installRatingInputs([$('recipe-dialog')],saveRating);"),'Rating controller must install rating inputs for the detail dialog');
expect(browserController.includes("installRatingInputs([$('recipe-grid')],saveRating);"),'Recipe browser controller must install rating inputs for the grid');
expect(!app.includes('function handleRatingClick(')&&!browserController.includes('function handleRatingClick(')&&!dialogController.includes('function handleRatingClick(')&&!ratingController.includes('function handleRatingClick('),'Rating click mechanics must not leave ratings.js');
expect(!app.includes("addEventListener('pointerover'")&&!browserController.includes("addEventListener('pointerover'")&&!dialogController.includes("addEventListener('pointerover'")&&!ratingController.includes("addEventListener('pointerover'"),'Rating hover mechanics must not leave ratings.js');
expect(!app.includes("addEventListener('pointerout'")&&!browserController.includes("addEventListener('pointerout'")&&!dialogController.includes("addEventListener('pointerout'")&&!ratingController.includes("addEventListener('pointerout'"),'Rating hover reset mechanics must not leave ratings.js');
expect(browserController.includes('if(handleRatingClick(event,saveRating))return;'),'Recipe grid clicks must delegate rating clicks with the save callback before card actions');
expect(dialogController.includes('if(handleRatingClick(event,saveRating))return;'),'Recipe dialog clicks must delegate rating clicks with the save callback before dialog actions');
expect(!browserController.includes('handleRatingClick(event)')&&!dialogController.includes('handleRatingClick(event)'),'Rating click delegation must not omit the save callback');

expect(ratingController.includes('function saveRating(widget,value){'),'Rating controller must own rating state mutation and persistence');
expect(ratingController.includes('if(!persist()){'),'Failed rating writes must retain an explicit rollback branch');
expect(ratingController.includes('applyContext({ratings:previous});'),'Failed rating writes must restore rating state');
expect(ratingController.includes('previewRating(widget,previous[id]||0);'),'Failed rating writes must restore the visible preview');
expect(!app.includes('function saveRating(widget,value){'),'Rating mutation must not return to app.js');
expect(app.includes('saveRating:ratingController.saveRating'),'Feature controllers must receive the rating controller callback');

expect(ratings.includes('export function handleRatingClick(event,onSave){'),'ratings.js must own rating click interpretation');
expect(ratings.includes('export function installRatingInputs(roots,onSave){'),'ratings.js must own rating pointer and keyboard bindings');
expect(ratings.includes("root.addEventListener('pointerover'"),'ratings.js must preview hovered rating values');
expect(ratings.includes("root.addEventListener('pointerout'"),'ratings.js must restore the saved rating preview');
expect(ratings.includes("root.addEventListener('keydown'"),'ratings.js must support keyboard rating input');
expect(ratings.includes("Math.min(5,current+0.5)"),'Rating keyboard increment must remain 0.5');
expect(ratings.includes("Math.max(0.5,current-0.5)"),'Rating keyboard decrement must remain 0.5');
expect(ratings.includes("key==='Home')value=0.5"),'Home must select the minimum rating');
expect(ratings.includes("key==='End')value=5"),'End must select the maximum rating');
expect(ratings.includes("['Delete','Backspace'].includes(key))value=0"),'Delete and Backspace must clear the rating');
expect(ratings.includes("if(!widget)return false;"),'Clicks outside a rating widget must pass through');
expect(ratings.includes('return true;'),'Clicks inside a rating widget must be consumed before card/dialog actions');

if(liveSmoke)expect(liveSmoke.includes('workflow_dispatch:')&&!liveSmoke.includes('workflow_run:'),'The additional rating smoke stays manual to avoid duplicate browser runs');
if(liveSmoke)expect(liveSmoke.includes('별점 클릭이 카드 상세 열기로 전파되었습니다.'),'Live Chrome smoke must verify grid rating clicks do not bubble into card detail');
if(liveSmoke)expect(liveSmoke.includes('localAfter !== localBefore'),'Live Chrome smoke must verify read-only grid rating clicks do not mutate local state');
if(liveSmoke)expect(liveSmoke.includes('dialogLocalAfter !== dialogLocalBefore'),'Live Chrome smoke must verify read-only dialog rating clicks do not mutate local state');
if(liveSmoke)expect(liveSmoke.includes('상세 별점 클릭에서 JavaScript 오류가 발생했습니다'),'Live Chrome smoke must exercise the dialog rating callback path');
if(liveSmoke)expect(liveSmoke.includes("page.$eval('#recipe-grid .recipe-card .recipe-rating'"),'Live Chrome smoke must click a real grid rating widget');
if(liveSmoke)expect(liveSmoke.includes("page.$eval('#recipe-dialog[open] .recipe-rating'"),'Live Chrome smoke must click a real dialog rating widget');

console.log('Rating input boundary check passed.');
