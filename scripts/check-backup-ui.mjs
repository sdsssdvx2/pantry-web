import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const fail=message=>{throw new Error(message);};
const expect=(condition,message)=>{if(!condition)fail(message);};

const app=read('public/app.js');
const ui=read('public/backup-ui.js');
const history=read('public/backup-history.js');
const index=read('public/index.html');

expect(!app.includes("import {installBackupUI} from './backup-ui.js';"),'Shared app evaluation must not statically load the owner-only backup UI controller');
expect(app.includes("import {downloadBackupData} from './download-file.js?v=20260919-1';"),'Legacy migration backup must use the lightweight shared download helper');
expect(app.includes("const downloadLegacyBackup=canSaveKitchenState()?downloadBackupData:null;"),'Legacy migration backup helper must only be enabled for writable sessions');
expect(app.includes("backupButton?.addEventListener('click',()=>{"),'Backup UI must load on first explicit backup button use');
expect(app.includes("backupUIPromise=import('./backup-ui.js?v=20260919-9').then(({installBackupUI})=>{"),'Owner app must lazily load the current backup UI controller');
expect(app.includes('if(canSaveKitchenState()){'),'Backup UI loading must stay inside the writable owner-session boundary');
expect(app.includes('if(migrated&&downloadLegacyBackup){'),'Legacy migration notice must only activate when a writable backup helper is available');
expect(app.includes("downloadLegacyBackup(JSON.parse(localStorage.getItem(STORAGE+'-before-user-import')),'my-kitchen-before-user-import.json')"),'Legacy migration backup button must call a defined download helper');
expect(!/(^|[^A-Za-z0-9_$])download\(/m.test(app),'app.js must not call an undefined bare download helper');
expect(app.includes('installBackupUI({'),'app.js must install the backup UI controller after lazy loading');
expect(app.includes('function applyRestoredKitchen(next,replace){'),'app.js must keep final restored-state ownership');
expect(app.includes('restoredLibrary=next.library||null'),'app.js must apply restored library state');
expect(app.includes('applyKitchenStateFields(next,next.recipes);refreshCurationState();selectedVariants={};'),'Backup restore must use the centralized kitchen-state applier and reset selected variants');
expect(app.includes('cookingHistory=next.cookingHistory||{};lastCooked=next.lastCooked||latestCookedMap(cookingHistory);'),'Centralized restored-state application must keep cumulative and derived cooking history in sync');
expect(!app.includes("function download(data,name,type='application/json')"),'Download/file mechanics must not return to app.js');
expect(!app.includes("$('import-file').addEventListener('change'"),'Backup file input handling must not return to app.js');
expect(!app.includes("$('backup-dialog').addEventListener('click',async"),'Backup export click handling must not return to app.js');
expect(!app.includes('pendingImport'),'Import draft state must be owned by backup-ui.js');
expect(!app.includes('backupFocus'),'Backup focus state must be owned by backup-ui.js');

expect(ui.includes('export function installBackupUI'),'backup-ui.js must expose one installation boundary');
expect(ui.includes('export {downloadBackupData};'),'backup-ui.js must re-export the shared backup download helper');
expect(ui.includes('let pendingImport=null,backupFocus=null'),'backup-ui.js must own transient import and focus state');
expect(ui.includes("$('open-recipe-backup').addEventListener('click',openBackup)"),'Kitchen management backup shortcut must open the shared backup dialog');
expect(!ui.includes("$('export').addEventListener"),'Retired pantry export shortcut must not return');
expect(!ui.includes("$('import').addEventListener"),'Retired pantry import shortcut must not return');
expect(ui.includes("$('choose-backup').addEventListener('click',()=>$('import-file').click())"),'Backup dialog must own the JSON file picker');
expect(ui.includes("$('recover-raw').addEventListener('click'"),'Unreadable raw-state recovery must remain available');
expect(ui.includes("if(file.size>15000000)throw Error('15MB 이하 JSON 백업을 선택해 주세요.')"),'Backup import size guard must remain intact');
expect(ui.includes('cookingHistory:context.cookingHistory')&&ui.includes('lastCooked:context.lastCooked'),'Human-readable recipe export must include cumulative and compatibility cooking records');
expect(ui.includes('먹은 기록 ${cookedCount}회'),'Restore preview must summarize cumulative cooking records');
expect(ui.includes('priorityDate:data.priorityDate')&&ui.includes('addedAt:data.addedAt'),'Full JSON backup must preserve pantry priority and automatic addition dates');
expect(ui.includes('parseKitchenBackup('),'backup-ui.js must delegate validation to backup-tools.js');
expect(ui.includes('buildKitchenRestoreState('),'backup-ui.js must delegate restore construction to backup-tools.js');
expect(ui.includes('if(!saveKitchenState(nextRaw))throw Object.assign'),'Durable save must succeed before app state is replaced');
expect(ui.indexOf('saveKitchenState(nextRaw)')<ui.indexOf('applyRestore(next,replace)'),'App state must only be applied after durable save succeeds');
expect(ui.includes("event.target.value=''"),'Backup file input must reset after every import attempt');
expect(ui.includes("if(backupFocus?.isConnected)backupFocus.focus()"),'Backup dialog must restore prior focus');
expect(ui.includes("$('restore-mode').disabled=!!parsed.library"),'Library-carrying backups must remain replace-only');
expect(ui.includes("기존 자료는 유지됩니다."),'Failed durable restore must explicitly preserve existing data');

expect(history.includes("import { flushAndPauseSync, readConflictStateRaw } from './cloud-sync.js';"),'Server backup UI must also expose the browser-side preserved conflict copy');
expect(history.includes('id="sync-conflict-recovery"'),'Backup dialog must contain a dedicated sync-conflict recovery area');
expect(history.includes("fetch('/api/conflicts/latest'"),'Backup dialog must discover preserved server conflict metadata without loading the full payload');
expect(history.includes("fetch('/api/conflicts/' + encodeURIComponent(latestServerConflict.id)"),'Server conflict payload must only be fetched when the owner explicitly downloads it');
expect(history.includes('downloadConflictRaw(raw'),'Browser conflict recovery must download the preserved raw kitchen state');
expect(history.includes('downloadConflictRaw(data.conflict.data'),'Server conflict recovery must download the preserved raw kitchen state');
expect(history.includes('JSON 백업 복원에서 다시 불러올 수 있어요.'),'Conflict recovery copy must explain that the downloaded JSON can be restored through the existing flow');

expect(index.includes('<summary>주방 관리</summary>'),'Global maintenance controls must be grouped under Kitchen management');
expect(index.includes('id="open-recipe-backup" class="text-button recipe-backup-link">백업·복원</button>'),'Kitchen management must expose one backup and restore entry');
expect(index.includes('id="backup-title">백업·복원</h2>'),'Backup dialog title must cover both export and restore');
expect(index.includes('id="import-file" type="file" accept="application/json,.json" hidden'),'JSON file input must remain inside the backup dialog flow');
expect(!index.includes('id="export"'),'Duplicate pantry backup export entry must stay removed');
expect(!index.includes('id="import"'),'Duplicate pantry backup import entry must stay removed');

console.log('Backup UI boundary check passed.');
