# PROJECT_STATUS.md

> Read-only audit of the **sector-runner** repo against the PRD. Every status is backed by the
> source file(s) I read. Status vocabulary: **DONE** (implemented + wired) · **PARTIAL** (exists but
> incomplete/stubbed) · **NOT STARTED** · **CUT** (intentionally removed).
> Generated 2026-06-25. Static reading only — no runtime verification.

---

## 1. Executive summary

Run with no flag, Sector Runner is a **single-level 2D platformer with excellent movement and a clean
arcade-contract shell, but no game loop around it**. `main.ts` renders a static menu (no autorun); pressing
START/Enter loads **Sector 1** — a ~64×16-tile autotiled Nature level with coins, a key, a lever-driven lift
to a diamond, wood/floating one-way platforms, a cave overhang, pits (falling respawns you), a checkpoint
flag, and an exit door that flashes "SECTOR COMPLETE" and reloads the same level
([src/core/Game.ts](src/core/Game.ts), [src/levels/sector1.ts](src/levels/sector1.ts)). The movement system is
the finished crown jewel — run accel/decel/turn, variable-height jump, coyote time, jump buffer, apex hang,
fast-fall and air control are all implemented ([src/game/Player.ts](src/game/Player.ts),
[src/game/movementConfig.ts](src/game/movementConfig.ts)). **The single biggest gap is that the core arcade
loop never closes:** there is no scoring, no damage/lose condition, and the `ARCADE_SCORE` seam
([src/platform/score.ts](src/platform/score.ts)) is **never called**, so a run can be played but never
produces a result the host can read. Hazards, enemies, the boss, audio, the HUD, the game-over screen, and
localStorage saving are all unbuilt.

---

## 2. PRD audit table

| Area | Requirement | Status | Evidence (files) | Gap / next action |
|---|---|---|---|---|
| **Contract §3** | No html/body CSS; all scoped to `#game-root` | **DONE** | [src/style.css](src/style.css) (only `#game-root…` rules), [index.html](index.html) (no html/body styles) | — |
| Contract §3 | Relative asset paths via BASE_URL | **DONE** | [src/core/assets.ts](src/core/assets.ts) `assetUrl()`; [vite.config.ts](vite.config.ts) `base:'./'` | — |
| Contract §3 | Input scoped to focus, not window-global | **DONE** | [src/core/Input.ts](src/core/Input.ts) (listeners on container, focus-gated, `Set<string>`) | — |
| Contract §3 | Lifecycle `start/destroy/pause/resume/setVolume/getState` | **DONE** | [src/core/Game.ts](src/core/Game.ts) `init/start/pause/resume/destroy/setVolume/getVolume/getState` | `setVolume` only stores a float (no audio bus yet) |
| Contract §3 | `ARCADE_SCORE` postMessage on run end | **PARTIAL** | [src/platform/score.ts](src/platform/score.ts) `dispatchScore()` exists; grep shows **no caller** | Wire it to the (not-yet-built) end-of-run tally |
| Contract §3 | Clean static `dist/` | **DONE** | `vite build` green (37 modules) | — |
| Contract §3 | 480×270 landscape, DPR-aware FIT scaling | **DONE** | [src/core/Canvas.ts](src/core/Canvas.ts) (design 480×270, DPR buffer, ResizeObserver, nearest-neighbor) | — |
| **Movement §4** | Run accel/decel/turn; variable jump; coyote; buffer; apex; fast-fall; air control | **DONE** | [src/game/Player.ts](src/game/Player.ts), [src/game/movementConfig.ts](src/game/movementConfig.ts) (full knob set + logic) | Values still flagged "tune for feel" |
| Movement §4 | Movement test room behind a debug flag | **PARTIAL** | [src/levels/test_room.json](src/levels/test_room.json) has the room + editor notes, but **no loader references it**; the only flag `?debug=autotiler` mounts a *terrain* scene ([src/world/testScene.ts](src/world/testScene.ts)) | Orphaned data — either wire a JSON loader behind a flag or delete it |
| Movement §4 | Input mapping | **DONE** | [src/core/Input.ts](src/core/Input.ts) (`GAME_KEYS`: arrows+WASD+Space+P+Esc+Enter+debug) | — |
| **World/Sectors §5** | 3 sectors (Nature / Cavern / Core) | **PARTIAL** | Sector 1 only ([src/levels/sector1.ts](src/levels/sector1.ts)); Sectors 2 & 3 **NOT STARTED** | Build Sector 2/3 once the loop closes |
| World §5 | Level architecture support | **DONE** | [src/world/autotiler.ts](src/world/autotiler.ts), [src/world/tilemapRenderer.ts](src/world/tilemapRenderer.ts), [src/world/structures.ts](src/world/structures.ts), paint grid + occupancy mask in [sector1.ts](src/levels/sector1.ts) | Reusable; no JSON-entity level loader (Sector 1 is code-authored) |
| World §5 | Per-sector content (collectibles, key-doors, checkpoints) | **PARTIAL** | Sector 1 has coins/diamond/key/checkpoint/lever-lift/exit ([Game.ts:491-572](src/core/Game.ts)) | Sector-1 uses only the *exit* door kind; key→locked-door path is coded but unused here |
| **Interactable §6** | One primitive w/ lever/button skins | **DONE** | [src/game/Interactable.ts](src/game/Interactable.ts) (modes oneshot/toggle/momentary; lever/button/chain skin ids; registry propagation) | Only the toggle-lever is placed in Sector 1 |
| Door §6 | Door types (key + interactable) | **PARTIAL** | [src/game/Door.ts](src/game/Door.ts) implements locked/timed/permanent/exit; key-unlock in [Game.ts:396-411](src/core/Game.ts) | Locked/timed/permanent built but **only `exit` is instantiated** in Sector 1 |
| Platform §6 | Moving / falling / one-way | **PARTIAL** | [src/game/Platform.ts](src/game/Platform.ts) (`MovingPlatform`, `FallingPlatform`, `CloudPlatform`=one-way) | Sector 1 uses moving+cloud; **`FallingPlatform` is never instantiated** |
| Checkpoint §6 | Checkpoints | **DONE** | [src/game/Checkpoint.ts](src/game/Checkpoint.ts); activate + respawn in [Game.ts:354-359](src/core/Game.ts) | In-memory only |
| **Hazards §7** | Damage model + hazards dealing damage | **NOT STARTED** | spike is only a dictionary id ([tileMeta.json](src/data/tileMeta.json) id 68); legacy hazard layer is all-zero ([test.json](src/levels/test.json)); no health/lives/damage anywhere | Build a damage/lives model first |
| **Enemies §8** | Stomp; Patrol Drone; Hover Drone | **NOT STARTED** | grep: no enemy/drone/patrol/stomp in `src/` | — |
| **Boss §9** | AI Core Guardian arena + attacks | **NOT STARTED** | grep: no boss code | — |
| **Scoring §10** | Sources, multiplier, par times, tally | **NOT STARTED** | only `dispatchScore` seam exists; `snapshot.score` stays 0 ([Game.ts:151](src/core/Game.ts)); coins counted to a dev readout only ([Game.ts:344-352](src/core/Game.ts)) | Define score sources + tally, then call the seam |
| **Save §11** | In-memory checkpoint; localStorage `sr_`; death/respawn | **PARTIAL** | In-memory checkpoint + pit-fall respawn DONE ([Game.ts:375-380](src/core/Game.ts), [Player.respawn](src/game/Player.ts)); **localStorage / `sr_` NOT STARTED** (grep: none); death-by-damage NOT STARTED | Add `sr_`-prefixed save once there's progress worth persisting |
| **Camera §12** | Follow camera | **DONE** | [src/engine/Camera.ts](src/engine/Camera.ts) (smoothed follow + lookahead + screen shake + `snapTo`) | — |
| **Audio §13** | Audio architecture + SFX | **NOT STARTED** | no AudioContext (only a comment), `setVolume/getVolume` store a float ([Game.ts:229-236](src/core/Game.ts)) | Build audio bus last per build order |
| **UI §14** | HUD | **PARTIAL** | dev numeric readout only ([Game.ts:762-786](src/core/Game.ts)) | Real HUD (score/coins/lives) not started |
| UI §14 | Main menu, no autorun | **DONE** | [src/main.ts](src/main.ts) (`init()` renders menu, loop starts only on START), [Game.renderMenu](src/core/Game.ts) | — |
| UI §14 | Pause screen | **DONE** | [Game.pause/renderPaused](src/core/Game.ts) | — |
| UI §14 | Game-over screen | **NOT STARTED** | no lose condition → no game-over state ([GameState](src/core/Game.ts) is MENU/PLAYING/PAUSED only) | Needs the damage/lose model first |
| **Asset pipeline** | Dictionary, meta, edges, autotiler, renderer, macros, bg+fg passes | **DONE** | [TILE_DICTIONARY.md](TILE_DICTIONARY.md), [tileMeta.json](src/data/tileMeta.json), [tileEdges.json](src/data/tileEdges.json), [autotiler.ts](src/world/autotiler.ts), [tilemapRenderer.ts](src/world/tilemapRenderer.ts), [LooseTileSet.ts](src/engine/LooseTileSet.ts), [structures.ts](src/world/structures.ts), [Background.ts](src/engine/Background.ts), foreground pass ([Game.ts:731-738](src/core/Game.ts)) | Mature & working; `tree()` macro **CUT** (canopy tiles carry their own outlines) |

---

## 3. What works vs what's stubbed

**(a) Confirmed working (implemented + wired into the running game)**
- Arcade-contract shell: scoped CSS, BASE_URL assets, focus-scoped input, full lifecycle, 480×270 DPR FIT, static build.
- Fixed-timestep loop with interpolated render ([Game.tick](src/core/Game.ts)).
- Movement system (the full feel set) + AABB grid collision ([Player.ts](src/game/Player.ts), [collision.ts](src/engine/collision.ts)).
- Camera follow + lookahead + screen shake.
- Sector 1: autotiled terrain, occupancy-mask collision, coins/diamond/key pickups, checkpoint, lever→lift, one-way wood + floating platforms, exit door + "SECTOR COMPLETE" reload.
- Particle bursts on pickups/checkpoint/door ([ParticlePool.ts](src/engine/ParticlePool.ts)).
- Asset pipeline: autotiler, loose-tile renderer, structure macros (door/flag/waterColumn/cloud), parallax background, foreground depth pass.
- Menu + pause screens; pit-fall respawn with deterministic platform/door/switch reset.

**(b) Present but stub/placeholder/unwired**
- `dispatchScore()` — correct seam, **never called**.
- `setVolume/getVolume` — store a float; **no audio**.
- HUD — **dev readout only** (grounded/vx/vy/coyote/buffer/collected…), not a player HUD.
- `FallingPlatform`, locked/timed/permanent `Door`, button/momentary/oneshot `Interactable` — classes exist but **not instantiated** in Sector 1.
- [test_room.json](src/levels/test_room.json) / [test.json](src/levels/test.json) — rich entity data with a hazard layer, but **no loader wires them** (orphaned; hazard layer is all-zero).
- `snapshot` progress (`score/sector/completion`) — surfaced via `getState()` but never updated past zero.

---

## 4. Terrain capability (our strength, now that trees are cut)

From the dictionary + autotiler + macros, what we can build **well right now without trees**:

| Capability | Renderable (art) | Interactive (wired to gameplay) |
|---|---|---|
| Grass/sand/ice surfaces + dirt fill, autotiled edges | ✅ [autotiler.ts](src/world/autotiler.ts) | ✅ solid via occupancy mask |
| Cave/overhang/cliff depth (forced-dirt 'D') | ✅ ([sector1.ts](src/levels/sector1.ts) overhang) | ✅ solid |
| Multilayer depth (parallax bg band + faster fg clumps) | ✅ [Background.ts](src/engine/Background.ts), fg pass | ❌ visual only (no collision) |
| Water surfaces + waterfalls | ✅ `waterColumn()` macro | ❌ decorative only (no swim/current) |
| One-way platforms (wood, floating tiles) | ✅ | ✅ [CloudPlatform](src/game/Platform.ts) |
| Moving / lift platforms | ✅ | ✅ [MovingPlatform](src/game/Platform.ts) |
| Falling platforms | ✅ | ⚠️ class exists, not placed |
| Doors (exit / key-locked / timed / permanent) | ✅ [Door.ts](src/game/Door.ts) | ⚠️ only `exit` placed |
| Levers / buttons / chains (one primitive) | ✅ [Interactable.ts](src/game/Interactable.ts) | ⚠️ only toggle-lever placed |
| Signs, ground accessories (tufts, pine, mushrooms), clouds | ✅ macros + simple decor | ❌ decorative |
| Flag (checkpoint visual) | ✅ `flag()` macro | ✅ paired with Checkpoint trigger |
| Mushroom platforms, ladders, pulleys | ✅ tiles in dictionary | ❌ **not wired** (no climb/pulley logic) |

Bottom line: terrain rendering and the core "structures" are strong; the **gap is breadth of *wired* interactables** (falling platforms, the other door/switch kinds, ladders, pulleys) rather than art.

---

## 5. Recommended resume order — **PROPOSAL (for human approval)**

The PRD pillar is the *smallest polished, contract-compliant* slice. The audit shows movement + one level +
the shell are done, but the **core arcade loop never closes**. Close that first, then add the minimum that
makes one sector a real game, before any breadth.

1. **Close the loop: score + win/lose + `ARCADE_SCORE`.** *(small)* — Add a score (coins/diamond/time), fire
   `dispatchScore()` on exit-door completion, and show an end-of-run tally. Why first: it's the contract's
   reason to exist and it's mostly wiring an existing seam.
2. **Damage / lives / game-over.** *(medium)* — A lives counter, a death state, respawn-at-checkpoint, and a
   game-over screen that also fires the score. Why next: it's the "lose" half of the loop and unblocks hazards,
   enemies, and the boss (they all need a damage model).
3. **One real hazard (spikes) + pit death folded in.** *(small)* — First consumer of the damage model; makes
   Sector 1 a genuine challenge. Why: smallest content that proves §2 end-to-end.
4. **Real HUD.** *(small)* — Score, coins, lives, held-key, replacing the dev readout. Why: a run needs to be
   legible before it's worth scoring.
5. **Finish Sector 1's authored content using already-built systems.** *(small–medium)* — Place a
   `FallingPlatform`, a key→locked-door gate, and a button/timed-door, all of which already exist as classes.
   Why: maximizes the slice with near-zero new code.
6. **Persistence: `sr_` localStorage (best score / settings).** *(small)* — Why: cheap polish that satisfies §11.
7. **Audio bus + placeholder SFX + `setVolume` wired.** *(medium)* — Why: per build order, last polish before breadth.
8. **Only then breadth:** Sector 2 (Cavern) and 3 (Core), the two drones, and the boss. *(large)* — Why last:
   none of it matters until the single-sector loop is complete and polished.

A **complete vertical slice = steps 1–4** (menu → play → win/lose → ARCADE_SCORE with a HUD). Steps 5–7 polish
that one sector; step 8 is breadth.

---

## 6. Open decisions for the human

- **Scoring model:** keep the PRD's efficiency / no-death multiplier + par times, or ship a simple
  coins-plus-time score for the slice and add multipliers later?
- **Sector 2 identity:** the PRD/CLAUDE.md renamed the old "Industrial" sector — confirm **Cavern** vs **Frost**
  so tile/biome work isn't redone.
- **Slice enemy count:** zero enemies in the first complete slice (hazards only), or one drone type?
- **Audio timing:** build the audio bus now (so SFX land with each feature) or keep it strictly last per the build order?
- **Orphaned JSON:** wire [test_room.json](src/levels/test_room.json) back behind a movement-test flag, or delete
  it (and [test.json](src/levels/test.json)) since Sector 1 is code-authored?
- **Falling/locked/timed systems:** place them in Sector 1 now (they're built) or hold them for Sector 2?
