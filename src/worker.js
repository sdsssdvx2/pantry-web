import { familySafeData } from './share-state.js';
import {
  SHARE_COOKIE,
  clearOwnerCookie,
  clearShareCookie,
  createOwnerSession,
  findShareByToken,
  getAuth,
  ownerDeviceCookie,
  ownerSessionCookie,
  ownerSessionToken,
  refreshOwnerSession,
  revokeOwnerSession,
  sameString,
} from './auth-service.js';
import {checkLoginRateLimit,clearLoginFailures,recordLoginFailure} from './login-security.js';
import {createSnapshot,handleBackupAdmin} from './backup-service.js';
import {handleShareAdmin,touchShare} from './share-service.js';
import {handleFoodResearch} from './food-research.js';
import {handleAiSnapshotAdmin,runScheduledAiSnapshot} from './ai-snapshot-service.js';
import {handleFoodAi} from './food-ai.js';
import {handleFoodIntakeInbox,handleFoodIntakePreview,handleFoodIntakeStore,isFoodIntakeServiceRequest} from './food-intake.js';

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

function html(body, status = 200, headers = {}) {
  return new Response(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>나의 작은 주방</title><style>body{font-family:system-ui,-apple-system,sans-serif;background:#f6f7f2;color:#243029;margin:0;display:grid;place-items:center;min-height:100vh}.card{width:min(92vw,420px);background:#fff;border:1px solid #dfe4d9;border-radius:18px;padding:28px;box-shadow:0 18px 50px #24302914}h1{font-size:1.35rem;margin:0 0 8px}p{line-height:1.55;color:#667067}input,button{box-sizing:border-box;width:100%;font:inherit;padding:12px 14px;border-radius:12px}input{border:1px solid #cdd4c8;margin:10px 0}button{border:0;background:#3b5d45;color:white;font-weight:700;cursor:pointer}.err{color:#a33}.tiny{font-size:.86rem}</style></head><body>${body}</body></html>`, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...headers } });
}

function setupPage() {
  return html('<main class="card"><h1>서버 설정이 한 단계 남았어요</h1><p>Cloudflare Worker의 <b>Variables and Secrets</b>에서 <code>OWNER_PASSWORD</code>를 Secret으로 추가하면 이 사이트가 열립니다.</p><p class="tiny">비밀번호가 설정되기 전에는 주방 데이터와 정적 파일을 외부에 제공하지 않습니다.</p></main>', 503);
}

function loginPage(error = '', status = error ? 401 : 200, headers = {}) {
  return html(`<main class="card"><h1>나의 작은 주방</h1><p>소유자 비밀번호를 입력하세요.</p>${error ? `<p class="err">${error}</p>` : ''}<form method="post" action="/auth/login"><input name="password" type="password" autocomplete="current-password" required autofocus><button type="submit">들어가기</button></form><p class="tiny">로그인한 기기는 사용하는 동안 30일 만료가 자동 연장되며, 관리 화면에서 기기별로 접속을 만료시킬 수 있어요.</p></main>`, status, headers);
}

function rateLimitedLoginPage(retryAfter = 60) {
  const seconds = Math.max(1, Number(retryAfter) || 1);
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return loginPage(`로그인 시도가 너무 많아요. 약 ${minutes}분 뒤 다시 시도해 주세요.`, 429, { 'retry-after': String(seconds) });
}

function shareErrorPage(message = '공유 링크를 사용할 수 없어요.') {
  return html(`<main class="card"><h1>공유 링크를 열 수 없어요</h1><p>${message}</p><p class="tiny">링크가 만료되었거나 소유자가 공유를 종료했을 수 있어요.</p></main>`, 410);
}

async function getState(env) {
  const row = await env.DB.prepare('SELECT data, version, updated_at FROM owner_state WHERE id=1').first();
  return row || { data: null, version: 0, updated_at: null };
}

async function saveConflict(env, clientData, serverVersion) {
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO sync_conflicts (client_data, server_version, created_at) VALUES (?, ?, ?)').bind(clientData, serverVersion, now),
    env.DB.prepare('DELETE FROM sync_conflicts WHERE id NOT IN (SELECT id FROM sync_conflicts ORDER BY id DESC LIMIT 50)'),
  ]);
}

async function putState(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  const data = typeof body?.data === 'string' ? body.data : '';
  const baseVersion = Number(body?.baseVersion);
  if (!data || data.length > 5_000_000 || !Number.isInteger(baseVersion) || baseVersion < 0) return json({ error: 'invalid_payload' }, 400);
  try { JSON.parse(data); } catch { return json({ error: 'invalid_state_json' }, 400); }

  const current = await env.DB.prepare('SELECT data, version, updated_at FROM owner_state WHERE id=1').first();
  const now = new Date().toISOString();

  if (!current) {
    if (baseVersion !== 0) {
      await saveConflict(env, data, 0);
      return json({ error: 'version_conflict', version: 0 }, 409);
    }
    const [inserted] = await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO owner_state (id, data, version, updated_at) VALUES (1, ?, 1, ?)').bind(data, now),
      env.DB.prepare('INSERT OR IGNORE INTO state_history (version, data, saved_at) SELECT version, data, updated_at FROM owner_state WHERE id=1 AND version=1 AND data=? AND updated_at=?').bind(data, now),
    ]);
    if (!inserted.meta?.changes) {
      const latest = await getState(env);
      await saveConflict(env, data, latest.version);
      return json({ error: 'version_conflict', version: latest.version }, 409);
    }
    return json({ ok: true, version: 1, updatedAt: now });
  }

  if (baseVersion !== current.version) {
    await saveConflict(env, data, current.version);
    return json({ error: 'version_conflict', version: current.version, updatedAt: current.updated_at }, 409);
  }

  if (current.data === data) return json({ ok: true, version: current.version, updatedAt: current.updated_at, unchanged: true });

  const next = current.version + 1;
  const [result] = await env.DB.batch([
    env.DB.prepare('UPDATE owner_state SET data=?, version=?, updated_at=? WHERE id=1 AND version=?').bind(data, next, now, current.version),
    env.DB.prepare('INSERT OR IGNORE INTO state_history (version, data, saved_at) SELECT version, data, updated_at FROM owner_state WHERE id=1 AND version=? AND data=? AND updated_at=?').bind(next, data, now),
    env.DB.prepare('DELETE FROM state_history WHERE version < ?').bind(Math.max(1, next - 59)),
  ]);
  if (!result.meta?.changes) {
    const latest = await env.DB.prepare('SELECT version FROM owner_state WHERE id=1').first();
    await saveConflict(env, data, latest?.version || current.version);
    return json({ error: 'version_conflict', version: latest?.version || current.version, updatedAt: current.updated_at }, 409);
  }
  return json({ ok: true, version: next, updatedAt: now });
}

export const DAILY_MAINTENANCE_UTC_HOUR = 14;
export function isDailyMaintenanceRun(controller) {
  // The previous dedicated daily cron ("55 14 * * *") is still honored.
  if (controller?.cron === '55 14 * * *') return true;
  const time = new Date(Number(controller?.scheduledTime) || Date.now());
  return time.getUTCHours() === DAILY_MAINTENANCE_UTC_HOUR;
}

async function handleApi(request, env, url, auth) {
  if (url.pathname === '/api/session' && request.method === 'GET') {
    if (auth.role === 'owner') {
      const refreshed = await refreshOwnerSession(env, auth.session);
      if (!refreshed) {
        const response = json({ role: 'none', scope: 'none', label: null });
        response.headers.append('set-cookie', clearOwnerCookie());
        return response;
      }
      const token = await ownerSessionToken(env.OWNER_PASSWORD, auth.session.sessionId);
      const response = json({ role: 'owner', scope: 'owner', label: null });
      response.headers.append('set-cookie', ownerSessionCookie(token));
      response.headers.append('set-cookie', ownerDeviceCookie(auth.session.deviceId));
      response.headers.append('set-cookie', clearShareCookie());
      return response;
    }
    return json({ role: auth.role, scope: auth.scope, label: auth.share?.label || null });
  }
  if (url.pathname.startsWith('/api/shares')) {
    if (auth.role !== 'owner') return json({ error: 'forbidden' }, 403);
    return handleShareAdmin(request, env, url);
  }
  if (url.pathname.startsWith('/api/backups')) {
    if (auth.role !== 'owner') return json({ error: 'forbidden' }, 403);
    return handleBackupAdmin(request, env, url);
  }
  if (url.pathname === '/api/ai-snapshot') {
    if (auth.role !== 'owner') return json({ error: 'forbidden' }, 403);
    return handleAiSnapshotAdmin(request, env);
  }
  if (url.pathname === '/api/food-research/intake') {
    if (!isFoodIntakeServiceRequest(request, env)) return json({ error: 'forbidden' }, 403);
    return handleFoodIntakeStore(request, env);
  }
  if (url.pathname === '/api/food-research/intake-inbox' || url.pathname.startsWith('/api/food-research/intake-inbox/')) {
    if (auth.role !== 'owner') return json({ error: 'forbidden' }, 403);
    return handleFoodIntakeInbox(request, env, url);
  }
  if (url.pathname === '/api/food-research/intake-preview') {
    const serviceIntake = auth.role !== 'owner' && isFoodIntakeServiceRequest(request, env);
    if (auth.role !== 'owner' && !serviceIntake) return json({ error: 'forbidden' }, 403);
    return handleFoodIntakePreview(request, env, fetch, {requireServiceProvenance:serviceIntake});
  }
  if (url.pathname === '/api/food-research/ai') {
    if (auth.role !== 'owner') return json({ error: 'forbidden' }, 403);
    return handleFoodAi(request, env);
  }
  if (url.pathname === '/api/food-research') {
    if (auth.role !== 'owner') return json({ error: 'forbidden' }, 403);
    return handleFoodResearch(request, env);
  }
  if (url.pathname === '/api/state' && request.method === 'GET') {
    if (auth.role === 'none') return json({ error: 'unauthorized' }, 401);
    const state = await getState(env);
    const data = auth.role === 'share' && auth.scope === 'viewer' ? familySafeData(state.data) : state.data;
    const baseVersion = Number(url.searchParams.get('baseVersion'));
    if (auth.role === 'owner' && Number.isSafeInteger(baseVersion) && baseVersion > 0 && baseVersion < state.version) {
      const base = await env.DB.prepare('SELECT data FROM state_history WHERE version=?').bind(baseVersion).first();
      return json({ data, version: state.version, updatedAt: state.updated_at, baseVersion, baseData: base?.data || null });
    }
    return json({ data, version: state.version, updatedAt: state.updated_at });
  }
  if (url.pathname === '/api/state' && request.method === 'PUT') {
    if (auth.role !== 'owner') return json({ error: 'read_only' }, 403);
    return putState(request, env);
  }
  if (url.pathname === '/api/conflict' && request.method === 'POST') {
    if (auth.role !== 'owner') return json({ error: 'read_only' }, 403);
    let body;
    try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
    if (typeof body?.data !== 'string' || body.data.length > 5_000_000) return json({ error: 'invalid_payload' }, 400);
    const current = await getState(env);
    await saveConflict(env, body.data, current.version);
    return json({ ok: true });
  }
  if (url.pathname === '/api/health') return json({ ok: true, storage: 'd1', role: auth.role });
  return json({ error: 'not_found' }, 404);
}

function withAssetCaching(response, url) {
  const type = response.headers.get('content-type') || '';
  if (type.includes('text/html')) return null;
  const headers = new Headers(response.headers);
  if (/\.(?:js|css|json)$/i.test(url.pathname)) headers.set('cache-control', 'no-cache');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function redirectToLogin() {
  return new Response(null, { status: 303, headers: { location: '/auth/login', 'cache-control': 'no-store' } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!env.OWNER_PASSWORD) return setupPage();

    if (url.pathname === '/auth/login' && request.method === 'GET') return loginPage();
    if (url.pathname === '/auth/login' && request.method === 'POST') {
      const currentLimit = await checkLoginRateLimit(request, env);
      if (currentLimit.blocked) return rateLimitedLoginPage(currentLimit.retryAfter);

      const form = await request.formData();
      const supplied = String(form.get('password') || '');
      if (!sameString(supplied, env.OWNER_PASSWORD)) {
        const failed = await recordLoginFailure(request, env);
        if (failed.blocked) return rateLimitedLoginPage(failed.retryAfter);
        return loginPage('비밀번호가 맞지 않아요.');
      }

      await clearLoginFailures(request, env);
      let created;
      try {
        created = await createOwnerSession(request, env);
      } catch {
        return loginPage('로그인 세션을 만들지 못했어요. 잠시 후 다시 시도해 주세요.', 503);
      }
      const headers = new Headers({ location: '/', 'cache-control': 'no-store' });
      headers.append('set-cookie', ownerSessionCookie(created.token));
      headers.append('set-cookie', ownerDeviceCookie(created.deviceId));
      headers.append('set-cookie', clearShareCookie());
      return new Response(null, { status: 303, headers });
    }
    if (url.pathname === '/auth/logout') {
      const auth = await getAuth(request, env);
      if (auth.role === 'owner') await revokeOwnerSession(env, auth.session?.sessionId);
      const headers = new Headers({ location: '/auth/login', 'cache-control': 'no-store' });
      headers.append('set-cookie', clearOwnerCookie());
      headers.append('set-cookie', clearShareCookie());
      return new Response(null, { status: 303, headers });
    }

    const sharePath = url.pathname.match(/^\/share\/([A-Za-z0-9_-]{20,})$/);
    if (sharePath) {
      const share = await findShareByToken(env, sharePath[1]);
      if (!share) return shareErrorPage();
      await touchShare(env, share);
      return new Response(null, { status: 303, headers: { location: '/', 'set-cookie': `${SHARE_COOKIE}=${encodeURIComponent(share.token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=15552000`, 'cache-control': 'no-store' } });
    }

    const auth = await getAuth(request, env);
    if (url.pathname.startsWith('/api/')) return handleApi(request, env, url, auth);

    const internalShareToken = request.headers.get('x-mlk-share-render') || '';
    const shareRootAllowed = auth.role === 'share' && auth.share?.token && sameString(internalShareToken, auth.share.token);
    if (url.pathname === '/' && auth.role !== 'owner' && !shareRootAllowed) return redirectToLogin();
    if (auth.role === 'none') return redirectToLogin();
    if (auth.role === 'share' && url.pathname === '/' && shareRootAllowed) await touchShare(env, auth.share);

    const response = await env.ASSETS.fetch(request);
    const nonHtml = withAssetCaching(response, url);
    if (nonHtml) return nonHtml;

    const headers = new Headers(response.headers);
    headers.set('cache-control', 'no-store');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },

  async scheduled(controller, env, ctx) {
    // One hourly trigger (wrangler.jsonc) serves both jobs, so the free-plan
    // cron count does not grow. The daily backup keeps its 23:55 KST slot.
    if (isDailyMaintenanceRun(controller)) ctx.waitUntil(createSnapshot(env, { kind: 'daily', label: '일일 자동 백업' }));
    ctx.waitUntil(runScheduledAiSnapshot(env));
  },
};
