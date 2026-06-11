import { Sound } from './audio.js';
import { AudioEngine } from '../systems/audioEngine.js';

/* ============================== INPUT =================================== */
// Map a KeyboardEvent to the layout-independent logical token the game uses.
// We key off e.code (physical key) so non-Latin layouts (e.g. Cyrillic) still
// drive WASD and the letter bindings; e.key would return the localized
// character ('ц' instead of 'w') and silently break movement.
function keyFromEvent(e) {
  const c = e.code;
  if (c) {
    if (c.startsWith('Key')) return c.slice(3).toLowerCase(); // KeyW -> 'w'
    if (c.startsWith('Digit')) return c.slice(5); // Digit1 -> '1'
    if (c === 'ShiftLeft' || c === 'ShiftRight') return 'Shift';
    if (c === 'Space') return ' ';
    if (c === 'Escape' || c === 'Tab') return c;
  }
  // fallback for keys without a useful code
  return e.key.length === 1 ? e.key.toLowerCase() : e.key;
}
const Input = {
  keys: {},
  pressed: {},
  mouseX: 0,
  mouseY: 0,
  mouseDown: false,
  mouseClicked: false,
  init(canvas) {
    window.addEventListener('keydown', (e) => {
      const k = keyFromEvent(e);
      if (k === 'Tab' || k === ' ') e.preventDefault();
      if (!this.keys[k]) this.pressed[k] = true;
      this.keys[k] = true;
      Sound.init();
      AudioEngine.init(); // Tone.start() must run inside a user gesture
    });
    window.addEventListener('keyup', (e) => {
      const k = keyFromEvent(e);
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
