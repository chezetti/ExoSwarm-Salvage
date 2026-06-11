/* =============================== MUSIC ================================== */
// Adaptive procedural soundtrack on the Tone.js Transport. All layers are
// scheduled once with Tone.Loop and gated by mode/intensity inside the
// callbacks — cheap adaptivity, no node rebuilds. Initialized by
// AudioEngine.init() after the first user gesture.
const Music = {
  ready: false,
  mode: null, // null | 'station' | 'run' | 'boss'
  level: 0,
  _started: false,
  _bar: 0,
  init(Tone, dest) {
    try {
      this.Tone = Tone;
      this.transport = Tone.getTransport ? Tone.getTransport() : Tone.Transport;
      this.gain = new Tone.Gain(0.3).connect(dest);
      this.bass = new Tone.MonoSynth({
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.01, decay: 0.25, sustain: 0.3, release: 0.2 },
        filterEnvelope: {
          attack: 0.005,
          decay: 0.15,
          sustain: 0.4,
          release: 0.2,
          baseFrequency: 120,
          octaves: 2.5,
        },
        volume: -10,
      }).connect(this.gain);
      this.pad = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'sine' },
        envelope: { attack: 1.5, decay: 1, sustain: 0.5, release: 2.5 },
        volume: -20,
      }).connect(this.gain);
      this.arp = new Tone.Synth({
        oscillator: { type: 'square' },
        envelope: { attack: 0.004, decay: 0.1, sustain: 0, release: 0.08 },
        volume: -22,
      }).connect(this.gain);
      this.hat = new Tone.NoiseSynth({
        noise: { type: 'white' },
        envelope: { attack: 0.001, decay: 0.035, sustain: 0 },
        volume: -26,
      }).connect(this.gain);

      const ROOTS = ['D2', 'D2', 'F2', 'C2'];
      const ARP = {
        run: ['D4', 'F4', 'A4', 'C5', 'A4', 'F4', 'E4', 'F4'],
        boss: ['D4', 'Eb4', 'G4', 'A4', 'Eb5', 'D5', 'A4', 'G4'],
      };
      const PADS = [
        ['D3', 'F3', 'A3'],
        ['D3', 'F3', 'C4'],
        ['F3', 'A3', 'C4'],
        ['C3', 'E3', 'G3'],
      ];
      let arpIdx = 0;

      this.bassLoop = new Tone.Loop((time) => {
        if (!this.mode || this.mode === 'station') return;
        const root = ROOTS[this._bar % ROOTS.length];
        this.bass.triggerAttackRelease(root, '8n', time);
        if (this.level >= 3 || this.mode === 'boss')
          this.bass.triggerAttackRelease(root, '16n', time + Tone.Time('8n').toSeconds() * 1.5);
      }, '2n');
      this.barLoop = new Tone.Loop((time) => {
        this._bar++;
        if (!this.mode) return;
        if (this.mode === 'station' || this.level <= 1) {
          this.pad.triggerAttackRelease(
            PADS[this._bar % PADS.length],
            '1m',
            time,
            this.mode === 'station' ? 0.5 : 0.35
          );
        }
      }, '1m');
      this.arpLoop = new Tone.Loop((time) => {
        if (!this.mode || this.mode === 'station') return;
        if (this.mode !== 'boss' && this.level < 2) return;
        const seq = ARP[this.mode === 'boss' ? 'boss' : 'run'];
        this.arp.triggerAttackRelease(seq[arpIdx++ % seq.length], '16n', time);
      }, '8n');
      this.hatLoop = new Tone.Loop((time) => {
        if (!this.mode || this.mode === 'station') return;
        if (this.mode !== 'boss' && this.level < 3) return;
        this.hat.triggerAttackRelease('16n', time);
      }, '4n');
      this.ready = true;
    } catch (e) {
      this.ready = false;
    }
  },
  _ensureStarted() {
    if (this._started) return;
    this._started = true;
    try {
      this.bassLoop.start(0);
      this.barLoop.start(0);
      this.arpLoop.start(0);
      this.hatLoop.start(0);
      this.transport.start();
    } catch (e) {}
  },
  setMode(mode) {
    if (!this.ready) return;
    if (mode && !this._started) this._ensureStarted();
    if (this.mode === mode) return;
    this.mode = mode;
    this._applyTempo();
  },
  setIntensity(level) {
    if (!this.ready || level === this.level) return;
    this.level = level;
    this._applyTempo();
  },
  _applyTempo() {
    try {
      const bpm = this.mode === 'boss' ? 132 : this.mode === 'run' ? 88 + this.level * 9 : 70;
      this.transport.bpm.rampTo(bpm, 1.2);
    } catch (e) {}
  },
  // Called every frame from Game.update — cheap state sync (no-ops on no change).
  sync(game) {
    if (!this.ready) return;
    let mode = null;
    if (game.state === 'playing') mode = game.boss && !game.boss.dead ? 'boss' : 'run';
    else if (game.state === 'station') mode = 'station';
    this.setMode(mode);
    if (mode === 'run' || mode === 'boss') this.setIntensity(game.threatLevel());
  },
};

export { Music };
