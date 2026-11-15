import {canSaveKitchenState,saveKitchenState} from './cloud-sync.js';

const $=id=>document.getElementById(id);

export function installPersistenceController({getSnapshot,getUnreadableState,getStorageOK,setStorageOK,toast}){
 function updateStorageState(){
  const writable=canSaveKitchenState(),storageOK=getStorageOK();
  if(!writable){
   $('storage-detail').textContent='이 공유 화면은 읽기 전용이에요. 최신 서버 상태를 확인하지만 변경 내용은 저장하지 않아요.';
   $('recover-raw').hidden=true;
   return;
  }
  $('storage-detail').textContent=storageOK?'저장한 변경은 서버와 자동 동기화됩니다. 작성 중인 입력은 저장 버튼을 눌러야 보관됩니다.':'기기 저장을 읽거나 기록하지 못했어요. 현재 보이는 자료를 전체 백업으로 내려받아 주세요.';
  $('recover-raw').hidden=!getUnreadableState();
 }
 function persist(){
  if(getUnreadableState()){
   setStorageOK(false);updateStorageState();
   toast('기존 저장 내용을 읽지 못해 덮어쓰지 않았어요. 백업·내보내기에서 원본을 보관해 주세요.');
   return false;
  }
  const raw=JSON.stringify(getSnapshot()),storageOK=saveKitchenState(raw);
  setStorageOK(storageOK);
  if(!storageOK)toast('이 브라우저에 저장할 수 없어요. 전체 백업으로 보관해 주세요.');
  updateStorageState();
  return storageOK;
 }
 return {persist,updateStorageState};
}
