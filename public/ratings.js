export const ratingFilters=[['all','전체'],['unrated','평가 안 함'],['rated','평가한 메뉴'],['3','★ 3점 이상'],['4','★ 4점 이상'],['4.5','★ 4.5점 이상'],['5','★ 5점']];

// Ratings belong to stable menu IDs, shared by all servings of that menu.
export function validateRatings(values={}){
 if(!values||typeof values!=='object'||Array.isArray(values)||Object.keys(values).length>1000)throw Error('별점 기록 형식을 확인해 주세요.');
 const result=Object.create(null);
 for(const [id,value] of Object.entries(values)){
  if(!/^(?:source|user)-[a-z0-9-]+$/.test(id)||typeof value!=='number'||!Number.isFinite(value)||value<0.5||value>5||!Number.isInteger(value*2))throw Error('별점은 0.5점부터 5점까지, 반 개 단위로 저장할 수 있어요.');
  result[id]=value;
 }
 return result;
}
export function matchesRating(value,filter){return filter==='all'||(filter==='unrated'?!value:filter==='rated'?!!value:value>=Number(filter));}

const star='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.7 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L2.9 9.3l6.3-.9Z"/></svg>';
export function ratingHTML(id,name,value,escapeHTML){
 return `<div class="recipe-rating" data-rating-id="${id}" data-saved-rating="${value}"><div class="rating-stars" role="radiogroup" aria-label="${escapeHTML(name)} 나의 별점">${Array.from({length:5},(_,i)=>`<span class="rating-star" data-star="${i}"><span class="star-empty">${star}</span><span class="star-filled" style="clip-path:inset(0 ${100-Math.max(0,Math.min(1,value-i))*100}% 0 0)">${star}</span>${[0.5,1].map(part=>`<button type="button" class="rating-half" role="radio" data-rating-value="${i+part}" aria-label="${i+part}점" aria-checked="${value===i+part}" tabindex="${(value||0.5)===i+part?0:-1}"></button>`).join('')}</span>`).join('')}</div>${value?'<button type="button" class="rating-clear text-button" data-rating-clear aria-label="별점 지우기">↺</button>':''}</div>`;
}
export function previewRating(widget,value){
 for(const star of widget.querySelectorAll('[data-star]'))star.querySelector('.star-filled').style.clipPath=`inset(0 ${100-Math.max(0,Math.min(1,value-Number(star.dataset.star)))*100}% 0 0)`;
}

export function handleRatingClick(event,onSave){
 const widget=event.target.closest('.recipe-rating');
 if(!widget)return false;
 const button=event.target.closest('[data-rating-value],[data-rating-clear]');
 if(button)onSave(widget,Number(button.dataset.ratingValue)||0);
 return true;
}

export function installRatingInputs(roots,onSave){
 for(const root of roots){
  if(!root)continue;
  root.addEventListener('pointerover',event=>{if(event.pointerType==='touch')return;const button=event.target.closest('[data-rating-value]');if(button)previewRating(button.closest('.recipe-rating'),Number(button.dataset.ratingValue));});
  root.addEventListener('pointerout',event=>{const widget=event.target.closest('.recipe-rating');if(widget&&!widget.contains(event.relatedTarget))previewRating(widget,Number(widget.dataset.savedRating));});
  root.addEventListener('keydown',event=>{
   const button=event.target.closest('[data-rating-value]');if(!button)return;
   const current=Number(button.dataset.ratingValue),key=event.key;let value;
   if(['ArrowRight','ArrowUp'].includes(key))value=Math.min(5,current+0.5);else if(['ArrowLeft','ArrowDown'].includes(key))value=Math.max(0.5,current-0.5);else if(key==='Home')value=0.5;else if(key==='End')value=5;else if(['Delete','Backspace'].includes(key))value=0;else return;
   event.preventDefault();onSave(button.closest('.recipe-rating'),value);
  });
 }
}
