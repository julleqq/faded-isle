// The island: a tile grid for collision, plus a one-time painted
// rendering (colour) and an ink-only copy of it (grey).
//
// Layout is hand-placed via the constants below so it is easy to tweak.

export const TILE = 32;
export const N = 80;                 // map is N x N tiles
export const SIZE = TILE * N;        // world size in px

export const T = { SEA: 0, SAND: 1, GRASS: 2, TALL: 3, WATER: 4, PATH: 5, BRIDGE: 6,
                   FOREST: 7, ROCK: 8, STONE: 9, BLOCK: 10 };
const WALKABLE = new Set([T.SAND, T.GRASS, T.TALL, T.PATH, T.BRIDGE, T.STONE]);

const C = { x: 40, y: 40 };          // Great Tree
export const START = { x: 40.5 * TILE, y: 45 * TILE };

// Shrine (guardian) tile positions per pillar.
export const SHRINES = {
  present:    { x: 21, y: 20 },
  defusion:   { x: 58, y: 23 },
  acceptance: { x: 40, y: 68 },
  selfctx:    { x: 22, y: 45 },
  values:     { x: 41, y: 10 },
  action:     { x: 67, y: 50 },
};
export const VERSE_STONES = [ { x: 29, y: 33 }, { x: 53, y: 41 }, { x: 31, y: 58 }, { x: 49, y: 57 } ];
export const SIGNPOST = { x: 43, y: 43 };

const LAKE = { x: 14, y: 45, r: 6.5 };
const POND = { x: 67, y: 50, r: 5 };
const RIVER = [ [47, 3], [51, 12], [56, 18], [63, 23], [70, 27], [79, 30] ];
const MOUNTAIN = { x: 41, y: 11, r: 8 };
const FOREST = { x: 21, y: 20, r: 11 };
const BEACH = { x: 40, y: 71, r: 9 };

// ---------- small deterministic helpers ----------
export function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise(x, y, s = 1) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return dist(px, py, ax + t * dx, ay + t * dy);
}
function polyDist(px, py, pts) {
  let m = Infinity;
  for (let i = 0; i < pts.length - 1; i++) m = Math.min(m, segDist(px, py, ...pts[i], ...pts[i + 1]));
  return m;
}
// Gently curved path from a to b, sampled as a polyline.
function curve(a, b, bend) {
  const mx = (a.x + b.x) / 2 - (b.y - a.y) * bend, my = (a.y + b.y) / 2 + (b.x - a.x) * bend;
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    pts.push([(1 - t) ** 2 * a.x + 2 * (1 - t) * t * mx + t * t * b.x,
              (1 - t) ** 2 * a.y + 2 * (1 - t) * t * my + t * t * b.y]);
  }
  return pts;
}

// ---------- map generation ----------
export function buildMap() {
  const g = new Uint8Array(N * N);
  const set = (x, y, v) => { if (x >= 0 && y >= 0 && x < N && y < N) g[y * N + x] = v; };

  const paths = [
    curve(C, SHRINES.present, 0.12),
    curve(C, SHRINES.defusion, -0.1),
    curve(C, SHRINES.acceptance, 0.08),
    curve(C, SHRINES.selfctx, -0.12),
    curve(C, SHRINES.values, 0.06),
    curve(C, { x: 61, y: 50 }, 0.1),
    curve({ x: 44, y: 13 }, SHRINES.defusion, 0.1),   // summit -> stream, crosses the river
  ];

  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const a = Math.atan2(y - C.y, x - C.x);
    const R = 34 + (noise(Math.cos(a) * 2 + 5, Math.sin(a) * 2 + 5, 3) - 0.5) * 8;
    const d = dist(x, y, C.x, C.y);
    let t = d > R ? T.SEA : d > R - 2.2 ? T.SAND : T.GRASS;
    if (t === T.GRASS && dist(x, y, BEACH.x, BEACH.y) < BEACH.r + noise(x * .3, y * .3, 4) * 3) t = T.SAND;

    const n = noise(x * 0.35, y * 0.35, 7);
    if (t === T.GRASS && dist(x, y, FOREST.x, FOREST.y) < FOREST.r && n > 0.35) t = T.FOREST;
    const md = dist(x, y, MOUNTAIN.x, MOUNTAIN.y);
    if (t !== T.SEA && md < MOUNTAIN.r && md > 3 && n > 0.25) t = T.ROCK;
    if (t === T.GRASS && hash(x, y, 11) < 0.035) t = T.FOREST;          // lone trees
    if (t === T.GRASS && noise(x * 0.22, y * 0.22, 9) > 0.62) t = T.TALL;  // wild grass
    if (t !== T.SEA && dist(x, y, LAKE.x, LAKE.y) < LAKE.r + (noise(x * .4, y * .4, 5) - .5) * 2) t = T.WATER;
    if (t !== T.SEA && dist(x, y, POND.x, POND.y) < POND.r) t = T.WATER;
    if (t !== T.SEA && polyDist(x, y, RIVER) < 1.3) t = T.WATER;
    g[y * N + x] = t;
  }
  // paths (bridges over water)
  for (const p of paths) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = polyDist(x, y, p);
    const i = y * N + x;
    if (d < 1.0 && g[i] !== T.SEA) g[i] = g[i] === T.WATER ? T.BRIDGE : T.PATH;
    else if (d < 2.2 && (g[i] === T.FOREST || g[i] === T.ROCK || g[i] === T.TALL)) g[i] = T.GRASS;
  }
  // clearings
  // Clear land around a point; water is kept unless `overWater` (the pond islet).
  const clear = (cx, cy, r, overWater = false) => {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const t = g[y * N + x];
      if (dist(x, y, cx, cy) <= r && t !== T.SEA && (overWater || t !== T.WATER)) set(x, y, T.GRASS);
    }
  };
  clear(C.x, C.y, 5);
  for (const k in SHRINES) if (k !== 'action' && k !== 'acceptance') clear(SHRINES[k].x, SHRINES[k].y, 2.5);
  for (const v of VERSE_STONES) clear(v.x, v.y, 1.5);
  // stepping stones across the pond to the islet
  for (let x = 61; x <= 65; x++) set(x, 50, T.STONE);
  clear(POND.x, POND.y, 1.5, true);
  // solid landmarks
  for (let y = C.y - 1; y <= C.y; y++) for (let x = C.x - 1; x <= C.x; x++) set(x, y, T.BLOCK);
  for (const k in SHRINES) set(SHRINES[k].x, SHRINES[k].y, T.BLOCK);
  for (const v of VERSE_STONES) set(v.x, v.y, T.BLOCK);
  set(SIGNPOST.x, SIGNPOST.y, T.BLOCK);

  return { g, paths };
}

export function tileAt(map, px, py) {
  const x = Math.floor(px / TILE), y = Math.floor(py / TILE);
  if (x < 0 || y < 0 || x >= N || y >= N) return T.SEA;
  return map.g[y * N + x];
}
export function walkable(map, px, py) { return WALKABLE.has(tileAt(map, px, py)); }

// Which pillar region is this point in (for ambience / labels)?
export function regionAt(px, py) {
  const x = px / TILE, y = py / TILE;
  let best = null, bd = 12;
  for (const k in SHRINES) {
    const d = dist(x, y, SHRINES[k].x, SHRINES[k].y);
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}

// ---------- painting ----------
const PAPER = '#efe7d6';

function clear(c) {
  if (c[0] === '#') return c + '00';
  return c.replace(/rgba?\(([^,]+),([^,]+),([^,)]+)(,[^)]*)?\)/, 'rgba($1,$2,$3,0)');
}
function wash(ctx, x, y, r, color, alpha, r0 = 0.1) {
  const gr = ctx.createRadialGradient(x, y, r * r0, x, y, r);
  gr.addColorStop(0, color); gr.addColorStop(1, clear(color));
  ctx.globalAlpha = alpha; ctx.fillStyle = gr;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
}
// A brush stroke: overlapping soft dabs along a polyline, tapering at both ends.
export function stroke(ctx, pts, w, color, alpha, R) {
  ctx.fillStyle = color;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const steps = Math.max(2, Math.ceil(dist(ax, ay, bx, by) / (w * 0.3)));
    for (let s = 0; s < steps; s++) {
      const t = (i + s / steps) / (pts.length - 1);
      const taper = Math.sin(Math.PI * Math.min(1, Math.max(0.05, t))) * 0.8 + 0.2;
      const x = ax + (bx - ax) * s / steps, y = ay + (by - ay) * s / steps;
      ctx.globalAlpha = alpha * (0.6 + R() * 0.4);
      ctx.beginPath(); ctx.arc(x + (R() - .5) * w * .2, y + (R() - .5) * w * .2, w * taper * 0.5, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}
function dab(ctx, x, y, r, color, alpha) {
  ctx.globalAlpha = alpha; ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
}

const INK = '#1d1b19';
function regionHue(x, y) {
  // Tint grass per region so each area has its own palette once painted.
  const tints = { present: '#7fae5e', defusion: '#b5a54a', acceptance: '#8fb68a', selfctx: '#7fa392', values: '#a9ad62', action: '#8aa46a' };
  const r = regionAt(x * TILE, y * TILE);
  return r ? tints[r] : '#94b86a';
}

function drawPine(ctx, x, y, R, s = 1) {
  wash(ctx, x, y + 6, 20 * s, 'rgba(40,60,40,.5)', 0.35);
  stroke(ctx, [[x, y + 8], [x + (R() - .5) * 6, y - 8 * s], [x + (R() - .5) * 8, y - 26 * s]], 5 * s, '#3b2d22', .9, R);
  const greens = ['#3f6e3a', '#2f5a3a', '#557d3d'];
  for (let i = 0; i < 9; i++) {
    const cx = x + (R() - .5) * 30 * s, cy = y - 12 * s - R() * 26 * s;
    dab(ctx, cx, cy, (7 + R() * 7) * s, greens[i % 3], .75);
    dab(ctx, cx + 2, cy + 3, (4 + R() * 4) * s, INK, .35);
  }
}
function drawBamboo(ctx, x, y, R) {
  for (let k = 0; k < 3; k++) {
    const bx = x + (k - 1) * 7 + (R() - .5) * 4, h = 38 + R() * 20;
    for (let s = 0; s < 4; s++) {
      const y0 = y - s * h / 4, y1 = y - (s + 1) * h / 4 + 2;
      stroke(ctx, [[bx, y0], [bx + 0.5, y1]], 4, '#5b8a45', .9, R);
      dab(ctx, bx, y1, 2.2, INK, .6);
    }
    for (let l = 0; l < 4; l++) {
      const ly = y - h * (0.5 + R() * 0.5), dir = R() < .5 ? -1 : 1;
      stroke(ctx, [[bx, ly], [bx + dir * 8, ly - 3], [bx + dir * 15, ly + 1]], 3, '#2f5a2f', .8, R);
    }
  }
}
function drawMaple(ctx, x, y, R, colors) {
  wash(ctx, x, y + 6, 20, 'rgba(60,40,30,.5)', 0.3);
  stroke(ctx, [[x, y + 8], [x - 3, y - 6], [x + 2, y - 18]], 5, '#3b2d22', .9, R);
  stroke(ctx, [[x - 2, y - 8], [x - 12, y - 16]], 3, '#3b2d22', .8, R);
  for (let i = 0; i < 16; i++) dab(ctx, x + (R() - .5) * 34, y - 16 - R() * 22, 4 + R() * 5, colors[i % colors.length], .7);
}
function drawRock(ctx, x, y, R, s = 1) {
  const pts = [];
  const n = 7, r = (10 + R() * 8) * s;
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2;
    pts.push([x + Math.cos(a) * r * (0.7 + R() * .4), y + Math.sin(a) * r * 0.7 * (0.7 + R() * .4)]);
  }
  ctx.fillStyle = '#8c8a80'; ctx.globalAlpha = .85;
  ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p)); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
  wash(ctx, x - r * .3, y - r * .3, r * .7, '#c9c4b5', .6);
  stroke(ctx, [pts[2], pts[3], pts[4], pts[5]], 3.5 * s, INK, .75, R);
}
function grassTuft(ctx, x, y, R, color, tall) {
  const n = tall ? 5 : 3, h = tall ? 16 : 7;
  for (let i = 0; i < n; i++) {
    const bx = x + (i - n / 2) * 3;
    stroke(ctx, [[bx, y], [bx + (R() - .5) * 8, y - h * (0.7 + R() * .5)]], tall ? 2.6 : 1.8, color, tall ? .85 : .5, R);
  }
}
function flower(ctx, x, y, R, color) {
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2;
    dab(ctx, x + Math.cos(a) * 2.5, y + Math.sin(a) * 2.5, 2.2, color, .85);
  }
  dab(ctx, x, y, 1.4, '#f3d36b', 1);
}

export function paintWorld(map) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = SIZE;
  const ctx = cv.getContext('2d');
  const R = rng(20240922);
  const g = map.g;
  const at = (x, y) => (x < 0 || y < 0 || x >= N || y >= N) ? T.SEA : g[y * N + x];

  // paper + sea
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, SIZE, SIZE);
  for (let i = 0; i < 9000; i++) {   // paper fibre
    ctx.fillStyle = R() < .5 ? 'rgba(120,100,70,.05)' : 'rgba(255,255,255,.12)';
    ctx.fillRect(R() * SIZE, R() * SIZE, 1 + R() * 3, 1);
  }

  // base washes per tile
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const t = at(x, y), px = x * TILE + 16, py = y * TILE + 16;
    const j = (R() - .5) * 10;
    if (t === T.SEA) wash(ctx, px + j, py + j, 34, '#5f9fb5', .35);
    else if (t === T.SAND) wash(ctx, px + j, py + j, 30, '#e3cc98', .5);
    else if (t === T.WATER || t === T.STONE) wash(ctx, px + j, py + j, 30, '#4f95b0', .55);
    else if (t === T.PATH || t === T.BRIDGE) { }
    else if (t === T.ROCK) wash(ctx, px + j, py + j, 30, '#9d9a88', .5);
    else wash(ctx, px + j, py + j, 32, regionHue(x, y), t === T.FOREST ? .55 : .4);
  }
  // deeper water toward the open sea
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = dist(x, y, C.x, C.y);
    if (at(x, y) === T.SEA && d > 38) wash(ctx, x * TILE + 16, y * TILE + 16, 36, '#2f6f8f', Math.min(.35, (d - 38) * .05));
  }
  // paths: pale earth with pebbles
  for (const p of map.paths) {
    const pts = p.map(([x, y]) => [x * TILE + 16, y * TILE + 16]);
    stroke(ctx, pts, 46, '#e6d6b0', .55, R);
    stroke(ctx, pts, 30, '#efe2c2', .6, R);
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const t = at(x, y);
    if (t === T.PATH && R() < .5) dab(ctx, x * TILE + R() * 32, y * TILE + R() * 32, 1.8, '#8a7a60', .5);
  }
  // shorelines & ripples (ink)
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const t = at(x, y), px = x * TILE, py = y * TILE;
    const water = t === T.SEA || t === T.WATER;
    if (water && R() < .18) {
      const wx = px + R() * 32, wy = py + R() * 32;
      stroke(ctx, [[wx - 10, wy], [wx - 3, wy - 3], [wx + 4, wy], [wx + 11, wy - 3]], 1.8, '#2d5566', .45, R);
    }
    if (water) {
      const shore = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const u = at(x + dx, y + dy); return u !== T.SEA && u !== T.WATER && u !== T.STONE && u !== T.BRIDGE; });
      if (shore) {
        stroke(ctx, [[px + 2, py + 16 + (R() - .5) * 8], [px + 16, py + 16 + (R() - .5) * 8], [px + 30, py + 16 + (R() - .5) * 8]], 3, '#ffffff', .5, R);
        stroke(ctx, [[px + 4, py + 20], [px + 28, py + 20 + (R() - .5) * 6]], 1.6, INK, .35, R);
      }
    }
  }

  // bridge planks
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (at(x, y) === T.BRIDGE) {
    const px = x * TILE, py = y * TILE;
    ctx.fillStyle = '#9b6b43'; ctx.globalAlpha = .9; ctx.fillRect(px - 2, py, TILE + 4, TILE); ctx.globalAlpha = 1;
    for (let k = 0; k < 4; k++) stroke(ctx, [[px - 2, py + k * 8 + 4], [px + TILE + 2, py + k * 8 + 4]], 1.4, INK, .6, R);
    stroke(ctx, [[px - 3, py], [px - 3, py + TILE]], 2.5, INK, .8, R);
    stroke(ctx, [[px + TILE + 3, py], [px + TILE + 3, py + TILE]], 2.5, INK, .8, R);
  }
  // stepping stones
  for (let x = 61; x <= 65; x++) {
    const px = x * TILE + 16, py = 50 * TILE + 16;
    dab(ctx, px, py + 3, 12, '#6c7a74', .5);
    dab(ctx, px, py, 11, '#b8b3a3', .95);
    stroke(ctx, [[px - 8, py + 5], [px, py + 8], [px + 8, py + 5]], 2.2, INK, .7, R);
  }

  // Objects, sorted by y so lower things overlap upper ones.
  const objs = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const t = at(x, y), px = x * TILE + 16, py = y * TILE + 22;
    const region = regionAt(px, py);
    if (t === T.FOREST) {
      if (region === 'present') objs.push([py, () => R() < .5 ? drawBamboo(ctx, px, py, R) : drawPine(ctx, px, py, R)]);
      else if (region === 'defusion') objs.push([py, () => drawMaple(ctx, px, py, R, ['#d9823b', '#c4552f', '#e0a53c'])]);
      else if (dist(x, y, C.x, C.y) < 16 && R() < .5) objs.push([py, () => drawMaple(ctx, px, py, R, ['#f0b7c3', '#e59aae', '#f7d4db'])]);
      else objs.push([py, () => drawPine(ctx, px, py, R, 0.9 + R() * 0.3)]);
    } else if (t === T.ROCK) objs.push([py, () => drawRock(ctx, px, py, R, 1.1 + R() * .5)]);
    else if (t === T.TALL) {
      for (let k = 0; k < 3; k++) { const ox = R() * 28 - 14, oy = R() * 24 - 12; objs.push([py + oy, () => grassTuft(ctx, px + ox, py + oy, R, '#5f8a3a', true)]); }
    } else if (t === T.GRASS) {
      if (R() < .5) { const ox = R() * 28 - 14, oy = R() * 20 - 10; objs.push([py + oy, () => grassTuft(ctx, px + ox, py + oy, R, '#4f6e3a', false)]); }
      if (R() < .12) { const cols = ['#e27d8e', '#f2c14e', '#ffffff', '#b99ad6', '#e8866a']; const c = cols[Math.floor(R() * cols.length)]; objs.push([py, () => flower(ctx, px + R() * 20 - 10, py - 6, R, c)]); }
    } else if (t === T.SAND && R() < .06) objs.push([py, () => { dab(ctx, px, py, 3, '#f4ede0', .9); stroke(ctx, [[px - 3, py + 1], [px + 3, py + 1]], 1, INK, .4, R); }]);
  }
  // Great Tree (centre)
  const tx = C.x * TILE, ty = C.y * TILE + 26;
  objs.push([ty, () => {
    wash(ctx, tx, ty + 4, 70, 'rgba(40,40,30,.6)', .35);
    stroke(ctx, [[tx - 10, ty + 16], [tx - 6, ty - 10], [tx - 2, ty - 40], [tx + 4, ty - 70]], 18, '#4a3526', .95, R);
    for (const [bx, by] of [[-40, -70], [38, -64], [-20, -95], [26, -98], [0, -110]])
      stroke(ctx, [[tx, ty - 50], [tx + bx * .5, ty - 60 + by * .3], [tx + bx, ty + by]], 6, '#4a3526', .9, R);
    for (let i = 0; i < 70; i++) {
      const a = R() * Math.PI * 2, r = R() * 58;
      dab(ctx, tx + Math.cos(a) * r * 1.2, ty - 80 + Math.sin(a) * r * .8, 7 + R() * 8, ['#f0b7c3', '#e59aae', '#f7d4db', '#fbe7ea'][i % 4], .75);
    }
    for (let i = 0; i < 25; i++) dab(ctx, tx + (R() - .5) * 140, ty - 80 + (R() - .5) * 90, 3, INK, .35);
  }]);
  // shrines: a flat stone with an ensō painted beside it
  for (const k in SHRINES) {
    const s = SHRINES[k], px = s.x * TILE + 16, py = s.y * TILE + 16;
    objs.push([py - 20, () => {
      dab(ctx, px, py + 10, 26, '#6e6a5e', .35);
      dab(ctx, px, py + 6, 24, '#b9b3a2', .9);
      enso(ctx, px, py + 6, 30, R);
      lantern(ctx, px - 40, py + 4, R); lantern(ctx, px + 40, py + 4, R);
    }]);
  }
  for (const v of VERSE_STONES) {
    const px = v.x * TILE + 16, py = v.y * TILE + 20;
    objs.push([py, () => {                       // upright stele with carved lines
      dab(ctx, px, py + 4, 16, '#6e6a5e', .35);
      ctx.fillStyle = '#a9a595';
      ctx.beginPath(); ctx.moveTo(px - 11, py + 4); ctx.lineTo(px - 10, py - 30); ctx.quadraticCurveTo(px, py - 38, px + 10, py - 30); ctx.lineTo(px + 11, py + 4); ctx.closePath(); ctx.fill();
      wash(ctx, px - 4, py - 22, 10, '#d8d3c4', .7);
      stroke(ctx, [[px + 10, py - 30], [px + 11, py + 4]], 2.5, INK, .7, R);
      for (let k = 0; k < 3; k++) stroke(ctx, [[px - 5 + k * 5, py - 26], [px - 5 + k * 5, py - 6]], 1.3, INK, .75, R);
    }]);
  }
  { const px = SIGNPOST.x * TILE + 16, py = SIGNPOST.y * TILE + 26;
    objs.push([py, () => {
      stroke(ctx, [[px, py], [px, py - 30]], 4, '#5a4330', .95, R);
      ctx.fillStyle = '#c9a877'; ctx.fillRect(px - 16, py - 38, 32, 16);
      stroke(ctx, [[px - 17, py - 38], [px + 17, py - 38], [px + 17, py - 22], [px - 17, py - 22], [px - 17, py - 38]], 1.6, INK, .8, R);
    }]); }

  objs.sort((a, b) => a[0] - b[0]).forEach(o => o[1]());
  return cv;
}

function lantern(ctx, x, y, R) {
  dab(ctx, x, y + 8, 9, '#7a766a', .35);
  ctx.fillStyle = '#a7a292'; ctx.fillRect(x - 3, y - 6, 6, 14);
  ctx.fillStyle = '#9d9888'; ctx.fillRect(x - 8, y - 14, 16, 8);
  wash(ctx, x, y - 10, 16, '#ffd97a', .55);
  ctx.fillStyle = '#f6c24a'; ctx.fillRect(x - 4, y - 13, 8, 5);
  stroke(ctx, [[x - 11, y - 15], [x, y - 20], [x + 11, y - 15]], 2.6, INK, .85, R);
}
export function enso(ctx, x, y, r, R, color = INK, w = 5, squash = 0.55) {
  const start = R() * Math.PI * 2, pts = [];
  for (let i = 0; i <= 30; i++) {
    const a = start + i / 30 * Math.PI * 1.85;
    const rr = r * (1 + (R() - .5) * .05);
    pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * squash]);
  }
  stroke(ctx, pts, w, color, .8, R);
}

// Ink-only copy: luminance mapped between ink black and warm paper.
export function inkify(src) {
  const cv = document.createElement('canvas');
  cv.width = src.width; cv.height = src.height;
  const ctx = cv.getContext('2d');
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, cv.width, cv.height), d = img.data;
  const ink = [29, 27, 25], paper = [236, 231, 220];
  for (let i = 0; i < d.length; i += 4) {
    let l = (0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]) / 255;
    l = Math.min(1, Math.max(0, (l - 0.5) * 1.25 + 0.62));   // lift washes, keep ink dark
    d[i] = ink[0] + (paper[0] - ink[0]) * l;
    d[i + 1] = ink[1] + (paper[1] - ink[1]) * l;
    d[i + 2] = ink[2] + (paper[2] - ink[2]) * l;
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}
