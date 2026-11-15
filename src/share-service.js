import {clearShareAuthCache} from './auth-service.js';

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

function randomToken(bytes = 24) {
  const raw = new Uint8Array(bytes);
  crypto.getRandomValues(raw);
  return btoa(String.fromCharCode(...raw)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function touchShare(env, share) {
  if (!share?.id) return;
  const now = new Date().toISOString();
  await env.DB.prepare('UPDATE share_links SET last_access_at=?, access_count=access_count+1 WHERE id=?').bind(now, share.id).run();
}

function sharePublicRow(row, origin) {
  return { id: row.id, label: row.label, scope: row.scope || 'viewer', url: `${origin}/share/${row.token}`, createdAt: row.created_at, expiresAt: row.expires_at, lastAccessAt: row.last_access_at, accessCount: Number(row.access_count || 0) };
}

export async function handleShareAdmin(request, env, url) {
  const db = env.DB;
  if (request.method === 'GET' && url.pathname === '/api/shares') {
    const now = new Date().toISOString();
    await db.prepare('DELETE FROM share_links WHERE expires_at IS NOT NULL AND expires_at <= ?').bind(now).run();
    const rows = await db.prepare('SELECT id, token, label, scope, created_at, expires_at, last_access_at, access_count FROM share_links ORDER BY created_at DESC LIMIT 100').all();
    const linkRows = rows.results || [];
    return json({ links: linkRows.map(row => sharePublicRow(row, url.origin)) });
  }
  if (request.method === 'POST' && url.pathname === '/api/shares') {
    let body;
    try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
    const label = String(body?.label || '').trim().slice(0, 80) || '공유 링크';
    const scope = body?.scope === 'reviewer' ? 'reviewer' : 'viewer';
    const days = Number(body?.expiresInDays || 0);
    if (!Number.isFinite(days) || days < 0 || days > 3650) return json({ error: 'invalid_expiry' }, 400);
    const id = crypto.randomUUID();
    const token = randomToken(24);
    const now = new Date();
    const expires = days ? new Date(now.getTime() + days * 86400000).toISOString() : null;
    await db.prepare('INSERT INTO share_links (id, token, label, scope, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, token, label, scope, now.toISOString(), expires).run();
    return json({ link: sharePublicRow({ id, token, label, scope, created_at: now.toISOString(), expires_at: expires, last_access_at: null, access_count: 0 }, url.origin) }, 201);
  }
  const revoke = url.pathname.match(/^\/api\/shares\/([^/]+)$/);
  if (request.method === 'DELETE' && revoke) {
    const id = decodeURIComponent(revoke[1]);
    const result = await db.prepare('DELETE FROM share_links WHERE id=?').bind(id).run();
    if (!result.meta?.changes) return json({ error: 'not_found' }, 404);
    clearShareAuthCache();
    return json({ ok: true });
  }
  return json({ error: 'not_found' }, 404);
}
