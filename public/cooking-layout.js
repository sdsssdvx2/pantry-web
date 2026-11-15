import {gramCookingText} from './nutrition.js';
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function emphasize(line){
 return esc(line).replace(/(\d+(?:\.\d+)?(?:\s*[~～〜–—-]\s*\d+(?:\.\d+)?)?\s*(?:kg|mg|g|분|초|시간|도|℃|°C|개|알|장))/g,'<strong class="cooking-measure">$1</strong>').replace(/(중강불|중약불|센불|강불|중불|약불|불 끄고|불 끄기)/g,'<b class="cooking-heat">$1</b>');
}
export function cookingLayoutHTML(raw=''){
 const lines=gramCookingText(raw).split('\n');let html='',list=false,steps=false;
 const close=()=>{if(list){html+='</div>';list=false;}if(steps){html+='</ol>';steps=false;}};
 for(const rawLine of lines){
  const line=rawLine.trim();if(!line){close();continue;}
  const heading=line.match(/^[\[【](.+?)[\]】]$/);
  if(heading){close();html+=`<h4 class="cooking-section-title">${esc(heading[1])}</h4>`;continue;}
  const step=line.match(/^(\d+)\s*[.)]\s*(.+)$/);
  if(step){if(list){html+='</div>';list=false;}if(!steps){html+='<ol class="cooking-step-list">';steps=true;}html+=`<li value="${Number(step[1])}"><span class="cooking-step-number" aria-hidden="true">${Number(step[1])}</span><div>${emphasize(step[2])}</div></li>`;continue;}
  if(steps){html+='</ol>';steps=false;}
  if(/\d\s*(?:g|kg|개|알|장|봉|팩|캔)\b/.test(line)&&!/^\s*[•🍜🍝]/u.test(line)){
   if(!list){html+='<div class="cooking-ingredient-list">';list=true;}
   html+=`<p>${emphasize(line)}</p>`;
  }else{if(list){html+='</div>';list=false;}html+=`<p class="cooking-text-line">${emphasize(line)}</p>`;}
 }
 close();return `<div class="cooking-layout">${html}</div>`;
}
