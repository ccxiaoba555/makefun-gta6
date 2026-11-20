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
    // Radio: a step sequencer that loops one 8-step bar per station.
    this.radioTimer = null;
    this.radioStep = 0;
    this.radioStation = 0;
  }

  // Three stations, three moods. Each bar is 8 steps: a bass line, a lead
  // line and a hat tick. Frequencies are plain note values, 0 means rest.
  static RADIO_PATTERNS = [
    // BAY FM 88 — sunset pop: bright, bouncy, C major.
    { stepMs: 240, wave: 'triangle', bass: [131, 0, 131, 0, 175, 0, 196, 0], lead: [523, 659, 784, 659, 880, 784, 659, 523] },
    // NEON 101 — synthwave: minor, driving, A minor.
    { stepMs: 210, wave: 'sawtooth', bass: [110, 110, 0, 110, 131, 0, 98, 0], lead: [440, 0, 523, 0, 659, 523, 440, 330] },
    // GULL 94 — bass & bounce: low and syncopated, F.
    { stepMs: 260, wave: 'square', bass: [87, 0, 0, 87, 0, 110, 0, 87], lead: [349, 0, 440, 0, 0, 523, 440, 349] },
  ];

  // Start the radio loop for a station. Safe to call repeatedly: it only
  // starts once, and setRadioStation swaps the pattern live.
  startRadio(station) {
    if (!this.ctx || this.radioTimer) return;
    this.radioStation = station || 0;
    this.radioStep = 0;
    this.radioTimer = setInterval(() => {
      if (!this.ctx || this.muted) return;
      const pat = SoundBank.RADIO_PATTERNS[this.radioStation] || SoundBank.RADIO_PATTERNS[0];
      const step = this.radioStep % 8;
      const bass = pat.bass[step];
      if (bass) this._tone(bass, pat.stepMs / 1000 * 0.9, pat.wave, 0.10);
      const lead = pat.lead[step];
      if (lead && step % 2 === 0) this._tone(lead, pat.stepMs / 1000 * 0.8, 'sine', 0.05);
      if (step % 2 === 1) this._noise(0.03, 0.05, 6000);
      this.radioStep += 1;
    }, 240);
    // Keep the tick in step with the station's tempo.
    this._retimeRadio();
  }

  _retimeRadio() {
    if (!this.radioTimer) return;
    const pat = SoundBank.RADIO_PATTERNS[this.radioStation] || SoundBank.RADIO_PATTERNS[0];
    clearInterval(this.radioTimer);
    this.radioTimer = setInterval(() => {
      if (!this.ctx || this.muted) return;
      const p = SoundBank.RADIO_PATTERNS[this.radioStation] || SoundBank.RADIO_PATTERNS[0];
      const step = this.radioStep % 8;
      const bass = p.bass[step];
      if (bass) this._tone(bass, p.stepMs / 1000 * 0.9, p.wave, 0.10);
      const lead = p.lead[step];
      if (lead && step % 2 === 0) this._tone(lead, p.stepMs / 1000 * 0.8, 'sine', 0.05);
      if (step % 2 === 1) this._noise(0.03, 0.05, 6000);
      this.radioStep += 1;
    }, pat.stepMs);
  }

  setRadioStation(station) {
    this.radioStation = station;
    this.radioStep = 0;
    this._retimeRadio();
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
