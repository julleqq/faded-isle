// Generated sound: a slow pentatonic melody over a soft pad, plus wind,
// sea and temple bells. No audio files. iOS only allows audio after a tap,
// so start() must be called from a tap handler.

let ac = null, master = null, music = null, seaGain = null, analyser = null, muted = false;
// D major pentatonic, kept above ~290 Hz because phone speakers barely play lower notes.
const PENTA = [293.66, 329.63, 392.0, 440.0, 493.88, 587.33, 659.25, 783.99, 880.0];
const CHORDS = [[293.66, 440.0, 587.33], [392.0, 587.33, 783.99], [329.63, 493.88, 659.25], [440.0, 659.25, 880.0]];

try { muted = localStorage.getItem('fadedisle.muted') === '1'; } catch (e) {}

function noiseBuffer(seconds, brown) {
  const len = ac.sampleRate * seconds, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
  }
  return buf;
}
function loop(buf) { const s = ac.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; }

// A short silent WAV. Playing it through an <audio> element moves older iOS
// into "playback" mode, so the ringer/silent switch no longer mutes the game.
function silentWav() {
  const n = 4410, b = new DataView(new ArrayBuffer(44 + n * 2));
  const str = (o, t) => [...t].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); b.setUint32(4, 36 + n * 2, true); str(8, 'WAVEfmt ');
  b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true);
  b.setUint32(24, 44100, true); b.setUint32(28, 88200, true); b.setUint16(32, 2, true); b.setUint16(34, 16, true);
  str(36, 'data'); b.setUint32(40, n * 2, true);
  let bin = ''; new Uint8Array(b.buffer).forEach(x => bin += String.fromCharCode(x));
  return 'data:audio/wav;base64,' + btoa(bin);
}

function unlock() {
  if (!ac) return;
  if (ac.state !== 'running') ac.resume().catch(() => {});
}

export function start() {
  if (ac) return unlock();
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
  // Only older iPhones need the silent <audio> trick; on Android it would show a media notification.
  const iOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (iOS && !navigator.audioSession) {
    try { const el = new Audio(silentWav()); el.loop = true; el.setAttribute('playsinline', ''); el.play().catch(() => {}); } catch (e) {}
  }
  ac = new AC();
  unlock();
  // A one-sample buffer played inside the tap fully wakes iOS audio.
  const tick = ac.createBufferSource(); tick.buffer = ac.createBuffer(1, 1, 22050); tick.connect(ac.destination); tick.start();
  // iOS pauses audio after the screen locks or a call; resume on the next touch.
  ['pointerdown', 'touchend', 'keydown'].forEach(ev => addEventListener(ev, unlock, { passive: true }));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) unlock(); });

  master = ac.createGain(); master.gain.value = muted ? 0 : 0.9; master.connect(ac.destination);
  analyser = ac.createAnalyser(); master.connect(analyser);
  music = ac.createGain(); music.gain.value = 1.0; music.connect(master);

  // wind: band-passed noise, slowly swelling
  const wind = loop(noiseBuffer(3, false));
  const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.7;
  const wg = ac.createGain(); wg.gain.value = 0.08;
  const lfo = ac.createOscillator(); lfo.frequency.value = 0.07;
  const lfoAmt = ac.createGain(); lfoAmt.gain.value = 0.03;
  lfo.connect(lfoAmt).connect(wg.gain); lfo.start();
  wind.connect(bp).connect(wg).connect(master);

  // sea: brown noise; level follows how close you are to water
  const sea = loop(noiseBuffer(4, true));
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
  seaGain = ac.createGain(); seaGain.gain.value = 0.04;
  sea.connect(lp).connect(seaGain).connect(master);

  const bells = () => { bell(PENTA[Math.floor(Math.random() * 5)], 0.1); setTimeout(bells, 9000 + Math.random() * 12000); };
  setTimeout(bells, 5000);
  playMusic();
}

// ---------- music ----------
// Koto-like pluck: a triangle wave with a quick attack and long fade.
function pluck(freq, t, vol) {
  const o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
  o.type = 'triangle'; o.frequency.value = freq; o2.type = 'sine'; o2.frequency.value = freq * 2;
  f.type = 'lowpass'; f.frequency.value = 2600;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
  const g2 = ac.createGain(); g2.gain.value = 0.25;
  o.connect(f); o2.connect(g2).connect(f); f.connect(g).connect(music);
  o.start(t); o2.start(t); o.stop(t + 3); o2.stop(t + 3);
}
// Slow pad chord that breathes in and out.
function pad(chord, t, dur) {
  for (const freq of chord) for (const detune of [-4, 4]) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine'; o.frequency.value = freq; o.detune.value = detune;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.02, t + dur * 0.4);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(music); o.start(t); o.stop(t + dur + 0.1);
  }
}
function playMusic() {
  let chord = 0, idx = 2;
  const padLoop = () => { pad(CHORDS[chord], ac.currentTime + 0.1, 14); chord = (chord + 1 + Math.floor(Math.random() * 2)) % CHORDS.length; setTimeout(padLoop, 11000); };
  // A phrase of 3–6 notes wandering the scale, then a rest. Silence is part of the music.
  const phrase = () => {
    let t = ac.currentTime + 0.1;
    const n = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      idx = Math.max(0, Math.min(PENTA.length - 1, idx + [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)]));
      pluck(PENTA[idx], t, i === n - 1 ? 0.14 : 0.18);
      t += [0.5, 0.75, 1.0][Math.floor(Math.random() * 3)];
    }
    setTimeout(phrase, (t - ac.currentTime) * 1000 + 3000 + Math.random() * 5000);
  };
  padLoop(); setTimeout(phrase, 1500);
}

// Debug helper: current output loudness (0 = silent).
export function level() {
  if (!analyser) return 0;
  const d = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(d);
  return Math.sqrt(d.reduce((a, v) => a + v * v, 0) / d.length);
}

export function bell(freq, vol = 0.1, delay = 0) {
  if (!ac) return;
  const t = ac.currentTime + delay;
  for (const [mult, v] of [[1, 1], [2.76, 0.35], [5.4, 0.12]]) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine'; o.frequency.value = freq * mult;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol * v, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 4 / mult + 0.5);
    o.connect(g).connect(master); o.start(t); o.stop(t + 5);
  }
}

// A rising arpeggio: something was learned or befriended.
export function chime() { [0, 2, 4, 6].forEach((n, i) => bell(PENTA[n], 0.08, i * 0.18)); }
export function soft() { bell(PENTA[Math.floor(Math.random() * 5)], 0.05); }
export function thud() {
  if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
  o.type = 'triangle'; o.frequency.setValueAtTime(330, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.4);
  g.gain.setValueAtTime(0.15, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  o.connect(g).connect(master); o.start(t); o.stop(t + 0.6);
}
// A soft tone that swells with an in-breath and fades with the out-breath.
export function breath(inhale, seconds) {
  if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
  o.type = 'sine'; o.frequency.setValueAtTime(inhale ? 392 : 440, t);
  o.frequency.linearRampToValueAtTime(inhale ? 440 : 392, t + seconds);
  g.gain.setValueAtTime(inhale ? 0.001 : 0.05, t);
  g.gain.linearRampToValueAtTime(inhale ? 0.05 : 0.001, t + seconds);
  o.connect(g).connect(master); o.start(t); o.stop(t + seconds + 0.1);
}
export function setSea(level) { if (seaGain) seaGain.gain.setTargetAtTime(0.03 + level * 0.15, ac.currentTime, 0.8); }

export function isMuted() { return muted; }
export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem('fadedisle.muted', muted ? '1' : '0'); } catch (e) {}
  if (master) master.gain.setTargetAtTime(muted ? 0 : 0.9, ac.currentTime, 0.1);
  return muted;
}
