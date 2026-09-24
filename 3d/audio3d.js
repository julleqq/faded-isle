// Spatial ambience for the first-person island. Everything is generated
// (noise, filters, oscillators) and plays through the shared AudioContext and
// master gain of ../audio.js, so the mute button covers it too.
//
// Coordinates are tiles: x = column, z = row (1 unit = 1 tile, 80×80 world).
// Only the nearest few places sound at once (MAX_VOICES panners); each one is
// built when it becomes audible and torn down after it fades out.
//
//   init(map)                  after audio.start(), from a tap; map = buildMap()
//   update(x, z, yaw)          every frame; yaw 0 looks toward -Z (three.js rotation.y)
//   step(surface)              'grass' | 'sand' | 'path' | 'bridge' | 'stone' | 'water' | 'tall'
//   setDusk(v)                 0 = day … 1 = dusk (crickets, fewer birds)
//   setShrineDone(pillar, on)  shrine hum becomes a chord in that pillar's key
//   pause(on)                  duck the ambience under a full-screen panel

import { context, isMuted } from '../audio.js';
import { T, N, SHRINES } from '../world.js';

// Layout copied from world.js (not exported there). Keep in sync.
const TREE = { x: 40, z: 40 };
const LAKE = { x: 14, z: 45, r: 6.5 };
const POND = { x: 67, z: 50, r: 5 };
const RIVER = [[47, 3], [51, 12], [56, 18], [63, 23], [70, 27], [79, 30]];
const MOUNTAIN = { x: 41, z: 11 };
const FOREST = { x: 21, z: 20 };        // Breathing Grove (bamboo)
const MAPLES = { x: 58, z: 24 };        // maples by the stream (defusion)

const MAX_VOICES = 6;       // panners alive at once, fading ones included
const TICK = 0.1;           // s between source updates (10 Hz)
const TURN = 1 / 30;        // s between direction updates while turning
const AMB = 0.9;            // ambience bus level
const DUCK = 0.2;           // bus level while a panel is open

// Each pillar's key, kept inside D major pentatonic like the music.
const KEYS = {
  present:    [293.66, 440.0, 587.33],
  defusion:   [329.63, 493.88, 659.25],
  acceptance: [440.0, 659.25, 880.0],
  selfctx:    [369.99, 493.88, 739.99],
  values:     [392.0, 587.33, 783.99],
  action:     [587.33, 880.0, 1174.66],
};

let ac = null, bus = null, white = null, brown = null, map = null;
let seaNear = null, tallNear = null;           // nearest SEA / TALL tile per tile
let px = 40, pz = 45, yaw = 0, lastTick = -1, lastTurn = -1, lastYaw = 0;
let dusk = 0, paused = false, lastStep = 0, built = 0;
let panModel = 'equalpower';
const done = {};
let dbg = null;                                 // debug analysers (preview only)

// ---------- small helpers ----------
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rand = (a, b) => a + Math.random() * (b - a);

function noiseBuffer(seconds, isBrown) {
  // Seamless: generate a little extra and cross-fade the tail into the head.
  const sr = ac.sampleRate, len = Math.floor(sr * seconds), fade = Math.floor(sr * 0.25);
  const tmp = new Float32Array(len + fade);
  let last = 0, mean = 0;
  for (let i = 0; i < tmp.length; i++) {
    const w = Math.random() * 2 - 1;
    if (isBrown) { last = (last + 0.02 * w) / 1.02; tmp[i] = last * 3.5; } else tmp[i] = w;
    mean += tmp[i];
  }
  mean /= tmp.length;
  const buf = ac.createBuffer(1, len, sr), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = tmp[i] - mean;
  for (let i = 0; i < fade; i++) {
    const a = i / fade;
    d[i] = (tmp[i] - mean) * Math.sqrt(a) + (tmp[len + i] - mean) * Math.sqrt(1 - a);
  }
  return buf;
}

// Nearest tile of a kind for every tile (seed-propagating BFS, 8-neighbour).
function nearestField(g, kind) {
  const near = new Int32Array(N * N).fill(-1), d2 = new Float32Array(N * N).fill(1e9);
  const q = new Int32Array(N * N * 8); let h = 0, t = 0;
  for (let i = 0; i < N * N; i++) if (g[i] === kind) { near[i] = i; d2[i] = 0; q[t++] = i; }
  while (h < t) {
    const i = q[h++], s = near[i], sx = s % N, sz = (s / N) | 0, x = i % N, z = (i / N) | 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, nz = z + dz;
      if ((!dx && !dz) || nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
      const j = nz * N + nx, e = (nx - sx) ** 2 + (nz - sz) ** 2;
      if (e < d2[j]) { d2[j] = e; near[j] = s; if (t < q.length) q[t++] = j; }
    }
  }
  return near;
}

function setParam(p, v, t, tc) { if (p) p.setTargetAtTime(v, t, tc); }

// ---------- node builders (only used while building a voice or an event) ----------
function noise(s, buf) {
  const n = ac.createBufferSource(); n.buffer = buf; n.loop = true;
  n.start(ac.currentTime, Math.random() * buf.duration);
  s.nodes.push(n); return n;
}
function filt(type, f, Q = 0.7) { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = Q; return b; }
function gain(v) { const g = ac.createGain(); g.gain.value = v; return g; }
function osc(s, type, f, detune = 0) {
  const o = ac.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune;
  o.start(); s.nodes.push(o); return o;
}
// Slow sine wobble added to an AudioParam.
function lfo(s, param, rate, amount) {
  const o = osc(s, 'sine', rate), g = gain(amount); o.connect(g).connect(param);
}
// A noise layer: buffer → filters → gain (optionally swelling) → voice input.
function layer(s, buf, filters, level, swells) {
  let node = noise(s, buf);
  for (const f of filters) { node.connect(f); node = f; }
  const g = gain(level); node.connect(g).connect(s.in);
  if (swells) for (const [rate, amt] of swells) lfo(s, g.gain, rate, amt);
  return g;
}

// One-shot sounds routed into a voice (so they are placed with it).
function bellAt(dest, freq, vol, t) {
  for (const [mult, v] of [[1, 1], [2.76, 0.3], [5.4, 0.08]]) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.value = freq * mult;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol * v, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3 / mult + 0.4);
    o.connect(g).connect(dest); o.start(t); o.stop(t + 3.6);
  }
}
function chirp(dest, vol) {
  // A small bird: 2–5 quick upward (or falling) sine sweeps.
  let t = ac.currentTime + 0.02;
  const n = 2 + Math.floor(Math.random() * 4), base = rand(2600, 3600), up = Math.random() < 0.7;
  for (let i = 0; i < n; i++) {
    const o = ac.createOscillator(), g = ac.createGain(), d = rand(0.05, 0.1);
    const f0 = base * rand(0.95, 1.08);
    o.frequency.setValueAtTime(up ? f0 : f0 * 1.4, t);
    o.frequency.exponentialRampToValueAtTime(up ? f0 * 1.45 : f0, t + d);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(dest); o.start(t); o.stop(t + d + 0.02);
    t += d + rand(0.03, 0.09);
  }
}
function knock(dest, vol) {
  // Hollow bamboo stems touching in the wind.
  let t = ac.currentTime + 0.02;
  const n = 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const f = rand(520, 900), o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain();
    o.frequency.value = f; o2.type = 'triangle'; o2.frequency.value = f * 2.3;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    const g2 = gain(0.3);
    o.connect(g); o2.connect(g2).connect(g); g.connect(dest);
    o.start(t); o2.start(t); o.stop(t + 0.2); o2.stop(t + 0.2);
    t += rand(0.12, 0.35);
  }
}
function croak(dest, vol) {
  // A frog: a couple of buzzy pulses through a throaty band-pass.
  let t = ac.currentTime + 0.02;
  const n = 2 + Math.floor(Math.random() * 2), f = rand(140, 200);
  const bp = filt('bandpass', rand(600, 800), 3), g = ac.createGain();
  g.gain.value = 0; bp.connect(g).connect(dest);
  const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(bp);
  o.start(t);
  for (let i = 0; i < n; i++) {
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.02);
    o.frequency.setValueAtTime(f * 1.1, t); o.frequency.linearRampToValueAtTime(f * 0.9, t + 0.12);
    g.gain.linearRampToValueAtTime(0, t + 0.13);
    t += 0.18;
  }
  o.stop(t + 0.05);
}

// ---------- the places ----------
// pos(s) sets s.ex/s.ez (emitter, tiles) and s.d (distance past the source's edge).
function nearCircle(s, cx, cz, r) {
  const dx = px - cx, dz = pz - cz, d = Math.hypot(dx, dz);
  s.d = Math.max(0, d - r);
  if (d > r && d > 1e-3) { s.ex = cx + dx * r / d; s.ez = cz + dz * r / d; }
  else if (d > 1e-3) { s.ex = px - dx * 0.5 / d; s.ez = pz - dz * 0.5 / d; }  // inside: toward the centre
  else { s.ex = px; s.ez = pz - 0.5; }
}
function nearTile(s, field) {
  const tx = clamp(Math.floor(px), 0, N - 1), tz = clamp(Math.floor(pz), 0, N - 1);
  const k = field ? field[tz * N + tx] : -1;
  if (k < 0) { s.d = 1e9; s.ex = px; s.ez = pz; return; }
  s.ex = (k % N) + 0.5; s.ez = ((k / N) | 0) + 0.5;
  s.d = Math.max(0, Math.hypot(px - s.ex, pz - s.ez) - 0.7);
}
function nearRiver(s) {
  let best = 1e9;
  for (let i = 0; i < RIVER.length - 1; i++) {
    const ax = RIVER[i][0], az = RIVER[i][1], bx = RIVER[i + 1][0], bz = RIVER[i + 1][1];
    const dx = bx - ax, dz = bz - az;
    const t = clamp(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz), 0, 1);
    const qx = ax + t * dx, qz = az + t * dz, d = Math.hypot(px - qx, pz - qz);
    if (d < best) { best = d; s.ex = qx; s.ez = qz; }
  }
  s.d = Math.max(0, best - 1.3);
}

const SOURCES = [
  { id: 'sea', vol: 0.16, range: 10,
    pos: s => nearTile(s, seaNear),
    build: s => {
      // Slow surf: brown-noise swell with foam hiss on each wave.
      layer(s, brown, [filt('lowpass', 800)], 0.6, [[0.13, 0.4], [0.071, 0.18]]);
      layer(s, white, [filt('bandpass', 1700, 0.5)], 0.06, [[0.13, 0.055]]);
    } },
  { id: 'river', vol: 0.14, range: 10,
    pos: nearRiver,
    build: s => {
      // Babble: band-passed noise whose centre wanders at a few unrelated rates.
      const b1 = filt('bandpass', 1400, 1.4), b2 = filt('bandpass', 3000, 3);
      layer(s, white, [b1], 0.9);
      lfo(s, b1.frequency, 3.3, 260); lfo(s, b1.frequency, 5.7, 180); lfo(s, b1.frequency, 0.41, 300);
      layer(s, white, [b2], 0.4, [[1.7, 0.15]]);
      lfo(s, b2.frequency, 7.1, 600); lfo(s, b2.frequency, 2.3, 420);
      layer(s, brown, [filt('lowpass', 600)], 0.5);
    } },
  { id: 'lake', vol: 0.09, range: 8,
    pos: s => nearCircle(s, LAKE.x, LAKE.z, LAKE.r),
    build: s => {
      layer(s, brown, [filt('lowpass', 420)], 0.6, [[0.35, 0.45], [0.21, 0.25]]);
      layer(s, white, [filt('bandpass', 1100, 2)], 0.05, [[0.35, 0.045]]);
    } },
  { id: 'pond', vol: 0.08, range: 8,
    pos: s => nearCircle(s, POND.x, POND.z, POND.r),
    build: s => {
      layer(s, brown, [filt('lowpass', 500)], 0.45, [[0.42, 0.35], [0.17, 0.15]]);
      layer(s, white, [filt('bandpass', 1300, 2)], 0.04, [[0.42, 0.035]]);
    },
    event: s => { croak(s.in, 0.5); return rand(3, 9) / (1 + dusk); } },
  { id: 'grove', vol: 0.11, range: 10,
    pos: s => nearCircle(s, FOREST.x, FOREST.z, 7),
    build: s => {
      // Wind combing the bamboo: bright rustle in gusts over a soft body.
      layer(s, white, [filt('highpass', 1800), filt('bandpass', 3600, 0.6)], 0.5, [[0.09, 0.35], [0.23, 0.14]]);
      layer(s, white, [filt('bandpass', 700, 0.8)], 0.22, [[0.09, 0.18]]);
    },
    event: s => {
      if (Math.random() < 0.55) { knock(s.in, 0.35); return rand(2, 6); }
      chirp(s.in, 0.18 * (1 - dusk * 0.7)); return rand(3, 9) * (1 + dusk * 2);
    } },
  { id: 'summit', vol: 0.11, range: 11,
    pos: s => nearCircle(s, MOUNTAIN.x, MOUNTAIN.z, 3),
    build: s => {
      // High, airy wind with a faint whistle that drifts in pitch.
      const bp = filt('bandpass', 950, 7);
      layer(s, white, [bp], 1.0, [[0.07, 0.55], [0.19, 0.2]]);
      lfo(s, bp.frequency, 0.05, 260); lfo(s, bp.frequency, 0.13, 90);
      layer(s, white, [filt('highpass', 4500)], 0.22, [[0.11, 0.18]]);
    } },
  { id: 'maples', vol: 0.07, range: 8,
    pos: s => nearCircle(s, MAPLES.x, MAPLES.z, 4),
    build: s => {
      layer(s, white, [filt('bandpass', 4200, 0.7)], 0.5, [[0.17, 0.35], [0.41, 0.15]]);
    },
    event: s => { chirp(s.in, 0.2 * (1 - dusk * 0.7)); return rand(5, 14) * (1 + dusk * 2); } },
  { id: 'crickets', vol: 0.05, range: 7,
    pos: s => nearTile(s, tallNear),
    gate: () => dusk,
    build: s => {
      // Two crickets: a high tone, trilled and gated into chirps.
      for (const [f, rate] of [[4300, 2.2], [4700, 1.6]]) {
        const c = osc(s, 'sine', f), gate = gain(0.5), trill = gain(0.5);
        const q = osc(s, 'square', rate), qa = gain(0.5); q.connect(qa).connect(gate.gain);
        const tr = osc(s, 'sine', rand(28, 34)), ta = gain(0.5); tr.connect(ta).connect(trill.gain);
        c.connect(gate).connect(trill).connect(s.in);
      }
    } },
  { id: 'tree', vol: 0.09, range: 10,
    pos: s => nearCircle(s, TREE.x, TREE.z, 2.5),
    build: s => {
      // Low warm hum (slow beating) under a soft leaf rustle.
      const hum = gain(0.5); hum.connect(s.in);
      lfo(s, hum.gain, 0.08, 0.2);
      for (const [f, v, dt] of [[146.83, 0.5, -3], [220, 0.35, 3], [293.66, 0.18, 0]]) {
        const g = gain(v); osc(s, 'sine', f, dt).connect(g).connect(hum);
      }
      layer(s, white, [filt('bandpass', 2800, 0.7)], 0.3, [[0.12, 0.2]]);
    },
    event: s => { chirp(s.in, 0.12 * (1 - dusk * 0.7)); return rand(8, 18) * (1 + dusk * 2); } },
];

for (const k in SHRINES) {
  const at = SHRINES[k], key = KEYS[k] || KEYS.present;
  SOURCES.push({
    id: 'shrine:' + k, pillar: k, vol: 0.06, range: 9,
    pos: s => nearCircle(s, at.x + 0.5, at.y + 0.5, 1),
    build: s => {
      // Quiet hum of the root; the chord fades in once the pillar is complete.
      const hum = gain(0.25); hum.connect(s.in); lfo(s, hum.gain, 0.15, 0.1);
      osc(s, 'sine', key[0]).connect(hum);
      s.chord = gain(done[k] ? 1 : 0); s.chord.connect(s.in);
      const breathe = gain(0.18); breathe.connect(s.chord); lfo(s, breathe.gain, 0.1, 0.08);
      for (const f of key) for (const dt of [-4, 4]) osc(s, 'sine', f, dt).connect(breathe);
    },
    event: s => { bellAt(s.in, key[Math.floor(Math.random() * 3)] * 2, 0.45, ac.currentTime + 0.02); return done[k] ? rand(3, 7) : rand(6, 13); },
  });
}

// ---------- voices ----------
function makePanner() {
  const p = ac.createPanner();
  p.panningModel = panModel; p.distanceModel = 'linear';
  p.rolloffFactor = 0; p.refDistance = 1; p.maxDistance = 10000;
  return p;
}

function build(s, now) {
  s.nodes.length = 0;
  s.in = gain(1);
  s.out = gain(0);
  s.pan = makePanner(); s.panG = gain(1); s.dry = gain(0);
  s.in.connect(s.out);
  s.out.connect(s.pan); s.pan.connect(s.panG).connect(bus);
  s.out.connect(s.dry).connect(bus);
  s.def.build(s);
  if (dbg) { s.an = ac.createAnalyser(); s.an.fftSize = 512; s.out.connect(s.an); }
  s.live = true; s.dying = 0; s.nextEvent = now + rand(0.5, 3);
  built++;
  place(s, now, 0.01);
}

function teardown(s) {
  for (const n of s.nodes) { try { n.stop(); } catch (e) {} try { n.disconnect(); } catch (e) {} }
  s.nodes.length = 0;
  for (const n of [s.in, s.out, s.pan, s.panG, s.dry, s.chord, s.an]) if (n) try { n.disconnect(); } catch (e) {}
  s.in = s.out = s.pan = s.panG = s.dry = s.chord = s.an = null;
  s.live = false; s.dying = 0; s.level = 0;
  built--;
}

// Put the emitter in the listener's frame (listener stays at the origin facing -Z).
function place(s, now, tc) {
  const dx = s.ex - px, dz = s.ez - pz;
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  let lx = dx * c - dz * sn, lz = dx * sn + dz * c;
  const len = Math.hypot(lx, lz);
  if (len < 0.3) { lx = 0; lz = -0.3; }
  const p = s.pan;
  if (p.positionX) { setParam(p.positionX, lx, now, tc); setParam(p.positionY, 0, now, tc); setParam(p.positionZ, lz, now, tc); }
  else p.setPosition(lx, 0, lz);
}

// ---------- tick (10 Hz) ----------
const state = [];            // { def, live, ... } per source, allocated once in init
const order = [];            // index scratch for ranking

function tick(now) {
  // 1. How loud would each place be here?
  for (let i = 0; i < state.length; i++) {
    const s = state[i], def = s.def;
    def.pos(s);
    const c = s.d >= def.range ? 0 : 1 - s.d / def.range;
    s.est = def.vol * c * c * (def.gate ? def.gate() : 1);
    s.rank = s.est * (s.live && !s.dying ? 1.3 : 1);   // hysteresis for voices already playing
  }
  // 2. The loudest few are wanted (insertion sort into order[], no allocation).
  for (let i = 0; i < state.length; i++) order[i] = i;
  for (let i = 1; i < order.length; i++) {
    const v = order[i], r = state[v].rank; let j = i - 1;
    while (j >= 0 && state[order[j]].rank < r) { order[j + 1] = order[j]; j--; }
    order[j + 1] = v;
  }
  for (let i = 0; i < order.length; i++) {
    const s = state[order[i]];
    s.want = i < MAX_VOICES && s.est > 0.0015;
  }
  // 3. Fade out the unwanted, tear down what has gone quiet.
  for (let i = 0; i < state.length; i++) {
    const s = state[i];
    if (!s.live) continue;
    if (s.dying) { if (now >= s.dying) teardown(s); else continue; }
    if (!s.live) continue;
    if (!s.want) { s.out.gain.setTargetAtTime(0, now, 0.2); s.dying = now + 1.0; s.level = 0; }
  }
  // 4. Start the wanted ones while there is room; set levels and places.
  for (let i = 0; i < order.length; i++) {
    const s = state[order[i]];
    if (!s.want) break;
    if (!s.live) { if (built >= MAX_VOICES) continue; build(s, now); }
    if (s.dying) continue;
    s.level = s.est;
    s.out.gain.setTargetAtTime(s.est, now, 0.4);
    // Close to (or inside) a place it surrounds you: blend toward unpanned.
    const k = 1 - clamp(s.d / 3, 0, 1);
    s.dry.gain.setTargetAtTime(k * 0.7, now, 0.3);
    s.panG.gain.setTargetAtTime(1 - k * 0.7, now, 0.3);
    place(s, now, 0.08);
    if (s.chord) s.chord.gain.setTargetAtTime(done[s.def.pillar] ? 1 : 0, now, 1.5);
    if (s.def.event && now >= s.nextEvent) {
      const wait = !paused && !isMuted() ? s.def.event(s) : 2;
      s.nextEvent = now + wait;
    }
  }
}

// ---------- public API ----------
export function init(m) {
  const cx = context();
  if (!cx) return false;
  if (ac) { map = m; seaNear = nearestField(m.g, T.SEA); tallNear = nearestField(m.g, T.TALL); return true; }
  ac = cx.ac; map = m;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;
  panModel = mobile ? 'equalpower' : 'HRTF';
  bus = gain(0); bus.connect(cx.master);
  bus.gain.setTargetAtTime(paused ? DUCK : AMB, ac.currentTime, 1.5);   // fade the island in
  white = noiseBuffer(2, false); brown = noiseBuffer(4, true);
  seaNear = nearestField(m.g, T.SEA); tallNear = nearestField(m.g, T.TALL);
  for (const def of SOURCES) state.push({ def, live: false, dying: 0, nodes: [], est: 0, rank: 0, level: 0, d: 1e9, ex: 0, ez: 0, want: false, nextEvent: 0 });
  // Old Safari has no positionX params; its listener must still sit at the origin facing -Z (the default).
  return true;
}

export function update(x, z, yw) {
  if (!ac) return;
  px = x; pz = z; yaw = yw || 0;
  const now = ac.currentTime;
  if (now - lastTick >= TICK || now < lastTick) { lastTick = now; lastTurn = now; lastYaw = yaw; tick(now); return; }
  // Between ticks only re-aim the voices when the view turns.
  if (now - lastTurn >= TURN && Math.abs(yaw - lastYaw) > 0.01) {
    lastTurn = now; lastYaw = yaw;
    for (let i = 0; i < state.length; i++) { const s = state[i]; if (s.live && !s.dying) place(s, now, 0.04); }
  }
}

export function setDusk(v) { dusk = clamp(+v || 0, 0, 1); }
export function setShrineDone(pillar, on) {
  done[pillar] = !!on;
  const s = state.find(s => s.def.pillar === pillar);
  if (s && s.chord) s.chord.gain.setTargetAtTime(on ? 1 : 0, ac.currentTime, 1.5);
}
export function pause(on) {
  paused = !!on;
  if (bus) bus.gain.setTargetAtTime(paused ? DUCK : AMB, ac.currentTime, 0.3);
}

// Footsteps: short filtered noise bursts (and a knock for wood), a little different each time.
const STEPS = {
  grass:  { f: 2600, type: 'bandpass', Q: 0.8, dur: 0.09, vol: 0.05, bursts: 2 },
  tall:   { f: 3200, type: 'bandpass', Q: 0.6, dur: 0.18, vol: 0.055, bursts: 2 },
  sand:   { f: 1800, type: 'highpass', Q: 0.7, dur: 0.018, vol: 0.05, bursts: 4 },
  path:   { f: 1000, type: 'bandpass', Q: 1.0, dur: 0.06, vol: 0.05, bursts: 2 },
  bridge: { f: 1300, type: 'bandpass', Q: 1.5, dur: 0.03, vol: 0.04, bursts: 1, tone: 190 },
  stone:  { f: 3200, type: 'bandpass', Q: 5, dur: 0.02, vol: 0.06, bursts: 1, tone: 1900 },
  water:  { f: 900, type: 'bandpass', Q: 1.2, dur: 0.2, vol: 0.055, bursts: 2, sweep: 0.55 },
};
export function step(surface) {
  if (!ac || isMuted()) return;
  const now = ac.currentTime;
  if (now - lastStep < 0.12) return;
  lastStep = now;
  const p = STEPS[surface] || STEPS.grass, v = p.vol * rand(0.75, 1.15);
  let t = now + 0.005;
  for (let i = 0; i < p.bursts; i++) {
    const n = ac.createBufferSource(); n.buffer = white;
    const f = filt(p.type, p.f * rand(0.85, 1.15), p.Q), g = ac.createGain();
    const d = p.dur * rand(0.8, 1.25), a = i ? v * rand(0.4, 0.8) : v;
    if (p.sweep) f.frequency.exponentialRampToValueAtTime(p.f * p.sweep, t + d);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + Math.min(0.012, d * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    n.connect(f).connect(g).connect(bus);
    n.start(t, Math.random() * 1.5); n.stop(t + d + 0.02);
    t += surface === 'sand' ? rand(0.015, 0.03) : rand(0.04, 0.09);
  }
  if (p.tone) {   // wood tap / stone click
    const o = ac.createOscillator(), g = ac.createGain(), f = p.tone * rand(0.9, 1.1);
    o.type = surface === 'bridge' ? 'triangle' : 'sine';
    o.frequency.setValueAtTime(f, now); o.frequency.exponentialRampToValueAtTime(f * 0.8, now + 0.08);
    g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(v * 0.7, now + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, now + (surface === 'bridge' ? 0.12 : 0.04));
    o.connect(g).connect(bus); o.start(now); o.stop(now + 0.15);
  }
}

// ---------- debug (preview/tests) ----------
const dbgBuf = new Float32Array(512);
function rms(an) { an.getFloatTimeDomainData(dbgBuf); let a = 0; for (let i = 0; i < dbgBuf.length; i++) a += dbgBuf[i] * dbgBuf[i]; return Math.sqrt(a / dbgBuf.length); }
// debug(true) adds analysers to voices built from now on and on the ambience bus.
export function debug(on) {
  if (on && ac && !dbg) { dbg = ac.createAnalyser(); dbg.fftSize = 512; bus.connect(dbg); }
  return {
    panners: built,
    dusk, paused, bus: bus ? +bus.gain.value.toFixed(3) : 0,
    level: dbg ? rms(dbg) : 0,
    voices: state.filter(s => s.live).map(s => ({ id: s.def.id, target: +s.level.toFixed(4), dist: +s.d.toFixed(1), dying: !!s.dying, rms: s.an ? +rms(s.an).toFixed(5) : null, chord: s.chord ? +s.chord.gain.value.toFixed(2) : null })),
  };
}
