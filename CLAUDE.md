# CLAUDE.md

Context for working in this repository. Read this first.

## What this is

**ExoSwarm Salvage** is a top-down sci-fi survival roguelite shooter built with **vanilla
JavaScript + the Canvas 2D API**. No game engine, no frameworks, no external assets. All sound is
synthesized at runtime with the Web Audio API; all graphics are drawn with Canvas 2D primitives.
The only dependencies are dev tooling (Vite, ESLint, Prettier).

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
```

The game also runs by simply opening `index.html` in a browser — it is pure static content. There
is no test suite; verify changes by running the game and playing it.

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
│   ├── audio.js           # Sound: Web Audio API synth (blips, noise, named SFX)
│   ├── input.js           # Input: keyboard + mouse state singleton
│   └── camera.js          # Camera: follow + screen shake, world<->screen transforms
├── config/
│   └── data.js            # static config: WORLD_W/H, RESOURCE_TYPES, WEAPONS, ENEMY_TYPES, UPGRADES, MISSIONS
├── entities/
│   ├── particles.js       # Particle class + burst() helper
│   ├── projectile.js      # Projectile class
│   ├── player.js          # Player: movement, weapons, devices, pickups, interaction
│   ├── enemy.js           # Enemy: AI for melee/ranged/charger/warden kinds
│   └── hive.js            # Hive: spawns enemies, grows over time, has a weak point
├── world/
│   ├── resource.js        # ResourceNode: collectible salvage (light = auto-magnet, heavy = needs Mule)
│   ├── mule.js            # Mule: Mule-3 cargo hauler that follows the player
│   ├── outpost.js         # Outpost: cargo pad, reactor, repair, evac point
│   ├── turret.js          # Turret: deployable + outpost auto-turret
│   └── mine.js            # Mine: deployable proximity explosive
└── systems/
    └── mission.js         # Mission: objective tracking + bonus conditions
```

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

- **States** (`Game.state`): `station` → `playing` → `paused` / `death` / `victory`.
- **Loop**: drop a Vanguard clone on Morrow Fen with a random mission → fight the swarm, collect
  resources → deliver to the outpost Cargo Pad (light cargo carried by player, heavy by Mule-3) →
  evacuate from the outpost → spend credits on permanent station upgrades → repeat.
- **Resources**: bioResin, sporeFiber, salvageChips, softQuartz, hiveEnzymes (see `RESOURCE_TYPES`).
  Each has a `weight`; carrying past `carryCapacity` blocks pickup. Heavy nodes (`weightHeavy()`)
  must go into the Mule.
- **Weapons** (`WEAPONS`): `pulse` (slot 1), `shotgun` (slot 2), `arc` (slot 3, uses heat/overheat).
- **Devices**: turret (Q), shield (F), scanner (C), mine (X), each on a cooldown.
- **Enemies** (`ENEMY_TYPES`): skitterling (melee), sporeMantis (ranged), carapaceBull (charger,
  armored), broodWarden (warden). Hives spawn them and level up to 3.
- **Missions** (`MISSIONS`): resourceRun, hivePurge, outpostRecovery — each with a bonus objective
  tracked in `systems/mission.js`.
- **Threat / Signal**: threat escalates over time and on hive kills; Signal Stability decay
  lengthens the evac timer. The `Signal Array` upgrade slows the decay.

## Controls

WASD move · mouse aim · LMB fire · Shift dash · R reload · 1/2/3 switch weapon ·
Q turret · F shield · C scanner · X mine · E interact · V evacuate (near outpost) ·
M map · Tab run stats · Esc pause.

## Persistence

Meta progression (credits, resources, upgrade levels, run count, best score) is saved to
`localStorage` under the key `exoswarm_salvage_save_v1` (see `SAVE_KEY` / `defaultMeta` in
`game.js`). If you change the meta shape, bump the key or handle migration so old saves don't
crash `JSON.parse`/load.

## Conventions / gotchas

- Plain JS, **not** TypeScript. 2-space indent, single quotes, semicolons (enforced by Prettier;
  config in `.prettierrc.json`).
- Keep the zero-runtime-dependency property: no game libraries, no asset files. Procedural
  audio/graphics only.
- Coordinates are world-space; convert with `cam.wx/wy` (world→screen) and `cam.toWorldX/Y`
  (screen→world) when drawing or reading the mouse.
- `dt` is seconds. Avoid frame-rate-dependent constants; scale by `dt`.
- Pre-existing ESLint warnings (a handful of unused params like `fx`, `fy`, `dmg`, `src`) are
  benign; don't churn unrelated code to silence them.
- When touching UI strings, keep them English.
