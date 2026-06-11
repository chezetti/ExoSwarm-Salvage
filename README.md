<div align="center">

# 🛰️ ExoSwarm Salvage

**A top-down sci-fi survival roguelite shooter in vanilla JavaScript + Canvas 2D**

_No libraries. No assets. Just the cold vacuum of space and a swarm of hostile biomass._

[![Made with Vanilla JS](https://img.shields.io/badge/Made%20with-Vanilla%20JS-f7df1e?logo=javascript&logoColor=000)](https://developer.mozilla.org/docs/Web/JavaScript)
[![Canvas 2D](https://img.shields.io/badge/Render-Canvas%202D-6e8bff)](https://developer.mozilla.org/docs/Web/API/Canvas_API)
[![No dependencies](https://img.shields.io/badge/Runtime%20deps-0-5dff7a)](#)
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

The whole game is rendered with Canvas 2D primitives and the audio is synthesized on the fly with
the Web Audio API — **zero external assets and zero runtime dependencies.**

## ✨ Features

- 🎮 **Three weapons** — Pulse Rifle, Shotgun and Arc Projector (with a heat/overheat mechanic).
- 🛠️ **Four combat devices** — turret, energy shield, area scanner and mine.
- 👾 **Varied enemies** — Skitterling, Spore Mantis, Carapace Bull, Brood Warden, and Hives.
- 📦 **Salvage & weight system** — light salvage is magneted in, heavy salvage is hauled by **Mule-3**.
- 🎯 **Three mission types** — Resource Run, Hive Purge and Outpost Recovery, each with a bonus objective.
- 📈 **Meta progression** — 8 permanent station upgrades, credits, best-score tracking.
- 📡 **Signal Stability mechanic** — the longer you stay on the surface, the longer evac takes.
- 🔊 **Procedural audio** via the Web Audio API — not a single sound file.
- ⚡ **Instant start** — opens straight in the browser, loads in milliseconds.

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
│   ├── audio.js           # Web Audio API sound synthesis
│   ├── input.js           # keyboard & mouse
│   └── camera.js          # follow camera with screen shake
├── config/
│   └── data.js            # weapon / enemy / resource / upgrade / mission config
├── entities/
│   ├── particles.js       # particle system
│   ├── projectile.js      # projectiles
│   ├── player.js          # Vanguard clone: movement, weapons, devices
│   ├── enemy.js           # swarm AI
│   └── hive.js            # hives that spawn and grow
├── world/
│   ├── resource.js        # collectible salvage nodes
│   ├── mule.js            # Mule-3 cargo hauler
│   ├── outpost.js         # cargo pad, reactor, repair, evac
│   ├── turret.js          # deployable / outpost turret
│   └── mine.js            # proximity mine
└── systems/
    └── mission.js         # mission objectives & bonus goals
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

```bash
npm run lint        # check the code
npm run lint:fix    # auto-fix what can be fixed
npm run format      # format the whole repo
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
