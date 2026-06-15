/* ============================== PROFILES ================================ */
// Frontend-only local "authorization": named profiles in localStorage, each
// owning its own game save. Optional password is hashed with the built-in Web
// Crypto API (SHA-256 over salt+password) — never stored in plaintext. This
// gates LOCAL save slots, not a server; it is not real account security.
// If Web Crypto is unavailable (insecure context) profiles are password-less.
const REGISTRY_KEY = 'exoswarm_profiles_v1';
const SAVE_BASE = 'exoswarm_salvage_save_v1';

function loadRegistry() {
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    if (raw) {
      const r = JSON.parse(raw);
      if (r && Array.isArray(r.profiles)) return r;
    }
  } catch (e) {}
  return { profiles: [], lastId: 0 };
}

function saveRegistry(reg) {
  try {
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(reg));
  } catch (e) {}
}

function listProfiles() {
  return loadRegistry().profiles;
}

function saveKeyFor(id) {
  return SAVE_BASE + '::' + id;
}

function cryptoAvailable() {
  return !!(typeof crypto !== 'undefined' && crypto.subtle && crypto.getRandomValues);
}

function toHex(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
  return s;
}

// SHA-256 hex of (salt + password). Returns null if Web Crypto is unavailable.
async function sha256hex(salt, password) {
  if (!cryptoAvailable()) return null;
  try {
    const data = new TextEncoder().encode(salt + ':' + password);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return toHex(new Uint8Array(buf));
  } catch (e) {
    return null;
  }
}

function randomSalt() {
  if (!cryptoAvailable()) return 'nosalt';
  return toHex(crypto.getRandomValues(new Uint8Array(16)));
}

async function createProfile(name, password) {
  const reg = loadRegistry();
  const id = String(++reg.lastId);
  const salt = randomSalt();
  const hash = password ? await sha256hex(salt, password) : null;
  const profile = {
    id,
    name: String(name).slice(0, 20) || 'Clone ' + id,
    salt,
    hash,
    createdAt: id,
  };
  reg.profiles.push(profile);
  saveRegistry(reg);
  return profile;
}

async function verify(profile, password) {
  if (!profile.hash) return true; // password-less profile
  const h = await sha256hex(profile.salt, password || '');
  return h === profile.hash;
}

function deleteProfile(id) {
  const reg = loadRegistry();
  reg.profiles = reg.profiles.filter((p) => p.id !== id);
  saveRegistry(reg);
  try {
    localStorage.removeItem(saveKeyFor(id));
  } catch (e) {}
}

// One-time migration: if there are no profiles yet but a legacy single save
// exists, fold it into a "Default" profile so existing players keep progress.
async function migrateLegacy() {
  const reg = loadRegistry();
  if (reg.profiles.length > 0) return null;
  let legacy = null;
  try {
    legacy = localStorage.getItem(SAVE_BASE);
  } catch (e) {}
  if (!legacy) return null;
  const profile = await createProfile('Default', '');
  try {
    localStorage.setItem(saveKeyFor(profile.id), legacy);
  } catch (e) {}
  return profile;
}

export {
  loadRegistry,
  listProfiles,
  saveKeyFor,
  createProfile,
  verify,
  deleteProfile,
  migrateLegacy,
  sha256hex,
  randomSalt,
  cryptoAvailable,
};
