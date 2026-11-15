import {cookingLayoutHTML} from './cooking-layout.js';
import {gramCookingText} from './nutrition.js';
import {estimateRecipeTime,recipeTimeNeedsReview,recipeTimeSuggestionText} from './recipe-time-estimator.js';
// Display-only cleanup: never mutate the user's original text or saved steps.
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function cookingBody(text='',recipe={}) {
 const pairings=new Set((recipe.pairing||'').split('\n').map(s=>s.trim()));
 const key=s=>s.normalize('NFKC').replace(/[^\p{L}\p{N}]/gu,'');
 // A source title can contain the entire one-line recipe and its quantities.
 // Only remove a title-only line when cooking content remains below it.
 const titles=[recipe.name,recipe.sourceTitle].filter(Boolean).map(key);
 const lines=gramCookingText(text).split('\n');let first=true;
 return lines.filter(line=>{
  const s=line.trim();if(!s)return true;
  if(pairings.has(s)||(/^추천\s*음료\s*[:：]/.test(s)&&recipe.pairing))return false;
  if(first){first=false;const k=key(s.replace(/\d+\s*인분\s*$/,''));if(lines.some(other=>other!==line&&other.trim())&&!/[:：=+]|\d\s*(?:g|kg|ml|mL|L|T|t|그램|큰술|작은술|개|알)(?:\b|\s|$)/u.test(s)&&titles.some(t=>t===k||t===key(s)))return false;}
  return true;
 }).join('\n').trim();
}

function tidyCopyText(value=''){
 return String(value||'').replace(/\r/g,'').split('\n').map(line=>line.replace(/[ \t]+$/,'')).join('\n').replace(/\n{3,}/g,'\n\n').trim();
}

function recipeStatusText(recipe={}){
 const missing=recipe.missing||[];
 return missing.length?`재료 ${missing.length}개 부족·확인`:'✓ 재료 준비됨';
}

function recentCookedLabel(value=''){
 if(!value)return '';
 const date=new Date(value);if(!Number.isFinite(date.getTime()))return '';
 return new Intl.DateTimeFormat('ko-KR',{dateStyle:'medium',timeStyle:'short'}).format(date);
}

export function recipeCopyText(recipe={},rawBody='',relatedNames=[]){
 const title=[recipe.name,recipe.variantLabel].map(value=>String(value||'').trim()).filter(Boolean).join(' ');
 const body=tidyCopyText(cookingBody(rawBody,recipe));
 const extras=[];
 const pairing=tidyCopyText(recipe.pairing).split('\n').map(line=>line.trim()).filter(Boolean).join(' / ');
 if(pairing)extras.push(`추천 음료: ${pairing}`);
 const linked=[...new Set((relatedNames||[]).map(name=>String(name||'').trim()).filter(Boolean))];
 if(linked.length)extras.push(`연결 레시피: ${linked.join(' / ')}`);
 for(const note of [recipe.note,recipe.servingNote]){const text=tidyCopyText(note);if(text)extras.push(text);}
 return [title,body,extras.join('\n')].filter(Boolean).join('\n\n').replace(/\n{3,}/g,'\n\n').trim();
}

export function recipeCardHTML({recipe:r={},iconHTML='',ratingMarkup='',clockHTML='',effortLabel='',categoryLabel='',relatedCount=0,historyLabel='',energyLabel=null}={}){
 const id=escapeHTML(r.id);
 const missing=r.missing||[];
 const matches=r.matches||[];
 const availabilityNotes=[...new Set(matches.filter(match=>match.available&&match.reason).map(match=>match.reason))];
 const shortages=matches.filter(match=>!match.available).map(match=>match.name+(match.reason&&match.reason!=='미보유'?` (${match.reason})`:''));
 const status=recipeStatusText(r);
 return `<article class="recipe-card" data-recipe-id="${id}" tabindex="0"><div class="card-top"><span class="category-icon">${iconHTML}</span>${ratingMarkup}<span class="status-badge ${missing.length?'missing':''}">${status}</span></div><h3>${escapeHTML(r.name)}</h3><div class="recipe-meta"><span>${clockHTML}약 ${r.time}분</span><b>·</b><span>${escapeHTML(effortLabel)}</span>${r.variantLabel?`<b>·</b><span>${escapeHTML(r.variantLabel)}</span>`:''}${energyLabel?`<b>·</b><span class="recipe-energy" title="${escapeHTML(energyLabel.title)}">${escapeHTML(energyLabel.text)}</span>`:''}</div>${historyLabel?`<p class="history-sort-note">${escapeHTML(historyLabel)}</p>`:''}<p class="recipe-desc">${escapeHTML(r.summary)}</p>${availabilityNotes.length?`<p class="prep-note">${escapeHTML(availabilityNotes.join(' · '))}</p>`:''}${r.prep?`<p class="prep-note">${escapeHTML(r.prep)}</p>`:''}${r.pairing?`<p class="pairing-note"><strong>추천 음료·곁들임</strong> ${escapeHTML(r.pairing)}</p>`:''}${relatedCount?`<button class="meal-link" data-detail="${id}">함께 만드는 구성 보기 · ${relatedCount}개 연결</button>`:''}${missing.length?`<div class="ingredients-block shortage-block"><div class="ingredient-line shortage"><span>부족·확인</span><p>${escapeHTML(shortages.join(' · '))}</p></div></div>`:''}<div class="card-bottom"><span>${escapeHTML(categoryLabel)}</span><button class="detail-button" data-copy-card="${id}" aria-label="${escapeHTML(r.name)} 레시피 복사">레시피 복사 <span aria-hidden="true">⧉</span></button></div></article>`;
}

export function emptyRecipeGridHTML(){
 return '<div class="empty"><h3>조건에 맞는 메뉴가 아직 없어요</h3><p>검색어나 필터를 바꾸거나 전체 메뉴에서<br>부족한 재료를 확인해 보세요.</p><button class="primary" data-empty="all">전체 메뉴 살펴보기</button><button class="text-button" data-empty="pantry">식재료 추가하기</button></div>';
}

function numberedSteps(steps=[]){return steps.every(s=>s.trim())&&!steps.some(s=>/^\s*(?:\d+[.)]|[•●▶])\s*/.test(s));}

export function recipeDetailHTML({recipe:r={},base={},random=false,edited=false,cookingText='',productNotes=[],contextHTML='',clockHTML='',effortLabel='',optionalAvailability=[],ratingMarkup='',lastCookedAt='',cookingHistory=[],canRecordCooked=false,nutritionHTML=''}={}){
 const variants=base.variants||[];
 const optionalByName=new Map(optionalAvailability.map(item=>[item.name,!!item.available]));
 const status=random?'오늘 고른 메뉴':recipeStatusText(r);
 const timeSource=cookingText||(!r.source?(r.steps||[]).join('\n'):'');
 const timeEstimate=typeof estimateRecipeTime==='function'?estimateRecipeTime(timeSource):null;
 const timeReview=typeof recipeTimeNeedsReview==='function'&&recipeTimeNeedsReview(timeEstimate,r.time)
  ?`<p class="field-help recipe-time-review">시간 확인 · ${escapeHTML(recipeTimeSuggestionText(timeEstimate,r.time))} · 레시피 수정에서 본문 추정값을 적용할 수 있어요.</p>`:'';
 const records=[...new Set([...(Array.isArray(cookingHistory)?cookingHistory:[]),...(lastCookedAt?[lastCookedAt]:[])])].filter(value=>Number.isFinite(Date.parse(value))).sort((a,b)=>Date.parse(b)-Date.parse(a));
 const recentLabel=recentCookedLabel(records[0]||'');
 const localInputValue=value=>{const d=new Date(value);if(!Number.isFinite(d.getTime()))return '';const p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;};
 const historyRows=records.map(value=>`<div class="cooking-history-row">${canRecordCooked?`<label><span class="sr-only">먹은 날짜 수정</span><input class="cooking-history-date" type="datetime-local" value="${escapeHTML(localInputValue(value))}" data-edit-cooked="${escapeHTML(value)}"></label><button class="text-button danger-text" type="button" data-remove-cooked="${escapeHTML(value)}">삭제</button>`:`<time datetime="${escapeHTML(value)}">${escapeHTML(recentCookedLabel(value))}</time>`}</div>`).join('');
 const addHistory=canRecordCooked?`<div class="cooking-history-add"><label><span>과거 기록 추가</span><input id="cooking-history-new" type="datetime-local"></label><button id="add-cooked-record" class="outline-button" type="button">추가</button></div><p class="cooking-history-help">날짜를 누르면 수정할 수 있어요. 먹은 시각이 정확하지 않다면 기억나는 시간대로 기록해도 돼요.</p>`:'';
 const historySummary=records.length?(canRecordCooked?`먹은 기록 ${records.length}회 보기·편집`:`먹은 기록 ${records.length}회 보기`):'과거 먹은 기록 추가';
 const historyDetails=records.length||canRecordCooked?`<details class="cooking-history-details"><summary>${historySummary}</summary><div class="cooking-history-list">${historyRows}${addHistory}</div></details>`:'';
 const recentCooking=recentLabel||canRecordCooked?`<div class="recent-cooking-wrap"><div class="recent-cooking-note"><div class="recent-cooking-copy"><strong>최근 조리</strong><span>${escapeHTML(recentLabel||'아직 기록 없음')}${records.length?` · 총 ${records.length}회`:''}</span></div>${canRecordCooked?`<div class="recent-cooking-actions"><button class="outline-button" id="mark-cooked" type="button">✓ 먹었어요</button>${recentLabel?'<button class="text-button" id="clear-cooked" type="button">최근 기록 취소</button>':''}</div>`:''}</div>${historyDetails}</div>`:'';
 const sourceBody=r.source
  ? `<h3>${edited?'내가 수정한 조리 기록':'조리 기록'}</h3>${cookingLayoutHTML(cookingText)}${edited&&r.original?`<details class="source-original"><summary>업로드한 원래 기록 보기</summary><div class="recipe-original">${escapeHTML(r.original)}</div></details>`:''}`
  : `<h3>조리 순서</h3>${numberedSteps(r.steps||[])&&!r.steps?.some(s=>/\d\s*g|\[/.test(s))?'<ol>'+r.steps.map(s=>'<li>'+escapeHTML(s)+'</li>').join('')+'</ol>':cookingLayoutHTML(cookingBody((r.steps||[]).join('\n'),r))}`;
 return `<div class="dialog-top"><span class="status-badge ${r.missing?.length?'missing':''}">${status}</span>${ratingMarkup}<button class="icon-button" id="close-dialog" aria-label="조리 방향 닫기">✕</button></div><h2 id="dialog-title">${escapeHTML(r.name)}</h2><div class="recipe-meta"><span>${clockHTML}약 ${r.time}분 · 추정</span><span>${escapeHTML(effortLabel)}</span>${r.variantLabel?`<span>${escapeHTML(r.variantLabel)}</span>`:''}</div>${timeReview}${variants.length>1?`<label class="variant-picker">인분·버전<select id="recipe-variant">${variants.map(v=>`<option value="${escapeHTML(v.key)}" ${v.key===r.variantKey?'selected':''}>${escapeHTML(v.label)}</option>`).join('')}</select></label>`:''}<p class="detail-summary">${escapeHTML(r.summary)}</p>${recentCooking}${r.prep?`<p class="dialog-note prep-note">사전 준비: ${escapeHTML(r.prep)}</p>`:''}${contextHTML}<h3>필요한 재료 <span class="tiny">보유 여부 대조 · 분량은 아래 기록</span></h3><div class="required-list">${(r.matches||[]).map(m=>`<span class="required-item ${m.available?'':'lacking'}">${m.available?'✓':'+'} ${escapeHTML(m.name)}${m.reason?` · ${escapeHTML(m.reason)}`:''}</span>`).join('')}</div>${r.optional?.length?`<h3>선택 재료</h3><p>${r.optional.map(name=>`${escapeHTML(name)}${optionalByName.get(name)?' ✓':''}`).join(' · ')}</p>`:''}${productNotes.length?`<details class="product-notes"><summary>사용할 제품·재고 메모 ${productNotes.length}</summary>${productNotes.map(item=>`<p><strong>${escapeHTML(item.name)}</strong><br>${escapeHTML(item.note).replace(/\n/g,'<br>')}</p>`).join('')}</details>`:''}${sourceBody}${nutritionHTML}${r.note?`<p class="dialog-note">${escapeHTML(r.note).replace(/\n/g,'<br>')}</p>`:''}<div class="dialog-actions recipe-detail-actions"><button class="primary cook-mode-button" id="open-cook-mode"><svg class="recipe-action-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 4 4"/></svg><span>조리 크게 보기</span></button><button class="primary" id="copy-recipe"><span class="recipe-action-copy-icon" aria-hidden="true">⧉</span><span>레시피 복사</span></button></div><div class="recipe-manage"><button class="text-button" id="add-recipe-version">＋ 인분·버전 추가</button><button class="text-button" id="edit-recipe">${r.source?'이 기록 수정':'내 레시피 수정'}</button><button class="text-button" id="duplicate-recipe">복사해서 새로 만들기</button>${r.source?'<button class="text-button danger-text" id="hide-recipe" title="기본 레시피 원문은 안전하게 남겨두고 내 메뉴 목록에서 삭제합니다.">레시피 삭제</button>':'<button class="text-button danger-text" id="delete-recipe">내 레시피 삭제</button>'}${r.variantKey&&variants.length>1&&(!r.userVariant||r.variantKey==='base')?'<button class="text-button danger-text" id="hide-recipe-variant">이 인분·버전 삭제</button>':''}${edited?`<button class="text-button" id="reset-source-edit">${r.original?'원문으로 되돌리기':'이 인분·버전 삭제'}</button>`:''}</div>`;
}

export function cookModeHTML(recipe={},cookingText='',{canRecordCooked=false}={}){
 const cookedAction=canRecordCooked?'<button class="outline-button cook-mode-mark" id="mark-cooked-cook" type="button">✓ 먹었어요</button>':'';
 return `<div class="dialog-top"><div class="cook-mode-top-actions"><span class="status-badge">조리 크게 보기</span>${cookedAction}</div><div class="cook-font-controls" role="group" aria-label="조리 글자 크기"><button type="button" data-cook-font="-1" aria-label="조리 글자 작게">가−</button><button type="button" data-cook-font="1" aria-label="조리 글자 크게">가+</button></div><button class="icon-button" id="close-cook-mode" aria-label="레시피 상세로 돌아가기">✕</button></div><h2 id="dialog-title">${escapeHTML(recipe.name)}</h2>${recipe.variantLabel?`<p class="cook-mode-version">${escapeHTML(recipe.variantLabel)}</p>`:''}<div class="cook-mode-record">${cookingLayoutHTML(cookingText)}</div>`;
}

