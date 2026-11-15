const enc = new TextEncoder();

export const OWNER_COOKIE = 'mlk_owner';
export const OWNER_DEVICE_COOKIE = 'mlk_owner_device';
export const SHARE_COOKIE = 'mlk_share';
export const OWNER_SESSION_MAX_AGE = 30 * 24 * 60 * 60;
export const OWNER_DEVICE_MAX_AGE = 365 * 24 * 60 * 60;
const OWNER_SESSION_VERSION = 'v2';
const OWNER_SESSION_MESSAGE = 'my-little-kitchen-owner-session-v2';
const SHARE_AUTH_CACHE_MS = 5000;
const shareAuthCache = new Map();

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey('raw', enc.encode(String(secret)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(String(message))));
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomToken(bytes = 24) {
  const raw = new Uint8Array(bytes);
  crypto.getRandomValues(raw);
  return btoa(String.fromCharCode(...raw)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function cookieValue(request, name) {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) {
      try { return decodeURIComponent(rest.join('=')); } catch { return ''; }
    }
  }
  return '';
}

export function ownerSessionCookie(token) {
  return `${OWNER_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${OWNER_SESSION_MAX_AGE}`;
}

export function ownerDeviceCookie(deviceId) {
  return `${OWNER_DEVICE_COOKIE}=${encodeURIComponent(deviceId)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${OWNER_DEVICE_MAX_AGE}`;
}

export function clearOwnerCookie() {
  return `${OWNER_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function clearShareCookie() {
  return `${SHARE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function sameString(a, b) {
  const aa = enc.encode(String(a));
  const bb = enc.encode(String(b));
  if (aa.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}

export async function ownerSessionToken(secret, sessionId) {
  if (!sessionId) throw new Error('sessionId is required');
  const proof = await hmac(secret, `${OWNER_SESSION_MESSAGE}|${sessionId}`);
  return `${OWNER_SESSION_VERSION}.${sessionId}.${proof}`;
}

function parseOwnerSessionToken(token) {
  const match = String(token || '').match(/^v2\.([A-Za-z0-9_-]{20,})\.([A-Za-z0-9_-]{20,})$/);
  return match ? { sessionId: match[1], proof: match[2] } : null;
}

function requestMeta(request) {
  const cf = request.cf || {};
  return {
    ip: String(request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '').split(',')[0].trim().slice(0, 80),
    country: String(cf.country || '').slice(0, 80),
    region: String(cf.region || '').slice(0, 120),
    city: String(cf.city || '').slice(0, 120),
    userAgent: String(request.headers.get('user-agent') || '').slice(0, 500),
  };
}

function validDeviceId(value) {
  return /^[A-Za-z0-9_-]{20,}$/.test(String(value || ''));
}

export async function createOwnerSession(request, env, now = Date.now()) {
  if (!env.OWNER_PASSWORD) throw new Error('OWNER_PASSWORD is required');
  const existingDevice = cookieValue(request, OWNER_DEVICE_COOKIE);
  const deviceId = validDeviceId(existingDevice) ? existingDevice : randomToken(18);
  const sessionId = randomToken(24);
  const nowIso = new Date(now).toISOString();
  const expiresAt = new Date(now + OWNER_SESSION_MAX_AGE * 1000).toISOString();
  const meta = requestMeta(request);

  await env.DB.batch([
    env.DB.prepare('UPDATE owner_sessions SET revoked_at=? WHERE device_id=? AND revoked_at IS NULL').bind(nowIso, deviceId),
    env.DB.prepare('INSERT INTO owner_sessions (session_id,device_id,created_at,last_seen_at,expires_at,revoked_at,ip,country,region,city,user_agent) VALUES (?,?,?,?,?,NULL,?,?,?,?,?)')
      .bind(sessionId, deviceId, nowIso, nowIso, expiresAt, meta.ip, meta.country, meta.region, meta.city, meta.userAgent),
  ]);

  try {
    await env.DB.prepare('DELETE FROM owner_sessions WHERE expires_at<? OR (revoked_at IS NOT NULL AND revoked_at<?)')
      .bind(new Date(now - 86400000).toISOString(), new Date(now - 30 * 86400000).toISOString()).run();
  } catch {}

  return {
    token: await ownerSessionToken(env.OWNER_PASSWORD, sessionId),
    deviceId,
    session: { sessionId, deviceId, createdAt: nowIso, lastSeenAt: nowIso, expiresAt },
  };
}

export async function getOwnerSession(request, env, now = Date.now()) {
  if (!env.OWNER_PASSWORD) return null;
  const parsed = parseOwnerSessionToken(cookieValue(request, OWNER_COOKIE));
  if (!parsed) return null;
  const expected = await hmac(env.OWNER_PASSWORD, `${OWNER_SESSION_MESSAGE}|${parsed.sessionId}`);
  if (!sameString(parsed.proof, expected)) return null;
  try {
    const row = await env.DB.prepare('SELECT session_id,device_id,created_at,last_seen_at,expires_at FROM owner_sessions WHERE session_id=? AND revoked_at IS NULL AND expires_at>?')
      .bind(parsed.sessionId, new Date(now).toISOString()).first();
    if (!row) return null;
    return {
      sessionId: row.session_id,
      deviceId: row.device_id,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      expiresAt: row.expires_at,
    };
  } catch {
    // Owner authorization fails closed if its revocation store cannot be read.
    return null;
  }
}

export async function refreshOwnerSession(env, session, now = Date.now()) {
  if (!session?.sessionId) return false;
  const nowIso = new Date(now).toISOString();
  const expiresAt = new Date(now + OWNER_SESSION_MAX_AGE * 1000).toISOString();
  try {
    const result = await env.DB.prepare('UPDATE owner_sessions SET last_seen_at=?,expires_at=? WHERE session_id=? AND revoked_at IS NULL AND expires_at>?')
      .bind(nowIso, expiresAt, session.sessionId, nowIso).run();
    if (!result.meta?.changes) return false;
    session.lastSeenAt = nowIso;
    session.expiresAt = expiresAt;
    return true;
  } catch {
    return false;
  }
}

export async function revokeOwnerSession(env, sessionId, now = Date.now()) {
  if (!sessionId) return false;
  try {
    const result = await env.DB.prepare('UPDATE owner_sessions SET revoked_at=? WHERE session_id=? AND revoked_at IS NULL')
      .bind(new Date(now).toISOString(), sessionId).run();
    return !!result.meta?.changes;
  } catch {
    return false;
  }
}

export function clearShareAuthCache() {
  shareAuthCache.clear();
}

export async function findShareByToken(env, token) {
  if (!token) return null;
  const now = Date.now();
  const cached = shareAuthCache.get(token);
  if (cached && now - cached.checkedAt < SHARE_AUTH_CACHE_MS) {
    if (cached.row?.expires_at && Date.parse(cached.row.expires_at) <= now) {
      shareAuthCache.delete(token);
      return null;
    }
    return cached.row;
  }
  const row = await env.DB.prepare('SELECT id, token, label, scope, created_at, expires_at, last_access_at, access_count FROM share_links WHERE token=?').bind(token).first();
  if (!row || (row.expires_at && Date.parse(row.expires_at) <= now)) {
    shareAuthCache.delete(token);
    return null;
  }
  shareAuthCache.set(token, { row, checkedAt: now });
  return row;
}

export async function getAuth(request, env) {
  const session = await getOwnerSession(request, env);
  if (session) return { role: 'owner', scope: 'owner', session };
  const share = await findShareByToken(env, cookieValue(request, SHARE_COOKIE));
  if (share) return { role: 'share', scope: share.scope || 'viewer', share };
  return { role: 'none', scope: 'none' };
}
