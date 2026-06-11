<div align="center">

# 🛰️ ExoSwarm Salvage

**A top-down sci-fi survival roguelite shooter in vanilla JavaScript + Canvas 2D**

_No assets. No engine. Just Canvas 2D, synthesized sound, and a swarm of hostile biomass._

[![Made with Vanilla JS](https://img.shields.io/badge/Made%20with-Vanilla%20JS-f7df1e?logo=javascript&logoColor=000)](https://developer.mozilla.org/docs/Web/JavaScript)
[![Canvas 2D](https://img.shields.io/badge/Render-Canvas%202D-6e8bff)](https://developer.mozilla.org/docs/Web/API/Canvas_API)
[![Audio: Tone.js](https://img.shields.io/badge/Audio-Tone.js-5dff7a)](https://tonejs.github.io)
[![Built with Vite](https://img.shields.io/badge/Dev-Vite-646cff?logo=vite&logoColor=fff)](https://vitejs.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-d8dde6)](LICENSE)

</div>

---

## 📖 About

**ExoSwarm Salvage** is a fast-paced top-down roguelite shooter. You control a **Vanguard** combat
clone, dropped by the **Pale Harbor** station onto the infested planet **Morrow Fen**. The goal is
simple and merciless: harvest valuable salvage, complete your mission, and evacuate before the
exo-biomass swarm tears your shell apart.

Every run is procedural and random. Between runs you return to the station, spend credits on
permanent upgrades, and dive back into the fog of war. The classic roguelite loop:
**deploy → harvest → upgrade → deploy**.

The whole game is rendered with Canvas 2D primitives and all audio is synthesized at runtime —
**zero asset files**. The only runtime dependency is **Tone.js**, powering the layered SFX and the
adaptive soundtrack (lazy-loaded, with a raw Web Audio fallback).

## ✨ Features

- 🎮 **Five weapons** — Pulse Rifle, Shotgun, Arc Projector (overheat), piercing Railgun and
  burning Flak Launcher; pick three per loadout.
- 🛠️ **Seven combat devices** — turret, energy shield, scanner, mine, orbiting drone, holographic
  decoy and EMP burst; pick four per loadout.
- 👾 **Varied enemies** — Skitterling, Spore Mantis, Carapace Bull, Brood Warden, Hives — plus
  **elite variants** (splitter / armored / frenzied) and the **Apex Warden boss** with telegraphed,
  phased attacks.
- 🔥 **Status effects** — burn, freeze, corrode and stun interact with armor and movement.
- 💥 **Combat juice** — hitstop, floating damage numbers and a decaying **combo multiplier**.
- 🌋 **Dynamic world** — three biomes, environmental hazards (spore clouds, acid pools, ember
  vents) and spore-storm weather events at high threat.
- 📦 **Salvage & weight system** — light salvage is magneted in, heavy salvage is hauled by **Mule-3**.
- 🎯 **Four mission types** — Resource Run, Hive Purge, Outpost Recovery and Apex Hunt, each with a
  bonus objective.
- 📈 **Meta progression** — 8 permanent station upgrades, loadout selection, credits, best-score tracking.
- 📡 **Signal Stability mechanic** — the longer you stay on the surface, the longer evac takes.
- 🔊 **Adaptive synthesized audio** — Tone.js SFX + a threat-driven soundtrack that shifts for boss
  fights; not a single sound file.
- ⚡ **Instant start** — opens straight in the browser; Tone.js loads lazily on the first input.

## 🚀 Quick start

The game runs as plain static content, but a Vite-based dev workflow is set up for convenience.

### Option 1 — just open it

Open `index.html` in a browser. That's it.

### Option 2 — dev server with live reload (recommended)

```bash
npm install      # one time — install the dev tooling
npm run dev      # start the Vite dev server at http://localhost:5173
```

### Production build

```bash
npm run build    # build a minified version into dist/
npm run preview  # preview the production build locally
```

## 🎮 Controls

| Action        | Key / input            |
| ------------- | ---------------------- |
| Move          | `W` `A` `S` `D`        |
| Aim / fire    | Mouse / **LMB**        |
| Dash          | `Shift`                |
| Reload        | `R`                    |
| Switch weapon | `1` `2` `3`            |
| Turret        | `Q`                    |
| Energy shield | `F`                    |
| Scanner       | `C`                    |
| Mine          | `X`                    |
| Interact      | `E`                    |
| Evacuate      | `V` (near the outpost) |
| Map           | `M`                    |
| Run stats     | `Tab`                  |
| Pause         | `Esc`                  |

## 🗺️ Gameplay loop

1. **Deploy.** Pale Harbor station drops a clone onto Morrow Fen with a random mission.
2. **Clear & harvest.** Destroy the swarm and collect resources: Bio Resin, Spore Fiber, Salvage
   Chips, Soft Quartz and rare Hive Enzymes.
3. **Deliver.** Carry light cargo to the Cargo Pad yourself; load heavy cargo into the **Mule-3** hauler.
4. **Evacuate.** Reach the outpost and hold position while evac runs (longer the lower your
   **Signal Stability**).
5. **Upgrade.** Back at the station, spend credits on 8 upgrade types and return stronger.

## 🧱 Architecture

The game is structured as ES modules under [`src/`](src/). `index.html` loads
[`src/main.js`](src/main.js) as a module, which boots the [`Game`](src/game.js).

```
src/
├── main.js                # entry / boot
├── game.js                # main loop, states, world spawning, rendering, HUD, save/load
├── core/
│   ├── utils.js           # math & helpers (clamp, lerp, angle math, …)
│   ├── audio.js           # Sound facade (Tone.js engine + raw Web Audio fallback)
│   ├── input.js           # keyboard & mouse (also boots audio on first gesture)
│   └── camera.js          # follow camera with screen shake
├── config/
│   ├── data.js            # weapons / enemies / resources / upgrades / missions /
│   │                      #   statuses / devices / hazards / biomes
│   └── loadouts.js        # station loadout choices
├── entities/
│   ├── particles.js       # particle system
│   ├── projectile.js      # projectiles (pierce / AOE / status payloads)
│   ├── damageNumber.js    # floating combat text
│   ├── player.js          # Vanguard clone: movement, loadout weapons, devices
│   ├── enemy.js           # swarm AI + elite variants
│   ├── hive.js            # hives that spawn and grow
│   └── boss.js            # Apex Warden boss
├── world/
│   ├── resource.js        # collectible salvage nodes
│   ├── mule.js            # Mule-3 cargo hauler
│   ├── outpost.js         # cargo pad, reactor, repair, evac
│   ├── turret.js          # deployable / outpost turret
│   ├── mine.js            # proximity mine
│   ├── drone.js           # orbiting companion drone
│   ├── decoy.js           # holographic decoy
│   └── hazard.js          # environmental hazard zones
└── systems/
    ├── mission.js         # mission objectives & bonus goals
    ├── spatialGrid.js     # spatial partitioning for collisions & AOE
    ├── audioEngine.js     # Tone.js SFX engine (pooled voices, lazy-loaded)
    ├── music.js           # adaptive soundtrack (threat / boss / station)
    ├── status.js          # burn / freeze / corrode / stun
    └── combo.js           # kill-combo score multiplier
```

Game states: `station` → `playing` → `paused` / `death` / `victory`.

Most entities receive the `Game` instance and reach siblings through it (`g.player`, `g.enemies`,
`g.particles`, …) rather than importing each other directly. See [`CLAUDE.md`](CLAUDE.md) for the
full dependency model and conventions.

## 🛠️ Development tooling

| Tool             | Purpose                               | Command          |
| ---------------- | ------------------------------------- | ---------------- |
| **Vite**         | dev server with live reload + build   | `npm run dev`    |
| **ESLint**       | static analysis (flat config)         | `npm run lint`   |
| **Prettier**     | code formatting                       | `npm run format` |
| **EditorConfig** | consistent indentation across editors | _automatic_      |
| **Vitest**       | unit tests for pure logic modules     | `npm run test`   |

```bash
npm run lint        # check the code
npm run lint:fix    # auto-fix what can be fixed
npm run format      # format the whole repo
npm run test        # run the unit tests (spatial grid, combo, status)
```

`.vscode/extensions.json` recommends the matching editor extensions, and `.gitignore` /
`.gitattributes` are set up for a Node + Vite project.

## 📂 Project layout

```
ExoSwarm-Salvage/
├── index.html          # loads src/main.js as a module
├── style.css           # canvas styles
├── src/                # game source (ES modules)
├── package.json        # scripts & dev dependencies
├── vite.config.js      # dev server + build config
├── eslint.config.js    # lint rules (flat config)
├── .prettierrc.json    # formatting rules
├── .editorconfig       # shared editor settings
├── CLAUDE.md           # context for AI assistants / contributors
└── LICENSE
```

## 🤝 Contributing

PRs and issues are welcome. Run `npm run lint` and `npm run format` before committing, and keep all
user-facing text in English.

## 📜 License

Released under the [MIT](LICENSE) license.

---

<div align="center">

_"Morrow Fen orbit • Year 2184 • Vanguard clone ready for deployment"_

</div>
