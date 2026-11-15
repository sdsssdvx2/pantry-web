import { initCloudSync } from './cloud-sync.js';
import { installSyncStatusUI } from './sync-status-ui.js?v=20260919-1';
import { installPantryUI } from './pantry-ui.js?v=20260919-1';
import { installThemeToggle } from './theme-toggle.js';
import { installCustomSelects } from './custom-select.js?v=20260919-1';

installThemeToggle();

let session = { role: 'none', scope: 'none', label: null };
try {
  const response = await fetch('/api/session', { cache: 'no-store', credentials: 'same-origin' });
  if (response.ok) session = await response.json();
} catch {}

const shared = session.role === 'share';
const owner = session.role === 'owner';
if (owner) document.documentElement.dataset.access = 'owner';
if (shared && typeof document.querySelector === 'function' && typeof document.createElement === 'function') {
  const actions = document.querySelector('.header-actions');
  if (actions && !document.getElementById('owner-login-recovery')) {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'owner-login-recovery';
    button.className = 'text-button';
    button.textContent = '읽기 전용 · 소유자로 로그인';
    button.title = '이 브라우저에서 소유자 편집 권한으로 다시 로그인';
    button.addEventListener('click', () => { location.assign('/auth/login'); });
    actions.prepend(button);
  }
}
await initCloudSync({ readOnly: !owner });

await import('./app.js?v=20261108-offthread-1');
await import('./ingredient-draft.js?v=20261018-2');

let pantryCopyPromise = null;
const pantryCopyButton = document.getElementById('copy-pantry');
pantryCopyButton?.addEventListener('click', () => {
  if (pantryCopyPromise) return;
  pantryCopyButton.disabled = true;
  pantryCopyButton.textContent = '준비 중…';
  pantryCopyPromise = import('./pantry-copy.js?v=20260919-5').then(() => {
    pantryCopyButton.disabled = false;
    pantryCopyButton.textContent = '전체 복사';
    pantryCopyButton.click();
  }).catch(error => {
    pantryCopyPromise = null;
    pantryCopyButton.disabled = false;
    pantryCopyButton.textContent = '복사 실패';
    console.error(error);
    setTimeout(() => { pantryCopyButton.textContent = '전체 복사'; }, 2200);
  });
});

let cookingTipSearchPromise = null;
const cookingTipSearchToggle = document.getElementById('search-notes');
cookingTipSearchToggle?.addEventListener('change', () => {
  if (!cookingTipSearchToggle.checked || cookingTipSearchPromise) return;
  cookingTipSearchPromise = import('./cooking-tip-search.js?v=20260919-3').then(() => {
    cookingTipSearchToggle.dispatchEvent(new Event('change', { bubbles: true }));
  }).catch(error => {
    cookingTipSearchPromise = null;
    cookingTipSearchToggle.checked = false;
    console.error(error);
  });
});

installSyncStatusUI();

if (shared) {
  const { installReadOnlyMode } = await import('./share-manager.js?v=20260919-1');
  installReadOnlyMode(session.scope, session.label);
} else if (owner) {
  const [shareModule, accessModule, noteDeleteModule] = await Promise.all([
    import('./share-manager.js?v=20260919-1'),
    import('./access-manager.js'),
    import('./note-delete.js')
  ]);
  shareModule.installShareManager();
  accessModule.installAccessManager();
  noteDeleteModule.installNoteDelete();

  let backupHistoryPromise = null;
  document.getElementById('open-recipe-backup')?.addEventListener('click', () => {
    if (!backupHistoryPromise) {
      backupHistoryPromise = import('./backup-history.js?v=20260920-1').then(module => {
        module.installBackupHistory();
        document.getElementById('refresh-server-backups')?.click();
      }).catch(error => {
        backupHistoryPromise = null;
        const message = document.getElementById('backup-error');
        if (message) message.textContent = '서버 백업 이력을 불러오지 못했어요. 다시 열어 시도해 주세요.';
        console.error(error);
      });
    }
  });
}
installPantryUI({ owner });
installCustomSelects();
