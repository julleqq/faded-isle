// Languages. English is written next to the code that uses it (content.js,
// exercises.js, finale.js); each other language lives in ONE file, lang/<code>.js,
// holding the same keys. Anything a translation leaves out falls back to English.
//
// To add a language: copy lang/fi.js to lang/xx.js, translate the strings, import it
// below, add it to LANGS and PACKS, and list the file in build.mjs (ORDER) and sw.js (FILES).

import { fi } from './lang/fi.js';
import { pt } from './lang/pt.js';

export const LANGS = { en: 'English', fi: 'Suomi', pt: 'Português (BR)' };
const PACKS = { fi, pt };
const KEY = 'fadedisle.lang';

function pick() {
  try { const q = new URLSearchParams(location.search).get('lang'); if (q && q in LANGS) return q; } catch (e) {}
  try { const s = localStorage.getItem(KEY); if (s && s in LANGS) return s; } catch (e) {}
  try {
    for (const l of navigator.languages || [navigator.language || '']) {
      const c = String(l).toLowerCase();
      if (c.startsWith('fi')) return 'fi';
      if (c.startsWith('pt')) return 'pt';
      if (c.startsWith('en')) return 'en';
    }
  } catch (e) {}
  return 'en';
}

export const lang = pick();
export const PACK = PACKS[lang] || {};
try { document.documentElement.lang = lang === 'pt' ? 'pt-BR' : lang; } catch (e) {}

// Remember the choice and reload. The caller saves the game first.
export function setLang(l) {
  if (!(l in LANGS)) return;
  try { localStorage.setItem(KEY, l); } catch (e) {}
  const u = new URL(location.href);
  if (u.searchParams.has('lang')) u.searchParams.set('lang', l);
  let stored = false;
  try { stored = localStorage.getItem(KEY) === l; } catch (e) {}
  if (!stored) u.searchParams.set('lang', l);          // no storage (private mode): keep it in the address
  if (u.href !== location.href) location.replace(u.href); else location.reload();
}

// "Hello {name}" + { name: 'Ada' } -> "Hello Ada". Unknown {keys} stay as they are.
export const fmt = (s, o = {}) => String(s).replace(/\{(\w+)\}/g, (m, k) => (k in o ? o[k] : m));

// Copies a translation over the English originals, in place, so modules keep their
// exported objects. Strings and lists of strings are replaced; lists of objects are
// merged item by item (so ids, colours and numbers stay with the code).
// `missing`/`unknown`/`lengths` record gaps for the translation check (#debug: GAME.i18n).
export const missing = [];
export const unknown = [];
export const lengths = [];
const SKIP = new Set(['id', 'color', 'move', 'pillar', 'weak', 'effect']);
const isObj = x => x && typeof x === 'object' && !Array.isArray(x);
export function localize(en, tr, path = '') {
  if (tr != null && typeof tr === 'object') for (const k of Object.keys(tr)) if (!(k in en)) unknown.push(path + '.' + k);
  for (const k of Object.keys(en)) {
    if (SKIP.has(k)) continue;
    const a = en[k], b = tr == null ? undefined : tr[k], p = path + (Array.isArray(en) ? `[${k}]` : '.' + k);
    if (typeof a === 'string') {
      if (typeof b === 'string') en[k] = b; else if (lang !== 'en') missing.push(p);
    } else if (Array.isArray(a) && !a.some(isObj)) {                 // a list of lines (or [look, text] pairs)
      if (Array.isArray(b)) { if (b.length !== a.length) lengths.push(`${p}: ${a.length} -> ${b.length}`); a.splice(0, a.length, ...b); }
      else if (lang !== 'en') missing.push(p);
    } else if (a && typeof a === 'object') localize(a, b, p);
  }
  return en;
}

// Pairs each English string with its translation, walking two parallel structures.
// Used for things saved by their English text (value names, suggested steps and moves),
// so a saved journey shows up in whatever language is chosen later.
export function phrasebook(en, loc, map = new Map()) {
  if (typeof en === 'string') { if (typeof loc === 'string') map.set(en, loc); }
  else if (en && typeof en === 'object' && loc && typeof loc === 'object') for (const k of Object.keys(en)) phrasebook(en[k], loc[k], map);
  return map;
}
export const clone = x => JSON.parse(JSON.stringify(x));
