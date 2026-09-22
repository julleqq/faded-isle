// Generated ambience: wind, distant sea and occasional temple bells.
// No audio files. iOS only allows audio after a tap, so start() must be
// called from a tap handler.

let ac = null, master = null, seaGain = null, muted = false;
const PENTA = [293.66, 329.63, 392.0, 440.0, 493.88, 587.33, 659.25];

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

export function start() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ac = new AC();
  master = ac.createGain(); master.gain.value = muted ? 0 : 0.7; master.connect(ac.destination);

  // wind: band-passed noise, slowly swelling
  const wind = loop(noiseBuffer(3, false));
  const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.6;
  const wg = ac.createGain(); wg.gain.value = 0.035;
  const lfo = ac.createOscillator(); lfo.frequency.value = 0.07;
  const lfoAmt = ac.createGain(); lfoAmt.gain.value = 0.025;
  lfo.connect(lfoAmt).connect(wg.gain); lfo.start();
  wind.connect(bp).connect(wg).connect(master);

  // sea: brown noise, low-passed; level follows proximity to water
  const sea = loop(noiseBuffer(4, true));
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
  seaGain = ac.createGain(); seaGain.gain.value = 0.05;
  sea.connect(lp).connect(seaGain).connect(master);

  const bells = () => { bell(PENTA[Math.floor(Math.random() * PENTA.length)] / 2, 0.06); setTimeout(bells, 8000 + Math.random() * 12000); };
  setTimeout(bells, 3000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && ac.state !== 'running') ac.resume(); });
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
  o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.4);
  g.gain.setValueAtTime(0.15, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  o.connect(g).connect(master); o.start(t); o.stop(t + 0.6);
}
// A soft tone that swells with an in-breath and fades with the out-breath.
export function breath(inhale, seconds) {
  if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
  o.type = 'sine'; o.frequency.setValueAtTime(inhale ? 196 : 220, t);
  o.frequency.linearRampToValueAtTime(inhale ? 220 : 196, t + seconds);
  g.gain.setValueAtTime(inhale ? 0.001 : 0.05, t);
  g.gain.linearRampToValueAtTime(inhale ? 0.05 : 0.001, t + seconds);
  o.connect(g).connect(master); o.start(t); o.stop(t + seconds + 0.1);
}
export function setSea(level) { if (seaGain) seaGain.gain.setTargetAtTime(0.02 + level * 0.12, ac.currentTime, 0.8); }

export function isMuted() { return muted; }
export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem('fadedisle.muted', muted ? '1' : '0'); } catch (e) {}
  if (master) master.gain.setTargetAtTime(muted ? 0 : 0.7, ac.currentTime, 0.1);
  return muted;
}
