import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {mergeKitchenStates} from '../public/sync-merge.js';

const source=fs.readFileSync('public/cloud-sync.js','utf8').replace(/\r\n?/g,'\n').replace(/^import .*;\n/gm,'').replace(/export /g,'');
const settle=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
function harness(initial='initial'){
 let now=0,id=0;
 const timers=new Map(),storage=new Map(),requests=[];
 const window=new EventTarget(),document=new EventTarget();document.visibilityState='visible';
 let respond=async()=>new Response(JSON.stringify({version:1,data:initial}));
 let failConflictStorage=false;
 const sandbox={window,document,Response,CustomEvent,console,mergeKitchenStates,localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>{if(failConflictStorage&&key.includes('conflict'))throw Error('quota');storage.set(key,value);}},
  setTimeout:(fn,delay)=>{timers.set(++id,{fn,at:now+delay});return id;},clearTimeout:key=>timers.delete(key),setInterval:()=>0,clearInterval(){},
  fetch:(path,options)=>{requests.push({path,...options});return respond(path,options);}};
 vm.runInNewContext(source+'\nglobalThis.sync={initCloudSync,saveKitchenState,forceServerPull,forceServerPush,readKitchenStateRaw,readConflictStateRaw,getSyncStatus};',sandbox);
 const advance=async ms=>{const end=now+ms;for(;;){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;const [key,t]=next;timers.delete(key);now=t.at;t.fn();await settle();}now=end;await settle();};
 return {sync:sandbox.sync,requests,timers,storage,window,advance,failBackup:()=>{failConflictStorage=true;},writeFromOtherTab:raw=>storage.set('my-little-kitchen-pantry-v1',raw),respond:fn=>{respond=fn;},puts:()=>requests.filter(r=>r.method==='PUT').map(r=>JSON.parse(r.body))};
}
const h=harness();await h.sync.initCloudSync();
let rejectFirst;
h.respond(()=>new Promise((_,reject)=>{rejectFirst=reject;}));
h.sync.saveKitchenState('older');await h.advance(450);
h.sync.saveKitchenState('newest');await h.advance(450);
rejectFirst(new Error('offline'));await settle();
h.respond(async()=>new Response(JSON.stringify({version:2})));
await h.advance(999);assert.equal(h.puts().length,1,'Failure must not start a one-second retry loop');
await h.advance(5000);
assert.deepEqual(h.puts().map(p=>p.data),['older','newest'],'The newest queued edit must survive an older in-flight failure');
assert.equal(h.sync.readKitchenStateRaw(),'newest');
assert.equal(h.sync.getSyncStatus().kind,'ok');
await h.advance(60000);assert.equal(h.puts().length,2,'A failed request must leave only one retry timer');

const offline=harness();await offline.sync.initCloudSync();offline.respond(async()=>{throw Error('offline');});
offline.sync.saveKitchenState('unsynced');await offline.advance(450);await offline.advance(60000);
assert.ok(offline.puts().length<=5,'Repeated network failures must back off instead of retrying every second');
assert.equal(offline.sync.readKitchenStateRaw(),'unsynced');
offline.writeFromOtherTab('newer tab edit');
offline.respond(async()=>new Response(JSON.stringify({version:3})));
offline.window.dispatchEvent(new Event('online'));await offline.advance(0);
assert.equal(offline.puts().at(-1).data,'newer tab edit','Reconnect must not replay a stale tab snapshot over newer local state');
assert.equal(offline.sync.getSyncStatus().kind,'ok');

const conflict=harness();await conflict.sync.initCloudSync();
conflict.respond(async(_path,options)=>new Response(JSON.stringify({version:options?.method==='PUT'?9:1}),{status:options?.method==='PUT'?409:200}));
conflict.sync.saveKitchenState('conflicting edit');await conflict.advance(450);await conflict.advance(60000);
assert.equal(conflict.puts().length,1,'Version conflicts must not retry forever');
assert.equal(conflict.sync.readKitchenStateRaw(),'conflicting edit');
assert.equal(conflict.sync.readConflictStateRaw(),'conflicting edit');

const readonly=harness();await readonly.sync.initCloudSync({readOnly:true});
assert.equal(readonly.sync.saveKitchenState('forbidden'),false);await readonly.advance(60000);assert.equal(readonly.puts().length,0);
console.log('Sync queued-edit preservation, retry backoff, and read-only runtime checks passed.');

const base=JSON.stringify({version:2,items:['달걀'],stock:{},recipes:[{id:'user-soup',steps:['물 100g']},{id:'user-rice',steps:['데우기']}],ratings:{}});
const a=JSON.parse(base);a.ratings['user-soup']=4.5;
const b=JSON.parse(base);b.recipes[1].steps=['2분 데우기'];
const concurrent=harness(base);await concurrent.sync.initCloudSync();
let remoteRaw=JSON.stringify(b),remoteVersion=2;
concurrent.respond(async(path,options)=>{
 if(options?.method==='PUT'){
  const body=JSON.parse(options.body);
  if(body.baseVersion!==remoteVersion)return Response.json({version:remoteVersion},{status:409});
  remoteRaw=body.data;return Response.json({version:++remoteVersion});
 }
 if(path==='/api/state/version')return Response.json({version:remoteVersion});
 return Response.json({version:remoteVersion,data:remoteRaw,baseVersion:1,baseData:base});
});
concurrent.sync.saveKitchenState(JSON.stringify(a));await concurrent.advance(1200);
assert.equal(concurrent.puts().length,2,'A stale write should reconcile and retry once promptly');
assert.equal(JSON.parse(remoteRaw).ratings['user-soup'],4.5);assert.deepEqual(JSON.parse(remoteRaw).recipes[1].steps,['2분 데우기']);
assert.equal(concurrent.sync.getSyncStatus().kind,'ok');

// Re-open an offline-edited device. Its base is retrieved from server history,
// not guessed from whatever happens to be in the browser now.
const offlineMerge=harness(base);await offlineMerge.sync.initCloudSync();offlineMerge.writeFromOtherTab(JSON.stringify(a));
offlineMerge.respond(async()=>Response.json({version:2,data:JSON.stringify(b),baseVersion:1,baseData:base}));
await offlineMerge.sync.forceServerPull();
assert.ok(offlineMerge.requests.at(-1).path.includes('baseVersion=1'));
assert.equal(JSON.parse(offlineMerge.sync.readKitchenStateRaw()).ratings['user-soup'],4.5);
assert.deepEqual(JSON.parse(offlineMerge.sync.readKitchenStateRaw()).recipes[1].steps,['2분 데우기']);

const sameItem=harness(base);await sameItem.sync.initCloudSync();sameItem.writeFromOtherTab(JSON.stringify(a));
const competing=JSON.parse(base);competing.ratings['user-soup']=2;
sameItem.respond(async(_path,options)=>Response.json(options?.method==='POST'?{ok:true}:{version:2,data:JSON.stringify(competing),baseVersion:1,baseData:base}));
await sameItem.sync.forceServerPull();
assert.equal(sameItem.sync.readConflictStateRaw(),JSON.stringify(a));
assert.equal(sameItem.sync.readKitchenStateRaw(),JSON.stringify(competing),'True conflicts preserve the exact local recovery copy before adopting server state');

const quota=harness(base);await quota.sync.initCloudSync();quota.writeFromOtherTab(JSON.stringify(a));quota.failBackup();
quota.respond(async(_path,options)=>options?.method==='POST'?new Response('',{status:503}):Response.json({version:2,data:JSON.stringify(competing)}));
assert.equal(await quota.sync.forceServerPull(),false);assert.equal(quota.sync.readKitchenStateRaw(),JSON.stringify(a),'Never overwrite when both recovery copies fail');

const race=harness(base);await race.sync.initCloudSync();race.writeFromOtherTab(JSON.stringify(a));
let finishBackup;
race.respond(async(_path,options)=>options?.method==='POST'?new Promise(resolve=>{finishBackup=resolve;}):Response.json({version:2,data:JSON.stringify(competing)}));
const pull=race.sync.forceServerPull();await settle();
const newer={...a,items:['달걀','버터']};race.sync.saveKitchenState(JSON.stringify(newer));finishBackup(Response.json({ok:true}));
assert.equal(await pull,false);assert.equal(race.sync.readKitchenStateRaw(),JSON.stringify(newer),'An edit made during conflict backup must survive');

const tab=harness(base);await tab.sync.initCloudSync();
const metaKey='my-little-kitchen-sync-meta-v1';const meta=JSON.parse(tab.storage.get(metaKey));meta.serverVersion=7;tab.storage.set(metaKey,JSON.stringify(meta));
tab.respond(async()=>Response.json({version:8}));tab.sync.saveKitchenState(JSON.stringify(a));await tab.advance(450);
assert.equal(tab.puts()[0].baseVersion,7,'Use another tab’s acknowledged base, not an obsolete per-tab version');
const slowTab=harness(base);await slowTab.sync.initCloudSync();let finishOldPush;
slowTab.respond(()=>new Promise(resolve=>{finishOldPush=resolve;}));slowTab.sync.saveKitchenState(JSON.stringify(a));await slowTab.advance(450);
const newerMeta=JSON.stringify({serverVersion:9,hash:'another-tab-ack'});slowTab.storage.set(metaKey,newerMeta);
finishOldPush(Response.json({version:2}));await settle();
assert.equal(slowTab.storage.get(metaKey),newerMeta,'An old response must not rewind another tab’s newer acknowledgement');
console.log('Sync concurrency, reload reconciliation, backup failure, and edits during recovery passed.');
