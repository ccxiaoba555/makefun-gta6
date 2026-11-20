// Vice Bay — synthesised sound, no audio files.
// Every effect is built from oscillators and filtered noise at run time, so
// the game ships no samples and loads nothing over the network.

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = null;
  }

  // Browsers only let audio start after a gesture; call this from any input.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
    } catch (err) {
      this.ctx = null;
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.ctx.currentTime, 0.02);
    }
  }

  _tone(freq, dur, type, vol, slideTo) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  _noise(dur, vol, cutoff) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
  }

  click() { this._tone(660, 0.07, 'square', 0.12); }
  punch() { this._noise(0.09, 0.35, 900); this._tone(140, 0.09, 'sine', 0.3, 60); }
  shot() { this._noise(0.16, 0.5, 2600); this._tone(220, 0.12, 'sawtooth', 0.22, 50); }
  pickup() { this._tone(880, 0.09, 'sine', 0.2); setTimeout(() => this._tone(1318, 0.12, 'sine', 0.2), 80); }
  cash() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this._tone(f, 0.14, 'triangle', 0.22), i * 70));
  }
  busted() { this._tone(392, 0.5, 'sawtooth', 0.2, 110); }
  crash() { this._noise(0.25, 0.4, 500); }

  // A low engine drone whose pitch follows speed; call every frame.
  engine(speed01, driving) {
    if (!this.ctx) return;
    if (!driving || this.muted) {
      if (this.engineGain) this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
      return;
    }
    if (!this.engineOsc) {
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      this.engineOsc.connect(filter);
      filter.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();
    }
    const t = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(55 + speed01 * 130, t, 0.05);
    this.engineGain.gain.setTargetAtTime(0.05 + speed01 * 0.06, t, 0.08);
  }

  // Two-tone police siren while any cop is in pursuit.
  siren(on) {
    if (!this.ctx) return;
    if (!on) {
      if (this.sirenTimer) { clearInterval(this.sirenTimer); this.sirenTimer = null; }
      if (this.sirenGain) this.sirenGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      return;
    }
    if (!this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 720;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      let high = false;
      this.sirenTimer = setInterval(() => {
        if (!this.ctx || this.muted) return;
        high = !high;
        this.sirenOsc.frequency.setTargetAtTime(high ? 950 : 700, this.ctx.currentTime, 0.05);
      }, 420);
    }
    this.sirenGain.gain.setTargetAtTime(this.muted ? 0 : 0.045, this.ctx.currentTime, 0.1);
  }
}
