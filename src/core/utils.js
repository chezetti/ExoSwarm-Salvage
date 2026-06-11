/* ============================== UTILS =================================== */
const TAU = Math.PI * 2;
function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function rand(a, b) {
  return a + Math.random() * (b - a);
}
function randInt(a, b) {
  return Math.floor(rand(a, b + 1));
}
function dist(ax, ay, bx, by) {
  const dx = bx - ax,
    dy = by - ay;
  return Math.hypot(dx, dy);
}
function dist2(ax, ay, bx, by) {
  const dx = bx - ax,
    dy = by - ay;
  return dx * dx + dy * dy;
}
function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}
function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60),
    s = sec % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}

export { TAU, clamp, lerp, rand, randInt, dist, dist2, angleTo, angleDiff, pick, fmtTime };
