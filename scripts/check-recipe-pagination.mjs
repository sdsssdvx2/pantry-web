import fs from 'node:fs';
import {createRecipePager} from '../public/recipe-pagination.js';

const read=path=>fs.readFileSync(path,'utf8');
const fail=message=>{throw new Error(message);};
const expect=(condition,message)=>{if(!condition)fail(message);};

const pager=createRecipePager(24);
let page=pager.page(Array.from({length:80},(_,i)=>`r-${i}`));
expect(page.limit===24&&page.hasMore&&page.remaining===56,'first page must expose 24 of 80 recipes');
pager.more();
page=pager.page(Array.from({length:80},(_,i)=>`r-${i}`));
expect(page.limit===48&&page.remaining===32,'more() must advance by one page');
page=pager.page(Array.from({length:10},(_,i)=>`other-${i}`));
expect(page.limit===10&&!page.hasMore&&page.remaining===0,'changing result set must reset pagination');

const browser=read('public/recipe-browser-controller.js'),html=read('public/index.html'),css=read('public/style.css');
expect(browser.includes("import {createRecipePager} from './recipe-pagination.js';"),'Recipe browser controller must import recipe pager');
expect(browser.includes('const recipePager=createRecipePager(24);'),'Recipe browser controller must use a 24-card page size');
expect(browser.includes('visible=list.slice(0,page.limit)'),'Recipe browser controller must render only the current recipe page');
expect(browser.includes("$('load-more-recipes').addEventListener('click'"),'load-more button must expand the recipe page through the browser controller');
expect(html.includes('id="load-more-recipes"'),'index.html must provide the load-more control');
expect(css.includes('.recipe-load-more{'),'style.css must style the load-more row');

console.log('Recipe pagination check passed.');
