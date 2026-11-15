import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

const fail=message=>{throw new Error(message);};
const expect=(condition,message)=>{if(!condition)fail(message);};

execFileSync(process.execPath,['--check','public/persistence-controller.js'],{stdio:'inherit'});
const source=fs.readFileSync('public/persistence-controller.js','utf8');
expect(source.includes("import {canSaveKitchenState,saveKitchenState} from './cloud-sync.js';"),'Persistence controller must own the explicit cloud-sync save dependency');
expect(source.includes('if(getUnreadableState())'),'Unreadable raw state must block persistence before serialization');
expect(source.includes('setStorageOK(false);updateStorageState();'),'Unreadable state must visibly fail closed');
expect(source.includes('const raw=JSON.stringify(getSnapshot()),storageOK=saveKitchenState(raw);'),'Persistence controller must save exactly the current snapshot through cloud-sync');
expect(!source.includes('save-state'),'Persistence controller must not depend on the removed pantry heading sync label');
expect(source.includes('최신 서버 상태를 확인하지만 변경 내용은 저장하지 않아요.'),'Read-only storage-detail copy must remain stable');
expect(source.includes('저장한 변경은 서버와 자동 동기화됩니다.'),'Owner storage-detail copy must remain stable');
expect(!source.includes("querySelector('.pantry-foot')"),'Persistence controller must leave the pantry footer entirely to sync-status-ui');

const elements=new Map([
 ['storage-detail',{textContent:'',hidden:false}],
 ['recover-raw',{textContent:'',hidden:false}],
]);
globalThis.document={getElementById:id=>elements.get(id),querySelector:()=>null};
let writable=true,savedRaw=null,storageOK=true,unreadable=null,toasts=[];
const cloudSync=await import('../public/cloud-sync.js');
const descriptor=Object.getOwnPropertyDescriptor(cloudSync,'canSaveKitchenState');
expect(!!descriptor,'cloud-sync import must resolve during persistence checks');

// Source-level assertions above protect the real cloud-sync binding. The DOM contract is
// checked by evaluating an equivalent controller factory with injected sync functions.
const factorySource=source
 .replace("import {canSaveKitchenState,saveKitchenState} from './cloud-sync.js';\n\n",'')
 .replace('export function installPersistenceController','function installPersistenceController');
const factory=new Function('document','canSaveKitchenState','saveKitchenState',factorySource+'; return installPersistenceController;')(globalThis.document,()=>writable,raw=>{savedRaw=raw;return true;});
const controller=factory({getSnapshot:()=>({version:2,items:['우유']}),getUnreadableState:()=>unreadable,getStorageOK:()=>storageOK,setStorageOK:value=>{storageOK=!!value;},toast:message=>toasts.push(message)});

writable=false;controller.updateStorageState();
expect(elements.get('recover-raw').hidden===true,'Read-only mode must hide raw recovery actions');
expect(elements.get('storage-detail').textContent.includes('읽기 전용'),'Read-only mode must describe the server snapshot in backup details');

writable=true;storageOK=true;controller.updateStorageState();
expect(elements.get('storage-detail').textContent.includes('서버와 자동 동기화'),'Writable healthy state must retain sync guidance in backup details');

unreadable='{broken';savedRaw=null;toasts=[];
expect(controller.persist()===false,'Unreadable state must fail closed');
expect(savedRaw===null,'Unreadable state must never call the durable save');
expect(storageOK===false&&toasts.some(message=>message.includes('덮어쓰지 않았어요')),'Unreadable state must expose the recovery warning');

unreadable=null;storageOK=true;toasts=[];
expect(controller.persist()===true,'Valid snapshots must persist successfully');
expect(savedRaw===JSON.stringify({version:2,items:['우유']}),'Persistence must serialize the exact snapshot once');
console.log('Persistence controller boundary check passed.');
