/* ============================= APPEARANCE =============================== */
// Procedural skin options for the Vanguard clone. Stored per profile in
// meta.appearance and consumed by the shared drawClone() renderer, so the
// in-game player sprite, the customizer preview, and the login avatar all
// stay in sync. No image assets — pure Canvas.
const BODY_COLORS = ['#9fb6c4', '#7ad0a0', '#d0a0ff', '#ffb04d', '#ff7a8a', '#8ab4ff', '#cfd8e0'];
const VISOR_COLORS = ['#1ee2ff', '#5dff7a', '#ffd35d', '#ff5d8a', '#b06bff', '#ffffff'];
const ACCENT_COLORS = ['#5a6f7d', '#2ee6a8', '#c96a1a', '#7a3d8a', '#3d5a8a'];
const SHAPES = ['capsule', 'wedge', 'round'];

function defaultAppearance() {
  // Matches the original fixed look so existing profiles are unchanged.
  return { body: '#9fb6c4', visor: '#1ee2ff', accent: '#5a6f7d', shape: 'capsule' };
}

export { BODY_COLORS, VISOR_COLORS, ACCENT_COLORS, SHAPES, defaultAppearance };
