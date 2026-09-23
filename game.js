// Main loop: world rendering with the ink→colour reveal, movement,
// interactions, encounters, journal and saving.

import * as W from './world.js';
import { TILE, SIZE, T } from './world.js';
import * as C from './content.js';
import * as ui from './ui.js';
import { h } from './ui.js';
import * as audio from './audio.js';
import { drawCharacter, drawGuardian, drawCreature } from './art.js';
import { EXERCISES } from './exercises.js';
import * as FIN from './finale.js';
const FT = FIN.TEXT;

const SAVE_KEY = 'fadedisle.v1', MASK_KEY = 'fadedisle.mask';
const MS = 8;                       // reveal mask is 1/8 of world resolution
const SPEED = 120;                  // world px per second
const $ = s => document.querySelector(s);

// ---------- state & saving ----------
const fresh = () => ({ char: null, pos: null, done: {}, spirits: {}, verses: {}, values: [], valueNote: '', steps: [], ended: false, tip: false });
let S = fresh();
try { S = Object.assign(fresh(), JSON.parse(localStorage.getItem(SAVE_KEY)) || {}); } catch (e) {}
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) {} }
let maskDirty = false;
function saveMask() { if (!maskDirty) return; maskDirty = false; try { localStorage.setItem(MASK_KEY, mask.toDataURL()); } catch (e) {} }

// ---------- canvases ----------
const cv = $('#game'), ctx = cv.getContext('2d');
const tmp = document.createElement('canvas'), tctx = tmp.getContext('2d');
const mask = document.createElement('canvas'); mask.width = mask.height = SIZE / MS;
const mctx = mask.getContext('2d');
let map, colorLayer, inkLayer;
let dpr = 1, vw = 0, vh = 0, zoom = 1;

function resize() {
  vw = innerWidth; vh = innerHeight; dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = tmp.width = Math.round(vw * dpr); cv.height = tmp.height = Math.round(vh * dpr);
  zoom = Math.max(1, Math.min(2.2, Math.min(vw, vh) / (11 * TILE)));
}
addEventListener('resize', resize); resize();
document.addEventListener('gesturestart', e => e.preventDefault());   // no pinch-zoom on iOS

// Soft, slightly irregular brush for painting colour into the mask.
const stamp = document.createElement('canvas'); stamp.width = stamp.height = 64;
{ const s = stamp.getContext('2d');
  for (let i = 0; i < 7; i++) {
    const x = 32 + Math.cos(i * 2.4) * 6, y = 32 + Math.sin(i * 2.4) * 6;
    const g = s.createRadialGradient(x, y, 2, x, y, 26);
    g.addColorStop(0, 'rgba(255,255,255,.5)'); g.addColorStop(.6, 'rgba(255,255,255,.3)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    s.fillStyle = g; s.fillRect(0, 0, 64, 64);
  } }
function paint(x, y, r, a) {
  mctx.globalAlpha = Math.min(1, a);
  mctx.drawImage(stamp, (x - r) / MS, (y - r) / MS, 2 * r / MS, 2 * r / MS);
  maskDirty = true;
}

// ---------- world objects ----------
const player = { x: W.START.x, y: W.START.y, dir: 1, phase: 0, moving: false };
const cam = { x: SIZE / 2, y: SIZE / 2 };
const center = k => ({ x: W.SHRINES[k].x * TILE + 16, y: W.SHRINES[k].y * TILE + 16 });
const interactables = [
  { ...center('values'), label: FT.plantAct, r: 230, when: () => procession && S.finaleGathered && !ceremony, run: () => plantLantern() },
  ...C.PILLAR_ORDER.map(k => ({ ...center(k), label: 'Meet', r: 64, run: () => meetGuardian(k) })),
  ...W.VERSE_STONES.map((v, i) => ({ x: v.x * TILE + 16, y: v.y * TILE + 16, label: 'Read', r: 56, run: () => readVerse(i) })),
  { x: W.SIGNPOST.x * TILE + 16, y: W.SIGNPOST.y * TILE + 16, label: 'Read', r: 56, run: () => ui.say(C.SIGN) },
  { x: 40 * TILE, y: 40 * TILE, label: 'Touch', r: 90, run: () => greatTree() },
];
let near = null;
const blooms = [];               // expanding colour animations
const particles = [];

// ---------- input ----------
const keys = new Set();
addEventListener('keydown', e => {
  keys.add(e.key.toLowerCase());
  if ((e.key === ' ' || e.key === 'Enter') && near && !ui.busy && mode === 'play') { e.preventDefault(); interact(); }
});
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
let joy = null;
cv.addEventListener('pointerdown', e => {
  if (mode !== 'play' || ui.busy) return;
  joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
  cv.setPointerCapture(e.pointerId);
});
cv.addEventListener('pointermove', e => { if (joy && e.pointerId === joy.id) { joy.x = e.clientX; joy.y = e.clientY; } });
const endJoy = e => { if (joy && e.pointerId === joy.id) joy = null; };
cv.addEventListener('pointerup', endJoy); cv.addEventListener('pointercancel', endJoy);

function inputVector() {
  let x = 0, y = 0;
  if (keys.has('arrowleft') || keys.has('a')) x--;
  if (keys.has('arrowright') || keys.has('d')) x++;
  if (keys.has('arrowup') || keys.has('w')) y--;
  if (keys.has('arrowdown') || keys.has('s')) y++;
  if (joy) { x = (joy.x - joy.ox) / 44; y = (joy.y - joy.oy) / 44; }
  const m = Math.hypot(x, y);
  return m > 1 ? { x: x / m, y: y / m } : m < 0.15 ? { x: 0, y: 0 } : { x, y };
}

// ---------- update ----------
let mode = 'title', grassWalk = 0, nextEnc = 300, lastRegion = null, saveT = 0, seaT = 0;
const canStand = (x, y) => [[-7, -3], [7, -3], [-7, 4], [7, 4]].every(([dx, dy]) => W.walkable(map, x + dx, y + dy));

function update(dt, t) {
  for (let i = blooms.length - 1; i >= 0; i--) {
    const b = blooms[i]; b.t += dt;
    const k = Math.min(1, b.t / b.dur);
    for (let a = 0; a < 6; a++) {
      const ang = a / 6 * Math.PI * 2 + b.t * 3;
      paint(b.x + Math.cos(ang) * b.R * k * .6, b.y + Math.sin(ang) * b.R * k * .6, 40 + b.R * k * .5, .25);
    }
    if (k >= 1) { blooms.splice(i, 1); b.done && b.done(); }
  }
  updateParticles(dt, t);
  updateProcession(dt);
  player.moving = false;
  if (mode !== 'play' || ui.busy || ceremony) { joy = null; return; }

  const v = inputVector();
  if (v.x || v.y) {
    const nx = player.x + v.x * SPEED * dt, ny = player.y + v.y * SPEED * dt;
    const ox = player.x, oy = player.y;
    if (canStand(nx, player.y)) player.x = nx;
    if (canStand(player.x, ny)) player.y = ny;
    const moved = Math.hypot(player.x - ox, player.y - oy);
    if (moved > 0) {
      player.moving = true; player.phase += dt * 10;
      if (Math.abs(v.x) > 0.1) player.dir = Math.sign(v.x);
      if (W.tileAt(map, player.x, player.y) === T.TALL) {
        grassWalk += moved;
        if (grassWalk > nextEnc && !procession) { grassWalk = 0; nextEnc = 260 + Math.random() * 380; encounter(); }
      }
    }
  }
  // colour follows your feet; lingering deepens it
  paint(player.x, player.y - 8, 80, dt * 2.5);
  paint(player.x, player.y - 8, 150, dt * 0.5);

  if (procession && !S.finaleGathered && !gathering && Math.hypot(player.x - summit().x, player.y - summit().y) < 190) gatherAtSummit();
  near = interactables.find(o => (!o.when || o.when()) && Math.hypot(o.x - player.x, o.y - player.y) < o.r) || null;
  setAct(near && near.label);

  const region = W.regionAt(player.x, player.y);
  if (region !== lastRegion) { lastRegion = region; if (region) ui.toast(C.PILLARS[region].region); }

  if ((seaT += dt) > 0.5) {
    seaT = 0; let wet = 0;
    for (let a = 0; a < 8; a++) { const tt = W.tileAt(map, player.x + Math.cos(a * .785) * 120, player.y + Math.sin(a * .785) * 120); if (tt === T.SEA || tt === T.WATER) wet++; }
    audio.setSea(wet / 8);
  }
  if ((saveT += dt) > 5) { saveT = 0; S.pos = { x: player.x, y: player.y }; save(); saveMask(); }
}

const PETALS = { present: '#9cc27a', defusion: '#d9823b', acceptance: '#f4f1ea', selfctx: '#b9b0e0', values: '#ffd97a', action: '#e9868a' };
function updateParticles(dt, t) {
  const region = W.regionAt(player.x, player.y);
  if (particles.length < 22 && Math.random() < dt * 6) {
    const sw = vw / zoom, sh = vh / zoom;
    particles.push({ x: cam.x + (Math.random() - .5) * sw, y: cam.y - sh / 2 - 10 + Math.random() * sh * .5, vx: 8 + Math.random() * 10, vy: 10 + Math.random() * 10,
                     r: Math.random() * 6, c: PETALS[region] || '#f0b7c3', life: 6 + Math.random() * 4, glow: region === 'values' });
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.life -= dt;
    p.x += (p.vx + Math.sin(t + p.r) * 12) * dt; p.y += p.vy * dt; p.r += dt * 2;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

// ---------- render ----------
function render(t, dt) {
  const z = Math.max(zoom * zoomK, vw / SIZE, vh / SIZE), sw = vw / z, sh = vh / z;
  if (mode === 'play') {
    cam.x += (player.x - cam.x) * Math.min(1, dt * 5);
    cam.y += (player.y - 20 - cam.y) * Math.min(1, dt * 5);
  } else { cam.x = SIZE / 2 + Math.sin(t * .05) * 500; cam.y = SIZE / 2 + Math.cos(t * .04) * 400; }
  const sx = Math.max(0, Math.min(SIZE - sw, cam.x - sw / 2)), sy = Math.max(0, Math.min(SIZE - sh, cam.y - sh / 2));

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (!inkLayer) { ctx.fillStyle = '#efe7d6'; ctx.fillRect(0, 0, cv.width, cv.height); return; }
  ctx.drawImage(inkLayer, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
  tctx.globalCompositeOperation = 'copy';
  tctx.drawImage(mask, sx / MS, sy / MS, sw / MS, sh / MS, 0, 0, tmp.width, tmp.height);
  tctx.globalCompositeOperation = 'source-in';
  tctx.drawImage(colorLayer, sx, sy, sw, sh, 0, 0, tmp.width, tmp.height);
  ctx.drawImage(tmp, 0, 0);

  const k = dpr * z;
  ctx.setTransform(k, 0, 0, k, -sx * k, -sy * k);
  const visible = o => o.x > sx - 60 && o.x < sx + sw + 60 && o.y > sy - 60 && o.y < sy + sh + 100;
  const sprites = C.PILLAR_ORDER.map(p => ({ p, ...guardPos(p) })).filter(visible)
    .map(({ p, x, y }) => ({ y, draw: () => {
      if (speaking === p) { ctx.fillStyle = 'rgba(255, 214, 120, .45)'; ctx.beginPath(); ctx.ellipse(x, y - 2, 30 + Math.sin(t * 4) * 3, 10, 0, 0, 7); ctx.fill(); }
      drawGuardian(ctx, p, x, y - 4, t, !!S.done[p], C.PILLARS[p].color);
    } }));
  if (procession) for (const f of followers) sprites.push({ y: f.y, draw: () => drawCreature(ctx, f.cr, f.x, f.y, .6, t, 1) });
  if (mode === 'play') sprites.push({ y: player.y, draw: () => drawCharacter(ctx, S.char, player.x, player.y, player.dir, player.phase) });
  sprites.sort((a, b) => a.y - b.y).forEach(s => s.draw());
  if (near && !ui.busy) {                                         // a small ink mark over what you can interact with
    ctx.fillStyle = '#1d1b19'; ctx.globalAlpha = .6 + Math.sin(t * 4) * .3;
    ctx.beginPath(); ctx.arc(near.x, near.y - 58 + Math.sin(t * 3) * 3, 3.5, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
  }
  for (const p of particles) {
    ctx.globalAlpha = Math.min(1, p.life / 2) * (p.glow ? .9 : .75);
    ctx.fillStyle = p.c;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, p.glow ? 2 : 3.5, p.glow ? 2 : 2, p.r, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  drawDusk(t, sx, sy, k);

  if (joy) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const v = inputVector();
    ctx.strokeStyle = 'rgba(29,27,25,.45)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(joy.ox, joy.oy, 44, 0, 7); ctx.stroke();
    ctx.fillStyle = 'rgba(29,27,25,.35)';
    ctx.beginPath(); ctx.arc(joy.ox + v.x * 44, joy.oy + v.y * 44, 20, 0, 7); ctx.fill();
  }
}

let last = performance.now();
const panelEl = $('#panel');
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const t = now / 1000;
  if (map) update(dt, t);
  // Skip drawing the world while an opaque panel covers it (only the title screen is see-through),
  // so the main thread stays free to answer taps.
  if (panelEl.hidden || panelEl.classList.contains('titlescreen')) render(t, dt);
  requestAnimationFrame(frame);
}

// ---------- interactions ----------
const actBtn = $('#act'); let actLabel = null;
function setAct(label) {                 // touch the DOM only when the label changes, not every frame
  if (label === actLabel) return;
  actLabel = label; actBtn.hidden = !label; if (label) actBtn.textContent = label;
}
let acting = false;
async function interact() {
  if (!near || acting || ui.busy) return;
  acting = true; setAct(null);
  try { await near.run(); } finally { acting = false; save(); }
}
actBtn.addEventListener('click', interact);

function bloom(x, y, R, dur, done) { blooms.push({ x, y, R, dur, t: 0, done }); }
const doneCount = () => C.PILLAR_ORDER.filter(k => S.done[k]).length;

let meeting = false;
async function meetGuardian(k) {
  if (meeting) return;
  meeting = true;
  try { await meet(k); } finally { meeting = false; }
}
async function meet(k) {
  const P = C.PILLARS[k], short = P.guardian.split(',')[0], again = !!S.done[k];
  if (again) {
    const i = await ui.choose(`${short}: "Welcome back, friend."`, ['Practice again', 'Hear their verse', 'Goodbye']);
    if (i === 1) return ui.say([`${P.rumi.replace('\n', ' ')}  (${P.rumiSource})`]);
    if (i === 2) return;
  } else await ui.say(P.greet);
  const p = ui.openPanel('exercise');
  await EXERCISES[k](p, S);
  p.innerHTML = '';
  audio.chime();
  await ui.card(p, P.name, [
    h('p', { class: 'region' }, `${P.region} · ${P.guardian}`),
    h('p', {}, P.plain),
    ui.learnMore(P.more),
    ui.verse(P.rumi, P.rumiSource),
    again ? null : h('p', { class: 'learned' }, `You learned a new way to meet the wild spirits: “${C.MOVES[P.move].name}”.`),
  ], ['Continue']);
  ui.closePanel();
  if (again) { save(); return; }
  S.done[k] = true; save(); updateHud();
  const c = center(k);
  bloom(c.x, c.y, 11 * TILE, 3);
  if (doneCount() === 6) await ui.say(['A deep hum rises from the heart of the island.', 'The Great Tree is stirring. Return to the centre.']);
}

async function readVerse(i) {
  const v = C.VERSES[i];
  await ui.say([v.text.replace(/\n/g, ' '), `(${v.source})`]);
  if (!S.verses[i]) { S.verses[i] = true; ui.toast('A verse was added to your journal'); }
}

// ---------- the Great Tree: the Choice Point, then the procession to the summit ----------
async function runChoicePoint() {
  const p = ui.openPanel('finale');
  try { await FIN.finale(p, S); } finally { ui.closePanel(); save(); }
}

async function greatTree() {
  const tree = l => `${FT.tree}: ${l}`;
  if (S.finaleStage === 'procession') return ui.say(FT.treeProcession.map(tree));
  if (S.ended) {
    if (await ui.choose(FT.treeEnded, [FT.walkAgain, FT.goodbye]) === 0) { await runChoicePoint(); ui.toast(FT.againSaved); }
    return;
  }
  if (doneCount() < 6) return ui.say([...C.TREE.asleep, FIN.fmt(FT.treeCount, { n: doneCount() })]);
  await ui.say([...C.TREE.ending.slice(0, 2), FT.treeWakes]);
  await runChoicePoint();
  if (!S.finale) return;                                   // closed early somehow: the tree simply waits
  S.finaleStage = 'procession'; S.finaleGathered = false; save();
  bloom(40 * TILE, 40 * TILE, 7 * TILE, 3);
  startProcession(false);
  await ui.say([followers.length ? FT.processionStart : FT.processionStartAlone, tree(FT.processionTree)]);
  ui.toast(FT.summitToast, 4000);
}

// Dusk falls, befriended spirits follow in a line, the guardians gather at the Lantern Summit,
// the player plants a lantern with their weekly toward move and the island floods with colour.
// S.finaleStage === 'procession' is saved, so a reload resumes the walk.
let procession = false, ceremony = false, gathering = false, speaking = null, lanternT = null;
let dusk = 0, duskTarget = 0, zoomK = 1, zoomTarget = 1, followers = [];
const trail = [], gathered = new Set();
const summit = () => center('values');
const GATHER = { present: [-125, 22], defusion: [-82, 74], acceptance: [82, 74], selfctx: [125, 22], action: [0, -64] };
function guardPos(k) {
  if (!gathered.has(k)) return center(k);
  const s = summit(), [dx, dy] = GATHER[k];
  return { x: s.x + dx, y: s.y + dy };
}
function startProcession(resume) {
  procession = true; duskTarget = 1; if (resume) dusk = 1;
  trail.length = 0; gathered.clear();
  if (S.finaleGathered) Object.keys(GATHER).forEach(k => gathered.add(k));
  followers = C.CREATURES.filter(c => S.spirits[c.id]).map((cr, i, all) => {
    const f = { cr, x: player.x + (i - (all.length - 1) / 2) * 24, y: player.y + 24 + (i % 2) * 8 };   // a little row behind you
    if (!resume) paint(f.x, f.y, 50, .5);
    return f;
  });
}
function stopProcession() { procession = false; followers = []; gathered.clear(); trail.length = 0; }
function updateProcession(dt) {
  dusk += (duskTarget - dusk) * Math.min(1, dt * .35);
  zoomK += (zoomTarget - zoomK) * Math.min(1, dt * 1.2);
  if (!procession || !followers.length) return;
  const head = trail[0];
  if (!head || Math.hypot(player.x - head.x, player.y - head.y) > 5) { trail.unshift({ x: player.x, y: player.y }); if (trail.length > 200) trail.pop(); }
  followers.forEach((f, i) => {              // each walks where the one ahead of it walked a moment ago
    const n = 6 * (i + 1); if (n >= trail.length) return;
    const p = trail[n], off = (i % 2 ? 1 : -1) * 5, e = Math.min(1, dt * 4);
    f.x += (p.x + off - f.x) * e; f.y += (p.y + 4 - f.y) * e;
  });
}

async function gatherAtSummit() {
  gathering = true; setAct(null);
  try {
    await ui.say([FT.gatherIntro]);
    let i = 0;
    for (const k of ['present', 'defusion', 'acceptance', 'selfctx', 'action', 'values']) {
      if (k !== 'values') { gathered.add(k); const g = guardPos(k); paint(g.x, g.y, 70, .9); }
      audio.bell([392, 440, 494, 523, 587, 659][i++], .06);
      speaking = k;
      await ui.say([`${C.PILLARS[k].guardian.split(',')[0]}: ${FT.guardianLines[k]}`]);
    }
    S.finaleGathered = true; save();
    ui.toast(FT.plantHint, 4000);
  } finally { gathering = false; speaking = null; }
}

async function plantLantern() {
  if (!procession || ceremony) return;
  ceremony = true; setAct(null);
  try {
    const s = summit(), move = (S.finale && S.finale.commitment) || '';
    S.lantern = { x: Math.round((player.x + s.x) / 2), y: Math.round((player.y + s.y) / 2 + 12), text: move };
    lanternT = performance.now(); save();
    audio.chime();
    await ui.say([move ? FIN.fmt(FT.plantLine, { move }) : FT.plantLineNoMove, FT.plantGlow]);
    zoomTarget = .5;                                           // pull back to watch the whole island fill with colour
    [262, 330, 392, 523, 659, 784].forEach((f, i) => audio.bell(f, .07, .4 + i * .35));
    await new Promise(res => bloom(s.x, s.y, SIZE, 6, res));
    mctx.globalAlpha = 1; mctx.fillStyle = '#fff'; mctx.fillRect(0, 0, mask.width, mask.height); maskDirty = true;
    S.ended = true; S.finaleStage = 'done'; save(); saveMask();
    audio.chime();
    await ui.say(C.TREE.ending.slice(3));
    await endingCard();
  } finally {
    zoomTarget = 1; duskTarget = 0; stopProcession(); ceremony = false; save();
  }
}

async function endingCard() {
  const p = ui.openPanel('exercise'), move = S.finale && S.finale.commitment;
  const i = await ui.card(p, FT.endTitle, [
    ui.verse(C.TREE.ending_rumi, C.TREE.ending_rumi_source),
    h('p', {}, C.TREE.outro),
    move ? h('p', { class: 'hl' }, FIN.fmt(FT.endToward, { move })) : null,
    S.values.length ? h('p', {}, FIN.fmt(FT.endLanterns, { values: S.values.join(FT.listSep) })) : null,
    S.steps.length ? h('p', {}, FIN.fmt(FT.endSteps, { steps: S.steps.join(FT.listSep) })) : null,
    h('p', { class: 'fine' }, FT.endFine),
  ], [FT.keepWandering, FT.shareGame, ...(C.FEEDBACK.formId ? [FT.leaveFeedback] : [])]);
  ui.closePanel();
  if (i === 1) share();
  if (i === 2) openFeedback();
}

const SERIF = '"Iowan Old Style", Palatino, Georgia, serif';
// Drawn after the world: the sunset tint, the planted lantern, and the way to the summit.
function drawDusk(t, sx, sy, k) {
  if (dusk > .01) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, cv.height);
    g.addColorStop(0, `rgba(240, 132, 84, ${.36 * dusk})`);
    g.addColorStop(.5, `rgba(222, 128, 110, ${.18 * dusk})`);
    g.addColorStop(1, `rgba(78, 58, 118, ${.3 * dusk})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.setTransform(k, 0, 0, k, -sx * k, -sy * k);
  }
  if (S.lantern) drawLantern(t);
  if (procession && !S.finaleGathered && !gathering) drawGuide(t, sx, sy, k);
}
function drawLantern(t) {
  const L = S.lantern, glow = lanternT == null ? 1 : Math.min(1, (performance.now() - lanternT) / 2500);
  const x = L.x, y = L.y - 20, r = 36 + Math.sin(t * 2) * 4;
  const g = ctx.createRadialGradient(x, y, 2, x, y, r * 1.6);
  g.addColorStop(0, `rgba(255, 210, 110, ${.8 * glow})`); g.addColorStop(1, 'rgba(255, 210, 110, 0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 1.6, 0, 7); ctx.fill();
  ctx.strokeStyle = '#1d1b19'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(L.x, L.y); ctx.lineTo(L.x, y + 8); ctx.stroke();
  ctx.fillStyle = glow < 1 ? `rgb(${Math.round(160 + 86 * glow)}, ${Math.round(150 + 44 * glow)}, ${Math.round(130 - 56 * glow)})` : '#f6c24a';
  ctx.beginPath(); ctx.ellipse(x, y, 7, 9, 0, 0, 7); ctx.fill();
  ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x, y, 7, 9, 0, 0, 7); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - 7, y); ctx.lineTo(x + 7, y); ctx.stroke();
  if (!L.text || glow < .5) return;
  ctx.font = `italic 9px ${SERIF}`; ctx.textAlign = 'center';
  const words = L.text.split(/\s+/), lines = []; let cur = '';
  for (const w of words) { const tt = cur ? cur + ' ' + w : w; if (cur && ctx.measureText(tt).width > 130) { lines.push(cur); cur = w; } else cur = tt; }
  lines.push(cur);
  lines.forEach((l, i) => {
    const ly = y - 16 - (lines.length - 1 - i) * 11;
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(247, 242, 231, .85)'; ctx.strokeText(l, x, ly);
    ctx.fillStyle = '#1d1b19'; ctx.fillText(l, x, ly);
  });
}
function drawGuide(t, sx, sy, k) {
  const s = summit(), Wd = cv.width, Hd = cv.height, d = dpr;
  const px = (s.x - sx) * k, py = (s.y - 40 - sy) * k;
  const mL = 34 * d, mR = Wd - 34 * d, mT = 150 * d, mB = Hd - 150 * d;   // below the HUD and toasts, above the act button
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (px > mL && px < mR && py > mT && py < mB) {           // in view: a soft light over the summit
    const g = ctx.createRadialGradient(px, py, 2, px, py, 30 * d);
    g.addColorStop(0, 'rgba(255, 214, 120, .9)'); g.addColorStop(1, 'rgba(255, 214, 120, 0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py + Math.sin(t * 2) * 3 * d, 30 * d, 0, 7); ctx.fill();
    return;
  }
  const cx = Wd / 2, cy = Hd / 2, dx = px - cx, dy = py - cy;
  const sc = Math.min(dx > 0 ? (mR - cx) / dx : dx < 0 ? (mL - cx) / dx : Infinity, dy > 0 ? (mB - cy) / dy : dy < 0 ? (mT - cy) / dy : Infinity);
  const ang = Math.atan2(dy, dx), bob = Math.sin(t * 3) * 4 * d;
  const ax = cx + dx * sc + Math.cos(ang) * bob, ay = cy + dy * sc + Math.sin(ang) * bob;
  ctx.save(); ctx.translate(ax, ay); ctx.rotate(ang); ctx.globalAlpha = .85; ctx.fillStyle = '#1d1b19';
  ctx.beginPath(); ctx.moveTo(15 * d, 0); ctx.lineTo(-9 * d, -11 * d); ctx.lineTo(-3 * d, 0); ctx.lineTo(-9 * d, 11 * d); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.font = `italic ${15 * d}px ${SERIF}`; ctx.textAlign = 'center';
  const tw = ctx.measureText(FT.summitLabel).width;
  const lx = Math.max(tw / 2 + 8 * d, Math.min(Wd - tw / 2 - 8 * d, ax - Math.cos(ang) * 34 * d)), ly = ay - Math.sin(ang) * 30 * d + 5 * d;
  ctx.lineWidth = 4 * d; ctx.strokeStyle = 'rgba(247, 242, 231, .9)'; ctx.strokeText(FT.summitLabel, lx, ly);
  ctx.fillStyle = '#1d1b19'; ctx.fillText(FT.summitLabel, lx, ly);
}

// ---------- encounters ----------
async function encounter() {
  const unmet = C.CREATURES.filter(c => !S.spirits[c.id]);
  const cr = unmet.length && Math.random() < .75 ? unmet[Math.floor(Math.random() * unmet.length)] : C.CREATURES[Math.floor(Math.random() * C.CREATURES.length)];
  const known = !!S.spirits[cr.id];
  let struggle = known ? 40 : 60, shown = struggle;
  const p = ui.openPanel('encounter');
  const cvs = h('canvas', { class: 'stage' }), meter = h('div', { class: 'meter' }, h('i')), msg = h('p', { class: 'msg' }), moves = h('div', { class: 'moves' });
  p.append(h('h2', { class: 'title' }, cr.name), cvs, h('p', { class: 'thought' }, cr.thought), h('label', { class: 'mlabel' }, 'struggle'), meter, msg, moves);
  const g = cvs.getContext('2d'); let raf;
  const draw = () => {
    const r = cvs.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
    if (cvs.width !== Math.round(r.width * d)) { cvs.width = r.width * d; cvs.height = r.height * d; }
    const t = performance.now() / 1000;
    shown += (struggle - shown) * .05;
    g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, r.width, r.height);
    const calm = 1 - shown / 100, cx = r.width * .64, cy = r.height * .52;
    const platform = (x, y, w) => { g.fillStyle = 'rgba(29,27,25,.12)'; g.beginPath(); g.ellipse(x, y, w, w * .28, 0, 0, 7); g.fill();
      g.strokeStyle = 'rgba(29,27,25,.45)'; g.lineWidth = 2; g.beginPath(); g.ellipse(x, y, w, w * .28, 0, .3, 2.6); g.stroke(); };
    platform(cx, cy + 4, 70); platform(r.width * .26, r.height * .92, 60);
    drawCharacter(g, S.char, r.width * .26, r.height * .92, 1, 0, 2.4);
    g.strokeStyle = 'rgba(29,27,25,.5)';
    for (let i = 0; i < Math.round(shown / 8); i++) {         // the ink storm of struggle
      g.lineWidth = 1 + (i % 3); g.beginPath();
      const rr = 50 + i * 4, a0 = t * (1 + i % 3) + i;
      g.ellipse(cx, cy - 30, rr, rr * .55, 0, a0, a0 + 1.2 + (i % 4) * .4); g.stroke();
    }
    drawCreature(g, cr, cx, cy, 3, t, calm);
    meter.firstChild.style.width = shown + '%';
    raf = requestAnimationFrame(draw);
  };
  draw();
  const learned = ['notice', ...C.PILLAR_ORDER.filter(k => S.done[k]).map(k => C.PILLARS[k].move)];
  const SOFTENS = ' It softens noticeably.', TIP = '  (Fighting what we feel tends to make it bigger. ACT calls this the struggle switch.)';
  // Reserve room for the longest message this encounter can show, so the move buttons never jump between turns.
  msg.style.minHeight = Math.max(...[...learned.map(id => C.MOVES[id].text + SOFTENS), ...C.STRUGGLE_MOVES.map(m => m.text + (S.tip ? '' : TIP))]
    .map(t => (msg.textContent = t, msg.offsetHeight))) + 'px';
  msg.textContent = known ? `${cr.name} again. You have met before.` : `A wild ${cr.name} drifts out of the grey grass.`;

  const outcome = await new Promise(res => {
    const turn = () => {
      moves.innerHTML = '';
      const tempt = C.STRUGGLE_MOVES[Math.floor(Math.random() * C.STRUGGLE_MOVES.length)];
      const opts = learned.map(id => ({ label: C.MOVES[id].name, act: () => useMove(id) }));
      opts.splice(Math.floor(Math.random() * (opts.length + 1)), 0, { label: tempt.name, act: () => fight(tempt), tempt: true });
      opts.forEach(o => moves.append(h('button', { onclick: o.act }, o.label)));
      moves.append(h('button', { class: 'quiet', onclick: () => res('left') }, 'Walk on'));
    };
    const useMove = id => {
      const m = C.MOVES[id], weak = m.pillar && cr.weak.includes(m.pillar);
      struggle = Math.max(0, struggle + m.effect * (weak ? 1.6 : 1));
      msg.textContent = m.text + (weak ? SOFTENS : '');
      audio.soft();
      if (struggle <= 0) return res('friend');
      turn();
    };
    const fight = m => {
      struggle = Math.min(100, struggle + 18);
      msg.textContent = m.text;
      audio.thud();
      if (!S.tip) { S.tip = true; msg.textContent += TIP; }
      if (struggle >= 100) return res('tired');
      turn();
    };
    turn();
  });
  moves.innerHTML = '';
  if (outcome === 'friend') {
    audio.chime();
    msg.textContent = `The struggle eases. ${cr.name} is still here, but it no longer pulls at you. It walks beside you now.`;
    const first = !S.spirits[cr.id];
    S.spirits[cr.id] = true; save();
    if (first) msg.after(h('p', { class: 'lore' }, cr.lore), h('p', { class: 'fine' }, 'Added to your journal.'));
    paint(player.x, player.y, 220, .8);
  } else if (outcome === 'tired') {
    msg.textContent = `The tug-of-war is exhausting. You let go of the rope for now, and ${cr.name} drifts back into the grass. Nobody wins a tug-of-war with their own mind.`;
  } else {
    msg.textContent = `You leave ${cr.name} be. It will be back sometime, and that's all right.`;
  }
  await new Promise(res => moves.append(h('button', { class: 'primary', onclick: ui.firstTap(res) }, 'Continue')));
  cancelAnimationFrame(raf);
  ui.closePanel();
}

// ---------- HUD & journal ----------
function updateHud() {
  const pills = $('#pills'); pills.innerHTML = '';
  for (const k of C.PILLAR_ORDER) {
    const d = h('i', { title: C.PILLARS[k].name });
    if (S.done[k]) d.style.background = C.PILLARS[k].color;
    pills.append(d);
  }
}
$('#pills').addEventListener('click', () => !ui.busy && openJournal());
$('#journalBtn').addEventListener('click', () => !ui.busy && openJournal());
const soundBtn = $('#soundBtn');
const paintSound = () => soundBtn.classList.toggle('off', audio.isMuted());
soundBtn.addEventListener('click', () => { audio.start(); audio.toggleMute(); paintSound(); });
paintSound();

function openJournal(tab = 'pillars') {
  const p = ui.openPanel('journal');
  const body = h('div', { class: 'jbody' });
  const tabs = [['pillars', 'Pillars'], ['spirits', 'Spirits'], ['verses', 'Verses'], ['you', 'You']];
  const bar = h('nav', { class: 'tabs' }, tabs.map(([id, name]) => h('button', { class: id === tab ? 'on' : '', onclick: () => { ui.closePanel(); openJournal(id); } }, name)));
  p.append(h('div', { class: 'jhead' }, h('h2', {}, 'Journal'), h('button', { class: 'close', onclick: () => ui.closePanel() }, 'Close')), bar, body);

  if (tab === 'pillars') {
    body.append(h('p', { class: 'fine' }, 'The six pillars of ACT together build psychological flexibility: being open, aware, and engaged in what matters.'));
    for (const k of C.PILLAR_ORDER) {
      const P = C.PILLARS[k];
      body.append(S.done[k]
        ? h('section', { class: 'entry', style: `border-color:${P.color}` }, h('h3', {}, P.name), h('p', { class: 'region' }, P.region), h('p', {}, P.plain), ui.learnMore(P.more), ui.verse(P.rumi, P.rumiSource))
        : h('section', { class: 'entry dim' }, h('h3', {}, P.name), h('p', {}, `Not yet learned. Seek ${P.guardian} at ${P.region}.`)));
    }
  } else if (tab === 'spirits') {
    const grid = h('div', { class: 'grid' });
    for (const cr of C.CREATURES) {
      const met = !!S.spirits[cr.id], c = h('canvas', { width: '160', height: '130' });
      const g = c.getContext('2d'); g.scale(2, 2);
      if (met) drawCreature(g, cr, 40, 58, 1.6, 1, 1);
      else { g.globalAlpha = .25; drawCreature(g, cr, 40, 58, 1.6, 1, 0); }
      grid.append(h('div', { class: 'spirit' + (met ? '' : ' dim') }, c, h('b', {}, met ? cr.name : '???'), h('small', {}, met ? cr.lore : 'Wanders the grey grass.')));
    }
    body.append(h('p', { class: 'fine' }, `${Object.keys(S.spirits).length} of ${C.CREATURES.length} spirits walk beside you.`), grid);
  } else if (tab === 'verses') {
    let any = false;
    for (const k of C.PILLAR_ORDER) if (S.done[k]) { any = true; body.append(ui.verse(C.PILLARS[k].rumi, C.PILLARS[k].rumiSource)); }
    C.VERSES.forEach((v, i) => { if (S.verses[i]) { any = true; body.append(ui.verse(v.text, v.source)); } });
    if (!any) body.append(h('p', { class: 'fine' }, 'Verses gather here as you meet the spirits and read the old stones.'));
    body.append(h('p', { class: 'fine' }, 'Verses are loose renderings after Rumi (Jalāl al-Dīn Rūmī, 1207–1273), not direct translations.'));
  } else {
    const chars = h('div', { class: 'chips' }, C.CHARACTERS.map(ch => h('button', { class: 'chip' + (S.char === ch.id ? ' on' : ''), onclick: () => { S.char = ch.id; save(); ui.closePanel(); openJournal('you'); } }, ch.name)));
    body.append(h('h3', {}, 'Traveller'), chars);
    body.append(h('h3', {}, 'Your lanterns'), h('p', {}, S.values.length ? S.values.join(' · ') : 'Not yet chosen. They wait at the Lantern Summit.'));
    if (S.valueNote) body.append(h('p', { class: 'note' }, `“${S.valueNote}”`));
    body.append(h('h3', {}, 'Your small steps'), h('p', {}, S.steps.length ? S.steps.join(' · ') : 'Not yet taken. The stepping stones are in the east.'));
    const F = S.finale;
    if (F) {
      const tags = (list, cls) => h('div', { class: 'tags' + (cls ? ' ' + cls : '') }, list.map(m => h('span', {}, m)));
      body.append(h('h3', {}, FT.jTitle),
        F.commitment ? h('div', { class: 'hl' }, h('small', {}, FT.jCommit), h('b', {}, F.commitment)) : null,
        h('h4', {}, FT.jToward), tags(F.toward),
        h('h4', {}, FT.jAway), tags(F.away, 'away'));
      if (F.situation) body.append(h('h4', {}, FT.jSituation), h('p', { class: 'note' }, `“${F.situation}”`), h('p', { class: 'fine' }, FT.jPrivate));
      body.append(h('p', { class: 'fine' }, FT.jRevisit));
    }
    body.append(h('div', { class: 'btns' },
      h('button', { class: 'primary', onclick: share }, 'Share this game'),
      C.FEEDBACK.formId ? h('button', { onclick: openFeedback }, 'Leave feedback') : null,
      h('button', { onclick: async () => {
        if (await ui.choose('Start over? This erases your progress on this device.', ['Yes, start over', 'Keep my journey'])) return;
        try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(MASK_KEY); } catch (e) {}
        location.reload();
      } }, 'Start over')));
    body.append(h('p', { class: 'fine' }, C.DISCLAIMER + ' Everything you write stays on this device.'));
  }
}

// ---------- feedback ----------
// Sent anonymously to a Google Form. Only the typed message plus progress counts and
// device type are sent, never anything written elsewhere in the game.
async function openFeedback() {
  ui.closePanel();
  const p = ui.openPanel('exercise');
  const text = h('textarea', { id: 'feedback-text', rows: '6', maxlength: '1500', placeholder: 'How did it feel? A moment that stayed with you? One thing you would change?' });
  const i = await ui.card(p, 'Leave feedback', [
    h('p', {}, 'Your words go straight to the person who made this island. No account needed.'),
    text,
    h('p', { class: 'fine' }, 'Anonymous. Please don’t include private details.'),
  ], ['Send', 'Cancel']);
  ui.closePanel();
  if (i !== 0 || !text.value.trim()) return;
  const device = /iPhone|iPad/.test(navigator.userAgent) ? 'iPhone/iPad' : /Android/.test(navigator.userAgent) ? 'Android' : 'Computer';
  const context = `Pillars ${doneCount()}/6 · Spirits ${Object.keys(S.spirits).length}/${C.CREATURES.length} · Finished ${S.ended ? 'yes' : 'no'} · ${device}`;
  const F = C.FEEDBACK;
  try {
    // no-cors: Google doesn't allow reading the reply, so a resolved fetch means "sent".
    await fetch(`https://docs.google.com/forms/d/e/${F.formId}/formResponse`, {
      method: 'POST', mode: 'no-cors',
      body: new URLSearchParams({ [`entry.${F.textEntry}`]: text.value.trim(), [`entry.${F.contextEntry}`]: context }),
    });
    ui.toast('Thank you. Your words were sent.');
  } catch (e) {
    ui.toast('Couldn’t send. Try again when you’re online.', 4000);
  }
}

async function share() {
  const data = { title: C.TITLE, text: 'A quiet little game about the six pillars of Acceptance & Commitment Therapy.', url: location.href.split('#')[0] };
  try {
    await navigator.share(data);
  } catch (e) {
    // Web Share can be missing or blocked (e.g. inside an embedded viewer); copy the link instead.
    try { await navigator.clipboard.writeText(data.url); ui.toast('Link copied'); }
    catch (e2) { ui.toast('Copy the address from your browser to share'); }
  }
}

// ---------- title, character select, start ----------
function drawCharPreview(canvas, id) {
  const g = canvas.getContext('2d'); let raf;
  const loop = () => {
    if (!canvas.isConnected) return cancelAnimationFrame(raf);
    const t = performance.now() / 1000;
    const k = canvas.width / 60;          // draw in a 60×60 space at the canvas's resolution
    g.setTransform(k, 0, 0, k, 0, 0); g.clearRect(0, 0, 60, 60);
    drawCharacter(g, id, 30, 52, 1, t * 4, 1.3);
    raf = requestAnimationFrame(loop);
  };
  loop();
}

function title() {
  const p = ui.openPanel('titlescreen');
  const hasSave = !!S.char;
  const status = h('p', { class: 'fine' }, 'grinding ink…');
  let starting = false;                  // a quick double tap must not start the game twice
  const go = async isNew => {
    if (starting) return;
    starting = true;
    if (isNew && hasSave && await ui.choose('Start a new journey? Your current progress will be erased.', ['Yes, begin again', 'Cancel'])) { starting = false; return; }
    begin(isNew);
  };
  const btns = h('div', { class: 'btns', hidden: '' },
    hasSave ? h('button', { class: 'primary', onclick: () => go(false) }, 'Continue') : null,
    h('button', { class: hasSave ? '' : 'primary', onclick: () => go(true) }, hasSave ? 'New journey' : 'Begin'));
  p.append(h('div', { class: 'titlecard' }, h('div', { class: 'seal' }, '心'), h('h1', {}, C.TITLE), h('p', { class: 'sub' }, C.SUBTITLE), status, btns,
           h('p', { class: 'fine foot' }, C.DISCLAIMER, h('br'), 'Best with sound. On iPhone: Share → Add to Home Screen for full screen.')));
  return { ready: () => { status.remove(); btns.hidden = false; } };
}

async function begin(isNew) {
  audio.start();
  if (isNew) {
    S = fresh();
    try { localStorage.removeItem(MASK_KEY); } catch (e) {}
    mctx.clearRect(0, 0, mask.width, mask.height);
  }
  ui.closePanel();
  if (!S.char) {
    const p = ui.openPanel('select');
    p.append(h('h2', {}, 'Who walks the island?'), h('p', { class: 'fine' }, 'You can change this later in the journal.'));
    const grid = h('div', { class: 'grid' });
    p.append(grid);                      // previews only animate once their canvas is on the page
    await new Promise(res => {
      const pick = ui.firstTap(id => { S.char = id; res(); });
      for (const ch of C.CHARACTERS) {
        const c = h('canvas', { width: '192', height: '192' });
        grid.append(h('button', { class: 'charcard', onclick: () => pick(ch.id) }, c, h('b', {}, ch.name)));
        drawCharPreview(c, ch.id);
      }
    });
    ui.closePanel();
    S.pos = null;
  }
  const pos = S.pos || W.START;
  player.x = pos.x; player.y = pos.y; cam.x = player.x; cam.y = player.y;
  stopProcession(); dusk = duskTarget = 0; zoomK = zoomTarget = 1; lanternT = null;
  mode = 'play'; $('#hud').hidden = false; updateHud(); save();
  if (isNew || !S.seenIntro) { S.seenIntro = true; await ui.say(C.INTRO); save(); }
  if (S.finaleStage === 'procession') { startProcession(true); ui.toast(FT.summitToast, 4000); }
}

// ---------- boot ----------
async function boot() {
  requestAnimationFrame(frame);
  const t = title();
  await new Promise(r => setTimeout(r, 50));          // let the title paint first
  map = W.buildMap();
  colorLayer = W.paintWorld(map);
  inkLayer = W.inkify(colorLayer);
  try {
    const data = localStorage.getItem(MASK_KEY);
    if (data) { const img = new Image(); img.onload = () => mctx.drawImage(img, 0, 0); img.src = data; }
  } catch (e) {}
  t.ready();
  // Offline support when served from a website (not from a file or an embedded viewer).
  if ('serviceWorker' in navigator && /^https:|^http:\/\/localhost/.test(location.href) && !window.__SINGLE_FILE__)
    navigator.serviceWorker.register('sw.js').catch(() => {});
  addEventListener('pagehide', () => { if (mode === 'play') { S.pos = { x: player.x, y: player.y }; save(); saveMask(); } });
  if (location.hash === '#debug') window.GAME = { get S() { return S; }, player, audio, get map() { return map; }, meetGuardian, encounter, greatTree, openJournal, W, center, get followers() { return followers; }, get dusk() { return dusk; }, get near() { return near && near.label; } };
}
boot();
