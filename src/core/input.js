import { Sound } from './audio.js';
import { AudioEngine } from '../systems/audioEngine.js';

/* ============================== INPUT =================================== */
const Input = {
  keys: {},
  pressed: {},
  mouseX: 0,
  mouseY: 0,
  mouseDown: false,
  mouseClicked: false,
  init(canvas) {
    window.addEventListener('keydown', (e) => {
      if (['Tab', ' '].includes(e.key)) e.preventDefault();
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (!this.keys[k]) this.pressed[k] = true;
      this.keys[k] = true;
      Sound.init();
      AudioEngine.init(); // Tone.start() must run inside a user gesture
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      this.keys[k] = false;
    });
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouseX = (e.clientX - r.left) * (canvas.width / r.width);
      this.mouseY = (e.clientY - r.top) * (canvas.height / r.height);
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouseDown = true;
        this.mouseClicked = true;
      }
      Sound.init();
      AudioEngine.init();
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  },
  wasPressed(k) {
    return !!this.pressed[k];
  },
  endFrame() {
    this.pressed = {};
    this.mouseClicked = false;
  },
};

export { Input };
