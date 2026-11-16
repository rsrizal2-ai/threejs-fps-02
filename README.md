# Emberline — a three.js tactical FPS

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/rsrizal2-ai/threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/rsrizal2-ai/threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

Entry for the [threejs-fps-02 bounty](https://make.fun/bounty/threejs-fps-02) on make.fun.

**Emberline** is an original round-based tactical FPS in the style
Counter-Strike made famous — its own map, art, sounds and names. You are
Vanguard, attacking Dock 7, a dusk container yard with two bomb sites.
Plant the bomb at A or B, or eliminate the Sentinel squad; earn money
each round and spend it on rifles, shotguns, grenades and armour. First
to 5 rounds takes the match.

## How to play

Serve `game/` with any static server (`node serve.ts` serves it on
http://localhost:8080) and open `index.html` in desktop Chrome. No build
step, no network requests, no accounts.

- **WASD** — move, **Mouse** — look, **Click** — fire
- **R** — reload, **Ctrl / C** — crouch, **Space** — jump
- **1 / 2 / 3** — switch weapon, **G** — throw grenade
- **E** — hold to plant the bomb inside a site ring
- **B** — buy menu during the buy phase (or click the buttons)

Win a round by eliminating the Sentinel squad or detonating the planted
bomb. Lose it if your squad is wiped, time runs out before a plant, or
the bomb is defused. Kills pay $300, a plant pays $300, a round win pays
$3250 and a loss pays $1900.

## What's inside

- `game/index.html` — the page, HUD, buy menu and overlays
- `game/src/main.js` — boot, the fixed-step loop, shooting, rounds, bomb
- `game/src/world.js` — Dock 7: two sites, mid lane, crates, waypoints
- `game/src/bots.js` — Vanguard teammates and Sentinel defenders: waypoint
  patrols, line-of-sight perception, burst fire, tracers
- `game/src/weapons.js` — rifle, shotgun and pistol, view models, spread
- `game/src/grenades.js` — thrown frag with bounce, fuse and blast
- `game/src/bomb.js` — plant / defuse / fuse timers and the explosion
- `game/src/rounds.js` — round and match flow plus the economy
- `game/src/player.js` — movement, collision, health and armour
- `game/src/physics.js` — shared mover, line-of-sight, seeded RNG
- `game/src/audio.js` — synthesized WebAudio sound effects, no files
- `game/src/hud.js` — HUD, kill feed, buy menu, overlays
- `game/src/input.js` — keyboard, mouse and pointer lock
- `main.ts` — hands the game in: copies `game/` and `screenshots/` to
  `/output` and writes `dossier.json` with the vendored make.fun library

## License

MIT — see `LICENSE`.
