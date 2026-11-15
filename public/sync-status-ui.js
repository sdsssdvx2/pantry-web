import {canSaveKitchenState,getSyncStatus} from './cloud-sync.js';

const compactStatus={
 idle:'서버 동기화',
 pending:'서버 동기화 대기',
 syncing:'서버 동기화 중…',
 ok:'서버 동기화',
 remote:'서버 동기화',
 offline:'서버 재시도 중',
 conflict:'동기화 충돌 · 복구본 보관됨'
};

function paintStatus(event){
 const status=event?.detail||getSyncStatus();
 const readOnly=!canSaveKitchenState();
 const scope=document.querySelector('.storage-scope');
 const footer=document.getElementById('pantry-sync-status');
 const footerText=document.getElementById('pantry-sync-text');
 const shortText=readOnly?'최신 서버 상태':(compactStatus[status.kind]||'서버 동기화');
 if(scope&&scope.textContent!==status.text)scope.textContent=status.text;
 if(footer){
  footer.dataset.syncKind=readOnly?'readonly':status.kind;
  footer.title=status.text;
 }
 if(footerText&&footerText.textContent!==shortText)footerText.textContent=shortText;
}

export function installSyncStatusUI(){
 paintStatus();
 window.addEventListener('mlk-sync-status',paintStatus);
}
