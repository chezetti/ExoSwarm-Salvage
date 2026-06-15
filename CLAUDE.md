# CLAUDE.md

Context for working in this repository. Read this first.

## What this is

**ExoSwarm Salvage** is a top-down sci-fi survival roguelite shooter built with **vanilla
JavaScript + the Canvas 2D API**. No game engine, no frameworks, no external assets. All graphics
are drawn with Canvas 2D primitives; all sound is synthesized at runtime — richer SFX and the
adaptive soundtrack go through **Tone.js** (the single sanctioned runtime dependency), with a raw
Web Audio fallback when Tone is unavailable. Dev tooling: Vite, ESLint, Prettier, Vitest.

The game was originally a single ~2500-line `main.js`. It has since been split into ES modules
under `src/`. **All user-facing text is in English.** Keep it that way — do not introduce other
languages into UI strings, toasts, or comments.

## Run / build / check

```bash
npm install        # install dev tooling (one time)
npm run dev        # Vite dev server with live reload at http://localhost:5173
npm run build      # minified production build into dist/
npm run preview    # serve the production build locally
npm run lint       # ESLint (flat config) over src/
npm run format     # Prettier over the repo
npm run test       # Vitest unit tests for pure logic (spatial grid, combo, status math)
```

Gameplay, rendering, and audio are verified by running the game and playing it (`npm run dev`);
the Vitest suite covers only pure-logic modules.

## Architecture

`index.html` loads `src/main.js` as an ES module (`<script type="module">`). **The `type="module"`
attribute matters** — without it Vite cannot bundle the entry, and `dist/` ends up missing the game
code. `src/main.js` is just the boot shim: it waits for `load` and does `window.game = new Game(canvas)`.

Module layout under `src/`:

```
src/
├── main.js                # entry/boot — creates the Game on window load
├── game.js                # Game class: main loop, states, world spawning, rendering, HUD, save/load
├── core/
│   ├── utils.js           # math/helpers: TAU, clamp, lerp, rand, randInt, dist, dist2, angleTo, angleDiff, pick, fmtTime
│   ├── audio.js           # Sound facade: routes to the Tone.js engine, raw Web Audio fallback
│   ├── input.js           # Input: keyboard + mouse state singleton
│   └── camera.js          # Camera: follow + screen shake, world<->screen transforms
├── config/
│   ├── data.js            # static config: WORLD_W/H, RESOURCE_TYPES, WEAPONS, ENEMY_TYPES,
│   │                      #   UPGRADES, MISSIONS, STATUS, DEVICES, HAZARDS, BIOMES
│   ├── loadouts.js        # station loadout choices + duplicate-free cycling helper
│   └── appearance.js      # skin palettes/shapes + defaultAppearance()
├── entities/
│   ├── particles.js       # Particle class (poolable) + adaptive burst() helper
│   ├── projectile.js      # Projectile (opts: pierce/aoe/status/homing/bounce/lob/fuse)
│   ├── clone.js           # drawClone(): shared procedural clone renderer (player/preview/avatar)
│   ├── damageNumber.js    # floating combat text (capped, off-screen culled)
│   ├── player.js          # Player: movement, loadout weapons, generic device dispatch
│   ├── enemy.js           # Enemy: melee/ranged/charger/warden AI + elite variants + statuses
│   ├── hive.js            # Hive: spawns enemies, grows over time, has a weak point
│   └── boss.js            # Apex Warden: phased boss, telegraphed attacks, weak point
├── world/
│   ├── resource.js        # ResourceNode: collectible salvage (light = auto-magnet, heavy = needs Mule)
│   ├── mule.js            # Mule: Mule-3 cargo hauler that follows the player
│   ├── outpost.js         # Outpost: cargo pad, reactor, repair, evac point
│   ├── turret.js          # Turret: deployable + outpost auto-turret
│   ├── mine.js            # Mine: deployable proximity explosive
│   ├── drone.js           # Drone device: orbits the player, auto-fires
│   ├── decoy.js           # Decoy device: holographic aggro magnet
│   └── hazard.js          # Hazard zones: spore cloud / acid pool / ember vent
└── systems/
    ├── mission.js         # Mission: objective tracking + bonus conditions
    ├── spatialGrid.js     # uniform grid for collision/AOE/targeting queries
    ├── audioEngine.js     # Tone.js SFX engine (lazy-loaded, pooled voices)
    ├── music.js           # adaptive Transport-driven soundtrack (run/boss/station)
    ├── status.js          # burn/freeze/corrode/stun status effects
    ├── combo.js           # kill-combo score multiplier (pure math)
    ├── overdrive.js       # Overdrive ultimate meter (pure math)
    ├── pool.js            # generic object pool (particles) to cut GC churn
    └── profiles.js        # local profiles + Web Crypto password hashing
```

The frame loop (`Game.loop`) is wrapped in an error boundary so a stray throw can't kill the rAF
chain (which would freeze input); offscreen entities are draw-culled via `Game.inView`. New
pure-logic modules are unit-tested under `tests/` (Vitest): spatialGrid, combo, status, pool,
profiles, weapons (projectile behaviors), overdrive.

Per-frame flow gotchas: `game.enemyGrid` is rebuilt in `updatePlaying` right after enemy updates —
turrets/mines/drones/hazards/projectiles query it afterwards, so keep that ordering. Hitstop scales
the gameplay `dt` but decays on real time (`rdt`), and the combo timer also ticks on real time.

### Module dependency rules

Each module uses `import`/`export`. The import graph flows roughly:
`core/utils` and `config/data` are leaves (no game imports). `audio`, `camera`, `particles`,
`projectile` depend only on those. `player` pulls in `turret`/`mine`; `enemy`/`hive` pull in
`resource`; `game.js` imports everything it spawns (`Player`, `Enemy`, `Hive`, `ResourceNode`,
`Mule`, `Outpost`, `Mission`, `Camera`). Nothing imports `game.js` (it is the top of the tree).

There are intentional runtime cross-references that are NOT imports: most classes receive the
`game` instance and reach siblings through it (`g.player`, `g.enemies`, `g.particles`,
`g.projectiles`, `g.mule`, `g.outpost`, `g.turrets`, `g.mines`, `g.resources`, `g.toast(...)`).
When adding a class, follow this pattern: take `game` in the constructor and push instances into
the relevant `game.<array>`; the Game loop calls each entity's `update(dt)` and `draw(ctx, cam)`.

If you add a cross-module reference, add the matching `import`. ESLint's `no-undef` catches a
missing import (error) and `no-unused-vars` flags an unused one (warning), so **lint is the fast
check that the import graph is intact** after edits.

## Gameplay model (for reasoning about code)

- **States** (`Game.state`): `login` → `station` → `playing` → `paused` / `death` / `victory`,
  plus `customize` and `settings` (both reached from the station). The game boots into `login`.
- **Profiles / auth** (`systems/profiles.js`): named local profiles in `localStorage`
  (`exoswarm_profiles_v1`), each with its own save key (`exoswarm_salvage_save_v1::<id>`). Optional
  password is SHA-256-hashed via Web Crypto (never plaintext); password-less if Web Crypto is
  unavailable. This is local save-slot gating, **not** real account security. A login-screen HTML
  `<input>` overlay (`index.html`/`syncLoginOverlay`) handles text entry and is hidden during play.
- **Loop**: drop a Vanguard clone on Morrow Fen with a random mission → fight the swarm, collect
  resources → deliver to the outpost Cargo Pad (light cargo carried by player, heavy by Mule-3) →
  evacuate from the outpost → spend credits on permanent station upgrades → repeat.
- **Resources**: bioResin, sporeFiber, salvageChips, softQuartz, hiveEnzymes (see `RESOURCE_TYPES`).
  Each has a `weight`; carrying past `carryCapacity` blocks pickup. Heavy nodes (`weightHeavy()`)
  must go into the Mule.
- **Weapons** (`WEAPONS`): pulse, shotgun, arc (heat/overheat), railgun (pierce), flak (AOE+burn),
  homingLauncher (seeking), ricochet (bounces off bounds), cryoMortar (lobbed, freezes), chargeBeam
  (hold-to-charge, fires on release). Behaviors live as `Projectile` opts (`pierce/aoe/status/
homing/bounce/lob/fuse`). Loadout picks 3 weapons; appearance + settings live on the profile.
- **Skins** (`config/appearance.js` + `entities/clone.js`): per-profile body/visor/accent/shape,
  drawn by the shared `drawClone()` used by the player sprite, the customizer preview, and login
  avatars. Procedural — no image assets.
- **Overdrive** (`systems/overdrive.js`): kill-charged ultimate (Space) granting a temporary
  fire-rate + damage surge; charge/timer tick on real dt like combo.
- **Devices**: turret (Q), shield (F), scanner (C), mine (X), plus drone/decoy/EMP — each on a cooldown.
- **Enemies** (`ENEMY_TYPES`): skitterling (melee), sporeMantis (ranged), carapaceBull (charger,
  armored), broodWarden (warden). Hives spawn them and level up to 3.
- **Missions** (`MISSIONS`): resourceRun, hivePurge, outpostRecovery — each with a bonus objective
  tracked in `systems/mission.js`.
- **Threat / Signal**: threat escalates over time and on hive kills; Signal Stability decay
  lengthens the evac timer. The `Signal Array` upgrade slows the decay.

## Controls

WASD move · mouse aim · LMB fire (hold to charge the Charge Beam) · Shift dash · R reload ·
1/2/3 switch weapon · Space Overdrive · Q/F/C/X devices · E interact · V evacuate (near outpost) ·
M map · Tab run stats · Esc pause. Input keys off `e.code` (layout-independent — works on
non-Latin keyboard layouts).

## Persistence

Meta progression (credits, resources, upgrade levels, loadout, appearance, settings, stats) is
saved per profile under `exoswarm_salvage_save_v1::<profileId>` (see `Game.saveKey()` /
`defaultMeta()` in `game.js`); the profile registry lives at `exoswarm_profiles_v1`. A legacy
single save under `exoswarm_salvage_save_v1` is migrated once into a "Default" profile
(`Profiles.migrateLegacy`). `load()` always starts from `defaultMeta()` then merges, so adding a
new meta field is safe for old saves — never crashes `JSON.parse`/load.

## Conventions / gotchas

- Plain JS, **not** TypeScript. 2-space indent, single quotes, semicolons (enforced by Prettier;
  config in `.prettierrc.json`).
- **Tone.js is the only sanctioned runtime dependency** (audio synthesis + adaptive music). Do not
  add other runtime libraries, and never add asset files (no images, no audio samples) — graphics
  stay procedural Canvas 2D, audio stays synthesized. The audio stack: `core/audio.js` is the
  API-stable `Sound` facade (raw Web Audio fallback); `systems/audioEngine.js` lazy-loads Tone on
  the first user gesture (`Tone.start()` must run inside a gesture handler) and pools PolySynth
  voices (never allocate synths per shot); `systems/music.js` runs Transport-driven layered music
  gated by game state/threat. A failed Tone init must degrade to silence/fallback — never throw.
- Coordinates are world-space; convert with `cam.wx/wy` (world→screen) and `cam.toWorldX/Y`
  (screen→world) when drawing or reading the mouse.
- `dt` is seconds. Avoid frame-rate-dependent constants; scale by `dt`.
- Pre-existing ESLint warnings (a handful of unused params like `fx`, `fy`, `dmg`, `src`) are
  benign; don't churn unrelated code to silence them.
- When touching UI strings, keep them English.
