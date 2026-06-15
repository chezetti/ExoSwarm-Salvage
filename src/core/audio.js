import { rand } from './utils.js';
import { AudioEngine } from '../systems/audioEngine.js';

/* ============================== AUDIO =================================== */
// API-compatible facade: all call sites use Sound.<name>(). When the Tone.js
// AudioEngine is ready, calls route through it for richer synthesis; the raw
// Web Audio fallback below keeps working when Tone is unavailable
// (autoplay blocked, load failure, no WebAudio).
const Sound = {
  ctx: null,
  master: null,
  enabled: true,
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.18;
      this.master.connect(this.ctx.destination);
    } catch (e) {
      this.enabled = false;
    }
  },
  blip(freq, dur, type, vol, slide) {
    if (AudioEngine.ready) return AudioEngine.blip(freq, dur, type, vol, slide);
    if (!this.enabled || !this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol || 0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  },
  noise(dur, vol) {
    if (AudioEngine.ready) return AudioEngine._noise(dur, Math.min(1, (vol || 0.4) * 1.5));
    if (!this.enabled || !this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = vol || 0.4;
    src.connect(g);
    g.connect(this.master);
    src.start(t);
  },
  shoot() {
    if (AudioEngine.ready) return AudioEngine.play('shoot');
    this.blip(720, 0.07, 'square', 0.25, -500);
  },
  shotgun() {
    if (AudioEngine.ready) return AudioEngine.play('shotgun');
    this.noise(0.18, 0.5);
    this.blip(180, 0.12, 'sawtooth', 0.3, -120);
  },
  arc() {
    if (AudioEngine.ready) return AudioEngine.play('arc');
    this.blip(rand(900, 1300), 0.05, 'sawtooth', 0.12, -300);
  },
  hit() {
    if (AudioEngine.ready) return AudioEngine.play('hit');
    this.blip(220, 0.06, 'triangle', 0.3, -80);
  },
  enemyDie() {
    if (AudioEngine.ready) return AudioEngine.play('enemyDie');
    this.blip(140, 0.18, 'sawtooth', 0.35, -100);
    this.noise(0.1, 0.2);
  },
  pickup() {
    if (AudioEngine.ready) return AudioEngine.play('pickup');
    this.blip(880, 0.08, 'sine', 0.35, 300);
  },
  deliver() {
    if (AudioEngine.ready) return AudioEngine.play('deliver');
    this.blip(520, 0.1, 'sine', 0.35, 0);
    this.blip(780, 0.14, 'sine', 0.3, 200);
  },
  hurt() {
    if (AudioEngine.ready) return AudioEngine.play('hurt');
    this.blip(110, 0.2, 'square', 0.4, -60);
  },
  alarm() {
    if (AudioEngine.ready) return AudioEngine.play('alarm');
    this.blip(440, 0.25, 'square', 0.3, 120);
    this.blip(330, 0.25, 'square', 0.25, -60);
  },
  hiveDie() {
    if (AudioEngine.ready) return AudioEngine.play('hiveDie');
    this.noise(0.5, 0.6);
    this.blip(90, 0.5, 'sawtooth', 0.5, -50);
  },
  explosion() {
    if (AudioEngine.ready) return AudioEngine.play('explosion');
    this.noise(0.35, 0.7);
    this.blip(70, 0.3, 'sine', 0.6, -30);
  },
  reload() {
    if (AudioEngine.ready) return AudioEngine.play('reload');
    this.blip(300, 0.06, 'square', 0.2, 100);
  },
  device() {
    if (AudioEngine.ready) return AudioEngine.play('device');
    this.blip(600, 0.12, 'triangle', 0.3, 200);
  },
  evac() {
    if (AudioEngine.ready) return AudioEngine.play('evac');
    this.blip(660, 0.3, 'sine', 0.3, 220);
  },
  railgun() {
    if (AudioEngine.ready) return AudioEngine.play('railgun');
    this.blip(1200, 0.12, 'sawtooth', 0.35, -800);
    this.noise(0.12, 0.4);
  },
  flak() {
    if (AudioEngine.ready) return AudioEngine.play('flak');
    this.blip(140, 0.15, 'square', 0.35, -60);
    this.noise(0.12, 0.35);
  },
  emp() {
    if (AudioEngine.ready) return AudioEngine.play('emp');
    this.blip(200, 0.3, 'sawtooth', 0.3, 400);
  },
  bossRoar() {
    if (AudioEngine.ready) return AudioEngine.play('bossRoar');
    this.noise(0.4, 0.7);
    this.blip(60, 0.6, 'sawtooth', 0.5, -20);
  },
  homing() {
    if (AudioEngine.ready) return AudioEngine.play('homing');
    this.blip(520, 0.12, 'sine', 0.25, 250);
    this.noise(0.08, 0.2);
  },
  ricochet() {
    if (AudioEngine.ready) return AudioEngine.play('ricochet');
    this.blip(900, 0.05, 'square', 0.18, -200);
  },
  cryo() {
    if (AudioEngine.ready) return AudioEngine.play('cryo');
    this.blip(700, 0.18, 'sine', 0.3, -300);
    this.noise(0.1, 0.2);
  },
  charge() {
    if (AudioEngine.ready) return AudioEngine.play('charge');
    this.blip(300, 0.2, 'sawtooth', 0.3, 900);
  },
};

export { Sound };
