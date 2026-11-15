import {noteKind} from '../public/note-classification.js';

function familyNoteKind(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return 'private';
  return noteKind(row);
}

function familySafeCuration(rows) {
  return Array.isArray(rows)
    ? rows.filter(row => ['tip', 'candidate'].includes(familyNoteKind(row)))
    : [];
}

function emptyFamilyState() {
  return {
    version: 2,
    items: [],
    recipes: [],
    stock: {},
    history: [],
    historySeedVersion: 1,
    edits: [],
    recipeGroupMeta: {},
    hidden: [],
    hiddenVariants: [],
    trashPurged: [],
    ratings: {},
    lastCooked: {},
    curation: [],
  };
}

export function familySafeState(state) {
  if (state === null || state === undefined) return state;
  if (typeof state !== 'object' || Array.isArray(state)) return emptyFamilyState();
  const next = { ...state };
  if (Object.hasOwn(state, 'curation')) next.curation = familySafeCuration(state.curation);
  const library = state.library;
  if (library && typeof library === 'object' && !Array.isArray(library)) {
    next.library = { ...library, curation: familySafeCuration(library.curation) };
  } else if (Object.hasOwn(state, 'library')) {
    delete next.library;
  }
  return next;
}

// Read-only share snapshots pass D1 state through this projection before clients receive it.
export function familySafeData(raw) {
  if (!raw) return raw;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return JSON.stringify(emptyFamilyState());
    return JSON.stringify(familySafeState(parsed));
  }
  catch { return JSON.stringify(emptyFamilyState()); }
}
