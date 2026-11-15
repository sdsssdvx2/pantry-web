import {recipesText,stockText,parseKitchenBackup,buildKitchenRestoreState} from './backup-tools.js?v=20260919-8';
import {groups,initialPantry,recipes as seedRecipes,SEED_REVISION,getStock,categories,efforts} from './data.js?v=20260919-6';
import {locations} from './pantry-tools.js';
import {saveKitchenState} from './cloud-sync.js';
import {statusNames} from './state-validation.js?v=20260919-5';
import {downloadBackupData} from './download-file.js?v=20260919-1';

const $=id=>document.getElementById(id);
const categoryName=id=>categories.find(c=>c[0]===id)?.[1]||'';
const effortName=id=>efforts.find(c=>c[0]===String(id))?.[1]||'';

export {downloadBackupData};

function restoreSummary(fileName,parsed){
 const cookedCount=Object.values(parsed.cookingHistory||{}).reduce((sum,rows)=>sum+(Array.isArray(rows)?rows.length:0),0);
 return `${fileName} · 재료 ${parsed.items.length}개 · 직접 작성한 레시피 ${parsed.recipes.length}개 · 수정 기록 ${parsed.edits.length}개 · 별점 ${Object.keys(parsed.ratings).length}개 · 먹은 기록 ${cookedCount}회`+(parsed.library?` · 원문 메뉴 ${parsed.library.recipes.length}개 · 참고 기록 ${parsed.library.curation.length}개`:' · 예전 백업: 파일에 없는 기본 메모·원문은 현재 사이트 자료를 사용해요.');
}

export function installBackupUI({getContext,ensureArchive,applyRestore,toast,updateStorageState}){
 let pendingImport=null,backupFocus=null;
 function openBackup(){backupFocus=document.activeElement;pendingImport=null;$('restore-preview').hidden=true;$('backup-error').textContent='';updateStorageState();$('backup-dialog').showModal();$('close-backup').focus();}

 $('open-recipe-backup').addEventListener('click',openBackup);
 $('close-backup').addEventListener('click',()=>$('backup-dialog').close());
 $('backup-dialog').addEventListener('close',()=>{if(backupFocus?.isConnected)backupFocus.focus();});
 $('choose-backup').addEventListener('click',()=>$('import-file').click());
 $('recover-raw').addEventListener('click',()=>{const raw=getContext().unreadableState;if(raw)downloadBackupData(raw,'my-kitchen-unreadable-original.txt','text/plain');});

 $('backup-dialog').addEventListener('click',async event=>{
  const button=event.target.closest('[data-export]');if(!button)return;button.disabled=true;$('backup-error').textContent='';
  try{
   const kind=button.dataset.export,date=new Date().toISOString().slice(0,10);
   if(kind==='stock'){
    const {pantry,stockOverrides}=getContext();
    downloadBackupData(stockText(pantry,n=>getStock(n,stockOverrides),statusNames,groups,locations),`식재료와-보관메모-${date}.txt`,'text/plain');
   }else{
    await ensureArchive();
    const context=getContext();
    if(kind==='recipes')downloadBackupData(recipesText({recipes:context.builtInRecipes,custom:context.customRecipes,edits:context.sourceEdits,hidden:context.hiddenSources,ratings:context.ratings,cookingHistory:context.cookingHistory,lastCooked:context.lastCooked,archive:context.curation,categoryName,effortName}),`전체-레시피-${date}.txt`,'text/plain');
    else{
     const names=[...new Set([...initialPantry,...context.pantry,...Object.keys(context.stockOverrides)])];
     const stock=Object.fromEntries(names.map(name=>{const data=getStock(name,context.stockOverrides);return[name,{group:data.group,status:data.status,locations:data.locations,notes:data.notes,...(data.priorityDate?{priorityDate:data.priorityDate}:{}),...(data.addedAt?{addedAt:data.addedAt}:{}),...(data.priorityStartDate?{priorityStartDate:data.priorityStartDate}:{})}];}));
     downloadBackupData({...context.snapshot,version:3,kind:'my-kitchen-full-backup',exportedAt:new Date().toISOString(),stock,library:{recipes:context.builtInRecipes,curation:context.curation}},`나의주방-전체백업-${date}.json`);
    }
   }
   toast('다운로드를 요청했어요. 다운로드 폴더에 파일이 있는지 확인해 주세요.');
  }catch(error){$('backup-error').textContent=error.message;}finally{button.disabled=false;}
 });

 $('import-file').addEventListener('change',async event=>{
  const file=event.target.files?.[0];if(!file)return;pendingImport=null;$('restore-preview').hidden=true;$('backup-error').textContent='';
  try{
   if(file.size>15000000)throw Error('15MB 이하 JSON 백업을 선택해 주세요.');
   const parsed=parseKitchenBackup(JSON.parse((await file.text()).replace(/^\ufeff/,'')),{currentRecipes:getContext().builtInRecipes});pendingImport=parsed;
   $('restore-summary').textContent=restoreSummary(file.name,parsed);
   $('restore-mode').value=parsed.full?'replace':'merge';$('restore-mode').disabled=!!parsed.library;$('restore-preview').hidden=false;
  }catch(error){$('backup-error').textContent=error instanceof SyntaxError?'올바른 JSON 백업이 아니에요.':error.message;}finally{event.target.value='';}
 });
 $('cancel-restore').addEventListener('click',()=>{pendingImport=null;$('restore-preview').hidden=true;});
 $('confirm-restore').addEventListener('click',()=>{
  if(!pendingImport)return;
  try{
   const replace=$('restore-mode').value==='replace',context=getContext();
   const next=buildKitchenRestoreState(pendingImport,{replace,currentState:context.snapshot,currentRecipes:context.builtInRecipes,currentLibrary:context.restoredLibrary,seedRevision:SEED_REVISION});
   const nextRaw=JSON.stringify(next);
   if(!saveKitchenState(nextRaw))throw Object.assign(new Error('브라우저에 저장하지 못했어요.'),{name:'QuotaExceededError'});
   applyRestore(next,replace);pendingImport=null;$('restore-preview').hidden=true;
  }catch(error){$('backup-error').textContent=error.name==='QuotaExceededError'?'브라우저 저장 공간이 부족해 복원하지 못했어요. 기존 자료는 유지됩니다.':error.message;}
 });
}
