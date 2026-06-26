import { Canvas } from './Canvas';
import { Input } from './Input';
import { FIXED_STEP, TILE } from './constants';
import { loadImageBitmap } from './assets';
import { SpriteSheet } from '../engine/SpriteSheet';
import { LooseTileSet } from '../engine/LooseTileSet';
import type { TileSource } from '../engine/TileSource';
import { Tilemap, type TilemapData } from '../engine/Tilemap';
import { Camera } from '../engine/Camera';
import { Background } from '../engine/Background';
import { EntityManager } from '../engine/EntityManager';
import { ParticlePool, type RGB } from '../engine/ParticlePool';
import { drawAtlas } from '../engine/DebugAtlas';
import { Player, START_LIVES, DAMAGE_SMALL, DAMAGE_FULL } from '../game/Player';
import { Collectible } from '../game/Collectible';
import { Checkpoint } from '../game/Checkpoint';
import {
  Platform,
  MovingPlatform,
  CloudPlatform,
  FallingPlatform,
  MOVING_ART,
  FALLING_ART,
  type PlatformArt,
} from '../game/Platform';
import { Door, DOOR_CLOSED_TILE } from '../game/Door';
import { Key } from '../game/Key';
import { Spike } from '../game/Hazard';
import {
  PatrolDrone,
  STOMP_MIN_FALL_VY,
  STOMP_BOUNCE_VY,
  STOMP_TOP_BAND,
  ENEMY_KINDS,
  HEAVY_DRONE,
} from '../game/enemies/PatrolDrone';
import { drawHud, drawControlLegend, drawInteractHint } from '../game/Hud';
import { Interactable, LEVER_TILE, BUTTON_TILE } from '../game/Interactable';
import { animatedTileId, animationFramesFor } from '../engine/TileAnimator';
import { computeScore, COIN_POINTS, DIAMOND_POINTS, type RunResult } from '../game/score';
import { dispatchScore } from '../platform/score';
import { loadBestScore, saveBestScore } from '../platform/storage';
import type { Activatable, Solid } from '../game/types';
import { DEFAULT_MOVEMENT } from '../game/movementConfig';
import { autotile, PAINT } from '../world/autotiler';
import { TileRenderer } from '../world/tilemapRenderer';
import type { Placement } from '../world/structures';
import { COIN_ID, DIAMOND_ID, KEY_ID } from '../levels/sector1';
import { LEVELS, resolveLevelKey, nextLevelKey, DEFAULT_LEVEL, type LevelKey } from '../levels';
import type { Cell, LevelDef, OneWayArt } from '../levels/types';

/** One-way platform skins (dictionary §4.16 wood, §4.17 floating tiles). */
const WOOD_ART: PlatformArt = { left: 47, center: 48, right: 50, surfaceInset: 0 };
const FLOAT_ART_PLAIN: PlatformArt = { left: 146, center: 146, right: 146, surfaceInset: 0 };
const FLOAT_ART_DIRT: PlatformArt = { left: 147, center: 147, right: 147, surfaceInset: 0 };

/** Map a level's one-way platform skin tag to its concrete L/C/R art. */
const ONE_WAY_ART: Record<OneWayArt, PlatformArt> = {
  wood: WOOD_ART,
  floatPlain: FLOAT_ART_PLAIN,
  floatDirt: FLOAT_ART_DIRT,
};

/**
 * Decorative foreground depth pass. Land masses scroll slightly FASTER than the
 * camera (reads as closer) and are nudged down so they hug the bottom edge.
 * Purely visual — no collision. Tune or remove the render block to toggle it.
 */
const FOREGROUND_PARALLAX = 1.15;
const FOREGROUND_Y_OFFSET = 8;

const COLLECT_COLOR: RGB = { r: 90, g: 230, b: 255 }; // cyan
const CHECKPOINT_COLOR: RGB = { r: 110, g: 240, b: 130 }; // green
const KEY_COLOR: RGB = { r: 245, g: 215, b: 90 }; // gold
const DRONE_COLOR: RGB = { r: 255, g: 90, b: 90 }; // red (matches the drone sprite)

/**
 * Screen-space layout for the persisted best-score readout. Positions are in the
 * 480×270 buffer's coordinates; the COMPLETE/GAME_OVER values sit just under each
 * screen's score line, the MENU value under the title.
 */
const BEST_MENU_Y = 270 / 2 + 18;
const BEST_COMPLETE_Y = 196; // under the COMPLETE "SCORE" line (y=176)
const BEST_GAMEOVER_Y = 270 / 2 + 26; // under the GAME OVER "SCORE" line
const NEW_BEST_DY = 16; // gap from the BEST line to the "NEW BEST!" flourish
const BEST_COLOR = '#ffd86b'; // gold, distinct from the green SCORE
const NEW_BEST_COLOR = '#9effa0';

/** AABB overlap test for contact pickups. */
function overlaps(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * High-level lifecycle states. TRANSITION is the brief seam between a cleared
 * non-final sector and the next one loading: the loop is stopped and run-state is
 * carried, but the run has NOT ended (no score fired). It is deliberately NOT the
 * COMPLETE tally screen, which is reserved for the final sector's run-end.
 */
export type GameState = 'MENU' | 'PLAYING' | 'PAUSED' | 'TRANSITION' | 'COMPLETE' | 'GAME_OVER';

/** How a run ended: cleared the sector, or ran out of lives. */
export type RunOutcome = 'complete' | 'gameover';

/** Serializable snapshot handed to the host / save system. */
export interface GameSnapshot {
  score: number;
  sector: number;
  completion: number;
}

/**
 * Discrete control keys handled as edge events (one action per press) rather
 * than polled held-state. Kept separate from continuous input so they work even
 * while the rAF loop is stopped (e.g. resuming from pause).
 */
const CONTROL_KEYS: ReadonlySet<string> = new Set([
  'KeyP',
  'Escape',
  'Enter',
]);

/**
 * The game shell: owns the canvas, input, state machine and the rAF loop.
 *
 * Lifecycle contract:
 *   init()    -> static MENU, NO loop, NO audio, NO rAF.
 *   start()   -> begins the loop, state PLAYING, focuses container. Re-startable.
 *   pause()   -> stops the loop (idempotent).
 *   resume()  -> restarts the loop from PAUSED.
 *   destroy() -> tears everything down with zero residual side effects.
 */
export class Game {
  private container: HTMLElement | null = null;
  private canvas: Canvas | null = null;
  private input: Input | null = null;
  private startButton: HTMLButtonElement | null = null;

  private state: GameState = 'MENU';
  private rafId: number | null = null;
  private lastTime = 0;
  private accumulator = 0;

  // Active scene (null until loadTestScene resolves; nulled by unloadScene).
  private tileSheet: SpriteSheet | null = null;
  private characterTiles: TileSource | null = null;
  // Terrain + decor render through the paint-grid autotiler (loose tiles).
  private terrain: TileRenderer | null = null;
  private terrainGrid: number[][] = [];
  private foregroundGrid: number[][] = [];
  private decor: readonly Placement[] = [];
  private skyDecor: readonly Placement[] = [];
  private backgroundTiles: TileSource | null = null;
  private background: Background | null = null;
  private tilemap: Tilemap | null = null;
  private camera: Camera | null = null;
  private player: Player | null = null;
  private entities: EntityManager | null = null;
  private particles: ParticlePool | null = null;
  private collectibles: Collectible[] = [];
  private platforms: Platform[] = [];
  private doors: Door[] = [];
  private interactables: Interactable[] = [];
  private keys: Key[] = [];
  private spikes: Spike[] = [];
  private drones: PatrolDrone[] = [];
  private checkpoint: Checkpoint | null = null;
  // The keyhole block cell for this scene (heavy-enemy spawn point), and a guard
  // so the key spawns it exactly once per scene.
  private keyholeCell: Cell | null = null;
  private keySpawned = false;
  private collectedCount = 0;
  private prevKeyK = false;

  // Run scoring: the diamond is tracked apart from coins; elapsed time runs from
  // scene load to the exit door. `completed` guards a single score dispatch, and
  // `result` holds the final tally for the COMPLETE tally screen.
  private diamond: Collectible | null = null;
  private coinCount = 0;
  private diamondCount = 0;
  // Run-level points from enemy stomps; carried across sectors like coinCount and
  // folded into every score computation (live HUD, end tally, ARCADE_SCORE).
  private killPoints = 0;
  private elapsedSeconds = 0;
  private completed = false;
  private result: RunResult | null = null;
  // Which sector is loaded (drives the score snapshot + ARCADE_SCORE envelope).
  private currentSector = 1;
  // The registry key of the loaded sector, used to resolve `next` on exit.
  private currentLevelKey: LevelKey = DEFAULT_LEVEL;
  // RUN-LEVEL lives carried ACROSS sectors. A fresh run resets this to
  // START_LIVES (see loadScene's fresh-run branch); a sector transition captures
  // the live Player.lives into it so the next scene's Player inherits it. During
  // play the authoritative count is Player.lives — this is the carry slot.
  private runLives = START_LIVES;
  // Persisted best across runs (read once on init); `newBest` flags whether the
  // run that just ended beat it, driving the end-screen "NEW BEST!" flourish.
  private bestScore = 0;
  private newBest = false;

  private volume = 1;
  private snapshot: GameSnapshot = { score: 0, sector: 0, completion: 0 };

  // Bound handlers so add/removeEventListener match exactly.
  private readonly onControlKey: (e: KeyboardEvent) => void;
  private readonly onStartClick: () => void;
  private readonly loop: (time: number) => void;

  constructor() {
    this.onControlKey = (e) => this.handleControlKey(e);
    this.onStartClick = () => this.start();
    this.loop = (time) => this.tick(time);
  }

  /**
   * Wire up canvas + input and render the static MENU. Does NOT start the loop
   * and creates no AudioContext.
   */
  init(container: HTMLElement): void {
    this.container = container;

    // Read the persisted best ONCE at init so the menu (and later end screens)
    // always have a target without touching storage on any per-frame path.
    this.bestScore = loadBestScore();

    this.canvas = new Canvas(container);
    this.canvas.observe();

    this.input = new Input(container);
    this.input.attach();

    container.addEventListener('keydown', this.onControlKey);

    this.startButton = this.createStartButton();
    container.appendChild(this.startButton);

    this.state = 'MENU';
    this.renderMenu();
  }

  /**
   * Enter PLAYING: load the test scene, then run the loop. Re-startable. If the
   * player bails to MENU while the scene is still loading, the freshly built
   * scene is discarded instead of starting a loop over a stale state.
   */
  async start(): Promise<void> {
    if (!this.container) return;
    this.state = 'PLAYING';
    this.hideStartButton();
    this.container.focus();
    this.renderLoading();

    // Fresh run from the menu: carry = false resets all run-state (score/coins/
    // time/lives) to defaults. This is the unambiguous "clean slate" boundary.
    await this.loadScene(resolveLevelKey(window.location.search), false);
    if (this.state !== 'PLAYING') return;

    this.startLoop();
  }

  /** Stop the loop. Idempotent. */
  pause(): void {
    if (this.state !== 'PLAYING') return;
    this.state = 'PAUSED';
    this.stopLoop();
    this.renderPaused();
  }

  /** Resume the loop from PAUSED. */
  resume(): void {
    if (this.state !== 'PAUSED') return;
    this.state = 'PLAYING';
    this.startLoop();
  }

  /** Return to the static MENU: stop the loop and show the menu again. */
  private goToMenu(): void {
    this.state = 'MENU';
    this.stopLoop();
    this.unloadScene();
    this.snapshot = { score: 0, sector: 0, completion: 0 };
    this.showStartButton();
    this.renderMenu();
  }

  /** Clamp and store the master volume (no audio wired yet). */
  setVolume(level: number): void {
    this.volume = Math.min(1, Math.max(0, level));
  }

  /** Current volume, clamped 0..1. */
  getVolume(): number {
    return this.volume;
  }

  /** Serializable progress snapshot. */
  getState(): GameSnapshot {
    return { ...this.snapshot };
  }

  /** Tear everything down. Leaves zero listeners, no rAF, empty container. */
  destroy(): void {
    this.stopLoop();
    this.unloadScene();

    if (this.container) {
      this.container.removeEventListener('keydown', this.onControlKey);
    }
    if (this.startButton) {
      this.startButton.removeEventListener('click', this.onStartClick);
    }
    this.input?.detach();
    this.canvas?.destroy();

    if (this.container) {
      this.container.replaceChildren();
    }

    this.container = null;
    this.canvas = null;
    this.input = null;
    this.startButton = null;
    this.rafId = null;
  }

  // --- loop -------------------------------------------------------------

  private startLoop(): void {
    if (this.rafId !== null) return;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this.loop);
  }

  private stopLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /**
   * Fixed-timestep accumulator loop: simulate in whole FIXED_STEP slices, render
   * once with the leftover fraction as the interpolation alpha. dt is clamped so
   * a long stall (tab backgrounded) can't trigger a runaway catch-up.
   */
  private tick(time: number): void {
    const dt = Math.min((time - this.lastTime) / 1000, 0.05);
    this.lastTime = time;
    this.accumulator += dt;

    while (this.accumulator >= FIXED_STEP) {
      this.update(FIXED_STEP);
      this.accumulator -= FIXED_STEP;
    }

    this.render(this.accumulator / FIXED_STEP);

    // Only keep the loop alive while playing. An exit-door completion flips the
    // state to COMPLETE mid-tick and stops the loop; this prevents a stray
    // reschedule from restarting it.
    if (this.state === 'PLAYING') {
      this.rafId = requestAnimationFrame(this.loop);
    }
  }

  private update(dt: number): void {
    if (this.state !== 'PLAYING') return;
    if (!this.player || !this.tilemap || !this.camera || !this.entities || !this.particles) return;

    // Run timer: counts from scene load until the exit door completes the sector.
    this.elapsedSeconds += dt;

    const player = this.player;
    // Platforms move first so their per-step deltas are known when the player
    // rides and resolves against them.
    for (const p of this.platforms) p.update(dt);

    // Interact press = Down/S held (grounded, so it never fights fast-fall).
    const interactHeld = (this.input?.isDown('ArrowDown') ?? false) || (this.input?.isDown('KeyS') ?? false);

    // The player resolves against platforms AND closed doors (open/exit doors
    // report isSolid()=false, so passing them all is harmless).
    const solids: Solid[] = [...this.platforms, ...this.doors];
    player.update(dt, solids);

    // Switches read the player + interact key; doors tick their close timers.
    for (const it of this.interactables) it.update(dt, player, interactHeld);
    for (const d of this.doors) {
      d.update(dt);
      // An exit door ends the sector (run-end OR transition); bail out of the
      // rest of this step immediately so we never touch a scene that onExit may
      // have torn down (mirrors the damage paths' `return`).
      if (this.handleDoorContact(d, player)) return;
    }

    this.entities.update(dt); // bobs collectibles + keys

    // Dev toggle: K flips screen-shake on/off (edge-triggered, in-memory only).
    const kDown = this.input?.isDown('KeyK') ?? false;
    if (kDown && !this.prevKeyK) this.camera.shakeEnabled = !this.camera.shakeEnabled;
    this.prevKeyK = kDown;

    // Contact-collect: overlap the player box, flag, remove, burst cyan.
    for (const c of this.collectibles) {
      if (c.collected) continue;
      if (overlaps(player, c)) {
        c.collected = true;
        this.entities.remove(c);
        this.particles.spawnBurst(c.x + c.w / 2, c.y + c.h / 2, COLLECT_COLOR, 12);
        this.collectedCount++;
        if (c === this.diamond) this.diamondCount++;
        else this.coinCount++;
      }
    }

    // Checkpoint: activate on first touch, burst green, adopt as respawn.
    const cp = this.checkpoint;
    if (cp && !cp.active && overlaps(player, cp)) {
      cp.activate(player);
      this.particles.spawnBurst(cp.x + cp.w / 2, cp.y + cp.h / 2, CHECKPOINT_COLOR, 16);
    }

    // Key pickup: grab one held key (replaces any existing), burst gold, despawn.
    for (const k of this.keys) {
      if (k.collected) continue;
      if (overlaps(player, k)) {
        k.collected = true;
        this.entities.remove(k);
        this.particles.spawnBurst(k.x + k.w / 2, k.y + k.h / 2, KEY_COLOR, 12);
        player.heldKey = true;
      }
    }

    // Keyhole block: the key no longer opens doors — carrying it to the keyhole
    // CONSUMES it and SPAWNS the heavy enemy from the (previously decorative) block.
    // Guarded to fire once per scene; the spawned enemy joins the normal patrol/
    // stomp/reset path (so a respawn revives it) and is cleared on scene unload.
    const kh = this.keyholeCell;
    if (kh && player.heldKey && !this.keySpawned && this.characterTiles) {
      const block = { x: kh.col * TILE, y: kh.row * TILE, w: TILE, h: TILE };
      if (overlaps(player, block)) {
        this.keySpawned = true;
        player.heldKey = false;
        // Feet rest on the row below the keyhole block (the walking surface).
        const heavy = new PatrolDrone(this.characterTiles, this.tilemap, kh.col, kh.row + 1, -1, HEAVY_DRONE);
        this.entities.add(heavy);
        this.drones.push(heavy);
        this.particles.spawnBurst(block.x + TILE / 2, block.y + TILE / 2, DRONE_COLOR, 18);
        // It spawns onto the player (who is touching the block) — grant the blink
        // window so the spawn isn't an instant hit (a stomp is still allowed).
        player.grantInvulnerability();
      }
    }

    // Spike traps: damage TRIGGERS, never solid. Skip entirely while invulnerable
    // so the player passes harmlessly during the post-hit blink; otherwise the
    // first overlap deals one point and (if non-fatal) respawns at checkpoint via
    // the exact same path as a pit-fall. A fatal hit ends the run.
    if (!player.invulnerable) {
      for (const s of this.spikes) {
        if (!overlaps(player, s)) continue;
        if (player.takeDamage(DAMAGE_SMALL, 'spike')) {
          this.endRun('gameover');
          return;
        }
        this.respawnPlayer();
        break;
      }
    }

    // Patrol drones: resolve contact by direction. A STOMP (falling fast enough
    // with the player's feet still in the drone's top band) kills the drone and
    // bounces the player — allowed even mid-blink. ANY other contact routes
    // through the exact spike damage path (i-frames there gate it), so it's
    // skipped while invulnerable. A fatal hit ends the run; a survivable one
    // respawns at the checkpoint (which also resets the drones).
    for (const drone of this.drones) {
      if (!drone.alive) continue;
      if (!overlaps(player, drone)) continue;

      const feetY = player.y + player.h;
      const stomp = player.vy > STOMP_MIN_FALL_VY && feetY <= drone.y + STOMP_TOP_BAND;
      if (stomp) {
        drone.kill();
        this.particles.spawnBurst(drone.x + drone.w / 2, drone.y + drone.h / 2, DRONE_COLOR, 14);
        player.bounce(STOMP_BOUNCE_VY);
        // Kill points flow through the same score the HUD/end-tally/ARCADE_SCORE read.
        this.killPoints += drone.kind.killPoints;
        continue;
      }

      if (!player.invulnerable) {
        if (player.takeDamage(drone.kind.contactDamage, 'drone')) {
          this.endRun('gameover');
          return;
        }
        this.respawnPlayer();
        break;
      }
    }

    // Fell into a bottomless pit -> route through the damage model. A fatal fall
    // ends the run (game over); otherwise snap back to the respawn point (and
    // reset every deterministic actor), keeping the i-frames takeDamage just
    // granted. A fall during i-frames is ignored for life-loss but still respawns
    // (no free death-spiral). The held key is NOT cleared (only a door consumes it).
    if (player.y > this.tilemap.pixelHeight) {
      if (player.takeDamage(DAMAGE_FULL, 'pit')) {
        this.endRun('gameover');
        return;
      }
      this.respawnPlayer();
    }

    // Hard landing this frame -> a small screen shake.
    if (player.landingImpact) this.camera.shake(3, 10);

    this.camera.follow(player, this.tilemap, dt);
    this.camera.update(dt);
    this.particles.update(dt);
  }

  /**
   * Snap the player back to its current respawn point and reset every
   * deterministic actor (platforms / doors / switches) to its authored default,
   * so a retry plays identically. Shared by pit-falls and spike hits.
   */
  private respawnPlayer(): void {
    if (!this.player) return;
    this.player.respawn();
    for (const p of this.platforms) p.reset();
    for (const d of this.doors) d.reset();
    for (const it of this.interactables) it.resetOnCheckpoint();
    for (const dr of this.drones) dr.reset();
  }

  /**
   * Per-door contact the door can't do on its own: the exit door fires the
   * sector-complete trigger on touch. Vault doors are NO LONGER key-opened — the
   * lever is their sole opener (via setActive through the activatable registry),
   * so the key consumes nothing here. A 2px pad lets a player standing flush
   * against the door still register the touch. Returns true ONLY when an exit door
   * was reached, so the caller stops processing the rest of the step.
   */
  private handleDoorContact(door: Door, player: Player): boolean {
    const pad = 2;
    const near =
      player.x < door.x + door.w + pad &&
      player.x + player.w > door.x - pad &&
      player.y < door.y + door.h + pad &&
      player.y + player.h > door.y - pad;
    if (!near) return false;

    if (door.kind === 'exit') {
      this.onExit();
      return true;
    }
    return false;
  }

  /**
   * Player reached the exit door. THE run-end-vs-transition fork:
   *  - If this sector has a `next`: it's a SECTOR TRANSITION — do NOT call endRun,
   *    do NOT fire dispatchScore. Carry run-state forward and load the next sector.
   *  - If there's no `next` (final sector): close the run via the single endRun
   *    seam exactly as before (fires score once, COMPLETE tally).
   * This is the only place the once-per-run invariant could be broken, so the
   * non-final branch must never reach endRun/dispatchScore.
   */
  private onExit(): void {
    const next = nextLevelKey(this.currentLevelKey);
    if (next) {
      void this.beginSectorTransition(next);
    } else {
      this.endRun('complete');
    }
  }

  /**
   * Non-final sector cleared: carry run-state (score/coins/diamonds/time already
   * accumulate on Game; lives is captured here) into the next sector and load it.
   * Deliberately NOT a run-end — dispatchScore is never called on this path, so
   * the once-per-run invariant holds. State flips to TRANSITION synchronously so
   * the in-flight tick neither reschedules the loop nor touches the torn-down
   * scene; the next sector loads with carry = true (run-state preserved). The
   * post-await guard mirrors start(): if anything flipped us out of TRANSITION
   * during the load, don't go live.
   */
  private async beginSectorTransition(next: LevelKey): Promise<void> {
    // Snapshot the live lives count into the run-level carry slot.
    this.runLives = this.player?.lives ?? this.runLives;

    this.state = 'TRANSITION';
    this.stopLoop();
    this.unloadScene(); // release the cleared sector's entities/bitmaps/timers
    this.renderLoading();

    await this.loadScene(next, true); // carry = true: keep score/coins/time/lives
    if (this.state !== 'TRANSITION') return; // bailed to MENU mid-load

    this.state = 'PLAYING';
    this.startLoop();
  }

  /**
   * The single run-end seam for BOTH outcomes. Computes the score (a clean clear
   * keeps the time bonus; a game-over keeps only the pickup score), fires the
   * ARCADE_SCORE seam exactly once, reflects it in the snapshot, then transitions
   * to the matching end screen and stops the loop. The `completed` guard makes
   * any later call (a second exit touch, a fatal hit on the same frame) a no-op,
   * so dispatchScore() can never double-fire or miss-fire.
   */
  private endRun(outcome: RunOutcome): void {
    if (this.completed) return;
    this.completed = true;

    const includeTimeBonus = outcome === 'complete';
    const result = computeScore(
      this.coinCount,
      this.diamondCount,
      this.elapsedSeconds,
      includeTimeBonus,
      this.killPoints,
    );
    this.result = result;

    // Persist the best score (both outcomes): if this run beat the stored best,
    // save it and flag `newBest` so the end screen can celebrate. Storage failures
    // are swallowed in the helper, so this never threatens the run-end seam.
    this.newBest = result.score > this.bestScore;
    if (this.newBest) {
      this.bestScore = result.score;
      saveBestScore(this.bestScore);
    }

    this.snapshot = {
      score: result.score,
      sector: this.currentSector,
      completion: outcome === 'complete' ? 1 : 0,
    };

    dispatchScore(result.score, {
      outcome,
      coins: result.coins,
      diamonds: result.diamonds,
      killPoints: result.killPoints,
      timeSeconds: Math.floor(result.elapsedSeconds),
      timeBonus: result.timeBonus,
      sector: this.currentSector,
    });

    this.stopLoop();
    if (outcome === 'complete') {
      this.state = 'COMPLETE';
      this.renderComplete();
    } else {
      this.state = 'GAME_OVER';
      this.renderGameOver();
    }
  }

  private render(alpha: number): void {
    if (this.state === 'PLAYING') {
      if (this.tilemap) this.renderScene(alpha);
      else this.renderLoading();
    }
  }

  // --- scene management -------------------------------------------------

  /**
   * Load a level by registry key (see src/levels). Terrain is authored as a paint
   * grid run through the autotiler (render) + a derived occupancy mask (collision,
   * every non-air paint cell is solid); the object arrays map onto the existing
   * pickup / platform / door / switch systems. Built into locals so a mid-load
   * Esc->MENU can discard everything (and close every bitmap) cleanly without ever
   * assigning a half-built scene. No per-sector code lives here — adding a level is
   * adding it to LEVELS.
   *
   * `carry` is THE run-state boundary: false (a fresh run from the menu) resets
   * score/coins/diamonds/time and lives to defaults; true (a sector transition)
   * preserves them so the HUD hearts/score continue uninterrupted across sectors.
   */
  private async loadScene(key: LevelKey, carry: boolean): Promise<void> {
    const level: LevelDef = LEVELS[key];

    // Fresh run: wipe all RUN-LEVEL state to defaults BEFORE the new Player is
    // built (so runLives is correct when applied below). A transition skips this
    // entirely, carrying the accumulated totals + lives forward.
    if (!carry) {
      this.runLives = START_LIVES;
      this.coinCount = 0;
      this.diamondCount = 0;
      this.killPoints = 0;
      this.elapsedSeconds = 0;
      this.collectedCount = 0;
    }

    // Packed terrain sheet backs the gameplay ENTITIES (gems, key, lever, doors,
    // platforms — their ids already match the loose filenames). Characters load
    // as loose tiles. Terrain + decor render through the loose TileRenderer.
    const [tilesBitmap, characterTiles, backgroundTiles] = await Promise.all([
      loadImageBitmap('assets/kenney/base/Tilemap/tilemap_packed.png'),
      // 0-7 back the per-sector player skins; 15-23 are the enemy walk/defeated
      // frames (small 15/16/17, large 18/19/20, heavy 21/22/23 — all placeholders).
      LooseTileSet.load(
        'assets/kenney/base/Tiles/Characters',
        [0, 1, 2, 3, 4, 5, 6, 7, 15, 16, 17, 18, 19, 20, 21, 22, 23],
      ),
      LooseTileSet.load(
        'assets/kenney/base/Tiles/Backgrounds',
        Array.from({ length: 24 }, (_, i) => i),
      ),
    ]);
    const tileSheet = new SpriteSheet(tilesBitmap, { tileSize: TILE });
    // Per-level backdrop theme (Sector 1 teal sky, Sector 2 earthy cave).
    const background = new Background(level.theme, backgroundTiles);

    // Terrain: paint grid -> render id grid (autotiler) + 0/1 occupancy mask
    // (collision). The Tilemap is built from the mask and used ONLY for collision
    // and level dimensions; terrain pixels come from the autotiled grid below.
    const terrainGrid = autotile([...level.paint]);
    const foregroundGrid = autotile([...level.foregroundPaint]);
    const occupancy = level.paint.map((line) => [...line].map((ch) => (ch === PAINT.AIR ? 0 : 1)));
    const tilemapData: TilemapData = {
      width: level.width,
      height: level.height,
      tileSize: TILE,
      family: 'grass',
      layers: [{ name: 'terrain', collision: true, data: occupancy }],
    };
    const tilemap = new Tilemap(tilemapData, { tiles: tileSheet });

    // Load every loose tile the terrain grid, foreground grid + decor reference.
    const terrain = new TileRenderer();
    // Expand each decor id to every animation frame it can show (flag cloth,
    // water/waterfall pairs, …) so the loose renderer has all frames preloaded.
    const decorIds = [...level.decor, ...level.skyDecor].flatMap((d) => [
      ...animationFramesFor(d.id),
    ]);
    await terrain.load([...terrainGrid.flat(), ...foregroundGrid.flat(), ...decorIds]);

    const player = new Player(
      DEFAULT_MOVEMENT,
      level.spawn.x,
      level.spawn.y,
      characterTiles,
      tilemap,
      this.input!,
      level.playerSkin,
    );
    // Apply the run-level lives carry: START_LIVES on a fresh run, or the count
    // carried from the previous sector on a transition.
    player.lives = this.runLives;
    const camera = new Camera();
    camera.snapTo(player, tilemap);

    // --- object layer -> existing entity systems (all draw via tileSheet) ---
    const entities = new EntityManager();
    const collectibles: Collectible[] = [];
    for (const c of level.coins) {
      const coin = new Collectible(tileSheet, c.col * TILE, c.row * TILE, COIN_ID);
      entities.add(coin);
      collectibles.push(coin);
    }
    // The diamond is tracked apart from coins for scoring; a level may omit it.
    let diamond: Collectible | null = null;
    if (level.diamond) {
      diamond = new Collectible(tileSheet, level.diamond.col * TILE, level.diamond.row * TILE, DIAMOND_ID);
      entities.add(diamond);
      collectibles.push(diamond);
    }

    // Key pickup (optional): grabbing it sets player.heldKey, opening locked doors.
    const keys: Key[] = [];
    if (level.key) {
      const keyPickup = new Key(tileSheet, level.key.col * TILE, level.key.row * TILE, KEY_ID);
      entities.add(keyPickup);
      keys.push(keyPickup);
    }

    // Spikes: static damage TRIGGERS (NOT solid). Rendered via the EntityManager
    // like other pickups; overlap is checked in update() against takeDamage().
    const spikes: Spike[] = [];
    for (const s of level.spikes) {
      const spike = new Spike(tileSheet, s.col * TILE, s.row * TILE);
      entities.add(spike);
      spikes.push(spike);
    }

    // Patrol drones: ground enemies that render/update via the EntityManager
    // like other entities; contact (stomp vs side-hit) is resolved in update().
    // They hold the tilemap for their own wall/ledge turn tests.
    const drones: PatrolDrone[] = [];
    for (const d of level.drones) {
      const drone = new PatrolDrone(characterTiles, tilemap, d.col, d.row, d.dir, ENEMY_KINDS[d.kind ?? 'small']);
      entities.add(drone);
      drones.push(drone);
    }

    // Checkpoint stays a gameplay trigger (respawn), but is NOT added to the
    // rendered entities — its visual is the flag() structure in the decor layer.
    const checkpoint = new Checkpoint(
      tileSheet,
      level.checkpoint.col * TILE,
      level.checkpoint.row * TILE,
    );

    const platforms: Platform[] = [];
    // One-way platforms (top-only collision): wood bridges + floating tiles.
    for (const w of level.oneWayPlatforms) {
      platforms.push(
        new CloudPlatform(tileSheet, ONE_WAY_ART[w.art], w.col * TILE, w.row * TILE, w.wTiles * TILE),
      );
    }
    // Switch-controlled vertical lifts: rest low until their switch toggles them.
    const registry = new Map<string, Activatable>();
    for (const m of level.movingPlatforms) {
      const lift = new MovingPlatform(
        tileSheet,
        MOVING_ART,
        m.col * TILE,
        m.lowRow * TILE,
        m.col * TILE,
        m.highRow * TILE,
        m.wTiles * TILE,
        m.speed,
        true,
        m.id,
      );
      platforms.push(lift);
      registry.set(lift.id, lift);
    }
    // Falling platforms: timing commitments that drop once stood on.
    // `tilemap.pixelHeight` is the y past which they count as gone.
    for (const f of level.fallingPlatforms) {
      platforms.push(
        new FallingPlatform(
          tileSheet,
          FALLING_ART,
          f.col * TILE,
          f.row * TILE,
          f.wTiles * TILE,
          tilemap.pixelHeight,
        ),
      );
    }

    // Doors: the exit (never solid; touching it completes the sector) + any vault
    // doors. Vault doors are now 'permanent' (closed solids opened by a LEVER via
    // the activatable registry — the key no longer opens them), so each registers
    // under its id alongside the moving platforms for the switch to drive.
    const doors: Door[] = [
      new Door(
        tileSheet,
        DOOR_CLOSED_TILE,
        'exit',
        'exit',
        level.exit.col * TILE,
        level.exit.row * TILE,
        level.exit.hTiles,
      ),
    ];
    for (const ld of level.lockedDoors) {
      const vault = new Door(
        tileSheet,
        DOOR_CLOSED_TILE,
        ld.id,
        'permanent',
        ld.col * TILE,
        ld.row * TILE,
        ld.hTiles,
      );
      doors.push(vault);
      registry.set(vault.id, vault);
    }

    // Switches -> their targets, via the activatable registry (lever/button skin).
    const interactables: Interactable[] = [];
    for (const sw of level.switches) {
      const skin = sw.kind === 'lever' ? LEVER_TILE : BUTTON_TILE;
      interactables.push(
        new Interactable(
          tileSheet,
          skin,
          sw.col * TILE,
          sw.row * TILE,
          sw.mode,
          sw.holdTime,
          sw.effect ?? 'movePlatform',
          [sw.targetId],
          registry,
        ),
      );
    }

    const particles = new ParticlePool();

    // Commit only if we're still loading for play. PLAYING is a fresh run/start;
    // TRANSITION is a sector handoff. Any other state (Esc->MENU mid-load) discards
    // the freshly built scene and closes its bitmaps instead of going live.
    if (this.state !== 'PLAYING' && this.state !== 'TRANSITION') {
      tileSheet.dispose();
      characterTiles.dispose();
      backgroundTiles.dispose();
      terrain.dispose();
      return;
    }

    this.tileSheet = tileSheet;
    this.characterTiles = characterTiles;
    this.backgroundTiles = backgroundTiles;
    this.background = background;
    this.terrain = terrain;
    this.terrainGrid = terrainGrid;
    this.foregroundGrid = foregroundGrid;
    this.decor = level.decor;
    this.skyDecor = level.skyDecor;
    this.tilemap = tilemap;
    this.player = player;
    this.camera = camera;
    this.entities = entities;
    this.particles = particles;
    this.collectibles = collectibles;
    this.platforms = platforms;
    this.doors = doors;
    this.interactables = interactables;
    this.keys = keys;
    this.spikes = spikes;
    this.drones = drones;
    this.checkpoint = checkpoint;
    this.keyholeCell = level.keyhole;
    this.keySpawned = false;
    this.diamond = diamond;
    this.currentSector = level.sector;
    this.currentLevelKey = key;
    // Per-scene state (always reset, independent of run-state carry): the
    // single-fire guard, the tally, and the input edge latch. Run-level counters
    // (coins/diamonds/time/lives) were handled by the `carry` branch above.
    this.completed = false;
    this.result = null;
    this.prevKeyK = false;
    this.snapshot = { score: 0, sector: level.sector, completion: 0 };
  }

  /** Close every ImageBitmap across all tile sources; drop all refs. */
  private unloadScene(): void {
    this.player?.destroy();
    this.entities?.clear();
    this.particles?.clear();
    this.tileSheet?.dispose();
    this.characterTiles?.dispose();
    this.backgroundTiles?.dispose();
    this.terrain?.dispose();
    this.player = null;
    this.camera = null;
    this.tilemap = null;
    this.background = null;
    this.backgroundTiles = null;
    this.terrain = null;
    this.terrainGrid = [];
    this.foregroundGrid = [];
    this.decor = [];
    this.skyDecor = [];
    this.entities = null;
    this.particles = null;
    this.collectibles = [];
    this.platforms = [];
    this.doors = [];
    this.interactables = [];
    this.keys = [];
    this.spikes = [];
    this.drones = [];
    this.checkpoint = null;
    this.keyholeCell = null;
    this.keySpawned = false;
    this.diamond = null;
    // NOTE: run-level counters (coinCount/diamondCount/elapsedSeconds/
    // collectedCount/runLives) are deliberately NOT cleared here — a sector
    // transition unloads the old scene but must carry these forward. They are
    // reset only on a fresh run (loadScene's `carry === false` branch). Only
    // per-scene flags are cleared.
    this.completed = false;
    this.result = null;
    this.prevKeyK = false;
    this.tileSheet = null;
    this.characterTiles = null;
    this.accumulator = 0;
  }

  // --- control keys -----------------------------------------------------

  private handleControlKey(e: KeyboardEvent): void {
    if (!this.isFocused()) return;
    if (!CONTROL_KEYS.has(e.code)) return;
    e.preventDefault();

    switch (this.state) {
      case 'MENU':
        if (e.code === 'Enter') this.start();
        break;
      case 'PLAYING':
        if (e.code === 'KeyP') this.pause();
        else if (e.code === 'Escape') this.goToMenu();
        break;
      case 'PAUSED':
        if (e.code === 'KeyP') this.resume();
        else if (e.code === 'Escape') this.goToMenu();
        break;
      case 'COMPLETE':
      case 'GAME_OVER':
        if (e.code === 'Enter' || e.code === 'Escape') this.goToMenu();
        break;
    }
  }

  private isFocused(): boolean {
    const active = document.activeElement;
    return active === this.container || !!this.container?.contains(active);
  }

  // --- rendering (placeholder visuals only) -----------------------------

  private renderMenu(): void {
    const ctx = this.canvas?.ctx;
    if (!ctx || !this.canvas) return;
    const { width, height } = this.canvas;

    ctx.fillStyle = '#10131c';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#e8eefc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '28px monospace';
    ctx.fillText('SECTOR RUNNER', width / 2, height / 2 - 16);

    // Always show a target so there's something to beat.
    ctx.fillStyle = BEST_COLOR;
    ctx.font = '10px monospace';
    ctx.fillText(`BEST: ${this.bestScore}`, width / 2, BEST_MENU_Y);
  }

  /** Draw the live scene: clear, tilemap, player, then debug overlays. */
  private renderScene(alpha: number): void {
    const ctx = this.canvas?.ctx;
    if (!ctx || !this.canvas || !this.tilemap || !this.camera) return;
    const { width, height } = this.canvas;
    const cam = this.camera;

    ctx.fillStyle = '#10131c';
    ctx.fillRect(0, 0, width, height);

    // Original soft cloud / tree-line parallax band. Tracks the true (unshaken)
    // camera x; drawn first, no collision.
    this.background?.render(ctx, cam.x);

    // Screen shake offsets WORLD rendering only; HUD/debug stay still.
    const { ox, oy } = cam.renderOffset();
    const rx = cam.x + ox;
    const ry = cam.y + oy;
    // Terrain + decor draw through the autotiler's loose TileRenderer: sky decor
    // (clouds) behind the terrain grid, foreground decor (trees/signs/etc.) over.
    if (this.terrain) {
      // Paired decor tiles (flag cloth 111/112, the water/waterfall pairs) loop
      // through the shared animator; non-paired ids pass straight through.
      const t = this.elapsedSeconds;
      for (const d of this.skyDecor) {
        this.terrain.drawTile(ctx, animatedTileId(d.id, t), d.col * TILE - rx, d.row * TILE - ry, 1);
      }
      this.terrain.drawTileGrid(ctx, this.terrainGrid, -rx, -ry, 1);
      for (const d of this.decor) {
        this.terrain.drawTile(ctx, animatedTileId(d.id, t), d.col * TILE - rx, d.row * TILE - ry, 1);
      }
    }
    // Platforms/doors/switches render with the world but live outside the
    // EntityManager (so they update exactly once, in the right order). All sit
    // behind the player sprite.
    for (const p of this.platforms) p.render(ctx, alpha, rx, ry);
    // The exit door's VISUAL is the door() structure in the decor layer; render
    // only the other (none today) doors so it isn't drawn as a flat slab twice.
    for (const d of this.doors) if (d.kind !== 'exit') d.render(ctx, alpha, rx, ry);
    this.entities?.render(ctx, alpha, rx, ry); // keys, collectibles
    for (const it of this.interactables) it.render(ctx, alpha, rx, ry);
    this.player?.render(ctx, alpha, rx, ry);
    this.particles?.render(ctx, rx, ry);

    // Decorative foreground depth: land masses that scroll faster than the camera
    // and hug the bottom edge, occluding the player for "cut earth" depth. Purely
    // visual; remove this block to toggle it off without touching gameplay.
    if (this.terrain) {
      const fx = cam.x * FOREGROUND_PARALLAX + ox;
      const fy = cam.y + oy - FOREGROUND_Y_OFFSET;
      this.terrain.drawTileGrid(ctx, this.foregroundGrid, -fx, -fy, 1);
    }

    // Atlas overlays for level authoring: G=terrain, H=characters.
    if (this.input?.isDown('KeyG') && this.tileSheet) {
      drawAtlas(ctx, this.tileSheet);
    } else if (this.input?.isDown('KeyH') && this.characterTiles) {
      drawAtlas(ctx, this.characterTiles);
    }

    // Real player HUD (screen-space, pinned top). Hearts/coins/score draw from
    // the packed tile sheet via live reads. The old dev readout is now opt-in,
    // held behind KeyB for movement tuning.
    this.drawHud(ctx);
    drawControlLegend(ctx);
    drawInteractHint(ctx, this.currentInteractPrompt());
    if (this.input?.isDown('KeyB')) this.drawDebugReadout(ctx);
  }

  /**
   * The interact verb to prompt right now: the first in-range, still-actionable
   * interactable's verb (e.g. "activate platform" for the bridge button), or null
   * when none is in range. Reuses the interactable's own range check.
   */
  private currentInteractPrompt(): string | null {
    if (!this.player) return null;
    for (const it of this.interactables) {
      if (it.wantsPrompt(this.player)) return it.promptVerb;
    }
    return null;
  }

  /** Compose the live HUD state and draw it in screen-space. */
  private drawHud(ctx: CanvasRenderingContext2D): void {
    if (!this.player || !this.tileSheet || !this.canvas) return;
    // Live pickup score (coins+diamond, no time bonus): updates as collected,
    // reusing the scoring module rather than holding a separate field.
    const score = computeScore(
      this.coinCount,
      this.diamondCount,
      this.elapsedSeconds,
      false,
      this.killPoints,
    ).score;
    drawHud(ctx, this.tileSheet, this.canvas.width, {
      lives: this.player.lives,
      maxLives: START_LIVES,
      score,
      coins: this.coinCount,
    });
  }

  /**
   * Shared end-screen best-score line: "BEST: <n>" in screen-space, plus a
   * "NEW BEST!" flourish underneath when this run beat the stored best. Used by
   * both the COMPLETE and GAME_OVER screens so they stay in sync.
   */
  private drawBestLine(ctx: CanvasRenderingContext2D, width: number, y: number): void {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = BEST_COLOR;
    ctx.font = '11px monospace';
    ctx.fillText(`BEST: ${this.bestScore}`, width / 2, y);

    if (this.newBest) {
      ctx.fillStyle = NEW_BEST_COLOR;
      ctx.font = '10px monospace';
      ctx.fillText('NEW BEST!', width / 2, y + NEW_BEST_DY);
    }
  }

  /**
   * End-of-run tally: the dimmed final frame stays on the canvas (the loop is
   * stopped) with the coin / diamond / time / total breakdown over it. Drawn
   * once on completion; Enter returns to the menu.
   */
  private renderComplete(): void {
    const ctx = this.canvas?.ctx;
    if (!ctx || !this.canvas) return;
    const { width, height } = this.canvas;
    const r = this.result;

    ctx.fillStyle = 'rgba(8,14,24,0.82)';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#e8eefc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = '20px monospace';
    ctx.fillText('SECTOR COMPLETE', width / 2, 56);

    if (r) {
      ctx.font = '10px monospace';
      const rows = [
        `COINS    ${r.coins} x ${COIN_POINTS}`,
        `DIAMOND  ${r.diamonds} x ${DIAMOND_POINTS}`,
        `ENEMIES  +${r.killPoints}`,
        `TIME     ${Math.floor(r.elapsedSeconds)}s  (+${r.timeBonus})`,
      ];
      for (let i = 0; i < rows.length; i++) {
        ctx.fillText(rows[i], width / 2, 104 + i * 16);
      }
      ctx.font = '16px monospace';
      ctx.fillStyle = '#9effa0';
      ctx.fillText(`SCORE  ${r.score}`, width / 2, 176);
    }

    this.drawBestLine(ctx, width, BEST_COMPLETE_Y);

    ctx.fillStyle = '#9aa6c4';
    ctx.font = '9px monospace';
    ctx.fillText('press ENTER to replay', width / 2, height - 22);
  }

  /**
   * Game-over screen: drawn once when the run ends out of lives (the loop is
   * stopped). Shows the final pickup-only score; Enter returns to the menu.
   */
  private renderGameOver(): void {
    const ctx = this.canvas?.ctx;
    if (!ctx || !this.canvas) return;
    const { width, height } = this.canvas;

    ctx.fillStyle = 'rgba(24,8,10,0.85)';
    ctx.fillRect(0, 0, width, height);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = '#ff7a7a';
    ctx.font = '24px monospace';
    ctx.fillText('GAME OVER', width / 2, height / 2 - 28);

    ctx.fillStyle = '#e8eefc';
    ctx.font = '14px monospace';
    ctx.fillText(`SCORE  ${this.result?.score ?? 0}`, width / 2, height / 2 + 6);

    this.drawBestLine(ctx, width, BEST_GAMEOVER_Y);

    ctx.fillStyle = '#9aa6c4';
    ctx.font = '9px monospace';
    ctx.fillText('press ENTER to return to menu', width / 2, height - 22);
  }

  /** Tiny top-left numeric readout so coyote/buffer feel is verifiable. */
  private drawDebugReadout(ctx: CanvasRenderingContext2D): void {
    const p = this.player;
    if (!p) return;

    ctx.font = '7px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const lines = [
      `grounded:${p.grounded ? 1 : 0}`,
      `vx:${p.vx.toFixed(1)}`,
      `vy:${p.vy.toFixed(1)}`,
      `coyote:${p.coyoteTimer}`,
      `buffer:${p.jumpBufferTimer}`,
      `lives:${p.lives}${p.invulnerable ? '*' : ''}`,
      `collected:${this.collectedCount}`,
      `key:${p.heldKey ? 1 : 0}`,
      `shake:${this.camera?.shakeEnabled ? 1 : 0}`,
    ];
    for (let i = 0; i < lines.length; i++) {
      const y = 3 + i * 9;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(2, y, 78, 8);
      ctx.fillStyle = '#9effa0';
      ctx.fillText(lines[i], 3, y + 1);
    }
  }

  /** Shown for the brief moment between start() and the scene finishing load. */
  private renderLoading(): void {
    const ctx = this.canvas?.ctx;
    if (!ctx || !this.canvas) return;
    const { width, height } = this.canvas;

    ctx.fillStyle = '#10131c';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#e8eefc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '12px monospace';
    ctx.fillText('LOADING…', width / 2, height / 2);
  }

  private renderPaused(): void {
    const ctx = this.canvas?.ctx;
    if (!ctx || !this.canvas) return;
    const { width, height } = this.canvas;

    ctx.fillStyle = '#142a1f';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#e8eefc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '16px monospace';
    ctx.fillText('PAUSED — press P to resume', width / 2, height / 2);
  }

  // --- dev START button -------------------------------------------------

  private createStartButton(): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'start-button';
    button.type = 'button';
    button.textContent = 'START';
    button.addEventListener('click', this.onStartClick);
    return button;
  }

  private hideStartButton(): void {
    if (this.startButton) this.startButton.style.display = 'none';
  }

  private showStartButton(): void {
    if (this.startButton) this.startButton.style.display = '';
  }
}
