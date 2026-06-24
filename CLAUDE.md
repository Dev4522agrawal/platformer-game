# CLAUDE.md

## Project

**Sector Runner** — a 2D pixel-art action platformer, built with:

- **Vanilla TypeScript** (strict)
- **HTML5 Canvas 2D**
- **Vite**

No framework. No game engine (no Phaser). No external runtime libraries.

Using **Kenney Pixel Platformer (Base)** + **Pixel Platformer Industrial Expansion** (CC0).

This game is **one tenant (~10% of effort) inside the Interactive Intelligence Arcade**, embedded
as an iframe at the sub-path `/sector-runner/`. The goal is the **smallest version that still
feels polished and portfolio-worthy** — strong movement, clean architecture, clean integration.
It is NOT a standalone commercial indie game.

---

## The Arcade Contract is non-negotiable

This is the one set of rules that overrides convenience. The previous arcade game shipped without
it and every integration was a retrofit. Every change must keep ALL of these true:

1. **Never poison the host.** Do not set `overflow`/`width`/`height` or any layout rule on `html`
   or `body`. Scope ALL CSS under a single `#game-root`. No global resets reaching outside it.
2. **Base-aware asset paths.** `base: './'` in `vite.config`. Resolve assets via
   `import.meta.env.BASE_URL` / the `assetUrl()` helper. Never hardcode an absolute path. Must
   work served from `/sector-runner/`, not just `/`.
3. **Input scoped to focus.** Key state in a `Set<string>`; listeners on `#game-root` (never
   `window`/`document`); process keys only while the container has focus; `preventDefault()` only
   the keys the game uses.
4. **Clean lifecycle.** `start()` begins the rAF loop only when called (NO autorun on load — the
   menu renders with no loop and no AudioContext). `destroy()` cancels the rAF loop, removes ALL
   listeners (incl. ResizeObserver), closes the AudioContext, closes ImageBitmaps, clears
   `#game-root`. Repeated init→start→destroy must not leak.
5. **Score-out envelope (fixed shape).** On run end:
   `window.parent.postMessage({ type:'ARCADE_SCORE', gameId:'sector-runner', score, meta }, '*')`.
   Keep one clean place where this fires.
6. **Static `dist/`.** `vite build` produces a self-contained static build. No server dependency.
7. **Landscape, fills container.** Fixed internal **480×270** (16:9) buffer, nearest-neighbor,
   FIT-scaled to `#game-root` (DPR-aware, ResizeObserver). No fixed pixel box.

Before finishing any change, self-check it against this list.

---

## How we work (two-actor model)

- The **architect** (separate chat) writes standalone, self-contained prompts. You (Claude Code)
  and the architect share no memory — each prompt carries its own context.
- **You do static checks ONLY.** "Done" means: `eslint` clean on touched files **and**
  `vite build` passes. That is the only claim you may make.
- **Never claim a feature "works" at runtime.** The human runs the dev server and verifies
  behavior. End every task by listing **what the human should visually verify**.

---

## Token Budget Rules

Token budget is limited and shared across multiple projects.

- Do **not** re-analyze the whole project, audit every file, or run full code reviews unless asked.
- Do **not** generate long explanations or rewrite working systems.
- Inspect only the files relevant to the requested change.
- Keep each change to **one coherent feature** — never bundle unrelated work.

---

## Preferred Response Format

At completion, provide only:

**Files Created**
- file.ts

**Files Modified**
- file.ts

**Features Completed**
- feature

**Verify Visually**
- what the human should check in `npm run dev`

**Remaining TODOs**
- todo

Keep reports concise. Static checks only — never assert runtime success.

---

## Coding Standards

- TypeScript only, strict mode, strong typing.
- Modular, composition over large monolithic classes; reusable systems; avoid duplication.
- Custom AABB physics on the tile grid; **fixed-timestep** logic at 60 steps/s, interpolated render.
- No new runtime dependencies. Avoid overengineering and premature abstraction.

---

## Architecture

Core shell (milestone 1):
- `src/core/Game.ts` — lifecycle + state machine + loop
- `src/core/Canvas.ts` — 480×270 buffer + FIT scaling + ResizeObserver + DPR
- `src/core/Input.ts` — focus-scoped `Set<string>` input
- `src/core/assets.ts` — `assetUrl()` helper
- `src/platform/score.ts` — `dispatchScore()` (the ARCADE_SCORE envelope)

Engine + gameplay systems (added in later milestones — extend these, don't redesign them):
- Fixed-timestep loop, tilemap JSON loader (layers: background/terrain/hazard/interactive),
  AABB grid collision, `EntityManager`, `SpriteSheet` / `SpriteAnimator`
- `Player` / movement system (the crown jewel — tune in the test room first)
- **One Interactable primitive** (mode / holdTime / effect / skin) powering doors, switches,
  chains, moving platforms
- Hazards (spikes, piston, falling platform, pits), enemies, boss, scoring, HUD, camera, audio,
  in-memory checkpoints + `sr_`-prefixed localStorage

New systems integrate into this structure. Reuse existing managers.

---

## Build Order (V1)

Build in this sequence; **movement is verified in the test room before any level content exists.**

1. Scaffold to the contract (done in milestone 1)
2. Core engine (loop, tilemap, collision, entities, sprite sheets)
3. Movement system + test room — STOP and verify feel
4. Camera + collectibles + particles
5. Interactable primitive + doors + platforms + checkpoints
6. Hazards + damage/lives/respawn
7. Enemies: Patrol Drone + Hover Drone
8. Sector 1 (Nature) + tutorial flow
9. Sector 2 (Industrial) + chain/lever skins
10. Boss (single arena, 3 attacks, numbered-tile HP) + Sector 5 approach
11. Scoring + HUD + end screens
12. Menus (robot select, pause, game over) + localStorage save
13. ARCADE_SCORE wire-up + contract verification + drop-in
14. Placeholder SFX + audio bus + setVolume
15. Polish/juice pass + final QA

Sectors play **1 → 2 → 5**.

---

## Scope Discipline — do NOT build these in V1

These were cut for scope and are V2+. Do not implement them, even if a level seems to want them:

- Sectors 3 (Agricultural) & 4 (Consumer)
- Water-routing system; item-sorting mini-game; conveyor platforms
- Sector-5 four-zone "corrupted variant" structure
- Security Bot & Corrupted Unit enemies
- Boss phases / enemy-spawning / water-surge / combined attacks
- Robot abilities, wall-slide/jump/dash, full music, mobile touch, online leaderboard,
  ghost replay, challenge/daily modes, procedural levels

If a request seems to need one of these, flag it rather than building it.

---

## Important

A working, polished, **contract-compliant** feature is worth more than a perfect abstraction.
When uncertain, choose the smaller, simpler solution. Do not spend tokens optimizing code that
already works.