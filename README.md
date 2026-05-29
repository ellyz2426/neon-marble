# Neon Marble VR

A holodeck-themed VR marble maze puzzle game built with [IWSDK](https://iwsdk.dev) 0.4.1.

Tilt the holographic game board to roll a glowing marble through neon labyrinths. Collect gems, avoid pit traps, use teleporters, slide across ice, and hit boost pads to reach the goal.

## Play

**Live:** [https://ellyz2426.github.io/neon-marble/](https://ellyz2426.github.io/neon-marble/)

## Features

- **12 handcrafted maze levels** with progressive difficulty
- **4 game modes:** Campaign (3 lives), Time Attack (race the par), Zen (no pressure), Daily Challenge (seeded daily)
- **Physics-based marble** rolling with tilt controls and wall collision
- **6 tile types:** Walls, holes (traps), gems (collectibles), teleporters, ice zones (low friction), boost pads
- **5 board themes:** Neon Holodeck, Crimson Grid, Toxic Neon, Ultra Violet, Solar Blaze
- **20 achievements** with localStorage persistence
- **Leaderboard** (top 20 scores)
- **13 PanelUI spatial UI templates**, zero HTML DOM overlays
- **Dual-runtime:** Full VR (Meta Quest) + browser-first with keyboard controls
- **Procedural Web Audio:** 12+ SFX (bounce, roll, gem collect, fall, teleport, boost, countdown, goal fanfare, achievement) + ambient drone with LFO
- **Holodeck environment:** Neon grid floor/ceiling, 14 wireframe decorations, 40 ambient particles, fog, accent lights

## Controls

### Browser
| Key | Action |
|-----|--------|
| WASD / Arrow Keys | Tilt the board |
| ESC | Pause |

### VR (Meta Quest)
| Input | Action |
|-------|--------|
| Left Thumbstick | Tilt the board |
| B Button | Pause |
| Laser Pointer | Click UI buttons |

## Tile Types

| Tile | Color | Effect |
|------|-------|--------|
| Wall | Theme-colored | Blocks marble, bounces |
| Hole | Red ring | Fall in = lose a life |
| Gem | Yellow octahedron | +200 points |
| Goal | Green ring | Complete the level |
| Teleporter A | Magenta ring | Warps to Teleporter B |
| Teleporter B | Purple ring | Warps to Teleporter A |
| Ice | Blue translucent | Reduced friction |
| Boost Pad | Green with arrow | Speed boost forward |

## Game Modes

- **Campaign:** 12 levels, 3 lives, score tracking, best times
- **Time Attack:** Same levels, race against par time
- **Zen Mode:** No timer, no lives, just explore and relax
- **Daily Challenge:** Date-seeded random level, new puzzle every day

## Tech Stack

- IWSDK 0.4.1 (Immersive Web SDK)
- Three.js via super-three
- PanelUI spatial UI (@pmndrs/uikit + @iwsdk/vite-plugin-uikitml)
- Vite 7
- Web Audio API (procedural synthesis)
- TypeScript

## Project Structure

```
src/
  index.ts      — Main entry, game loop, state machine, UI binding
  types.ts      — Types, constants, 12 level definitions, achievements, state manager
  board.ts      — Board geometry, maze rendering, collision detection
  audio.ts      — Procedural Web Audio manager (12+ SFX + ambient music)
  effects.ts    — Particle system, marble trail, ambient particles, holodeck decorations
ui/
  title.uikitml       — Title screen
  modeselect.uikitml  — Mode selection (Campaign/Time Attack/Zen/Daily)
  levelselect.uikitml — Level selection grid (12 levels)
  hud.uikitml         — In-game HUD (time, gems, lives, score) — Follower head-locked
  pause.uikitml       — Pause menu
  levelcomplete.uikitml — Level completion with stats
  gameover.uikitml    — Game over screen
  leaderboard.uikitml — Top 10 scores
  achievements.uikitml — 20 achievement slots
  settings.uikitml    — Volume controls, theme selector
  help.uikitml        — Controls and gameplay guide
  toast.uikitml       — Toast notifications — Follower head-locked
  countdown.uikitml   — 3-2-1-GO countdown — Follower head-locked
```

## Stats

- **5 source files**, 2,114 lines
- **13 PanelUI templates**, 936 lines
- **3,050 total lines**
- **20 achievements**
- **12 levels**
- **5 themes**
- **Zero HTML DOM UI**

## Build

```bash
npm install
npm run build
```

## License

MIT
