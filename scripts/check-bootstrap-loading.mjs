import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Execute the real ESM entry with isolated dependencies, not fixed import dates
// or source-format checks.
if(!vm.SourceTextModule){
 const result=spawnSync(process.execPath,['--experimental-vm-modules',fileURLToPath(import.meta.url)],{stdio:'inherit'});
 process.exit(result.status??1);
}
const source=fs.readFileSync('public/bootstrap.js','utf8');
const settle=async()=>{await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));};
async function boot(role,{scope='viewer',failures=[],sessionFailure=false}={}){
 const calls=[],imports=[],fields=new Map(),modules=new Map(),failOnce=new Set(failures);
 class Field{
  constructor(){this.listeners=new Map();this.disabled=false;this.checked=false;this.textContent='';}
  addEventListener(type,fn){const list=this.listeners.get(type)||[];list.push(fn);this.listeners.set(type,list);}
  dispatchEvent(event){for(const fn of [...this.listeners.get(event.type)||[]])fn(event);return true;}
  click(){this.dispatchEvent(new Event('click'));}
 }
 for(const id of ['copy-pantry','search-notes','open-recipe-backup','refresh-server-backups','backup-error'])fields.set(id,new Field());
 const document={documentElement:{dataset:{}},getElementById:id=>fields.get(id)||null};
 const record=name=>(...args)=>calls.push({name,args});
 const exports={
  'cloud-sync.js':{initCloudSync:async options=>{assert.equal(document.documentElement.dataset.access,role==='owner'?'owner':undefined);calls.push({name:'sync',args:[options]});}},
  'sync-status-ui.js':{installSyncStatusUI:record('sync-ui')},
  'pantry-ui.js':{installPantryUI:record('pantry-ui')},
  'theme-toggle.js':{installThemeToggle:record('theme')},
  'custom-select.js':{installCustomSelects:record('selects')},
  'share-manager.js':{installReadOnlyMode:record('read-only'),installShareManager:record('share-manager')},
  'access-manager.js':{installAccessManager:record('access-manager')},
  'note-delete.js':{installNoteDelete:record('note-delete')},
  'backup-history.js':{installBackupHistory:()=>{record('backup-install')();fields.get('refresh-server-backups').addEventListener('click',record('backup-refresh'));}},
  'app.js':{},'ingredient-draft.js':{},'pantry-copy.js':{},'cooking-tip-search.js':{}
 };
 const context=vm.createContext({document,Event,setTimeout:()=>0,console:{error:record('error')},
  fetch:async path=>{assert.equal(path,'/api/session');record('session')();if(sessionFailure)throw new Error('offline');return {ok:true,json:async()=>({role,scope,label:'fixture'})};}
 });
 async function dependency(specifier){
  const name=new URL(specifier,'https://fixture.invalid/').pathname.split('/').pop();
  imports.push(name);
  if(failOnce.delete(name))throw new Error('injected import failure');
  if(modules.has(name))return modules.get(name);
  assert.ok(Object.hasOwn(exports,name),'Unexpected bootstrap dependency: '+name);
  const module=new vm.SyntheticModule(Object.keys(exports[name]),function(){
   record('module:'+name)();
   for(const [key,value] of Object.entries(exports[name]))this.setExport(key,value);
   if(name==='pantry-copy.js')fields.get('copy-pantry').addEventListener('click',record('copy'));
   if(name==='cooking-tip-search.js')fields.get('search-notes').addEventListener('change',record('tip-search'));
  },{context,identifier:name});
  modules.set(name,module);await module.link(()=>{});return module;
 }
 const entry=new vm.SourceTextModule(source,{context,identifier:'https://fixture.invalid/bootstrap.js',
  importModuleDynamically:async specifier=>{const module=await dependency(specifier);await module.evaluate();return module;}
 });
 await entry.link(dependency);await entry.evaluate();
 return {calls,imports,fields,async click(id){fields.get(id).click();await settle();},async change(id){fields.get(id).dispatchEvent(new Event('change'));await settle();}};
}

for(const role of ['owner','share','none']){
 const run=await boot(role,{sessionFailure:role==='none'});
 const names=run.calls.map(call=>call.name);
 assert.ok(names.indexOf('theme')<names.indexOf('session'),'Theme must work before session/network setup');
 assert.ok(names.indexOf('sync')<names.indexOf('module:app.js'),'State must initialize before the app');
 assert.ok(names.indexOf('module:app.js')<names.indexOf('module:ingredient-draft.js'));
 assert.equal(run.calls.find(call=>call.name==='sync').args[0].readOnly,role!=='owner');
 for(const name of ['access-manager','note-delete','share-manager'])assert.equal(names.includes(name),role==='owner');
 assert.equal(names.includes('read-only'),role==='share');
 for(const name of ['pantry-copy.js','cooking-tip-search.js','backup-history.js'])assert.ok(!run.imports.includes(name),name+' must wait until needed');
 await run.click('copy-pantry');await run.click('copy-pantry');
 assert.equal(run.imports.filter(name=>name==='pantry-copy.js').length,1);
 assert.equal(run.calls.filter(call=>call.name==='copy').length,2);
 run.fields.get('search-notes').checked=true;await run.change('search-notes');
 assert.equal(run.imports.filter(name=>name==='cooking-tip-search.js').length,1);
 assert.equal(run.calls.filter(call=>call.name==='tip-search').length,1);
 await run.click('open-recipe-backup');await run.click('open-recipe-backup');
 assert.equal(run.calls.filter(call=>call.name==='backup-install').length,role==='owner'?1:0);
 assert.equal(run.calls.filter(call=>call.name==='backup-refresh').length,role==='owner'?1:0);
 if(role!=='owner')for(const name of ['access-manager.js','note-delete.js','backup-history.js'])assert.ok(!run.imports.includes(name));
}
const retry=await boot('owner',{failures:['pantry-copy.js','backup-history.js']});
await retry.click('copy-pantry');assert.equal(retry.fields.get('copy-pantry').disabled,false);
await retry.click('copy-pantry');assert.equal(retry.calls.filter(call=>call.name==='copy').length,1);
await retry.click('open-recipe-backup');assert.ok(retry.fields.get('backup-error').textContent);
await retry.click('open-recipe-backup');assert.equal(retry.calls.filter(call=>call.name==='backup-install').length,1);

// CSS access boundaries are structural; keep them separate from runtime checks.
const css=fs.readFileSync('public/admin-ui.css','utf8');
for(const selector of ['.private','[data-stock]','[data-priority-stock]','#add-form','#open-recipe-backup','.recipe-rating button']){
 assert.ok(css.includes('html:not([data-access]) '+selector),'Unresolved sessions must hide '+selector);
}
console.log('Bootstrap runtime: role boundaries, initialization order, lazy loading and failed-import retries passed.');
