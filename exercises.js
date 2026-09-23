// The six guardians' mini-exercises. Each takes the open panel element and
// the save state, runs until the player finishes, then resolves.

import { h, wait, say, choose } from './ui.js';
import { drawCharacter, drawGuardian, drawCreature, drawEnso } from './art.js';
import { VALUE_LANTERNS, SMALL_STEPS, CREATURES, PILLARS } from './content.js';
import * as audio from './audio.js';

// Every player-facing string of the exercises, grouped per exercise, for translation.
// {placeholders} are filled in by fmt(); keep them whole in translated sentences.
const TEXT = {
  present: {
    intro: 'Breathe with the circle: in as it grows, out as it softens. Three breaths.',
    begin: 'Begin', skip: 'Skip',
    breath: 'Breath {n} of 3. Let it be just as it is.',
    in: 'in', out: 'out',
    notice: 'Now notice what is here. Tap each thing as you notice it: at least four.',
    count: 'Noticed {n} of 4. Take a moment with each one.',
    enough: 'You can keep noticing, or continue when you are ready.',
    things: ['Your breath, just as it is', 'The weight of your body', 'A thought passing by', 'A sound, near or far',
      'Air or fabric touching your skin', 'A taste in your mouth, or none', 'Light and colour in front of you',
      'Where your body meets the ground or seat', 'A smell, or the absence of one'],
    cont: 'Continue',
  },
  defusion: {
    intro: 'Tap a thought. Notice it as a thought, then set it on a leaf and let the stream carry it.',
    thoughts: ['I\'m not good enough', 'Something bad will happen', 'I always mess things up', 'I can\'t handle this', 'Everyone else has it figured out'],
    having: '"I\'m having the thought that {thought}."',
    own: 'Or write your own thought (optional)', leaf: 'Leaf', cont: 'Continue',
    outro: ['Ripple: "Did the thoughts disappear? No. They floated. You watched them instead of being them."',
            'Ripple: "A thought is a leaf, not the river. You are the one on the bank."'],
  },
  acceptance: {
    explore: 'Drag anywhere on the shore to walk. When the waves come, move however you like: into them, away from them, anything.',
    hint: 'drag to walk',
    effort: 'effort',
    coming: 'A wave is coming… Move however you like.',
    into: 'You push into the wave. It pushes back harder.',
    away: 'You run. The wave is faster than you.',
    side: 'You try to dodge. The wave is wider than you.',
    still: 'You stay where you are. The wave washes around you, and passes.',
    triedLines: ['Old Shell: "Did pushing or running stop the wave? It came anyway, and it cost you."'],
    stillLines: ['Old Shell: "You stood still. Many people push or run. Now let us stay on purpose, and notice what it is like."'],
    advice: ['Old Shell: "Now try this: when the next wave comes, stay where you are. Feel your feet in the sand. Let it wash around you."'],
    stay: 'Stay where you are. Feel your feet in the sand. Let the waves come.',
    coming2: 'A wave is coming… Stay. Feel your feet in the sand.',
    calm: ['The wave washes around you: cold, strong… and then it passes. You are still standing.',
           'Another wave. You make room for it. It is uncomfortable, and it passes.',
           'The water comes and goes around your feet. You are here.'],
    moved: 'You moved, and the wave tossed you about. That\'s all right. Next time, see what happens if you stay.',
    outro: ['Old Shell: "The waves never got smaller. Pushing into them or running from them only cost effort, and the water came anyway."',
            'Old Shell: "When you stayed and made room, the same water washed around you and passed. You were still standing."',
            'Old Shell: "That is acceptance: not liking the wave, not making it go away. Letting it be here, so your strength is free for what matters."'],
  },
  selfctx: {
    intro: 'You are the sky over the lake. Weather crosses it. Tap a piece of weather, then name what it is.',
    pick: 'Name what you notice: {item}',
    named: 'You notice {label}: {item}. It drifts on. The sky stays the sky.',
    push: 'Pushing the weather doesn\'t clear the sky. It only swells. Try noticing it instead.',
    storm: 'A storm rolls in: so much at once. Keep noticing, one piece at a time. Behind it, the sky has not changed.',
    calm: 'The storm moves on. The sky is exactly as it was.',
    done: 'Ten pieces of weather came and went. The sky held every one of them.',
    count: 'noticed {n} of {total}',
    labels: ['a thought', 'a feeling', 'a body sensation', 'a memory', 'an urge'],
    // [look, what it carries]
    weather: [['cloud', '"I\'m a failure"'], ['storm', 'anger'], ['rain', 'sadness'], ['sun', 'a flicker of joy'],
      ['fog', 'a tight chest'], ['wind', 'the urge to run'], ['cloud', 'a childhood summer'], ['cloud', '"What if they leave?"'],
      ['storm', 'frustration'], ['fog', 'a knot in the stomach'], ['wind', 'the urge to check your phone'], ['rain', 'an old goodbye'],
      ['cloud', '"I should be further along"'], ['storm', 'a pounding heart'], ['sun', 'a friend\'s laugh'], ['wind', 'the urge to snap back'],
      ['rain', 'loneliness'], ['fog', '"I can\'t think straight"']],
    question: 'Stillwater: "All of that passed through. Who was noticing it?"',
    answers: ['The weather itself', 'Me: the one watching, like the sky'],
    replies: [['Stillwater: "Look again. The weather changed each moment. Something did not change: the one who saw it all."',
               'Stillwater: "That steady noticing is you. It has been there your whole life."'],
              ['Stillwater: "Yes. Thoughts, feelings and memories all come and go. The one who notices them stays."',
               'Stillwater: "The sky is never harmed by a storm. It simply has room for it."']],
  },
  values: {
    intro: 'Choose up to three lanterns that feel like yours. There are no right answers.',
    light: ['Choose a lantern first', 'Light 1 lantern', 'Light 2 lanterns', 'Light 3 lanterns'],
    max: 'Three is plenty for now. Tap a chosen lantern again to set it down.',
    rise: 'The lanterns rise. If you like, write a sentence about why one of them matters to you. It stays on this device.',
    note: 'Optional', cont: 'Continue',
    outro: ['Lumen: "A value is a direction, not a place you arrive. You can always take one more step toward it."',
            'Lumen: "And notice: the things that hurt most often sit right next to the things you care about."'],
  },
  action: {
    choose: 'Choose one value to walk toward.',
    chooseMine: 'Choose one value to walk toward. Your own lanterns come first.',
    stone: 'Stone {n}. What is one small step toward {value}?',
    last: 'Last stone. Write one small step of your own toward {value}: something you could really do.',
    placeholder: 'My small step…', step: 'Step',
    cant: '{name} appears: "What if you fail? Wait until you feel ready."',
    go: 'Step, and let it come along', wait: 'Wait until the voice is gone',
    waited: 'You wait. The voice does not leave; voices like this rarely do. The stone stays where it is.',
    stepped: 'You step: "{step}". The voice comes too. That\'s all right.',
    outro: ['Leap: "You crossed! Did the voice go away? Nope. You carried it the whole way."',
            'Leap: "That is committed action: one small step, then the next, toward what matters, with whatever comes along."'],
  },
};

const INK = '#1d1b19', PAPER = '#f7f2e7';
const SERIF = '"Iowan Old Style", Palatino, Georgia, serif';
const fmt = (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => o[k]);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// Exercise-only styles: a fixed-height message line and a stable control area,
// so nothing moves under the finger when text or buttons change.
document.head.append(h('style', {}, `
#panel.exercise .msg { min-height: 4.4em; display: flex; align-items: center; justify-content: center; margin: 10px 0; }
#panel.exercise .ctl { min-height: 124px; align-content: flex-start; }
#panel.exercise .ctl > .chips, #panel.exercise .ctl > .own, #panel.exercise .ctl > textarea { width: 100%; }
#panel.exercise .stage { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; touch-action: manipulation; }
#panel.exercise .stage.drag { touch-action: none; }
#panel.exercise .stage.tall { height: 58vh; }
#panel.exercise .stage.mid { height: 50vh; }
#panel.exercise .stage.short { height: 24vh; min-height: 150px; }
#panel.exercise button { min-height: 44px; touch-action: manipulation; }
#panel.exercise button.on { background: var(--ink); color: var(--paper-2); opacity: 1; transform: translateY(1px); box-shadow: 1px 1px 0 rgba(29,27,25,.18); }
#panel.exercise .chip.mine { background: #f6e1a6; border-width: 2px; }
#panel.exercise .chip.mine.on { background: var(--ink); }
#panel.exercise .lightbtn { width: 100%; margin: 0 0 12px; font-size: 18px; padding: .75em 1em; color: var(--ink); background: linear-gradient(#fbdc86, #f0b43c);
  border: 2px solid #8a5a12; box-shadow: 0 0 20px 5px rgba(246,194,74,.6), 2px 3px 0 rgba(29,27,25,.2); }
#panel.exercise .lightbtn:disabled { opacity: 1; background: transparent; color: var(--ink-soft); border: 1.5px dashed var(--ink-soft); box-shadow: none; }
#panel.exercise .labels { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; width: 100%; }
#panel.exercise .labels button { border-radius: 12px; padding: .55em .4em; }
#panel.exercise .labels button:last-child { grid-column: 1 / -1; }
`));
// iOS Safari only shows :active styles when a touchstart listener exists.
document.addEventListener('touchstart', () => {}, { passive: true });

// A canvas with a draw loop, a message line and a button row.
function stage(p, title, cls = '') {
  const cv = h('canvas', { class: 'stage ' + cls }), msg = h('p', { class: 'msg' }), ctl = h('div', { class: 'ctl' });
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
    set(...nodes) { ctl.replaceChildren(...nodes); },
    pt(e) { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; },
    // One tap acts once: the tapped button shows pressed at once, the others disable.
    buttons(labels, cls = i => i === 0 ? 'primary' : '', wrap = '') {
      return new Promise(res => {
        let done = false;
        const bs = labels.map((l, i) => h('button', { class: cls(i), onclick: e => {
          if (done) return; done = true;
          for (const b of bs) if (b === e.currentTarget) b.classList.add('on'); else b.disabled = true;
          audio.soft(); res(i);
        } }, l));
        ctl.replaceChildren(...(wrap ? [h('div', { class: wrap }, bs)] : bs));
      });
    },
  };
}
const ease = t => t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
function pill(g, x, y, w, hh) {
  const r = hh / 2;
  g.beginPath(); g.arc(x + r, y + r, r, Math.PI / 2, Math.PI * 1.5); g.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2); g.closePath();
}
function label(g, text, x, y, font, align = 'center') {       // ink text with a paper halo
  g.font = font; g.textAlign = align; g.lineJoin = 'round';
  g.strokeStyle = 'rgba(247,242,231,.85)'; g.lineWidth = 4; g.strokeText(text, x, y);
  g.fillStyle = INK; g.fillText(text, x, y);
}

// ---------- Present Moment: breathe with the orb, then notice ----------
async function present(p, S) {
  const T = TEXT.present, st = stage(p, PILLARS.present.region);
  let r = 0.35, word = '', skip = false;
  st.draw((g, W, H, t) => {
    const gr = g.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, Math.max(W, H) * .7);
    gr.addColorStop(0, '#e8efd9'); gr.addColorStop(1, '#b9cf9c'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 7; i++) {                             // bamboo silhouettes
      const x = (i + .5) * W / 7 + Math.sin(t * .5 + i) * 3;
      g.fillStyle = 'rgba(47,90,47,.25)'; g.fillRect(x - 3, 0, 6, H);
    }
    const R = Math.min(W, H) * r;
    g.fillStyle = 'rgba(111,158,90,.35)'; g.beginPath(); g.arc(W / 2, H / 2, R, 0, Math.PI * 2); g.fill();
    drawEnso(g, W / 2, H / 2, R, INK, 4, 11);
    drawGuardian(g, 'present', W * .85, H - 10, t, true, PILLARS.present.color);
    g.fillStyle = INK; g.font = '20px ' + SERIF; g.textAlign = 'center'; g.fillText(word, W / 2, H / 2 + 7);
  });
  st.msg(T.intro);
  if (await st.buttons([T.begin, T.skip]) === 1) skip = true;
  const skipBtn = h('button', { onclick: () => { skip = true; skipBtn.disabled = true; } }, T.skip);
  st.set(skipBtn);
  const animate = async (from, to, secs, text, inhale) => {
    word = text; audio.breath(inhale, secs);
    const t0 = performance.now();
    while (!skip) {
      const k = Math.min(1, (performance.now() - t0) / (secs * 1000));
      r = from + (to - from) * ease(k);
      if (k >= 1) break;
      await wait(30);
    }
  };
  for (let c = 0; c < 3 && !skip; c++) {
    st.msg(fmt(T.breath, { n: c + 1 }));
    await animate(0.2, 0.42, 4, T.in, true);
    await animate(0.42, 0.2, 6, T.out, false);
  }
  word = ''; r = 0.3;
  st.cv.classList.add('short');                            // room for the list without scrolling
  st.msg(T.notice);
  let n = 0;
  await new Promise(res => {
    const go = h('button', { class: 'primary', disabled: '', onclick: () => { go.disabled = true; go.classList.add('on'); audio.soft(); res(); } }, T.cont);
    const chips = T.things.map(s => h('button', { class: 'chip', onclick: e => {
      const b = e.currentTarget;
      if (b.classList.contains('on')) return;
      b.classList.add('on'); audio.soft(); n++;
      st.msg(n >= 4 ? T.enough : fmt(T.count, { n }));
      if (n >= 4) go.disabled = false;
    } }, s));
    st.set(h('div', { class: 'chips' }, chips), go);
  });
  st.stop();
}

// ---------- Defusion: put thoughts on leaves ----------
async function defusion(p, S) {
  const T = TEXT.defusion, st = stage(p, PILLARS.defusion.region);
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
      l.x += 0.55; const y = l.y * H + Math.sin(t * 1.5 + l.seed) * 6;
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
  st.msg(T.intro);
  let placed = 0;
  await new Promise(res => {
    const go = h('button', { class: 'primary', disabled: '', onclick: () => { go.disabled = true; go.classList.add('on'); audio.soft(); res(); } }, T.cont);
    const place = text => {
      const lower = /^I\b/.test(text) ? text : text.charAt(0).toLowerCase() + text.slice(1);
      st.msg(fmt(T.having, { thought: lower }));
      leaves.push({ text, x: -20, y: [.4, .56, .7][placed % 3], seed: Math.random() * 9, color: ['#d9823b', '#c4552f', '#e0a53c'][placed % 3] });   // lanes, so labels don't overlap
      placed++; audio.soft();
      if (placed >= 3) go.disabled = false;
    };
    const chips = T.thoughts.map(t => h('button', { class: 'chip', onclick: e => { e.currentTarget.disabled = true; place(t); } }, t));
    const input = h('input', { type: 'text', maxlength: '40', placeholder: T.own, enterkeyhint: 'done' });
    const own = h('form', { class: 'own', onsubmit: e => { e.preventDefault(); if (input.value.trim()) { place(input.value.trim()); input.value = ''; input.blur(); } } },
      input, h('button', { type: 'submit' }, T.leaf));
    st.set(h('div', { class: 'chips' }, chips), go, own);
  });
  st.stop();
  await say(T.outro);
}

// ---------- Acceptance: walk into the waves, run from them, or stay ----------
async function acceptance(p, S) {
  const T = TEXT.acceptance, st = stage(p, PILLARS.acceptance.region, 'drag tall');
  let me = null, joy = null, wave = null, last = 0, phase2 = false, calm = 0, walked = false;
  let effort = 10, shown = 10, splash = 0, ripple = 0, tumble = 0, tumble0 = 1, spin = 1, kb = 0;
  const intent = { x: 0, y: 0 };                             // joystick direction, smoothed over ~0.3 s
  // floating joystick: press anywhere on the shore and drag
  st.cv.addEventListener('pointerdown', e => {
    e.preventDefault(); const q = st.pt(e);
    joy = { id: e.pointerId, ox: q.x, oy: q.y, x: q.x, y: q.y };
    try { st.cv.setPointerCapture(e.pointerId); } catch (_) {}
  });
  st.cv.addEventListener('pointermove', e => { if (joy && e.pointerId === joy.id) { e.preventDefault(); const q = st.pt(e); joy.x = q.x; joy.y = q.y; } });
  const end = e => { if (joy && e.pointerId === joy.id) joy = null; };
  st.cv.addEventListener('pointerup', end); st.cv.addEventListener('pointercancel', end);

  const hit = () => {
    const m = Math.hypot(intent.x, intent.y), ax = Math.abs(intent.x) * .7;
    const o = m < .3 ? 'still' : -intent.y > ax ? 'into' : intent.y > ax ? 'away' : 'side';
    if (o === 'still') { ripple = 1; audio.bell(392, .05); effort -= phase2 ? 25 : 8; }
    else {
      audio.thud(); splash = o === 'into' ? 1.4 : 1;
      tumble = tumble0 = o === 'into' ? .9 : 1.2; spin = o === 'side' ? Math.sign(intent.x) : o === 'into' ? -1 : 1;
      kb = o === 'into' ? 240 : 150; effort += o === 'into' ? 40 : 32;
    }
    effort = clamp(effort, 0, 100); wave.outcome = o; wave.onhit(o);
  };
  st.draw((g, W, H, t) => {
    const dt = Math.min(.05, t - last); last = t;
    const sea = H * .34;
    if (!me) me = { x: W * .4, y: H * .72, dir: 1, phase: 0 };
    // move
    let ix = 0, iy = 0;
    if (joy) { ix = (joy.x - joy.ox) / 44; iy = (joy.y - joy.oy) / 44; const m = Math.hypot(ix, iy); if (m > 1) { ix /= m; iy /= m; } else if (m < .15) ix = iy = 0; }
    const k = 1 - Math.exp(-dt / .3); intent.x += (ix - intent.x) * k; intent.y += (iy - intent.y) * k;
    const wet = wave && wave.y > me.y - 4;
    if (tumble > 0) tumble -= dt;
    else if (ix || iy) {
      const sp = wet ? 25 : 60;
      me.x += ix * sp * dt; me.y += iy * sp * dt; me.phase += dt * 10; walked = true;
      if (Math.abs(ix) > .2) me.dir = Math.sign(ix);
      if (wet) effort = Math.min(100, effort + 12 * dt);     // struggling in the water
    }
    if (kb > 0) { me.y += kb * dt; kb = Math.max(0, kb - 520 * dt); }
    if (!wet) effort = Math.max(0, effort - 1.2 * dt);
    me.x = clamp(me.x, 26, W - 26); me.y = clamp(me.y, sea + 24, H - 22);
    // the wave: out at sea first, then up the beach (faster than you can walk), then back
    if (wave) {
      if (wave.dir > 0) {
        wave.y += (wave.y < sea ? sea / 1.8 : 95) * dt;
        if (!wave.hit && wave.y >= me.y - 2) { wave.hit = true; hit(); }
        if (wave.y >= H + 12) wave.dir = -1;
      } else if ((wave.y -= 100 * dt) <= sea) { const w = wave; wave = null; w.res(w.outcome); }
    }
    // draw: sand, sea, wave
    g.fillStyle = '#e3cc98'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#5f9fb5'; g.beginPath(); g.moveTo(0, 0);
    for (let x = 0; x < W + 10; x += 10) g.lineTo(x, sea + Math.sin(x / 40 + t) * 3);
    g.lineTo(W, 0); g.fill();
    if (wave) {
      const wy = wave.y, edge = x => wy + Math.sin(x / 26 + t * 3) * 5;
      g.fillStyle = wy > sea ? 'rgba(95,159,181,.75)' : 'rgba(35,95,125,.45)';
      g.beginPath(); g.moveTo(0, wy > sea ? sea - 4 : wy - 22);
      for (let x = 0; x < W + 8; x += 8) g.lineTo(x, edge(x));
      g.lineTo(W, wy > sea ? sea - 4 : wy - 22); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 4; g.beginPath();
      for (let x = 0; x < W + 8; x += 8) g.lineTo(x, edge(x)); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.8)';
      for (let i = 0; i < 12; i++) { const x = (i * 53 + t * 20) % W; g.beginPath(); g.arc(x, edge(x) - 5, 2.5, 0, 7); g.fill(); }
    }
    drawGuardian(g, 'acceptance', W * .84, H * .92, t, true, PILLARS.acceptance.color);
    // you
    const rot = tumble > 0 ? spin * Math.sin((1 - tumble / tumble0) * Math.PI) * 1.4 : 0;
    g.save(); g.translate(me.x, me.y - 16); g.rotate(rot); drawCharacter(g, S.char, 0, 16, me.dir, me.phase, 1.5); g.restore();
    if (wet) {
      g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 2;
      g.beginPath(); g.ellipse(me.x, me.y, 18 + Math.sin(t * 4) * 2, 6, 0, 0, 7); g.stroke();
    }
    if (ripple > 0) {                                          // the water parting calmly around you
      g.strokeStyle = `rgba(255,255,255,${ripple})`; g.lineWidth = 2;
      for (const k of [0, .35]) { const e = 1 - ripple + k; g.beginPath(); g.ellipse(me.x, me.y, 20 + e * 50, 7 + e * 16, 0, 0, 7); g.stroke(); }
      ripple = Math.max(0, ripple - dt * .6);
    }
    if (splash > 0) {
      g.fillStyle = `rgba(255,255,255,${Math.min(1, splash)})`;
      for (let i = 0; i < 18; i++) {
        const a = i / 18 * Math.PI * 2, d = 50 - splash * 30;
        g.beginPath(); g.arc(me.x + Math.cos(a) * d, me.y - 20 + Math.sin(a) * d * .6, 5 * splash + 1.5, 0, 7); g.fill();
      }
      splash = Math.max(0, splash - dt * .9);
    }
    if (!walked && !phase2) label(g, T.hint, me.x, me.y + 22, 'italic 14px ' + SERIF);
    // effort meter
    shown += (effort - shown) * Math.min(1, dt * 3);
    g.font = '13px ' + SERIF; const lw = g.measureText(T.effort).width, bw = 64;
    g.fillStyle = 'rgba(247,242,231,.92)'; pill(g, 8, 8, lw + bw + 30, 26); g.fill();
    g.fillStyle = INK; g.textAlign = 'left'; g.fillText(T.effort, 20, 25);
    g.strokeStyle = INK; g.lineWidth = 1.5; pill(g, lw + 28, 16, bw, 10); g.stroke();
    g.save(); pill(g, lw + 28, 16, bw, 10); g.clip(); g.fillRect(lw + 28, 16, bw * shown / 100, 10); g.restore();
    if (phase2) for (let i = 0; i < 3; i++) {
      g.fillStyle = i < calm ? INK : 'rgba(247,242,231,.9)'; g.strokeStyle = INK; g.lineWidth = 1.5;
      g.beginPath(); g.arc(W - 20 - (2 - i) * 20, 21, 6, 0, 7); g.fill(); g.stroke();
    }
    if (joy) {
      const v = { x: ix, y: iy };
      g.strokeStyle = 'rgba(29,27,25,.45)'; g.lineWidth = 3; g.beginPath(); g.arc(joy.ox, joy.oy, 44, 0, 7); g.stroke();
      g.fillStyle = 'rgba(29,27,25,.35)'; g.beginPath(); g.arc(joy.ox + v.x * 44, joy.oy + v.y * 44, 20, 0, 7); g.fill();
    }
  });
  const runWave = onhit => new Promise(res => { wave = { y: 0, dir: 1, hit: false, onhit, res }; st.msg(phase2 ? T.coming2 : T.coming); audio.soft(); });

  st.msg(T.explore);
  await wait(3000);
  const tried = new Set();
  for (let i = 0; i < 3; i++) { tried.add(await runWave(o => st.msg(T[o]))); await wait(1500); }
  joy = null;
  await say([...(tried.size === 1 && tried.has('still') ? T.stillLines : T.triedLines), ...T.advice]);
  phase2 = true; st.msg(T.stay);
  await wait(2200);
  while (calm < 3) {
    await runWave(o => { if (o === 'still') st.msg(T.calm[calm++]); else st.msg(T.moved); });
    await wait(1500);
  }
  st.stop();
  await say(T.outro);
}

// ---------- Self-as-Context: you are the sky, not the weather ----------
async function selfctx(p, S) {
  const T = TEXT.selfctx, st = stage(p, PILLARS.selfctx.region, 'drag mid'), GOAL = 10;
  const deck = shuffle(T.weather.slice()), LANES = [.1, .23, .36, .49];
  const items = [];
  let dealt = 0, noticed = 0, sel = null, drag = null, mood = 'gentle', burst = 0, nextAt = 3.6, thunderAt = 0, last = 0, now = 0;
  const spawn = (v, x = -50) => {
    const [kind, text] = deck[dealt++ % deck.length];
    const room = l => Math.min(Infinity, ...items.filter(it => it.lane === l).map(it => it.x));
    const lane = [0, 1, 2, 3].sort((a, b) => room(b) - room(a) || Math.random() - .5)[0];
    items.push({ kind, text, lane, x, v, name: null, fade: 1, swell: 1, seed: Math.random() * 9 });
  };
  st.draw((g, W, H, t) => {
    const dt = Math.min(.05, t - last); last = now = t;
    if (!dealt) { spawn(18, W * .2); spawn(20, W * .55); }  // a little weather is already here
    const tempo = { gentle: [3.6, 3, 18, 1], storm: [1.5, 7, 36, 2], calm: [3.8, 3, 16, 1] }[mood];
    if (noticed < GOAL && t >= nextAt) {
      for (let i = 0; i < tempo[3]; i++) if (items.filter(it => !it.name).length < tempo[1]) spawn(tempo[2] + Math.random() * 8, -50 - i * 90);
      nextAt = t + tempo[0];
    }
    for (; burst > 0; burst--) spawn(36 + Math.random() * 8, -50 - burst * 90);
    if (mood === 'storm' && t >= thunderAt) { audio.thud(); thunderAt = t + 3 + Math.random() * 2; }
    for (const it of items) {
      if (it !== sel) it.x += it.v / it.swell * dt;
      if (it.name) it.fade -= dt / 2.6;
      if (!drag || drag.it !== it) it.swell += (1 - it.swell) * Math.min(1, dt * .8);
    }
    for (let i = items.length - 1; i >= 0; i--) if (items[i].x > W + 70 || items[i].fade <= 0) { if (items[i] === sel) pick(null); items.splice(i, 1); }
    // the sky: the same light, above and in the water, whatever the weather does
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#8ea6cf'); gr.addColorStop(.6, '#d9d3e8'); gr.addColorStop(.62, '#7a8fb8'); gr.addColorStop(1, '#5d6f9a');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (const [y, a] of [[H * .3, .45], [H * .94, .2]]) {
      const gl = g.createRadialGradient(W / 2, y, 4, W / 2, y, W * .45);
      gl.addColorStop(0, `rgba(255,250,236,${a})`); gl.addColorStop(1, 'rgba(255,250,236,0)'); g.fillStyle = gl; g.fillRect(0, 0, W, H);
    }
    for (const it of items) {
      const y = LANES[it.lane] * H + Math.sin(t + it.seed) * 3;
      for (const mirror of [false, true]) {
        g.globalAlpha = it.fade * (mirror ? .3 : 1);
        g.save(); g.translate(it.x, mirror ? H * 1.24 - y : y); g.scale(it.swell, it.swell); drawWeather(g, it.kind, 0, 0, t); g.restore();
      }
      g.globalAlpha = it.fade;
      label(g, it.text, it.x, y + 32 * it.swell, 'italic 13px ' + SERIF);
      if (it.name) label(g, it.name, it.x, y - 26, 'bold 13px ' + SERIF);
      g.globalAlpha = 1;
      if (it === sel) { g.strokeStyle = INK; g.lineWidth = 2; g.setLineDash([5, 5]); g.beginPath(); g.arc(it.x, y + 4, 36 * it.swell, 0, 7); g.stroke(); g.setLineDash([]); }
    }
    drawGuardian(g, 'selfctx', W * .85, H * .98, t, true, PILLARS.selfctx.color);
    const c = fmt(T.count, { n: Math.min(noticed, GOAL), total: GOAL });
    g.font = '13px ' + SERIF; g.fillStyle = 'rgba(247,242,231,.9)'; pill(g, 8, H - 34, g.measureText(c).width + 24, 26); g.fill();
    g.fillStyle = INK; g.textAlign = 'left'; g.fillText(c, 20, H - 17);
  });
  // naming buttons: always in place, enabled once a piece of weather is chosen
  const btns = T.labels.map((l, i) => h('button', { disabled: '', onclick: e => name(i, e.currentTarget) }, l));
  const pick = it => {
    sel = it;
    for (const b of btns) { b.disabled = !it; b.classList.remove('on'); }
    if (it) { st.msg(fmt(T.pick, { item: it.text })); audio.soft(); }
  };
  let finish;
  const done = new Promise(r => finish = r);
  function name(i, b) {
    if (!sel) return;
    const it = sel; pick(null);
    b.classList.add('on'); setTimeout(() => b.classList.remove('on'), 350);
    it.name = T.labels[i]; it.v = Math.max(it.v, 26) * 1.4; noticed++; audio.bell(587, .05);
    st.msg(fmt(T.named, { label: it.name, item: it.text }));
    const turn = (m, text) => { mood = m; setTimeout(() => { if (!sel && noticed < GOAL) st.msg(text); }, 1600); };
    if (noticed === 3) { turn('storm', T.storm); burst = 3; thunderAt = now + 1; }
    if (noticed === 7) turn('calm', T.calm);
    if (noticed >= GOAL) finish();
  }
  st.cv.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (noticed >= GOAL) return;
    const q = st.pt(e), H = st.cv.getBoundingClientRect().height;
    let best = null, bd = 44;
    for (const it of items) if (!it.name) {
      const d = Math.hypot(it.x - q.x, LANES[it.lane] * H + 8 - q.y);
      if (d < bd) { bd = d; best = it; }
    }
    if (!best) return;
    pick(best); drag = { it: best, id: e.pointerId, x: q.x, y: q.y, pushed: false };
    try { st.cv.setPointerCapture(e.pointerId); } catch (_) {}
  });
  st.cv.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    e.preventDefault();
    const q = st.pt(e);
    if (!drag.pushed && Math.hypot(q.x - drag.x, q.y - drag.y) > 16) { drag.pushed = true; st.msg(T.push); }
    if (drag.pushed) { drag.it.swell = Math.min(2, drag.it.swell + .03); drag.it.x += (q.x - drag.x) * .1; drag.x = q.x; drag.y = q.y; }
  });
  const up = e => { if (drag && e.pointerId === drag.id) drag = null; };
  st.cv.addEventListener('pointerup', up); st.cv.addEventListener('pointercancel', up);

  st.msg(T.intro);
  st.set(h('div', { class: 'labels' }, btns));
  await done;
  st.msg(T.done);
  await wait(2600);
  st.stop();
  const i = await choose(T.question, T.answers);
  await say(T.replies[i]);
}
function drawWeather(g, kind, x, y, t) {
  const puff = (c, a = 1) => { g.fillStyle = c; g.globalAlpha *= a; for (const [dx, dy, r] of [[-14, 2, 12], [0, -6, 16], [15, 2, 12], [0, 6, 14]]) { g.beginPath(); g.arc(x + dx, y + dy, r, 0, 7); g.fill(); } };
  const a0 = g.globalAlpha;
  if (kind === 'cloud') puff('#f4f2ee');
  else if (kind === 'storm') { puff('#5a5d6a'); g.globalAlpha = a0; if (Math.sin(t * 5) > .7) { g.strokeStyle = '#f2d36b'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y + 14); g.lineTo(x - 6, y + 26); g.lineTo(x + 3, y + 26); g.lineTo(x - 4, y + 38); g.stroke(); } }
  else if (kind === 'rain') { puff('#9aa4b5'); g.globalAlpha = a0; g.strokeStyle = '#5d7fa8'; g.lineWidth = 1.5; for (let i = 0; i < 5; i++) { const dy = (t * 40 + i * 9) % 22; g.beginPath(); g.moveTo(x - 12 + i * 6, y + 14 + dy); g.lineTo(x - 14 + i * 6, y + 20 + dy); g.stroke(); } }
  else if (kind === 'sun') { g.fillStyle = '#f2c14e'; g.beginPath(); g.arc(x, y, 14, 0, 7); g.fill(); g.strokeStyle = '#f2c14e'; g.lineWidth = 2; for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28 + t * .3; g.beginPath(); g.moveTo(x + Math.cos(a) * 18, y + Math.sin(a) * 18); g.lineTo(x + Math.cos(a) * 25, y + Math.sin(a) * 25); g.stroke(); } }
  else if (kind === 'fog') { puff('#c3c2cc', .85); }
  else if (kind === 'wind') { g.strokeStyle = '#f4f2ee'; g.lineWidth = 2.5; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(x - 25, y - 8 + i * 8); g.bezierCurveTo(x - 5, y - 16 + i * 8, x + 5, y + i * 8, x + 25, y - 8 + i * 8); g.stroke(); } }
  g.globalAlpha = a0;
}

// ---------- Values: choose and light your lanterns ----------
async function values(p, S) {
  const T = TEXT.values, st = stage(p, PILLARS.values.region);
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
  st.msg(T.intro);
  await new Promise(res => {
    const go = h('button', { class: 'lightbtn', disabled: '', onclick: () => { if (!chosen.length) return; go.disabled = true; res(); } }, T.light[0]);
    const chips = VALUE_LANTERNS.map(v => h('button', { class: 'chip', onclick: e => {
      const b = e.currentTarget, i = chosen.indexOf(v);
      if (i >= 0) { chosen.splice(i, 1); b.classList.remove('on'); st.msg(T.intro); }
      else if (chosen.length < 3) { chosen.push(v); b.classList.add('on'); audio.soft(); st.msg(T.intro); }
      else st.msg(T.max);
      go.disabled = !chosen.length; go.textContent = T.light[chosen.length];
    } }, v));
    st.set(go, h('div', { class: 'chips' }, chips));
  });
  lit = 0.01; audio.chime();
  S.values = chosen.slice();
  st.msg(T.rise);
  const input = h('textarea', { rows: '2', maxlength: '200', placeholder: T.note });
  input.value = S.valueNote || '';
  await new Promise(res => {
    const go = h('button', { class: 'primary', onclick: () => { go.disabled = true; S.valueNote = input.value.trim(); input.blur(); res(); } }, T.cont);
    st.set(input, go);
  });
  st.stop();
  await say(T.outro);
}

// ---------- Committed Action: stone by stone, with the voice along ----------
async function action(p, S) {
  const T = TEXT.action, st = stage(p, PILLARS.action.region);
  const cant = CREATURES.find(c => c.id === 'cant');
  let value = null, pos = 0, hopT = 1, showCant = false;
  const STONES = 3;
  st.draw((g, W, H, t) => {
    g.fillStyle = '#4f95b0'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1.2;
    for (let i = 0; i < 10; i++) { const y = (i * 37 + t * 8) % H; g.beginPath(); g.moveTo((i * 71) % W, y); g.lineTo((i * 71) % W + 20, y); g.stroke(); }
    g.fillStyle = '#94b86a'; g.fillRect(0, H - 40, W, 40); g.fillRect(0, 0, W, 34);
    const sx = i => W * (0.2 + 0.6 * (i % 2 ? .65 : .35)), sy = i => H - 40 - (i + 1) * (H - 74) / (STONES + 1);
    for (let i = 0; i < STONES; i++) { g.fillStyle = '#b8b3a3'; g.beginPath(); g.ellipse(sx(i), sy(i), 26, 12, 0, 0, 7); g.fill(); }
    // far-shore lantern, labelled with the value you walk toward
    const glow = g.createRadialGradient(W / 2, 22, 2, W / 2, 22, 40); glow.addColorStop(0, 'rgba(255,210,110,.8)'); glow.addColorStop(1, 'rgba(255,210,110,0)');
    g.fillStyle = glow; g.beginPath(); g.arc(W / 2, 22, 40, 0, 7); g.fill();
    g.fillStyle = '#f6c24a'; g.beginPath(); g.ellipse(W / 2, 20, 8, 11, 0, 0, 7); g.fill();
    if (value) label(g, value, W / 2 + 16, 26, '15px ' + SERIF, 'left');
    // player position (0 = near shore, STONES+1 = far shore)
    const px = k => k === 0 ? W / 2 : k > STONES ? W / 2 : sx(k - 1), py = k => k === 0 ? H - 16 : k > STONES ? 36 : sy(k - 1) + 4;
    const from = Math.max(0, pos - 1), e = ease(Math.min(1, hopT));
    const x = px(from) + (px(pos) - px(from)) * e, y = py(from) + (py(pos) - py(from)) * e - Math.sin(e * Math.PI) * 24;
    if (hopT < 1) hopT += .03;
    drawCharacter(g, S.char, x, y, 1, t * 3, 1.3);
    if (showCant) drawCreature(g, cant, x - 30, y + 4, .9, t, .25);
    drawGuardian(g, 'action', W * .86, H - 12, t, true, PILLARS.action.color);
  });
  // choose the value first: your own lanterns come first, highlighted
  const mine = (S.values || []).filter(v => VALUE_LANTERNS.includes(v));
  const all = [...mine, ...VALUE_LANTERNS.filter(v => !mine.includes(v))];
  st.msg(mine.length ? T.chooseMine : T.choose);
  value = all[await st.buttons(all, i => i < mine.length ? 'chip mine' : 'chip', 'chips')];
  audio.bell(523, .06);
  await wait(500);
  const v = value.toLowerCase(), steps = [];
  for (let i = 0; i < STONES; i++) {
    let step;
    if (i < STONES - 1) {
      st.msg(fmt(T.stone, { n: i + 1, value: v }));
      const pool = [...(SMALL_STEPS[value] || []), ...SMALL_STEPS.default].filter(s => !steps.includes(s)).slice(0, 3);
      step = pool[await st.buttons(pool, () => '')];
    } else {
      st.msg(fmt(T.last, { value: v }));
      step = await new Promise(res => {
        const input = h('input', { type: 'text', maxlength: '80', placeholder: T.placeholder, enterkeyhint: 'done', autocomplete: 'off' });
        const go = h('button', { class: 'primary', type: 'submit', disabled: '' }, T.step);
        input.addEventListener('input', () => { go.disabled = !input.value.trim(); });
        const form = h('form', { class: 'own', onsubmit: e => {
          e.preventDefault(); const s = input.value.trim();
          if (!s || go.disabled) return;
          go.disabled = true; input.disabled = true; input.blur(); audio.soft(); res(s);
        } }, input, go);
        st.set(form);
      });
    }
    steps.push(step);
    showCant = true;
    st.msg(fmt(T.cant, { name: cant.name }));
    while (await st.buttons([T.go, T.wait]) === 1) st.msg(T.waited);
    pos++; hopT = 0; audio.bell(440 + i * 50, .06);
    st.msg(fmt(T.stepped, { step }));
    await wait(1400);
  }
  pos++; hopT = 0; await wait(1200);
  S.steps = steps;
  st.stop();
  await say(T.outro);
}

export const EXERCISES = { present, defusion, acceptance, selfctx, values, action };
