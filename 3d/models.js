// Figures of the Faded Isle in 3D: the four player characters (full body and
// first-person "viewmodel"), the six guardians and the eight wild spirits.
//
// Everything is built from low-poly primitives merged with ink.js's Builder
// (one mesh + one ink-outline hull per rigid part). Animated parts (a head, a
// tail, a wing) are their own small Builder groups, so a figure costs 2-7 draw
// calls. Colour comes from vertex colours; ink.js's shader does the paper wash
// and the grey <-> colour reveal.
//
// Conventions: 1 unit = 1 tile, feet at y = 0.
//   makeBody     faces -Z (like the camera)      update(t, walkPhase, moving)
//   makeGuardian faces +Z                        update(t), setColored(bool, instant?)
//   makeSpirit   faces +Z                        update(t, calm 0..1)
//   makeViewmodel: child of the perspective camera update(t, walkPhase, moving)

import * as THREE from 'three';
import { inkMat, outlineMat, Builder, M, GEO, trunk, INK, U } from './ink.js';

// ---------------------------------------------------------------- helpers
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const SPH = new THREE.SphereGeometry(1, 16, 12);
const SPH_S = new THREE.SphereGeometry(1, 9, 7);
const CYL = (r0, r1, s = 8) => new THREE.CylinderGeometry(r1, r0, 1, s);      // unit height, centred
const flat = g => { const n = g.index ? g.toNonIndexed() : g.clone(); n.computeVertexNormals(); return n; };
const F = { dodec: flat(GEO.dodec), ico: flat(GEO.ico), ico1: flat(GEO.ico1), cyl8: flat(new THREE.CylinderGeometry(1, 1, 1, 8)),
  cyl6: flat(new THREE.CylinderGeometry(1, 1, 1, 6)), cone4: flat(GEO.cone4), oct: flat(GEO.oct) };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const OUT = outlineMat();
const EYE = 0x1d1b19, WHITE = 0xf7efe3;

const _Y = V(0, 1, 0), _Z = V(0, 0, 1);
// matrix that places a unit-height, centred cylinder between a and b
function segM(a, b) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(_Y, d.normalize());
  return new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(.5), q, V(1, len, 1));
}
// a smooth tube through points with radii tapering r0 -> r1 (joint spheres hide the seams)
function limb(b, pts, r0, r1, col, opts) {
  const n = pts.length - 1;
  for (let i = 0; i < n; i++) {
    const ra = r0 + (r1 - r0) * i / n, rb = r0 + (r1 - r0) * (i + 1) / n;
    b.add(CYL(ra, rb, 8), segM(pts[i], pts[i + 1]), col, opts);
    if (i < n - 1) b.add(SPH_S, M(pts[i + 1].x, pts[i + 1].y, pts[i + 1].z, 0, 0, 0, rb), col, opts);
  }
  return b;
}
// point on a sphere (centre c, radius R) seen from +Z at screen offset (dx, dy); returns a matrix
// whose +Z is the surface normal, rotated by rz around it and scaled (sx, sy, sz).
function surfM(c, R, dx, dy, sx, sy = sx, sz = sx, rz = 0, lift = 0) {
  const dz = Math.sqrt(Math.max(0, R * R - dx * dx - dy * dy));
  const n = V(dx, dy, dz).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(_Z, n).multiply(new THREE.Quaternion().setFromAxisAngle(_Z, rz));
  return new THREE.Matrix4().compose(c.clone().addScaledVector(n, R + lift), q, V(sx, sy, sz));
}
// point on an ellipsoid surface at azimuth az (0 = +Z, around Y) and elevation el; +Z along the normal
function ellM(c, r, az, el, sx, sy = sx, sz = sx * .35, spin = 0) {
  const u = V(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  const p = V(u.x * r.x, u.y * r.y, u.z * r.z).add(c);
  const n = V(u.x / r.x, u.y / r.y, u.z / r.z).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(_Z, n).multiply(new THREE.Quaternion().setFromAxisAngle(_Z, spin));
  return new THREE.Matrix4().compose(p, q, V(sx, sy, sz));
}
// a thin triangular paper slab (flat normals) - origami facets
function prism(p0, p1, p2, th = .012) {
  const n = new THREE.Vector3().subVectors(p1, p0).cross(new THREE.Vector3().subVectors(p2, p0)).normalize().multiplyScalar(th / 2);
  const A = [p0, p1, p2].map(p => p.clone().add(n)), B = [p0, p1, p2].map(p => p.clone().sub(n));
  const t = [A[0], A[1], A[2], B[0], B[2], B[1]];
  for (let i = 0; i < 3; i++) { const j = (i + 1) % 3; t.push(A[i], B[i], B[j], A[i], B[j], A[j]); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(t.flatMap(v => [v.x, v.y, v.z]), 3));
  g.computeVertexNormals();
  return g;
}
// a teardrop (round bottom of radius R centred at y=R, tip at y=H), lathed
function dropGeo(R, H, seg = 16, bulge = 1) {
  const pts = [];
  for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + i / 8 * (Math.PI / 2 + .45); pts.push(new THREE.Vector2(Math.cos(a) * R, R + Math.sin(a) * R)); }
  const s = pts[pts.length - 1];
  for (let i = 1; i <= 6; i++) { const k = i / 6; pts.push(new THREE.Vector2(s.x * (1 - k) * (1 + bulge * .25 * Math.sin(k * Math.PI) ), s.y + (H - s.y) * k)); }
  pts[0].x = 0.0001; pts[pts.length - 1].x = 0.0001;
  return new THREE.LatheGeometry(pts, seg);
}
// a smooth tapered tube along a curve through pts; r(k) gives the radius at k = 0..1 (ends are capped
// with poles); sq squashes the tube sideways (along the curve's binormal)
function sweep(pts, r, { n = 24, radial = 10, sq = 1 } = {}) {
  const curve = new THREE.CatmullRomCurve3(pts), fr = curve.computeFrenetFrames(n, false);
  const P = [], I = [];
  P.push(...curve.getPointAt(0).toArray());
  for (let i = 0; i <= n; i++) {
    const k = i / n, c = curve.getPointAt(k), N = fr.normals[i], B = fr.binormals[i], rr = Math.max(.0005, r(k));
    for (let j = 0; j < radial; j++) {
      const a = j / radial * Math.PI * 2;
      P.push(c.x + rr * (Math.cos(a) * N.x + Math.sin(a) * B.x * sq), c.y + rr * (Math.cos(a) * N.y + Math.sin(a) * B.y * sq), c.z + rr * (Math.cos(a) * N.z + Math.sin(a) * B.z * sq));
    }
  }
  P.push(...curve.getPointAt(1).toArray());
  const ring = i => 1 + i * radial, last = P.length / 3 - 1;
  for (let j = 0; j < radial; j++) { const j2 = (j + 1) % radial; I.push(0, ring(0) + j2, ring(0) + j); I.push(last, ring(n) + j, ring(n) + j2); }
  for (let i = 0; i < n; i++) for (let j = 0; j < radial; j++) {
    const j2 = (j + 1) % radial, a = ring(i) + j, b = ring(i) + j2, c = ring(i + 1) + j, d = ring(i + 1) + j2;
    I.push(a, b, d, a, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals();
  return g;
}
const build = (b, mat, ol = OUT) => b.build(mat, ol);
const pivot = (x, y, z, ...kids) => { const g = new THREE.Group(); g.position.set(x, y, z); kids.forEach(k => g.add(k)); return g; };

// Faces for spirits: 'struggle' (open eyes, brows, small mouth) and 'calm' (closed happy eyes, smile, blush).
// brow > 0 worried, < 0 cross, 0 none.
function makeFace(mat, c, R0, { gap = .075, ey = .02, er = .026, my = -.06, brow = .35, s = 1, mouth = 'o', lift = 0 } = {}) {
  const R = R0 + lift;
  const st = new Builder(), ca = new Builder(), o = { outline: false };
  gap *= s; ey *= s; er *= s; my *= s;
  for (const sx of [-1, 1]) {
    st.add(SPH_S, surfM(c, R, sx * gap, ey, er * .8, er, er * .5), EYE, o);
    st.add(SPH_S, surfM(c, R, sx * gap - er * .25, ey + er * .35, er * .28, er * .3, er * .2, 0, er * .45), WHITE, o);   // glint
    if (brow) st.add(SPH_S, surfM(c, R, sx * gap, ey + er * 2.1, er * 1.25, er * .3, er * .3, -sx * brow), EYE, o);
    const arc = new THREE.TorusGeometry(er * 1.05, er * .28, 4, 10, Math.PI);
    ca.add(arc, surfM(c, R, sx * gap, ey - er * .3, 1, 1, 1), EYE, o);
    ca.add(SPH_S, surfM(c, R, sx * (gap + er * 1.6), ey - er * 1.7, er * 1.05, er * .6, er * .3), 0xe8908a, o);
  }
  if (mouth === 'o') st.add(SPH_S, surfM(c, R, 0, my, er * .55, er * .45, er * .3), EYE, o);
  else st.add(SPH_S, surfM(c, R, 0, my, er * 1.1, er * .25, er * .3), EYE, o);
  ca.add(new THREE.TorusGeometry(er * .9, er * .25, 4, 10, Math.PI), surfM(c, R, 0, my + er * .6, 1, 1, 1, Math.PI), EYE, o);
  return { struggle: st.build(mat, null), calm: ca.build(mat, null) };
}

function noCast(g) { g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } }); return g; }

// ================================================================ PLAYER BODIES
const MONK = { robe: 0xb8743a, robeDk: 0x8f5528, sash: 0x7a4a22, skin: 0xe6c9a8, hat: 0xc9b27a, hatTop: 0xd6c089, staff: 0x5a4330 };
const FOX = { fur: 0xd87a36, white: 0xf7efe3, dark: 0x3a2a20 };
const DROP = 0x15171c;
const PAPER_W = 0xf7f3ea, PAPER_S = 0xe4ddcc, PAPER_D = 0xd6ceba, CREST = 0xc0392b;

// Eye heights, handy for the first-person camera.
export const EYE_HEIGHT = { monk: 1.5, fox: .58, drop: .5, crane: 1.1 };

function monkBody(mat) {
  const b = new Builder();
  b.add(trunk(.3, .19, 1.02, 12), M(0, 0, 0), MONK.robe);                       // robe
  b.add(SPH, M(0, 1.0, 0, 0, 0, 0, .23, .12, .19), MONK.robe);                  // shoulders
  b.add(CYL(.235, .235, 12), M(0, .66, 0, 0, 0, 0, 1, .07, 1), MONK.sash);        // obi
  for (const s of [-1, 1]) {                                                    // sleeves + hands
    const hand = s > 0 ? V(.27, .86, .2) : V(-.15, .62, .22);
    limb(b, [V(s * .2, .98, 0), V(s * .27, .74, .06), hand.clone().add(V(-s * .01, -.01, -.05))], .075, .1, MONK.robe);
    b.add(SPH_S, M(hand.x, hand.y, hand.z, 0, 0, 0, .055), MONK.skin);
    b.add(SPH_S, M(s * .09, .04, .1, 0, 0, 0, .07, .04, .11), 0x3a2a20);          // sandals
  }
  b.add(SPH, M(0, 1.2, 0, 0, 0, 0, .13, .14, .13), MONK.skin);                   // head
  for (const s of [-1, 1]) b.add(SPH_S, M(s * .045, 1.2, .12, 0, 0, 0, .014, .018, .01), EYE, { outline: false });
  b.add(new THREE.ConeGeometry(.4, .17, 14), M(0, 1.38, 0), MONK.hat);          // straw hat
  b.add(new THREE.ConeGeometry(.15, .09, 10), M(0, 1.47, 0), MONK.hatTop);
  b.add(CYL(.405, .405, 14), M(0, 1.296, 0, 0, 0, 0, 1, .012, 1), 0x8e7a4c, { outline: false });   // brim rim
  b.add(CYL(.02, .018), M(.3, .88, .2, 0, 0, 0, 1, 1.76, 1), MONK.staff);       // staff
  b.add(SPH_S, M(.3, 1.78, .2, 0, 0, 0, .035), MONK.staff);
  b.add(new THREE.TorusGeometry(.04, .01, 5, 10), M(.3, 1.72, .2, Math.PI / 2, 0, 0), 0x8a7a5a, { outline: false });
  return build(b, mat);
}

function foxBody(mat) {
  const b = new Builder(), C = FOX;
  b.add(SPH, M(0, .32, 0, 0, 0, 0, .15, .15, .27), C.fur);                      // body
  b.add(SPH, M(0, .31, .12, 0, 0, 0, .1, .11, .14), C.white);                   // chest
  for (const [x, z] of [[-.08, .16], [.08, .16], [-.08, -.16], [.08, -.16]]) {
    limb(b, [V(x, .3, z), V(x, .12, z)], .045, .04, C.fur);
    limb(b, [V(x, .12, z), V(x, .02, z + .01)], .04, .035, C.dark);
  }
  const h = V(0, .5, .26);                                                     // head
  b.add(SPH, M(h.x, h.y, h.z, 0, 0, 0, .13, .12, .12), C.fur);
  b.add(SPH, M(0, .47, .36, 0, 0, 0, .06, .05, .1), C.fur);                     // snout
  b.add(SPH, M(0, .455, .36, 0, 0, 0, .055, .035, .09), C.white);
  b.add(SPH_S, M(0, .48, .455, 0, 0, 0, .022), EYE, { outline: false });
  for (const s of [-1, 1]) {
    b.add(SPH, M(s * .075, .44, .31, 0, 0, 0, .04, .03, .045), C.white);         // cheek ruff
    b.add(new THREE.ConeGeometry(.055, .16, 6), M(s * .07, .66, .23, -.15, 0, -s * .3), C.fur);   // ears
    b.add(new THREE.ConeGeometry(.03, .08, 6), M(s * .073, .64, .255, -.15, 0, -s * .3), C.dark, { outline: false });
    b.add(SPH_S, M(s * .055, .53, .365, 0, 0, 0, .014, .018, .01), EYE, { outline: false });
  }
  const body = build(b, mat);
  const t = new Builder();                                                     // tail (wags)
  const tp = [V(0, 0, 0), V(0, .03, -.12), V(0, .12, -.24), V(0, .26, -.29), V(0, .36, -.26)];
  t.add(sweep(tp, k => .03 + .075 * Math.sin(Math.min(1, k * 1.1) * Math.PI * .92)), M(), C.fur);
  t.add(SPH, M(0, .33, -.275, .5, 0, 0, .052, .06, .05), C.white);
  const tail = pivot(0, .36, -.22, build(t, mat));
  body.add(tail);
  return { g: body, tail };
}

function dropBody(mat) {
  const b = new Builder();
  b.add(dropGeo(.25, .62, 18, .6), M(0, 0, 0), DROP);
  b.add(SPH_S, M(-.12, .33, .14, 0, 0, .35, .03, .07, .02), 0xf7f7f2, { outline: false });   // gloss
  b.add(SPH_S, M(-.07, .43, .1, 0, 0, .3, .015, .025, .01), 0xf7f7f2, { outline: false });
  for (const s of [-1, 1]) b.add(SPH_S, M(s * .07, .24, .235, 0, s * .28, 0, .026, .036, .012), WHITE, { outline: false });
  b.add(new THREE.TorusGeometry(.2, .012, 4, 24), M(0, .045, 0, Math.PI / 2), 0x5aa6b0, { outline: false });  // a hint of colour it carries
  return build(b, mat);
}

function craneWing(s) {           // s = +1 right, -1 left; root at origin
  const b = new Builder();
  const A = V(0, .02, .2), B = V(0, .02, -.18), Mf = V(s * .28, .1, .15), T = V(s * .55, .26, -.28);
  b.add(prism(s > 0 ? A : B, s > 0 ? B : A, Mf), M(), PAPER_W);
  b.add(prism(s > 0 ? Mf : B, s > 0 ? B : Mf, T), M(), PAPER_S);
  return b;
}
function craneBody(mat) {
  const b = new Builder();
  b.add(F.oct, M(0, 0, 0, 0, 0, 0, .15, .13, .27), PAPER_W);                    // body diamond
  b.add(F.oct, M(0, -.045, 0, 0, 0, 0, .13, .1, .25), PAPER_S);
  b.add(prism(V(0, .02, .12), V(0, -.04, .2), V(0, .42, .36), .03), M(), PAPER_W);   // neck
  b.add(prism(V(0, .38, .34), V(0, .44, .38), V(0, .33, .46), .03), M(), PAPER_S);   // head fold
  b.add(SPH_S, M(0, .425, .375, 0, 0, 0, .028), CREST);
  b.add(prism(V(0, .02, -.12), V(0, -.04, -.2), V(0, .38, -.4), .03), M(), PAPER_D); // tail
  const body = build(b, mat);
  const wings = [-1, 1].map(s => pivot(s * .06, .03, 0, build(craneWing(s), mat)));
  wings.forEach(w => body.add(w));
  return { g: body, wings };
}

export function makeBody(charId) {
  const mat = inkMat({ reveal: 'none' });
  const root = new THREE.Group(), fig = new THREE.Group();
  fig.rotation.y = Math.PI;                         // modelled facing +Z; the body faces -Z
  root.add(fig);
  let parts = {};
  if (charId === 'fox') { const r = foxBody(mat); fig.add(r.g); parts = r; }
  else if (charId === 'drop') fig.add(parts.g = dropBody(mat));
  else if (charId === 'crane') { const r = craneBody(mat); r.g.scale.setScalar(1.25); r.g.position.y = .78; fig.add(r.g); parts = r; }
  else fig.add(parts.g = monkBody(mat));
  let k = 0, last = null;
  root.userData = {
    charId, material: mat,
    update(t, walkPhase = 0, moving = false) {
      const dt = last == null ? 0 : clamp(t - last, 0, .1); last = t;
      k += ((moving ? 1 : 0) - k) * Math.min(1, dt * 6);
      const g = parts.g, ph = walkPhase;
      if (charId === 'monk') {
        g.position.y = Math.abs(Math.sin(ph)) * .035 * k;
        g.rotation.z = Math.sin(ph) * .035 * k;
        g.rotation.x = .04 * k;
        g.scale.y = 1 + Math.sin(t * 1.6) * .006;
      } else if (charId === 'fox') {
        g.position.y = Math.abs(Math.sin(ph)) * .03 * k;
        g.rotation.x = Math.sin(ph * 2) * .04 * k;
        parts.tail.rotation.y = Math.sin(t * (2 + 6 * k)) * (.25 + .15 * k);
        parts.tail.rotation.x = Math.sin(t * 1.3) * .08;
      } else if (charId === 'drop') {
        const sq = Math.sin(ph * 2) * .07 * k + Math.sin(t * 2) * .02;
        g.scale.set(1 - sq * .5, 1 + sq, 1 - sq * .5);
        g.position.y = Math.max(0, Math.sin(ph * 2)) * .03 * k;
      } else {
        g.position.y = .78 + Math.sin(t * 1.4) * .04;
        g.rotation.x = .12 * k + Math.sin(t * 1.1) * .03;
        const f = Math.sin(t * (1.6 + 3 * k)) * (.35 + .15 * k);
        parts.wings[0].rotation.z = -f; parts.wings[1].rotation.z = f;
      }
    },
  };
  root.userData.update(0, 0, false);
  return noCast(root);
}

// ================================================================ VIEWMODELS
// Drawn by the normal camera, but their depth is squeezed into the first 1% of
// the depth range, so they are always in front of the world yet still sort
// correctly among themselves. Outlines are a fixed small width.
const VM_DEPTH = `#include <project_vertex>
gl_Position.z = -gl_Position.w + (gl_Position.z + gl_Position.w) * .01;`;
function vmMat() {
  const m = inkMat({ reveal: 'none', fog: false });
  const f = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => { f(sh, r); sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', VM_DEPTH); };
  m.customProgramCacheKey = () => 'ink-viewmodel';
  return m;
}
const VM_OUT = (() => {
  const m = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide, fog: false });
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aOut;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += aOut * .0024;')
      .replace('#include <project_vertex>', VM_DEPTH);
  };
  m.customProgramCacheKey = () => 'outline-viewmodel';
  return m;
})();

function vmMonk(mat) {
  // local frame: staff runs along +Y; hand at origin; sleeve comes from lower right
  const b = new Builder();
  b.add(CYL(.011, .01, 8), M(0, .12, 0, 0, 0, 0, 1, .9, 1), MONK.staff);
  b.add(SPH_S, M(0, .575, 0, 0, 0, 0, .02), MONK.staff);
  b.add(new THREE.TorusGeometry(.022, .006, 5, 12), M(0, .53, 0, Math.PI / 2), 0x8a7a5a, { outline: false });
  b.add(SPH, M(.004, -.005, .006, 0, 0, .2, .027, .034, .026), MONK.skin);       // fist
  for (let i = 0; i < 3; i++) b.add(SPH_S, M(-.014, -.02 + i * .016, .018, 0, 0, 0, .009, .008, .008), MONK.skin, { outline: false }); // knuckles
  limb(b, [V(.02, -.03, .01), V(.09, -.11, .06), V(.2, -.22, .12)], .03, .07, MONK.robe);   // sleeve
  b.add(CYL(.036, .036, 12), segM(V(.027, -.037, .014), V(.037, -.047, .02)), MONK.robeDk, { outline: false }); // hem
  b.add(CYL(.018, .018, 8), segM(V(.1, -.14, .085), V(.13, -.13, .055)), MONK.robeDk, { outline: false }); // fold
  const g = build(b, mat, VM_OUT);
  return [{ obj: g, fx: .8, fy: -.82, d: .45, s: .8, rot: new THREE.Euler(-.22, .5, .14) }];
}
function vmFox(mat) {
  const items = [];
  const n = new Builder();                                // snout tip, pointing forward
  n.add(SPH, M(0, 0, 0, 0, 0, 0, .06, .038, .12), FOX.fur);
  n.add(SPH, M(0, -.012, -.01, 0, 0, 0, .05, .026, .11), FOX.white);
  n.add(SPH_S, M(0, .004, -.118, 0, 0, 0, .017, .014, .012), EYE);
  const ng = build(n, mat, VM_OUT);
  items.push({ obj: ng, fx: 0, fy: -1.12, d: .2, s: .42, rot: new THREE.Euler(.25, 0, 0), snout: true });
  for (const s of [-1, 1]) {
    const p = new Builder();
    p.add(SPH, M(0, 0, 0, 0, 0, 0, .032, .024, .06), FOX.fur);
    p.add(SPH, M(0, -.004, -.045, 0, 0, 0, .03, .02, .03), FOX.dark);
    for (const tx of [-.014, 0, .014]) p.add(SPH_S, M(tx, -.004, -.07, 0, 0, 0, .009, .008, .01), FOX.dark, { outline: false });
    const pg = build(p, mat, VM_OUT);
    items.push({ obj: pg, fx: s * .55, fy: -1.12, d: .2, s: .55, rot: new THREE.Euler(.45, -s * .2, 0), paw: s });
  }
  return items;
}
function vmDrop(mat) {
  const b = new Builder();
  b.add(SPH, M(0, 0, 0, 0, 0, 0, .34, .2, .22), DROP);
  const c0 = V(), r0 = V(.34, .2, .22);
  b.add(SPH_S, ellM(c0, r0, -1.0, 1.4, .045, .006, .003, .12), 0xf2f2ec, { outline: false });   // gloss streak
  b.add(SPH_S, ellM(c0, r0, -.3, 1.47, .012, .006, .003), 0xf2f2ec, { outline: false });
  b.add(SPH_S, ellM(c0, r0, 1.1, 1.36, .045, .005, .003, -.1), 0x7d9aac, { outline: false });     // cool rim light
  const g = build(b, mat, VM_OUT);
  return [{ obj: g, fx: 0, fy: -1.72, d: .32, s: 1, rot: new THREE.Euler(-.1, 0, 0), drop: true }];
}
function vmCrane(mat) {
  const b = new Builder();
  const A = V(0, 0, .08), B = V(0, 0, -.1), Mf = V(-.14, .04, -.04), T = V(-.3, .08, -.2);
  b.add(prism(B, A, Mf, .006), M(), PAPER_W);
  b.add(prism(B, Mf, T, .006), M(), PAPER_S);
  b.add(prism(V(.0, -.004, .08), V(-.06, -.03, .09), V(-.02, -.02, -.02), .006), M(), PAPER_D);  // underfold
  b.add(prism(Mf, T, V(-.2, .1, -.05), .006), M(), 0xece5d6);   // folded flap on top
  const g = build(b, mat, VM_OUT);
  return [{ obj: g, fx: -.92, fy: -.55, d: .3, s: .65, rot: new THREE.Euler(.5, -.35, .25), wing: true }];
}

export function makeViewmodel(charId) {
  const mat = vmMat();
  const root = new THREE.Group();
  root.name = 'viewmodel';
  const items = charId === 'fox' ? vmFox(mat) : charId === 'drop' ? vmDrop(mat) : charId === 'crane' ? vmCrane(mat) : vmMonk(mat);
  items.forEach(it => root.add(it.obj));
  root.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.renderOrder = 10; o.castShadow = o.receiveShadow = false; } });
  let k = 0, last = null;
  root.userData = {
    charId, material: mat,
    update(t, walkPhase = 0, moving = false) {
      const dt = last == null ? 0 : clamp(t - last, 0, .1); last = t;
      k += ((moving ? 1 : 0) - k) * Math.min(1, dt * 5);
      const cam = root.parent && root.parent.isPerspectiveCamera ? root.parent : null;
      const tanH = Math.tan(THREE.MathUtils.degToRad((cam ? cam.fov : 60) / 2)), asp = cam ? cam.aspect : 16 / 9;
      // on narrow (portrait) screens keep items a bit further in so they stay on screen
      const wide = Math.min(1, asp);
      const ph = walkPhase;
      const bobY = (Math.abs(Math.sin(ph)) - .5) * .012 * k + Math.sin(t * 1.3) * .0025;
      const swayX = Math.sin(ph) * .008 * k + Math.sin(t * .7) * .0015;
      for (const it of items) {
        let fx = it.fx, fy = it.fy, d = it.d, rx = 0, ry = 0, rz = 0, dz = 0;
        if (it.paw) {
          const step = Math.sin(ph + (it.paw > 0 ? 0 : Math.PI));
          fy += Math.max(0, step) * .2 * k; dz = -Math.max(0, step) * .03 * k; rx = -Math.max(0, step) * .3 * k;
        }
        if (it.snout) fy += Math.sin(ph * 2) * .02 * k;
        if (it.wing) { rz = Math.sin(t * (1.2 + 3 * k)) * (.05 + .1 * k); }
        if (it.drop) fy += Math.sin(ph * 2) * .03 * k;
        const hy = tanH * d, hx = hy * asp;
        if (it.paw) fx = it.paw * (.55 + .35 * (1 - wide));
        const x = fx * hx * (it.fx && !it.paw ? (.75 + .25 * wide) : 1), y = fy * hy;
        it.obj.position.set(x + swayX, y + bobY, -d + dz);
        it.obj.rotation.set(it.rot.x + rx, it.rot.y + ry, it.rot.z + rz);
        const sc = it.s * (it.paw || it.snout ? .6 + .4 * wide : .7 + .3 * wide);
        if (it.drop) it.obj.scale.set(sc * (.55 + .45 * wide), it.s, it.s); else it.obj.scale.setScalar(sc);
      }
    },
  };
  return root;
}

// ================================================================ GUARDIANS
function guardianRoot(mat) {
  const g = new THREE.Group();
  let p = 0, target = 0, last = null;
  const sat = mat.userData.sat;
  g.userData.material = mat;
  g.userData.setColored = (on, instant = false) => { target = on ? 1 : 0; if (instant) { p = target; sat.value = target; } };
  g.userData.isColored = () => target === 1;
  g.userData._ease = t => {
    const dt = last == null ? 0 : clamp(t - last, 0, .1); last = t;
    if (p !== target) { p = target > p ? Math.min(target, p + dt / 1.5) : Math.max(target, p - dt / 1.5); sat.value = smooth(p); }
    return dt;
  };
  return g;
}

function deer(mat) {
  const G = 0x6f9e5a, CREAM = 0xefe6cf, ANT = 0x4a3b2c, HOOF = 0x3a2e24;
  const b = new Builder();
  const bc = V(0, .9, 0), br = V(.28, .29, .5);
  b.add(SPH, M(bc.x, bc.y, bc.z, 0, 0, 0, br.x, br.y, br.z), G);
  b.add(SPH, M(0, .78, .02, 0, 0, 0, .22, .17, .4), CREAM);
  const spots = [[.9, .75], [-.9, .75], [1.3, .6], [-1.3, .6], [1.9, .7], [-1.9, .7], [2.4, .95], [-2.4, .95], [.5, 1.2], [-.5, 1.2]];
  for (const [az, el] of spots) b.add(SPH_S, ellM(bc, br, az, el, .035), CREAM, { outline: false });
  for (const [x, z, top] of [[-.12, .3, .1], [.12, .3, .1], [-.12, -.3, .14], [.12, -.3, .14]]) {
    b.add(SPH, M(x * 1.05, .78, z, 0, 0, 0, .09 + top * .2, .15, .12 + top * .2), G);   // haunch / shoulder
    limb(b, [V(x * 1.1, .78, z), V(x * 1.1, .42, z + (z < 0 ? -.04 : .01)), V(x * 1.1, .07, z)], .06 + top * .1, .032, G);
    b.add(CYL(.04, .034, 7), M(x * 1.1, .035, z, 0, 0, 0, 1, .07, 1), HOOF);
  }
  b.add(SPH_S, M(0, 1.02, -.5, -.9, 0, 0, .07, .11, .06), CREAM);                // tail
  limb(b, [V(0, .98, .3), V(0, 1.22, .45), V(0, 1.4, .52)], .16, .1, G);    // neck
  const body = build(b, mat);
  const h = new Builder();
  h.add(SPH, M(0, .06, .05, .15, 0, 0, .12, .115, .15), G);
  h.add(SPH, M(0, .0, .19, .15, 0, 0, .075, .07, .1), CREAM);
  h.add(SPH_S, M(0, .02, .285, 0, 0, 0, .03, .025, .022), EYE, { outline: false });
  for (const s of [-1, 1]) {
    h.add(SPH_S, M(s * .085, .09, .12, 0, 0, 0, .021, .026, .016), EYE, { outline: false });
    h.add(SPH_S, M(s * .092, .1, .13, 0, 0, 0, .007), WHITE, { outline: false });
    h.add(SPH, M(s * .15, .15, -.01, 0, 0, s * -1.05, .05, .11, .025), G);        // ears
    h.add(SPH_S, M(s * .152, .15, .006, 0, 0, s * -1.05, .03, .075, .012), CREAM, { outline: false });
    const a0 = V(s * .05, .15, -.01), a1 = V(s * .12, .33, -.05), a2 = V(s * .2, .48, -.1), a3 = V(s * .17, .6, -.12);
    limb(h, [a0, a1, a2, a3], .022, .011, ANT);
    limb(h, [V(s * .11, .3, -.045), V(s * .04, .43, 0)], .014, .009, ANT);
    limb(h, [V(s * .19, .46, -.095), V(s * .29, .54, -.06)], .013, .008, ANT);
  }
  const head = pivot(0, 1.4, .52, build(h, mat));
  body.add(head);
  return { g: body, anim(t) {
    const flick = Math.exp(-((t % 5.3) * 9)) * Math.sin(t * 60) * .12;
    head.rotation.y = Math.sin(t * .37) * .32 + Math.sin(t * .11) * .15;
    head.rotation.z = Math.sin(t * .5) * .06 + flick;
    head.rotation.x = Math.sin(t * .23) * .08 - .04;
    body.scale.y = 1 + Math.sin(t * 1.4) * .006;
  } };
}

function koi(mat) {
  const STONE = 0x8f897c, STONE_D = 0x777165, WATER = 0x4f95b0, KW = 0xf4f1ea, KO = 0xd9823b;
  const b = new Builder();
  b.add(F.cyl8, M(0, .24, 0, 0, .2, 0, .78, .48, .78), STONE);                 // stone basin
  b.add(F.cyl8, M(0, .5, 0, 0, .2, 0, .8, .06, .8), STONE_D);
  b.add(CYL(.7, .7, 20), M(0, .52, 0, 0, 0, 0, 1, .03, 1), WATER);
  for (const [x, z, s] of [[.72, .45, .16], [-.78, .3, .13], [.2, .8, .11], [-.4, -.72, .15]]) b.add(F.ico, M(x, s * .6, z, x, z, 0, s, s * .8, s), STONE_D);
  b.add(CYL(.13, .13, 10), M(.36, .545, .3, 0, 0, 0, 1, .012, 1), 0x6f9e5a);   // lily pad
  b.add(new THREE.ConeGeometry(.045, .09, 6), M(.38, .59, .31), 0xe8a0b0);
  for (const [x, r] of [[-.5, .09], [.5, .09]]) b.add(new THREE.TorusGeometry(r, .01, 4, 16), M(x, .54, 0, Math.PI / 2), 0xd8ebee, { outline: false });
  const base = build(b, mat);
  // the fish: segments along an arc in the XY plane (head on the right, going down)
  const f = new Builder(), R = .5, cy = .52;
  const at = a => V(Math.cos(a) * R, Math.sin(a) * R, 0);
  const N = 9, a0 = 2.55, a1 = .7;                    // tail angle -> head angle
  const rk = k => k > .8 ? .125 * Math.sqrt(Math.max(0, 1 - ((k - .8) / .2) ** 2)) : .03 + .095 * Math.sin(k / .8 * Math.PI / 2);
  const arcPts = []; for (let i = 0; i <= N; i++) arcPts.push(at(a0 + (a1 - a0) * i / N));
  f.add(sweep(arcPts, rk, { n: 28, radial: 12, sq: .8 }), M(), KW);
  for (let i = 0; i <= N; i++) {
    const k = i / N, a = a0 + (a1 - a0) * k, p = at(a), r = rk(k);
    if (i === 3 || i === 6) f.add(SPH_S, ellM(p, V(r, r, r * .8), 0, 1.25, r * .85, r * .8, r * .45), KO, { outline: false });
    if (i === 6) for (const sz of [-1, 1]) f.add(SPH_S, M(p.x * 1.02, p.y * 1.02, sz * r * .62, 0, 0, a, r * .5, r * .55, r * .2), KO, { outline: false });
    if (i === 5) {                                       // dorsal fin along the outside of the arc
      const n = p.clone().normalize();
      f.add(prism(p.clone().addScaledVector(n, r * .6).add(V(Math.sin(a) * .06, -Math.cos(a) * .06, 0)), p.clone().addScaledVector(n, r * .6).add(V(-Math.sin(a) * .08, Math.cos(a) * .08, 0)), p.clone().addScaledVector(n, r + .07), .012), M(), KO);
    }
  }
  const hp = at(a1), hd = V(Math.sin(a1), -Math.cos(a1), 0);          // head position & direction
  f.add(SPH_S, M(hp.x + hd.x * .03, hp.y + hd.y * .03, 0, 0, 0, 0, .085, .085, .08), KO, { outline: false });
  for (const s of [-1, 1]) {
    f.add(SPH_S, M(hp.x + hd.x * .05 + .02, hp.y + hd.y * .05 + .015, s * .06, 0, 0, 0, .018), EYE, { outline: false });
    limb(f, [V(hp.x + hd.x * .1, hp.y + hd.y * .1, s * .03), V(hp.x + hd.x * .16 + .03, hp.y + hd.y * .16, s * .06), V(hp.x + hd.x * .17 + .07, hp.y + hd.y * .15, s * .07)], .007, .004, 0xb86a30, { outline: false });
    const pf = at(a1 + .35);
    f.add(SPH_S, M(pf.x, pf.y - .02, s * .09, 0, s * .6, .8, .06, .02, .035), KW);   // pectoral fins
  }
  const tp = at(a0), td = V(-Math.sin(a0), Math.cos(a0), 0);           // tail fin, fanning away
  for (const s of [-1, 1]) {
    const tip = tp.clone().addScaledVector(td, .15).add(V(td.y * s * .11, -td.x * s * .11, 0));
    f.add(prism(tp, s > 0 ? tip : tp.clone().addScaledVector(td, .05), s > 0 ? tp.clone().addScaledVector(td, .05) : tip, .014), M(), s > 0 ? KW : KO);
  }
  const fish = build(f, mat);
  const fishPivot = pivot(0, cy, 0, fish);
  base.add(fishPivot);
  return { g: base, anim(t) {
    fishPivot.rotation.z = Math.sin(t * .8) * .16;
    fish.rotation.y = Math.sin(t * .8 + 1) * .08;
    fishPivot.position.y = cy + Math.sin(t * 1.6) * .015;
  } };
}

function turtle(mat) {
  const ROCK = 0x8a857a, SH = 0x3f8fa0, SHD = 0x2f6f7c, PL = 0xd8cc9a, SK = 0x9aa36b;
  const b = new Builder();
  b.add(F.dodec, M(0, .2, 0, .2, .4, 0, .75, .26, .7), ROCK);
  b.add(F.ico, M(.72, .08, .4, .3, 0, 0, .16, .12, .15), 0x777165);
  b.add(F.ico, M(-.55, .08, .45, 0, .6, 0, .13, .1, .12), 0x777165);
  const y0 = .44;
  const sc = V(0, y0 + .08, 0), sr = V(.46, .34, .54);
  b.add(SPH, M(sc.x, sc.y, sc.z, 0, 0, 0, sr.x, sr.y, sr.z), SH);
  b.add(CYL(.49, .49, 16), M(0, y0 + .08, 0, 0, 0, 0, 1, .08, 1.15), SHD);
  b.add(SPH, M(0, y0 + .05, 0, 0, 0, 0, .44, .08, .52), PL);
  b.add(F.cyl6, ellM(sc, sr, 0, Math.PI / 2, .12, .12, .03), SHD, { outline: false });   // scutes
  for (let i = 0; i < 6; i++) b.add(F.cyl6, ellM(sc, sr, i / 6 * Math.PI * 2 + .5, .75, .1, .1, .025), SHD, { outline: false });
  b.add(new THREE.ConeGeometry(.014, .12, 5), M(0, sc.y + .38, -.02), 0x5f7f4a, { outline: false });   // a sprout on the shell
  b.add(SPH_S, M(.055, sc.y + .44, -.02, 0, 0, -.6, .065, .022, .04), 0x6f9e5a);
  b.add(SPH_S, M(-.05, sc.y + .43, -.02, 0, 0, .6, .05, .02, .032), 0x6f9e5a);
  for (const [x, z] of [[-.37, .32], [.37, .32], [-.35, -.34], [.35, -.34]]) b.add(SPH, M(x, y0, z, 0, x * z * 3, 0, .12, .08, .15), SK);
  b.add(new THREE.ConeGeometry(.045, .12, 6), M(0, y0 + .03, -.6, -Math.PI / 2), SK);
  const body = build(b, mat);
  const h = new Builder();
  limb(h, [V(0, 0, -.05), V(0, .06, .1)], .09, .08, SK);
  h.add(SPH, M(0, .1, .18, 0, 0, 0, .13, .12, .14), SK);
  for (const s of [-1, 1]) {
    h.add(SPH_S, M(s * .07, .145, .285, 0, 0, 0, .024, .029, .016), EYE, { outline: false });
    h.add(SPH_S, M(s * .076, .155, .298, 0, 0, 0, .008), WHITE, { outline: false });
  }
  h.add(new THREE.TorusGeometry(.04, .008, 4, 10, Math.PI), M(0, .085, .305, 0, 0, Math.PI), EYE, { outline: false });
  const head = pivot(0, y0 + .05, .5, build(h, mat));
  body.add(head);
  return { g: body, anim(t) {
    const bob = Math.sin(t * .9);
    head.position.z = .5 + bob * .035;
    head.rotation.x = Math.sin(t * .9 - .8) * .12;
    head.rotation.y = Math.sin(t * .31) * .25;
  } };
}

function heron(mat) {
  const W = 0xe8e6f0, WG = 0x7a6fb0, WD = 0x3b3450, BEAK = 0xc9a13a, LEG = 0x3a3530;
  const b = new Builder();
  b.add(F.cyl8, M(0, .05, 0, 0, .3, 0, .42, .1, .36), 0x8f897c);                  // flat stone
  for (const [x, z, h, lean] of [[-.34, -.18, 1.05, .1], [-.26, -.26, .8, -.06], [.3, -.22, .95, -.1]]) {   // reeds
    const top = V(x - Math.sin(lean) * h, .06 + h, z);
    limb(b, [V(x, .06, z), top], .022, .012, 0x7d8a5a);
    b.add(SPH_S, M(top.x - Math.sin(lean) * .02, top.y - .1, z, 0, 0, lean, .03, .08, .03), 0x6b5236);
  }
  limb(b, [V(.03, .1, .02), V(.03, .55, .0), V(.02, .98, -.02)], .016, .02, LEG);        // standing leg
  for (const a of [-.5, 0, .5]) limb(b, [V(.03, .105, .02), V(.03 + Math.sin(a) * .1, .105, .02 + Math.cos(a) * .1)], .008, .006, LEG, { outline: false });
  limb(b, [V(-.03, 1.02, -.02), V(-.04, .82, .1), V(-.04, .9, -.08)], .016, .012, LEG);   // tucked leg
  b.add(SPH, M(0, 1.15, -.04, -.45, 0, 0, .19, .21, .36), W);                      // body
  for (const s of [-1, 1]) {
    b.add(SPH, M(s * .15, 1.18, -.08, -.5, s * .05, 0, .07, .17, .34), WG);     // wings
    b.add(SPH_S, M(s * .12, 1.05, -.36, -.8, 0, 0, .05, .06, .14), WD);          // wingtips
  }
  b.add(SPH_S, M(0, 1.02, -.36, -.9, 0, 0, .07, .03, .14), W);                     // tail
  const body = build(b, mat);
  const n = new Builder();
  n.add(sweep([V(0, -.08, -.06), V(0, .1, .1), V(0, .3, .01), V(0, .46, .09)], k => .085 - .04 * k, { n: 16 }), M(), W);
  n.add(SPH, M(0, .5, .1, 0, 0, 0, .065, .06, .095), W);
  n.add(new THREE.ConeGeometry(.026, .28, 6), M(0, .48, .31, Math.PI / 2 + .1, 0, 0), BEAK);
  n.add(SPH_S, M(0, .56, .08, 0, 0, 0, .06, .02, .06), WD);                        // cap
  limb(n, [V(0, .55, .02), V(0, .58, -.12), V(0, .53, -.24)], .013, .005, WD);   // crest plume
  for (const s of [-1, 1]) {
    n.add(SPH_S, M(s * .052, .52, .14, 0, 0, 0, .014, .016, .01), EYE, { outline: false });
    n.add(SPH_S, M(s * .06, .5, .09, 0, 0, s * .3, .012, .04, .01), WD, { outline: false });   // eye stripe
  }
  n.add(SPH_S, M(0, .2, .12, .3, 0, 0, .04, .12, .03), WG, { outline: false });   // chest plumes
  const neck = pivot(0, 1.27, .16, build(n, mat));
  body.add(neck);
  return { g: body, anim(t) {
    const s = Math.sin(t * .45);
    neck.rotation.x = s * .12;
    neck.rotation.y = Math.sin(t * .27) * .35;
    neck.scale.y = 1 + Math.max(0, Math.sin(t * .45 + 2)) * .07;
    body.rotation.z = Math.sin(t * .6) * .012;
  } };
}

function owl(mat) {
  const GOLD = 0xd6a634, GOLD_D = 0xb08627, CREAM = 0xf1e2bd, BEAK = 0xc98a2a, WOOD = 0x7a6048;
  const b = new Builder();
  b.add(flat(trunk(.28, .23, .78, 9)), M(0, 0, 0), WOOD);                          // stump
  b.add(CYL(.23, .23, 9), M(0, .785, 0, 0, 0, 0, 1, .015, 1), 0xcdb48a, { outline: false });
  b.add(F.cyl8, M(.22, .12, .1, 0, 0, -1.1, .07, .22, .07), WOOD);                 // root
  b.add(F.cyl8, M(-.2, .1, -.12, 0, .5, 1.2, .06, .2, .06), WOOD);
  const bc = V(0, 1.08, 0), br = V(.28, .33, .25);
  b.add(SPH, M(bc.x, bc.y, bc.z, 0, 0, 0, br.x, br.y, br.z), GOLD);
  b.add(SPH, M(0, 1.03, .08, 0, 0, 0, .2, .25, .19), CREAM);
  for (const [x, y] of [[-.07, 1.1], [.07, 1.1], [0, 1.02], [-.1, .96], [.1, .96], [0, .9]]) b.add(SPH_S, M(x, y, .26 - Math.abs(x) * .3 - (1.1 - y) * .25, 0, 0, 0, .025, .012, .012), 0xb8913e, { outline: false });
  for (const s of [-1, 1]) {
    b.add(SPH, M(s * .25, 1.07, -.03, 0, s * -.2, s * .15, .08, .25, .19), GOLD_D);   // wings
    for (const dx of [-.035, 0, .035]) b.add(SPH_S, M(s * .09 + dx, .79, .15, 0, 0, 0, .018, .014, .03), BEAK, { outline: false });   // toes
  }
  b.add(SPH_S, M(0, .82, -.2, -.6, 0, 0, .1, .04, .1), GOLD_D);                    // tail
  const body = build(b, mat);
  const h = new Builder();
  h.add(SPH, M(0, .14, 0, 0, 0, 0, .29, .24, .25), GOLD);
  for (const s of [-1, 1]) {
    h.add(SPH, M(s * .105, .13, .17, 0, s * .3, 0, .115, .115, .06), 0xf6ecd2);    // facial discs
    h.add(new THREE.ConeGeometry(.055, .15, 6), M(s * .19, .36, -.02, 0, 0, -s * .35), GOLD);    // ear tufts
    h.add(new THREE.ConeGeometry(.03, .08, 6), M(s * .205, .41, -.02, 0, 0, -s * .35), 0x3a2e22, { outline: false });
  }
  h.add(new THREE.ConeGeometry(.03, .08, 5), M(0, .07, .245, Math.PI - .3, 0, 0), BEAK);
  const headMesh = build(h, mat);
  const e = new Builder();
  for (const s of [-1, 1]) {
    e.add(SPH_S, M(s * .105, 0, 0, 0, s * .3, 0, .065, .065, .02), 0xf2c14e);
    e.add(SPH_S, M(s * .107, 0, .016, 0, s * .3, 0, .038, .04, .012), EYE);
    e.add(SPH_S, M(s * .095, .015, .03, 0, 0, 0, .012), WHITE);
  }
  const eyes = pivot(0, .14, .215, e.build(mat, null));
  const head = pivot(0, 1.3, 0, headMesh, eyes);
  body.add(head);
  return { g: body, anim(t) {
    const bl = (t % 4.3), blink = bl < .16 ? Math.abs(Math.cos(bl / .16 * Math.PI)) : 1;
    eyes.scale.y = Math.max(.08, blink);
    head.rotation.z = Math.sin(t * .5) * .1 + Math.max(0, Math.sin(t * .23)) * .2;
    head.rotation.y = Math.sin(t * .19) * .45;
    body.scale.y = 1 + Math.sin(t * 1.2) * .008;
  } };
}

function frog(mat) {
  const R = 0xc0504d, BELLY = 0xefc2ae, DK = 0x9a3a38, ROCK = 0x858a78, MOSS = 0x7f9a5a;
  const b = new Builder();
  b.add(F.dodec, M(0, .32, 0, .3, .2, .1, .48, .42, .44), ROCK);
  b.add(F.ico1, M(.03, .64, -.03, 0, 0, 0, .34, .08, .3), MOSS);
  b.add(F.ico, M(.5, .12, .3, 0, .5, 0, .16, .12, .15), 0x777165);
  const base = build(b, mat);
  const f = new Builder();
  f.add(SPH, M(0, .17, -.02, -.25, 0, 0, .25, .18, .26), R);                       // body
  f.add(SPH, M(0, .12, .08, -.25, 0, 0, .2, .13, .2), BELLY);
  f.add(SPH, M(0, .25, .12, 0, 0, 0, .22, .14, .17), R);                           // head
  f.add(SPH, M(0, .2, .16, 0, 0, 0, .17, .08, .14), BELLY);                        // chin
  for (const s of [-1, 1]) {
    f.add(SPH, M(s * .12, .36, .12, 0, 0, 0, .08, .075, .08), R);                  // eye bumps
    f.add(SPH_S, M(s * .125, .38, .17, 0, 0, 0, .055, .055, .04), WHITE, { outline: false });
    f.add(SPH_S, M(s * .128, .385, .205, 0, 0, 0, .03, .034, .015), EYE, { outline: false });
    f.add(SPH_S, M(s * .118, .395, .218, 0, 0, 0, .009), WHITE, { outline: false });
    f.add(SPH_S, M(s * .16, .24, .24, 0, 0, 0, .03, .018, .01), 0xe58a80, { outline: false });   // blush
    f.add(SPH, M(s * .22, .1, -.08, 0, s * .3, 0, .09, .09, .17), R);             // back legs
    f.add(SPH, M(s * .25, .02, .1, 0, s * -.3, 0, .06, .02, .12), DK);             // back feet
    limb(f, [V(s * .14, .14, .16), V(s * .16, .02, .24)], .035, .028, R);         // front legs
    for (const a of [-.5, 0, .5]) f.add(SPH_S, M(s * .16 + Math.sin(a) * .035, .012, .26 + Math.cos(a) * .035, 0, 0, 0, .016, .01, .02), DK, { outline: false });
  }
  for (const [x, z] of [[-.08, -.1], [.1, -.05], [0, -.18]]) f.add(SPH_S, M(x, .33, z, .5, 0, 0, .035, .02, .03), DK, { outline: false }); // spots
  f.add(new THREE.TorusGeometry(.07, .008, 4, 12, Math.PI), M(0, .245, .27, -.3, 0, Math.PI), EYE, { outline: false });   // smile
  const fr = build(f, mat);
  const hopper = pivot(0, .66, 0, fr);
  base.add(hopper);
  return { g: base, anim(t) {
    const cyc = t % 5.2, hop = cyc > 4.5 ? Math.sin((cyc - 4.5) / .7 * Math.PI) : 0;
    const breathe = Math.sin(t * 2.4) * .03;
    hopper.position.y = .66 + hop * .14;
    fr.scale.set(1 - breathe * .3 - hop * .05, 1 + breathe + hop * .12, 1);
    hopper.rotation.y = Math.sin(t * .3) * .25;
  } };
}

const GUARDIANS = { present: deer, defusion: koi, acceptance: turtle, selfctx: heron, values: owl, action: frog };
export function makeGuardian(pillar) {
  const mat = inkMat({ reveal: 'uniform' });
  const root = guardianRoot(mat);
  const r = (GUARDIANS[pillar] || deer)(mat);
  root.add(r.g);
  root.userData.pillar = pillar;
  root.userData.update = t => { root.userData._ease(t); r.anim(t); };
  root.userData.update(0);
  return noCast(root);
}

// ================================================================ SPIRITS
const SP = { worry: 0x8fa7c9, doubt: 0x9c7bb8, regret: 0xb89a7b, sorrow: 0x6f95b5, ember: 0xd8674a, shame: 0xc98fa0, restless: 0x8fbf9f, cant: 0x9a9a8a };
const darker = (c, k = .82) => new THREE.Color(c).multiplyScalar(k).getHex();
const Y0 = .58;                 // float height of a spirit's centre

function spWorry(mat) {
  const c = SP.worry, b = new Builder(), C = V(0, Y0, 0);
  b.add(SPH, M(0, Y0, 0, 0, 0, 0, .25, .23, .22), c);
  for (const [x, y, z, r] of [[-.2, .1, -.03, .13], [.2, .09, -.02, .14], [0, .19, -.05, .15], [-.1, .17, -.07, .12], [.12, .16, -.08, .12], [.2, -.1, -.04, .1], [-.17, -.12, -.03, .1]]) b.add(SPH, M(x, Y0 + y, z, 0, 0, 0, r), c);
  const body = build(b, mat);
  const t = new Builder();
  t.add(sweep([V(0, .02, -.05), V(-.08, -.12, -.18), V(-.02, -.25, -.28), V(.1, -.28, -.32), V(.17, -.22, -.33)], k => .13 * (1 - k) + .012), M(), c);
  const tail = pivot(0, Y0 - .08, 0, build(t, mat));
  const face = makeFace(mat, C, .23, { brow: .45, my: -.08 });
  body.add(tail, face.struggle, face.calm);
  return { body, face, anim(t, calm, turb) {
    tail.rotation.y = Math.sin(t * (1.2 + 3 * turb)) * (.25 + .3 * turb);
    tail.rotation.z = Math.sin(t * 1.7) * .15;
    body.rotation.z = Math.sin(t * 7) * .04 * turb;
  } };
}
function spDoubt(mat) {
  const c = SP.doubt, b = new Builder(), C = V(0, Y0, 0);
  b.add(SPH, M(0, Y0, 0, 0, 0, 0, .22), c);
  const body = build(b, mat);
  const s = new Builder(), N = 22;
  for (let i = 0; i < N; i++) {
    const y = 1 - (i + .5) / N * 2, r = Math.sqrt(1 - y * y), a = i * 2.39996;
    const n = V(Math.cos(a) * r, y, Math.sin(a) * r);
    if (n.z > .72 && Math.abs(n.y) < .6) continue;          // keep the face clear
    const q = new THREE.Quaternion().setFromUnitVectors(_Y, n);
    s.add(new THREE.ConeGeometry(.06, .15, 6), new THREE.Matrix4().compose(n.clone().multiplyScalar(.25), q, V(1, 1, 1)), darker(c, .88));
    s.add(SPH_S, new THREE.Matrix4().compose(n.clone().multiplyScalar(.325), q, V(.014, .014, .014)), darker(c, .88), { outline: false });
  }
  const spikes = pivot(0, Y0, 0, build(s, mat));
  const face = makeFace(mat, C, .22, { brow: .3, mouth: '-' });
  body.add(spikes, face.struggle, face.calm);
  return { body, face, anim(t, calm, turb) {
    spikes.scale.setScalar(.84 + .16 * turb + Math.sin(t * 9) * .02 * turb);
    spikes.rotation.y = t * (.1 + .6 * turb);
    body.rotation.z = Math.sin(t * 5) * .06 * turb;
  } };
}
function spRegret(mat) {
  const c = SP.regret, b = new Builder(), C = V(0, Y0, 0);
  b.add(SPH, M(0, Y0, 0, 0, 0, 0, .21, .24, .21), c);
  b.add(SPH, M(0, Y0 + .23, -.02, -.3, 0, 0, .05, .08, .04), c);               // a little curl on top
  const body = build(b, mat);
  const r = new Builder();
  for (let k = 1; k <= 3; k++) r.add(new THREE.TorusGeometry(.2 + k * .09, .018 - k * .003, 5, 32), M(-k * .05, 0, -k * .09, 0, .35, 0), darker(c, 1 - k * .04), { outline: k < 3 });
  const rings = pivot(0, Y0, 0, build(r, mat));
  const face = makeFace(mat, C, .21, { brow: .5, my: -.075 });
  body.add(rings, face.struggle, face.calm);
  return { body, face, anim(t, calm, turb) {
    const p = (t * (.4 + .8 * turb)) % 1;
    rings.scale.setScalar(.9 + p * .25);
    rings.rotation.z = Math.sin(t * .5) * .2;
    body.rotation.y = -.25 * turb + Math.sin(t * .6) * .1;
  } };
}
function spSorrow(mat) {
  const c = SP.sorrow, b = new Builder(), C = V(0, Y0 + .04, .03);
  for (const [x, y, z, r, sy] of [[-.17, 0, 0, .16, .85], [.18, 0, -.01, .17, .85], [.06, .14, -.04, .17, 1], [-.1, .11, -.05, .14, 1], [0, .04, .03, .2, .95]]) b.add(SPH, M(x, Y0 + y, z, 0, 0, 0, r, r * sy, r), c);
  b.add(SPH, M(0, Y0 - .1, -.01, 0, 0, 0, .3, .07, .16), darker(c, .9));
  const body = build(b, mat);
  const d = new Builder().add(dropGeo(.025, .08, 8), M(0, 0, 0, Math.PI), 0x8fb6d4, { outline: false });
  const drops = new THREE.InstancedMesh(d.geometry(), mat, 6);
  drops.frustumCulled = false;
  const face = makeFace(mat, C, .2, { brow: .4, my: -.07 });
  body.add(drops, face.struggle, face.calm);
  const m4 = new THREE.Matrix4(), xs = [-.2, -.08, .05, .16, -.14, .1], zs = [.02, -.06, .05, -.02, -.1, -.08];
  return { body, face, anim(t, calm, turb) {
    for (let i = 0; i < 6; i++) {
      const p = (t * (.9 + .7 * turb) + i * .37) % 1;
      const s = (.55 + .45 * turb) * Math.sin(Math.min(1, p * 4) * Math.PI / 2) * (1 - smooth((p - .8) / .2));
      m4.compose(V(xs[i], Y0 - .14 - p * .38, zs[i]), new THREE.Quaternion(), V(s, s, s));
      drops.setMatrixAt(i, m4);
    }
    drops.instanceMatrix.needsUpdate = true;
    body.rotation.z = Math.sin(t * 1.1) * .04;
  } };
}
function spEmber(mat) {
  const c = SP.ember, b = new Builder(), C = V(0, .44, 0);
  b.add(dropGeo(.22, .78, 14, .3), M(0, .22, 0), c);
  b.add(dropGeo(.07, .24, 8, .3), M(.17, .44, -.02, 0, 0, -.5), c);              // side licks
  b.add(dropGeo(.06, .2, 8, .3), M(-.17, .48, -.02, 0, 0, .55), c);
  b.add(dropGeo(.1, .34, 10, .3), M(0, .22, -.13, -.25, 0, 0, 1, 1, .7), 0xf2c14e);   // warm core behind
  const flame = build(b, mat);
  const face = makeFace(mat, V(0, .44, 0), .22, { brow: -.45, my: -.06, ey: .03, mouth: '-' });
  const body = pivot(0, 0, 0, flame, face.struggle, face.calm);
  return { body, face, bob: .5, anim(t, calm, turb) {
    const f = Math.sin(t * 9) * .5 + Math.sin(t * 13.7) * .5;
    flame.scale.set(1 - f * .02 * (.4 + turb), 1 + f * .06 * (.4 + turb), 1);
    flame.rotation.z = Math.sin(t * 2.3) * .06 * (.5 + turb);
  } };
}
function spShame(mat) {
  const c = SP.shame, cl = 0xe6b8c4, b = new Builder();
  const whorls = [[0, .52, -.06, .27], [.03, .74, -.13, .18], [-.02, .87, -.17, .12], [.01, .96, -.19, .075], [0, 1.02, -.2, .04]];
  whorls.forEach(([x, y, z, r], i) => b.add(SPH, M(x, y, z, 0, 0, 0, r, r * .9, r), i % 2 ? cl : c));
  for (let i = 0; i < 4; i++) { const [x, y, z, r] = whorls[i]; b.add(new THREE.TorusGeometry(r * .93, r * .07, 5, 18), M(x, y - r * .45, z, Math.PI / 2 - .15, 0, 0), darker(c, .75), { outline: false }); }
  b.add(new THREE.TorusGeometry(.15, .045, 8, 20), M(0, .48, .19, -.2, 0, 0), 0xf1dde2);   // shell mouth
  b.add(SPH, M(0, .48, .17, -.2, 0, 0, .15, .15, .05), 0x4a3a40, { outline: false });
  const shell = build(b, mat);
  const k = new Builder(), C = V(0, 0, 0);
  k.add(SPH, M(0, 0, 0, 0, 0, 0, .12, .11, .11), 0xe0a07a);
  for (const s of [-1, 1]) k.add(SPH_S, M(s * .12, -.07, .05, 0, 0, s * .5, .04, .03, .035), 0xd98a6a);   // little claws
  const face = makeFace(mat, C, .11, { s: .55, gap: .085, brow: .6, my: -.07 });
  const critter = pivot(0, .47, .12, build(k, mat), face.struggle, face.calm);
  const body = pivot(0, 0, 0, shell, critter);
  return { body, face, bob: .4, anim(t, calm, turb) {
    critter.position.z = .13 + .07 * (1 - turb) + Math.sin(t * 1.3) * .01;
    critter.position.x = Math.sin(t * 25) * .006 * turb;
    shell.rotation.z = Math.sin(t * 6) * .025 * turb;
  } };
}
function spRestless(mat) {
  const c = SP.restless, b = new Builder(), C = V(0, Y0, 0);
  b.add(SPH, M(0, Y0, 0, 0, 0, 0, .15), c);
  const core = build(b, mat);
  const w = new Builder();
  for (let k = 0; k < 3; k++) {
    const pts = [];
    for (let i = 0; i <= 20; i++) { const s = i / 20, a = k * 2.094 + s * Math.PI * 1.5; pts.push(V(Math.cos(a) * (.2 + .17 * s), Math.sin(a) * (.2 + .17 * s) * .85, -.05 + Math.sin(s * 5 + k) * .05)); }
    w.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, .026 - k * .003, 6), M(), k === 1 ? darker(c, .88) : c);
    const e = pts[20]; w.add(SPH_S, M(e.x, e.y, e.z, 0, 0, 0, .026 - k * .003), c);
    const e0 = pts[0]; w.add(SPH_S, M(e0.x, e0.y, e0.z, 0, 0, 0, .026 - k * .003), c);
  }
  w.add(SPH_S, M(.38, .08, 0, 0, 0, .6, .045, .02, .03), 0x6f9e5a);             // a leaf caught in the wind
  const swirl = pivot(0, Y0, 0, build(w, mat));
  const face = makeFace(mat, C, .15, { s: .8, brow: .35, my: -.07 });
  const body = pivot(0, 0, 0, core, swirl, face.struggle, face.calm);
  let ang = 0, lt = null;
  return { body, face, anim(t, calm, turb) {
    const dt = lt == null ? 0 : clamp(t - lt, 0, .1); lt = t;
    ang += dt * (.5 + 4 * turb);
    swirl.rotation.z = ang;
    swirl.scale.setScalar(1 + Math.sin(t * 3) * .04 * turb);
    core.position.x = Math.sin(t * 8) * .01 * turb;
  } };
}
function spCant(mat) {
  const c = SP.cant, b = new Builder();
  b.add(F.dodec, M(0, .3, 0, .15, .3, 0, .36, .3, .3), c);
  b.add(F.ico, M(.3, .08, .15, 0, .5, 0, .1, .08, .1), darker(c, .85));
  b.add(F.ico1, M(-.05, .56, -.04, 0, 0, 0, .19, .05, .16), 0x7f9a6a);            // moss cap
  const stone = build(b, mat);
  const fl = new Builder();
  fl.add(CYL(.008, .006, 5), M(0, .06, 0, 0, 0, 0, 1, .12, 1), 0x5f8a4a, { outline: false });
  fl.add(SPH_S, M(.035, .05, 0, 0, 0, -.7, .035, .012, .02), 0x6f9e5a, { outline: false });
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 + .3; fl.add(SPH_S, M(Math.cos(a) * .04, .14 + Math.sin(a) * .04, .01, -.3, 0, a, .04, .022, .012), 0xf3d0dc); }
  fl.add(SPH_S, M(0, .14, .02, 0, 0, 0, .02, .02, .014), 0xf2c14e, { outline: false });
  const flower = pivot(-.06, .56, .02, build(fl, mat));
  const face = makeFace(mat, V(0, .3, -.02), .31, { lift: .03, gap: .09, ey: .01, er: .028, brow: .12, my: -.07, mouth: '-' });
  const body = pivot(0, 0, 0, stone, flower, face.struggle, face.calm);
  return { body, face, grounded: true, anim(t, calm, turb) {
    flower.scale.setScalar(Math.max(.001, smooth((calm - .35) / .6)));
    flower.rotation.z = Math.sin(t * 1.4) * .15;
    body.rotation.z = Math.sin(t * 17) * .015 * turb * turb;
    body.position.y = 0;
  } };
}

const SPIRITS = { worry: spWorry, doubt: spDoubt, regret: spRegret, sorrow: spSorrow, ember: spEmber, shame: spShame, restless: spRestless, cant: spCant };
export function makeSpirit(creatureId) {
  const mat = inkMat({ reveal: 'uniform' });
  const r = (SPIRITS[creatureId] || spWorry)(mat);
  const root = new THREE.Group(), float = new THREE.Group();
  float.add(r.body); root.add(float);
  const ph = creatureId.length * 1.7;
  root.userData = {
    creatureId, material: mat,
    update(t, calm = 0) {
      calm = clamp(calm, 0, 1);
      const turb = 1 - calm;
      mat.userData.sat.value = calm;
      r.face.struggle.visible = calm < .6; r.face.calm.visible = calm >= .6;
      if (!r.grounded) {
        float.position.y = Math.sin(t * (1.3 + turb) + ph) * .05 * (r.bob ?? 1) + Math.sin(t * 7 + ph) * .012 * turb;
        float.position.x = Math.sin(t * 3.1 + ph) * .02 * turb;
      }
      float.rotation.y = Math.sin(t * .5 + ph) * .12;
      r.anim(t, calm, turb);
    },
  };
  root.userData.update(0, 0);
  return noCast(root);
}
