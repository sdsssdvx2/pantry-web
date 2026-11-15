const KEY='my-little-kitchen-pantry-v1';
const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch{return null}};
let canEdit=false,installed=false;

function compactHistory(){
  document.querySelectorAll('#history-list .history-item').forEach(row=>{
    const info=row.firstElementChild;
    if(!info||info.dataset.historyCompact==='1')return;
    info.dataset.historyCompact='1';
    info.tabIndex=0;
    info.setAttribute('role','button');
    info.setAttribute('aria-expanded','false');
    info.title='제품 정보 보기';
    const toggle=()=>{
      const expanded=row.classList.toggle('history-expanded');
      info.setAttribute('aria-expanded',expanded?'true':'false');
      info.title=expanded?'제품 정보 접기':'제품 정보 보기';
    };
    info.addEventListener('click',toggle);
    info.addEventListener('keydown',event=>{
      if(event.key==='Enter'||event.key===' '){event.preventDefault();toggle();}
    });
  });
}

function decorate(){
  const state=read();
  if(!state)return;
  const details=document.getElementById('ingredient-history');
  const results=document.getElementById('history-search-results');
  if(details&&results&&details.parentElement!==results.parentElement)results.insertAdjacentElement('afterend',details);
  compactHistory();
  if(!canEdit)return;
  document.querySelectorAll('#pantry-list [data-stock]').forEach(nameButton=>{
    const name=nameButton.dataset.stock,row=state.stock?.[name];
    if(row?.status!=='incoming')return;
    const tag=nameButton.closest('.ingredient-tag');
    if(!tag||tag.querySelector('[data-arrived]'))return;
    const button=document.createElement('button');
    button.type='button';
    button.className='arrived-button';
    button.dataset.arrived=name;
    button.textContent='✓ 도착';
    button.setAttribute('aria-label','도착 완료 · 배송 중 해제');
    button.title='도착 완료 · 사용 가능으로 변경';
    const remove=tag.querySelector('[data-remove]');
    tag.insertBefore(button,remove||null);
  });
}

export function installPantryUI({owner=false}={}){
  if(installed)return;
  installed=true;
  canEdit=!!owner;
  document.getElementById('pantry-list')?.addEventListener('click',event=>{
    const button=event.target.closest('[data-arrived]');
    if(!button||!canEdit)return;
    event.preventDefault();
    event.stopPropagation();
    const name=button.dataset.arrived;
    const nameButton=[...document.querySelectorAll('#pantry-list [data-stock]')].find(node=>node.dataset.stock===name);
    if(!nameButton)return;
    nameButton.click();
    queueMicrotask(()=>{
      const status=document.getElementById('stock-edit-status');
      const form=document.getElementById('stock-form');
      if(!status||!form)return;
      status.value='available';
      form.requestSubmit();
    });
  });
  window.addEventListener('mlk-pantry-rendered',decorate);
  decorate();
}
