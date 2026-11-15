const IDS=['stock-location','stock-status','stock-sort','sort'];

function selectedText(select){
 return select.selectedOptions?.[0]?.textContent?.trim()||select.options?.[select.selectedIndex]?.textContent?.trim()||'';
}

function enabledButtons(menu){
 return [...menu.querySelectorAll('.custom-select-option:not(:disabled)')];
}

function closeShell(shell,{focus=false}={}){
 const trigger=shell.querySelector('.custom-select-trigger'),menu=shell.querySelector('.custom-select-menu');
 if(!trigger||!menu||menu.hidden)return;
 menu.hidden=true;
 trigger.setAttribute('aria-expanded','false');
 shell.classList.remove('is-open');
 if(focus)trigger.focus();
}

function closeAll(except=null){
 document.querySelectorAll('.custom-select.is-open').forEach(shell=>{if(shell!==except)closeShell(shell);});
}

function renderOptions(select,shell){
 const menu=shell.querySelector('.custom-select-menu');
 menu.replaceChildren();
 [...select.options].forEach((option,index)=>{
  const button=document.createElement('button');
  button.type='button';
  button.className='custom-select-option';
  button.setAttribute('role','option');
  button.dataset.index=String(index);
  button.textContent=option.textContent;
  button.disabled=option.disabled;
  button.setAttribute('aria-selected',String(index===select.selectedIndex));
  if(index===select.selectedIndex)button.classList.add('is-selected');
  button.addEventListener('click',()=>{
   if(option.disabled)return;
   select.selectedIndex=index;
   select.dispatchEvent(new Event('change',{bubbles:true}));
   syncShell(select,shell);
   closeShell(shell,{focus:true});
  });
  menu.append(button);
 });
}

function syncShell(select,shell){
 const trigger=shell.querySelector('.custom-select-trigger');
 if(trigger)trigger.textContent=selectedText(select);
 if(!shell.querySelector('.custom-select-menu')?.hidden)renderOptions(select,shell);
}

function openShell(select,shell,{focusOption=false,direction=1}={}){
 closeAll(shell);
 renderOptions(select,shell);
 const trigger=shell.querySelector('.custom-select-trigger'),menu=shell.querySelector('.custom-select-menu');
 menu.hidden=false;
 trigger.setAttribute('aria-expanded','true');
 shell.classList.add('is-open');
 if(focusOption){
  const buttons=enabledButtons(menu);
  const selected=menu.querySelector('.custom-select-option.is-selected:not(:disabled)');
  (selected||buttons[direction<0?buttons.length-1:0])?.focus();
 }
}

function enhance(select){
 if(!select||select.dataset.customSelect==='1')return;
 select.dataset.customSelect='1';
 const shell=document.createElement('span');
 shell.className='custom-select';
 shell.dataset.selectId=select.id;
 select.before(shell);
 shell.append(select);
 select.classList.add('custom-select-native');
 select.tabIndex=-1;
 select.setAttribute('aria-hidden','true');
 const label=select.getAttribute('aria-label')||[...(select.labels||[])].map(item=>item.textContent.trim()).join(' ')||select.id;

 const trigger=document.createElement('button');
 trigger.type='button';
 trigger.className='custom-select-trigger';
 trigger.setAttribute('aria-haspopup','listbox');
 trigger.setAttribute('aria-expanded','false');
 trigger.setAttribute('aria-label',label);
 trigger.textContent=selectedText(select);

 const menu=document.createElement('span');
 menu.className='custom-select-menu';
 menu.id=`custom-select-${select.id}`;
 menu.setAttribute('role','listbox');
 menu.setAttribute('aria-label',label);
 menu.hidden=true;
 trigger.setAttribute('aria-controls',menu.id);

 shell.append(trigger,menu);

 trigger.addEventListener('click',()=>{
  if(shell.classList.contains('is-open'))closeShell(shell);
  else openShell(select,shell);
 });
 trigger.addEventListener('keydown',event=>{
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){
   event.preventDefault();
   openShell(select,shell,{focusOption:true,direction:event.key==='ArrowUp'?-1:1});
  }else if(event.key==='Escape'){
   closeShell(shell);
  }
 });
 menu.addEventListener('keydown',event=>{
  const buttons=enabledButtons(menu),current=buttons.indexOf(document.activeElement);
  if(event.key==='Escape'){event.preventDefault();closeShell(shell,{focus:true});return;}
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){
   event.preventDefault();
   const delta=event.key==='ArrowDown'?1:-1;
   const next=current<0?0:(current+delta+buttons.length)%buttons.length;
   buttons[next]?.focus();
   return;
  }
  if(event.key==='Home'){event.preventDefault();buttons[0]?.focus();}
  if(event.key==='End'){event.preventDefault();buttons.at(-1)?.focus();}
 });
 select.addEventListener('change',()=>syncShell(select,shell));
 shell.addEventListener('focusout',event=>{if(event.relatedTarget&&!shell.contains(event.relatedTarget))closeShell(shell);});
}

export function syncCustomSelect(id){
 const select=document.getElementById(id),shell=select?.closest('.custom-select');
 if(select&&shell)syncShell(select,shell);
}

export function installCustomSelects(){
 IDS.forEach(id=>enhance(document.getElementById(id)));
 document.addEventListener('pointerdown',event=>{
  const shell=event.target.closest?.('.custom-select');
  if(!shell)closeAll();
 });
 window.addEventListener('mlk-select-sync',event=>{
  const id=event.detail?.id;
  if(id)syncCustomSelect(id);else IDS.forEach(syncCustomSelect);
 });
 window.addEventListener('mlk-pantry-rendered',()=>syncCustomSelect('stock-location'));
}
