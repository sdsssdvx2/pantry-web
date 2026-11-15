const enc = new TextEncoder();

export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_BLOCK_MS = 15 * 60 * 1000;
export const LOGIN_MAX_FAILURES = 8;

function clientKeySource(request) {
  const ip = String(request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  if (ip) return `ip:${ip}`;
  const ua = String(request.headers.get('user-agent') || '').slice(0, 500);
  return `fallback:${ua || 'unknown'}`;
}

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey('raw', enc.encode(String(secret)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function bucketFor(request, env) {
  return hmac(env.OWNER_PASSWORD, `my-little-kitchen-login-rate-v1|${clientKeySource(request)}`);
}

function retrySeconds(until, now = Date.now()) {
  const ms = Date.parse(until || '') - now;
  return Number.isFinite(ms) && ms > 0 ? Math.max(1, Math.ceil(ms / 1000)) : 0;
}

export async function checkLoginRateLimit(request, env, now = Date.now()) {
  try {
    const bucket = await bucketFor(request, env);
    const row = await env.DB.prepare('SELECT failures,window_started_at,blocked_until FROM login_rate_limits WHERE bucket=?').bind(bucket).first();
    if (!row) return { blocked: false, retryAfter: 0, bucket };
    const retryAfter = retrySeconds(row.blocked_until, now);
    if (retryAfter > 0) return { blocked: true, retryAfter, bucket };
    const started = Date.parse(row.window_started_at || '');
    if (!Number.isFinite(started) || started <= now - LOGIN_WINDOW_MS) {
      await env.DB.prepare('DELETE FROM login_rate_limits WHERE bucket=?').bind(bucket).run();
      return { blocked: false, retryAfter: 0, bucket };
    }
    return { blocked: false, retryAfter: 0, bucket, failures: Number(row.failures || 0) };
  } catch {
    // Authentication must remain available if the rate-limit storage is temporarily unavailable.
    return { blocked: false, retryAfter: 0, bucket: null };
  }
}

export async function recordLoginFailure(request, env, now = Date.now()) {
  try {
    const bucket = await bucketFor(request, env);
    const nowIso = new Date(now).toISOString();
    const cutoffIso = new Date(now - LOGIN_WINDOW_MS).toISOString();
    const blockUntilIso = new Date(now + LOGIN_BLOCK_MS).toISOString();
    await env.DB.prepare(`
      INSERT INTO login_rate_limits (bucket,failures,window_started_at,blocked_until,updated_at)
      VALUES (?,1,?,NULL,?)
      ON CONFLICT(bucket) DO UPDATE SET
        failures=CASE WHEN login_rate_limits.window_started_at<? THEN 1 ELSE login_rate_limits.failures+1 END,
        window_started_at=CASE WHEN login_rate_limits.window_started_at<? THEN excluded.window_started_at ELSE login_rate_limits.window_started_at END,
        blocked_until=CASE
          WHEN login_rate_limits.window_started_at<? THEN NULL
          WHEN login_rate_limits.failures+1>=? THEN ?
          ELSE login_rate_limits.blocked_until
        END,
        updated_at=excluded.updated_at
    `).bind(bucket, nowIso, nowIso, cutoffIso, cutoffIso, cutoffIso, LOGIN_MAX_FAILURES, blockUntilIso).run();
    const row = await env.DB.prepare('SELECT failures,window_started_at,blocked_until FROM login_rate_limits WHERE bucket=?').bind(bucket).first();
    const retryAfter = retrySeconds(row?.blocked_until, now);
    // Opportunistic cleanup; failures here must not affect login behavior.
    try {
      await env.DB.prepare('DELETE FROM login_rate_limits WHERE updated_at<?').bind(new Date(now - 2 * 86400000).toISOString()).run();
    } catch {}
    return { blocked: retryAfter > 0, retryAfter, failures: Number(row?.failures || 0), bucket };
  } catch {
    return { blocked: false, retryAfter: 0, failures: 0, bucket: null };
  }
}

export async function clearLoginFailures(request, env) {
  try {
    const bucket = await bucketFor(request, env);
    await env.DB.prepare('DELETE FROM login_rate_limits WHERE bucket=?').bind(bucket).run();
  } catch {}
}
