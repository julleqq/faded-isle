// Tiny UI toolkit: Pokémon-style dialog box, choices, full-screen panels, toasts.

import * as audio from './audio.js';
import { UI } from './content.js';

const $ = s => document.querySelector(s);
export function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') e.className = attrs[k];
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
    else e.setAttribute(k, attrs[k]);
  }
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}
export const wait = ms => new Promise(r => setTimeout(r, ms));
// iOS only shows :active (pressed) styles once a touch listener exists somewhere.
document.addEventListener('touchstart', () => {}, { passive: true });
// A tap handler shared by a group of buttons: the first tap wins, later ones are ignored,
// as are taps in the first moments after the buttons appear (the tail of a quick
// double tap on whatever was there before).
export function firstTap(fn, armMs = 250) {
  const t0 = performance.now(); let used = false;
  return (...a) => { if (used || performance.now() - t0 < armMs) return; used = true; fn(...a); };
}

// ---------- dialog ----------
const layer = $('#dialog'), box = $('#dialog .box'), who = $('#dialog .who'), txt = $('#dialog .text'), opts = $('#dialog .opts');
let advance = null;
layer.addEventListener('click', e => { if (!e.target.closest('button') && advance) advance(); });
addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && advance) { e.preventDefault(); advance(); } });

function typeLine(line, waitTap = true) {
  // "Name: text" puts Name in the speaker tab (any script: "Grande Árvore: …" works too)
  const m = line.match(/^(\p{Lu}[\p{L}\p{M}\p{N}’' ,-]{1,24}): (.*)$/su);
  who.textContent = m ? m[1] : ''; who.hidden = !m;
  const text = m ? m[2] : line;
  txt.textContent = ''; box.classList.remove('done');
  return new Promise(res => {
    let i = 0, timer;
    const finish = () => { clearInterval(timer); txt.textContent = text; box.classList.add('done');
      if (waitTap) advance = () => { advance = null; res(); }; else { advance = null; res(); } };
    advance = finish;
    timer = setInterval(() => { i += 2; txt.textContent = text.slice(0, i); if (i >= text.length) finish(); }, 30);
  });
}
export let busy = 0;   // >0 while any dialog/panel is open; the game pauses movement
export async function say(lines) {
  busy++; layer.hidden = false; opts.innerHTML = '';
  for (const l of [].concat(lines)) { await typeLine(l); audio.soft(); }
  layer.hidden = true; busy--;
}
export function choose(prompt, options) {
  busy++; layer.hidden = false;
  return new Promise(async res => {
    await typeLine(prompt, false);
    opts.innerHTML = '';
    const pick = firstTap(i => { opts.innerHTML = ''; layer.hidden = true; busy--; audio.soft(); res(i); });
    options.forEach((o, i) => opts.append(h('button', { class: 'opt', onclick: () => pick(i) }, o)));
  });
}

// ---------- panels (full-screen screens: encounters, exercises, journal) ----------
const panelEl = $('#panel');
export function openPanel(cls = '') {
  busy++; panelEl.className = cls; panelEl.innerHTML = ''; panelEl.hidden = false;
  return panelEl;
}
export function closePanel() { if (!panelEl.hidden) { panelEl.hidden = true; panelEl.innerHTML = ''; busy--; } }

// A card with text + buttons inside an open panel; resolves with the button index.
export function card(parent, title, bodyNodes, buttons) {
  return new Promise(res => {
    const pick = firstTap(i => { c.remove(); res(i); });
    const c = h('div', { class: 'card' }, title ? h('h2', {}, title) : null, ...bodyNodes,
      h('div', { class: 'btns' }, buttons.map((b, i) => h('button', { class: i === 0 ? 'primary' : '', onclick: () => pick(i) }, b))));
    parent.append(c);
    // Freeze the centring margin so opening "Learn more" grows the card downwards
    // instead of sliding everything (and the button under your finger) upwards.
    c.style.margin = getComputedStyle(c).marginTop + ' 0 auto';
  });
}

// "Learn more" expander used by pillar teaching and the journal.
export function learnMore(paragraphs) {
  const body = h('div', { hidden: '' }, ...paragraphs.map(p => h('p', {}, p)));
  const btn = h('button', { class: 'toggle', 'aria-expanded': 'false', onclick: () => {
    body.hidden = !body.hidden; btn.setAttribute('aria-expanded', String(!body.hidden));
  } }, UI.learnMore);
  return h('div', { class: 'more' }, btn, body);
}
export function verse(text, source) {
  return h('blockquote', { class: 'verse' }, ...text.split('\n').flatMap((l, i) => i ? [h('br'), l] : [l]), h('cite', {}, source));
}

let toastTimer;
export function toast(text, ms = 2600) {
  const t = $('#toast'); t.textContent = text; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}
