/* =========================================================================
   ExoSwarm Salvage — top-down sci-fi survival roguelite shooter
   Vanilla JS + Canvas 2D, no libs, no assets.
   Entry point: boots the game once the DOM is ready.
   ========================================================================= */
import { Game } from './game.js';

window.addEventListener('load', () => {
  const canvas = document.getElementById('game');
  window.game = new Game(canvas);
});
