import fs from 'node:fs';
import {priorityDateInfo,priorityPantryItems} from '../public/pantry-priority.js';
const read=path=>fs.readFileSync(path,'utf8');
const fail=message=>{throw new Error(message);};
const expect=(condition,message)=>{if(!condition)fail(message);};
const app=read('public/app.js'),controller=read('public/pantry-controller.js'),browser=read('public/recipe-browser-controller.js'),shareManager=read('public/share-manager.js'),adminUI=read('public/admin-ui.css');

expect(controller.includes('export function installPantryController'),'Pantry controller must expose explicit installation');
expect(app.includes("import {installPantryController} from './pantry-controller.js"),'app.js must import the pantry controller');
expect(app.includes('const pantryController=installPantryController({'),'app.js must install the pantry controller once');
expect(app.includes('pantryController.render();recipeBrowser.renderRecipes();'),'Full app renders must delegate pantry and recipe rendering to their controllers');
expect(app.includes('openPantry:pantryController.open'),'Recipe browser handoff must inject pantry opening explicitly');
expect(browser.includes("else if(event.target.closest('[data-empty=\"pantry\"]'))openPantry();"),'Recipe empty state must open pantry through the injected controller boundary');
expect(!app.includes('function renderPantry(')&&!app.includes('function renderIngredientHistory('),'Pantry rendering lifecycle must not return to app.js');
expect(!app.includes("$('pantry-list').addEventListener('click'"),'Pantry mutations must not return to app.js');
expect(!app.includes("$('pantry-search').addEventListener('input'"),'Pantry search events must not return to app.js');
expect(!app.includes("$('pantry-toggle').addEventListener('click'"),'Pantry expansion events must not return to app.js');
expect(controller.includes("import {priorityPantryItems} from './pantry-priority.js';"),'Pantry controller must keep priority-date calculation in its pure helper');
expect(controller.includes('function renderPriority(stockForOverride=null){'),'Pantry controller must own the priority summary rendering');
expect(controller.includes('function createStockLookup(stockOverrides){')&&controller.includes('const cache=new Map();'),'Pantry rendering must memoize stock detail lookups within each render path');
expect(controller.includes('renderPriority(stockFor);')&&controller.includes('renderHistory(stockFor);'),'Full pantry renders must reuse the same stock lookup across nested priority and history rendering');
expect(controller.includes('const visible=[],matchingByGroup=groups.map(()=>[]);')&&controller.includes('for(const name of matching)matchingByGroup[stockFor(name).group]?.push(name);'),'Pantry rendering must bucket matching ingredients once instead of rescanning every group');
expect(controller.includes("$('pantry-list').addEventListener('click'"),'Pantry controller must own item actions');
expect(controller.includes("$('pantry-priority-list')?.addEventListener('click'"),'Pantry controller must route priority-summary clicks to stock details');
expect(controller.includes('function archiveIngredient(name){'),'Regular pantry removal and priority-list removal must share one archive path');
expect(controller.includes('class="priority-remove" data-remove='),'Priority pantry rows must expose the same previous-ingredient archive action as the main pantry list');
expect((controller.match(/archiveIngredient\(remove\.dataset\.remove\)/g)||[]).length===2,'Both regular and priority-list X buttons must use the shared archive behavior');
expect(controller.includes("$('pantry-priority-toggle')?.addEventListener('click'"),'Priority summary must support expanding beyond the compact first six items');
expect(controller.includes("sort==='oldest'")&&controller.includes('.addedAt'),'Pantry controller must support oldest-held sorting from automatic addition timestamps');
expect(shareManager.includes("event.target.closest('[data-stock],[data-priority-stock]')"),'Family viewer priority-summary clicks must use the same read-only stock dialog guard as regular pantry items');
expect(adminUI.includes('html[data-access="shared-viewer"] [data-history-restore],')&&adminUI.includes('html[data-access="shared-viewer"] [data-history-delete],'),'Family viewer must hide pantry history restore and permanent-delete actions');
expect(adminUI.includes('html[data-access="shared-viewer"] [data-empty="pantry"],')&&adminUI.includes('html[data-access="shared-viewer"] #ingredient-history>.field-help,'),'Family viewer must hide owner-only pantry-add recovery and archive-management guidance');
expect(controller.includes("if(stored?.priorityDate){stockOverrides[name]={...stored};delete stockOverrides[name].priorityDate;}"),'Archiving a pantry item must clear its lot-specific priority date');
expect(controller.includes("$('history-list')?.addEventListener('click',handleHistoryClick)"),'Pantry controller must own history actions');
expect(controller.includes("if(!saved)applyContext(previous);"),'Pantry mutations must rollback local state when persistence fails');
expect(controller.includes('stockEditor.open(info.dataset.stock)'),'Stock detail handoff must remain explicit');
expect(controller.includes("stockEditor.open(target.dataset.reviewStock,false,{autoResearch:true})"),'Nutrition review items must open one existing ingredient with targeted automatic research instead of bulk network calls');
expect(controller.includes('stockEditor.restore(restore.dataset.historyRestore)'),'History restore handoff must remain explicit');
expect(controller.includes('updateStorageState();')&&controller.includes('renderHistory(stockFor);'),'Full pantry renders must refresh storage status and history');
expect(controller.includes("const PANTRY_GROUP_PREF='mlk-pantry-collapsed-groups-v2';"),'Pantry collapse state must reset for the new taxonomy');
expect(controller.includes('const defaultCollapsedGroups=()=>new Set(groups.map((_,index)=>index));'),'A browser without a pantry preference must start with compact collapsed groups');
expect(controller.includes('pantryGroupIcon(index)'),'Pantry group summaries must render the taxonomy icon');
expect(controller.includes('if(raw===null)return defaultCollapsedGroups();'),'Pantry collapse defaults must only apply when the browser has no saved preference');
expect(controller.includes('if(!Array.isArray(stored))return defaultCollapsedGroups();'),'Malformed pantry UI preferences must fall back to the compact default');
expect(controller.includes('const collapsedGroups=loadCollapsedGroups();'),'Pantry controller must restore the local collapse preference on install');
expect(controller.includes('localStorage.setItem(PANTRY_GROUP_PREF'),'Pantry collapse preference must stay local instead of entering kitchen state');
expect((controller.match(/saveCollapsedGroups\(collapsedGroups\);/g)||[]).length===2,'Both individual and all-group collapse actions must persist the local preference');

const now=new Date('2026-09-17T12:00:00.000Z');
expect(priorityDateInfo('2026-09-16',now)?.days===-1,'Priority-date helper must identify dates that already passed');
expect(priorityDateInfo('2026-09-17',now)?.relativeLabel==='오늘','Priority-date helper must label the current date');
expect(priorityDateInfo('2026-09-18',now)?.relativeLabel==='내일','Priority-date helper must label tomorrow');
expect(priorityDateInfo('2026-02-30',now)===null,'Priority-date helper must reject impossible calendar dates');
const stockByName={
 later:{status:'available',priorityDate:'2026-09-25'},
 first:{status:'available',priorityDate:'2026-09-18'},
 incoming:{status:'incoming',priorityDate:'2026-09-17'},
 none:{status:'available'}
};
const priority=priorityPantryItems(['later','incoming','none','first'],name=>stockByName[name],now,6);
expect(priority.total===2&&priority.items.map(item=>item.name).join('|')==='first|later','Priority pantry list must exclude incoming/undated items and sort by date');

console.log('Pantry controller boundary check passed.');
