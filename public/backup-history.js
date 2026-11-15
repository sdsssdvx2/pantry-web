import { flushAndPauseSync, readConflictStateRaw } from './cloud-sync.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

const fmt = value => {
  if (!value) return '없음';
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return String(value);
  }
};

const sizeText = bytes => {
  const n = Number(bytes || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
};

function downloadConflictRaw(raw, name) {
  const parsed = JSON.parse(raw);
  const text = JSON.stringify(parsed, null, 2);
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function installBackupHistory() {
  const dialog = document.getElementById('backup-dialog');
  if (!dialog || document.getElementById('server-backups')) return;


  const section = document.createElement('section');
  section.id = 'server-backups';
  section.className = 'server-backups';
  section.innerHTML = `
    <div class="server-backup-head">
      <div>
        <h3>서버 자동 백업·복원</h3>
        <p class="field-help">데이터가 실제로 저장될 때 최근 변경 기록을 남기고, 매일 밤에는 별도의 일일 스냅샷을 보관해요. 수동 백업은 직접 만들 때만, 복원 직전 백업은 실제 복원할 때만 생깁니다.</p>
      </div>
      <div class="server-backup-actions">
        <button type="button" class="outline-button" id="make-server-backup">지금 서버 백업</button>
        <button type="button" class="text-button" id="refresh-server-backups">새로고침</button>
      </div>
    </div>
    <div id="server-backup-current" class="server-backup-current">서버 백업 정보를 불러오는 중…</div>
    <div id="sync-conflict-recovery" class="server-backup-current" hidden>
      <strong>동기화 충돌 복구본</strong>
      <div id="sync-conflict-copy" class="server-backup-meta"></div>
      <div class="server-backup-actions">
        <button type="button" class="text-button" id="download-local-conflict" hidden>이 브라우저 충돌본 받기</button>
        <button type="button" class="text-button" id="download-server-conflict" hidden>서버 최신 충돌본 받기</button>
      </div>
    </div>
    <p id="server-backup-message" class="field-help" aria-live="polite"></p>
    <div class="server-backup-columns">
      <div>
        <h4>자동·수동 스냅샷</h4>
        <div id="server-snapshot-list" class="server-backup-list"></div>
      </div>
      <div>
        <h4>최근 변경 기록</h4>
        <div id="server-history-list" class="server-backup-list"></div>
      </div>
    </div>
    <p class="server-backup-note">최근 변경 기록은 최대 약 60개, 일일 자동 백업은 최근 30일, 수동 백업과 복원 직전 백업은 각각 최대 5개만 보관해요. TXT·JSON 내려받기 기능은 별도로 그대로 유지합니다.</p>
  `;

  const error = dialog.querySelector('#backup-error');
  if (error) error.insertAdjacentElement('beforebegin', section);
  else dialog.querySelector('.recipe-editor')?.append(section);

  const current = section.querySelector('#server-backup-current');
  const conflictRecovery = section.querySelector('#sync-conflict-recovery');
  const conflictCopy = section.querySelector('#sync-conflict-copy');
  const localConflictButton = section.querySelector('#download-local-conflict');
  const serverConflictButton = section.querySelector('#download-server-conflict');
  const message = section.querySelector('#server-backup-message');
  const snapshotsEl = section.querySelector('#server-snapshot-list');
  const historyEl = section.querySelector('#server-history-list');
  let latestServerConflict = null;

  const kindLabel = kind => kind === 'daily' ? '일일 자동' : kind === 'restore-point' ? '복원 직전' : '수동';

  async function loadConflictRecovery() {
    const localRaw = readConflictStateRaw();
    latestServerConflict = null;
    localConflictButton.hidden = !localRaw;
    serverConflictButton.hidden = true;
    try {
      const response = await fetch('/api/conflicts/latest', { cache: 'no-store', credentials: 'same-origin' });
      if (response.ok) {
        const data = await response.json();
        latestServerConflict = data.conflict || null;
        serverConflictButton.hidden = !latestServerConflict;
      }
    } catch {}
    if (!localRaw && !latestServerConflict) {
      conflictRecovery.hidden = true;
      return;
    }
    conflictRecovery.hidden = false;
    const parts = [];
    if (localRaw) parts.push('이 브라우저에 충돌 당시 원본이 남아 있어요.');
    if (latestServerConflict) parts.push('서버 최신 충돌본 · ' + fmt(latestServerConflict.createdAt) + ' · 서버 v' + latestServerConflict.serverVersion + ' · ' + sizeText(latestServerConflict.bytes));
    conflictCopy.textContent = parts.join(' ');
  }

  async function load() {
    message.textContent = '';
    current.textContent = '서버 백업 정보를 불러오는 중…';
    loadConflictRecovery();
    try {
      const response = await fetch('/api/backups', { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) throw new Error();
      const data = await response.json();
      current.textContent = data.current
        ? `현재 서버 상태 · v${data.current.version} · ${fmt(data.current.updatedAt)} · ${sizeText(data.current.bytes)}`
        : '아직 서버에 저장된 상태가 없어요.';

      snapshotsEl.innerHTML = (data.snapshots || []).length
        ? data.snapshots.map(item => `
          <div class="server-backup-row">
            <div class="server-backup-row-main">
              <div>
                <strong>${kindLabel(item.kind)} · ${esc(item.label || '서버 백업')}</strong>
                <div class="server-backup-meta">${fmt(item.createdAt)} · 기준 v${item.sourceVersion} · ${sizeText(item.bytes)}</div>
              </div>
              <div class="server-backup-row-actions"><button type="button" class="text-button" data-restore-snapshot="${esc(item.id)}">이때로 복원</button></div>
            </div>
          </div>`).join('')
        : '<p class="field-help">아직 장기 스냅샷이 없어요. ‘지금 서버 백업’을 눌러 첫 백업을 만들 수 있어요.</p>';

      historyEl.innerHTML = (data.history || []).length
        ? data.history.map(item => `
          <div class="server-backup-row" data-history-row="${item.version}">
            <div class="server-backup-row-main">
              <div>
                <strong>변경 기록 v${item.version}</strong>
                <div class="server-backup-meta">${fmt(item.savedAt)} · ${sizeText(item.bytes)}</div>
              </div>
              <div class="server-backup-row-actions">
                <button type="button" class="text-button" data-history-diff="${item.version}">변경 내용</button>
                <button type="button" class="text-button" data-restore-history="${item.version}">이때로 복원</button>
              </div>
            </div>
            <div class="history-diff" data-history-diff-box hidden></div>
          </div>`).join('')
        : '<p class="field-help">아직 변경 기록이 없어요.</p>';
    } catch {
      current.textContent = '서버 백업 정보를 불러오지 못했어요.';
    }
  }

  async function showDiff(button) {
    const row = button.closest('[data-history-row]');
    const box = row?.querySelector('[data-history-diff-box]');
    if (!row || !box) return;
    if (!box.hidden) { box.hidden = true; button.textContent = '변경 내용'; return; }
    box.hidden = false;
    button.textContent = '닫기';
    if (box.dataset.loaded === 'true') return;
    box.innerHTML = '<p>변경 내용을 비교하는 중…</p>';
    try {
      const response = await fetch(`/api/backups/history/${encodeURIComponent(row.dataset.historyRow)}/diff`, { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) throw new Error();
      const data = await response.json();
      const items = Array.isArray(data.summary) && data.summary.length ? data.summary : ['내용상 차이를 찾지 못했어요.'];
      box.innerHTML = `<ul>${items.map(item => `<li>${esc(item)}</li>`).join('')}</ul>`;
      box.dataset.loaded = 'true';
    } catch {
      box.innerHTML = '<p>변경 내용을 불러오지 못했어요.</p>';
    }
  }

  async function makeSnapshot() {
    message.textContent = '현재 상태를 서버 백업으로 저장하는 중…';
    try {
      await flushAndPauseSync();
      const response = await fetch('/api/backups/snapshot', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ label: '직접 만든 서버 백업' }),
      });
      if (!response.ok) throw new Error();
      message.textContent = '현재 상태를 서버 백업으로 저장했어요.';
      location.reload();
    } catch {
      message.textContent = '서버 백업을 만들지 못했어요. 현재 동기화 상태를 확인해 주세요.';
    }
  }

  async function restore(payload, label) {
    if (!confirm(`${label} 상태로 서버 전체 데이터를 복원할까요?\n\n현재 상태는 복원 직전 백업으로 자동 보관됩니다.`)) return;
    message.textContent = '현재 변경을 먼저 서버에 저장한 뒤 복원하는 중…';
    try {
      await flushAndPauseSync();
      const response = await fetch('/api/backups/restore', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error();
      message.textContent = '복원이 끝났어요. 최신 서버 상태를 다시 불러옵니다.';
      location.reload();
    } catch {
      message.textContent = '복원 완료를 확인하지 못했어요. 페이지를 새로고침해 최신 상태를 확인해 주세요.';
    }
  }

  localConflictButton.addEventListener('click', () => {
    try {
      const raw = readConflictStateRaw();
      if (!raw) throw new Error('missing_local_conflict');
      downloadConflictRaw(raw, '나의주방-브라우저-충돌복구본-' + new Date().toISOString().slice(0,10) + '.json');
      message.textContent = '이 브라우저에 보관된 충돌본을 내려받았어요. 필요하면 JSON 백업 복원에서 다시 불러올 수 있어요.';
    } catch {
      message.textContent = '브라우저 충돌본을 읽지 못했어요.';
    }
  });
  serverConflictButton.addEventListener('click', async () => {
    if (!latestServerConflict?.id) return;
    message.textContent = '서버 충돌본을 불러오는 중…';
    try {
      const response = await fetch('/api/conflicts/' + encodeURIComponent(latestServerConflict.id), { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) throw new Error('conflict_fetch_failed');
      const data = await response.json();
      if (!data.conflict?.data) throw new Error('conflict_missing');
      const day = String(data.conflict.createdAt || '').slice(0,10) || new Date().toISOString().slice(0,10);
      downloadConflictRaw(data.conflict.data, '나의주방-서버-충돌복구본-' + day + '.json');
      message.textContent = '서버에 보관된 최신 충돌본을 내려받았어요. 필요하면 JSON 백업 복원에서 다시 불러올 수 있어요.';
    } catch {
      message.textContent = '서버 충돌본을 내려받지 못했어요.';
    }
  });
  section.querySelector('#make-server-backup').addEventListener('click', makeSnapshot);
  section.querySelector('#refresh-server-backups').addEventListener('click', load);
  snapshotsEl.addEventListener('click', event => {
    const button = event.target.closest('[data-restore-snapshot]');
    if (button) restore({ type: 'snapshot', id: button.dataset.restoreSnapshot }, '선택한 백업');
  });
  historyEl.addEventListener('click', event => {
    const diff = event.target.closest('[data-history-diff]');
    if (diff) { showDiff(diff); return; }
    const button = event.target.closest('[data-restore-history]');
    if (button) restore({ type: 'history', version: Number(button.dataset.restoreHistory) }, `변경 기록 v${button.dataset.restoreHistory}`);
  });

  for (const id of ['open-recipe-backup', 'export']) {
    document.getElementById(id)?.addEventListener('click', () => setTimeout(load, 0));
  }
  dialog.addEventListener('close', () => { message.textContent = ''; });
}
