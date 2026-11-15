const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
import {SITE_CONFIG} from './site-config.js';
const REPOSITORY_URL = SITE_CONFIG.repositoryUrl;

function fmt(value) {
  if (!value) return '없음';
  try { return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
  catch { return String(value); }
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

function renderedUrl(link) {
  if (!link?.url) return '';
  return `${link.url.replace(/\/$/, '')}/rendered.txt`;
}

function aiBundleText(link) {
  if (!link?.url) return '';
  return [
    '나의 작은 주방 사이트를 확인해줘.',
    `실제 사이트(브라우저 가능 시): ${link.url}`,
    `렌더링 검사: ${renderedUrl(link)}`,
    `GitHub 저장소: ${REPOSITORY_URL}`,
    'URL 접근이 제한되면 GitHub의 AI_HANDOFF.md와 ai-live-snapshot 브랜치를 확인해줘.'
  ].join('\n');
}

function newRecipePrompt(link) {
  return [
    aiBundleText(link),
    '',
    '사이트의 현재 보유 식재료와 각 제품 메모를 먼저 확인해줘.',
    '아래 핵심 식재료를 활용해서 현재 식재료만으로 만들 수 있는 가장 맛있고 만족도 높은 레시피를 처음부터 설계해줘.',
    '처음 설계할 때는 기존 레시피나 요리노트에 맞추지 말고 독립적으로 최선의 조합을 만들어줘. 완성안을 만든 뒤 최종 검토 단계에서만 기존 기록을 참고해도 돼.',
    '',
    '핵심 식재료: [여기에 적기]'
  ].join('\n');
}

function improveRecipePrompt(link) {
  return [
    aiBundleText(link),
    '',
    '사이트의 현재 보유 식재료와 각 제품 메모를 확인해줘.',
    '아래 레시피가 현재 식재료 기준으로 더 맛있어질 개선 여지가 있는지 검토해줘.',
    '먼저 이 레시피 자체를 독립적으로 평가하고, 최종 검토 단계에서만 기존 레시피나 요리노트를 참고해도 돼.',
    '',
    '개선할 레시피:',
    '[여기에 레시피 붙여넣기]'
  ].join('\n');
}

function shareUrl(link) {
  if (!link?.url) return '';
  return link.scope === 'reviewer' ? renderedUrl(link) : link.url;
}


export function installReadOnlyMode(scope = 'viewer', label = '') {
  const mode = scope === 'reviewer' ? 'shared-reviewer' : 'shared-viewer';
  document.documentElement.dataset.access = mode;
  const privateLabel = document.querySelector('.private');
  if (privateLabel) privateLabel.lastChild.textContent = scope === 'reviewer' ? 'AI 검토용 읽기 전용' : '읽기 전용 공유';

  if (scope === 'viewer') {
    const makeStockReadOnly = () => {
      const dialog = document.getElementById('stock-dialog');
      if (!dialog?.open) return;
      dialog.querySelectorAll('input,textarea,select,button').forEach(el => {
        if (el.id === 'close-stock' || el.id === 'cancel-stock') return;
        el.disabled = true;
      });
      const save = document.getElementById('save-stock');
      if (save) save.hidden = true;
      const title = document.getElementById('stock-title');
      if (title) title.classList.remove('sr-only');
    };
    document.addEventListener('click', event => {
      if (event.target.closest('[data-stock],[data-priority-stock]')) setTimeout(makeStockReadOnly, 0);
    });
  }
}

export function installShareManager() {
  const controls = document.getElementById('manage-menu-actions') || document.querySelector('.custom-controls');
  if (!controls || document.getElementById('manage-shares')) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'manage-shares';
  button.className = 'text-button';
  button.textContent = '공유·접속 관리';
  controls.append(button);

  const dialog = document.createElement('dialog');
  dialog.id = 'share-dialog';
  dialog.className = 'share-manager-dialog';
  dialog.innerHTML = `<div class="recipe-editor">
    <div class="dialog-top"><span class="eyebrow">SHARE MY KITCHEN</span><button type="button" class="icon-button" id="close-shares" aria-label="공유 링크 관리 닫기">✕</button></div>
    <h2>공유 링크 관리</h2>
    <p id="share-message" class="field-help" aria-live="polite"></p>
    <div id="share-list" class="share-list"></div>
    <section class="share-create-section">
      <h3>새 공유 링크 만들기</h3>
      <form id="share-create" class="share-create-grid">
        <label>링크 이름<input id="share-label" maxlength="80" required placeholder="예: 가족용 / AI 검토용"></label>
        <label>보기 방식<select id="share-scope"><option value="viewer">가족용 · 보기만</option><option value="reviewer">AI 검토용 · 편집 UI도 표시</option></select></label>
        <label>만료<select id="share-expiry"><option value="0">내가 삭제할 때까지</option><option value="7">7일</option><option value="30">30일</option><option value="90">90일</option><option value="365">1년</option></select></label>
        <button class="primary" type="submit">링크 만들기</button>
      </form>
    </section>
  </div>`;
  document.body.append(dialog);

  const list = dialog.querySelector('#share-list');
  const message = dialog.querySelector('#share-message');

  function activeLinkHTML(link) {
    const scopeLabel = link.scope === 'reviewer' ? 'AI 검토용' : '가족용 보기';
    const expiry = link.expiresAt ? fmt(link.expiresAt) : '삭제할 때까지';
    if (link.scope === 'reviewer') {
      return `<article class="share-row" data-share-id="${esc(link.id)}" data-share-url="${esc(link.url)}">
        <div class="share-row-top"><div><strong>${esc(link.label)}</strong> <span class="share-scope">${scopeLabel}</span></div><span class="share-meta">사용 가능</span></div>
        <div class="share-meta">생성 ${fmt(link.createdAt)} · 만료 ${expiry}<br>마지막 접속 ${fmt(link.lastAccessAt)}</div>
        <div class="share-url"><span class="share-url-label">실제 사이트</span><input readonly value="${esc(link.url)}" aria-label="AI용 실제 사이트 링크"><button type="button" class="outline-button" data-copy-url>복사</button></div>
        <div class="share-url"><span class="share-url-label">렌더링 검사</span><input readonly value="${esc(renderedUrl(link))}" aria-label="AI용 렌더링 검사 링크"><button type="button" class="outline-button" data-copy-url>복사</button></div>
        <div class="share-url"><span class="share-url-label">GitHub</span><input readonly value="${esc(REPOSITORY_URL)}" aria-label="GitHub 저장소 링크"><button type="button" class="outline-button" data-copy-url>복사</button></div>
        <div class="share-actions"><button type="button" class="outline-button" data-copy-ai-bundle>AI용 링크 모두 복사</button><button type="button" class="text-button" data-revoke-share>이 링크 삭제</button></div>
        <div class="ai-prompt-actions"><span>자주 쓰는 AI 요청문</span><button type="button" class="text-button" data-copy-new-recipe>현재 식재료로 새 레시피</button><button type="button" class="text-button" data-copy-improve-recipe>기존 레시피 개선</button></div>
      </article>`;
    }
    return `<article class="share-row" data-share-id="${esc(link.id)}">
      <div class="share-row-top"><div><strong>${esc(link.label)}</strong> <span class="share-scope">${scopeLabel}</span></div><span class="share-meta">사용 가능</span></div>
      <div class="share-meta">생성 ${fmt(link.createdAt)} · 만료 ${expiry}<br>마지막 접속 ${fmt(link.lastAccessAt)}</div>
      <div class="share-url"><span class="share-url-label">가족용 사이트</span><input readonly value="${esc(link.url)}" aria-label="가족용 공유 링크"><button type="button" class="outline-button" data-copy-url>복사</button></div>
      <div class="share-actions"><button type="button" class="text-button" data-revoke-share>이 링크 삭제</button></div>
    </article>`;
  }


  async function load() {
    message.textContent = '공유 링크를 불러오는 중…';
    try {
      const response = await fetch(`/api/shares?ts=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' });
      if (response.status === 403) throw new Error('소유자 로그인 상태가 아니에요');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const active = Array.isArray(data.links) ? data.links : [];
      message.textContent = active.length
        ? `현재 사용 가능한 공유 링크 ${active.length}개.`
        : '현재 사용 가능한 공유 링크가 없어요.';
      list.innerHTML = `${active.length ? `<div class="share-list-heading"><h3>사용 가능한 링크</h3><button type="button" class="text-button" data-refresh-shares>새로고침</button></div>${active.map(activeLinkHTML).join('')}` : `<div class="share-list-heading"><h3>사용 가능한 링크 0개</h3><button type="button" class="text-button" data-refresh-shares>새로고침</button></div>`}`;
    } catch (error) {
      list.innerHTML = '<div class="share-list-heading"><h3>공유 링크를 표시하지 못했어요</h3><button type="button" class="text-button" data-refresh-shares>다시 시도</button></div>';
      message.textContent = `서버의 공유 링크 목록을 불러오지 못했어요${error?.message ? ` (${error.message})` : ''}.`;
    }
  }

  button.addEventListener('click', async () => {
    dialog.showModal();
    await load();
  });
  dialog.querySelector('#close-shares').addEventListener('click', () => dialog.close());
  dialog.querySelector('#share-create').addEventListener('submit', async event => {
    event.preventDefault();
    const label = dialog.querySelector('#share-label').value.trim();
    const scope = dialog.querySelector('#share-scope').value;
    const expiresInDays = Number(dialog.querySelector('#share-expiry').value || 0);
    if (!label) return;
    message.textContent = '링크를 만드는 중…';
    try {
      const response = await fetch('/api/shares', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ label, scope, expiresInDays })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      dialog.querySelector('#share-label').value = '';
      const textToCopy = scope === 'reviewer' ? aiBundleText(data.link) : shareUrl(data.link);
      const copied = await copyText(textToCopy);
      message.textContent = copied
        ? (scope === 'reviewer' ? '새 AI 링크를 만들고 필요한 주소를 모두 복사했어요.' : '새 가족용 링크를 만들고 복사했어요.')
        : '새 링크를 만들었어요. 목록에서 복사하세요.';
      await load();
    } catch (error) {
      message.textContent = `공유 링크를 만들지 못했어요${error?.message ? ` (${error.message})` : ''}.`;
    }
  });

  list.addEventListener('click', async event => {
    if (event.target.closest('[data-refresh-shares]')) {
      await load();
      return;
    }
    const row = event.target.closest('[data-share-id]');
    if (!row) return;

    const copyButton = event.target.closest('[data-copy-url]');
    if (copyButton) {
      const input = copyButton.closest('.share-url')?.querySelector('input');
      const url = input?.value || '';
      message.textContent = await copyText(url) ? '링크를 복사했어요.' : '복사하지 못했어요. 주소를 직접 선택해 복사해 주세요.';
      return;
    }

    const url = row.dataset.shareUrl || '';
    if (event.target.closest('[data-copy-ai-bundle]')) {
      const ok = await copyText(aiBundleText({ url }));
      message.textContent = ok ? 'AI에게 보낼 실제 사이트·렌더링 검사·GitHub 주소를 모두 복사했어요.' : '복사하지 못했어요.';
      return;
    }
    if (event.target.closest('[data-copy-new-recipe]')) {
      const ok = await copyText(newRecipePrompt({ url }));
      message.textContent = ok ? '현재 식재료로 새 레시피를 만드는 요청문과 사이트 주소를 복사했어요.' : '복사하지 못했어요.';
      return;
    }
    if (event.target.closest('[data-copy-improve-recipe]')) {
      const ok = await copyText(improveRecipePrompt({ url }));
      message.textContent = ok ? '기존 레시피 개선 요청문과 사이트 주소를 복사했어요.' : '복사하지 못했어요.';
      return;
    }
    if (event.target.closest('[data-revoke-share]')) {
      if (!confirm('이 공유 링크를 완전히 삭제할까요? 삭제하면 복구되지 않고, 이미 이 링크로 접속한 기기도 다음 요청부터 접근할 수 없게 됩니다.')) return;
      message.textContent = '링크를 삭제하는 중…';
      const response = await fetch(`/api/shares/${encodeURIComponent(row.dataset.shareId)}`, { method: 'DELETE', credentials: 'same-origin' });
      message.textContent = response.ok ? '공유 링크를 서버에서 완전히 삭제했어요.' : `삭제하지 못했어요. (HTTP ${response.status})`;
      await load();
    }
  });
}
