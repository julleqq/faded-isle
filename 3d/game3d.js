// The Faded Isle 3D: the same journey as game.js, walked in first person.
// Game logic and flow are copied from ../game.js (positions stay in the 2D world's
// pixels, so ../world.js collision and layout are shared); the overworld is drawn
// with three.js. Colour returns through a reveal mask that every world material samples.

import * as THREE from 'three';
import * as W from '../world.js';
import { TILE, SIZE, T } from '../world.js';
import * as C from '../content.js';
import * as ui from '../ui.js';
import { h } from '../ui.js';
import * as audio from '../audio.js';
import { drawCharacter, drawCreature } from '../art.js';
import { EXERCISES } from '../exercises.js';
import * as EX from '../exercises.js';
import * as FIN from '../finale.js';
import { LANGS, lang, setLang, fmt } from '../i18n.js';
import * as I18N from '../i18n.js';
import { U as IU, makeWash, radialTex, PAPER } from './ink.js';
import { Island, makeSky, makeMountains, blobShadow } from './world3d.js';
import * as A3 from './audio3d.js';
import * as MODELS from './models.js';           // characters, guardians and spirits built from primitives                // spatial ambience and footsteps
const FT = FIN.TEXT, U = C.UI;


const SAVE_KEY = 'fadedisle3d.v1', MASK_KEY = 'fadedisle3d.mask', MOTION_KEY = 'fadedisle3d.reducemotion';
const MS = 8;                       // reveal mask is 1/8 of the 2D world's pixels (4 texels per tile)
const SPEED = 74;                   // world px per second (≈ 2.3 tiles/s: an unhurried walk)
const $ = s => document.querySelector(s);
const EYE = MODELS.EYE_HEIGHT;                     // eye height per character (monk 1.5, fox .58, drop .5, crane 1.1)
const tiles = v => v / TILE;
// Start a few steps further south than the 2D game, so the Great Tree stands whole in front of you.
const START3D = { x: W.START.x, y: W.START.y + 3.5 * TILE };

// ---------- state & saving ----------
const fresh = () => ({ char: null, pos: null, yaw: 0, done: {}, spirits: {}, verses: {}, values: [], valueNote: '', steps: [], ended: false, tip: false });
let S = fresh();
try { S = Object.assign(fresh(), JSON.parse(localStorage.getItem(SAVE_KEY)) || {}); } catch (e) {}
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) {} }
let maskDirty = false, texDirty = false;
function saveMask() { if (!maskDirty) return; maskDirty = false; try { localStorage.setItem(MASK_KEY, mask.toDataURL()); } catch (e) {} }
let reduceMotion = false;
try { reduceMotion = localStorage.getItem(MOTION_KEY) === '1'; } catch (e) {}
if (!reduceMotion) try { reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

// ---------- reveal mask ----------
const mask = document.createElement('canvas'); mask.width = mask.height = SIZE / MS;
const mctx = mask.getContext('2d');
const maskTex = new THREE.CanvasTexture(mask);
maskTex.flipY = false; maskTex.generateMipmaps = false; maskTex.minFilter = THREE.LinearFilter;
IU.uMask.value = maskTex; IU.uWash.value = makeWash();
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
  maskDirty = texDirty = true;
}

// ---------- renderer, scene, camera ----------
const cv = $('#game');
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setClearColor(PAPER);
const scene = new THREE.Scene();
const PAPER_C = new THREE.Color(PAPER), DUSK_FOG = new THREE.Color('#e7b396');
scene.fog = new THREE.Fog(PAPER, 9, 38);
const camera = new THREE.PerspectiveCamera(70, 1, .05, 260);
camera.rotation.order = 'YXZ';
scene.add(camera);
const hemi = new THREE.HemisphereLight(0xfff8ec, 0xcfc3a8, Math.PI * .72);
const sun = new THREE.DirectionalLight(0xfff3dc, Math.PI * .42);
sun.position.set(-.5, .8, -.35);
scene.add(hemi, sun);
const sky = makeSky(), hills = makeMountains();
scene.add(sky, hills);

let dpr = 1, vw = 0, vh = 0, quality = 1;
function resize() {
  vw = innerWidth; vh = innerHeight;
  dpr = Math.min(1.5, devicePixelRatio || 1) * quality;
  renderer.setPixelRatio(Math.max(.75, dpr));
  renderer.setSize(vw, vh, false);
  const aspect = vw / vh;
  camera.aspect = aspect;
  camera.fov = Math.max(52, Math.min(78, 2 * Math.atan(Math.tan(32 * Math.PI / 180) / aspect) * 180 / Math.PI));
  camera.updateProjectionMatrix();
  if (viewmodel && viewmodel.userData.resize) viewmodel.userData.resize(camera);
}
addEventListener('resize', resize);
document.addEventListener('gesturestart', e => e.preventDefault());   // no pinch-zoom on iOS

// ---------- world objects ----------
let map, island;
const player = { x: W.START.x, y: W.START.y, yaw: 0, pitch: -.08, vx: 0, vy: 0, phase: 0, moving: false, camY: 1 };
const look = { yaw: 0, pitch: -.08 };            // where the player wants to look (smoothed into player.yaw/pitch)
const center = k => ({ x: W.SHRINES[k].x * TILE + 16, y: W.SHRINES[k].y * TILE + 16 });
const interactables = [
  { ...center('values'), id: 'plant', label: FT.plantAct, r: 230, any: true, mh: 1.6, when: () => procession && S.finaleGathered && !ceremony, run: () => plantLantern() },
  ...C.PILLAR_ORDER.map(k => ({ ...center(k), id: 'meet', label: U.act.meet, r: 84, mh: 2.5, pillar: k, run: () => meetGuardian(k) })),
  ...W.VERSE_STONES.map((v, i) => ({ x: v.x * TILE + 16, y: v.y * TILE + 16, id: 'read', label: U.act.read, r: 64, mh: 1.95, run: () => readVerse(i) })),
  { x: W.SIGNPOST.x * TILE + 16, y: W.SIGNPOST.y * TILE + 16, id: 'read', label: U.act.read, r: 64, mh: 2.1, run: () => ui.say(C.SIGN) },
  { x: 40 * TILE, y: 40 * TILE, id: 'touch', label: U.act.touch, r: 104, mh: 3.2, run: () => greatTree() },
];
let near = null;
const blooms = [];

// ---------- input: left half walks (floating joystick), right half looks ----------
const keys = new Set();
addEventListener('keydown', e => {
  keys.add(e.key.toLowerCase());
  if ((e.key === ' ' || e.key === 'Enter') && near && !ui.busy && mode === 'play') { e.preventDefault(); interact(); }
});
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());
let joy = null, drag = null;
const joyEl = $('#joy'), knobEl = joyEl.firstElementChild;
cv.addEventListener('pointerdown', e => {
  if (mode !== 'play' || ui.busy || cutscene()) return;
  const lookSide = e.pointerType === 'mouse' || e.clientX > vw / 2;
  if (lookSide) { if (drag) return; drag = { id: e.pointerId, x: e.clientX, y: e.clientY, k: e.pointerType === 'mouse' ? .0042 : .0058 }; }
  else {
    if (joy) return;
    joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
    joyEl.hidden = false; joyEl.style.transform = `translate(${e.clientX}px,${e.clientY}px)`; knobEl.style.transform = '';
  }
  try { cv.setPointerCapture(e.pointerId); } catch (err) {}
});
cv.addEventListener('pointermove', e => {
  if (joy && e.pointerId === joy.id) { joy.x = e.clientX; joy.y = e.clientY; }
  if (drag && e.pointerId === drag.id) {
    look.yaw += (e.clientX - drag.x) * drag.k;
    look.pitch = Math.max(-.8, Math.min(.55, look.pitch - (e.clientY - drag.y) * drag.k));
    drag.x = e.clientX; drag.y = e.clientY;
  }
});
const endPtr = e => {
  if (joy && e.pointerId === joy.id) { joy = null; joyEl.hidden = true; }
  if (drag && e.pointerId === drag.id) drag = null;
};
cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);
cv.addEventListener('contextmenu', e => e.preventDefault());
function dropInput() { if (joy) { joy = null; joyEl.hidden = true; } drag = null; }

function inputVector() {                         // x: strafe right, y: forward
  let x = 0, y = 0;
  if (keys.has('arrowleft') || keys.has('a')) x--;
  if (keys.has('arrowright') || keys.has('d')) x++;
  if (keys.has('arrowup') || keys.has('w')) y++;
  if (keys.has('arrowdown') || keys.has('s')) y--;
  if (keys.has('q')) look.yaw -= .03;
  if (keys.has('e')) look.yaw += .03;
  if (joy) {
    const dx = joy.x - joy.ox, dy = joy.y - joy.oy, m = Math.hypot(dx, dy), k = m > 44 ? 44 / m : 1;
    knobEl.style.transform = `translate(${dx * k}px,${dy * k}px)`;
    x = dx / 44; y = -dy / 44;
  }
  const m = Math.hypot(x, y);
  return m > 1 ? { x: x / m, y: y / m } : m < 0.15 ? { x: 0, y: 0 } : { x, y };
}
const fwd = () => ({ x: Math.sin(player.yaw), y: -Math.cos(player.yaw) });

// ---------- update ----------
let mode = 'title', grassWalk = 0, nextEnc = 300, lastRegion = null, saveT = 0, lastStep = 0;
// Guardians and the Great Tree are solid in 3D, so the camera never walks into them.
const SOLID = [{ x: 40 * TILE, y: 40 * TILE, r: 56 }, ...Object.keys(W.SHRINES).map(k => ({ ...center(k), r: 38 }))];
const canStand = (x, y) => [[-7, -7], [7, -7], [-7, 7], [7, 7]].every(([dx, dy]) => W.walkable(map, x + dx, y + dy))
  && SOLID.every(o => Math.hypot(x - o.x, y - o.y) > o.r);
let focus = null, lift = 0, liftTarget = 0, rising = null;
const cutscene = () => !!(focus || rising || liftTarget > 0 || ceremony);

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
  updateProcession(dt, t);
  player.moving = false;
  lift += (liftTarget - lift) * Math.min(1, dt * .6);
  if (focus) {                                    // a gentle turn toward whatever is speaking
    const dx = tiles(focus.x - player.x), dz = tiles(focus.y - player.y), d = Math.hypot(dx, dz);
    const want = Math.atan2(dx, -dz);
    look.yaw = player.yaw + angDiff(want, player.yaw) * Math.min(1, dt * 1.6);
    look.pitch += (Math.atan2((focus.h || 1) - EYE[S.char] * .9, Math.max(1, d)) - look.pitch) * Math.min(1, dt * 1.4);
  }
  const turn = Math.min(1, dt * (reduceMotion ? 7 : 16));
  player.yaw += (look.yaw - player.yaw) * turn;
  player.pitch += (look.pitch - player.pitch) * turn;
  if (mode !== 'play' || ui.busy || cutscene()) {
    dropInput(); player.vx *= .8; player.vy *= .8;
    return;
  }

  const v = inputVector(), f = fwd();
  const tvx = (f.x * v.y + -f.y * v.x) * SPEED, tvy = (f.y * v.y + f.x * v.x) * SPEED;
  const acc = Math.min(1, dt * 4.5);             // gentle acceleration and stopping
  player.vx += (tvx - player.vx) * acc; player.vy += (tvy - player.vy) * acc;
  if (Math.hypot(player.vx, player.vy) > 2) {
    const nx = player.x + player.vx * dt, ny = player.y + player.vy * dt;
    const ox = player.x, oy = player.y;
    if (canStand(nx, player.y)) player.x = nx; else player.vx *= .5;
    if (canStand(player.x, ny)) player.y = ny; else player.vy *= .5;
    const moved = Math.hypot(player.x - ox, player.y - oy);
    if (moved > 0) {
      player.moving = true; player.phase += moved / TILE * 4.2;
      const tile = W.tileAt(map, player.x, player.y);
      if (Math.floor(player.phase / Math.PI) !== lastStep) { lastStep = Math.floor(player.phase / Math.PI); A3.step(SURF[tile] || 'grass'); }
      if (tile === T.TALL) {
        grassWalk += moved;
        if (grassWalk > nextEnc && !procession) { grassWalk = 0; nextEnc = 260 + Math.random() * 380; encounter(); }
      }
    }
  }
  // colour follows your feet, and blooms a little ahead where you are looking
  paint(player.x, player.y, 105, dt * 2.5);
  paint(player.x, player.y, 190, dt * 0.45);
  if (player.moving) paint(player.x + f.x * 150, player.y + f.y * 150, 120, dt * 1.3);

  if (procession && !S.finaleGathered && !gathering && Math.hypot(player.x - summit().x, player.y - summit().y) < 190) gatherAtSummit();
  near = interactables.find(o => (!o.when || o.when()) && facing(o)) || null;
  setAct(near && near.label);

  const region = W.regionAt(player.x, player.y);
  if (region !== lastRegion) { lastRegion = region; if (region) ui.toast(C.PILLARS[region].region); }

  if ((saveT += dt) > 5) { saveT = 0; S.pos = { x: player.x, y: player.y }; S.yaw = look.yaw; save(); saveMask(); }
}
const SURF = { [T.GRASS]: 'grass', [T.TALL]: 'tall', [T.SAND]: 'sand', [T.PATH]: 'path', [T.BRIDGE]: 'bridge', [T.STONE]: 'stone' };
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
// Near enough, and roughly facing it (or right beside it).
function facing(o) {
  const dx = o.x - player.x, dy = o.y - player.y, d = Math.hypot(dx, dy);
  if (d > o.r) return false;
  if (o.any || d < o.r * .4) return true;
  const f = fwd();
  return (dx * f.x + dy * f.y) / d > .4;
}

// ---------- 3D figures ----------
const guardians = {};                            // pillar -> { g, glow, yaw }
const glowTex = {};
const additive = (map, color = 0xffffff, fog = true) => new THREE.SpriteMaterial({ map, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog });
let viewmodel = null, shadow = null, marker = null, beacon = null, lanternObj = null, petals = null;
const followerObjs = new Map();

function makeFigures() {
  for (const k of C.PILLAR_ORDER) {
    const g = MODELS.makeGuardian(k);
    const glow = new THREE.Sprite(additive(glowTex[k] = radialTex([[0, hexA(C.PILLARS[k].color, .55)], [.5, hexA(C.PILLARS[k].color, .18)], [1, hexA(C.PILLARS[k].color, 0)]])));
    glow.scale.set(3.4, 3.4, 1); glow.material.opacity = 0;
    scene.add(g, glow);
    const c = center(k);
    guardians[k] = { g, glow, yaw: Math.atan2(40 - tiles(c.x), 40 - tiles(c.y)) };
  }
  const mk = radialTex([[0, 'rgba(29,27,25,.95)'], [.45, 'rgba(29,27,25,.85)'], [.6, 'rgba(29,27,25,.2)'], [1, 'rgba(29,27,25,0)']], 32);
  marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: mk, transparent: true, depthWrite: false, fog: false }));
  marker.scale.set(.15, .15, 1); marker.visible = false; scene.add(marker);
  // a soft column of light over the Lantern Summit while the procession walks there
  const bc = document.createElement('canvas'); bc.width = 32; bc.height = 128;
  { const g = bc.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, 'rgba(255,214,120,0)'); gr.addColorStop(.7, 'rgba(255,214,120,.55)'); gr.addColorStop(1, 'rgba(255,230,160,.9)');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 128);
    const gx = g.createLinearGradient(0, 0, 32, 0);
    gx.addColorStop(0, 'rgba(0,0,0,1)'); gx.addColorStop(.5, 'rgba(0,0,0,0)'); gx.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = gx; g.fillRect(0, 0, 32, 128); }
  beacon = new THREE.Sprite(additive(new THREE.CanvasTexture(bc), 0xffffff, false));
  beacon.center.set(.5, 0); beacon.scale.set(1.8, 18, 1); beacon.visible = false; scene.add(beacon);
  shadow = blobShadow(.9); scene.add(shadow);
  // drifting petals / leaves / fireflies around you
  const n = 48, geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const pt = radialTex([[0, 'rgba(255,255,255,1)'], [.5, 'rgba(255,255,255,.8)'], [1, 'rgba(255,255,255,0)']], 32);
  petals = new THREE.Points(geo, new THREE.PointsMaterial({ size: .09, map: pt, vertexColors: true, transparent: true, depthWrite: false, fog: true }));
  petals.frustumCulled = false; petals.userData.p = Array.from({ length: n }, () => ({ life: 0 }));
  scene.add(petals);
}
function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
function setCharacter(id) {
  if (viewmodel) { camera.remove(viewmodel); viewmodel = null; }
  if (!id) return;
  viewmodel = MODELS.makeViewmodel(id);
  camera.add(viewmodel);
  viewmodel.userData.resize && viewmodel.userData.resize(camera);
  const s = { monk: .95, crane: .9, fox: .75, drop: .7 }[id] || .9;
  shadow.scale.set(s, s, 1);
}

const PETALS = { present: '#9cc27a', defusion: '#d9823b', acceptance: '#f4f1ea', selfctx: '#b9b0e0', values: '#ffd97a', action: '#e9868a' };
const _pc = new THREE.Color();
function updatePetals(dt, t) {
  const P = petals.userData.p, pos = petals.geometry.attributes.position, cols = petals.geometry.attributes.color;
  const region = W.regionAt(player.x, player.y), cx = camera.position.x, cz = camera.position.z, f = fwd();
  const fire = dusk > .4;
  for (let i = 0; i < P.length; i++) {
    const p = P[i];
    p.life -= dt;
    if (p.life <= 0) {                           // respawn somewhere ahead of you
      const a = (Math.random() - .5) * 2.2, d = 1.5 + Math.random() * 8;
      const fx = Math.sin(player.yaw + a), fz = -Math.cos(player.yaw + a);
      p.x = cx + fx * d; p.z = cz + fz * d; p.y = camera.position.y + (fire ? -.6 + Math.random() * 1.5 : .5 + Math.random() * 2.5);
      p.life = 5 + Math.random() * 5; p.max = p.life; p.s = Math.random() * 6;
      _pc.set(fire ? '#ffe08a' : (PETALS[region] || '#f0b7c3'));
      cols.setXYZ(i, _pc.r, _pc.g, _pc.b);
    }
    if (fire) { p.x += Math.sin(t * .7 + p.s) * dt * .3; p.y += Math.sin(t * 1.3 + p.s) * dt * .15; p.z += Math.cos(t * .6 + p.s) * dt * .3; }
    else { p.x += (.25 + Math.sin(t + p.s) * .35) * dt; p.y -= .28 * dt; p.z += Math.cos(t * .8 + p.s) * .2 * dt; }
    const fade = Math.min(1, p.life / 1.5, (p.max - p.life) / 1.5);
    pos.setXYZ(i, p.x, p.life > 0 && fade > 0 ? p.y : -99, p.z);
  }
  pos.needsUpdate = true; cols.needsUpdate = true;
  petals.material.size = fire ? .12 + Math.sin(t * 3) * .02 : .09;
}

// ---------- render ----------
const _v = new THREE.Vector3();
let lastUpload = 0;
function render(t, dt, now) {
  IU.uTime.value = t;
  if (texDirty && now - lastUpload > 110) { texDirty = false; lastUpload = now; maskTex.needsUpdate = true; }
  if (!map) { renderer.render(scene, camera); return; }
  if (mode === 'play' || mode === 'rising') {
    const X = tiles(player.x), Z = tiles(player.y), eye = EYE[S.char] || 1;
    const gy = island.groundY(X, Z);
    const speed = Math.hypot(player.vx, player.vy) / SPEED;
    const bob = reduceMotion ? 0 : Math.sin(player.phase) * .022 * speed;
    player.camY += (gy + eye - player.camY) * Math.min(1, dt * 8);
    camera.position.set(X, player.camY + bob + lift, Z);
    camera.rotation.set(player.pitch - lift * .055, -player.yaw, reduceMotion ? 0 : Math.sin(player.phase * .5) * .004 * speed);
    IU.uPlayer.value.set(X, gy, Z);
    shadow.position.set(X, gy + .03, Z); shadow.visible = lift < .5;
  } else {                                        // title: a slow drift around the island
    const a = t * .025 + 1.2;
    camera.position.set(40 + Math.cos(a) * 30, 12 + Math.sin(t * .05) * 1.5, 40 + Math.sin(a) * 30);
    camera.lookAt(40, 3.5, 40);
    IU.uPlayer.value.set(-99, 0, -99);
    if (shadow) shadow.visible = false;
  }
  sky.position.copy(camera.position);
  island.cull(camera.position);
  // dusk
  IU.uDusk.value = dusk; A3.setDusk(dusk);
  scene.fog.color.copy(PAPER_C).lerp(DUSK_FOG, dusk);
  renderer.setClearColor(scene.fog.color);
  hemi.intensity = Math.PI * (.72 - dusk * .08); sun.color.setRGB(1, .95 - dusk * .15, .86 - dusk * .3);
  hills.material.color.setRGB(1 - dusk * .1, 1 - dusk * .3, 1 - dusk * .2);
  // guardians
  for (const k of C.PILLAR_ORDER) {
    const G = guardians[k], p = guardPos(k), x = tiles(p.x), z = tiles(p.y);
    const y = island.groundY(x, z) + (gathered.has(k) ? 0 : .2);
    G.g.position.set(x, y, z);
    const dx = camera.position.x - x, dz = camera.position.z - z;
    if (mode === 'play' && dx * dx + dz * dz < 100) G.yaw += angDiff(Math.atan2(dx, dz), G.yaw) * Math.min(1, dt * 1.5);
    G.g.rotation.y = G.yaw;
    G.g.userData.setColored && G.g.userData.setColored(!!S.done[k]);
    G.g.userData.update && G.g.userData.update(t);
    const on = S.done[k] ? .5 + Math.sin(t * 2 + x) * .12 : 0, sp = speaking === k ? .45 : 0;
    G.glow.material.opacity += (on + sp - G.glow.material.opacity) * Math.min(1, dt * 2);
    const far = Math.hypot(x - camera.position.x, z - camera.position.z) > 31;   // nearly lost in the fog
    G.g.visible = !far;
    G.glow.position.set(x, y + 1, z); G.glow.visible = !far && G.glow.material.opacity > .01;
  }
  // followers
  for (const f of followers) {
    const o = f.obj, x = tiles(f.x), z = tiles(f.y);
    o.position.set(x, island.groundY(x, z) + .25 + Math.sin(t * 1.6 + f.i) * .08, z);
    const dx = x - (o.userData.px ?? x), dz = z - (o.userData.pz ?? z);
    if (dx * dx + dz * dz > 1e-5) o.rotation.y = Math.atan2(dx, dz);
    o.userData.px = x; o.userData.pz = z;
    o.userData.update && o.userData.update(t, 1);
  }
  if (rising) rising.obj.userData.update && rising.obj.userData.update(t, rising.calm);
  // interaction marker: a small bobbing ink drop over what you can meet or read
  if (near && !ui.busy && mode === 'play') {
    const x = tiles(near.x), z = tiles(near.y);
    marker.visible = near.id !== 'plant';
    marker.position.set(x, island.groundY(x, z) + near.mh + Math.sin(t * 3) * .06, z);
    marker.material.opacity = .65 + Math.sin(t * 4) * .25;
  } else marker.visible = false;
  // procession: beacon over the summit, and the arrow when it is out of view
  const guiding = procession && !S.finaleGathered && !gathering && mode === 'play';
  beacon.visible = guiding;
  if (guiding) { const s = summit(), x = tiles(s.x), z = tiles(s.y); beacon.position.set(x, island.groundY(x, z) + .5, z); beacon.material.opacity = .75 + Math.sin(t * 2) * .2; }
  updateGuide(guiding);
  if (lanternObj) updateLantern(t);
  if (viewmodel) { viewmodel.visible = mode === 'play' && lift < .5; viewmodel.userData.update && viewmodel.userData.update(t, player.phase, player.moving); }
  updatePetals(dt, t);
  A3.update(camera.position.x, camera.position.z, camera.rotation.y);
  renderer.render(scene, camera);
}

const guideEl = $('#guide');
let guideOn = false, guideW = 0;
function updateGuide(on) {
  if (on) {
    const s = summit(), x = tiles(s.x), z = tiles(s.y);
    _v.set(x, island.groundY(x, z) + 2.5, z).project(camera);
    const behind = _v.z > 1;
    let nx = behind ? -_v.x : _v.x, ny = behind ? -_v.y : _v.y;
    const inView = !behind && Math.abs(nx) < .85 && Math.abs(ny) < .7;
    if (!inView) {
      if (behind && Math.abs(nx) < .2) nx = nx < 0 ? -1 : 1;     // straight behind: point to a side
      const k = Math.min(.82 / Math.abs(nx || 1e-3), .55 / Math.abs(ny || 1e-3));
      nx *= k; ny *= k;
      const px = (nx + 1) / 2 * vw, py = (1 - ny) / 2 * vh, ang = Math.atan2(-ny, nx);
      if (!guideOn) { guideEl.hidden = false; guideEl.lastChild.textContent = FT.summitLabel; guideOn = true; guideW = guideEl.lastChild.offsetWidth; }
      guideEl.style.transform = `translate(${Math.max(guideW / 2 + 8, Math.min(vw - guideW / 2 - 8, px))}px,${py}px)`;
      guideEl.firstChild.style.transform = `rotate(${ang}rad)`;
      return;
    }
  }
  if (guideOn) { guideEl.hidden = true; guideOn = false; }
}

// ---------- frame loop (+ a gentle resolution drop if a phone struggles) ----------
let last = performance.now(), shown = true, perfT = 0, perfN = 0, perfSum = 0;
const perf = { fps: 0, calls: 0, tris: 0, quality: 1 };
const panelEl = $('#panel');
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const t = now / 1000;
  if (map) update(dt, t);
  // Skip drawing the world while an opaque panel covers it (only the title screen is see-through),
  // so the main thread stays free to answer taps.
  const visible = panelEl.hidden || panelEl.classList.contains('titlescreen');
  if (visible !== shown) { shown = visible; A3.pause(!visible); }
  if (visible) {
    render(t, dt, now);
    perf.calls = renderer.info.render.calls; perf.tris = renderer.info.render.triangles;
    perfSum += dt; perfN++;
    if ((perfT += dt) > 3) {
      perf.fps = Math.round(perfN / perfSum);
      if (mode === 'play' && !navigator.webdriver && perfSum / perfN > 1 / 34 && quality > .7) { quality -= .15; resize(); }
      perf.quality = quality; perfT = perfSum = perfN = 0;
    }
  }
  requestAnimationFrame(frame);
}

// ---------- interactions ----------
const actBtn = $('#act'); let actLabel = null;
function setAct(label) {                 // touch the DOM only when the label changes, not every frame
  if (label === actLabel) return;
  actLabel = label; actBtn.hidden = !label;
  if (label) { actBtn.textContent = label; actBtn.style.fontSize = label.length > 7 ? '14px' : ''; }
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
    const i = await ui.choose(fmt(U.welcomeBack, { name: short }), [U.practiceAgain, U.hearVerse, U.goodbye]);
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
    again ? null : h('p', { class: 'learned' }, fmt(U.learnedMove, { move: C.MOVES[P.move].name })),
  ], [U.continue]);
  ui.closePanel();
  if (again) { save(); return; }
  S.done[k] = true; save(); updateHud();
  A3.setShrineDone(k, true);
  const c = center(k);
  bloom(c.x, c.y, 11 * TILE, 3);
  if (doneCount() === 6) await ui.say(U.sixDone);
}

async function readVerse(i) {
  const v = C.VERSES[i];
  await ui.say([v.text.replace(/\n/g, ' '), `(${v.source})`]);
  if (!S.verses[i]) { S.verses[i] = true; ui.toast(U.verseAdded); }
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
let dusk = 0, duskTarget = 0, followers = [], visitT = 8;
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
  clearFollowers();
  const f = fwd();
  followers = C.CREATURES.filter(c => S.spirits[c.id]).map((cr, i, all) => {
    const side = (i - (all.length - 1) / 2) * 30;             // a little row behind you
    const fl = { cr, i, x: player.x - f.x * 40 - f.y * side, y: player.y - f.y * 40 + f.x * side, obj: MODELS.makeSpirit(cr.id), visit: 0 };
    scene.add(fl.obj);
    if (!resume) paint(fl.x, fl.y, 50, .5);
    return fl;
  });
}
function clearFollowers() { for (const f of followers) scene.remove(f.obj); followers = []; }
function stopProcession() { procession = false; clearFollowers(); gathered.clear(); trail.length = 0; }
function updateProcession(dt, t) {
  dusk += (duskTarget - dusk) * Math.min(1, dt * .35);
  if (!procession || !followers.length) return;
  const head = trail[0];
  if (!head || Math.hypot(player.x - head.x, player.y - head.y) > 5) { trail.unshift({ x: player.x, y: player.y }); if (trail.length > 260) trail.pop(); }
  // Now and then one of them drifts up beside you, into the edge of your view, then falls back.
  if ((visitT -= dt) < 0) { visitT = 11 + Math.random() * 8; const v = followers[Math.floor(Math.random() * followers.length)]; v.visit = 5; v.side = Math.random() < .5 ? -1 : 1; }
  const f = fwd();
  followers.forEach((fl, i) => {              // each walks where the one ahead of it walked a moment ago
    let tx, ty;
    if (fl.visit > 0 && mode === 'play') {
      fl.visit -= dt;
      tx = player.x + f.x * 58 - f.y * fl.side * 40; ty = player.y + f.y * 58 + f.x * fl.side * 40;
      if (!canStand(tx, ty)) fl.visit = 0;
    }
    if (!(fl.visit > 0)) {
      const n = 8 * (i + 1), off = (i % 2 ? 1 : -1) * 6;
      const p = n < trail.length ? trail[n] : { x: player.x - f.x * 36 * (i + 1), y: player.y - f.y * 36 * (i + 1) };
      tx = p.x + off; ty = p.y + 4;
    }
    if (Math.hypot(player.x - fl.x, player.y - fl.y) > 190) { fl.x = player.x - f.x * 40 * (i + 1); fl.y = player.y - f.y * 40 * (i + 1); }   // never lost far behind
    const e = Math.min(1, dt * (fl.visit > 0 ? 1.4 : 3));
    fl.x += (tx - fl.x) * e; fl.y += (ty - fl.y) * e;
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
      const g = guardPos(k); focus = { x: g.x, y: g.y, h: 1.2 };
      await ui.say([`${C.PILLARS[k].guardian.split(',')[0]}: ${FT.guardianLines[k]}`]);
    }
    S.finaleGathered = true; save();
    ui.toast(FT.plantHint, 4000);
  } finally { gathering = false; speaking = null; focus = null; }
}

async function plantLantern() {
  if (!procession || ceremony) return;
  ceremony = true; setAct(null);
  try {
    const s = summit(), move = (S.finale && S.finale.commitment) || '';
    const f = fwd();
    S.lantern = { x: Math.round(player.x + f.x * 88), y: Math.round(player.y + f.y * 88), text: move };
    if (!W.walkable(map, S.lantern.x, S.lantern.y)) S.lantern = { x: Math.round((player.x + s.x) / 2), y: Math.round((player.y + s.y) / 2 + 12), text: move };
    lanternT = performance.now(); save(); showLantern();
    focus = { x: S.lantern.x, y: S.lantern.y, h: .9 };
    audio.chime();
    await ui.say([move ? FIN.fmt(FT.plantLine, { move: FIN.showMove(move) }) : FT.plantLineNoMove, FT.plantGlow]);
    focus = null;
    liftTarget = 7;                                            // rise gently to watch the whole island fill with colour
    look.pitch = Math.max(look.pitch, -.2);
    [262, 330, 392, 523, 659, 784].forEach((f, i) => audio.bell(f, .07, .4 + i * .35));
    await new Promise(res => bloom(s.x, s.y, SIZE, 6, res));
    mctx.globalAlpha = 1; mctx.fillStyle = '#fff'; mctx.fillRect(0, 0, mask.width, mask.height); maskDirty = texDirty = true;
    S.ended = true; S.finaleStage = 'done'; save(); saveMask();
    audio.chime();
    await ui.say(C.TREE.ending.slice(3));
    await endingCard();
  } finally {
    liftTarget = 0; duskTarget = 0; focus = null; stopProcession(); ceremony = false; save();
  }
}

async function endingCard() {
  const p = ui.openPanel('exercise'), move = S.finale && S.finale.commitment;
  const i = await ui.card(p, FT.endTitle, [
    ui.verse(C.TREE.ending_rumi, C.TREE.ending_rumi_source),
    h('p', {}, C.TREE.outro),
    move ? h('p', { class: 'hl' }, FIN.fmt(FT.endToward, { move: FIN.showMove(move) })) : null,
    S.values.length ? h('p', {}, FIN.fmt(FT.endLanterns, { values: S.values.map(C.valueName).join(FT.listSep) })) : null,
    S.steps.length ? h('p', {}, FIN.fmt(FT.endSteps, { steps: S.steps.map(C.stepText).join(FT.listSep) })) : null,
    h('p', { class: 'fine' }, FT.endFine),
  ], [FT.keepWandering, FT.shareGame, ...(C.FEEDBACK.formId ? [FT.leaveFeedback] : [])]);
  ui.closePanel();
  if (i === 1) share();
  if (i === 2) openFeedback();
}

// The planted lantern: a paper lantern on a pole that warms up, with your toward move written above it.
const SERIF = '"Iowan Old Style", Palatino, Georgia, serif';
function showLantern() {
  if (lanternObj) { scene.remove(lanternObj); lanternObj = null; }
  if (!S.lantern) return;
  const L = S.lantern, x = tiles(L.x), z = tiles(L.y), y = island.groundY(x, z);
  const grp = new THREE.Group(); grp.position.set(x, y, z);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.025, .03, 1.2, 5), new THREE.MeshBasicMaterial({ color: 0x3b2d22 }));
  pole.position.y = .6;
  const bar = new THREE.Mesh(new THREE.BoxGeometry(.4, .03, .03), pole.material); bar.position.set(.18, 1.18, 0);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(.16, 12, 8), new THREE.MeshBasicMaterial({ color: 0xa09682 }));
  lamp.scale.y = 1.25; lamp.position.set(.34, .92, 0);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.16, .012, 4, 16), pole.material); ring.rotation.x = Math.PI / 2; ring.position.copy(lamp.position);
  const glow = new THREE.Sprite(additive(radialTex([[0, 'rgba(255,210,110,.9)'], [.4, 'rgba(255,200,100,.35)'], [1, 'rgba(255,200,100,0)']])));
  glow.position.copy(lamp.position); glow.scale.set(2.2, 2.2, 1);
  grp.add(pole, bar, lamp, ring, glow);
  if (L.text) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 160;
    const g = c.getContext('2d');
    g.font = `italic 34px ${SERIF}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const words = FIN.showMove(L.text).split(/\s+/), lines = []; let cur = '';
    for (const w of words) { const tt = cur ? cur + ' ' + w : w; if (cur && g.measureText(tt).width > 460) { lines.push(cur); cur = w; } else cur = tt; }
    lines.push(cur);
    lines.slice(0, 3).forEach((l, i) => {
      const ly = 80 + (i - (Math.min(3, lines.length) - 1) / 2) * 42;
      g.lineWidth = 8; g.strokeStyle = 'rgba(247,242,231,.9)'; g.lineJoin = 'round'; g.strokeText(l, 256, ly);
      g.fillStyle = '#1d1b19'; g.fillText(l, 256, ly);
    });
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, fog: false }));
    label.position.set(.2, 1.62, 0); label.scale.set(1.6, .5, 1);
    grp.add(label); grp.userData.label = label;
  }
  grp.userData.lamp = lamp; grp.userData.glow = glow;
  lanternObj = grp; scene.add(grp);
}
function updateLantern(t) {
  const glow = lanternT == null ? 1 : Math.min(1, (performance.now() - lanternT) / 2500);
  const { lamp, glow: gl, label } = lanternObj.userData;
  lamp.material.color.setRGB((160 + 86 * glow) / 255, (150 + 44 * glow) / 255, (130 - 56 * glow) / 255);
  gl.material.opacity = glow * (.85 + Math.sin(t * 2) * .12);
  if (label) label.material.opacity = Math.max(0, glow * 2 - 1);
}

// ---------- encounters: a spirit rises out of the tall grass in front of you ----------
async function riseSpirit(cr) {
  const f = fwd();
  let x = player.x + f.x * 70, y = player.y + f.y * 70;
  if (!W.walkable(map, x, y)) { x = player.x + f.x * 36; y = player.y + f.y * 36; }
  const obj = MODELS.makeSpirit(cr.id), X = tiles(x), Z = tiles(y), gy = island.groundY(X, Z);
  scene.add(obj);
  rising = { obj, calm: .1 };
  const t0 = performance.now(), dur = 1500;
  focus = { x, y, h: gy + .75 - island.groundY(tiles(player.x), tiles(player.y)) };
  audio.soft();
  await new Promise(res => {
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / dur), e = 1 - (1 - k) ** 3;
      obj.position.set(X, gy - .7 + e * 1.15, Z);
      obj.rotation.y = Math.atan2(tiles(player.x) - X, tiles(player.y) - Z);
      if (k < 1) requestAnimationFrame(step); else res();
    };
    step();
  });
  await ui.wait(250);
  focus = null;
  return obj;
}
async function encounter() {
  if (rising) return;
  const unmet = C.CREATURES.filter(c => !S.spirits[c.id]);
  const cr = unmet.length && Math.random() < .75 ? unmet[Math.floor(Math.random() * unmet.length)] : C.CREATURES[Math.floor(Math.random() * C.CREATURES.length)];
  const known = !!S.spirits[cr.id];
  let obj;
  try { obj = await riseSpirit(cr); } finally { if (!obj) rising = null; }
  let struggle = known ? 40 : 60, shown = struggle;
  const p = ui.openPanel('encounter');
  const cvs = h('canvas', { class: 'stage' }), meter = h('div', { class: 'meter' }, h('i')), msg = h('p', { class: 'msg' }), moves = h('div', { class: 'moves' });
  p.append(h('h2', { class: 'title' }, cr.name), cvs, h('p', { class: 'thought' }, cr.thought), h('label', { class: 'mlabel' }, U.struggle), meter, msg, moves);
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
  const SOFTENS = U.softens, TIP = U.tip;
  // Reserve room for the longest message this encounter can show, so the move buttons never jump between turns.
  msg.style.minHeight = Math.max(...[...learned.map(id => C.MOVES[id].text + SOFTENS), ...C.STRUGGLE_MOVES.map(m => m.text + (S.tip ? '' : TIP))]
    .map(t => (msg.textContent = t, msg.offsetHeight))) + 'px';
  msg.textContent = fmt(known ? U.metAgain : U.wild, { name: cr.name });

  const outcome = await new Promise(res => {
    const turn = () => {
      moves.innerHTML = '';
      const tempt = C.STRUGGLE_MOVES[Math.floor(Math.random() * C.STRUGGLE_MOVES.length)];
      const opts = learned.map(id => ({ label: C.MOVES[id].name, act: () => useMove(id) }));
      opts.splice(Math.floor(Math.random() * (opts.length + 1)), 0, { label: tempt.name, act: () => fight(tempt), tempt: true });
      opts.forEach(o => moves.append(h('button', { onclick: o.act, 'data-move': o.tempt ? 'struggle' : 'skill' }, o.label)));
      moves.append(h('button', { class: 'quiet', onclick: () => res('left') }, U.walkOn));
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
    msg.textContent = fmt(U.friend, { name: cr.name });
    const first = !S.spirits[cr.id];
    S.spirits[cr.id] = true; save();
    if (first) msg.after(h('p', { class: 'lore' }, cr.lore), h('p', { class: 'fine' }, U.addedJournal));
    paint(player.x, player.y, 220, .8);
    rising.calm = 1;
  } else if (outcome === 'tired') {
    msg.textContent = fmt(U.tired, { name: cr.name });
  } else {
    msg.textContent = fmt(U.left, { name: cr.name });
  }
  await new Promise(res => moves.append(h('button', { class: 'primary', onclick: ui.firstTap(res) }, U.continue)));
  cancelAnimationFrame(raf);
  ui.closePanel();
  sinkSpirit(obj, outcome === 'friend');
}
// After the meeting the spirit settles back into the grass (a befriended one glows its colour as it goes).
function sinkSpirit(obj, friend) {
  const t0 = performance.now(), y0 = obj.position.y;
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / 1400);
    obj.position.y = y0 - k * k * 1.3;
    if (rising) rising.calm = friend ? 1 : .1;
    if (k < 1) requestAnimationFrame(step); else { scene.remove(obj); rising = null; }
  };
  step();
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
  const tabs = ['pillars', 'spirits', 'verses', 'you'];
  const bar = h('nav', { class: 'tabs' }, tabs.map(id => h('button', { class: id === tab ? 'on' : '', 'data-tab': id, onclick: () => { ui.closePanel(); openJournal(id); } }, U.tabs[id])));
  p.append(h('div', { class: 'jhead' }, h('h2', {}, U.journal), h('button', { class: 'close', onclick: () => ui.closePanel() }, U.close)), bar, body);

  if (tab === 'pillars') {
    body.append(h('p', { class: 'fine' }, U.pillarsIntro));
    for (const k of C.PILLAR_ORDER) {
      const P = C.PILLARS[k];
      body.append(S.done[k]
        ? h('section', { class: 'entry', style: `border-color:${P.color}` }, h('h3', {}, P.name), h('p', { class: 'region' }, P.region), h('p', {}, P.plain), ui.learnMore(P.more), ui.verse(P.rumi, P.rumiSource))
        : h('section', { class: 'entry dim' }, h('h3', {}, P.name), h('p', {}, fmt(U.notLearned, { guardian: P.guardian, short: P.guardian.split(',')[0], region: P.region }))));
    }
  } else if (tab === 'spirits') {
    const grid = h('div', { class: 'grid' });
    for (const cr of C.CREATURES) {
      const met = !!S.spirits[cr.id], c = h('canvas', { width: '160', height: '130' });
      const g = c.getContext('2d'); g.scale(2, 2);
      if (met) drawCreature(g, cr, 40, 58, 1.6, 1, 1);
      else { g.globalAlpha = .25; drawCreature(g, cr, 40, 58, 1.6, 1, 0); }
      grid.append(h('div', { class: 'spirit' + (met ? '' : ' dim') }, c, h('b', {}, met ? cr.name : U.unknownSpirit), h('small', {}, met ? cr.lore : U.unmetLore)));
    }
    body.append(h('p', { class: 'fine' }, fmt(U.spiritsCount, { n: Object.keys(S.spirits).length, total: C.CREATURES.length })), grid);
  } else if (tab === 'verses') {
    let any = false;
    for (const k of C.PILLAR_ORDER) if (S.done[k]) { any = true; body.append(ui.verse(C.PILLARS[k].rumi, C.PILLARS[k].rumiSource)); }
    C.VERSES.forEach((v, i) => { if (S.verses[i]) { any = true; body.append(ui.verse(v.text, v.source)); } });
    if (!any) body.append(h('p', { class: 'fine' }, U.noVerses));
    body.append(h('p', { class: 'fine' }, U.versesNote));
  } else {
    const chars = h('div', { class: 'chips' }, C.CHARACTERS.map(ch => h('button', { class: 'chip' + (S.char === ch.id ? ' on' : ''), onclick: () => { S.char = ch.id; save(); setCharacter(ch.id); ui.closePanel(); openJournal('you'); } }, ch.name)));
    body.append(h('h3', {}, U.traveller), chars);
    body.append(h('h3', {}, U.language), langSwitch(true));
    const rm = h('button', { class: 'chip', 'aria-pressed': String(reduceMotion), 'data-motion': '', onclick: () => {
      reduceMotion = !reduceMotion; rm.setAttribute('aria-pressed', String(reduceMotion));
      try { localStorage.setItem(MOTION_KEY, reduceMotion ? '1' : '0'); } catch (e) {}
    } }, U.reduceMotion);
    body.append(h('h3', {}, U.comfort), h('div', { class: 'chips' }, rm));
    body.append(h('h3', {}, U.yourLanterns), h('p', {}, S.values.length ? S.values.map(C.valueName).join(U.listSep) : U.noLanterns));
    if (S.valueNote) body.append(h('p', { class: 'note' }, fmt(U.quote, { text: S.valueNote })));
    body.append(h('h3', {}, U.yourSteps), h('p', {}, S.steps.length ? S.steps.map(C.stepText).join(U.listSep) : U.noSteps));
    const F = S.finale;
    if (F) {
      const tags = (list, cls) => h('div', { class: 'tags' + (cls ? ' ' + cls : '') }, list.map(m => h('span', {}, FIN.showMove(m))));
      body.append(h('h3', {}, FT.jTitle),
        F.commitment ? h('div', { class: 'hl' }, h('small', {}, FT.jCommit), h('b', {}, FIN.showMove(F.commitment))) : null,
        h('h4', {}, FT.jToward), tags(F.toward),
        h('h4', {}, FT.jAway), tags(F.away, 'away'));
      if (F.situation) body.append(h('h4', {}, FT.jSituation), h('p', { class: 'note' }, fmt(U.quote, { text: F.situation })), h('p', { class: 'fine' }, FT.jPrivate));
      body.append(h('p', { class: 'fine' }, FT.jRevisit));
    }
    body.append(h('div', { class: 'btns' },
      h('button', { class: 'primary', onclick: share }, U.share),
      C.FEEDBACK.formId ? h('button', { onclick: openFeedback }, U.feedback) : null,
      h('button', { onclick: async () => {
        if (await ui.choose(U.startOverConfirm, [U.startOverYes, U.startOverNo])) return;
        try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(MASK_KEY); } catch (e) {}
        location.reload();
      } }, U.startOver)));
    body.append(h('p', { class: 'fine' }, C.DISCLAIMER + ' ' + U.staysHere));
  }
}

// ---------- feedback ----------
// Sent anonymously to a Google Form. Only the typed message plus progress counts and
// device type are sent, never anything written elsewhere in the game.
async function openFeedback() {
  ui.closePanel();
  const p = ui.openPanel('exercise');
  const text = h('textarea', { id: 'feedback-text', rows: '6', maxlength: '1500', placeholder: U.fbPlaceholder });
  const i = await ui.card(p, U.feedback, [
    h('p', {}, U.fbIntro),
    text,
    h('p', { class: 'fine' }, U.fbAnon),
  ], [U.send, U.cancel]);
  ui.closePanel();
  if (i !== 0 || !text.value.trim()) return;
  const device = /iPhone|iPad/.test(navigator.userAgent) ? 'iPhone/iPad' : /Android/.test(navigator.userAgent) ? 'Android' : 'Computer';
  const context = `3D · Pillars ${doneCount()}/6 · Spirits ${Object.keys(S.spirits).length}/${C.CREATURES.length} · Finished ${S.ended ? 'yes' : 'no'} · ${device} · ${lang}`;
  const F = C.FEEDBACK;
  try {
    // no-cors: Google doesn't allow reading the reply, so a resolved fetch means "sent".
    await fetch(`https://docs.google.com/forms/d/e/${F.formId}/formResponse`, {
      method: 'POST', mode: 'no-cors',
      body: new URLSearchParams({ [`entry.${F.textEntry}`]: text.value.trim(), [`entry.${F.contextEntry}`]: context }),
    });
    ui.toast(U.fbThanks);
  } catch (e) {
    ui.toast(U.fbFail, 4000);
  }
}

async function share() {
  const url = new URL(location.href); url.hash = ''; url.searchParams.delete('lang');   // friends get their own language
  const data = { title: C.TITLE, text: U.shareText, url: url.href };
  try {
    await navigator.share(data);
  } catch (e) {
    // Web Share can be missing or blocked (e.g. inside an embedded viewer); copy the link instead.
    try { await navigator.clipboard.writeText(data.url); ui.toast(U.linkCopied); }
    catch (e2) { ui.toast(U.copyManually); }
  }
}

// ---------- language ----------
// EN · FI · PT. Switching saves the journey and reloads the page in the new language.
function langSwitch(full) {
  return h('div', { class: 'langs' + (full ? ' full' : ''), role: 'group', 'aria-label': U.language },
    Object.entries(LANGS).map(([code, name]) => h('button', {
      class: code === lang ? 'on' : '', lang: code, 'data-lang': code, 'aria-pressed': String(code === lang), 'aria-label': name, title: name,
      onclick: () => switchLang(code),
    }, full ? name : code.toUpperCase())));
}
function switchLang(code) {
  if (code === lang) return;
  if (mode === 'play') { S.pos = { x: player.x, y: player.y }; S.yaw = look.yaw; }
  save(); saveMask();
  setLang(code);
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
  const status = h('p', { class: 'fine' }, U.loading);
  let starting = false;                  // a quick double tap must not start the game twice
  const go = async isNew => {
    if (starting) return;
    starting = true;
    if (isNew && hasSave && await ui.choose(U.newJourneyConfirm, [U.newJourneyYes, U.cancel])) { starting = false; return; }
    begin(isNew);
  };
  const btns = h('div', { class: 'btns', hidden: '' },
    hasSave ? h('button', { class: 'primary', 'data-go': 'continue', onclick: () => go(false) }, U.continue) : null,
    h('button', { class: hasSave ? '' : 'primary', 'data-go': 'new', onclick: () => go(true) }, hasSave ? U.newJourney : U.begin));
  p.append(h('div', { class: 'titlecard' }, langSwitch(false), h('div', { class: 'seal' }, '心'), h('h1', {}, C.TITLE), h('p', { class: 'sub' }, C.SUBTITLE), status, btns,
           h('p', { class: 'fine foot' }, C.DISCLAIMER, h('br'), U.titleFoot),
           h('a', { class: 'verlink', href: '../' }, U.version2d)));
  return { ready: () => { status.remove(); btns.hidden = false; } };
}

async function begin(isNew) {
  audio.start();
  A3.init(map);
  if (isNew) {
    S = fresh();
    try { localStorage.removeItem(MASK_KEY); } catch (e) {}
    mctx.clearRect(0, 0, mask.width, mask.height); texDirty = true;
    if (lanternObj) { scene.remove(lanternObj); lanternObj = null; }
  }
  ui.closePanel();
  if (!S.char) {
    const p = ui.openPanel('select');
    p.append(h('h2', {}, U.whoWalks), h('p', { class: 'fine' }, U.changeLater));
    const grid = h('div', { class: 'grid' });
    p.append(grid);                      // previews only animate once their canvas is on the page
    await new Promise(res => {
      const pick = ui.firstTap(id => { S.char = id; res(); });
      for (const ch of C.CHARACTERS) {
        const c = h('canvas', { width: '192', height: '192' });
        grid.append(h('button', { class: 'charcard', 'data-char': ch.id, onclick: () => pick(ch.id) }, c, h('b', {}, ch.name)));
        drawCharPreview(c, ch.id);
      }
    });
    ui.closePanel();
    S.pos = null; S.yaw = 0;
  }
  const pos = S.pos || START3D;
  player.x = pos.x; player.y = pos.y; player.vx = player.vy = 0;
  look.yaw = player.yaw = S.yaw || 0; look.pitch = player.pitch = S.pos ? -.08 : .1;
  player.camY = island.groundY(tiles(player.x), tiles(player.y)) + (EYE[S.char] || 1);
  setCharacter(S.char);
  stopProcession(); dusk = duskTarget = 0; liftTarget = lift = 0; lanternT = null; focus = null;
  C.PILLAR_ORDER.forEach(k => A3.setShrineDone(k, !!S.done[k]));
  showLantern();
  mode = 'play'; $('#hud').hidden = false; updateHud(); save();
  guardBack();
  if (isNew || !S.seenIntro) { S.seenIntro = true; await ui.say(C.INTRO); save(); }
  if (S.finaleStage === 'procession') { startProcession(true); ui.toast(FT.summitToast, 4000); }
  else if (!S.controlsShown) {
    S.controlsShown = true; save();
    ui.toast(matchMedia('(pointer: coarse)').matches ? U.controlsTouch : U.controlsKeys, 5000);
  }
}

let backArmed = false;
function guardBack() { if (!history.state?.game) history.pushState({ game: 1 }, ''); }

// ---------- boot ----------
async function boot() {
  document.title = C.TITLE + ' 3D';
  $('#pills').setAttribute('aria-label', U.aria.pills);
  $('#soundBtn').setAttribute('aria-label', U.aria.sound);
  $('#journalBtn').setAttribute('aria-label', U.aria.journal);
  resize();
  requestAnimationFrame(frame);
  const t = title();
  await new Promise(r => setTimeout(r, 50));          // let the title paint first
  map = W.buildMap();
  island = new Island(map).build(scene);
  makeFigures();
  try {
    const data = localStorage.getItem(MASK_KEY);
    if (data) { const img = new Image(); img.onload = () => { mctx.drawImage(img, 0, 0); texDirty = true; }; img.src = data; }
  } catch (e) {}
  renderer.compile(scene, camera);
  t.ready();
  // Offline support when served from a website (not from a file or an embedded viewer).
  if ('serviceWorker' in navigator && /^https:|^http:\/\/localhost/.test(location.href))
    navigator.serviceWorker.register('sw.js').catch(() => {});
  // Android back gesture: the first press only warns, so the game isn't closed by accident.
  addEventListener('popstate', () => {
    if (backArmed) { save(); saveMask(); history.back(); return; }
    backArmed = true; ui.toast(U.backAgain, 2500); history.pushState({ game: 1 }, '');
    setTimeout(() => { backArmed = false; }, 2500);
  });
  addEventListener('pagehide', () => { if (mode === 'play') { S.pos = { x: player.x, y: player.y }; S.yaw = look.yaw; save(); saveMask(); } });
  if (location.hash === '#debug') window.GAME = {
    get S() { return S; }, player, look, audio, get map() { return map; }, meetGuardian, encounter, greatTree, openJournal, W, center,
    get followers() { return followers; }, get dusk() { return dusk; }, get near() { return near && near.label; }, get nearId() { return near && near.id; },
    lang, i18n: I18N, C, FT, EXT: EX.TEXT, renderer, scene, camera, island, perf, guardians,
    get reduceMotion() { return reduceMotion; },
    // turn to face a world point (2D pixels) at once
    face(x, y) { look.yaw = player.yaw = Math.atan2(x - player.x, -(y - player.y)); look.pitch = player.pitch = -.08; },
    look(yaw, pitch = -.08) { look.yaw = player.yaw = yaw; look.pitch = player.pitch = pitch; },
    paintAll() { mctx.globalAlpha = 1; mctx.fillStyle = '#fff'; mctx.fillRect(0, 0, mask.width, mask.height); texDirty = true; },
    setDusk(v) { dusk = duskTarget = v; },
  };
}
boot();
