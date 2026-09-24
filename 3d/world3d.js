// The island in 3D, built from the same tile grid as the 2D game (world.js buildMap()).
// 1 tile = 1 unit; 2D pixel (x, y) -> 3D (x / 32, height, y / 32).
//
// Static props are merged per 16×16-tile chunk into three meshes (solid, ink outline,
// swaying plants), so the whole island costs only a few dozen draw calls and far chunks
// are simply hidden beyond the fog.

import * as THREE from 'three';
import * as W from '../world.js';
import { T, TILE, N } from '../world.js';
import { inkMat, outlineMat, Builder, M, GEO, trunk, U, WORLD, radialTex } from './ink.js';

const CH = 16;                                   // chunk size (tiles)
export const WATER_Y = 0;
const C0 = { x: 40, y: 40 };                     // the Great Tree
const MOUNTAIN = { x: 41, y: 11 };

// ---------- noise ----------
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
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const lerpC = (a, b, t) => a.clone().lerp(b, t);
const col = h => new THREE.Color(h);

// ---------- heights ----------
const BASE = { [T.SEA]: -1.5, [T.WATER]: -0.9, [T.BRIDGE]: -0.9, [T.STONE]: -0.55, [T.SAND]: 0.12, [T.PATH]: 0.32 };
const baseH = t => BASE[t] ?? 0.36;
function extras(x, y) {                          // hills and the mountain, on land only
  const dc = dist(x, y, C0.x, C0.y);
  let hl = Math.max(0, noise(x * .085, y * .085, 21) * .75 + noise(x * .2, y * .2, 22) * .25 - .45) * 3.2;
  hl *= sstep(7, 12, dc) * sstep(33, 26, dc);
  for (const k in W.SHRINES) { const s = W.SHRINES[k]; hl *= sstep(2.5, 6, dist(x, y, s.x + .5, s.y + .5)); }
  const md = dist(x, y, MOUNTAIN.x + .5, MOUNTAIN.y + .5);
  const m = 5.6 * (1 - sstep(3.6, 11, md)) + (1 - sstep(4, 11, md)) * (noise(x * .5, y * .5, 23) - .5) * .8 * sstep(3.6, 5, md);
  return hl + m;
}

export class Island {
  constructor(map) {
    this.map = map;
    this.R = 2;                                  // height samples per tile
    this.GN = N * this.R + 1;
    this.group = new THREE.Group();
    this.chunks = [];
  }
  tile(x, y) { return (x < 0 || y < 0 || x >= N || y >= N) ? T.SEA : this.map.g[y * N + x]; }

  // --- terrain height field (world units)
  buildHeights() {
    const { GN, R } = this, H = this.H = new Float32Array(GN * GN), L = this.L = new Float32Array(GN * GN);
    for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) {
      const x = i / R, y = j / R;
      let sw = 0, sh = 0;
      for (let ty = Math.floor(y - 1.6); ty <= Math.floor(y + 1.6); ty++) for (let tx = Math.floor(x - 1.6); tx <= Math.floor(x + 1.6); tx++) {
        const d = dist(x, y, tx + .5, ty + .5), w = Math.max(0, 1.5 - d) ** 2;
        if (!w) continue;
        sw += w; sh += w * baseH(this.tile(tx, ty));
      }
      const b = sh / sw, land = sstep(-.35, .25, b);
      L[j * GN + i] = land;
      H[j * GN + i] = b + land * extras(x, y);
    }
  }
  terrainY(x, z) {                               // bilinear, x/z in tiles
    const { GN, R, H } = this;
    const fx = Math.min(GN - 1.001, Math.max(0, x * R)), fz = Math.min(GN - 1.001, Math.max(0, z * R));
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const a = H[j * GN + i], b = H[j * GN + i + 1], c = H[(j + 1) * GN + i], d = H[(j + 1) * GN + i + 1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  // Where feet stand: bridge decks and stepping stones sit above the water.
  groundY(x, z) {
    const t = this.tile(Math.floor(x), Math.floor(z));
    if (t === T.BRIDGE) return .5;
    if (t === T.STONE) return .2;
    return Math.max(this.terrainY(x, z), -0.2);
  }

  build(scene) {
    this.buildHeights();
    const trees = this.planProps();
    this.buildTerrain(trees);
    this.buildWater();
    scene.add(this.group);
    return this;
  }

  // --- terrain mesh with painted vertex colours
  buildTerrain(shadows) {
    const { GN, R, H, L } = this;
    const tints = { present: '#86b26a', defusion: '#b8a95a', acceptance: '#9cc095', selfctx: '#8fb0a2', values: '#afb372', action: '#93ad72' };
    const paper = col('#efe7d6');
    const tcol = {};
    const tileCol = (t, tx, ty) => {
      if (t === T.SAND) return col('#e9dbb8');
      if (t === T.PATH || t === T.BRIDGE) return col('#ebe0c4');
      if (t === T.ROCK) return col('#a8a594');
      if (t === T.SEA || t === T.WATER || t === T.STONE) return col('#b9b49a');
      const r = W.regionAt(tx * TILE + 16, ty * TILE + 16);
      const k = r || 'none';
      let c = tcol[k] || (tcol[k] = lerpC(col(r ? tints[r] : '#9cbc72'), paper, .22));
      if (t === T.TALL) c = c.clone().multiplyScalar(.92);
      if (t === T.FOREST) c = c.clone().multiplyScalar(.86);
      return c;
    };
    const pos = new Float32Array(GN * GN * 3), cols = new Float32Array(GN * GN * 3);
    const c = new THREE.Color(), rock = col('#a9a698'), pink = col('#efc9cf');
    for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) {
      const x = i / R, y = j / R, k = j * GN + i;
      pos[k * 3] = x; pos[k * 3 + 1] = H[k]; pos[k * 3 + 2] = y;
      let sw = 0; c.setRGB(0, 0, 0);
      for (let ty = Math.floor(y - 1.2); ty <= Math.floor(y + 1.2); ty++) for (let tx = Math.floor(x - 1.2); tx <= Math.floor(x + 1.2); tx++) {
        const w = Math.max(0, 1.2 - dist(x, y, tx + .5, ty + .5)) ** 2;
        if (!w) continue;
        const tc = tileCol(this.tile(tx, ty), tx, ty);
        c.r += tc.r * w; c.g += tc.g * w; c.b += tc.b * w; sw += w;
      }
      c.multiplyScalar(1 / sw);
      const md = dist(x, y, MOUNTAIN.x + .5, MOUNTAIN.y + .5);
      if (L[k] > .5 && md < 11) c.lerp(rock, (1 - sstep(4, 10, md)) * .55 * (noise(x * .7, y * .7, 5) * .6 + .5));
      const dt = dist(x, y, C0.x, C0.y);
      if (dt < 6.5) c.lerp(pink, (1 - sstep(2.5, 6.5, dt)) * .55);     // fallen blossom under the Great Tree
      c.multiplyScalar(.94 + noise(x * .9, y * .9, 8) * .12);
      const s = shadows ? shadows[k] : 0;
      c.multiplyScalar(1 - Math.min(.35, s));
      cols[k * 3] = c.r; cols[k * 3 + 1] = c.g; cols[k * 3 + 2] = c.b;
    }
    const idx = [];
    for (let j = 0; j < GN - 1; j++) for (let i = 0; i < GN - 1; i++) {
      const a = j * GN + i, b = a + 1, d = a + GN, e = d + 1;
      if (H[a] < -1.2 && H[b] < -1.2 && H[d] < -1.2 && H[e] < -1.2) continue;   // deep under the sea
      idx.push(a, d, b, b, d, e);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    this.terrain = new THREE.Mesh(g, inkMat());
    this.group.add(this.terrain);
  }

  // --- water: one opaque plane; shallow tint and lapping foam from a blurred land mask
  buildWater() {
    const n = 160, land = new Float32Array(n * n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const t = this.tile(Math.floor(x / 2), Math.floor(y / 2));
      land[y * n + x] = (t === T.SEA || t === T.WATER || t === T.BRIDGE || t === T.STONE) ? 0 : 1;
    }
    let a = land, b = new Float32Array(n * n);
    for (let pass = 0; pass < 3; pass++) {           // box blur, 3 passes ≈ gaussian
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        let s = 0, c = 0;
        for (let k = -3; k <= 3; k++) { const xx = x + k; if (xx >= 0 && xx < n) { s += a[y * n + xx]; c++; } }
        b[y * n + x] = s / c;
      }
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        let s = 0, c = 0;
        for (let k = -3; k <= 3; k++) { const yy = y + k; if (yy >= 0 && yy < n) { s += b[yy * n + x]; c++; } }
        a[y * n + x] = s / c;
      }
    }
    const cv = document.createElement('canvas'); cv.width = cv.height = n;
    const g = cv.getContext('2d'), img = g.createImageData(n, n);
    for (let i = 0; i < n * n; i++) { const v = Math.round(Math.min(1, a[i] * 1.6) * 255); img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
    g.putImageData(img, 0, 0);
    const shore = new THREE.CanvasTexture(cv); shore.flipY = false;
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true });
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, { uMask: U.uMask, uWash: U.uWash, uTime: U.uTime, uDusk: U.uDusk, uShore: { value: shore } });
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        uniform sampler2D uMask; uniform sampler2D uWash; uniform sampler2D uShore; uniform float uTime; uniform float uDusk; varying vec3 vW;`)
        .replace('#include <opaque_fragment>', `#include <opaque_fragment>
        {
          vec2 uv = vW.xz / ${WORLD.toFixed(1)};
          float s = texture2D(uShore, uv).r;
          vec3 deep = vec3(.31, .52, .6), mid = vec3(.42, .66, .73), shallow = vec3(.64, .82, .8);
          vec3 c = mix(deep, mid, smoothstep(.0, .3, s));
          c = mix(c, shallow, smoothstep(.3, .75, s));
          float w = texture2D(uWash, vW.xz * .05 + vec2(uTime * .006, 0.)).r;
          c *= .92 + .16 * w;
          float band = sin(s * 24. - uTime * 1.1 + w * 3.);
          float foam = smoothstep(.9, .99, band) * smoothstep(.22, .45, s) * smoothstep(.95, .7, s);
          c = mix(c, vec3(.97, .96, .92), foam * .75);
          float rp = sin(vW.x * 1.2 + sin(vW.z * .6 + uTime * .25) * 2.2 + uTime * .45) * sin(vW.z * 1.7 - uTime * .3 + vW.x * .2);
          float rl = smoothstep(.88, .97, rp) * step(.5, texture2D(uWash, vW.xz * .025).r);
          c = mix(c, vec3(.16, .27, .33), rl * .4);
          float rv = smoothstep(.06, .62, texture2D(uMask, uv).a);
          float l = clamp((dot(c, vec3(.3, .59, .11)) - .5) * 1.25 + .64, 0., 1.);
          vec3 ink = mix(vec3(.114, .106, .098), vec3(.93, .91, .865), l);
          c = mix(ink, c, rv);
          c = mix(c, c * vec3(1.06, .82, .8) + vec3(.08, .03, .06), uDusk * .6);
          gl_FragColor.rgb = c;
        }`);
    };
    const water = new THREE.Mesh(new THREE.PlaneGeometry(180, 180), m);
    water.rotation.x = -Math.PI / 2; water.position.set(40, WATER_Y, 40);
    this.group.add(water);
    this.water = water;
  }

  // --- props: plan deterministic positions, then build merged chunk meshes
  planProps() {
    const R = W.rng(424242), { map } = this;
    const nC = Math.ceil(N / CH);
    const B = [];                                // per chunk: [solid, plants]
    for (let i = 0; i < nC * nC; i++) B.push([new Builder(), new Builder()]);
    const at = (x, z) => B[Math.min(nC - 1, Math.floor(z / CH)) * nC + Math.min(nC - 1, Math.floor(x / CH))];
    const shadows = new Float32Array(this.GN * this.GN);
    const shadow = (x, z, r, k) => {           // bake a soft shadow into the terrain colours
      const { GN, R: RR } = this;
      for (let j = Math.max(0, Math.floor((z - r) * RR)); j <= Math.min(GN - 1, Math.ceil((z + r) * RR)); j++)
        for (let i = Math.max(0, Math.floor((x - r) * RR)); i <= Math.min(GN - 1, Math.ceil((x + r) * RR)); i++) {
          const d = dist(i / RR, j / RR, x, z);
          if (d < r) shadows[j * GN + i] += k * (1 - d / r) ** 1.5;
        }
    };
    const gy = (x, z) => this.terrainY(x, z);
    this.trees = [];

    for (let ty = 0; ty < N; ty++) for (let tx = 0; tx < N; tx++) {
      const t = this.tile(tx, ty), px = tx * TILE + 16, py = ty * TILE + 16;
      const region = W.regionAt(px, py);
      const x = tx + .5 + (R() - .5) * .5, z = ty + .5 + (R() - .5) * .5, y = gy(x, z);
      const [S, P] = at(x, z);
      if (t === T.FOREST) {
        const dc = dist(tx, ty, C0.x, C0.y);
        let kind;
        if (region === 'present') kind = R() < .6 ? 'bamboo' : 'pine';
        else if (region === 'defusion') kind = 'maple';
        else if (dc < 16 && R() < .5) kind = 'cherry';
        else kind = 'pine';
        tree(S, kind, x, y, z, R);
        this.trees.push({ x, z, kind });
        shadow(x + .3, z + .3, kind === 'bamboo' ? 1.1 : 1.5, .28);
      } else if (t === T.ROCK) {
        rock(S, x, y, z, .45 + R() * .5, R);
        if (R() < .4) rock(S, x + (R() - .5), gy(x, z) , z + (R() - .5), .25 + R() * .25, R);
        shadow(x + .2, z + .2, 1, .15);
      } else if (t === T.TALL) {
        for (let k = 0; k < 13; k++) {
          const gx = tx + R(), gz = ty + R();
          tuft(P, gx, gy(gx, gz), gz, 6, .5 + R() * .55, R, tallCol(region, R), .22);
        }
      } else if (t === T.GRASS || t === T.BLOCK) {
        for (let k = 0; k < 7; k++) {
          const gx = tx + R(), gz = ty + R();
          tuft(P, gx, gy(gx, gz), gz, 4, .1 + R() * .14, R, shortCol(region, R), .12);
        }
        if (R() < .16) {
          const cols = ['#e27d8e', '#f2c14e', '#ffffff', '#b99ad6', '#e8866a'], c = cols[Math.floor(R() * cols.length)];
          for (let k = 0, n = 1 + Math.floor(R() * 3); k < n; k++) { const fx = tx + R(), fz = ty + R(); flower(P, fx, gy(fx, fz), fz, c, R); }
        }
      } else if (t === T.PATH && R() < .25) {
        const fx = tx + R(), fz = ty + R();
        rock(S, fx, gy(fx, fz) - .02, fz, .05 + R() * .05, R, '#9a927f', false);
      } else if (t === T.SAND && R() < .05) {
        const fx = tx + R(), fz = ty + R();
        S.add(GEO.sphere, M(fx, gy(fx, fz), fz, 0, R() * 6, 0, .09, .04, .07), '#f4ede0', { outline: false });
      }
    }
    this.landmarks(at, shadow, R);
    // meshes
    const matS = this.matSolid = inkMat({ flat: true }), matP = this.matPlants = inkMat({ sway: true, side: THREE.DoubleSide });
    const matO = this.matOutline = outlineMat();
    for (let i = 0; i < B.length; i++) {
      const [S, P] = B[i];
      const grp = new THREE.Group();
      const solid = S.build(matS, matO), plants = P.build(matP, null, true);
      grp.add(solid, plants); grp.userData.plants = plants;
      const cx = (i % nC) * CH + CH / 2, cz = Math.floor(i / nC) * CH + CH / 2;
      grp.userData.c = new THREE.Vector2(cx, cz);
      this.chunks.push(grp); this.group.add(grp);
    }
    return shadows;
  }

  // shrines, verse stones, signpost, bridge, stepping stones, lily pads, summit lanterns, the Great Tree
  landmarks(at, shadow, R) {
    const gy = (x, z) => this.terrainY(x, z);
    for (const k in W.SHRINES) {
      const s = W.SHRINES[k], x = s.x + .5, z = s.y + .5, y = gy(x, z);
      const [S] = at(x, z);
      const r = k === 'action' ? .95 : 1.25;
      S.add(GEO.cyl12, M(x, y + .06, z, 0, 0, 0, r, .26, r), '#b9b3a2');
      S.add(GEO.cyl12, M(x, y - .05, z, 0, 0, 0, r + .18, .2, r + .18), '#9d988a');
      if (k === 'defusion') {                   // a still basin for the koi
        S.add(GEO.cyl12, M(x, y + .2, z, 0, 0, 0, r - .12, .03, r - .12), '#4f95b0', { outline: false });
      } else {
        const en = new THREE.TorusGeometry(r * .72, .045, 3, 26, Math.PI * 1.82);
        S.add(en, M(x, y + .2, z, -Math.PI / 2, 0, R() * 6, 1, 1, .5), '#1d1b19', { outline: false });
      }
      if (k !== 'action') for (const sx of [-1, 1]) toro(S, x + sx * 1.9, gy(x + sx * 1.9, z + .2), z + .2);
      shadow(x, z, 2, .12);
    }
    // summit: unlit paper lanterns on posts around the owl
    { const s = W.SHRINES.values;
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i - 2) * .62, x = s.x + .5 + Math.cos(a) * 3.4, z = s.y + .5 + Math.sin(a) * 2.6, y = gy(x, z);
        const [S] = at(x, z);
        S.add(trunk(.05, .04, 1.5, 5), M(x, y, z), '#5a4330');
        S.add(GEO.box, M(x + .18, y + 1.45, z, 0, 0, 0, .42, .04, .04), '#5a4330');
        S.add(GEO.sphere, M(x + .34, y + 1.18, z, 0, 0, 0, .15, .19, .15), '#f3ead6');
      } }
    for (const v of W.VERSE_STONES) {
      const x = v.x + .5, z = v.y + .5, y = gy(x, z), [S] = at(x, z);
      const face = Math.atan2(C0.x - x, C0.y - z);
      const m = new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationY(face));
      const part = (g, mm, c, o) => S.add(g, m.clone().multiply(mm), c, o);
      part(GEO.box, M(0, .08, 0, 0, 0, 0, 1.0, .16, .55), '#8f8b7c');
      part(GEO.box, M(0, .75, 0, 0, 0, 0, .66, 1.3, .2), '#aaa696');
      part(GEO.cyl12, M(0, 1.4, 0, Math.PI / 2, 0, 0, .33, .2, .33), '#aaa696');
      for (let k = 0; k < 3; k++) part(GEO.box, M(-.18 + k * .18, .85, .105, 0, 0, 0, .035, .7, .02), '#2a2723', { outline: false });
      shadow(x + .2, z + .2, 1.1, .15);
    }
    { const x = W.SIGNPOST.x + .5, z = W.SIGNPOST.y + .5, y = gy(x, z), [S] = at(x, z);
      S.add(trunk(.07, .06, 1.7, 6), M(x, y, z), '#5a4330');
      S.add(GEO.box, M(x + .25, y + 1.45, z, 0, -.5, .06, .75, .2, .05), '#c9a877');
      S.add(GEO.box, M(x - .22, y + 1.15, z + .03, 0, .7, -.05, .7, .18, .05), '#c2a06d');
      S.add(GEO.cone4, M(x, y + 1.78, z, 0, Math.PI / 4, 0, .1, .12, .1), '#5a4330'); }
    // bridge: plank deck per tile, rails where the neighbour is water, posts into the river
    for (let ty = 0; ty < N; ty++) for (let tx = 0; tx < N; tx++) if (this.tile(tx, ty) === T.BRIDGE) {
      const x = tx + .5, z = ty + .5, [S] = at(x, z);
      S.add(GEO.box, M(x, .44, z, 0, 0, 0, 1.02, .1, 1.02), (tx + ty) % 2 ? '#9b6b43' : '#8e6240');
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (this.tile(tx + dx, ty + dz) !== T.WATER) continue;
        const ex = x + dx * .48, ez = z + dz * .48;
        S.add(GEO.box, M(ex, .9, ez, 0, 0, 0, dx ? .07 : 1.02, .07, dz ? .07 : 1.02), '#7a4f33');
        S.add(GEO.box, M(ex, .62, ez, 0, 0, 0, .09, .5, .09), '#6b4530');
        S.add(GEO.box, M(ex, -.1, ez, 0, 0, 0, .12, 1, .12), '#5a3a28', { outline: false });
      }
    }
    for (let tx = 61; tx <= 65; tx++) {
      const x = tx + .5 + (R() - .5) * .1, z = 50.5 + (R() - .5) * .15, [S] = at(x, z);
      S.add(GEO.cyl12, M(x, -.02, z, 0, R(), 0, .36, .42, .32), '#b8b3a3');
    }
    { const P = W.SHRINES.action;                // lily pads on the pond
      for (let i = 0; i < 11; i++) {
        const a = R() * Math.PI * 2, r = 2.2 + R() * 2.4, x = P.x + .5 + Math.cos(a) * r, z = P.y + .5 + Math.sin(a) * r;
        if (this.tile(Math.floor(x), Math.floor(z)) !== T.WATER || Math.abs(z - 50.5) < .8) continue;
        const [S] = at(x, z);
        S.add(GEO.cyl12, M(x, .02, z, 0, 0, 0, .3 + R() * .2, .02, .3 + R() * .2), R() < .5 ? '#6e9a55' : '#7fa860', { outline: false });
        if (R() < .35) S.add(GEO.oct, M(x + .1, .1, z, 0, R(), 0, .09, .08, .09), '#f0b7c3', { outline: false });
      } }
    // the Great Tree (own group: it should never be culled with a chunk)
    const GT = new Builder(), x0 = C0.x, z0 = C0.y, y0 = gy(x0, z0) - .1;
    const bark = '#5b4332', under = v => .78 + .22 * Math.max(0, Math.min(1, v.y + .5));   // blossom clumps darker underneath
    GT.add(trunk(1.0, .72, 2.4, 11), M(x0, y0, z0, 0, 0, .03), bark);
    GT.add(trunk(.74, .5, 2.2, 10), M(x0 + .1, y0 + 2.3, z0 - .05, .06, 0, -.07), bark);
    for (let i = 0; i < 7; i++) {                // roots spreading into the ground
      const a = i / 7 * Math.PI * 2 + .3, l = 1.1 + R() * .5;
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(Math.cos(a), -.55, Math.sin(a)).normalize());
      GT.add(new THREE.CylinderGeometry(.08, .32, 1, 6), new THREE.Matrix4().compose(new THREE.Vector3(x0 + Math.cos(a) * (.55 + l * .4), y0 + .28, z0 + Math.sin(a) * (.55 + l * .4)), q, new THREE.Vector3(1, l, 1)), '#54402f');
    }
    const blossoms = ['#f0b7c3', '#e8a3b5', '#f7d4db', '#f4c3cf'];
    const branchEnds = [];
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2 + R() * .5, len = 3.2 + R() * 1.6, up = .45 + R() * .4;
      const sx = x0, sy = y0 + 3.4 + R() * 1.2, sz = z0;
      const mx = sx + Math.cos(a) * len * .5, my = sy + up * len * .55 + .3, mz = sz + Math.sin(a) * len * .5;
      const ex = sx + Math.cos(a) * len, ey = sy + up * len * .75, ez = sz + Math.sin(a) * len;
      for (const [ax, ay, az, bx, by, bz, r] of [[sx, sy, sz, mx, my, mz, .26], [mx, my, mz, ex, ey, ez, .16]]) {
        const dir = new THREE.Vector3(bx - ax, by - ay, bz - az), L = dir.length();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
        GT.add(new THREE.CylinderGeometry(.62, 1, 1, 6), new THREE.Matrix4().compose(new THREE.Vector3((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), q, new THREE.Vector3(r, L * 1.04, r)), bark);
      }
      branchEnds.push([ex, ey, ez], [mx, my + .2, mz]);
    }
    for (let i = 0; i < 56; i++) {
      const [bx, by, bz] = branchEnds[i % branchEnds.length];
      const r = .75 + R() * .8;
      GT.add(GEO.ico1, M(bx + (R() - .5) * 2.2, by + (R() - .2) * 1.2, bz + (R() - .5) * 2.2, R() * 3, R() * 3, 0, r, r * .72, r), blossoms[i % 4], { shade: under });
    }
    for (let i = 0; i < 16; i++) {               // a crown in the middle
      const r = 1 + R() * .8, a = R() * 6.28, d = R() * 2;
      GT.add(GEO.ico1, M(x0 + Math.cos(a) * d, y0 + 7 + R() * 1.6, z0 + Math.sin(a) * d, R() * 3, R() * 3, 0, r, r * .75, r), blossoms[(i + 1) % 4], { shade: under });
    }
    shadow(x0, z0, 6.5, .32);
    this.greatTree = GT.build(this.matSolid || (this.matSolid = inkMat({ flat: true })), this.matOutline || (this.matOutline = outlineMat()));
    this.group.add(this.greatTree);
  }

  // hide chunks far beyond the fog
  cull(cam) {
    for (const c of this.chunks) {                // distance from the camera to the chunk's square
      const dx = Math.max(0, Math.abs(cam.x - c.userData.c.x) - CH / 2), dz = Math.max(0, Math.abs(cam.z - c.userData.c.y) - CH / 2);
      const d = Math.hypot(dx, dz);
      c.visible = d < 38;                        // the fog is opaque paper by then
      c.userData.plants.visible = d < 20;        // grass further away is lost in the haze anyway
    }
  }
}

// ---------- prop makers ----------
const PINE = ['#3f6e3a', '#2f5a3a', '#557d3d'];
const CULM = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true), NODE = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true);
function tree(S, kind, x, y, z, R) {
  const lean = (R() - .5) * .12, rot = R() * 6.28;
  if (kind === 'bamboo') {
    const n = 4 + Math.floor(R() * 3);
    for (let i = 0; i < n; i++) {
      const bx = x + (R() - .5) * .8, bz = z + (R() - .5) * .8, h = 3.4 + R() * 1.8, l = (R() - .5) * .14;
      S.add(CULM, M(bx, y + h / 2, bz, l, 0, l * .7, .05, h, .05), R() < .5 ? '#5b8a45' : '#6b9a4f');
      for (let k = 1; k < 4; k++) S.add(NODE, M(bx + l * k * h / 4 * .7, y + k * h / 4, bz - l * k * h / 4, l, 0, l * .7, .062, .03, .062), '#2f4a2a', { outline: false });
      for (let k = 0; k < 3; k++) {
        const lh = y + h * (.62 + k * .14), a = R() * 6.28;
        S.add(GEO.ico, M(bx + Math.cos(a) * .25, lh, bz + Math.sin(a) * .25, 0, a, .5, .42, .1, .2), R() < .5 ? '#3f7a3a' : '#4e8a45');
      }
    }
    return;
  }
  if (kind === 'pine') {
    const h = 2.4 + R() * 1.2;
    S.add(trunk(.14, .07, h, 6), M(x, y - .05, z, lean, rot, lean), '#3b2d22');
    for (let i = 0; i < 4; i++) {
      const py = y + h * (.5 + i * .17), ox = (R() - .5) * .9 + lean * py, oz = (R() - .5) * .9, r = (1.05 - i * .18) * (.8 + R() * .3);
      S.add(GEO.ico1, M(x + ox, py, z + oz, 0, R() * 6, 0, r, r * .36, r * .85), PINE[i % 3]);
    }
    return;
  }
  const h = 1.3 + R() * .5;
  S.add(trunk(.13, .06, h + .5, 6), M(x, y - .05, z, lean, rot, lean), kind === 'cherry' ? '#4a3526' : '#3b2d22');
  const cols = kind === 'maple' ? ['#d9823b', '#c4552f', '#e0a53c', '#cf6a35'] : ['#f0b7c3', '#e59aae', '#f7d4db', '#fbe7ea'];
  for (let i = 0; i < 5; i++) {
    const r = .45 + R() * .35;
    S.add(GEO.ico, M(x + (R() - .5) * 1.1, y + h + .2 + R() * .8, z + (R() - .5) * 1.1, R() * 3, R() * 3, 0, r, r * .8, r), cols[i % cols.length]);
  }
}
function rock(S, x, y, z, s, R, c, outline = true) {
  const g = ['#8c8a80', '#98958a', '#7f7d74'];
  S.add(GEO.dodec, M(x, y + s * .15, z, R() * 3, R() * 3, R() * 3, s, s * .62, s * .85), c || g[Math.floor(R() * 3)], { outline });
}
// stone lantern (tōrō); the window glows warm yellow
function toro(S, x, y, z) {
  S.add(GEO.box, M(x, y + .06, z, 0, 0, 0, .34, .12, .34), '#948f80');
  S.add(GEO.cyl, M(x, y + .35, z, 0, 0, 0, .075, .5, .075), '#a7a292');
  S.add(GEO.box, M(x, y + .62, z, 0, 0, 0, .3, .06, .3), '#9d9888');
  S.add(GEO.box, M(x, y + .77, z, 0, 0, 0, .24, .22, .24), '#a7a292');
  S.add(GEO.box, M(x, y + .77, z, 0, 0, 0, .25, .1, .14), '#f6c24a', { outline: false });
  S.add(GEO.box, M(x, y + .77, z, 0, 0, 0, .14, .1, .25), '#f6c24a', { outline: false });
  S.add(GEO.cone4, M(x, y + .98, z, 0, Math.PI / 4, 0, .3, .2, .3), '#8f8a7b');
  S.add(GEO.sphere, M(x, y + 1.1, z, 0, 0, 0, .045), '#8f8a7b', { outline: false });
}
function tallCol(region, R) { return ['#5f8a3a', '#6f9a45', '#56803a', '#7fa050'][Math.floor(R() * 4)]; }
function shortCol(region, R) { return ['#5f8043', '#6c8f4c', '#4f6e3a'][Math.floor(R() * 3)]; }
// a tuft of grass blades: single tapered triangles, swaying (aSway = height fraction)
function tuft(P, x, y, z, n, h, R, c, spread = .2) {
  const base = new THREE.Color(c), tip = base.clone().lerp(new THREE.Color('#e8e2b0'), .3), dark = base.clone().multiplyScalar(.72);
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2, w = .012 + R() * .012, bh = h * (.6 + R() * .5);
    const bx = x + (R() - .5) * spread, bz = z + (R() - .5) * spread;
    const lx = Math.cos(a) * w, lz = Math.sin(a) * w, tx = bx + (R() - .5) * bh * .6, tz = bz + (R() - .5) * bh * .6;
    raw(P, bx - lx, y - .02, bz - lz, dark, 0);
    raw(P, bx + lx, y - .02, bz + lz, dark, 0);
    raw(P, tx, y + bh, tz, tip, 1);
  }
}
function raw(B, x, y, z, c, s) { B.P.push(x, y, z); B.N.push(0, 1, 0); B.C.push(c.r, c.g, c.b); B.S.push(s); }
function flower(P, x, y, z, c, R) {
  const stem = new THREE.Color('#5f8043'), fc = new THREE.Color(c), h = .18 + R() * .12;
  raw(P, x - .015, y, z, stem, 0); raw(P, x + .015, y, z, stem, 0); raw(P, x, y + h, z, stem, 1);
  for (let k = 0; k < 5; k++) {                  // five petals as a little star
    const a = k / 5 * Math.PI * 2, b = a + .6;
    raw(P, x, y + h, z, fc, 1);
    raw(P, x + Math.cos(a) * .07, y + h + .01, z + Math.sin(a) * .07, fc, 1);
    raw(P, x + Math.cos(b) * .07, y + h + .01, z + Math.sin(b) * .07, fc, 1);
  }
}

// ---------- sky, distant ink mountains ----------
export function makeSky() {
  const m = new THREE.ShaderMaterial({
    uniforms: { uDusk: U.uDusk, uSun: { value: new THREE.Vector3(-.5, .16, -.85).normalize() } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; vec4 p = modelViewMatrix * vec4(position,1.); gl_Position = projectionMatrix * p; }',
    fragmentShader: `varying vec3 vP; uniform float uDusk; uniform vec3 uSun;
      void main(){
        vec3 d = normalize(vP); float h = d.y;
        vec3 hor = mix(vec3(.937,.906,.839), vec3(.96,.72,.56), uDusk);
        vec3 zen = mix(vec3(.87,.88,.86), vec3(.55,.49,.66), uDusk);
        vec3 c = mix(hor, zen, smoothstep(.0, .75, h));
        float s = dot(d, normalize(uSun + vec3(0., -.12 * uDusk, 0.)));
        float r = mix(.99935, .9988, uDusk);
        c = mix(c, mix(vec3(.8,.33,.25), vec3(.93,.45,.27), uDusk), smoothstep(r, r + .0004, s) * .85);
        c += vec3(.25,.12,.05) * pow(max(s, 0.), 60.) * (.25 + uDusk * .6);
        gl_FragColor = vec4(c, 1.);
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(190, 24, 12), m);
  sky.renderOrder = -2; sky.frustumCulled = false;
  return sky;
}

export function makeMountains() {
  const w = 1024, hgt = 256, c = document.createElement('canvas'); c.width = w; c.height = hgt;
  const g = c.getContext('2d');
  const layers = [[.26, 120, .16, 3], [.42, 150, .22, 5], [.6, 178, .3, 9]];
  for (const [alpha, base, amp, seed] of layers) {
    const pts = [];
    for (let x = 0; x <= w; x += 4) {
      const u = x / w * 6;                        // tile seamlessly: noise over a loop
      const n = noise(Math.cos(u / 6 * Math.PI * 2) * 3 + seed, Math.sin(u / 6 * Math.PI * 2) * 3 + seed, seed) * .7
              + noise(Math.cos(u / 6 * Math.PI * 2) * 9 + seed, Math.sin(u / 6 * Math.PI * 2) * 9, seed + 1) * .3;
      pts.push([x, base - Math.pow(n, 1.6) * hgt * amp * 2.2]);
    }
    const gr = g.createLinearGradient(0, base - hgt * amp * 2, 0, base + 40);
    gr.addColorStop(0, `rgba(60,58,54,${alpha})`); gr.addColorStop(.7, `rgba(80,78,72,${alpha * .6})`); gr.addColorStop(1, 'rgba(90,88,80,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(0, hgt);
    for (const p of pts) g.lineTo(p[0], p[1]);
    g.lineTo(w, hgt); g.closePath(); g.fill();
    g.strokeStyle = `rgba(29,27,25,${alpha * .7})`; g.lineWidth = 1.5; g.beginPath();
    pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.x = 3;
  const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.BackSide, depthWrite: false, fog: false });
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(120, 120, 34, 48, 1, true), m);
  ring.position.set(40, 8, 40); ring.renderOrder = -1;
  return ring;
}

// tiny soft blob shadow on the ground
const shadowTex = radialTex([[0, 'rgba(29,27,25,.45)'], [.6, 'rgba(29,27,25,.2)'], [1, 'rgba(29,27,25,0)']]);
export function blobShadow(size) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, fog: true }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = 1;
  return m;
}
