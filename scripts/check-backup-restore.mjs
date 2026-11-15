import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

const nativeFetch=globalThis.fetch;
globalThis.fetch=async input=>{
 const url=input instanceof URL?input:new URL(String(input));
 if(url.protocol!=='file:')return nativeFetch(input);
 const path=fileURLToPath(url);
 try{return {ok:true,json:async()=>JSON.parse(fs.readFileSync(path,'utf8'))};}
 catch{return {ok:false,json:async()=>{throw new Error(`Unable to read ${path}`);}};}
};

const {buildKitchenRestoreState,parseKitchenBackup,stockText}=await import('../public/backup-tools.js');
const app=fs.readFileSync('public/app.js','utf8');
const backupTools=fs.readFileSync('public/backup-tools.js','utf8');
const backupValidation=fs.readFileSync('public/backup-validation.js','utf8');
const backupUi=fs.readFileSync('public/backup-ui.js','utf8');
const fail=message=>{throw new Error(message);};
const expect=(condition,message)=>{if(!condition)fail(message);};
const expectThrows=(fn,fragment)=>{let error=null;try{fn();}catch(e){error=e;}expect(error&&String(error.message).includes(fragment),`Expected error containing: ${fragment}`);};

expect(backupTools.includes('export function parseKitchenBackup'),'backup-tools.js must own backup parsing and validation');
expect(backupTools.includes('export function buildKitchenRestoreState'),'backup-tools.js must own replace/merge restore construction');
expect(backupTools.includes("from './backup-validation.js?v=20260919-1'"),'backup-tools.js must reuse the shared backup validation module');
expect(backupTools.includes('export {validateCuration,validateLibrary};'),'backup-tools.js must preserve the validation re-export API');
expect(!backupTools.includes('export function validateCuration'),'backup-tools.js must not duplicate the extracted validation implementation');
expect(backupValidation.includes('export function validateCuration')&&backupValidation.includes('export function validateLibrary'),'backup-validation.js must own shared backup/library validation');
expect(backupTools.includes('cookingHistory:validateCookingHistory(value.cookingHistory,value.lastCooked)'),'Backup parsing must validate cumulative cooking history and migrate legacy recent-cooking records');
expect(backupTools.includes('`소비 우선일: ${d.priorityDate}`'),'Human-readable stock exports must preserve pantry priority dates');
expect(backupUi.includes('parseKitchenBackup('),'backup-ui.js must delegate imported backup validation');
expect(backupUi.includes('buildKitchenRestoreState('),'backup-ui.js must delegate restore-state construction');
expect(!app.includes('parseKitchenBackup('),'Backup parsing must not return to app.js');
expect(!app.includes('buildKitchenRestoreState('),'Restore-state construction must not return to app.js');
expect(!app.includes("const incoming={items:validateItems(d.items)"),'Backup field validation must not return to app.js');
expect(!app.includes("const stock={...stockOverrides};for(const n of d.items)"),'Backup merge construction must not return to app.js');

const recipe=(id,name)=>({id,name,category:'main',effort:2,time:15,required:['감자'],optional:[],summary:'테스트 요리',steps:['익힌다'],note:''});
const stock=(note='',priorityDate='',addedAt='')=>({group:3,status:'available',locations:[],notes:note?[note]:[],...(priorityDate?{priorityDate}:{}),...(addedAt?{addedAt}:{})});

expectThrows(()=>parseKitchenBackup({version:9}),'이 주방에서 만든 JSON 백업');
expectThrows(()=>parseKitchenBackup({version:3,kind:'wrong'}),'이 주방에서 만든 JSON 백업');
expectThrows(()=>parseKitchenBackup({version:2,items:[],recipes:[],stock:{},edits:[],recipeGroupMeta:{},hidden:[],hiddenVariants:[],trashPurgedVariants:[],trashPurged:[],ratings:{},cookingHistory:{'user-bad':['not-a-date']}}),'조리 이력 시각');
expectThrows(()=>parseKitchenBackup({version:2,items:['감자'],recipes:[],stock:{감자:stock('잘못된 날짜','2026-02-30')},edits:[],recipeGroupMeta:{},hidden:[],hiddenVariants:[],trashPurgedVariants:[],trashPurged:[],ratings:{}}),'소비 우선일');

const incoming=parseKitchenBackup({
 version:2,
 items:['감자','당근','감자'],
 recipes:[recipe('user-existing','백업의 기존 요리'),recipe('user-new','새 요리')],
 stock:{감자:stock('백업 감자','2026-09-19','2026-09-01T03:00:00.000Z'),당근:stock('백업 당근','2026-09-20','2026-09-02T03:00:00.000Z')},
 history:[{name:'예전 재료',archivedAt:''},{name:'당근',archivedAt:''}],
 historySeedVersion:1,
 edits:[],recipeGroupMeta:{},hidden:[],hiddenVariants:[],trashPurgedVariants:[],trashPurged:[],
 ratings:{'user-existing':2.5,'user-new':4.5},
 cookingHistory:{'user-existing':['2026-09-10T10:00:00.000Z','2026-09-05T10:00:00.000Z']},
 lastCooked:{'user-new':'2026-09-12T10:00:00.000Z'}
});
expect(incoming.items.length===2&&incoming.items[0]==='감자'&&incoming.items[1]==='당근','Backup parsing must normalize duplicate pantry items');
expect(incoming.recipeCategoryVersion===2,'Backup parsing must advance the recipe category taxonomy version');
expect(incoming.recipes.length===2&&incoming.ratings['user-new']===4.5,'Backup parsing must preserve validated recipes and ratings');
expect(incoming.lastCooked['user-new']==='2026-09-12T10:00:00.000Z','Backup parsing must migrate a legacy recent-cooking timestamp');
expect(incoming.cookingHistory['user-existing'].length===2&&incoming.cookingHistory['user-new'][0]==='2026-09-12T10:00:00.000Z','Backup parsing must preserve cumulative history while migrating legacy entries');
expect(incoming.stock['당근'].priorityDate==='2026-09-20'&&incoming.stock['당근'].addedAt==='2026-09-02T03:00:00.000Z','Backup parsing must preserve pantry priority and addition dates');
const stockExport=stockText(['당근'],name=>incoming.stock[name],{available:'사용 가능'},['a','b','c','채소·과일'],[]);
expect(stockExport.includes('소비 우선일: 2026-09-20'),'Stock text export must include a saved priority date');
expect(stockExport.includes('재고 추가일:'),'Stock text export must include an automatic pantry addition date');

const currentState={
 version:2,seedRevision:'current-seed',items:['감자','양파'],recipes:[recipe('user-existing','현재 요리')],
 stock:{감자:stock('현재 감자','2026-09-25','2026-08-20T03:00:00.000Z'),양파:stock('현재 양파')},history:[{name:'지난 재료',archivedAt:''}],historySeedVersion:3,
 edits:[],recipeGroupMeta:{'user-existing':{pairing:'현재 음료',note:'',servingNote:'',related:[]}},hidden:[],hiddenVariants:[],trashPurgedVariants:[],trashPurged:[],
 ratings:{'user-existing':5},cookingHistory:{'user-existing':['2026-09-15T10:00:00.000Z','2026-09-10T10:00:00.000Z']}
};
incoming.trashPurgedVariants=['source-281/281'];
currentState.hiddenVariants=['source-281/281'];
const merged=buildKitchenRestoreState(incoming,{replace:false,currentState});
expect(merged.items.join('|')==='감자|양파|당근','Merge restore must append only new pantry items');
expect(merged.stock['감자'].notes[0]==='현재 감자','Merge restore must not overwrite stock metadata for an existing pantry item');
expect(merged.stock['감자'].priorityDate==='2026-09-25'&&merged.stock['감자'].addedAt==='2026-08-20T03:00:00.000Z','Merge restore must not overwrite existing pantry priority or addition dates');
expect(merged.stock['당근'].notes[0]==='백업 당근'&&merged.stock['당근'].priorityDate==='2026-09-20','Merge restore must import stock metadata and priority date for a newly added pantry item');
expect(merged.recipes.length===2&&merged.recipes.find(r=>r.id==='user-existing')?.name==='현재 요리'&&merged.recipes.some(r=>r.id==='user-new'),'Merge restore must preserve existing custom recipes while adding new IDs');
expect(merged.historySeedVersion===3,'Merge restore must keep the newer ingredient-history seed version');
expect(merged.history.some(h=>h.name==='지난 재료')&&merged.history.some(h=>h.name==='예전 재료')&&!merged.history.some(h=>h.name==='당근'),'Merge restore must combine archive history while removing ingredients that are active again');
expect(merged.ratings['user-existing']===5&&merged.ratings['user-new']===4.5,'Merge restore must preserve current ratings while accepting ratings for new recipes');
expect(merged.recipeGroupMeta['user-existing']?.pairing==='현재 음료','Merge restore must keep current group metadata when the same recipe already exists');
expect(merged.lastCooked['user-existing']==='2026-09-15T10:00:00.000Z'&&merged.lastCooked['user-new']==='2026-09-12T10:00:00.000Z','Merge restore must derive the newest cooking time per recipe');
expect(merged.cookingHistory['user-existing'].length===3&&merged.cookingHistory['user-existing'][0]==='2026-09-15T10:00:00.000Z','Merge restore must combine and deduplicate cumulative cooking history');
expect(merged.trashPurgedVariants.includes('source-281/281')&&!merged.hiddenVariants.includes('source-281/281'),'Permanent variant deletion must win over reversible hidden state during merge restore');

const replaced=buildKitchenRestoreState(incoming,{replace:true,currentState,seedRevision:'replacement-seed'});
expect(replaced.version===2&&replaced.seedRevision==='replacement-seed','Replace restore must write the current runtime state version and seed revision');
expect(replaced.recipeCategoryVersion===2&&merged.recipeCategoryVersion===2,'Backup restore must persist the current recipe category taxonomy version');
expect(replaced.items.join('|')==='감자|당근'&&replaced.recipes.length===2,'Replace restore must use the backup pantry and recipe collections directly');
expect(replaced.history.some(h=>h.name==='당근'),'Replace restore must preserve the backup history exactly as validated');
expect(replaced.lastCooked['user-existing']==='2026-09-10T10:00:00.000Z'&&replaced.cookingHistory['user-existing'].length===2,'Replace restore must use the backup cumulative cooking history exactly');
expect(replaced.stock['감자'].priorityDate==='2026-09-19'&&replaced.stock['감자'].addedAt==='2026-09-01T03:00:00.000Z','Replace restore must use backup pantry priority and addition dates exactly');
expect(replaced.trashPurgedVariants.includes('source-281/281'),'Replace restore must preserve permanent variant deletions');

console.log('Backup restore boundary check passed.');
