/* ============================ AUDIO ENGINE ============================== */
// Tone.js-backed SFX engine. Lazy-loaded on the first user gesture
// (Tone.start() must run inside a gesture handler). If Tone fails to load
// or start, `ready` stays false and the raw Web Audio fallback in
// core/audio.js keeps working. Voices are pooled PolySynths — never
// allocate synths in the play() hot path.
const AudioEngine = {
  enabled: true,
  ready: false,
  _initStarted: false,
  Tone: null,
  async init() {
    if (this._initStarted || !this.enabled) return;
    this._initStarted = true;
    try {
      const Tone = await import('tone');
      await Tone.start();
      this.Tone = Tone;
      this.master = new Tone.Gain(0.5).toDestination();
      this.reverb = new Tone.Reverb({ decay: 1.8, wet: 0.14 }).connect(this.master);

      const poly = (synthClass, options) => {
        const s = new Tone.PolySynth(synthClass, options);
        s.maxPolyphony = 12;
        s.connect(this.reverb);
        return s;
      };
      this.square = poly(Tone.Synth, {
        oscillator: { type: 'square' },
        envelope: { attack: 0.001, decay: 0.07, sustain: 0, release: 0.06 },
        volume: -14,
      });
      this.saw = poly(Tone.Synth, {
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.08 },
        volume: -16,
      });
      this.tri = poly(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.06 },
        volume: -13,
      });
      this.sine = poly(Tone.Synth, {
        oscillator: { type: 'sine' },
        envelope: { attack: 0.002, decay: 0.1, sustain: 0, release: 0.1 },
        volume: -12,
      });
      this.boom = poly(Tone.MembraneSynth, {
        pitchDecay: 0.06,
        octaves: 7,
        envelope: { attack: 0.001, decay: 0.4, sustain: 0 },
        volume: -8,
      });
      // NoiseSynth is monophonic — round-robin a small pool for overlaps
      this.noises = [0, 1, 2].map(() => {
        const n = new Tone.NoiseSynth({
          noise: { type: 'white' },
          envelope: { attack: 0.001, decay: 0.18, sustain: 0 },
          volume: -14,
        });
        n.connect(this.reverb);
        return n;
      });
      this._noiseIdx = 0;
      this._buildDefs();
      const { Music } = await import('./music.js');
      Music.init(Tone, this.master);
      this.ready = true;
    } catch (e) {
      this.enabled = false;
    }
  },
  _noise(dur, vel) {
    this._noiseIdx = (this._noiseIdx + 1) % this.noises.length;
    try {
      this.noises[this._noiseIdx].triggerAttackRelease(dur, undefined, vel);
    } catch (e) {}
  },
  _buildDefs() {
    const now = () => this.Tone.now();
    this.defs = {
      shoot: () => {
        this.square.triggerAttackRelease(680, 0.06, undefined, 0.5);
        this.square.triggerAttackRelease(420, 0.05, now() + 0.02, 0.25);
      },
      shotgun: () => {
        this._noise(0.2, 0.9);
        this.boom.triggerAttackRelease(95, 0.25, undefined, 0.9);
      },
      arc: () => {
        this.saw.triggerAttackRelease(900 + Math.random() * 400, 0.05, undefined, 0.25);
      },
      hit: () => {
        this.tri.triggerAttackRelease(200 + Math.random() * 40, 0.05, undefined, 0.5);
      },
      enemyDie: () => {
        this.saw.triggerAttackRelease(150, 0.14, undefined, 0.6);
        this.saw.triggerAttackRelease(95, 0.18, now() + 0.05, 0.5);
        this._noise(0.12, 0.4);
      },
      pickup: () => {
        this.sine.triggerAttackRelease(880, 0.06, undefined, 0.55);
        this.sine.triggerAttackRelease(1318, 0.08, now() + 0.06, 0.4);
      },
      deliver: () => {
        this.sine.triggerAttackRelease(523, 0.1, undefined, 0.5);
        this.sine.triggerAttackRelease(784, 0.12, now() + 0.08, 0.45);
        this.sine.triggerAttackRelease(1046, 0.16, now() + 0.16, 0.4);
      },
      hurt: () => {
        this.square.triggerAttackRelease(110, 0.18, undefined, 0.7);
        this._noise(0.08, 0.3);
      },
      alarm: () => {
        this.square.triggerAttackRelease(440, 0.22, undefined, 0.5);
        this.square.triggerAttackRelease(330, 0.22, now() + 0.12, 0.45);
      },
      hiveDie: () => {
        this._noise(0.5, 1);
        this.boom.triggerAttackRelease(55, 0.6, undefined, 1);
        this.saw.triggerAttackRelease(80, 0.5, now() + 0.1, 0.5);
      },
      explosion: () => {
        this._noise(0.35, 1);
        this.boom.triggerAttackRelease(50, 0.5, undefined, 1);
      },
      reload: () => {
        this.square.triggerAttackRelease(300, 0.05, undefined, 0.35);
        this.square.triggerAttackRelease(450, 0.05, now() + 0.07, 0.3);
      },
      device: () => {
        this.tri.triggerAttackRelease(600, 0.1, undefined, 0.5);
        this.tri.triggerAttackRelease(900, 0.1, now() + 0.07, 0.4);
      },
      evac: () => {
        this.sine.triggerAttackRelease(660, 0.25, undefined, 0.5);
        this.sine.triggerAttackRelease(990, 0.3, now() + 0.15, 0.4);
      },
      railgun: () => {
        this.saw.triggerAttackRelease(1500, 0.12, undefined, 0.6);
        this.boom.triggerAttackRelease(70, 0.3, now() + 0.02, 0.8);
      },
      flak: () => {
        this.boom.triggerAttackRelease(120, 0.2, undefined, 0.7);
        this._noise(0.15, 0.6);
      },
      emp: () => {
        this.saw.triggerAttackRelease(200, 0.3, undefined, 0.5);
        this.sine.triggerAttackRelease(1500, 0.25, now() + 0.05, 0.35);
      },
      bossRoar: () => {
        this.boom.triggerAttackRelease(40, 0.8, undefined, 1);
        this.saw.triggerAttackRelease(60, 0.7, now() + 0.1, 0.6);
        this._noise(0.4, 0.7);
      },
      homing: () => {
        this.sine.triggerAttackRelease(520, 0.12, undefined, 0.4);
        this.sine.triggerAttackRelease(760, 0.1, now() + 0.06, 0.3);
      },
      ricochet: () => {
        this.square.triggerAttackRelease(1000, 0.04, undefined, 0.35);
      },
      cryo: () => {
        this.sine.triggerAttackRelease(760, 0.2, undefined, 0.45);
        this._noise(0.12, 0.25);
      },
      charge: () => {
        this.saw.triggerAttackRelease(1400, 0.14, undefined, 0.5);
        this.boom.triggerAttackRelease(80, 0.25, now() + 0.02, 0.7);
      },
    };
  },
  play(name) {
    if (!this.ready) return;
    const d = this.defs[name];
    if (!d) return;
    try {
      d();
    } catch (e) {}
  },
  // Drop-in replacement for the raw Sound.blip — routes one-off blips
  // (enemy attacks, turret fire) through the pooled Tone voices.
  blip(freq, dur, type, vol, slide) {
    if (!this.ready) return;
    const pool =
      type === 'sawtooth'
        ? this.saw
        : type === 'triangle'
          ? this.tri
          : type === 'sine'
            ? this.sine
            : this.square;
    try {
      pool.triggerAttackRelease(
        Math.max(30, freq + (slide ? slide * 0.3 : 0)),
        dur,
        undefined,
        Math.min(1, (vol || 0.5) * 1.6)
      );
    } catch (e) {}
  },
};

export { AudioEngine };
