/* audio.js — tiny WebAudio synth for feedback sounds + a soft ambient hum.
   No external audio assets required. */

const AudioFX = {
  ctx: null,
  musicGain: null,
  sfxGain: null,
  musicNodes: [],
  musicPlaying: false,

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.musicGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    this.musicGain.connect(this.ctx.destination);
    this.sfxGain.connect(this.ctx.destination);
    this.applyVolumes(Storage.getSettings());
  },

  applyVolumes(settings) {
    if (!this.ctx) return;
    this.musicGain.gain.value = (settings.music / 100) * 0.06; // keep ambient hum subtle
    this.sfxGain.gain.value = settings.sfx / 100;
  },

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },

  _tone(freq, duration, type, gainMult, delay) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + (delay || 0);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime((gainMult || 1), t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  },

  correct() {
    this.resume();
    this._tone(880, 0.12, 'triangle', 0.5, 0);
    this._tone(1320, 0.16, 'triangle', 0.4, 0.08);
  },

  wrong() {
    this.resume();
    this._tone(180, 0.25, 'sawtooth', 0.35, 0);
  },

  win() {
    this.resume();
    [523, 659, 784, 1046].forEach((f, i) => this._tone(f, 0.25, 'triangle', 0.35, i * 0.1));
  },

  click() {
    this.resume();
    this._tone(440, 0.05, 'square', 0.15, 0);
  },

  phaseComplete() {
    this.resume();
    [660, 880, 1100].forEach((f, i) => this._tone(f, 0.18, 'triangle', 0.4, i * 0.09));
  },

  toggle() {
    this.resume();
    this._tone(520, 0.07, 'sine', 0.2, 0);
  },

  footstep() {
    this.resume();
    this._tone(120, 0.05, 'sine', 0.06, 0);
  },

  /* A hazard just crossed into its "warning" escalation stage. */
  escalate() {
    this.resume();
    this._tone(760, 0.09, 'square', 0.18, 0);
  },

  /* A hazard fully escalated (missed) — a real consequence just happened. */
  consequence() {
    this.resume();
    this._tone(140, 0.3, 'sawtooth', 0.4, 0);
    this._tone(95, 0.35, 'sawtooth', 0.3, 0.08);
  },

  startAmbient() {
    if (!this.ctx || this.musicPlaying) return;
    this.musicPlaying = true;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    osc1.type = 'sine'; osc1.frequency.value = 110;
    osc2.type = 'sine'; osc2.frequency.value = 165;
    osc1.connect(this.musicGain);
    osc2.connect(this.musicGain);
    osc1.start(); osc2.start();
    this.musicNodes = [osc1, osc2];
  },

  stopAmbient() {
    this.musicNodes.forEach(n => { try { n.stop(); } catch (e) {} });
    this.musicNodes = [];
    this.musicPlaying = false;
  }
};
