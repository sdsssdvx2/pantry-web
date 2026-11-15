import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const fail=message=>{throw new Error(message);};
const expect=(condition,message)=>{if(!condition)fail(message);};

const app=read('public/app.js');
const controller=read('public/rating-controller.js');

expect(app.includes("import {installRatingController} from './rating-controller.js';"),'app.js must import the rating controller');
expect(app.includes('const ratingController=installRatingController({'),'app.js must install one rating controller');
expect(app.includes('saveRating:ratingController.saveRating'),'Recipe browser/dialog must receive rating saves from the rating controller');
expect(controller.includes("import {ratingHTML,previewRating,installRatingInputs} from './ratings.js';"),'Rating controller must import rating rendering/input helpers');
expect(controller.includes('export function installRatingController'),'Rating controller must expose explicit installation');
expect(controller.includes('function saveRating(widget,value){'),'Rating controller must own rating state changes');
expect(controller.includes('if(!persist()){'),'Rating controller must retain failed-save rollback');
expect(controller.includes('applyContext({ratings:previous});'),'Failed rating saves must restore previous rating state');
expect(controller.includes('previewRating(widget,previous[id]||0);'),'Failed rating saves must restore the visible rating preview');
expect(controller.includes('renderRecipes();'),'Successful rating saves must refresh recipe cards');
expect(controller.includes("$('dialog-content').querySelector('.recipe-rating').outerHTML=ratingHTML"),'Successful rating saves must refresh an open detail rating');
expect(controller.includes("installRatingInputs([$('recipe-dialog')],saveRating);"),'Rating controller must install detail-dialog rating inputs');

for(const stale of [
 'function saveRating(widget,value){',
 "installRatingInputs([$('recipe-dialog')],saveRating);",
 'previewRating(widget,ratings[id]||0)'
])expect(!app.includes(stale),`Rating mutation behavior must not remain in app.js: ${stale}`);

console.log('Rating controller boundary check passed.');
