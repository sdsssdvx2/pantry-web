const KEY='mlk-theme-v1';
const $=id=>document.getElementById(id);

function applyTheme(theme){
 const next=theme==='dark'?'dark':'light';
 document.documentElement.dataset.theme=next;
 document.documentElement.style.colorScheme=next;
 const meta=document.querySelector('meta[name="theme-color"]');
 if(meta)meta.content=next==='dark'?'#1a1c12':'#f6f7f2';
 const button=$('theme-toggle');
 if(button){
  const dark=next==='dark';
  button.setAttribute('aria-label',dark?'라이트 모드로 바꾸기':'다크 모드로 바꾸기');
  button.setAttribute('title',dark?'라이트 모드':'다크 모드');
  button.dataset.theme=next;
 }
 return next;
}

export function installThemeToggle(){
 const button=$('theme-toggle');if(!button)return;
 let current=applyTheme(document.documentElement.dataset.theme);
 button.addEventListener('click',()=>{
  current=applyTheme(current==='dark'?'light':'dark');
  try{localStorage.setItem(KEY,current);}catch{}
 });
}
