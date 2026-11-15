import {getAuth} from './auth-service.js';

const toMap = (items, keyFn) => new Map((Array.isArray(items) ? items : []).map(item => [keyFn(item), item]));
const jsonSame = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function safeState(raw) {
  try { return JSON.parse(raw || '{}') || {}; }
  catch { return {}; }
}

function shortList(label, values, max = 6) {
  const unique = [...new Set(values.filter(Boolean).map(String))];
  if (!unique.length) return null;
  const shown = unique.slice(0, max).join(' · ');
  return `${label}: ${shown}${unique.length > max ? ` 외 ${unique.length - max}개` : ''}`;
}

function recipeNameIndex(...states) {
  const names = new Map();
  for (const state of states) {
    for (const recipe of state?.recipes || []) if (recipe?.id) names.set(recipe.id, recipe.name || recipe.id);
    for (const recipe of state?.library?.recipes || []) if (recipe?.id) names.set(recipe.id, recipe.name || recipe.id);
    for (const edit of state?.edits || []) {
      const name = edit?.recipe?.name;
      if (edit?.sourceId && name) names.set(edit.sourceId, name);
    }
  }
  return names;
}

function diffState(previousRaw, currentRaw) {
  const before = safeState(previousRaw);
  const after = safeState(currentRaw);
  const summary = [];
  const names = recipeNameIndex(before, after);

  const beforeItems = new Set(Array.isArray(before.items) ? before.items : []);
  const afterItems = new Set(Array.isArray(after.items) ? after.items : []);
  const addedItems = [...afterItems].filter(item => !beforeItems.has(item));
  const removedItems = [...beforeItems].filter(item => !afterItems.has(item));
  summary.push(shortList('식재료 추가', addedItems), shortList('식재료 삭제', removedItems));

  const beforeStock = before.stock && typeof before.stock === 'object' ? before.stock : {};
  const afterStock = after.stock && typeof after.stock === 'object' ? after.stock : {};
  const stockChanged = [...new Set([...Object.keys(beforeStock), ...Object.keys(afterStock)])]
    .filter(name => !addedItems.includes(name) && !removedItems.includes(name) && !jsonSame(beforeStock[name], afterStock[name]));
  summary.push(shortList('식재료 상세 수정', stockChanged));

  const beforeRecipes = toMap(before.recipes, recipe => recipe?.id || '');
  const afterRecipes = toMap(after.recipes, recipe => recipe?.id || '');
  const addedRecipes = [...afterRecipes.keys()].filter(id => id && !beforeRecipes.has(id)).map(id => afterRecipes.get(id)?.name || id);
  const removedRecipes = [...beforeRecipes.keys()].filter(id => id && !afterRecipes.has(id)).map(id => beforeRecipes.get(id)?.name || id);
  const changedRecipes = [...afterRecipes.keys()].filter(id => id && beforeRecipes.has(id) && !jsonSame(beforeRecipes.get(id), afterRecipes.get(id))).map(id => afterRecipes.get(id)?.name || id);
  summary.push(shortList('레시피 추가', addedRecipes), shortList('레시피 삭제', removedRecipes), shortList('레시피 수정', changedRecipes));

  const editKey = edit => `${edit?.sourceId || ''}/${edit?.variantKey || ''}`;
  const beforeEdits = toMap(before.edits, editKey);
  const afterEdits = toMap(after.edits, editKey);
  const editAdded = [...afterEdits.keys()].filter(key => key !== '/' && !beforeEdits.has(key)).map(key => names.get(afterEdits.get(key)?.sourceId) || afterEdits.get(key)?.recipe?.name || key);
  const editRemoved = [...beforeEdits.keys()].filter(key => key !== '/' && !afterEdits.has(key)).map(key => names.get(beforeEdits.get(key)?.sourceId) || beforeEdits.get(key)?.recipe?.name || key);
  const editChanged = [...afterEdits.keys()].filter(key => key !== '/' && beforeEdits.has(key) && !jsonSame(beforeEdits.get(key), afterEdits.get(key))).map(key => names.get(afterEdits.get(key)?.sourceId) || afterEdits.get(key)?.recipe?.name || key);
  summary.push(shortList('인분·버전/기존 레시피 수정', [...editAdded, ...editChanged]), shortList('레시피 수정 되돌림', editRemoved));

  const beforeRatings = before.ratings && typeof before.ratings === 'object' ? before.ratings : {};
  const afterRatings = after.ratings && typeof after.ratings === 'object' ? after.ratings : {};
  const ratingIds = [...new Set([...Object.keys(beforeRatings), ...Object.keys(afterRatings)])].filter(id => !jsonSame(beforeRatings[id], afterRatings[id]));
  summary.push(shortList('별점 변경', ratingIds.map(id => names.get(id) || id)));

  const beforeHidden = new Set(Array.isArray(before.hidden) ? before.hidden : []);
  const afterHidden = new Set(Array.isArray(after.hidden) ? after.hidden : []);
  const hiddenAdded = [...afterHidden].filter(id => !beforeHidden.has(id)).map(id => names.get(id) || id);
  const hiddenRemoved = [...beforeHidden].filter(id => !afterHidden.has(id)).map(id => names.get(id) || id);
  summary.push(shortList('레시피 삭제', hiddenAdded), shortList('레시피 복원', hiddenRemoved));

  const beforeHiddenVariants = new Set(Array.isArray(before.hiddenVariants) ? before.hiddenVariants : []);
  const afterHiddenVariants = new Set(Array.isArray(after.hiddenVariants) ? after.hiddenVariants : []);
  summary.push(shortList('인분·버전 삭제', [...afterHiddenVariants].filter(key => !beforeHiddenVariants.has(key))), shortList('인분·버전 복원', [...beforeHiddenVariants].filter(key => !afterHiddenVariants.has(key))));

  const beforePurged = new Set(Array.isArray(before.trashPurged) ? before.trashPurged : []);
  const afterPurged = new Set(Array.isArray(after.trashPurged) ? after.trashPurged : []);
  const purgedAdded = [...afterPurged].filter(id => !beforePurged.has(id)).map(id => names.get(id) || id);
  summary.push(shortList('레시피 완전 삭제', purgedAdded));

  if (!jsonSame(before.curation ?? before.library?.curation, after.curation ?? after.library?.curation)) summary.push('요리 노트/참고 기록 변경');
  if (!jsonSame(before.library?.recipes, after.library?.recipes)) summary.push('기본 레시피 자료 갱신');

  const known = new Set(['version', 'seedRevision', 'items', 'recipes', 'stock', 'edits', 'hidden', 'hiddenVariants', 'trashPurged', 'ratings', 'curation', 'library']);
  const otherKeys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(key => !known.has(key) && !jsonSame(before[key], after[key]));
  if (otherKeys.length) summary.push(`기타 저장 정보 변경: ${otherKeys.slice(0, 5).join(' · ')}`);
  if (!summary.filter(Boolean).length && previousRaw !== currentRaw) summary.push('내부 데이터 버전/정리 정보 변경');

  return summary.filter(Boolean);
}

async function ownerSession(request, env) {
  return (await getAuth(request, env)).role === 'owner';
}

async function historyDiff(request, env, version) {
  if (!(await ownerSession(request, env))) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  const currentVersion = Number(version);
  if (!Number.isInteger(currentVersion) || currentVersion < 1) return new Response(JSON.stringify({ error: 'invalid_version' }), { status: 400, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

  const current = await env.DB.prepare('SELECT version, data, saved_at FROM state_history WHERE version=?').bind(currentVersion).first();
  if (!current) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  if (currentVersion === 1) return new Response(JSON.stringify({ version: 1, previousVersion: null, savedAt: current.saved_at, summary: ['서버에 첫 주방 상태 저장'] }), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

  const previous = await env.DB.prepare('SELECT version, data, saved_at FROM state_history WHERE version=?').bind(currentVersion - 1).first();
  if (!previous) return new Response(JSON.stringify({ version: currentVersion, previousVersion: null, savedAt: current.saved_at, summary: ['바로 이전 버전이 보관 기간 밖이라 변경 내용을 비교할 수 없어요.'] }), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

  return new Response(JSON.stringify({
    version: currentVersion,
    previousVersion: previous.version,
    savedAt: current.saved_at,
    summary: diffState(previous.data, current.data),
  }), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

async function stateVersion(request, env) {
  const auth = await getAuth(request, env);
  if (!['owner', 'share'].includes(auth.role)) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  const row = await env.DB.prepare('SELECT version, updated_at FROM owner_state WHERE id=1').first();
  return new Response(JSON.stringify({ version: Number(row?.version || 0), updatedAt: row?.updated_at || null }), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

async function latestConflict(request, env) {
  if (!(await ownerSession(request, env))) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  const row = await env.DB.prepare('SELECT id, server_version, created_at, length(client_data) AS bytes FROM sync_conflicts ORDER BY id DESC LIMIT 1').first();
  const conflict = row ? { id: Number(row.id), serverVersion: Number(row.server_version || 0), createdAt: row.created_at, bytes: Number(row.bytes || 0) } : null;
  return new Response(JSON.stringify({ conflict }), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

async function conflictData(request, env, id) {
  if (!(await ownerSession(request, env))) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  const conflictId = Number(id);
  if (!Number.isInteger(conflictId) || conflictId < 1) return new Response(JSON.stringify({ error: 'invalid_conflict' }), { status: 400, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  const row = await env.DB.prepare('SELECT id, client_data, server_version, created_at FROM sync_conflicts WHERE id=?').bind(conflictId).first();
  if (!row) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  return new Response(JSON.stringify({ conflict: { id: Number(row.id), data: row.client_data, serverVersion: Number(row.server_version || 0), createdAt: row.created_at } }), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

export async function handleStateApi(request, env, url = new URL(request.url)) {
  if (request.method === 'GET' && url.pathname === '/api/state/version') return stateVersion(request, env);
  if (request.method === 'GET' && url.pathname === '/api/conflicts/latest') return latestConflict(request, env);
  const conflictMatch = url.pathname.match(/^\/api\/conflicts\/(\d+)$/);
  if (request.method === 'GET' && conflictMatch) return conflictData(request, env, conflictMatch[1]);
  const match = url.pathname.match(/^\/api\/backups\/history\/(\d+)\/diff$/);
  if (request.method === 'GET' && match) return historyDiff(request, env, match[1]);
  return null;
}

