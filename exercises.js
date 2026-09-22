// The six guardians' mini-exercises. Each takes the open panel element and
// the save state, runs until the player finishes, then resolves.

import { h, wait, say, choose } from './ui.js';
import { drawCharacter, drawGuardian, drawCreature, drawEnso } from './art.js';
import { VALUE_LANTERNS, SMALL_STEPS, CREATURES, PILLARS } from './content.js';
import * as audio from './audio.js';

const INK = '#1d1b19';
const SERIF = '"Iowan Old Style", Palatino, Georgia, serif';

// A canvas with a draw loop, a message line and a button row.
function stage(p, title) {
  const cv = h('canvas', { class: 'stage' }), msg = h('p', { class: 'msg' }), ctl = h('div', { class: 'ctl' });
  p.append(h('h2', { class: 'title' }, title), cv, msg, ctl);
  const g = cv.getContext('2d'), dpr = Math.min(2, devicePixelRatio || 1);
  let W = 0, H = 0, raf, draw = () => {};
  const t0 = performance.now();
  const tick = () => {
    const r = cv.getBoundingClientRect();
    if (r.width !== W || r.height !== H) { W = r.width; H = r.height; cv.width = W * dpr; cv.height = H * dpr; }
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    draw(g, W, H, (performance.now() - t0) / 1000);
    raf = requestAnimationFrame(tick);
  };
  tick();
  return {
    cv, ctl,
    draw(f) { draw = f; },
    msg(t) { msg.textContent = t; },
    stop() { cancelAnimationFrame(raf); },
    buttons(labels) {
      return new Promise(res => {
        ctl.innerHTML = '';
        labels.forEach((l, i) => ctl.append(h('button', { class: i === 0 ? 'primary' : '', onclick: () => { ctl.innerHTML = ''; audio.soft(); res(i); } }, l)));
      });
    },
  };
}
const ease = t => t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;

// ---------- Present Moment: breathe with the orb, then notice ----------
async function present(p, S) {
  const st = stage(p, 'The Breathing Grove');
  let r = 0.35, label = '', skip = false;
  st.draw((g, W, H, t) => {
    const gr = g.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, Math.max(W, H) * .7);
    gr.addColorStop(0, '#e8efd9'); gr.addColorStop(1, '#b9cf9c'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 7; i++) {                             // bamboo silhouettes
      const x = (i + .5) * W / 7 + Math.sin(t * .5 + i) * 3;
      g.fillStyle = 'rgba(47,90,47,.25)'; g.fillRect(x - 3, 0, 6, H);
    }
    const R = Math.min(W, H) * r;
    g.fillStyle = 'rgba(111,158,90,.35)'; g.beginPath(); g.arc(W / 2, H / 2, R, 0, Math.PI * 2); g.fill();
    drawEnso(g, W / 2, H / 2 + R * .0, R, INK, 4, 11);
    drawGuardian(g, 'present', W * .85, H - 10, t, true, PILLARS.present.color);
    g.fillStyle = INK; g.font = '20px ' + SERIF; g.textAlign = 'center'; g.fillText(label, W / 2, H / 2 + 7);
  });
  st.msg('Breathe with the circle: in as it grows, out as it softens. Three breaths.');
  const i = await st.buttons(['Begin', 'Skip']);
  if (i === 1) skip = true;
  st.ctl.append(h('button', { onclick: e => { skip = true; e.target.remove(); } }, 'Skip'));
  const animate = async (from, to, secs, text, inhale) => {
    label = text; audio.breath(inhale, secs);
    const t0 = performance.now();
    while (!skip) {
      const k = Math.min(1, (performance.now() - t0) / (secs * 1000));
      r = from + (to - from) * ease(k);
      if (k >= 1) break;
      await wait(30);
    }
  };
  for (let c = 0; c < 3 && !skip; c++) {
    await animate(0.2, 0.42, 4, 'in', true);
    await animate(0.42, 0.2, 6, 'out', false);
  }
  st.ctl.innerHTML = ''; label = ''; r = 0.3;
  st.msg('Now notice what is here. Tap three things you can notice right now.');
  const senses = ['Wind moving the bamboo', 'The weight of your body', 'Light between the leaves', 'The smell of damp earth', 'Your breath, just as it is', 'A thought passing by'];
  const picked = new Set();
  await new Promise(res => {
    const wrap = h('div', { class: 'chips' });
    senses.forEach(s => wrap.append(h('button', { class: 'chip', onclick: e => {
      picked.add(s); e.target.classList.add('on'); audio.soft();
      if (picked.size === 3) setTimeout(res, 500);
    } }, s)));
    st.ctl.append(wrap);
  });
  st.stop();
}

// ---------- Defusion: put thoughts on leaves ----------
async function defusion(p, S) {
  const st = stage(p, 'The Stream of Leaves');
  const leaves = [];
  st.draw((g, W, H, t) => {
    g.fillStyle = '#e9dcc0'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#6fa7bb'; g.fillRect(0, H * .25, W, H * .5);
    g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 1.5;
    for (let i = 0; i < 14; i++) {
      const y = H * .28 + (i % 7) * H * .065, x = ((t * 30 + i * 67) % (W + 80)) - 40;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 15, y - 4, x + 30, y); g.stroke();
    }
    for (const l of leaves) {
      l.x += 0.55; const y = l.y + Math.sin(t * 1.5 + l.seed) * 6;
      const a = Math.max(0, Math.min(1, (W + 20 - l.x) / 120));
      g.save(); g.globalAlpha = a; g.translate(l.x, y); g.rotate(Math.sin(t + l.seed) * .3);
      g.fillStyle = l.color; g.beginPath(); g.ellipse(0, 0, 16, 9, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = INK; g.lineWidth = 1; g.beginPath(); g.moveTo(-14, 0); g.lineTo(14, 0); g.stroke();
      g.rotate(-Math.sin(t + l.seed) * .3);
      g.fillStyle = INK; g.font = 'italic 13px ' + SERIF; g.textAlign = 'center'; g.fillText(l.text, 0, -16);
      g.restore();
    }
    drawGuardian(g, 'defusion', W * .15, H * .62, t, true, PILLARS.defusion.color);
  });
  st.msg('Tap a thought. Notice it as a thought, then set it on a leaf and let the stream carry it.');
  const thoughts = ['I\'m not good enough', 'Something bad will happen', 'I always mess things up', 'I can\'t handle this', 'Everyone else has it figured out'];
  let placed = 0;
  await new Promise(res => {
    const wrap = h('div', { class: 'chips' });
    const place = text => {
      const lower = /^I\b/.test(text) ? text : text.charAt(0).toLowerCase() + text.slice(1);
      st.msg(`"I'm having the thought that ${lower}."`);
      leaves.push({ text, x: -20, y: 0, seed: Math.random() * 9, color: ['#d9823b', '#c4552f', '#e0a53c'][placed % 3] });
      leaves[leaves.length - 1].y = st.cv.getBoundingClientRect().height * [.4, .56, .7][placed % 3];   // lanes, so labels don't overlap
      placed++; audio.soft();
      if (placed === 3) wrap.after(h('button', { class: 'primary', onclick: res }, 'Continue'));
    };
    thoughts.forEach(t => wrap.append(h('button', { class: 'chip', onclick: e => { e.target.disabled = true; place(t); } }, t)));
    const input = h('input', { type: 'text', maxlength: '40', placeholder: 'Or write your own thought (optional)' });
    const own = h('form', { class: 'own', onsubmit: e => { e.preventDefault(); if (input.value.trim()) { place(input.value.trim()); input.value = ''; input.blur(); } } },
      input, h('button', { type: 'submit' }, 'Leaf'));
    st.ctl.append(wrap, own);
  });
  st.stop();
  await say(['Ripple: "Did the thoughts disappear? No. They floated. You watched them instead of being them."',
             'Ripple: "A thought is a leaf, not the river. You are the one on the bank."']);
}

// ---------- Acceptance: brace against the wave, or open to it ----------
async function acceptance(p, S) {
  const st = stage(p, 'The Tidal Shore');
  let waveY = -0.2, splash = 0, calm = 0, figY = 0;
  st.draw((g, W, H, t) => {
    g.fillStyle = '#e3cc98'; g.fillRect(0, 0, W, H);
    const sea = H * .45;
    g.fillStyle = '#5f9fb5'; g.fillRect(0, 0, W, sea);
    const wy = waveY * H;
    g.fillStyle = 'rgba(79,149,176,.85)';
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, wy);
    for (let x = 0; x <= W; x += 10) g.lineTo(x, wy + Math.sin(x / 30 + t * 2) * 6);
    g.lineTo(W, 0); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath();
    for (let x = 0; x <= W; x += 10) g.lineTo(x, wy + Math.sin(x / 30 + t * 2) * 6); g.stroke();
    if (splash > 0) {
      for (let i = 0; i < 18; i++) {
        const a = i / 18 * Math.PI * 2;
        g.fillStyle = `rgba(255,255,255,${splash})`;
        g.beginPath(); g.arc(W / 2 + Math.cos(a) * (60 - splash * 40), H * .7 + Math.sin(a) * (30 - splash * 20), 6 * splash + 2, 0, 7); g.fill();
      }
      splash = Math.max(0, splash - .015);
    }
    drawCharacter(g, S.char, W / 2, H * .72 + figY, 1, 0, 1.6);
    drawGuardian(g, 'acceptance', W * .82, H * .9, t, true, PILLARS.acceptance.color);
  });
  const approach = async (to, ms) => { const from = waveY, t0 = performance.now(); for (let k = 0; k < 1;) { k = Math.min(1, (performance.now() - t0) / ms); waveY = from + (to - from) * ease(k); await wait(16); } };
  st.msg('A wave is coming. Your arms want to push it back.');
  while (calm < 3) {
    await approach(0.55, 2000);
    const i = await st.buttons(['Open, and let it pass', 'Brace against it']);
    if (i === 1) {
      audio.thud(); splash = 1; figY = 18;
      await approach(0.75, 400);
      st.msg('You brace. The wave slams into you and pushes you back. Fighting it took all your strength, and the wave came anyway.');
      await approach(-0.2, 1500); figY = 0;
    } else {
      calm++;
      await approach(0.95, 1800);
      st.msg(['The wave washes around you: cold, strong... and then it passes. You are still standing.',
              'Another wave. You make room for it. It is uncomfortable, and it passes.',
              'You barely move this time. The water comes and goes. You are here.'][calm - 1]);
      audio.bell(392, .05);
      await approach(-0.2, 1800);
    }
    await wait(900);
  }
  st.stop();
  await say(['Old Shell: "The waves did not get smaller. You stopped fighting them."',
             'Old Shell: "That is all acceptance is: letting what is here be here, so your arms are free for something else."']);
}

// ---------- Self-as-Context: you are the sky, not the weather ----------
async function selfctx(p, S) {
  const st = stage(p, 'The Mirror Lake');
  const kinds = [
    ['cloud', 'the thought "I\'m a failure"'], ['storm', 'a flash of anger'], ['rain', 'sadness'],
    ['sun', 'a moment of joy'], ['fog', 'confusion'], ['wind', 'restlessness'], ['cloud', 'a memory from childhood'],
  ];
  const items = []; let next = 0, noticed = 0;
  const spawn = W => { const [kind, label] = kinds[next++ % kinds.length]; items.push({ kind, label, x: -60, y: 30 + Math.random() * 120, v: 22 + Math.random() * 10, seen: false }); };
  let W0 = 300, last = 0;
  st.draw((g, W, H, t) => {
    W0 = W;
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#8ea6cf'); gr.addColorStop(.6, '#d9d3e8'); gr.addColorStop(.62, '#7a8fb8'); gr.addColorStop(1, '#5d6f9a');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    if (t - last > 3.2) { spawn(W); last = t; }
    const dt = 1 / 60;
    for (const it of items) {
      it.x += it.v * dt;
      for (const mirror of [false, true]) {
        const y = mirror ? H * 1.24 - it.y : it.y, a = mirror ? .3 : 1;
        g.globalAlpha = a; drawWeather(g, it.kind, it.x, y, t);
        if (it.seen && !mirror) { g.fillStyle = INK; g.font = 'italic 14px ' + SERIF; g.textAlign = 'center'; g.fillText(it.label, it.x, y + 34); }
      }
      g.globalAlpha = 1;
    }
    while (items.length && items[0].x > W + 80) items.shift();
    drawGuardian(g, 'selfctx', W * .85, H * .98, t, true, PILLARS.selfctx.color);
  });
  st.msg('You are the sky over the lake. Weather crosses it. Tap each piece of weather to notice it.');
  st.cv.addEventListener('pointerdown', e => {
    const r = st.cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    for (const it of items) if (!it.seen && Math.hypot(it.x - x, it.y - y) < 40) {
      it.seen = true; noticed++; audio.soft();
      st.msg(`You notice ${it.label}. It moves through. The sky stays the sky.  (${Math.min(noticed, 5)}/5)`);
      break;
    }
  });
  spawn(W0);
  while (noticed < 5) await wait(200);
  await wait(1200);
  st.stop();
  const i = await choose('Stillwater: "All of that passed through. Who was noticing it?"', ['The weather itself', 'Me: the one watching, like the sky']);
  await say(i === 0
    ? ['Stillwater: "Look again. The weather changed each moment. Something did not change: the one who saw it all."', 'Stillwater: "That steady noticing is you. It has been there your whole life."']
    : ['Stillwater: "Yes. Thoughts, feelings and memories all come and go. The one who notices them stays."', 'Stillwater: "The sky is never harmed by a storm. It simply has room for it."']);
}
function drawWeather(g, kind, x, y, t) {
  const puff = (c, a = 1) => { g.fillStyle = c; g.globalAlpha *= a; for (const [dx, dy, r] of [[-14, 2, 12], [0, -6, 16], [15, 2, 12], [0, 6, 14]]) { g.beginPath(); g.arc(x + dx, y + dy, r, 0, 7); g.fill(); } };
  const a0 = g.globalAlpha;
  if (kind === 'cloud') puff('#f4f2ee');
  else if (kind === 'storm') { puff('#5a5d6a'); g.globalAlpha = a0; if (Math.sin(t * 5) > .7) { g.strokeStyle = '#f2d36b'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y + 14); g.lineTo(x - 6, y + 26); g.lineTo(x + 3, y + 26); g.lineTo(x - 4, y + 38); g.stroke(); } }
  else if (kind === 'rain') { puff('#9aa4b5'); g.globalAlpha = a0; g.strokeStyle = '#5d7fa8'; g.lineWidth = 1.5; for (let i = 0; i < 5; i++) { const dy = (t * 40 + i * 9) % 22; g.beginPath(); g.moveTo(x - 12 + i * 6, y + 14 + dy); g.lineTo(x - 14 + i * 6, y + 20 + dy); g.stroke(); } }
  else if (kind === 'sun') { g.fillStyle = '#f2c14e'; g.beginPath(); g.arc(x, y, 14, 0, 7); g.fill(); g.strokeStyle = '#f2c14e'; g.lineWidth = 2; for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28 + t * .3; g.beginPath(); g.moveTo(x + Math.cos(a) * 18, y + Math.sin(a) * 18); g.lineTo(x + Math.cos(a) * 25, y + Math.sin(a) * 25); g.stroke(); } }
  else if (kind === 'fog') { puff('#dcdad6', .7); }
  else if (kind === 'wind') { g.strokeStyle = '#f4f2ee'; g.lineWidth = 2.5; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(x - 25, y - 8 + i * 8); g.bezierCurveTo(x - 5, y - 16 + i * 8, x + 5, y + i * 8, x + 25, y - 8 + i * 8); g.stroke(); } }
  g.globalAlpha = a0;
}

// ---------- Values: choose and light your lanterns ----------
async function values(p, S) {
  const st = stage(p, 'The Lantern Summit');
  const chosen = [];
  let lit = 0;
  st.draw((g, W, H, t) => {
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#2b2a45'); gr.addColorStop(1, '#6b5a78');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 30; i++) { g.fillStyle = 'rgba(255,255,255,.6)'; g.fillRect((i * 97) % W, (i * 53) % (H * .6), 1.5, 1.5); }
    g.fillStyle = '#3d3548'; g.beginPath(); g.moveTo(0, H); g.lineTo(W * .5, H * .7); g.lineTo(W, H); g.fill();
    chosen.forEach((v, i) => {
      const x = W * (i + 1) / (chosen.length + 1), rise = lit ? Math.min(1, lit) * H * .45 : 0;
      const y = H * .78 - rise + Math.sin(t * 1.5 + i) * 4;
      if (lit) { const gl = g.createRadialGradient(x, y, 2, x, y, 50); gl.addColorStop(0, 'rgba(255,210,110,.7)'); gl.addColorStop(1, 'rgba(255,210,110,0)'); g.fillStyle = gl; g.beginPath(); g.arc(x, y, 50, 0, 7); g.fill(); }
      g.fillStyle = lit ? '#f6c24a' : '#8d8676'; g.beginPath(); g.ellipse(x, y, 13, 17, 0, 0, 7); g.fill();
      g.strokeStyle = INK; g.lineWidth = 1; g.beginPath(); g.moveTo(x - 13, y); g.lineTo(x + 13, y); g.stroke();
      g.fillStyle = '#f7efe3'; g.font = '14px ' + SERIF; g.textAlign = 'center'; g.fillText(v, x, y + 34);
    });
    if (lit) lit = Math.min(1, lit + .004);
    drawGuardian(g, 'values', W * .12, H * .97, t, true, PILLARS.values.color);
  });
  st.msg('Choose up to three lanterns that feel like yours. There are no right answers.');
  await new Promise(res => {
    const wrap = h('div', { class: 'chips' });
    const go = h('button', { class: 'primary', disabled: '', onclick: res }, 'Light them');
    VALUE_LANTERNS.forEach(v => wrap.append(h('button', { class: 'chip', onclick: e => {
      const i = chosen.indexOf(v);
      if (i >= 0) { chosen.splice(i, 1); e.target.classList.remove('on'); }
      else if (chosen.length < 3) { chosen.push(v); e.target.classList.add('on'); audio.soft(); }
      go.disabled = chosen.length === 0;
    } }, v)));
    st.ctl.append(wrap, go);
  });
  st.ctl.innerHTML = ''; lit = 0.01; audio.chime();
  S.values = chosen.slice();
  st.msg('The lanterns rise. If you like, write a sentence about why one of them matters to you. It stays on this device.');
  await new Promise(res => {
    const input = h('textarea', { rows: '2', maxlength: '200', placeholder: 'Optional' });
    input.value = S.valueNote || '';
    st.ctl.append(input, h('button', { class: 'primary', onclick: () => { S.valueNote = input.value.trim(); res(); } }, 'Continue'));
  });
  st.stop();
  await say(['Lumen: "A value is a direction, not a place you arrive. You can always take one more step toward it."',
             'Lumen: "And notice: the things that hurt most often sit right next to the things you care about."']);
}

// ---------- Committed Action: stone by stone, with the voice along ----------
async function action(p, S) {
  const st = stage(p, 'The Stepping Stones');
  const value = (S.values && S.values[0]) || null;
  const cant = CREATURES.find(c => c.id === 'cant');
  let pos = 0, hopT = 1, showCant = false;
  const STONES = 3;
  st.draw((g, W, H, t) => {
    g.fillStyle = '#4f95b0'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1.2;
    for (let i = 0; i < 10; i++) { const y = (i * 37 + t * 8) % H; g.beginPath(); g.moveTo((i * 71) % W, y); g.lineTo((i * 71) % W + 20, y); g.stroke(); }
    g.fillStyle = '#94b86a'; g.fillRect(0, H - 40, W, 40); g.fillRect(0, 0, W, 34);
    const sx = i => W * (0.2 + 0.6 * (i % 2 ? .65 : .35)), sy = i => H - 40 - (i + 1) * (H - 74) / (STONES + 1);
    for (let i = 0; i < STONES; i++) { g.fillStyle = '#b8b3a3'; g.beginPath(); g.ellipse(sx(i), sy(i), 26, 12, 0, 0, 7); g.fill(); }
    // far-shore lantern
    const glow = g.createRadialGradient(W / 2, 22, 2, W / 2, 22, 40); glow.addColorStop(0, 'rgba(255,210,110,.8)'); glow.addColorStop(1, 'rgba(255,210,110,0)');
    g.fillStyle = glow; g.beginPath(); g.arc(W / 2, 22, 40, 0, 7); g.fill();
    g.fillStyle = '#f6c24a'; g.beginPath(); g.ellipse(W / 2, 20, 8, 11, 0, 0, 7); g.fill();
    if (value) { g.fillStyle = INK; g.font = '13px ' + SERIF; g.textAlign = 'center'; g.fillText(value, W / 2 + 40, 26); }
    // player position (0 = near shore, STONES+1 = far shore)
    const px = k => k === 0 ? W / 2 : k > STONES ? W / 2 : sx(k - 1), py = k => k === 0 ? H - 16 : k > STONES ? 36 : sy(k - 1) + 4;
    const from = Math.max(0, pos - 1), e = ease(Math.min(1, hopT));
    const x = px(from) + (px(pos) - px(from)) * e, y = py(from) + (py(pos) - py(from)) * e - Math.sin(e * Math.PI) * 24;
    if (hopT < 1) hopT += .03;
    drawCharacter(g, S.char, x, y, 1, t * 3, 1.3);
    if (showCant) drawCreature(g, cant, x - 30, y + 4, .9, t, .25);
    drawGuardian(g, 'action', W * .86, H - 12, t, true, PILLARS.action.color);
  });
  const steps = [];
  for (let i = 0; i < STONES; i++) {
    st.msg(value ? `Stone ${i + 1}. What is one small step toward ${value.toLowerCase()}?` : `Stone ${i + 1}. What is one small step toward something you care about?`);
    const pool = [...(SMALL_STEPS[value] || []), ...SMALL_STEPS.default].filter(s => !steps.includes(s)).slice(0, 3);
    const k = await st.buttons(pool);
    steps.push(pool[k]);
    showCant = true;
    st.msg(`${cant.name} appears: "What if you fail? Wait until you feel ready."`);
    while (await st.buttons(['Step, and let it come along', 'Wait until the voice is gone']) === 1)
      st.msg('You wait. The voice does not leave; voices like this rarely do. The stone stays where it is.');
    pos++; hopT = 0; audio.bell(440 + i * 50, .06);
    st.msg(`You step: "${steps[i]}". The voice comes too. That's all right.`);
    await wait(1400);
  }
  pos++; hopT = 0; await wait(1200);
  S.steps = steps;
  st.stop();
  await say(['Leap: "You crossed! Did the voice go away? Nope. You carried it the whole way."',
             'Leap: "That is committed action: one small step, then the next, toward what matters, with whatever comes along."']);
}

export const EXERCISES = { present, defusion, acceptance, selfctx, values, action };
