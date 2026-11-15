function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

function kstDay(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const part = type => parts.find(item => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

async function getState(env) {
  const row = await env.DB.prepare('SELECT data, version, updated_at FROM owner_state WHERE id=1').first();
  return row || { data: null, version: 0, updated_at: null };
}

function backupPruneStatements(env, restoreId = null) {
  const dailyCutoff = kstDay(new Date(Date.now() - 30 * 86400000));
  // A losing restore must not prune backups belonging to the winning writer.
  const guard = restoreId ? ' AND EXISTS (SELECT 1 FROM backup_snapshots WHERE id=?)' : '';
  const guardArgs = restoreId ? [restoreId] : [];
  return [
    env.DB.prepare("DELETE FROM backup_snapshots WHERE kind='daily' AND backup_day < ?" + guard).bind(dailyCutoff, ...guardArgs),
    env.DB.prepare("DELETE FROM backup_snapshots WHERE kind='manual' AND id NOT IN (SELECT id FROM backup_snapshots WHERE kind='manual' ORDER BY created_at DESC LIMIT 5)" + guard).bind(...guardArgs),
    env.DB.prepare("DELETE FROM backup_snapshots WHERE kind='restore-point' AND id NOT IN (SELECT id FROM backup_snapshots WHERE kind='restore-point' ORDER BY created_at DESC LIMIT 5)" + guard).bind(...guardArgs),
  ];
}

export async function createSnapshot(env, { kind = 'manual', label = '', sourceState = null } = {}) {
  const state = sourceState || await getState(env);
  if (!state.data) return null;
  const now = new Date();
  const day = kstDay(now);
  const safeKind = ['daily', 'manual', 'restore-point'].includes(kind) ? kind : 'manual';
  const id = safeKind === 'daily' ? `daily:${day}` : `${safeKind}:${crypto.randomUUID()}`;
  const safeLabel = String(label || '').trim().slice(0, 100) || (safeKind === 'daily' ? '일일 자동 백업' : safeKind === 'restore-point' ? '복원 직전' : '수동 서버 백업');
  const sql = safeKind === 'daily'
    ? 'INSERT OR REPLACE INTO backup_snapshots (id, kind, label, data, source_version, created_at, backup_day) VALUES (?, ?, ?, ?, ?, ?, ?)'
    : 'INSERT INTO backup_snapshots (id, kind, label, data, source_version, created_at, backup_day) VALUES (?, ?, ?, ?, ?, ?, ?)';
  await env.DB.prepare(sql).bind(id, safeKind, safeLabel, state.data, state.version, now.toISOString(), day).run();
  await env.DB.batch(backupPruneStatements(env));
  return { id, kind: safeKind, label: safeLabel, sourceVersion: state.version, createdAt: now.toISOString(), backupDay: day };
}

async function listBackups(env) {
  const current = await env.DB.prepare('SELECT version, updated_at, length(data) AS bytes FROM owner_state WHERE id=1').first();
  const snapshots = await env.DB.prepare("SELECT id, kind, label, source_version, created_at, backup_day, length(data) AS bytes FROM backup_snapshots ORDER BY created_at DESC LIMIT 60").all();
  const history = await env.DB.prepare('SELECT version, saved_at, length(data) AS bytes FROM state_history ORDER BY version DESC LIMIT 60').all();
  return {
    current: current ? { version: current.version, updatedAt: current.updated_at, bytes: Number(current.bytes || 0) } : null,
    snapshots: (snapshots.results || []).map(row => ({ id: row.id, kind: row.kind, label: row.label, sourceVersion: row.source_version, createdAt: row.created_at, backupDay: row.backup_day, bytes: Number(row.bytes || 0) })),
    history: (history.results || []).map(row => ({ version: row.version, savedAt: row.saved_at, bytes: Number(row.bytes || 0) })),
  };
}

async function restoreBackup(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  const type = body?.type === 'history' ? 'history' : body?.type === 'snapshot' ? 'snapshot' : '';
  let target = null;

  if (type === 'history') {
    const version = Number(body?.version);
    if (!Number.isInteger(version) || version < 1) return json({ error: 'invalid_version' }, 400);
    const row = await env.DB.prepare('SELECT version, data, saved_at FROM state_history WHERE version=?').bind(version).first();
    if (row) target = { data: row.data, label: `변경 기록 v${row.version}`, source: `history:${row.version}` };
  } else if (type === 'snapshot') {
    const id = String(body?.id || '').slice(0, 160);
    if (!id) return json({ error: 'invalid_snapshot' }, 400);
    const row = await env.DB.prepare('SELECT id, label, data, source_version, created_at FROM backup_snapshots WHERE id=?').bind(id).first();
    if (row) target = { data: row.data, label: row.label || '서버 백업', source: row.id };
  } else {
    return json({ error: 'invalid_restore_type' }, 400);
  }

  if (!target?.data) return json({ error: 'backup_not_found' }, 404);
  try { JSON.parse(target.data); } catch { return json({ error: 'backup_corrupt' }, 500); }

  const current = await getState(env);
  if (!current.data) return json({ error: 'no_current_state' }, 409);
  const next = current.version + 1;
  const date = new Date(), now = date.toISOString();
  const restoreId = `restore-point:${crypto.randomUUID()}`;
  const label = `복원 직전 · ${target.label}`.slice(0, 100);
  // The unique restore point claims the expected version inside the transaction.
  // All later writes depend on that claim; a stale request has no side effects.
  const [, result] = await env.DB.batch([
    env.DB.prepare("INSERT INTO backup_snapshots (id, kind, label, data, source_version, created_at, backup_day) SELECT ?, 'restore-point', ?, data, version, ?, ? FROM owner_state WHERE id=1 AND version=?")
      .bind(restoreId, label, now, kstDay(date), current.version),
    env.DB.prepare('UPDATE owner_state SET data=?, version=?, updated_at=? WHERE id=1 AND version=? AND EXISTS (SELECT 1 FROM backup_snapshots WHERE id=?)')
      .bind(target.data, next, now, current.version, restoreId),
    env.DB.prepare('INSERT INTO state_history (version, data, saved_at) SELECT version, data, updated_at FROM owner_state WHERE id=1 AND version=? AND EXISTS (SELECT 1 FROM backup_snapshots WHERE id=?)')
      .bind(next, restoreId),
    env.DB.prepare('DELETE FROM state_history WHERE version < ? AND EXISTS (SELECT 1 FROM backup_snapshots WHERE id=?)')
      .bind(Math.max(1, next - 59), restoreId),
    ...backupPruneStatements(env, restoreId),
  ]);
  if (!result.meta?.changes) return json({ error: 'version_conflict' }, 409);
  return json({ ok: true, version: next, updatedAt: now, restoredFrom: target.source });
}

export async function handleBackupAdmin(request, env, url) {
  if (request.method === 'GET' && url.pathname === '/api/backups') return json(await listBackups(env));
  if (request.method === 'POST' && url.pathname === '/api/backups/snapshot') {
    let body = {};
    try { body = await request.json(); } catch {}
    const snapshot = await createSnapshot(env, { kind: 'manual', label: body?.label || '수동 서버 백업' });
    if (!snapshot) return json({ error: 'no_state' }, 409);
    return json({ snapshot }, 201);
  }
  if (request.method === 'POST' && url.pathname === '/api/backups/restore') return restoreBackup(request, env);
  return json({ error: 'not_found' }, 404);
}
