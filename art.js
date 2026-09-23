// Hand-drawn (well, code-drawn) ink figures: player characters,
// guardian spirits and the wild spirits of the tall grass.
// All functions draw centred on (x, y) = the figure's feet.

import { stroke, rng, enso } from './world.js';

const INK = '#1d1b19';

function blob(ctx, x, y, rx, ry, color, alpha = 1) {
  ctx.globalAlpha = alpha; ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
}
function eyes(ctx, x, y, gap, r = 1.6, color = INK) {
  blob(ctx, x - gap, y, r, r * 1.2, color); blob(ctx, x + gap, y, r, r * 1.2, color);
}
export function lerpColor(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = s => [(pa >> s) & 255, (pb >> s) & 255];
  const mix = s => { const [u, v] = ch(s); return Math.round(u + (v - u) * t); };
  return `rgb(${mix(16)},${mix(8)},${mix(0)})`;
}
const GREY = '#8d8a82';

// ---------- player characters ----------
// dir: -1 left / 1 right; phase: walk cycle; s: scale
export function drawCharacter(ctx, id, x, y, dir, phase, s = 1) {
  const R = rng(7);
  const bob = Math.abs(Math.sin(phase)) * 2 * s;
  ctx.save(); ctx.translate(x, y); ctx.scale(dir < 0 ? -s : s, s);
  blob(ctx, 0, 1, 10, 3.5, 'rgba(0,0,0,.25)');
  ctx.translate(0, -bob);
  if (id === 'monk') {
    ctx.fillStyle = '#b8743a';                      // saffron robe
    ctx.beginPath(); ctx.moveTo(-8, 0); ctx.quadraticCurveTo(-9, -14, -4, -20); ctx.lineTo(5, -20);
    ctx.quadraticCurveTo(9, -12, 8, 0); ctx.closePath(); ctx.fill();
    stroke(ctx, [[-7, -1], [-6, -12], [-3, -19]], 2, INK, .8, R);
    stroke(ctx, [[2, -19], [-1, -8]], 1.5, '#7a4a22', .9, R);
    blob(ctx, 0, -24, 5, 5, '#e6c9a8');               // head
    blob(ctx, 0, -27, 11, 3.2, '#c9b27a');            // straw hat
    blob(ctx, 0, -29, 5, 3, '#d6c089');
    stroke(ctx, [[-11, -27], [0, -31], [11, -27]], 1.6, INK, .8, R);
    stroke(ctx, [[10, 2], [10, -30]], 2, '#5a4330', 1, R);   // staff
    blob(ctx, 2.5, -23, 0.9, 1, INK);
  } else if (id === 'fox') {
    const wag = Math.sin(phase * 2) * 3;
    ctx.fillStyle = '#d87a36';
    ctx.beginPath(); ctx.moveTo(-6, -8); ctx.quadraticCurveTo(-18 - wag, -10, -16, -22); ctx.quadraticCurveTo(-12, -12, -5, -12); ctx.fill();
    blob(ctx, -16, -21, 3, 3, '#f7efe3');             // tail tip
    blob(ctx, 0, -8, 8, 6, '#d87a36');                // body
    blob(ctx, 1, -5, 4, 3, '#f7efe3');
    for (const lx of [-5, -1, 3, 6]) stroke(ctx, [[lx, -4], [lx, 0]], 2, '#3a2a20', .9, R);
    blob(ctx, 5, -17, 6, 5.5, '#d87a36');             // head
    ctx.fillStyle = '#d87a36';
    ctx.beginPath(); ctx.moveTo(1, -20); ctx.lineTo(2, -28); ctx.lineTo(6, -21); ctx.fill();
    ctx.beginPath(); ctx.moveTo(6, -21); ctx.lineTo(9, -28); ctx.lineTo(10, -19); ctx.fill();
    blob(ctx, 10, -15, 3, 2.2, '#f7efe3');
    blob(ctx, 12.5, -15.5, 1, 1, INK);
    blob(ctx, 7, -18, 0.9, 1.2, INK);
    stroke(ctx, [[-7, -12], [0, -14], [5, -11]], 1.4, INK, .5, R);
  } else if (id === 'drop') {
    ctx.fillStyle = '#15171c';
    ctx.beginPath(); ctx.moveTo(0, -28);
    ctx.bezierCurveTo(4, -18, 10, -12, 10, -6); ctx.arc(0, -6, 10, 0, Math.PI, false);
    ctx.bezierCurveTo(-10, -12, -4, -18, 0, -28); ctx.fill();
    blob(ctx, -4, -12, 1.8, 3, 'rgba(255,255,255,.55)');
    eyes(ctx, 1.5, -8, 3.2, 1.3, '#f7efe3');
    const hue = (phase * 20) % 360;                       // a hint of the colour it carries
    blob(ctx, 0, -1, 7, 1.6, `hsla(${hue},70%,60%,.6)`);
  } else if (id === 'crane') {
    // Folded paper: each facet is filled, then outlined in ink so it reads on pale ground.
    const facet = (pts, fill) => {
      ctx.fillStyle = fill; ctx.beginPath(); pts.forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 1.1; ctx.lineJoin = 'round'; ctx.globalAlpha = .85; ctx.stroke(); ctx.globalAlpha = 1;
    };
    const flap = Math.sin(phase * 1.5) * 4;
    facet([[-16, -10], [0, -6], [4, -1], [-4, -1]], '#e4ddcc');               // tail + body, shadow side
    facet([[0, -6], [14, -10], [4, -1]], '#fbf8f1');                          // body, lit side
    facet([[-3, -7], [-11, -25 - flap], [2, -8]], '#d9d0bd');                // far wing
    facet([[1, -7], [9, -23 + flap], [5, -5]], '#fbf8f1');                   // near wing
    facet([[8, -5], [15, -22], [18, -20], [11, -4]], '#f1ebdf');             // neck
    blob(ctx, 16.5, -21.5, 1.8, 1.6, '#c0392b');                             // red crest
  }
  ctx.restore();
}

// ---------- guardians ----------
export function drawGuardian(ctx, pillar, x, y, t, colored, color) {
  const R = rng(pillar.length * 31);
  const c = colored ? color : GREY;
  const hover = Math.sin(t * 1.5) * 2;
  ctx.save(); ctx.translate(x, y);
  if (colored) { blob(ctx, 0, -14, 34, 26, color, .18 + Math.sin(t * 2) * .05); }
  blob(ctx, 0, 2, 16, 5, 'rgba(0,0,0,.2)');
  ctx.translate(0, hover * .5);
  if (pillar === 'present') {            // deer
    blob(ctx, 0, -18, 14, 8, c);
    for (const lx of [-9, -4, 5, 10]) stroke(ctx, [[lx, -12], [lx, 0]], 2.4, INK, .9, R);
    blob(ctx, 13, -30, 5, 6, c); stroke(ctx, [[10, -24], [12, -30]], 5, c, 1, R);
    stroke(ctx, [[12, -35], [9, -45], [5, -48]], 1.8, INK, .9, R); stroke(ctx, [[14, -35], [18, -45], [22, -47]], 1.8, INK, .9, R);
    stroke(ctx, [[10, -42], [7, -44]], 1.4, INK, .9, R); stroke(ctx, [[17, -42], [20, -43]], 1.4, INK, .9, R);
    blob(ctx, 15, -31, 1, 1.2, INK);
    for (let i = 0; i < 4; i++) blob(ctx, -6 + i * 4, -20 + (i % 2) * 3, 1.3, 1.3, '#f7efe3', .8);
  } else if (pillar === 'defusion') {    // koi, curling in the water
    const sw = Math.sin(t * 3) * 4;
    blob(ctx, 0, -8, 30, 10, 'rgba(79,149,176,.35)');
    ctx.fillStyle = colored ? '#f2f0ea' : '#bdbab2';
    ctx.beginPath(); ctx.ellipse(0, -10, 16, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-14, -10); ctx.lineTo(-24, -16 + sw); ctx.lineTo(-24, -4 + sw); ctx.fill();
    blob(ctx, 4, -12, 5, 3.5, c); blob(ctx, -6, -8, 4, 3, c);
    blob(ctx, 11, -11, 1, 1, INK);
    stroke(ctx, [[14, -8], [18, -5]], 1, INK, .7, R);
  } else if (pillar === 'acceptance') {  // turtle
    blob(ctx, 17, -8, 5, 4, colored ? '#9aa36b' : GREY); blob(ctx, 19, -9, 1, 1, INK);
    for (const [lx, ly] of [[-10, -2], [10, -2], [-12, -10], [12, -12]]) blob(ctx, lx, ly, 4, 3, colored ? '#9aa36b' : GREY);
    blob(ctx, 0, -10, 15, 10, c);
    for (let i = 0; i < 5; i++) blob(ctx, -8 + i * 4, -12 + (i % 2) * 4, 3, 2.5, INK, .25);
    stroke(ctx, [[-14, -8], [-6, -16], [6, -16], [14, -8]], 2, INK, .8, R);
  } else if (pillar === 'selfctx') {     // heron on one leg
    stroke(ctx, [[0, 0], [1, -18]], 1.6, INK, 1, R);
    stroke(ctx, [[1, -12], [-4, -16]], 1.2, INK, 1, R);
    blob(ctx, 0, -24, 8, 6, colored ? '#e8e6f0' : '#c9c6be');
    stroke(ctx, [[-6, -22], [-12, -18]], 3, c, 1, R);
    stroke(ctx, [[4, -28], [8, -38], [5, -44]], 3, colored ? '#e8e6f0' : '#c9c6be', 1, R);
    blob(ctx, 6, -46, 3.5, 3, colored ? '#e8e6f0' : '#c9c6be');
    stroke(ctx, [[8, -46], [17, -45]], 1.5, '#c9a13a', 1, R);
    stroke(ctx, [[4, -48], [-3, -46]], 1.2, INK, 1, R);
    blob(ctx, 7, -47, .9, .9, INK);
  } else if (pillar === 'values') {      // owl
    blob(ctx, 0, -16, 11, 14, c);
    blob(ctx, 0, -12, 7, 9, colored ? '#f1e2bd' : '#cfccc4');
    blob(ctx, -4.5, -24, 4, 4, '#f7efe3'); blob(ctx, 4.5, -24, 4, 4, '#f7efe3');
    blob(ctx, -4.5, -24, 2, 2.2, INK); blob(ctx, 4.5, -24, 2, 2.2, INK);
    ctx.fillStyle = '#c9a13a'; ctx.beginPath(); ctx.moveTo(-1.5, -21); ctx.lineTo(1.5, -21); ctx.lineTo(0, -18); ctx.fill();
    stroke(ctx, [[-9, -30], [-6, -28]], 2.5, INK, .8, R); stroke(ctx, [[9, -30], [6, -28]], 2.5, INK, .8, R);
    for (let i = 0; i < 3; i++) stroke(ctx, [[-3 + i * 3, -10], [-3 + i * 3, -7]], 1, INK, .4, R);
  } else if (pillar === 'action') {      // frog
    const hop = Math.max(0, Math.sin(t * 2.2)) * 5;
    ctx.translate(0, -hop);
    blob(ctx, 0, -8, 11, 8, c);
    blob(ctx, -5, -15, 4, 4, c); blob(ctx, 5, -15, 4, 4, c);
    blob(ctx, -5, -16, 2.2, 2.2, '#f7efe3'); blob(ctx, 5, -16, 2.2, 2.2, '#f7efe3');
    blob(ctx, -5, -16, 1.1, 1.3, INK); blob(ctx, 5, -16, 1.1, 1.3, INK);
    stroke(ctx, [[-4, -9], [0, -7], [4, -9]], 1.2, INK, .8, R);
    for (const s of [-1, 1]) stroke(ctx, [[s * 8, -4], [s * 13, -2], [s * 10, 0]], 2.4, c, 1, R);
  }
  ctx.restore();
}

// ---------- wild spirits ----------
// calm: 0 = wrapped in struggle (grey, turbulent), 1 = settled (full colour)
export function drawCreature(ctx, cr, x, y, s, t, calm = 1) {
  const R = rng(cr.id.length * 97 + 3);
  const c = lerpColor(GREY, cr.color, calm);
  const wob = Math.sin(t * 2) * 2 * (1 - calm * .6);
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  blob(ctx, 0, 2, 14, 4, 'rgba(0,0,0,.2)');
  ctx.translate(wob, 0);
  switch (cr.id) {
    case 'worry':
      for (let i = 0; i < 4; i++) blob(ctx, -14 + i * 4 + Math.sin(t * 2 + i) * 2, -6 + i * -3, 7 - i, 5 - i * .6, c, .5);
      blob(ctx, 4, -18, 11, 10, c, .9);
      eyes(ctx, 4, -19, 4, 1.6); stroke(ctx, [[1, -13], [4, -14], [7, -13]], 1.2, INK, .7, R);
      stroke(ctx, [[0, -25], [2, -27]], 1, INK, .6, R); stroke(ctx, [[8, -25], [6, -27]], 1, INK, .6, R);
      break;
    case 'doubt':
      for (let i = 0; i < 9; i++) {
        const a = i / 9 * Math.PI * 2;
        ctx.fillStyle = c; ctx.beginPath();
        ctx.moveTo(Math.cos(a - .25) * 10, -14 + Math.sin(a - .25) * 10);
        ctx.lineTo(Math.cos(a) * 17, -14 + Math.sin(a) * 17);
        ctx.lineTo(Math.cos(a + .25) * 10, -14 + Math.sin(a + .25) * 10); ctx.fill();
      }
      blob(ctx, 0, -14, 11, 11, c);
      eyes(ctx, 0, -15, 3.5, 1.4); stroke(ctx, [[-3, -9], [3, -10]], 1.2, INK, .7, R);
      break;
    case 'regret':
      for (let k = 3; k >= 1; k--) blob(ctx, -k * 4, -12, 8 + k * 2, 8 + k * 2, c, .18);
      blob(ctx, 0, -12, 9, 10, c);
      eyes(ctx, 0, -13, 3, 1.3); stroke(ctx, [[-3, -7], [0, -8], [3, -7]], 1.2, INK, .6, R);
      stroke(ctx, [[-4, -17], [-1, -16]], 1, INK, .5, R);
      break;
    case 'sorrow':
      for (let i = 0; i < 5; i++) {
        const dy = ((t * 30 + i * 13) % 22);
        stroke(ctx, [[-10 + i * 5, -8 + dy], [-11 + i * 5, -4 + dy]], 1.4, '#6f95b5', .7, R);
      }
      blob(ctx, -6, -18, 8, 6, c); blob(ctx, 5, -19, 9, 7, c); blob(ctx, 0, -23, 8, 6, c);
      eyes(ctx, 0, -18, 4, 1.3); stroke(ctx, [[-2, -13], [2, -13]], 1, INK, .6, R);
      break;
    case 'ember': {
      const f = Math.sin(t * 8) * 1.5;
      ctx.fillStyle = c; ctx.beginPath();
      ctx.moveTo(0, -30 - f); ctx.quadraticCurveTo(12, -16, 9, -6); ctx.arc(0, -6, 9, 0, Math.PI);
      ctx.quadraticCurveTo(-11, -16, 0, -30 - f); ctx.fill();
      blob(ctx, 0, -8, 5, 5, lerpColor(GREY, '#f2c14e', calm));
      eyes(ctx, 0, -13, 3.4, 1.3); stroke(ctx, [[-5, -17], [-2, -16]], 1.2, INK, .8, R); stroke(ctx, [[5, -17], [2, -16]], 1.2, INK, .8, R);
      break;
    }
    case 'shame':
      blob(ctx, 8, -6, 5, 3, lerpColor(GREY, '#e0a07a', calm));
      blob(ctx, 10, -10, 1, 1, INK);
      blob(ctx, -2, -12, 12, 11, c);
      stroke(ctx, [[-2, -12], [3, -14], [2, -19], [-5, -19], [-9, -13], [-6, -5], [3, -4]], 1.6, INK, .6, R);
      break;
    case 'restless':
      for (let k = 0; k < 3; k++) {
        const pts = [];
        for (let i = 0; i < 12; i++) { const a = i / 11 * Math.PI * 1.6 + t * 2 + k * 2; pts.push([Math.cos(a) * (6 + i + k * 2), -14 + Math.sin(a) * (4 + i * .6)]); }
        stroke(ctx, pts, 3, c, .8, R);
      }
      eyes(ctx, 0, -14, 3, 1.3);
      break;
    case 'cant':
      blob(ctx, 0, -10, 14, 11, c);
      blob(ctx, -4, -14, 6, 4, '#ffffff', .15);
      stroke(ctx, [[-10, -4], [0, -2], [10, -4]], 2, INK, .5, R);
      eyes(ctx, 0, -12, 4, 1.2); stroke(ctx, [[-3, -6], [3, -6]], 1.2, INK, .7, R);
      break;
  }
  ctx.restore();
}

export function drawEnso(ctx, x, y, r, color, w = 5, seed = 3) {
  enso(ctx, x, y, r, rng(seed), color, w, 1);
}
