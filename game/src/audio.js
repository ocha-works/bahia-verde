// audio.js — every sound in Bahia Verde is synthesised with WebAudio:
// no audio files, nothing to load. Short blips and noise bursts cover the
// effects; a two-oscillator wail makes the police siren; a lazy bass and
// marimba-ish arpeggio loop is the soundtrack of a sunny afternoon.

let ctx = null;
let master = null;
let muted = false;
let musicTimer = null;

export function initAudio() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
}

export function resumeAudio() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.5;
  return muted;
}

export function isMuted() {
  return muted;
}

function tone(freq, dur, { type = 'square', vol = 0.2, slide = 0, delay = 0 } = {}) {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur, { vol = 0.25, freq = 1200, delay = 0 } = {}) {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime + delay;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = freq;
  const gain = ctx.createGain();
  gain.gain.value = vol;
  src.connect(filter).connect(gain).connect(master);
  src.start(t0);
}

export const sfx = {
  punch() {
    noise(0.08, { vol: 0.3, freq: 700 });
    tone(120, 0.08, { type: 'sine', vol: 0.25, slide: -60 });
  },
  swing() {
    noise(0.06, { vol: 0.1, freq: 2400 });
  },
  gunshot() {
    noise(0.14, { vol: 0.5, freq: 3200 });
    tone(160, 0.1, { type: 'sawtooth', vol: 0.2, slide: -110 });
  },
  dryFire() {
    tone(1400, 0.03, { type: 'square', vol: 0.08 });
  },
  reload() {
    tone(500, 0.05, { vol: 0.12 });
    tone(320, 0.05, { vol: 0.12, delay: 0.09 });
    tone(700, 0.05, { vol: 0.12, delay: 0.2 });
  },
  thud() {
    noise(0.12, { vol: 0.35, freq: 500 });
    tone(80, 0.14, { type: 'sine', vol: 0.3, slide: -30 });
  },
  crash() {
    noise(0.3, { vol: 0.5, freq: 900 });
    tone(64, 0.3, { type: 'sine', vol: 0.35, slide: -20 });
  },
  pickup() {
    tone(660, 0.07, { type: 'triangle', vol: 0.2 });
    tone(990, 0.1, { type: 'triangle', vol: 0.2, delay: 0.06 });
  },
  cash() {
    tone(880, 0.06, { type: 'triangle', vol: 0.22 });
    tone(1174, 0.06, { type: 'triangle', vol: 0.22, delay: 0.05 });
    tone(1568, 0.12, { type: 'triangle', vol: 0.22, delay: 0.1 });
  },
  door() {
    tone(220, 0.06, { type: 'sine', vol: 0.15, slide: -60 });
    tone(180, 0.08, { type: 'sine', vol: 0.15, delay: 0.08, slide: -40 });
  },
  step() {
    noise(0.03, { vol: 0.05, freq: 900 });
  },
  hurt() {
    tone(220, 0.12, { type: 'sawtooth', vol: 0.18, slide: -90 });
  },
  missionStart() {
    tone(523, 0.1, { type: 'triangle', vol: 0.2 });
    tone(784, 0.16, { type: 'triangle', vol: 0.2, delay: 0.09 });
  },
  missionDone() {
    tone(523, 0.09, { type: 'triangle', vol: 0.22 });
    tone(659, 0.09, { type: 'triangle', vol: 0.22, delay: 0.08 });
    tone(784, 0.09, { type: 'triangle', vol: 0.22, delay: 0.16 });
    tone(1046, 0.22, { type: 'triangle', vol: 0.24, delay: 0.24 });
  },
  busted() {
    tone(392, 0.2, { type: 'triangle', vol: 0.22 });
    tone(330, 0.2, { type: 'triangle', vol: 0.22, delay: 0.18 });
    tone(262, 0.4, { type: 'triangle', vol: 0.22, delay: 0.36 });
  },
};

// One siren voice per nearby police car would be chaos; a single shared
// wail whose volume follows the nearest unit reads better.
let sirenNodes = null;
export function setSirenLevel(level) {
  if (!ctx) return;
  if (level > 0.02 && !muted) {
    if (!sirenNodes) {
      const osc = ctx.createOscillator();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = 840;
      lfo.type = 'sine';
      lfo.frequency.value = 0.7;
      lfoGain.gain.value = 190;
      lfo.connect(lfoGain).connect(osc.frequency);
      gain.gain.value = 0;
      osc.connect(gain).connect(master);
      osc.start();
      lfo.start();
      sirenNodes = { osc, lfo, gain };
    }
    sirenNodes.gain.gain.setTargetAtTime(Math.min(0.16, level * 0.16), ctx.currentTime, 0.2);
  } else if (sirenNodes) {
    sirenNodes.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
  }
}

// Engine note while driving: a sawtooth whose pitch tracks speed.
let engineNodes = null;
export function setEngine(speedRatio, running) {
  if (!ctx) return;
  if (running && !muted) {
    if (!engineNodes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      gain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 640;
      osc.connect(filter).connect(gain).connect(master);
      osc.start();
      engineNodes = { osc, gain };
    }
    engineNodes.osc.frequency.setTargetAtTime(55 + speedRatio * 165, ctx.currentTime, 0.08);
    engineNodes.gain.gain.setTargetAtTime(0.05 + speedRatio * 0.05, ctx.currentTime, 0.1);
  } else if (engineNodes) {
    engineNodes.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
  }
}

// A small sunny loop: bass on the beat, a pentatonic arp over it.
// Scheduled with setInterval; each note is a tone() call.
const ARP = [523.25, 587.33, 659.25, 783.99, 659.25, 587.33, 440.0, 493.88];
const BASS = [130.81, 98.0, 110.0, 146.83];
export function startMusic() {
  if (!ctx || musicTimer) return;
  let step = 0;
  musicTimer = setInterval(() => {
    if (muted) return;
    const bar = Math.floor(step / 8) % BASS.length;
    if (step % 2 === 0) tone(ARP[step % ARP.length], 0.22, { type: 'triangle', vol: 0.05 });
    if (step % 8 === 0) tone(BASS[bar], 0.9, { type: 'sine', vol: 0.11 });
    if (step % 8 === 4) tone(BASS[bar] * 1.5, 0.5, { type: 'sine', vol: 0.07 });
    step++;
  }, 210);
}

export function stopMusic() {
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
}
