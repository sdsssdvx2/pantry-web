import {mergeKitchenStates} from './sync-merge.js';

const STATE_KEY = 'my-little-kitchen-pantry-v1';
const META_KEY = 'my-little-kitchen-sync-meta-v1';
const CONFLICT_KEY = 'my-little-kitchen-sync-conflict-v1';
const POLL_MS = 60000;
let readOnly = false;
let readOnlyRaw = null;
let serverVersion = 0;
let queuedRaw = null;
let pushTimer = null;
let pushing = false;
let pushFailures = 0;
let checking = false;
let pollTimer = null;
let reconnectTimer = null;
let initialSyncComplete = false;
let lastStatus = { kind: 'idle', text: '서버 동기화 준비' };

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
}

function readMeta() {
  try { return JSON.parse(localStorage.getItem(META_KEY) || '{}'); } catch { return {}; }
}

function writeMeta(raw) {
  try {
    // A slower response in this tab must not roll back another tab's newer
    // acknowledgement (or associate its newer version with our older hash).
    if (Number(readMeta().serverVersion || 0) > serverVersion) return;
    localStorage.setItem(META_KEY, JSON.stringify({ serverVersion, hash: raw ? hash(raw) : '', syncedAt: new Date().toISOString() }));
  } catch {}
}

function setStatus(kind, text) {
  lastStatus = { kind, text };
  window.dispatchEvent(new CustomEvent('mlk-sync-status', { detail: lastStatus }));
}

function notifyStateApplied(source) {
  window.dispatchEvent(new CustomEvent('mlk-state-applied', { detail: { source, serverVersion } }));
}

function writePulledState(raw) {
  localStorage.setItem(STATE_KEY, raw);
  if (localStorage.getItem(STATE_KEY) !== raw) throw Error('local_write_failed');
}

function latestLocalRaw(fallback) {
  try { return localStorage.getItem(STATE_KEY) || fallback; } catch { return fallback; }
}

export function readKitchenStateRaw() {
  return readOnly ? readOnlyRaw : localStorage.getItem(STATE_KEY);
}

async function api(path, options = {}) {
  return fetch(path, { cache: 'no-store', credentials: 'same-origin', ...options });
}

async function recordConflict(raw, { serverRecorded = false } = {}) {
  if (readOnly) return false;
  let localSaved = false;
  try { localStorage.setItem(CONFLICT_KEY, raw); localSaved = true; } catch {}
  if (serverRecorded) return true;
  try {
    const response = await api('/api/conflict', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: raw }) });
    if (response.ok) return true;
  } catch {}
  return localSaved;
}

async function pushNow(raw) {
  if (readOnly || !raw) return false;
  if (pushing) { queuedRaw = raw; return false; }
  raw = latestLocalRaw(raw);
  // Another owner tab may have acknowledged a newer base since this tab's
  // last request. Read its durable state and metadata together before sending.
  serverVersion = Math.max(serverVersion, Number(readMeta().serverVersion) || 0);
  pushing = true;
  setStatus('syncing', '서버에 저장 중…');
  let success = false;
  try {
    const response = await api('/api/state', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: raw, baseVersion: serverVersion }),
    });
    if (response.status === 409) {
      const info = await response.json().catch(() => ({}));
      await recordConflict(raw, { serverRecorded: true });
      // The latest local state remains durable; let the next pull resolve the
      // version conflict instead of repeatedly sending an obsolete baseVersion.
      queuedRaw = null;
      clearTimeout(pushTimer);
      pushTimer = null;
      setStatus('conflict', `다른 기기 변경과 충돌 · 서버 v${info.version ?? '?'} · 현재 기기 내용도 별도 보관됨`);
      // Reconcile promptly, rather than waiting for the next minute's poll.
      pushTimer = setTimeout(() => { pushTimer = null; checkRemoteVersion(); }, 250);
      return false;
    }
    if (!response.ok) throw new Error(`sync ${response.status}`);
    const result = await response.json();
    serverVersion = result.version;
    pushFailures = 0;
    writeMeta(raw);
    setStatus('ok', '서버와 동기화됨');
    success = true;
    return true;
  } catch {
    // A newer edit may have arrived while this request was in flight.
    queuedRaw ??= latestLocalRaw(raw);
    pushFailures++;
    setStatus('offline', '기기에는 저장됨 · 서버 재시도 중');
    return false;
  } finally {
    pushing = false;
    if (queuedRaw && !readOnly) {
      armQueuedPush(success ? 250 : Math.min(60000, 5000 * 2 ** Math.min(pushFailures - 1, 4)));
    }
  }
}

function armQueuedPush(delay) {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    const next = queuedRaw ? latestLocalRaw(queuedRaw) : null;
    queuedRaw = null;
    if (next && !readOnly) pushNow(next);
  }, delay);
}

function schedulePush(raw) {
  if (readOnly) return;
  queuedRaw = raw;
  setStatus('pending', '기기 저장됨 · 서버 동기화 대기');
  armQueuedPush(450);
}

export function canSaveKitchenState() {
  return !readOnly;
}

export function getSyncStatus() {
  return { ...lastStatus };
}

export function readConflictStateRaw() {
  if (readOnly) return null;
  try { return localStorage.getItem(CONFLICT_KEY); } catch { return null; }
}

export function saveKitchenState(raw, { apply = false } = {}) {
  if (readOnly || !raw) return false;
  const text = String(raw);
  try {
    localStorage.setItem(STATE_KEY, text);
    if (localStorage.getItem(STATE_KEY) !== text) return false;
  } catch {
    return false;
  }
  schedulePush(text);
  if (apply) notifyStateApplied('local');
  return true;
}

function installTabSyncListener() {
  // storage 이벤트는 같은 문서에서는 발생하지 않고, 같은 origin의 다른 탭/창에서만 전달된다.
  window.addEventListener('storage', event => {
    if (event.storageArea !== localStorage) return;
    if (readOnly && event.key === META_KEY && event.newValue) {
      // 소유자 탭의 서버 push가 실제 성공한 시점에 다시 읽어 localStorage 선행 이벤트와의 race를 닫는다.
      pullReadOnly().catch(() => setStatus('offline', '공유 데이터를 불러오지 못했어요'));
      return;
    }
    if (event.key !== STATE_KEY || !event.newValue) return;
    if (readOnly) {
      // 공유 탭은 소유자 localStorage를 건드리지 않고 서버의 안전한 읽기 전용 상태만 메모리에 새로 받는다.
      pullReadOnly().catch(() => setStatus('offline', '공유 데이터를 불러오지 못했어요'));
      return;
    }
    notifyStateApplied('tab');
  });
}

async function pullReadOnly() {
  const response = await api('/api/state');
  if (!response.ok) throw new Error(`pull ${response.status}`);
  const remote = await response.json();
  serverVersion = Number(remote.version || 0);
  const nextRaw = remote.data ? String(remote.data) : null;
  const changed = readOnlyRaw !== nextRaw;
  readOnlyRaw = nextRaw;
  if (changed) notifyStateApplied('server');
  setStatus('readonly', '읽기 전용 · 최신 서버 상태');
}

async function pullLatest({ initial = false } = {}) {
  if (readOnly) return pullReadOnly();
  const requestedBase = Number(readMeta().serverVersion || 0);
  const response = await api('/api/state' + (requestedBase > 0 ? `?baseVersion=${requestedBase}` : ''));
  if (!response.ok) throw new Error(`pull ${response.status}`);
  const remote = await response.json();
  const localRaw = localStorage.getItem(STATE_KEY);
  const meta = readMeta();
  const remoteVersion = Number(remote.version || 0);
  // Do not apply a response that predates an in-flight save or another tab's
  // acknowledgement. The next poll will read from the new common base.
  if (pushing || Number(meta.serverVersion || 0) !== requestedBase) return false;

  if (!remote.data) {
    serverVersion = remoteVersion;
    if (localRaw) await pushNow(localRaw);
    else setStatus('ok', '서버 동기화 준비됨');
    return;
  }

  if (!localRaw) {
    writePulledState(remote.data);
    serverVersion = remoteVersion;
    writeMeta(remote.data);
    notifyStateApplied('server');
    setStatus('ok', '서버 데이터를 이 기기에 불러옴');
    return;
  }

  if (localRaw === remote.data) {
    serverVersion = remoteVersion;
    writeMeta(localRaw);
    setStatus('ok', '서버와 동기화됨');
    return;
  }

  const localHash = hash(localRaw);
  const lastVersion = Number(meta.serverVersion || 0);
  const lastHash = meta.hash || '';

  if (lastVersion === remoteVersion) {
    serverVersion = remoteVersion;
    await pushNow(localRaw);
    return;
  }

  if (lastVersion < remoteVersion && lastHash && lastHash === localHash) {
    writePulledState(remote.data);
    serverVersion = remoteVersion;
    writeMeta(remote.data);
    notifyStateApplied('server');
    setStatus('remote', initial ? '최신 서버 상태를 불러왔어요' : '다른 기기 변경을 바로 반영했어요');
    return;
  }

  if (!lastVersion && initial) {
    const preserved = await recordConflict(localRaw);
    if (!preserved) {
      setStatus('conflict', '서버에 더 최신 상태가 있지만 현재 기기 변경의 복구본을 저장하지 못해 덮어쓰지 않았어요');
      return false;
    }
    if (latestLocalRaw(localRaw) !== localRaw || Number(readMeta().serverVersion || 0) !== lastVersion) return false;
    writePulledState(remote.data);
    serverVersion = remoteVersion;
    writeMeta(remote.data);
    notifyStateApplied('server');
    setStatus('remote', '최신 서버 상태로 맞췄어요 · 기존 기기 내용은 별도 보관됨');
    return;
  }

  if (lastVersion < remoteVersion && lastHash !== localHash) {
    const mergedRaw = remote.baseVersion === lastVersion && remote.baseData
      ? mergeKitchenStates(remote.baseData, localRaw, remote.data) : null;
    if (mergedRaw !== null) {
      writePulledState(mergedRaw);
      serverVersion = remoteVersion;
      writeMeta(remote.data);
      clearTimeout(pushTimer);
      pushTimer = null;
      queuedRaw = null;
      notifyStateApplied('merge');
      if (mergedRaw !== remote.data) schedulePush(mergedRaw);
      else setStatus('ok', '서버와 동기화됨');
      return;
    }
    const preserved = await recordConflict(localRaw);
    if (!preserved) {
      setStatus('conflict', '다른 기기의 최신 상태가 있지만 현재 기기 변경의 복구본을 저장하지 못해 덮어쓰지 않았어요');
      return false;
    }
    // Preserving a conflict may require a network request. A new local edit
    // during that request must be reconciled again, never overwritten here.
    if (latestLocalRaw(localRaw) !== localRaw || Number(readMeta().serverVersion || 0) !== lastVersion) return false;
    writePulledState(remote.data);
    serverVersion = remoteVersion;
    writeMeta(remote.data);
    notifyStateApplied('server');
    setStatus('remote', '다른 기기의 최신 서버 상태로 맞췄어요 · 현재 기기 변경은 별도 보관됨');
    return;
  }
}

function scheduleInitialRetry() {
  if (initialSyncComplete || reconnectTimer || document.visibilityState !== 'visible') return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    checkRemoteVersion();
  }, 5000);
}

async function checkRemoteVersion() {
  // The version probe doubles as a connectivity health check, even when the version is unchanged.
  if (checking || pushing || queuedRaw || document.visibilityState !== 'visible') return;
  checking = true;
  try {
    const response = await api('/api/state/version');
    if (!response.ok) throw new Error(`version ${response.status}`);
    const remote = await response.json();
    const version = Number(remote.version || 0);
    if (!initialSyncComplete || version !== serverVersion) {
      const pulled = await pullLatest();
      if (pulled === false) return;
      initialSyncComplete = true;
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    } else setStatus(readOnly ? 'readonly' : 'ok', readOnly ? '읽기 전용 · 최신 서버 상태' : '서버와 동기화됨');
  } catch {
    setStatus('offline', readOnly ? '읽기 전용 · 서버 연결 확인 필요' : '기기에는 저장됨 · 서버 연결 확인 필요');
    scheduleInitialRetry();
  } finally {
    checking = false;
  }
}

export async function initCloudSync(options = {}) {
  readOnly = !!options.readOnly;
  readOnlyRaw = null;
  initialSyncComplete = false;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  installTabSyncListener();
  try {
    setStatus('syncing', readOnly ? '최신 서버 상태 불러오는 중…' : '서버 확인 중…');
    const pulled = await pullLatest({ initial: true });
    if (pulled === false) scheduleInitialRetry();
    else initialSyncComplete = true;
  } catch {
    setStatus('offline', readOnly ? '공유 데이터를 불러오지 못했어요' : '기기 저장 사용 중 · 서버 연결 확인 필요');
    scheduleInitialRetry();
  }
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(checkRemoteVersion, POLL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkRemoteVersion();
  });
  window.addEventListener('online', () => {
    pushFailures = 0;
    if (queuedRaw && !readOnly) armQueuedPush(0);
    else checkRemoteVersion();
  });
  window.addEventListener('beforeunload', () => { if (pollTimer) clearInterval(pollTimer); }, { once: true });
  window.addEventListener('beforeunload', () => { if (reconnectTimer) clearTimeout(reconnectTimer); }, { once: true });
}

export async function forceServerPull() { return pullLatest(); }

export async function forceServerPush() {
  if (readOnly) return false;
  const raw = localStorage.getItem(STATE_KEY);
  if (!raw) return true;
  clearTimeout(pushTimer);
  pushTimer = null;
  queuedRaw = null;
  return pushNow(raw);
}

export async function flushAndPauseSync() {
  if (readOnly) return true;
  clearTimeout(pushTimer);
  pushTimer = null;

  for (let i = 0; i < 50 && pushing; i++) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (pushing) throw new Error('sync_busy');

  queuedRaw = null;
  const raw = localStorage.getItem(STATE_KEY);
  if (raw) {
    const meta = readMeta();
    const localHash = hash(raw);
    const alreadySynced = Number(meta.serverVersion || 0) === serverVersion && meta.hash === localHash;
    if (!alreadySynced) {
      const ok = await pushNow(raw);
      if (!ok) throw new Error('sync_failed');
    }
  }

  readOnlyRaw = raw || null;
  readOnly = true;
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  return true;
}
