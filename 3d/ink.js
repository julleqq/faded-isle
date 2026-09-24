// Ink-wash shading shared by everything in the 3D world.
//
// Every world material is a MeshLambertMaterial patched in onBeforeCompile:
//  - the vertex shader passes the fragment's world position (after instancing and
//    grass sway) to the fragment shader;
//  - the fragment shader samples the colour-reveal mask at world XZ and mixes
//    between an ink/paper greyscale version and the real colour, with a darker
//    "watercolour bloom" rim where the two meet, and a paper-grain wash texture.
// Outlines are inverted hulls drawn in ink; their width is kept roughly constant
// on screen by extruding by distance to the camera.

import * as THREE from 'three';

THREE.ColorManagement.enabled = false;      // colours are used exactly as written (like the 2D painting)

export const WORLD = 80;                     // island is 80 × 80 tiles; 1 tile = 1 unit
export const INK = 0x1d1b19, PAPER = 0xefe7d6;

// ---------- shared uniforms ----------
export const U = {
  uMask: { value: null },                    // reveal mask (alpha = colour)
  uWash: { value: null },                    // tiling paper/wash grain
  uTime: { value: 0 },
  uDusk: { value: 0 },
  uPlayer: { value: new THREE.Vector3(-99, 0, -99) },
  uOutline: { value: 0.0026 },
};

// A soft, blotchy grain texture: the "wash" that makes flat colour look painted.
export function makeWash() {
  const n = 128, c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, n, n);
  let s = 7;
  const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 70; i++) {
    const x = R() * n, y = R() * n, r = 6 + R() * 26, v = R() < .5 ? 255 : 0;
    for (const [ox, oy] of [[0, 0], [n, 0], [-n, 0], [0, n], [0, -n]]) {   // wrap so it tiles
      const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      gr.addColorStop(0, `rgba(${v},${v},${v},.22)`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
      g.fillStyle = gr; g.fillRect(x + ox - r, y + oy - r, 2 * r, 2 * r);
    }
  }
  for (let i = 0; i < 1400; i++) { g.fillStyle = R() < .5 ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.1)'; g.fillRect(R() * n, R() * n, 1 + R() * 3, 1); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const VERT_HEAD = `
uniform float uTime;
uniform vec3 uPlayer;
varying vec3 vW;
#ifdef SWAY
attribute float aSway;
#endif
`;
const VERT_BODY = `
vec4 wq = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
wq = instanceMatrix * wq;
#endif
wq = modelMatrix * wq;
#ifdef SWAY
{
  float k = aSway * aSway;
  vec2 wind = vec2(sin(uTime * 1.1 + wq.x * .45 + wq.z * .3), cos(uTime * .8 + wq.z * .5)) * .09
            + vec2(sin(uTime * 2.3 + wq.z * 2.1), 0.) * .025;
  vec2 away = wq.xz - uPlayer.xz;                     // grass leans away from your body
  float d = length(away);
  vec2 push = d > .001 ? away / d * smoothstep(1.1, .2, d) * .45 : vec2(0.);
  vec2 off = (wind + push) * k;
  transformed.xz += off; wq.xz += off;
  transformed.y -= length(push) * k * .35; wq.y -= length(push) * k * .35;
}
#endif
vW = wq.xyz;
`;
const FRAG_HEAD = `
uniform sampler2D uMask;
uniform sampler2D uWash;
uniform float uSat;
uniform float uDusk;
varying vec3 vW;
vec3 inkify(vec3 col, float rv) {
  float l = dot(col, vec3(.3, .59, .11));
  l = clamp((l - .5) * 1.25 + .64, 0., 1.);
  vec3 ink = mix(vec3(.114, .106, .098), vec3(.93, .91, .865), l);
  float edge = smoothstep(.0, .45, rv) * smoothstep(1., .55, rv);   // watercolour bloom rim
  return mix(ink, col, rv) * (1. - .16 * edge);
}
`;
const FRAG_BODY = `
{
  float rv = uSat;
#ifdef REVEAL_MASK
  rv = smoothstep(.06, .62, texture2D(uMask, vW.xz / ${WORLD.toFixed(1)}).a) * (1. - uSat) + uSat;
#endif
  float w = texture2D(uWash, vW.xz * .075).r * .7 + texture2D(uWash, vW.xz * .43 + .37).r * .3;
  vec3 col = gl_FragColor.rgb * (.9 + .2 * w);
  col = inkify(col, rv);
  col = mix(col, col * vec3(1.06, .82, .8) + vec3(.07, .03, .06), uDusk * .6);
  gl_FragColor.rgb = col;
}
`;

// reveal: 'mask' (world colour mask), 'uniform' (per-material uSat, e.g. guardians), 'none' (always colour)
export function inkMat({ reveal = 'mask', sway = false, flat = false, color = 0xffffff, vertexColors = true, side = THREE.FrontSide, fog = true } = {}) {
  const m = new THREE.MeshLambertMaterial({ color, vertexColors, flatShading: flat, side, fog });
  const sat = { value: reveal === 'none' ? 1 : 0 };
  m.userData.sat = sat;
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { uMask: U.uMask, uWash: U.uWash, uTime: U.uTime, uDusk: U.uDusk, uPlayer: U.uPlayer, uSat: sat });
    const defs = (reveal === 'mask' ? '#define REVEAL_MASK\n' : '') + (sway ? '#define SWAY\n' : '');
    sh.vertexShader = defs + sh.vertexShader; sh.fragmentShader = defs + sh.fragmentShader;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>' + VERT_HEAD)
      .replace('#include <begin_vertex>', '#include <begin_vertex>' + VERT_BODY);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>' + FRAG_HEAD)
      .replace('#include <opaque_fragment>', '#include <opaque_fragment>' + FRAG_BODY);
  };
  m.customProgramCacheKey = () => `ink-${reveal}-${sway}`;
  return m;
}

// Ink outline: back faces pushed outwards along `aOut`, width grows with distance
// so it stays about the same on screen.
export function outlineMat(color = INK) {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, fog: true });
  m.onBeforeCompile = sh => {
    sh.uniforms.uOutline = U.uOutline;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aOut;\nuniform float uOutline;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 wo = modelMatrix * vec4(position, 1.0);
        float dd = distance(wo.xyz, cameraPosition);
        transformed += aOut * clamp(dd * uOutline, .006, .09);`);
  };
  m.customProgramCacheKey = () => 'outline';
  return m;
}

// ---------- geometry builder: merges many coloured primitives into one mesh ----------
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _c = new THREE.Color();
const _m3 = new THREE.Matrix3();
export class Builder {
  constructor() { this.P = []; this.N = []; this.C = []; this.S = []; this.OP = []; this.OD = []; }
  // geo: a BufferGeometry; m: Matrix4; color: hex or [hex per vertex fn]; opts.outline, opts.sway (fn(localPos) -> 0..1)
  add(geo, m, color, { outline = true, sway = null, shade = null } = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const pos = g.attributes.position, nor = g.attributes.normal;
    _m3.getNormalMatrix(m);
    const col = _c.set(color);
    const start = this.P.length / 3;
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i);
      const sw = sway ? sway(_v) : 0;
      const sh = shade ? shade(_v) : 1;
      _v.applyMatrix4(m);
      _n.fromBufferAttribute(nor, i).applyMatrix3(_m3).normalize();
      this.P.push(_v.x, _v.y, _v.z); this.N.push(_n.x, _n.y, _n.z);
      this.C.push(col.r * sh, col.g * sh, col.b * sh); this.S.push(sw);
    }
    if (outline) {
      // Smooth (position-welded) normals so the hull is closed at hard edges.
      const acc = new Map(), key = (x, y, z) => `${Math.round(x * 500)},${Math.round(y * 500)},${Math.round(z * 500)}`;
      for (let i = start; i < this.P.length / 3; i++) {
        const k = key(this.P[i * 3], this.P[i * 3 + 1], this.P[i * 3 + 2]);
        const a = acc.get(k) || [0, 0, 0];
        a[0] += this.N[i * 3]; a[1] += this.N[i * 3 + 1]; a[2] += this.N[i * 3 + 2]; acc.set(k, a);
      }
      for (let i = start; i < this.P.length / 3; i++) {
        const x = this.P[i * 3], y = this.P[i * 3 + 1], z = this.P[i * 3 + 2];
        const a = acc.get(key(x, y, z)), l = Math.hypot(...a) || 1;
        this.OP.push(x, y, z); this.OD.push(a[0] / l, a[1] / l, a[2] / l);
      }
    }
    if (g !== geo) g.dispose();
    return this;
  }
  get empty() { return !this.P.length; }
  geometry(withSway = false) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    if (withSway) g.setAttribute('aSway', new THREE.Float32BufferAttribute(this.S, 1));
    g.computeBoundingSphere();
    return g;
  }
  outlineGeometry() {
    if (!this.OP.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.OP, 3));
    g.setAttribute('aOut', new THREE.Float32BufferAttribute(this.OD, 3));
    g.computeBoundingSphere();
    return g;
  }
  // mesh (+ outline) in a group
  build(mat, olMat, withSway = false) {
    const grp = new THREE.Group();
    if (this.empty) return grp;
    const mesh = new THREE.Mesh(this.geometry(withSway), mat);
    grp.add(mesh);
    const og = olMat && this.outlineGeometry();
    if (og) grp.add(new THREE.Mesh(og, olMat));
    return grp;
  }
}

// Matrix helper: translate, rotate (euler XYZ), scale.
const _q = new THREE.Quaternion(), _e = new THREE.Euler();
export function M(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _e.set(rx, ry, rz);
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q.setFromEuler(_e), new THREE.Vector3(sx, sy, sz));
}

// Cached primitive geometries (low-poly).
export const GEO = {
  ico: new THREE.IcosahedronGeometry(1, 0),
  ico1: new THREE.IcosahedronGeometry(1, 1),
  sphere: new THREE.SphereGeometry(1, 10, 7),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 7),
  cyl12: new THREE.CylinderGeometry(1, 1, 1, 12),
  cone: new THREE.ConeGeometry(1, 1, 7),
  cone4: new THREE.ConeGeometry(1, 1, 4),
  box: new THREE.BoxGeometry(1, 1, 1),
  dodec: new THREE.DodecahedronGeometry(1, 0),
  oct: new THREE.OctahedronGeometry(1, 0),
};
// a tapered trunk: radius r0 at the bottom, r1 at the top, height h, base at y=0
export function trunk(r0, r1, h, seg = 6) { const g = new THREE.CylinderGeometry(r1, r0, h, seg); g.translate(0, h / 2, 0); return g; }

// Soft radial sprite texture (glows, blob shadows, markers).
export function radialTex(stops, size = 64) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}
