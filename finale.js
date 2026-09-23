// The Choice Point: the finale at the Great Tree.
// Based on the ACT "choice point" (Harris): when hooks (difficult thoughts,
// feelings, urges) show up we can make away moves or toward moves. The player
// names their own away and toward moves, meets six hooks on a path up the
// trunk, unhooks with the six skills, and chooses one toward move for the week.
//
// finale(panelEl, S) runs inside an open panel and resolves when done, leaving
// S.finale = { situation, away, toward, written: { away, toward }, forks, commitment }.

import { h, wait, say } from './ui.js';
import { drawCharacter, drawEnso } from './art.js';
import { PILLARS, MOVES } from './content.js';
import { rng } from './world.js';
import * as audio from './audio.js';

// Every player-facing string. Whole sentences; {name} marks a placeholder.
export const TEXT = {
  title: 'The Choice Point',
  tree: 'Great Tree',                     // speaker name in the dialog box
  awayLabel: 'away',                      // written by the left branch
  towardLabel: 'toward',                  // written by the right branch
  canvasLabel: 'The Great Tree. Its left branch holds away moves, its right branch holds toward moves.',
  arrival: [
    'Welcome back, traveller. Sit with me a while. Here, where my trunk divides in two, is the Choice Point.',
    'Every day, difficult thoughts and feelings show up: worries, doubts, old stories, sudden urges. We call them hooks, because they catch us and pull.',
    'When a hook catches us, we often make away moves: things we do that take us away from the life we want. My left branch holds those.',
    'Toward moves are things we do that take us toward the life we want, and the person we want to be, even while the hooks are still there. My right branch holds those.',
    'Everyone makes both, every single day. Nothing is wrong with you for having away moves. Simply noticing them is the first step.',
  ],
  situationPrompt: 'Is there a situation that is hard for you right now? If you like, write a few words, and keep it in mind as we go.',
  situationNote: 'Optional. Whatever you write stays on this device.',
  situationPlaceholder: 'For example: a conversation I keep putting off',
  skip: 'Skip',
  continue: 'Continue',
  back: 'Back',
  add: 'Add',
  awayPrompt: 'Which of these away moves do you recognise in your own life? Choose at least three, and write at least one of your own.',
  awayPlaceholder: 'An away move of your own',
  towardPrompt: 'And which toward moves matter to you, or could? Choose at least three, and write at least one of your own.',
  towardPlaceholder: 'A toward move of your own',
  lanterns: 'Your lanterns: {values}. The ideas marked with a small light grow from them.',
  listSep: ' · ',
  needChooseOne: 'Choose 1 more',
  needChooseMany: 'Choose {n} more',
  needOwn: 'Write 1 of your own',
  ready: 'Ready when you are.',
  awayMoves: [
    'Scrolling for hours', 'Putting things off', 'Avoiding people or places', 'Overworking to avoid feeling',
    'Snapping at people I care about', 'Eating, drinking or shopping to numb', 'Overthinking the same thing',
    'Cancelling plans', 'People-pleasing', 'Staying in bed', 'Hiding how I really feel', 'Arguing with my own thoughts',
  ],
  towardMoves: [
    'Calling a friend', 'Going for a walk', 'Starting the task with one small step', 'Saying how I feel',
    'Resting on purpose', 'Asking for help', 'Making something', 'Learning something', 'Being kind to myself',
    'Keeping a promise to myself', 'Spending time in nature', 'Being present with someone',
  ],
  // Toward ideas suggested by the lanterns chosen at the summit (keys match content.js VALUE_LANTERNS).
  valueToward: {
    Kindness: 'Doing something kind for someone', Curiosity: 'Following something I wonder about',
    Courage: 'Doing one thing I have been avoiding', Connection: 'Reaching out to someone I miss',
    Creativity: 'Playing with an idea, just for fun', Health: 'Looking after my body today',
    Honesty: 'Telling the truth, kindly', Play: 'Doing something just for fun',
    Growth: 'Trying something a little hard for me', Nature: 'Noticing the sky, the trees or the sea',
    Calm: 'Slowing down on purpose', Adventure: 'Trying something new',
    Family: 'Spending real time with family', Learning: 'Reading or practising something new',
    Fairness: 'Standing up for someone', Beauty: 'Making room for something beautiful',
    'Self-care': 'Doing one thing to look after myself', Contribution: 'Helping someone with something small',
  },
  forksIntro: 'Now let us climb. The path up my trunk has six forks. At each one a hook will show up, and you choose which way to go. Nothing here is a test. We are only noticing.',
  startClimb: 'Start climbing',
  forkPrompt: 'Fork {n} of {total}. A hook shows up on the path. What will you do?',
  awayLine: '“{move}” is an away move, and a very human one. It helps for a moment, then the hook is still there. Try another way.',
  awayAgain: '“{move}” is an away move too. Hooks pull hard, and that is completely human. Notice it, and try another way.',
  keepClimbing: 'Keep climbing',
  // One hook per pillar. `best` explains why the best-fitting skill fits; `other`
  // is shown when another skill was used ({best} = name of the best-fitting skill).
  forks: {
    present: {
      hook: 'Your mind races ahead to tomorrow’s worries.',
      best: 'You drop anchor: feet on the ground, one breath, the sounds around you. The worries may still chatter, but you are here, where life actually happens.',
      other: 'That helps too. Any of the skills can loosen a hook. For a mind racing into tomorrow, “{best}” fits especially well, because it brings you back to now.',
    },
    defusion: {
      hook: 'The thought: “I’m going to mess this up.”',
      best: '“I’m having the thought that I’m going to mess this up.” The words are still there, but now you can see them as words, not as a prediction you have to obey.',
      other: 'That helps too. Any of the skills can loosen a hook. When a thought grips this tightly, “{best}” fits especially well, because it lets you see the thought as a thought.',
    },
    acceptance: {
      hook: 'A wave of anxiety rises in your chest.',
      best: 'You breathe into the feeling and give it room instead of fighting it. It is uncomfortable, and it can come along. Pushing against it would only make the wave bigger.',
      other: 'That helps too. Any of the skills can loosen a hook. For a feeling in the body, “{best}” fits especially well, because making space for it keeps the struggle from growing.',
    },
    selfctx: {
      hook: 'The old story: “I’m just not the kind of person who can do this.”',
      best: 'You notice who is noticing the story. The story is weather passing through. You are the sky that holds it, bigger than any story about you.',
      other: 'That helps too. Any of the skills can loosen a hook. For an old story about who you are, “{best}” fits especially well, because you are the one who notices the story, and you are more than it.',
    },
    values: {
      hook: 'The thought: “What’s the point anyway?”',
      best: 'You remember what you care about. The point was never to feel good all the time. It is to live by what matters to you, and that is still here.',
      other: 'That helps too. Any of the skills can loosen a hook. When the meaning drains out of things, “{best}” fits especially well, because your values are the point, and they are still here.',
    },
    action: {
      hook: 'The urge: “I’ll start when I feel ready.”',
      best: 'You take one small step now and let the not-ready feeling come along. Readiness often arrives after we start, not before.',
      other: 'That helps too. Any of the skills can loosen a hook. For waiting until you feel ready, “{best}” fits especially well: one small step, with the feeling along for the ride.',
    },
  },
  forksDone: 'You reached the crown. Look at my right branch: every skill you used brought colour back to it.',
  commitPrompt: 'Choose one toward move to take this week. Something small is perfect.',
  commitPromptSituation: 'Thinking of what is hard for you right now, choose one toward move to take this week. Something small is perfect.',
  commitNeed: 'Choose one',
  commitBtn: 'I choose this',
  closing: [
    'Look. My toward branch is in full colour now.',
    'The away branch is still here, grey and quiet. Away moves never disappear, and hooks will come again. That is part of being human. What changes is that you notice them sooner, and remember there are other ways to go.',
    'This week: “{move}”. One small step is enough. And if you slip, come back to the Choice Point. It is always here.',
  ],
  closingNote: 'Your toward move for this week: “{move}”',
  finish: 'Continue',
};

const fmt = (s, o = {}) => s.replace(/\{(\w+)\}/g, (m, k) => (k in o ? o[k] : m));

const INK = '#1d1b19', GREY = '#8d8a82', SOFT = '#5b564e', PAPER2 = '#f7f2e7';
const SERIF = '"Iowan Old Style", Palatino, Georgia, serif';
const FORKS = [                              // hook order and the "other" skill offered at each fork
  { pillar: 'present', other: 'defusion' },
  { pillar: 'defusion', other: 'acceptance' },
  { pillar: 'acceptance', other: 'present' },
  { pillar: 'selfctx', other: 'defusion' },
  { pillar: 'values', other: 'action' },
  { pillar: 'action', other: 'values' },
];
const skillOf = pillar => Object.keys(MOVES).find(k => MOVES[k].pillar === pillar);
const PALETTE = ['present', 'defusion', 'acceptance', 'selfctx', 'values', 'action'].map(k => PILLARS[k].color).concat(['#9cc27a', '#e9868a']);
const clamp01 = x => Math.max(0, Math.min(1, x));
const ease = t => t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const now = () => performance.now();

// ---------- styles (scoped to the finale panel) ----------
const CSS = `
#panel.finale { padding-bottom: 0; -webkit-user-select: none; user-select: none; }
#panel.finale, #panel.finale * { touch-action: manipulation; }
#panel.finale input, #panel.finale textarea { -webkit-user-select: text; user-select: text; font-size: 16px; }
#panel.finale .title { margin: 2px 0 8px; position: relative; z-index: 4; }
#panel.finale .ftree { width: 100%; height: clamp(210px, 36vh, 360px); flex: none; display: block; border: 2px solid var(--ink); border-radius: 12px; background: ${PAPER2}; }
#panel.finale .ftree.big { height: clamp(240px, 50vh, 460px); }
#panel.finale.fpin { scroll-padding: calc(var(--safe-t) + clamp(150px, 24vh, 230px) + 16px) 0 150px; }
#panel.finale.fpin .ftree { height: clamp(150px, 24vh, 230px); position: sticky; top: calc(var(--safe-t) + 6px); z-index: 3; box-shadow: 0 -64px 0 var(--paper); }
#panel.finale .fmsg { min-height: 4.4em; margin: 10px 0 8px; font-size: 17px; line-height: 1.45; text-align: center; }
#panel.finale .fmsg p { margin: 0 0 6px; }
#panel.finale .ftag { display: inline-flex; align-items: center; gap: 7px; font-size: 15px; letter-spacing: .06em; margin: 0 0 4px; }
#panel.finale .ftag::before { content: ''; width: 12px; height: 12px; border-radius: 50%; background: var(--c); border: 1.5px solid var(--ink); }
#panel.finale .fbody { flex: none; padding-bottom: 14px; }
#panel.finale .fnote { font-size: 15px; color: var(--ink-soft); text-align: center; margin: 6px 0 12px; line-height: 1.4; font-style: italic; }
#panel.finale .fchips { margin: 4px 0 14px; }
#panel.finale .fchips .chip { min-height: 44px; font-size: 15px; line-height: 1.25; padding: .45em 1em; }
#panel.finale .fchips .chip.on { background: var(--ink); color: var(--paper-2); }
#panel.finale .fchips .chip.ownchip { font-style: italic; border-style: dashed; }
#panel.finale .fchips .chip.ownchip.on { border-style: solid; }
#panel.finale .fchips .chip.lan::before { content: ''; display: inline-block; width: 9px; height: 9px; margin-right: 7px; border-radius: 50%; background: #e2b441; border: 1px solid var(--ink); vertical-align: 1px; }
#panel.finale .fown { display: flex; gap: 8px; }
#panel.finale .fown input { min-height: 48px; flex: 1; min-width: 0; }
#panel.finale .fown button { min-height: 48px; min-width: 76px; flex: none; }
#panel.finale textarea { min-height: 96px; margin: 0; }
#panel.finale .fbar { position: sticky; bottom: 0; margin-top: auto; z-index: 2; background: var(--paper); padding: 8px 0 calc(var(--safe-b) + 14px); }
#panel.finale .fbar::before { content: ''; position: absolute; left: 0; right: 0; top: -18px; height: 18px; background: linear-gradient(rgba(239, 231, 214, 0), var(--paper)); pointer-events: none; }
#panel.finale .fhint { min-height: 2.8em; margin: 0 0 6px; display: flex; align-items: center; justify-content: center; text-align: center; font-size: 15px; line-height: 1.4; color: var(--ink-soft); }
#panel.finale .fhint.nudge { color: var(--ink); animation: fnudge .45s; }
@keyframes fnudge { 20%, 60% { transform: translateX(-5px); } 40%, 80% { transform: translateX(5px); } }
#panel.finale .frow { display: flex; gap: 10px; justify-content: center; }
#panel.finale .frow button { min-height: 48px; min-width: 88px; }
#panel.finale .frow .primary { flex: 1 1 auto; max-width: 320px; }
#panel.finale button.primary.off { background: var(--paper-2); color: var(--ink-soft); border-style: dashed; box-shadow: none; }
#panel.finale .fopts { display: flex; flex-direction: column; gap: 8px; width: 100%; }
#panel.finale .fopts button { width: 100%; min-height: 50px; border-radius: 14px; line-height: 1.3; }
#panel.finale .fopts button:disabled { opacity: .45; }
#panel.finale .fopts button.picked { opacity: 1; background: var(--ink); color: var(--paper-2); }
#panel.finale .fopts button.picked.away { background: ${SOFT}; border-color: ${SOFT}; }
@media (prefers-reduced-motion: reduce) { #panel.finale .fhint.nudge { animation: none; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('finale-css')) {
  document.head.append(h('style', { id: 'finale-css' }, CSS));
  document.addEventListener('touchstart', () => {}, { passive: true });   // lets :active press states show on iOS
}

// ---------- small helpers ----------
function tween(ms, fn) {
  ms = REDUCED ? Math.min(ms, 150) : ms;
  return new Promise(res => {
    const t0 = now();
    const step = () => { const k = Math.min(1, (now() - t0) / ms); fn(k); if (k < 1) requestAnimationFrame(step); else res(); };
    requestAnimationFrame(step);
  });
}
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
// A button that, by default, acts only once and ignores taps in its first moments
// (bar buttons appear where the last tap landed; a double-tap must not skip a screen).
function btn(label, cls, onTap, once = true, guard = once ? 300 : 0) {
  const b = h('button', { type: 'button', class: cls || '' }, label), born = now();
  let used = false;
  b.addEventListener('click', e => {
    if (now() - born < guard || (once && used) || b.disabled) return;
    if (once) used = true;
    onTap(e, b);
  });
  return b;
}
function wrapText(g, text, maxW) {
  const lines = []; let cur = '';
  for (const w of text.split(/\s+/)) {
    const t = cur ? cur + ' ' + w : w;
    if (cur && g.measureText(t).width > maxW) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}
function rrect(g, x, y, w, hh, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + hh, r); g.arcTo(x + w, y + hh, x, y + hh, r);
  g.arcTo(x, y + hh, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
const qpt = (B, t) => { const u = 1 - t; return [u * u * B[0][0] + 2 * u * t * B[1][0] + t * t * B[2][0], u * u * B[0][1] + 2 * u * t * B[1][1] + t * t * B[2][1]]; };
const qdir = (B, t) => [2 * (1 - t) * (B[1][0] - B[0][0]) + 2 * t * (B[2][0] - B[1][0]), 2 * (1 - t) * (B[1][1] - B[0][1]) + 2 * t * (B[2][1] - B[1][1])];
const cpt = (P, t) => { const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t; return [a * P[0][0] + b * P[1][0] + c * P[2][0] + d * P[3][0], a * P[0][1] + b * P[1][1] + c * P[2][1] + d * P[3][1]]; };
function polyline(g, pts) { g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); }
const sample = (f, P, t0, t1, n = 20) => Array.from({ length: n + 1 }, (_, i) => f(P, t0 + (t1 - t0) * i / n));
// A brush stroke: a filled shape along `pts`, width w0 at the start tapering to w1, with a few dry-brush streaks.
function taper(g, pts, w0, w1, color, alpha = 1, streaks = true) {
  const n = pts.length, A = [], B = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    const w = (w0 + (w1 - w0) * i / (n - 1)) / 2 * (1 + Math.sin(i * 2.3) * .06);
    A.push([pts[i][0] - dy / len * w, pts[i][1] + dx / len * w]); B.push([pts[i][0] + dy / len * w, pts[i][1] - dx / len * w]);
  }
  g.globalAlpha = alpha; g.fillStyle = color; g.beginPath();
  A.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
  for (let i = n - 1; i >= 0; i--) g.lineTo(B[i][0], B[i][1]);
  g.closePath(); g.fill();
  const [ex, ey] = pts[n - 1]; g.beginPath(); g.arc(ex, ey, w1 / 2, 0, 7); g.fill();
  if (streaks && w0 > 6) {
    g.strokeStyle = 'rgba(247, 242, 231, .16)'; g.lineWidth = 1;
    for (const f of [-.45, .1, .5]) polyline(g, A.map(([x, y], i) => [x + (B[i][0] - x) * (.5 + f * .5), y + (B[i][1] - y) * (.5 + f * .5)]).slice(1, -2));
  }
  g.globalAlpha = 1;
}

// ---------- the tree canvas ----------
// T holds everything the canvas shows; the draw loop reads it every frame.
function treeState(S) {
  return {
    mode: 'tree', char: S.char || 'drop', leaves: [], progress: 0, final: 0, highlight: null,
    fork: 0, done: 0, hookA: 0, walk: { kind: 'fork', i: 0, u: 0, dir: 1, moving: false }, camY: null,
  };
}
function addLeaf(T, side, key) {
  const L = T.leaves.find(l => l.key === key);
  if (L) { if (L.dying) { L.dying = null; L.born = now() - 150; } return; }
  const used = new Set(T.leaves.filter(l => l.side === side).map(l => l.slot));
  let slot = 0; while (used.has(slot)) slot++;
  T.leaves.push({ side, key, slot, color: side < 0 ? '#a7a398' : PALETTE[slot % PALETTE.length], born: now(), dying: null });
}
function dropLeaf(T, key) { const L = T.leaves.find(l => l.key === key); if (L && !L.dying) L.dying = now(); }

function geom(W, H, t) {
  const s = Math.max(.7, Math.min(W / 380, H / 240, 1.4));
  const cx = W / 2, baseY = H - 14, splitY = H * .56, sway = Math.sin(t * .6) * 2 * s;
  return {
    s, cx, baseY, splitY,
    L: [[cx, splitY], [cx - W * .07, H * .3], [cx - W * .35 + sway, H * .17]],
    R: [[cx, splitY], [cx + W * .07, H * .3], [cx + W * .35 + sway, H * .17]],
  };
}
function leafPos(G, side, slot) {
  const B = side < 0 ? G.L : G.R, t = .24 + .76 * ((slot * .618034 + .37) % 1);
  const [x, y] = qpt(B, t), [dx, dy] = qdir(B, t), len = Math.hypot(dx, dy) || 1;
  const sgn = slot % 2 ? 1 : -1, ring = Math.floor(slot / 12);
  const nx = -dy / len * sgn, ny = dx / len * sgn, d = (9 + (slot * 5) % 7 + ring * 11) * G.s;
  return { x: x + nx * d, y: y + ny * d, a: Math.atan2(ny, nx) };
}
function drawLeaf(g, x, y, a, len, color, alpha) {
  g.save(); g.translate(x, y); g.rotate(a); g.globalAlpha = alpha;
  g.fillStyle = color; g.beginPath(); g.moveTo(-len * .45, 0);
  g.quadraticCurveTo(0, -len * .42, len * .55, 0); g.quadraticCurveTo(0, len * .42, -len * .45, 0); g.fill();
  g.strokeStyle = INK; g.globalAlpha = alpha * .55; g.lineWidth = .8; g.stroke();
  g.beginPath(); g.moveTo(-len * .45, 0); g.lineTo(len * .4, 0); g.stroke();
  g.restore();
}
function blossom(g, x, y, r, color, k) {
  if (k <= 0) return;
  r *= ease(clamp01(k));
  g.fillStyle = color;
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; g.beginPath(); g.ellipse(x + Math.cos(a) * r * .6, y + Math.sin(a) * r * .6, r * .55, r * .38, a, 0, 7); g.fill(); }
  g.fillStyle = '#f3d27a'; g.beginPath(); g.arc(x, y, r * .28, 0, 7); g.fill();
  g.strokeStyle = INK; g.lineWidth = .8; g.globalAlpha = .5; g.beginPath(); g.arc(x, y, r * .28, 0, 7); g.stroke(); g.globalAlpha = 1;
}
function label(g, text, x, y, color, align = 'center', size = 14) {
  g.font = `italic ${size}px ${SERIF}`; g.textAlign = align; g.textBaseline = 'middle';
  g.lineWidth = 4; g.strokeStyle = PAPER2; g.globalAlpha = .9; g.strokeText(text, x, y); g.globalAlpha = 1;
  g.fillStyle = color; g.fillText(text, x, y); g.textBaseline = 'alphabetic';
}
// Right branch coloured in six pillar segments, `amount` 0..6 of them (fractional grows the last one).
function colourBranch(g, B, amount, s, colors) {
  const wAt = t => (13 + (2.5 - 13) * t) * s * .66;
  for (let j = 0; j < 6; j++) {
    const k = clamp01(amount - j); if (k <= 0) break;
    const t0 = j / 6, t1 = (j + k) / 6;
    taper(g, sample(qpt, B, Math.max(0, t0 - .012), t1, 6), wAt(t0), wAt(t1), colors[j], 1, false);
  }
}
const FORK_COLORS = FORKS.map(f => PILLARS[f.pillar].color);

function drawTreeView(g, W, H, t, T) {
  const G = geom(W, H, t), s = G.s, ls = Math.max(.9, s), fin = T.final, tNow = now();
  g.fillStyle = PAPER2; g.fillRect(0, 0, W, H);
  if (fin > 0) {                                                   // sunset warmth on the toward side
    const gr = g.createRadialGradient(W * .78, H * .25, 5, W * .78, H * .25, W * .75);
    gr.addColorStop(0, `rgba(246, 196, 120, ${.55 * fin})`); gr.addColorStop(1, 'rgba(246, 196, 120, 0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }
  g.fillStyle = 'rgba(29,27,25,.08)'; g.beginPath(); g.ellipse(G.cx, G.baseY + 2, W * .4, 6 * s, 0, 0, 7); g.fill();
  // trunk and roots
  const trunk = sample(cpt, [[G.cx - 2 * s, G.baseY], [G.cx + 6 * s, G.baseY - (G.baseY - G.splitY) * .4], [G.cx - 5 * s, G.baseY - (G.baseY - G.splitY) * .7], [G.cx, G.splitY]], 0, 1, 14);
  taper(g, trunk, 24 * s, 12 * s, INK, .94);
  taper(g, [[G.cx - 4 * s, G.baseY - 6 * s], [G.cx - 16 * s, G.baseY - 1], [G.cx - 28 * s, G.baseY + 1]], 9 * s, 2 * s, INK, .9, false);
  taper(g, [[G.cx + 4 * s, G.baseY - 6 * s], [G.cx + 18 * s, G.baseY - 1], [G.cx + 30 * s, G.baseY + 1]], 9 * s, 2 * s, INK, .9, false);
  // branches: away (left) quietens to grey at the end; toward (right) takes colour
  const awayCol = fin > 0 ? GREY : INK, awayA = 1 - .4 * fin;
  for (const [B, sx, col, a] of [[G.L, -1, awayCol, awayA], [G.R, 1, INK, 1]]) {
    taper(g, sample(qpt, B, 0, 1, 16), 13 * s, 2.5 * s, col, .94 * a);
    const [x, y] = qpt(B, .45);                                    // a twig on each branch
    taper(g, [[x, y], [x + sx * W * .015, y - H * .07], [x + sx * W * .045, y - H * .12]], 4.5 * s, 1.2 * s, col, .9 * a, false);
  }
  if (T.progress > 0) colourBranch(g, G.R, T.progress, s, FORK_COLORS);
  if (fin > 0) {                                                   // glow along the toward branch
    const [mx, my] = qpt(G.R, .6), gl = g.createRadialGradient(mx, my, 4, mx, my, 70 * s);
    gl.addColorStop(0, `rgba(255, 214, 120, ${.35 * fin})`); gl.addColorStop(1, 'rgba(255, 214, 120, 0)');
    g.fillStyle = gl; g.beginPath(); g.arc(mx, my, 70 * s, 0, 7); g.fill();
  }
  // leaves
  T.leaves = T.leaves.filter(l => !l.dying || tNow - l.dying < 420);
  for (const l of T.leaves) {
    const k = l.dying ? 1 - clamp01((tNow - l.dying) / 400) : ease(clamp01((tNow - l.born) / 550));
    if (k <= 0) continue;
    const p = leafPos(G, l.side, l.slot), wob = Math.sin(t * 1.3 + l.slot) * .08;
    const alpha = l.side < 0 ? (1 - .4 * fin) : 1;
    drawLeaf(g, p.x, p.y, p.a + wob, (l.side > 0 ? 19 + 3 * fin : 18) * ls * k, l.color, alpha);
    if (T.highlight === l.key) {
      g.strokeStyle = INK; g.lineWidth = 1.6; g.globalAlpha = .6 + .3 * Math.sin(t * 4);
      g.beginPath(); g.arc(p.x, p.y, 15 * ls, 0, 7); g.stroke(); g.globalAlpha = 1;
    }
  }
  // blossoms, one per pillar reached on the climb
  for (let j = 0; j < 6; j++) {
    const k = (T.progress - j - .5) / .5; if (k <= 0) break;
    const [x, y] = qpt(G.R, (j + .8) / 6), sgn = j % 2 ? 1 : -1;
    blossom(g, x + sgn * 3 * s, y - 8 * s, 8.5 * s, FORK_COLORS[j], k);
  }
  if (fin > 0) {                                                   // petals drifting from the toward branch
    for (let i = 0; i < 12; i++) {
      const [bx] = qpt(G.R, .2 + (i * .37) % .8), fall = ((t * 14 + i * 41) % (H * .9));
      const x = bx + Math.sin(t * .8 + i) * 12 * s, y = H * .15 + fall;
      g.globalAlpha = fin * .8 * (1 - fall / (H * .9)); g.fillStyle = FORK_COLORS[i % 6];
      g.beginPath(); g.ellipse(x, y, 3.2 * s, 2 * s, t + i, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
  }
  // which side is which, in the lower corners where no leaf grows
  label(g, TEXT.awayLabel, 14, H - 18, SOFT, 'left', 15);
  label(g, TEXT.towardLabel, W - 14, H - 18, INK, 'right', 15);
  // the traveller: looking up at the tree before the climb, on the toward side after it
  const after = T.progress > 0;
  drawCharacter(g, T.char, G.cx + (after ? 34 : -34) * s, G.baseY + 1, after ? -1 : 1, 0, 1.1 * s);
}

// Fork view: a path climbing the trunk. Fork i sits at world y = -i * SP; the camera follows the walker.
function forkGeom(W, H) { const SP = Math.max(140, H * .62); return { SP, cx: W / 2 }; }
const arcP = (F, W, i) => { const y = -i * F.SP; return [[F.cx, y], [F.cx + W * .3, y - F.SP * .2], [F.cx + W * .3, y - F.SP * .8], [F.cx, y - F.SP]]; };
const stubP = (F, W, i) => { const y = -i * F.SP; return [[F.cx, y], [F.cx - W * .1, y - F.SP * .1], [F.cx - W * .22, y - F.SP * .04], [F.cx - W * .3, y + F.SP * .02]]; };
function walkerPos(T, F, W) {
  const w = T.walk;
  if (w.kind === 'arc') return cpt(arcP(F, W, w.i), w.u);
  if (w.kind === 'stub') {
    const [x, y] = cpt(stubP(F, W, w.i), Math.min(1, w.u));
    if (w.spin) return [x + Math.sin(w.spin * Math.PI * 2) * 9, y - (1 - Math.cos(w.spin * Math.PI * 2)) * 5];
    return [x, y];
  }
  return [F.cx, -w.i * F.SP];
}
// A fishing line dropping from above, its hook caught in the label at (x, y).
function hookGlyph(g, x, y, a) {
  g.save(); g.globalAlpha = a; g.strokeStyle = INK; g.lineCap = 'round'; g.lineJoin = 'round';
  g.lineWidth = 1; g.setLineDash([1, 3]); g.beginPath(); g.moveTo(x, 0); g.lineTo(x, y - 12); g.stroke(); g.setLineDash([]);
  g.lineWidth = 2.2; g.beginPath(); g.moveTo(x, y - 12); g.lineTo(x, y + 4); g.arc(x - 6, y + 4, 6, 0, Math.PI); g.lineTo(x - 12, y - 2); g.lineTo(x - 8.5, y + 1); g.stroke();
  g.restore();
}
function drawMini(g, x, y, w, hh, T) {
  g.globalAlpha = .94; g.fillStyle = PAPER2; rrect(g, x, y, w, hh, 8); g.fill(); g.globalAlpha = 1;
  g.strokeStyle = 'rgba(29,27,25,.35)'; g.lineWidth = 1; g.stroke();
  const cx = x + w / 2, by = y + hh - 7, sy = y + hh * .56;
  const L = [[cx, sy], [cx - w * .06, y + hh * .32], [cx - w * .34, y + hh * .18]];
  const R = [[cx, sy], [cx + w * .06, y + hh * .32], [cx + w * .34, y + hh * .18]];
  g.lineCap = 'round'; g.strokeStyle = INK; g.lineWidth = 3.5; polyline(g, [[cx, by], [cx, sy]]);
  g.lineWidth = 2.4; g.strokeStyle = GREY; polyline(g, sample(qpt, L, 0, 1, 8));
  g.strokeStyle = INK; polyline(g, sample(qpt, R, 0, 1, 8));
  g.lineWidth = 2.6;
  for (let j = 0; j < T.done; j++) { g.strokeStyle = FORK_COLORS[j]; polyline(g, sample(qpt, R, j / 6, (j + 1) / 6, 4)); }
  const w0 = T.walk, climbed = Math.min(6, T.done + (w0.kind === 'arc' ? w0.u : 0));
  g.fillStyle = '#b33a2e'; g.beginPath(); g.arc(cx, by + (sy - by) * climbed / 6, 3.2, 0, 7); g.fill();
}
function drawForkView(g, W, H, t, T) {
  const F = forkGeom(W, H), [wx, wy] = walkerPos(T, F, W);
  if (T.camY == null) T.camY = wy;
  T.camY += (wy - T.camY) * .08;
  const sy = y => y - T.camY + H * .76;
  // trunk wood, with grain that scrolls past as you climb
  g.fillStyle = '#f2ead9'; g.fillRect(0, 0, W, H);
  const R = rng(5);
  g.strokeStyle = 'rgba(29,27,25,.09)'; g.lineWidth = 1.2;
  for (let k = 0; k < 40; k++) {
    const gx = R() * W, gy = -R() * F.SP * 7 + F.SP, len = 14 + R() * 30, y = sy(gy);
    if (y < -40 || y > H + 40) continue;
    g.beginPath(); g.moveTo(gx, y); g.quadraticCurveTo(gx + 3, y - len / 2, gx, y - len); g.stroke();
  }
  g.strokeStyle = 'rgba(29,27,25,.3)'; g.lineWidth = 2;
  for (const ex of [W * .035, W * .965]) {
    g.beginPath(); for (let y = -10; y <= H + 10; y += 12) { const x = ex + Math.sin((y + T.camY) / 37) * 3; y < 0 ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke();
  }
  const toS = pts => pts.map(([x, y]) => [x, sy(y)]);
  g.lineCap = 'round'; g.lineJoin = 'round';
  // away stubs (left): short sideways paths that curl back on themselves
  for (let i = 0; i <= Math.min(T.fork, 5); i++) {
    const P = stubP(F, W, i), a = i < T.fork ? .35 : 1, [ex, ey] = P[3];
    g.globalAlpha = a; g.strokeStyle = GREY; g.lineWidth = 2.5; g.setLineDash([2, 7]);
    polyline(g, toS(sample(cpt, P, 0, 1, 16))); g.setLineDash([]);
    g.lineWidth = 1.6; g.beginPath();
    for (let k = 0; k <= 30; k++) { const an = k / 30 * Math.PI * 3.2, r = 3 + k * .32; const x = ex - 6 + Math.cos(an) * r, y = sy(ey) + Math.sin(an) * r * .7; k ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke(); g.globalAlpha = 1;
    if (i === T.fork) label(g, TEXT.awayLabel, ex - 6, sy(ey) - 20, SOFT, 'center', 13);
  }
  // the climbing path (toward): dotted ahead, coloured where you have walked
  for (let i = 0; i < 6; i++) {
    const P = arcP(F, W, i), col = FORK_COLORS[i];
    const walked = i < T.done ? 1 : (T.walk.kind === 'arc' && T.walk.i === i ? T.walk.u : 0);
    if (walked < 1) { g.strokeStyle = 'rgba(29,27,25,.5)'; g.lineWidth = 2.5; g.setLineDash([2, 7]); polyline(g, toS(sample(cpt, P, walked, 1, 20))); g.setLineDash([]); }
    if (walked > 0) { g.strokeStyle = col; g.lineWidth = 6; polyline(g, toS(sample(cpt, P, 0, walked, 20))); }
    if (i === T.fork && T.walk.kind !== 'arc') { const [lx, ly] = cpt(P, .42); label(g, TEXT.towardLabel, lx + 8, sy(ly), INK, 'left', 13); }
  }
  // fork nodes and blossoms
  for (let i = 0; i <= 6; i++) {
    const y = sy(-i * F.SP); if (y < -60 || y > H + 60) continue;
    if (i === 6) {
      g.globalAlpha = .25; for (let j = 0; j < T.done; j++) { g.fillStyle = FORK_COLORS[j]; g.beginPath(); g.arc(F.cx + Math.cos(j) * 22, y - 34 + Math.sin(j * 2) * 12, 16, 0, 7); g.fill(); }
      g.globalAlpha = 1; drawEnso(g, F.cx, y - 32, 34, INK, 4, 5);
      continue;
    }
    if (i > 0 && i <= T.done) blossom(g, F.cx, y, 9, FORK_COLORS[i - 1], 1);
    else { g.fillStyle = PAPER2; g.strokeStyle = INK; g.lineWidth = 1.6; g.beginPath(); g.arc(F.cx, y, 5, 0, 7); g.fill(); g.stroke(); }
  }
  // hooks written on the path: the current one clear, earlier ones fading behind you
  g.font = `italic 15px ${SERIF}`;
  for (let i = 0; i <= Math.min(T.fork, 5); i++) {
    const text = TEXT.forks[FORKS[i].pillar].hook, past = i < T.done, a = past ? .3 : T.hookA;
    if (a <= 0) continue;
    const maxW = W * .48, lines = wrapText(g, text, maxW - 16), lh = 19;
    const bw = Math.min(maxW, Math.max(...lines.map(l => g.measureText(l).width)) + 18), bh = lines.length * lh + 12;
    const bx = F.cx - W * .1 - bw / 2, by = sy(-i * F.SP - F.SP * .52) - bh / 2;
    if (by > H + 20 || by + bh < -20) continue;
    g.globalAlpha = a; g.fillStyle = PAPER2; rrect(g, bx, by, bw, bh, 8); g.fill();
    g.strokeStyle = INK; g.lineWidth = 1.4; g.stroke();
    g.fillStyle = INK; g.textAlign = 'center';
    lines.forEach((l, k) => g.fillText(l, bx + bw / 2, by + 6 + lh * (k + .78)));
    g.globalAlpha = 1;
    if (!past) hookGlyph(g, bx + 24, by - 9, a);
  }
  // the walker
  const w = T.walk;
  drawCharacter(g, T.char, wx, sy(wy) + 3, w.dir, w.moving ? t * 9 : 0, 1.15);
  drawMini(g, W - 64, 8, 56, 66, T);
}

function makeCanvas(cv, T) {
  const g = cv.getContext('2d'), dpr = Math.min(2, devicePixelRatio || 1), t0 = now();
  let W = 0, H = 0, raf;
  const tick = () => {
    if (!cv.isConnected) return;                        // the panel was closed or cleared
    const r = cv.getBoundingClientRect();
    if (r.width !== W || r.height !== H) { W = r.width; H = r.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const t = (now() - t0) / 1000;
    if (W > 0 && H > 0) (T.mode === 'forks' ? drawForkView : drawTreeView)(g, W, H, t, T);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

// ---------- the screen: title, tree canvas, message, body, sticky bottom bar ----------
function makeView(p) {
  p.innerHTML = '';
  p.classList.add('finale');
  const cv = h('canvas', { class: 'ftree big', role: 'img', 'aria-label': TEXT.canvasLabel });
  const msg = h('div', { class: 'fmsg', 'aria-live': 'polite' }), body = h('div', { class: 'fbody' });
  const hint = h('p', { class: 'fhint', 'aria-live': 'polite' }), row = h('div', { class: 'frow' });
  p.append(h('h2', { class: 'title' }, TEXT.title), cv, msg, body, h('div', { class: 'fbar' }, hint, row));
  return {
    p, cv, body, hint, row,
    // size: 'pin' (small, stays in view while the chips scroll), 'mid' or 'big'
    reset(size) { p.classList.toggle('fpin', size === 'pin'); cv.classList.toggle('big', size === 'big'); msg.replaceChildren(); body.replaceChildren(); row.replaceChildren(); this.setHint(null); p.scrollTop = 0; },
    msg(...parts) { msg.replaceChildren(...parts.flat().filter(Boolean).map(x => typeof x === 'string' ? h('p', {}, x) : x)); },
    setHint(text) { hint.hidden = text == null; hint.textContent = text || ''; },
    nudge() { hint.classList.remove('nudge'); void hint.offsetWidth; hint.classList.add('nudge'); audio.soft(); },
    // One or more buttons in the bar; resolves with the index tapped.
    buttons(list) {
      return new Promise(res => row.replaceChildren(...list.map(([text, cls], i) => btn(text, cls, () => { audio.soft(); res(i); }))));
    },
    // Stacked choices in the bar; the tapped one stays marked, the rest disable.
    options(labels, awayIdx) {
      return new Promise(res => {
        const bs = labels.map((text, i) => btn(text, '', (e, b) => {
          bs.forEach(x => { x.disabled = true; }); b.classList.add('picked'); if (i === awayIdx) b.classList.add('away');
          res(i);
        }));
        row.replaceChildren(h('div', { class: 'fopts' }, bs));
      });
    },
  };
}
const tag = pillar => h('p', { class: 'ftag', style: `--c:${PILLARS[pillar].color}` }, PILLARS[pillar].name);
const speak = lines => say(lines.map(l => `${TEXT.tree}: ${l}`));

// ---------- steps ----------
function situationStep(V, F) {
  V.reset('mid');
  V.msg(TEXT.situationPrompt);
  const ta = h('textarea', { rows: '3', maxlength: '300', placeholder: TEXT.situationPlaceholder, 'aria-label': TEXT.situationPrompt });
  ta.value = F.situation;
  V.body.append(ta, h('p', { class: 'fnote' }, TEXT.situationNote));
  return V.buttons([[TEXT.skip, 'quiet'], [TEXT.continue, 'primary']]).then(i => { F.situation = i ? ta.value.trim() : ''; return 'next'; });
}

// Choose-and-write step for away (side -1) or toward (side 1) moves.
function pickStep(V, T, st, side, S) {
  V.reset('pin');
  V.msg(side < 0 ? TEXT.awayPrompt : TEXT.towardPrompt);
  const key = text => (side < 0 ? 'a:' : 't:') + text.toLowerCase();
  if (side > 0 && S.values && S.values.length) V.body.append(h('p', { class: 'fnote' }, fmt(TEXT.lanterns, { values: S.values.join(TEXT.listSep) })));
  const chips = h('div', { class: 'chips fchips' });
  let go;
  let input;
  const counts = () => {                                 // a typed-but-not-yet-added move counts too
    const own = st.own.filter(o => o.on).length + (input && input.value.trim() ? 1 : 0), pre = st.presets.filter(p => st.sel.has(p)).length;
    return { own, pre: pre + Math.max(0, own - 1) };     // extra written moves count toward the three
  };
  const update = () => {
    const c = counts(), needC = Math.max(0, 3 - c.pre), needO = c.own ? 0 : 1, parts = [];
    if (needC) parts.push(needC === 1 ? TEXT.needChooseOne : fmt(TEXT.needChooseMany, { n: needC }));
    if (needO) parts.push(TEXT.needOwn);
    V.setHint(parts.length ? parts.join(TEXT.listSep) : TEXT.ready);
    go.classList.toggle('off', parts.length > 0);
    go.setAttribute('aria-disabled', parts.length ? 'true' : 'false');
  };
  const chip = (text, isOn, cls, toggle) => {
    const c = btn(text, 'chip ' + cls + (isOn ? ' on' : ''), () => {
      const on = toggle();
      c.classList.toggle('on', on); c.setAttribute('aria-pressed', on);
      if (on) { addLeaf(T, side, key(text)); audio.soft(); } else dropLeaf(T, key(text));
      update();
    }, false);
    c.setAttribute('aria-pressed', isOn);
    return c;
  };
  for (const p of st.presets) chips.append(chip(p, st.sel.has(p), st.lan && st.lan.has(p) ? 'lan' : '', () => { st.sel.has(p) ? st.sel.delete(p) : st.sel.add(p); return st.sel.has(p); }));
  const ownChip = o => chip(o.text, o.on, 'ownchip', () => (o.on = !o.on));
  for (const o of st.own) chips.append(ownChip(o));
  input = h('input', { type: 'text', maxlength: '60', autocomplete: 'off', enterkeyhint: 'done', placeholder: side < 0 ? TEXT.awayPlaceholder : TEXT.towardPlaceholder, 'aria-label': side < 0 ? TEXT.awayPlaceholder : TEXT.towardPlaceholder });
  const add = () => {
    const text = input.value.trim().replace(/\s+/g, ' ');
    if (!text) { input.focus(); return false; }
    input.value = '';
    const same = [...chips.children].find(c => c.textContent.toLowerCase() === text.toLowerCase());
    if (same) { if (!same.classList.contains('on')) same.click(); update(); return true; }
    const o = { text, on: true }; st.own.push(o);
    chips.append(ownChip(o)); addLeaf(T, side, key(text)); audio.soft(); update();
    return true;
  };
  const form = h('form', { class: 'fown', onsubmit: e => { e.preventDefault(); if (add()) input.blur(); } }, input, h('button', { type: 'submit' }, TEXT.add));
  input.addEventListener('input', () => update());
  V.body.append(chips, form);
  return new Promise(res => {
    go = btn(TEXT.continue, 'primary', () => {
      if (input.value.trim()) add();
      const c = counts();
      if (c.pre < 3 || !c.own) { V.nudge(); return; }
      audio.soft(); res('next');
    }, false, 300);
    const back = btn(TEXT.back, 'quiet', () => res('back'));
    V.row.replaceChildren(back, go);
    update();
  });
}

async function forksStep(V, T, F, awayPool) {
  V.reset('mid');
  Object.assign(T, { mode: 'forks', fork: 0, done: 0, hookA: 0, camY: null, walk: { kind: 'fork', i: 0, u: 0, dir: 1, moving: false } });
  V.msg(TEXT.forksIntro);
  await V.buttons([[TEXT.startClimb, 'primary']]);
  let ap = 0;
  const nextAway = () => awayPool[ap++ % awayPool.length];
  for (let i = 0; i < 6; i++) {
    const def = FORKS[i], tx = TEXT.forks[def.pillar], best = skillOf(def.pillar), other = skillOf(def.other);
    const rec = { pillar: def.pillar, skill: null, fit: null, awayTried: [] };
    T.fork = i; T.hookA = 0; tween(600, k => { T.hookA = k; });
    V.msg(fmt(TEXT.forkPrompt, { n: i + 1, total: 6 }));
    const opts = shuffle([{ kind: 'best', move: best }, { kind: 'other', move: other }, { kind: 'away', text: nextAway() }]);
    for (;;) {
      const awayIdx = opts.findIndex(o => o.kind === 'away');
      const k = await V.options(opts.map(o => o.kind === 'away' ? o.text : MOVES[o.move].name), awayIdx);
      const o = opts[k];
      if (o.kind === 'away') {
        V.msg(fmt(rec.awayTried.length ? TEXT.awayAgain : TEXT.awayLine, { move: o.text }));
        rec.awayTried.push(o.text);
        await walkAway(T, i);
        if (awayPool.length > 1) o.text = nextAway();
        continue;
      }
      rec.skill = o.move; rec.fit = o.kind;
      V.msg(tag(def.pillar), o.kind === 'best' ? tx.best : fmt(tx.other, { best: MOVES[best].name }));
      audio.bell([392, 440, 494, 587, 659, 784][i], .07);
      await walkArc(T, i);
      break;
    }
    F.forks.push(rec);
    await V.buttons([[i < 5 ? TEXT.keepClimbing : TEXT.continue, 'primary']]);
  }
  // back out to the whole tree; the colours spread along the toward branch
  V.reset('big');
  T.mode = 'tree'; T.progress = 0;
  V.msg(TEXT.forksDone);
  audio.chime();
  await tween(2600, k => { T.progress = 6 * k; });
  await V.buttons([[TEXT.continue, 'primary']]);
}
async function walkArc(T, i) {
  T.walk = { kind: 'arc', i, u: 0, dir: 1, moving: true };
  await tween(1500, k => { T.walk.u = ease(k); T.walk.dir = T.walk.u < .5 ? 1 : -1; });   // the arc bends right, then back
  T.done = i + 1; T.fork = Math.min(5, i + 1);
  T.walk = { kind: 'fork', i: i + 1, u: 0, dir: 1, moving: false };
  if (i < 5) T.hookA = 0;
}
async function walkAway(T, i) {
  T.walk = { kind: 'stub', i, u: 0, dir: -1, moving: true, spin: 0 };
  await tween(900, k => { T.walk.u = ease(k); });
  await tween(800, k => { T.walk.spin = k; });               // round in a little circle
  T.walk.spin = 0; T.walk.dir = 1;
  await tween(800, k => { T.walk.u = 1 - ease(k); });
  T.walk = { kind: 'fork', i, u: 0, dir: 1, moving: false };
  await wait(REDUCED ? 0 : 150);
}

function commitStep(V, T, F) {
  V.reset('pin');
  T.mode = 'tree'; T.progress = 6;
  V.msg(F.situation ? TEXT.commitPromptSituation : TEXT.commitPrompt);
  const chips = h('div', { class: 'chips fchips' });
  let chosen = F.commitment || null;
  return new Promise(res => {
    const go = btn(TEXT.commitBtn, 'primary', () => {
      if (!chosen) { V.nudge(); return; }
      audio.soft(); res(chosen);
    }, false, 300);
    const update = () => { V.setHint(chosen ? TEXT.ready : TEXT.commitNeed); go.classList.toggle('off', !chosen); go.setAttribute('aria-disabled', chosen ? 'false' : 'true'); };
    const all = [...F.toward];
    for (const text of all) {
      const c = btn(text, 'chip' + (F.written.toward.includes(text) ? ' ownchip' : '') + (text === chosen ? ' on' : ''), () => {
        chosen = text;
        for (const x of chips.children) { const on = x === c; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); }
        T.highlight = 't:' + text.toLowerCase(); audio.soft(); update();
      }, false);
      c.setAttribute('aria-pressed', text === chosen);
      chips.append(c);
    }
    V.body.append(chips);
    V.row.replaceChildren(go);
    update();
  });
}

async function closingStep(V, T, F) {
  V.reset('big');
  T.highlight = 't:' + F.commitment.toLowerCase();
  audio.chime();
  tween(3000, k => { T.final = ease(k); });
  await wait(REDUCED ? 100 : 900);
  await speak(TEXT.closing.map(l => fmt(l, { move: F.commitment })));
  V.msg(fmt(TEXT.closingNote, { move: F.commitment }));
  await V.buttons([[TEXT.finish, 'primary']]);
}

// ---------- entry point ----------
export async function finale(panelEl, S) {
  const V = makeView(panelEl), T = treeState(S);
  const stopCanvas = makeCanvas(V.cv, T);
  const F = { situation: '', away: [], toward: [], written: { away: [], toward: [] }, forks: [], commitment: '' };
  const valueIdeas = [...new Set((S.values || []).map(v => TEXT.valueToward[v]).filter(Boolean))];
  const away = { presets: TEXT.awayMoves.slice(), sel: new Set(), own: [] };
  const toward = { presets: [...valueIdeas, ...TEXT.towardMoves.filter(m => !valueIdeas.includes(m))], lan: new Set(valueIdeas), sel: new Set(), own: [] };
  try {
    await speak(TEXT.arrival);
    const steps = [() => situationStep(V, F), () => pickStep(V, T, away, -1, S), () => pickStep(V, T, toward, 1, S)];
    for (let i = 0; i < steps.length;) i = Math.max(0, i + ((await steps[i]()) === 'back' ? -1 : 1));
    const picked = st => ({ pre: st.presets.filter(p => st.sel.has(p)), own: st.own.filter(o => o.on).map(o => o.text) });
    const a = picked(away), tw = picked(toward);
    F.away = [...a.pre, ...a.own]; F.written.away = a.own;
    F.toward = [...tw.pre, ...tw.own]; F.written.toward = tw.own;
    await forksStep(V, T, F, [...a.own, ...a.pre]);    // their own words come up first
    F.commitment = await commitStep(V, T, F);
    await closingStep(V, T, F);
    S.finale = F;
  } finally {
    stopCanvas();
  }
  return F;
}
