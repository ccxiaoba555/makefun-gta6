// Synthesised sound only — no audio files, no network. WebAudio oscillators
// and filtered noise: engine hum that follows speed, crash, gunshot, punch,
// pickup blip and a mission-complete jingle. Created lazily on the first
// user gesture (browsers block audio before that); M toggles mute.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let muted = false;
  let sirenTimer = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      // Engine: two detuned saws through a lowpass, gain follows speed.
      engineOsc = ctx.createOscillator();
      engineOsc2 = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc2.type = 'square';
      engineOsc.frequency.value = 55;
      engineOsc2.frequency.value = 82;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(filter);
      engineOsc2.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();
    } catch {
      return false;
    }
    return true;
  }

  function noiseBuffer(seconds) {
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function burst(duration, filterFreq, gainValue, type = 'lowpass') {
    if (!ensure() || muted) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(duration);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start();
  }

  function tone(freq, duration, gainValue, type = 'sine', when = 0) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  return {
    /** Call from a user gesture; also (re)starts the engine hum. */
    unlock() {
      if (ensure() && ctx.state === 'suspended') void ctx.resume();
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() { return muted; },
    /** 0 = idle, 1 = full speed; also drives a quiet siren while wanted. */
    setEngine(level, wanted) {
      if (!ensure()) return;
      const t = ctx.currentTime;
      engineGain.gain.setTargetAtTime(level * 0.10, t, 0.1);
      engineOsc.frequency.setTargetAtTime(55 + level * 130, t, 0.08);
      engineOsc2.frequency.setTargetAtTime(82 + level * 190, t, 0.08);
      if (wanted > 0 && !sirenTimer) {
        sirenTimer = window.setInterval(() => {
          if (!muted) { tone(660, 0.28, 0.05, 'sine'); tone(520, 0.28, 0.05, 'sine', 0.28); }
        }, 560);
      } else if (wanted === 0 && sirenTimer) {
        window.clearInterval(sirenTimer);
        sirenTimer = null;
      }
    },
    crash() { burst(0.25, 900, 0.5); tone(70, 0.2, 0.4, 'sine'); },
    gunshot() { burst(0.12, 2400, 0.55, 'highpass'); tone(180, 0.08, 0.3, 'square'); },
    punch() { burst(0.09, 300, 0.4); },
    pickup() { tone(880, 0.1, 0.25, 'sine'); tone(1320, 0.12, 0.2, 'sine', 0.08); },
    hit() { tone(140, 0.15, 0.35, 'sawtooth'); },
    mission() {
      // Little rising jingle: C E G C.
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 0.3, 'triangle', i * 0.11));
    },
    fail() { [392, 330, 262].forEach((f, i) => tone(f, 0.25, 0.25, 'triangle', i * 0.14)); },
  };
}
