// Three-way reconciliation of persisted kitchen state. An ingredient (including
// its active/history membership) or a recipe (including all its versions and
// metadata) is one unit. Never splice cooking text or guess between two edits
// to the same unit. Unknown fields and notes are treated atomically.
const fields = {
  items: ['pantry', 'list', value => value],
  stock: ['pantry', 'map'],
  history: ['pantry', 'list', value => value.name],
  ingredientDetectionRules: ['ingredientDetection', 'list', value => value.id],
  recipes: ['recipe', 'list', value => value.id],
  edits: ['recipe', 'list', value => value.sourceId],
  recipeGroupMeta: ['recipe', 'map'],
  ratings: ['recipe', 'map'],
  cookingHistory: ['recipe', 'map'],
  lastCooked: ['recipe', 'map'],
  hidden: ['recipe', 'list', value => value],
  hiddenVariants: ['recipe', 'list', value => value.split('/')[0]],
  trashPurged: ['recipe', 'list', value => value],
  trashPurgedVariants: ['recipe', 'list', value => value.split('/')[0]],
};
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const canonical = value => Array.isArray(value) ? value.map(canonical) : object(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const unitKey = (group, id) => {
  if (typeof id !== 'string' || !id) throw Error('unknown_identity');
  return `${group}:${id}`;
};

function units(state) {
  const result = new Map();
  for (const [field, [group, type, keyOf]] of Object.entries(fields)) {
    const value = state[field];
    if (value === undefined) continue;
    if (type === 'list' ? !Array.isArray(value) : !object(value)) throw Error('unknown_shape');
    const entries = type === 'list' ? value.map(item => [keyOf(item), item]) : Object.entries(value);
    for (const [id, item] of entries) {
      const key = unitKey(group, id), unit = result.get(key) || {};
      if (type === 'list') (unit[field] ||= []).push(item);
      else unit[field] = item;
      result.set(key, unit);
    }
  }
  return result;
}

export function mergeKitchenStates(baseRaw, localRaw, remoteRaw) {
  try {
    const [base, local, remote] = [baseRaw, localRaw, remoteRaw].map(raw => JSON.parse(raw));
    if (![base, local, remote].every(s => object(s) && s.version === 2 && Array.isArray(s.items))) return null;
    // Older tabs do not know about the editable detection dictionary and omit
    // it entirely when saving. Missing is therefore treated as unchanged when
    // the base already has this field; a new client intentionally clearing the
    // dictionary writes an explicit empty array and still wins normally.
    if (base.ingredientDetectionRules !== undefined) {
      if (local.ingredientDetectionRules === undefined) local.ingredientDetectionRules = base.ingredientDetectionRules;
      if (remote.ingredientDetectionRules === undefined) remote.ingredientDetectionRules = base.ingredientDetectionRules;
    }
    // A schema/category/library migration or full-library restore is not an
    // ordinary concurrent edit. Keep the existing recoverable conflict path.
    for (const key of ['version', 'seedRevision', 'historySeedVersion', 'pantryGroupVersion', 'recipeCategoryVersion', 'library']) {
      if (!same(base[key], local[key]) || !same(base[key], remote[key])) return null;
    }
    const [before, ours, theirs] = [base, local, remote].map(units);
    const changed = new Set();
    for (const key of new Set([...before.keys(), ...ours.keys(), ...theirs.keys()])) {
      if (same(before.get(key), ours.get(key))) continue;
      if (!same(before.get(key), theirs.get(key)) && !same(ours.get(key), theirs.get(key))) return null;
      changed.add(key);
    }
    const result = {...remote};
    for (const key of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])) {
      if (Object.hasOwn(fields, key)) continue;
      if (same(base[key], local[key])) continue;
      if (!same(base[key], remote[key]) && !same(local[key], remote[key])) return null;
      if (Object.hasOwn(local, key)) Object.defineProperty(result, key, {value: local[key], enumerable: true, writable: true, configurable: true});
      else delete result[key];
    }
    for (const [field, [group, type, keyOf]] of Object.entries(fields)) {
      if (![base, local, remote].some(s => Object.hasOwn(s, field))) continue;
      if (type === 'map') {
        const merged = new Map(Object.entries(remote[field] || {}));
        for (const id of new Set([...Object.keys(base[field] || {}), ...Object.keys(local[field] || {})])) {
          if (!changed.has(unitKey(group, id))) continue;
          if (Object.hasOwn(local[field] || {}, id)) merged.set(id, local[field][id]);
          else merged.delete(id);
        }
        result[field] = Object.fromEntries(merged);
      } else {
        const replacements = new Map(), seen = new Set(), merged = [];
        for (const item of local[field] || []) {
          const key = unitKey(group, keyOf(item));
          if (!replacements.has(key)) replacements.set(key, []);
          replacements.get(key).push(item);
        }
        for (const item of remote[field] || []) {
          const key = unitKey(group, keyOf(item));
          if (!changed.has(key)) merged.push(item);
          else if (!seen.has(key)) merged.push(...(replacements.get(key) || []));
          seen.add(key);
        }
        for (const [key, items] of replacements) if (changed.has(key) && !seen.has(key)) merged.push(...items);
        result[field] = merged;
      }
    }
    // Two individually valid edits must not combine into an unreadable state
    // by crossing the app's persisted-state limits.
    for (const [key, limit] of Object.entries({items:1000,stock:1000,history:1000,ingredientDetectionRules:2000,recipes:500,edits:500,ratings:1000,recipeGroupMeta:1000,cookingHistory:1000,lastCooked:1000,hiddenVariants:2000,trashPurgedVariants:2000})) {
      if (result[key] && Object.keys(result[key]).length > limit) return null;
    }
    const cookingRows = Object.values(result.cookingHistory || {});
    if (cookingRows.some(rows => !Array.isArray(rows) || rows.length > 1000) || cookingRows.reduce((total, rows) => total + rows.length, 0) > 20000) return null;
    const raw = JSON.stringify(result);
    return raw.length <= 5_000_000 ? raw : null;
  } catch {
    return null;
  }
}
