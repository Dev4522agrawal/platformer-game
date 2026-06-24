import { Canvas } from './Canvas';
import { Input } from './Input';
import { FIXED_STEP, TILE } from './constants';
import { loadImageBitmap } from './assets';
import { SpriteSheet } from '../engine/SpriteSheet';
import { LooseTileSet } from '../engine/LooseTileSet';
import type { TileSource } from '../engine/TileSource';
import { Tilemap, type TilemapData } from '../engine/Tilemap';
import { Camera } from '../engine/Camera';
import { Background, THEMES } from '../engine/Background';
import { EntityManager } from '../engine/EntityManager';
import { ParticlePool, type RGB } from '../engine/ParticlePool';
import { drawAtlas } from '../engine/DebugAtlas';
import { Player } from '../game/Player';
import { Collectible } from '../game/Collectible';
import { Checkpoint } from '../game/Checkpoint';
import {
  Platform,
  MovingPlatform,
  FallingPlatform,
  CloudPlatform,
  MOVING_ART,
  FALLING_ART,
  CLOUD_ART,
} from '../game/Platform';
import { Door, DOOR_CLOSED_TILE, type DoorKind } from '../game/Door';
import { Key } from '../game/Key';
import {
  Interactable,
  LEVER_TILE,
  BUTTON_TILE,
  CHAIN_TILE,
  type InteractMode,
  type InteractEffect,
} from '../game/Interactable';
import type { Activatable, Solid } from '../game/types';
import { DEFAULT_MOVEMENT } from '../game/movementConfig';
import testRoom from '../levels/test_room.json';

/**
 * A spawn entry in a level's "entities" array. Platform/door/interactable
 * entries carry extra optional fields beyond the base tile position.
 */
interface LevelEntity {
  type: string;
  tx: number;
  ty: number;
  kind?: string;
  wTiles?: number;
  tx2?: number;
  ty2?: number;
  speed?: number;
  controlled?: boolean;
  id?: string;
  hTiles?: number;
  duration?: number;
  skin?: string;
  mode?: string;
  holdTime?: number;
  effect?: string;
  targets?: string[];
}

const COLLECT_COLOR: RGB = { r: 90, g: 230, b: 255 }; // cyan
const CHECKPOINT_COLOR: RGB = { r: 110, g: 240, b: 130 }; // green
const KEY_COLOR: RGB = { r: 245, g: 215, b: 90 }; // gold
const DOOR_COLOR: RGB = { r: 200, g: 160, b: 255 }; // violet

/** Switch skin string -> terrain tile id. */
const SKIN_TILES: Record<string, number> = {
  lever: LEVER_TILE,
  button: BUTTON_TILE,
  chain: CHAIN_TILE,
};

/** Seconds the "SECTOR COMPLETE" overlay shows before the scene reloads. */
const EXIT_RELOAD_DELAY = 1.5;

/** AABB overlap test for contact pickups. */
function overlaps(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** High-level lifecycle states. */
export type GameState = 'MENU' | 'PLAYING' | 'PAUSED';

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
  private checkpoint: Checkpoint | null = null;
  private collectedCount = 0;
  private prevKeyK = false;

  // Exit/sector-complete flow: overlay shown, then the scene reloads.
  private sectorComplete = false;
  private exitReloadTimer = 0;
  private reloading = false;

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

    await this.loadTestScene();
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

    this.rafId = requestAnimationFrame(this.loop);
  }

  private update(dt: number): void {
    if (this.state !== 'PLAYING') return;

    // Sector-complete: freeze the world, show the overlay, then reload.
    if (this.sectorComplete) {
      this.exitReloadTimer -= dt;
      if (this.exitReloadTimer <= 0) void this.reloadScene();
      return;
    }

    if (!this.player || !this.tilemap || !this.camera || !this.entities || !this.particles) return;

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
      this.handleDoorContact(d, player);
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

    // Fell into a bottomless pit -> snap back to the respawn point and reset all
    // platforms/doors/switches to their authored defaults (deterministic retry).
    // The held key is intentionally NOT cleared (only a door consumes it).
    if (player.y > this.tilemap.pixelHeight) {
      player.respawn();
      for (const p of this.platforms) p.reset();
      for (const d of this.doors) d.reset();
      for (const it of this.interactables) it.resetOnCheckpoint();
    }

    // Hard landing this frame -> a small screen shake.
    if (player.landingImpact) this.camera.shake(3, 10);

    this.camera.follow(player, this.tilemap, dt);
    this.camera.update(dt);
    this.particles.update(dt);
  }

  /**
   * Per-door contact effects the door can't do on its own: a locked door opens
   * (and consumes the key) when the player touches it carrying one; an exit door
   * fires the sector-complete trigger. A 2px pad lets a player standing flush
   * against a closed door still register the touch.
   */
  private handleDoorContact(door: Door, player: Player): void {
    const pad = 2;
    const near =
      player.x < door.x + door.w + pad &&
      player.x + player.w > door.x - pad &&
      player.y < door.y + door.h + pad &&
      player.y + player.h > door.y - pad;
    if (!near) return;

    if (door.kind === 'locked' && player.heldKey && door.unlock()) {
      player.heldKey = false;
      this.particles?.spawnBurst(door.x + door.w / 2, door.y + door.h / 2, DOOR_COLOR, 16);
    } else if (door.kind === 'exit') {
      this.onExit();
    }
  }

  /** Player reached the exit: show the overlay, then reload after a beat. */
  private onExit(): void {
    if (this.sectorComplete) return;
    this.sectorComplete = true;
    this.exitReloadTimer = EXIT_RELOAD_DELAY;
  }

  /** Tear down and rebuild the test scene (placeholder for real sector flow). */
  private async reloadScene(): Promise<void> {
    if (this.reloading) return;
    this.reloading = true;
    this.unloadScene();
    await this.loadTestScene();
    this.reloading = false;
  }

  private render(alpha: number): void {
    if (this.state === 'PLAYING') {
      if (this.tilemap) this.renderScene(alpha);
      else this.renderLoading();
    }
  }

  // --- scene management -------------------------------------------------

  /**
   * Load the movement test scene: tiles + characters sheets, the test-room
   * Tilemap, a follow Camera, and the Player spawned on the left flat ground.
   * Built into locals so a mid-load Esc->MENU can discard everything (and close
   * both bitmaps) cleanly without ever assigning a half-built scene.
   */
  private async loadTestScene(): Promise<void> {
    // Terrain stays on the packed sheet (its ids already match its filenames).
    // Characters + backgrounds load as loose tiles so id === tile_NNNN.png number.
    const [tilesBitmap, characterTiles, backgroundTiles] = await Promise.all([
      loadImageBitmap('assets/kenney/base/Tilemap/tilemap_packed.png'),
      LooseTileSet.load('assets/kenney/base/Tiles/Characters', [0, 1, 2, 3, 4, 5, 6, 7]),
      LooseTileSet.load(
        'assets/kenney/base/Tiles/Backgrounds',
        Array.from({ length: 24 }, (_, i) => i),
      ),
    ]);
    const tileSheet = new SpriteSheet(tilesBitmap, { tileSize: TILE });
    const tilemap = new Tilemap(testRoom as TilemapData, {
      tiles: tileSheet,
      backgrounds: backgroundTiles,
    });
    // Layered parallax backdrop (Sector 1 will pick its theme later). Shares the
    // backgrounds LooseTileSet; it draws, but owns no bitmaps to dispose.
    const background = new Background(THEMES.teal, backgroundTiles);

    // Spawn on the left flat-ground baseline (ground top row 13 -> feet at y=234).
    const spawnX = 3 * TILE;
    const spawnY = 13 * TILE - 16;
    const player = new Player(DEFAULT_MOVEMENT, spawnX, spawnY, characterTiles, tilemap, this.input!);
    const camera = new Camera();
    camera.snapTo(player, tilemap);

    // Spawn level-authored pickups/checkpoints. Gem + flag tiles live on the
    // terrain packed sheet, so collectibles/checkpoints draw through tileSheet.
    const entities = new EntityManager();
    const collectibles: Collectible[] = [];
    const platforms: Platform[] = [];
    const doors: Door[] = [];
    const keys: Key[] = [];
    let checkpoint: Checkpoint | null = null;
    // Interactables are spawned in a second pass, after the registry of all
    // Activatables (doors + controlled platforms) exists for them to target.
    const interactableSpecs: LevelEntity[] = [];
    const levelEntities = (testRoom as TilemapData & { entities?: LevelEntity[] }).entities ?? [];
    for (const e of levelEntities) {
      // Dev-only: flag an entity authored on top of solid terrain (e.g. a
      // platform overlapping the ground). Cheap sanity check, not a registry.
      if (import.meta.env.DEV && tilemap.isSolid(e.tx, e.ty)) {
        console.warn(
          `Level: ${e.type} anchor tile (${e.tx},${e.ty}) is inside solid terrain.`,
        );
      }
      if (e.type === 'collectible') {
        const c = new Collectible(tileSheet, e.tx * TILE, e.ty * TILE);
        entities.add(c);
        collectibles.push(c);
      } else if (e.type === 'checkpoint') {
        checkpoint = new Checkpoint(tileSheet, e.tx * TILE, e.ty * TILE);
        entities.add(checkpoint);
      } else if (e.type === 'platform') {
        const platform = this.makePlatform(e, tileSheet, tilemap.pixelHeight);
        if (platform) platforms.push(platform);
      } else if (e.type === 'door') {
        doors.push(this.makeDoor(e, tileSheet));
      } else if (e.type === 'key') {
        const k = new Key(tileSheet, e.tx * TILE, e.ty * TILE);
        entities.add(k);
        keys.push(k);
      } else if (e.type === 'interactable') {
        interactableSpecs.push(e);
      }
    }

    // Registry of everything a switch can drive: doors (by id) and controlled
    // platforms (by id). Then build the switches that target them.
    const registry = new Map<string, Activatable>();
    for (const d of doors) registry.set(d.id, d);
    for (const p of platforms) {
      if (p instanceof MovingPlatform && p.controlled) registry.set(p.id, p);
    }
    const interactables: Interactable[] = [];
    for (const e of interactableSpecs) {
      interactables.push(this.makeInteractable(e, tileSheet, registry));
    }

    const particles = new ParticlePool();

    if (this.state !== 'PLAYING') {
      tileSheet.dispose();
      characterTiles.dispose();
      backgroundTiles.dispose();
      return;
    }

    this.tileSheet = tileSheet;
    this.characterTiles = characterTiles;
    this.backgroundTiles = backgroundTiles;
    this.background = background;
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
    this.checkpoint = checkpoint;
    this.collectedCount = 0;
    this.prevKeyK = false;
    this.sectorComplete = false;
    this.exitReloadTimer = 0;
  }

  /**
   * Build a platform entity from a level "platform" entry. Platforms draw
   * through the terrain TileSource (their skins live on the packed sheet).
   * `fallLimit` is the world y below which a falling platform is gone.
   */
  private makePlatform(e: LevelEntity, source: TileSource, fallLimit: number): Platform | null {
    const x = e.tx * TILE;
    const y = e.ty * TILE;
    const wPx = (e.wTiles ?? 1) * TILE;
    switch (e.kind) {
      case 'moving': {
        const bx = (e.tx2 ?? e.tx) * TILE;
        const by = (e.ty2 ?? e.ty) * TILE;
        return new MovingPlatform(
          source,
          MOVING_ART,
          x,
          y,
          bx,
          by,
          wPx,
          e.speed ?? 60,
          e.controlled ?? false,
          e.id ?? '',
        );
      }
      case 'falling':
        return new FallingPlatform(source, FALLING_ART, x, y, wPx, fallLimit);
      case 'cloud':
        return new CloudPlatform(source, CLOUD_ART, x, y, wPx);
      default:
        return null;
    }
  }

  /** Build a door entity from a level "door" entry. */
  private makeDoor(e: LevelEntity, source: TileSource): Door {
    return new Door(
      source,
      DOOR_CLOSED_TILE,
      e.id ?? '',
      (e.kind as DoorKind) ?? 'permanent',
      e.tx * TILE,
      e.ty * TILE,
      e.hTiles ?? 2,
      e.duration ?? undefined,
    );
  }

  /** Build a switch (lever/button/chain) from a level "interactable" entry. */
  private makeInteractable(
    e: LevelEntity,
    source: TileSource,
    registry: Map<string, Activatable>,
  ): Interactable {
    const skin = SKIN_TILES[e.skin ?? 'lever'] ?? LEVER_TILE;
    return new Interactable(
      source,
      skin,
      e.tx * TILE,
      e.ty * TILE,
      (e.mode as InteractMode) ?? 'oneshot',
      e.holdTime ?? 0,
      (e.effect as InteractEffect) ?? 'openDoor',
      e.targets ?? [],
      registry,
    );
  }

  /** Close every ImageBitmap across all three tile sources; drop all refs. */
  private unloadScene(): void {
    this.player?.destroy();
    this.entities?.clear();
    this.particles?.clear();
    this.tileSheet?.dispose();
    this.characterTiles?.dispose();
    this.backgroundTiles?.dispose();
    this.player = null;
    this.camera = null;
    this.tilemap = null;
    this.background = null;
    this.entities = null;
    this.particles = null;
    this.collectibles = [];
    this.platforms = [];
    this.doors = [];
    this.interactables = [];
    this.keys = [];
    this.checkpoint = null;
    this.collectedCount = 0;
    this.prevKeyK = false;
    this.sectorComplete = false;
    this.exitReloadTimer = 0;
    this.tileSheet = null;
    this.characterTiles = null;
    this.backgroundTiles = null;
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
  }

  /** Draw the live scene: clear, tilemap, player, then debug overlays. */
  private renderScene(alpha: number): void {
    const ctx = this.canvas?.ctx;
    if (!ctx || !this.canvas || !this.tilemap || !this.camera) return;
    const { width, height } = this.canvas;
    const cam = this.camera;

    ctx.fillStyle = '#10131c';
    ctx.fillRect(0, 0, width, height);

    this.applyThemePreviewKeys();
    // Parallax backdrop tracks the true (unshaken) camera x.
    this.background?.render(ctx, cam.x);

    // Screen shake offsets WORLD rendering only; HUD/debug stay still.
    const { ox, oy } = cam.renderOffset();
    const rx = cam.x + ox;
    const ry = cam.y + oy;
    this.tilemap.render(ctx, rx, ry);
    // Platforms/doors/switches render with the world but live outside the
    // EntityManager (so they update exactly once, in the right order). All sit
    // behind the player sprite.
    for (const p of this.platforms) p.render(ctx, alpha, rx, ry);
    for (const d of this.doors) d.render(ctx, alpha, rx, ry);
    this.entities?.render(ctx, alpha, rx, ry); // keys, collectibles, checkpoint
    for (const it of this.interactables) it.render(ctx, alpha, rx, ry);
    this.player?.render(ctx, alpha, rx, ry);
    this.particles?.render(ctx, rx, ry);

    // Atlas overlays for level authoring: G=terrain, H=characters, B=backgrounds.
    if (this.input?.isDown('KeyG') && this.tileSheet) {
      drawAtlas(ctx, this.tileSheet);
    } else if (this.input?.isDown('KeyH') && this.characterTiles) {
      drawAtlas(ctx, this.characterTiles);
    } else if (this.input?.isDown('KeyB') && this.backgroundTiles) {
      drawAtlas(ctx, this.backgroundTiles);
    }

    this.drawDebugReadout(ctx);

    // Sector-complete banner (HUD space, drawn over everything).
    if (this.sectorComplete) {
      ctx.fillStyle = 'rgba(8,14,24,0.7)';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#e8eefc';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '20px monospace';
      ctx.fillText('SECTOR COMPLETE', width / 2, height / 2);
    }
  }

  /** Dev aid: number keys 1-3 swap the live background theme for comparison. */
  private applyThemePreviewKeys(): void {
    const bg = this.background;
    const input = this.input;
    if (!bg || !input) return;
    if (input.isDown('Digit1')) bg.setTheme(THEMES.teal);
    else if (input.isDown('Digit2')) bg.setTheme(THEMES.orange);
    else if (input.isDown('Digit3')) bg.setTheme(THEMES.green);
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
