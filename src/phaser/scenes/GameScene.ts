import Phaser from 'phaser';
import { assetManifest } from '../../game/assets/manifest';
import { isEntityAvailable } from '../../game/content/entitySelectors';
import {
  homeArchitectureOverlays,
  homeDecorLayout,
  homeEntitySortY,
  homeFurnitureLayout,
  homeVisualSizes,
} from '../../game/content/homeLayout';
import { chapterMaps, type WorldEntity } from '../../game/content/maps';
import {
  extractEntitySortY,
  parseTiledMap,
  type TiledMapContent,
  type VisualPlacement,
} from '../../game/content/tiledMapLoader';
import { mapMovement } from '../../game/input/InputMapper';
import { getMapMode } from '../../game/presentation/mapPresentation';
import type { InputAction } from '../../game/input/actions';
import type { GameState } from '../../game/state/GameState';
import type { GameStore } from '../../game/state/GameStore';
import { SceneBridge } from '../bridge/SceneBridge';
import {
  computeBreathSine,
  computeBreathScale,
  isBreathingActive,
  DOT_SCALE_AMPLITUDE,
  DOT_ALPHA_MIN,
  DOT_ALPHA_MAX,
} from '../../game/presentation/breathing';
import { resolveRainPresentation } from '../../game/presentation/rainMotion';
import {
  createPresentationSnapshot,
  diffPresentationSnapshots,
  type PresentationEvent,
  type PresentationSnapshot,
} from '../../game/presentation/presentationEvents';
import { PresentationDirector, type WorldResponse } from '../presentation/PresentationDirector';

interface EntityView {
  definition: WorldEntity;
  container: Phaser.GameObjects.Container;
  marker: Phaser.GameObjects.Shape;
  label: Phaser.GameObjects.Text;
  actor: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite | null;
  breathKind: 'scale' | 'dot' | 'none';
  breathBaseScale: number;
  breathPhase: number;
  hover: boolean;
}

const homePropVisuals: Record<
  string,
  {
    key: string;
    size: number;
    labelOffset: number;
    frame?: number;
    offsetX?: number;
    offsetY?: number;
  }
> = {
  'entity.home.bedside_photo': {
    key: 'prop.home.bedside_photo',
    size: homeVisualSizes.props.bedsidePhoto,
    labelOffset: 26,
  },
  'entity.home.journal': {
    key: 'prop.home.red_thread_journal',
    size: homeVisualSizes.props.journal,
    labelOffset: 30,
  },
  'entity.home.key_bowl': {
    key: 'prop.home.blue_key_bowl',
    size: homeVisualSizes.props.keyBowl,
    labelOffset: 18,
  },
  'entity.home.glasses_case': {
    key: 'prop.home.glasses_case',
    size: homeVisualSizes.props.glassesCase,
    labelOffset: 22,
  },
};

const worldDepth = (sortY: number): number => 100 + sortY;
const overlayDepth = 2000;

const lifeSlotPlacedFrames: Record<
  string,
  { itemId: string; emptyFrame: number; placedFrame: number }
> = {
  'slot.life.dresser': { itemId: 'item.life.wood_comb', emptyFrame: 7, placedFrame: 4 },
  'slot.life.windowsill': { itemId: 'item.life.enamel_cup', emptyFrame: 8, placedFrame: 5 },
  'slot.life.radio': { itemId: 'item.life.cassette', emptyFrame: 9, placedFrame: 6 },
};

export class GameScene extends Phaser.Scene {
  private readonly bridge: SceneBridge;
  private readonly collisionDebugEnabled =
    import.meta.env.DEV && new URLSearchParams(window.location.search).get('debug') === '1';
  private player!: Phaser.GameObjects.Container;
  private playerActor: Phaser.GameObjects.Sprite | null = null;
  private xiulanActor: Phaser.GameObjects.Sprite | null = null;
  private holdWarmth: Phaser.GameObjects.Arc | null = null;
  private holdHandActor: Phaser.GameObjects.Sprite | null = null;
  private xiulanReachStarted = false;
  private playerAction: 'pickup' | null = null;
  private playerActionVersion = 0;
  private playerActionTimer: Phaser.Time.TimerEvent | null = null;
  private entityViews: EntityView[] = [];
  private renderedChapter: GameState['chapterId'] | null = null;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private holdingConfirm = false;
  private tickAccumulator = 0;
  private unsubscribe: (() => void) | null = null;
  private reducedMotion = false;
  private tiledContent: TiledMapContent | null = null;
  private lifeResolvedBackdrop: Phaser.GameObjects.Image | null = null;
  private lifeResolvedTarget = -1;
  private lifeEraVeils: Phaser.GameObjects.Rectangle[] = [];
  private lifeEraVeilTargets: number[] = [];
  private rainOverlays: Phaser.GameObjects.Image[] = [];
  private rainMotionElapsedMs = 0;
  private presentation!: PresentationDirector;
  private sceneReadyVersion = 0;
  private previousPresentationSnapshot: Readonly<PresentationSnapshot> | null = null;
  private pendingWorldResponses: WorldResponse[] = [];
  private lastReturnRouteLoops = 0;
  private presentationLockUntil = 0;
  private wrongTurnEchoVersion = 0;
  private wrongTurnWallTimer: number | null = null;

  constructor(store: GameStore) {
    super('GameScene');
    this.bridge = new SceneBridge(store);
  }

  preload(): void {
    this.game.canvas.dataset.sceneReady = 'false';
    this.game.canvas.dataset.sceneReadyStage = 'preloading';
    this.game.canvas.dataset.preloadProgress = '0';
    this.load.on(Phaser.Loader.Events.PROGRESS, (progress: number) => {
      this.game.canvas.dataset.preloadProgress = String(Math.round(progress * 100));
    });
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      if (this.renderedChapter === null) this.game.canvas.dataset.sceneReadyStage = 'loaded';
      this.game.canvas.dataset.preloadProgress = '100';
    });
    for (const asset of assetManifest) {
      if (!asset.preload) continue;
      if (asset.type === 'tilemap') {
        // The adapter consumes plain JSON; avoid a duplicate request for the unused Tilemap cache.
        this.load.json(`${asset.key}.raw`, asset.url);
      } else if (asset.type === 'spritesheet') {
        this.load.spritesheet(asset.key, asset.url, asset.frameConfig);
      } else this.load.image(asset.key, asset.url);
    }
  }

  create(): void {
    this.game.canvas.dataset.sceneReadyStage = 'creating';
    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error('Keyboard input is unavailable');
    this.keys = keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      upAlt: Phaser.Input.Keyboard.KeyCodes.UP,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      downAlt: Phaser.Input.Keyboard.KeyCodes.DOWN,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      leftAlt: Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      rightAlt: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      interact: Phaser.Input.Keyboard.KeyCodes.E,
      enter: Phaser.Input.Keyboard.KeyCodes.ENTER,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
      observe: Phaser.Input.Keyboard.KeyCodes.SHIFT,
      inventory: Phaser.Input.Keyboard.KeyCodes.I,
      journal: Phaser.Input.Keyboard.KeyCodes.J,
      map: Phaser.Input.Keyboard.KeyCodes.M,
      pause: Phaser.Input.Keyboard.KeyCodes.ESC,
      cancel: Phaser.Input.Keyboard.KeyCodes.Q,
    }) as Record<string, Phaser.Input.Keyboard.Key>;

    for (const keyName of ['interact', 'enter', 'space']) {
      this.keys[keyName].on('down', () => this.confirmDown());
      this.keys[keyName].on('up', () => this.confirmUp());
    }
    this.keys.inventory.on('down', () => this.toggleModal('inventory'));
    this.keys.journal.on('down', () => this.toggleModal('journal'));
    this.keys.map.on('down', () => this.toggleModal('map'));
    this.keys.pause.on('down', () => this.toggleModal('pause'));
    this.keys.cancel.on('down', () => this.bridge.send({ type: 'CLOSE_MODAL' }));
    this.keys.observe.on('down', () => this.beginObservation());
    this.keys.observe.on('up', () => this.endObservation());
    this.createPlayerAnimations();
    const movementKeys: Array<[string, InputAction]> = [
      ['up', 'move_up'],
      ['upAlt', 'move_up'],
      ['down', 'move_down'],
      ['downAlt', 'move_down'],
      ['left', 'move_left'],
      ['leftAlt', 'move_left'],
      ['right', 'move_right'],
      ['rightAlt', 'move_right'],
    ];
    for (const [keyName, action] of movementKeys) {
      this.keys[keyName].on('down', () => {
        this.endObservation();
        if (this.isPresentationLocked()) return;
        const state = this.bridge.getSnapshot();
        const direction = mapMovement(action, state.degradationStage, state.mode);
        if (direction) this.bridge.send({ type: 'MOVE', direction, deltaSeconds: 0.1 });
      });
    }

    this.presentation = new PresentationDirector(this);
    this.unsubscribe = this.bridge.subscribe((state) => this.syncState(state));
    // The immediate subscribe callback runs while Phaser is still inside
    // Scene.create(), when game.isRunning can still be false. All renderer
    // dependencies now exist, so replay the authoritative snapshot explicitly
    // instead of waiting for another store mutation.
    this.syncState(this.bridge.getSnapshot(), true);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.sceneReadyVersion += 1;
      delete this.game.canvas.dataset.sceneReady;
      delete this.game.canvas.dataset.observationActive;
      this.unsubscribe?.();
      this.clearWrongTurnEcho();
      delete this.game.canvas.dataset.wrongTurnEcho;
      this.presentation.destroyChapter();
      this.renderedChapter = null;
      this.previousPresentationSnapshot = null;
      this.pendingWorldResponses = [];
      this.lastReturnRouteLoops = 0;
      this.presentationLockUntil = 0;
      this.tiledContent = null;
      this.tickAccumulator = 0;
      this.playerActor = null;
      this.xiulanActor = null;
      this.holdWarmth = null;
      this.holdHandActor = null;
      this.rainOverlays = [];
      this.playerActionTimer?.remove(false);
      this.playerActionTimer = null;
      this.input.setDefaultCursor('default');
    });
  }

  update(time: number, delta: number): void {
    const state = this.bridge.getSnapshot();
    const cameraFadeRunning = String(this.cameras.main.fadeEffect.isRunning);
    if (this.game.canvas.dataset.cameraFadeRunning !== cameraFadeRunning) {
      this.game.canvas.dataset.cameraFadeRunning = cameraFadeRunning;
    }
    this.presentation.update(time, state);
    this.updateRain(state, delta);
    const action =
      state.phase === 'playing' && !this.isPresentationLocked()
        ? this.currentMovementAction()
        : null;
    if (action && this.presentation.isObserving) this.endObservation();
    if (!action && state.player.moving) this.bridge.send({ type: 'STOP_MOVING' });
    this.updateEntityBreathing(state, time);
    if (state.phase !== 'playing') return;
    this.tickAccumulator += delta / 1000;
    // GameStore.tick early-returns during modal/dialogue; skip the no-op
    // dispatch and discard accumulated time so it is not replayed on resume.
    if (state.modal || state.dialogue.length > 0) {
      this.tickAccumulator = 0;
    } else if (this.tickAccumulator >= (state.mapWashSeconds > 0 ? 0.1 : 1)) {
      this.bridge.send({ type: 'TICK', deltaSeconds: this.tickAccumulator });
      this.tickAccumulator = 0;
    }
    if (action) {
      const direction = mapMovement(action, state.degradationStage, state.mode);
      if (direction) this.bridge.send({ type: 'MOVE', direction, deltaSeconds: delta / 1000 });
    }
    if (this.holdingConfirm && state.flags.includes('ending.ready_to_hold')) {
      this.bridge.send({ type: 'HOLD', deltaSeconds: delta / 1000 });
    }
    const latestState = this.bridge.getSnapshot();
    this.updatePlayerPose(latestState);
  }

  private beginObservation(): void {
    const state = this.bridge.getSnapshot();
    if (!this.player || this.isPresentationLocked()) return;
    this.presentation.beginObservation(
      state,
      { x: this.player.x, y: this.player.y },
      this.entityViews.filter((view) => view.container.visible).map((view) => view.definition),
      this.time.now,
    );
    this.game.canvas.dataset.observationActive = String(this.presentation.isObserving);
    this.updateRain(state, 0);
  }

  private endObservation(): void {
    if (!this.presentation?.isObserving) return;
    this.presentation.endObservation();
    this.game.canvas.dataset.observationActive = 'false';
    this.updateRain(this.bridge.getSnapshot(), 0);
  }

  private scheduleSceneReady(arrivalDurationMs: number): void {
    const version = this.sceneReadyVersion;
    let fadeComplete = arrivalDurationMs <= 0;
    let renderedFramesAfterFade = 0;
    let fadeFallbackTimer: number | null = null;
    const cleanup = () => {
      this.game.events.off(Phaser.Core.Events.POST_RENDER, onPostRender);
      this.cameras.main.off(Phaser.Cameras.Scene2D.Events.FADE_IN_COMPLETE, onFadeComplete);
      if (fadeFallbackTimer !== null) window.clearTimeout(fadeFallbackTimer);
      fadeFallbackTimer = null;
    };
    const markReady = () => {
      if (version !== this.sceneReadyVersion || !this.sys.isActive()) {
        cleanup();
        return;
      }
      if (!fadeComplete || renderedFramesAfterFade < 2) return;
      cleanup();
      this.game.canvas.dataset.sceneReady = 'true';
      this.game.canvas.dataset.sceneReadyStage = 'ready';
    };
    const onFadeComplete = () => {
      if (fadeComplete) return;
      fadeComplete = true;
      renderedFramesAfterFade = 0;
      this.game.canvas.dataset.sceneReadyStage = 'fade-complete';
    };
    const onPostRender = () => {
      if (version !== this.sceneReadyVersion || !this.sys.isActive()) {
        cleanup();
        return;
      }
      if (fadeComplete) renderedFramesAfterFade += 1;
      this.game.canvas.dataset.sceneReadyStage = fadeComplete
        ? `frame-${renderedFramesAfterFade}`
        : 'fading';
      markReady();
    };
    if (!fadeComplete) {
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_IN_COMPLETE, onFadeComplete);
      fadeFallbackTimer = window.setTimeout(
        () => {
          if (version !== this.sceneReadyVersion || fadeComplete) return;
          this.cameras.main.resetFX();
          onFadeComplete();
        },
        Math.max(400, arrivalDurationMs * 2),
      );
    }
    this.game.events.on(Phaser.Core.Events.POST_RENDER, onPostRender);
  }

  private invalidateSceneReady(): void {
    this.sceneReadyVersion += 1;
    this.game.canvas.dataset.sceneReady = 'false';
    this.game.canvas.dataset.sceneReadyStage = 'invalidated';
    this.game.canvas.dataset.sceneReadyVersion = String(this.sceneReadyVersion);
  }

  private currentMovementAction(): InputAction | null {
    if (this.keys.up.isDown || this.keys.upAlt.isDown) return 'move_up';
    if (this.keys.down.isDown || this.keys.downAlt.isDown) return 'move_down';
    if (this.keys.left.isDown || this.keys.leftAlt.isDown) return 'move_left';
    if (this.keys.right.isDown || this.keys.rightAlt.isDown) return 'move_right';
    return null;
  }

  private isPresentationLocked(): boolean {
    return performance.now() < this.presentationLockUntil;
  }

  private clearWrongTurnEcho(): void {
    this.wrongTurnEchoVersion += 1;
    if (this.wrongTurnWallTimer !== null) window.clearTimeout(this.wrongTurnWallTimer);
    this.wrongTurnWallTimer = null;
    this.presentation?.finishWrongTurnEcho();
    this.presentationLockUntil = 0;
    this.game.canvas.dataset.wrongTurnEcho = 'false';
  }

  private confirmDown(): void {
    const state = this.bridge.getSnapshot();
    if (state.phase !== 'playing' || this.isPresentationLocked()) return;
    if (state.dialogue.length > 0) {
      this.bridge.send({ type: 'ADVANCE_DIALOGUE' });
      return;
    }
    if (state.flags.includes('ending.ready_to_hold')) {
      this.holdingConfirm = true;
      if (state.settings.holdMode === 'single') this.bridge.send({ type: 'HOLD', deltaSeconds: 1 });
      return;
    }
    if (state.modal) return;
    const nearest = this.nearestEntity(125);
    if (nearest) this.interactWith(nearest);
  }

  private confirmUp(): void {
    if (this.holdingConfirm && this.bridge.getSnapshot().holdProgress < 1) {
      this.bridge.send({ type: 'CANCEL_HOLD' });
    }
    this.holdingConfirm = false;
  }

  private toggleModal(modal: 'inventory' | 'journal' | 'map' | 'pause'): void {
    const state = this.bridge.getSnapshot();
    if (state.phase !== 'playing' || state.dialogue.length > 0) return;
    if (modal === 'map' && getMapMode(state) === 'hidden') return;
    this.endObservation();
    this.bridge.send(
      state.modal === modal ? { type: 'CLOSE_MODAL' } : { type: 'OPEN_MODAL', modal },
    );
  }

  private syncState(state: Readonly<GameState>, allowDuringCreate = false): void {
    if (!allowDuringCreate && (!this.sys.isActive() || !this.game.isRunning)) return;
    const previousSnapshot = this.previousPresentationSnapshot;
    const presentationSnapshot = createPresentationSnapshot(state);
    const presentationEvents = diffPresentationSnapshots(previousSnapshot, presentationSnapshot);
    this.previousPresentationSnapshot = presentationSnapshot;
    const wrongTurnEntered =
      previousSnapshot?.phase === 'playing' &&
      previousSnapshot.chapterId === 'return' &&
      state.phase === 'playing' &&
      state.chapterId === 'return' &&
      state.puzzles.routeLoops > this.lastReturnRouteLoops;
    this.lastReturnRouteLoops = state.chapterId === 'return' ? state.puzzles.routeLoops : 0;
    const reenteringRenderedChapter =
      previousSnapshot !== null &&
      previousSnapshot.phase !== 'playing' &&
      state.phase === 'playing' &&
      this.renderedChapter === state.chapterId;
    if (reenteringRenderedChapter) this.invalidateSceneReady();
    const motionPreferenceChanged = this.reducedMotion !== state.settings.reducedMotion;
    this.reducedMotion = state.settings.reducedMotion;
    const chapterChanged = this.renderedChapter !== state.chapterId;
    if (chapterChanged) this.buildChapter(state);
    if (!this.player || !this.playerActor) return;
    if (
      state.phase !== 'playing' ||
      state.modal ||
      state.dialogue.length > 0 ||
      state.player.moving
    ) {
      this.endObservation();
    }
    this.player.setPosition(state.player.x, state.player.y);
    this.player.setDepth(worldDepth(state.player.y));
    this.player.setAlpha(state.phase === 'playing' ? 1 : 0.22);
    this.updatePlayerPose(state);
    this.updateXiulanPose(state);
    this.updateHoldWarmth(state);
    this.updateHoldHand(state);
    this.updateEntityVisibility(state);
    this.updateLifeVisualState(state);
    this.updateRain(state, 0);
    this.presentation.sync(state, this.time.now);
    if (wrongTurnEntered) {
      const duration = this.presentation.playWrongTurnEcho(
        state.puzzles.returnJunction,
        state.settings.reducedMotion,
      );
      this.presentationLockUntil = Math.max(
        this.presentationLockUntil,
        performance.now() + duration,
      );
      this.game.canvas.dataset.wrongTurnEcho = 'true';
      const echoVersion = ++this.wrongTurnEchoVersion;
      if (this.wrongTurnWallTimer !== null) window.clearTimeout(this.wrongTurnWallTimer);
      this.wrongTurnWallTimer = window.setTimeout(() => {
        if (echoVersion !== this.wrongTurnEchoVersion) return;
        this.wrongTurnWallTimer = null;
        this.presentation.finishWrongTurnEcho();
        this.game.canvas.dataset.wrongTurnEcho = 'false';
      }, duration);
    }
    this.presentWorldResponses(presentationEvents, state);
    if (reenteringRenderedChapter && !chapterChanged) this.scheduleSceneReady(0);
    if (motionPreferenceChanged) {
      for (const view of this.entityViews) {
        if (view.hover) this.setEntityHover(view, true);
      }
    }
  }

  private buildChapter(state: Readonly<GameState>): void {
    this.invalidateSceneReady();
    this.clearWrongTurnEcho();
    this.game.canvas.dataset.observationActive = 'false';
    this.game.canvas.dataset.wrongTurnEcho = 'false';
    this.presentation.destroyChapter();
    this.children.removeAll(true);
    this.entityViews = [];
    this.playerActor = null;
    this.xiulanActor = null;
    this.holdWarmth = null;
    this.holdHandActor = null;
    this.lifeEraVeils = [];
    this.lifeEraVeilTargets = [];
    this.lifeResolvedBackdrop = null;
    this.lifeResolvedTarget = -1;
    this.rainOverlays = [];
    this.rainMotionElapsedMs = 0;
    this.xiulanReachStarted = false;
    this.playerAction = null;
    this.playerActionVersion += 1;
    this.playerActionTimer?.remove(false);
    this.playerActionTimer = null;
    this.pendingWorldResponses = [];
    this.presentationLockUntil = 0;
    this.lastReturnRouteLoops = state.chapterId === 'return' ? state.puzzles.routeLoops : 0;
    const map = chapterMaps[state.chapterId];
    this.renderedChapter = state.chapterId;
    this.cameras.main.setBackgroundColor(map.palette.wall);
    this.cameras.main.setBounds(0, 0, map.width, map.height);
    this.add
      .image(map.width / 2, map.height / 2, map.backgroundKey)
      .setDisplaySize(map.width, map.height)
      .setDepth(0);

    if (state.chapterId === 'rain') {
      this.add
        .image(map.width / 2, map.height / 2, 'environment.rain.puddle_reflection_overlay')
        .setDisplaySize(map.width, map.height)
        .setDepth(4);
      this.rainOverlays = [0, -map.height].map((offsetY) =>
        this.add
          .image(map.width / 2, map.height / 2 + offsetY, 'environment.rain.rain_overlay')
          .setDisplaySize(map.width, map.height)
          .setDepth(8),
      );
      this.updateRain(state, 0);
    }

    // Parse Tiled JSON into pure data structures. Falls back to code constants
    // if the Tiled map lacks visual layers (e.g. non-home chapters).
    const tiledRawData = this.cache.json.get(`${map.id}.raw`);
    let tiledContent: TiledMapContent | null = null;
    if (tiledRawData) {
      try {
        tiledContent = parseTiledMap(map.id, tiledRawData, map.entities);
      } catch (err) {
        console.warn(`[tiledMapLoader] Failed to parse "${map.id}":`, err);
      }
    }
    this.tiledContent = tiledContent;
    if (this.collisionDebugEnabled && tiledContent) this.createCollisionDebugOverlay(tiledContent);

    if (state.chapterId === 'home') {
      this.add
        .image(map.width / 2, map.height / 2, 'environment.home.sunlight_overlay')
        .setDisplaySize(map.width, map.height)
        .setDepth(20);
    }
    if (state.chapterId === 'life') this.createLifeBackdropDetails(state);

    // Render Tiled-driven visual placements for any chapter that has them.
    // Home falls back to code constants if Tiled data is missing.
    const decorPlacements = tiledContent?.visualDecor ?? [];
    const furniturePlacements = tiledContent?.visualFurniture ?? [];
    if (state.chapterId === 'home') {
      if (decorPlacements.length > 0) {
        for (const decor of decorPlacements) {
          this.add
            .image(decor.x, decor.y, decor.assetKey, decor.frame)
            .setDisplaySize(decor.size, decor.size)
            .setDepth(worldDepth(decor.sortY));
        }
      } else {
        for (const decor of homeDecorLayout) {
          this.add
            .image(decor.x, decor.y, 'decor.home.atlas', decor.frame)
            .setDisplaySize(decor.size, decor.size)
            .setDepth(worldDepth(decor.sortY));
        }
      }
      if (furniturePlacements.length > 0) {
        for (const furniture of furniturePlacements) {
          this.add
            .image(furniture.x, furniture.y, furniture.assetKey, furniture.frame)
            .setDisplaySize(furniture.size, furniture.size)
            .setDepth(worldDepth(furniture.sortY));
        }
      } else {
        for (const furniture of homeFurnitureLayout) {
          this.add
            .image(furniture.x, furniture.y, 'furniture.home.atlas', furniture.frame)
            .setDisplaySize(furniture.size, furniture.size)
            .setDepth(worldDepth(furniture.sortY));
        }
      }
      this.createHomeArchitectureOverlays(map.width, map.height);
    } else {
      // Non-home chapters: render Tiled-driven decor/furniture if available.
      for (const decor of decorPlacements) {
        this.add
          .image(decor.x, decor.y, decor.assetKey, decor.frame)
          .setDisplaySize(decor.size, decor.size)
          .setDepth(worldDepth(decor.sortY));
      }
      for (const furniture of furniturePlacements) {
        this.add
          .image(furniture.x, furniture.y, furniture.assetKey, furniture.frame)
          .setDisplaySize(furniture.size, furniture.size)
          .setDepth(worldDepth(furniture.sortY));
      }
    }

    const visualPropsByEntityId = this.indexVisualPropsByEntityId(tiledContent?.visualProps ?? []);

    // Use Tiled-driven interactable coordinates when available; fall back to code entities.
    const tiledEntities = tiledContent?.interactables ?? map.entities;
    for (const entity of tiledEntities) {
      this.entityViews.push(this.createEntity(entity, visualPropsByEntityId.get(entity.id)));
    }
    if (state.chapterId === 'ending') {
      const xiulan = this.entityViews.find((view) => view.definition.id === 'entity.ending.xiulan');
      if (xiulan) {
        this.holdWarmth = this.add
          .circle(xiulan.definition.x + 22, xiulan.definition.y - 43, 24, 0xd3a380, 0.7)
          .setStrokeStyle(2, 0xf3d6b8, 0.75)
          .setDepth(12)
          .setVisible(false);
        this.holdHandActor = this.add
          .sprite(map.width / 2, map.height - 150, 'character.xu_old.hold_hand.side', 0)
          .setDepth(20)
          .setVisible(false);
      }
    }
    this.player = this.add.container(state.player.x, state.player.y);
    const homeActorOffsetY = state.chapterId === 'home' ? 12 : 16;
    const homeShadowOffsetY = state.chapterId === 'home' ? 8 : 9;
    const shadow = this.add.ellipse(0, homeShadowOffsetY, 38, 16, 0x2f2b28, 0.25);
    this.playerActor = this.add
      .sprite(0, homeActorOffsetY, 'character.xu_old.idle.down', 0)
      .setOrigin(0.5, 1);
    this.player.add([shadow, this.playerActor]);
    this.player.setScale(state.chapterId === 'home' ? homeVisualSizes.characterScale : 1);
    this.player.setDepth(worldDepth(state.player.y));
    this.updatePlayerPose(state);
    const arrivalDuration = this.presentation.buildChapter(state);
    this.presentation.sync(state, this.time.now);
    this.scheduleSceneReady(arrivalDuration);
  }

  private createHomeArchitectureOverlays(width: number, height: number): void {
    for (const overlay of homeArchitectureOverlays) {
      this.add
        .image(width / 2, height / 2, overlay.key)
        .setDisplaySize(width, height)
        .setDepth(worldDepth(overlay.sortY));
    }
  }

  private createCollisionDebugOverlay(content: TiledMapContent): void {
    const graphics = this.add.graphics().setDepth(overlayDepth + 20);
    const walkArea = content.spawns[0];
    if (walkArea) {
      graphics.lineStyle(3, 0x63e6be, 0.95);
      graphics.strokeRect(walkArea.x, walkArea.y, walkArea.width, walkArea.height);
    }

    graphics.fillStyle(0xff5c70, 0.2);
    graphics.lineStyle(2, 0xff5c70, 0.95);
    for (const obstacle of content.collisionRects) {
      graphics.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
      graphics.strokeRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
      this.add
        .text(obstacle.x + 4, obstacle.y + 4, obstacle.name.replace(/^collision\./, ''), {
          color: '#fff4f5',
          fontFamily: 'monospace',
          fontSize: '10px',
          backgroundColor: 'rgba(74, 10, 20, 0.72)',
          padding: { x: 3, y: 2 },
        })
        .setDepth(overlayDepth + 21);
    }
  }

  private updateRain(state: Readonly<GameState>, deltaMs: number): void {
    if (this.rainOverlays.length !== 2 || state.chapterId !== 'rain') return;
    const reducedMotion = state.settings.reducedMotion;
    if (!reducedMotion) this.rainMotionElapsedMs += Math.max(0, deltaMs);
    const map = chapterMaps.rain;
    const frame = resolveRainPresentation(this.rainMotionElapsedMs, reducedMotion, map.height);
    this.rainOverlays[0]
      .setPosition(map.width / 2, map.height / 2 + frame.offsetY)
      .setAlpha(frame.alpha * (this.presentation.isObserving ? 0.52 : 1))
      .setVisible(true);
    this.rainOverlays[1]
      .setPosition(map.width / 2, map.height / 2 - map.height + frame.offsetY)
      .setAlpha(frame.alpha * (this.presentation.isObserving ? 0.52 : 1))
      .setVisible(!reducedMotion);
  }

  private createLifeBackdropDetails(state: Readonly<GameState>): void {
    this.lifeResolvedBackdrop = this.add
      .image(640, 360, 'environment.life.resolved')
      .setDisplaySize(1280, 720)
      .setAlpha(0)
      .setDepth(4);

    const eraBands = [
      { x: 205, width: 410, color: 0xd8c28e },
      { x: 595, width: 370, color: 0xd8c66f },
      { x: 1030, width: 500, color: 0x58666c },
    ];
    this.lifeEraVeils = eraBands.map(({ x, width, color }) =>
      this.add.rectangle(x, 360, width, 720, color, 0).setDepth(8),
    );
    this.lifeEraVeilTargets = [-1, -1, -1];
    this.updateLifeVisualState(state);
  }

  private updateLifeVisualState(state: Readonly<GameState>): void {
    if (state.chapterId !== 'life') return;
    const placedObjects = state.puzzles.placedObjects ?? [];
    const photosOrdered = state.flags.includes('puzzle.life.photo_order.completed');
    const lifeCompleted = photosOrdered && placedObjects.length === 3;

    for (const view of this.entityViews) {
      const slot = lifeSlotPlacedFrames[view.definition.id];
      if (!slot || !view.actor) continue;
      const placed = placedObjects.includes(slot.itemId);
      view.actor.setFrame(placed ? slot.placedFrame : slot.emptyFrame);
      view.actor.setAlpha(placed ? 1 : 0.92);
    }

    const items = ['item.life.wood_comb', 'item.life.enamel_cup', 'item.life.cassette'];
    for (let index = 0; index < this.lifeEraVeils.length; index += 1) {
      const target = placedObjects.includes(items[index]) ? 0.012 : photosOrdered ? 0.05 : 0.085;
      if (this.lifeEraVeilTargets[index] === target) continue;
      this.lifeEraVeilTargets[index] = target;
      const veil = this.lifeEraVeils[index];
      this.tweens.killTweensOf(veil);
      this.tweens.add({
        targets: veil,
        alpha: target,
        duration: state.settings.reducedMotion ? 140 : 420,
        ease: 'Sine.easeInOut',
      });
    }

    const resolvedTarget = lifeCompleted ? 1 : photosOrdered ? 0.18 : 0;
    if (this.lifeResolvedBackdrop && this.lifeResolvedTarget !== resolvedTarget) {
      this.lifeResolvedTarget = resolvedTarget;
      this.tweens.killTweensOf(this.lifeResolvedBackdrop);
      this.tweens.add({
        targets: this.lifeResolvedBackdrop,
        alpha: resolvedTarget,
        duration: state.settings.reducedMotion ? 140 : lifeCompleted ? 680 : 420,
        ease: 'Sine.easeInOut',
      });
    }
  }

  private presentWorldResponses(
    events: readonly PresentationEvent[],
    state: Readonly<GameState>,
  ): void {
    if (state.phase !== 'playing') {
      this.pendingWorldResponses = [];
      return;
    }
    const responses = events
      .map((event) => this.worldResponseFor(event, state))
      .filter((response): response is WorldResponse => response !== null);
    if (state.activeMemoryId) {
      this.pendingWorldResponses.push(...responses);
      return;
    }
    const visibleResponses = [...this.pendingWorldResponses, ...responses];
    this.pendingWorldResponses = [];
    for (const response of visibleResponses) {
      this.presentation.playWorldResponse(response, state.settings.reducedMotion);
    }
  }

  private worldResponseFor(
    event: PresentationEvent,
    state: Readonly<GameState>,
  ): WorldResponse | null {
    if (event.type === 'rain_stone_progress') {
      const stone = [2, 4, 5][event.step - 1];
      const entity = this.entityViews.find(
        (view) => view.definition.id === `entity.rain.stone_${stone}`,
      )?.definition;
      return entity ? { x: entity.x, y: entity.y, color: 0xaac8d0, major: event.step === 3 } : null;
    }
    if (event.type === 'rain_sign_progress') {
      const entityId =
        event.step === 1 ? 'entity.rain.umbrella_sign_a' : 'entity.rain.umbrella_sign_b';
      const entity = this.entityViews.find((view) => view.definition.id === entityId)?.definition;
      return entity ? { x: entity.x, y: entity.y, color: 0xb54949 } : null;
    }
    if (event.type === 'life_object_restored') {
      const slotForItem: Record<string, string> = {
        'item.life.wood_comb': 'slot.life.dresser',
        'item.life.enamel_cup': 'slot.life.windowsill',
        'item.life.cassette': 'slot.life.radio',
      };
      const slot = this.entityViews.find(
        (view) => view.definition.id === slotForItem[event.itemId],
      )?.definition;
      return slot
        ? { x: slot.x, y: slot.y, color: 0xd0bd79, major: event.restoredCount === 3 }
        : null;
    }
    if (event.type === 'return_prefix_progress') {
      const exit = this.entityViews.find(
        (view) => view.definition.id === `route.${event.direction}`,
      )?.definition;
      return exit ? { x: exit.x, y: exit.y, color: 0xd9d0bd } : null;
    }
    if (event.type === 'return_junction_completed') {
      return { x: 640, y: 360, color: event.junction === 3 ? 0xb54949 : 0xd9d0bd, major: true };
    }
    if (event.type === 'memory_added') {
      return { x: state.player.x, y: state.player.y - 24, color: 0xb54949, major: true };
    }
    if (event.type === 'ending_handshake_completed') {
      const xiulan = this.entityViews.find(
        (view) => view.definition.id === 'entity.ending.xiulan',
      )?.definition;
      return {
        x: xiulan?.x ?? state.player.x,
        y: (xiulan?.y ?? state.player.y) - 36,
        color: 0xe8c7a4,
        major: true,
      };
    }
    return null;
  }

  private indexVisualPropsByEntityId(
    visualProps: readonly VisualPlacement[],
  ): Map<string, VisualPlacement> {
    const indexed = new Map<string, VisualPlacement>();
    for (const prop of visualProps) {
      const entityId =
        prop.entityId ??
        (prop.id.startsWith('visual.') ? prop.id.replace('visual.', 'entity.') : undefined);
      if (entityId) indexed.set(entityId, prop);
    }
    return indexed;
  }

  private createPlayerAnimations(): void {
    const directions = ['down', 'up', 'right'] as const;
    for (const direction of directions) {
      const walkKey = `character.xu_old.walk.${direction}`;
      if (!this.anims.exists(`${walkKey}.animation`)) {
        this.anims.create({
          key: `${walkKey}.animation`,
          frames: this.anims.generateFrameNumbers(walkKey, { start: 0, end: 5 }),
          frameRate: 8,
          repeat: -1,
        });
      }
      const idleKey = `character.xu_old.idle.${direction}`;
      if (!this.anims.exists(`${idleKey}.animation`)) {
        this.anims.create({
          key: `${idleKey}.animation`,
          frames: this.anims.generateFrameNumbers(idleKey, { start: 0, end: 3 }),
          frameRate: 4,
          repeat: -1,
        });
      }
      const observeKey = `character.xu_old.observe.${direction}`;
      if (!this.anims.exists(`${observeKey}.animation`)) {
        this.anims.create({
          key: `${observeKey}.animation`,
          frames: this.anims.generateFrameNumbers(observeKey, { start: 0, end: 3 }),
          frameRate: 6,
          repeat: -1,
        });
      }
    }
    for (const direction of ['down', 'right'] as const) {
      const pickupKey = `character.xu_old.pickup.${direction}`;
      if (!this.anims.exists(`${pickupKey}.animation`)) {
        this.anims.create({
          key: `${pickupKey}.animation`,
          frames: this.anims.generateFrameNumbers(pickupKey, { start: 0, end: 5 }),
          frameRate: 8,
          repeat: 0,
        });
      }
    }
    if (!this.anims.exists('character.xiulan_old.reach_hand.right.animation')) {
      this.anims.create({
        key: 'character.xiulan_old.reach_hand.right.animation',
        frames: this.anims.generateFrameNumbers('character.xiulan_old.reach_hand.right', {
          start: 0,
          end: 7,
        }),
        frameRate: 8,
        repeat: 0,
      });
    }
  }

  private updatePlayerPose(state: Readonly<GameState>): void {
    if (!this.playerActor) return;
    if (this.playerAction === 'pickup') {
      if (!state.player.moving) return;
      this.finishPlayerAction(this.playerActionVersion);
    }
    const direction = state.player.facing === 'left' ? 'right' : state.player.facing;
    this.playerActor.setFlipX(state.player.facing === 'left');
    if (state.player.moving) {
      const walkKey = `character.xu_old.walk.${direction}`;
      if (state.settings.reducedMotion) {
        this.playerActor.stop();
        this.playerActor.setTexture(walkKey, 0);
      } else {
        this.playPlayerAnimation(walkKey, `${walkKey}.animation`);
      }
    } else if (
      state.phase === 'playing' &&
      !state.modal &&
      state.dialogue.length === 0 &&
      this.presentation.isObserving
    ) {
      const observeKey = `character.xu_old.observe.${direction}`;
      if (state.settings.reducedMotion) {
        this.playerActor.stop();
        this.playerActor.setTexture(observeKey, 2);
      } else {
        this.playPlayerAnimation(observeKey, `${observeKey}.animation`);
      }
    } else {
      const idleKey = `character.xu_old.idle.${direction}`;
      if (state.settings.reducedMotion) {
        this.playerActor.stop();
        this.playerActor.setTexture(idleKey, 0);
      } else {
        this.playPlayerAnimation(idleKey, `${idleKey}.animation`);
      }
    }
  }

  private playPlayerAnimation(textureKey: string, animationKey: string): void {
    if (!this.playerActor) return;
    if (this.anims.exists(animationKey)) {
      this.playerActor.play(animationKey, true);
      return;
    }
    this.playerActor.stop();
    this.playerActor.setTexture(textureKey, 0);
  }

  private playPickup(state: Readonly<GameState>): void {
    if (!this.playerActor) return;
    const sideFacing = state.player.facing === 'left' || state.player.facing === 'right';
    const direction = sideFacing ? 'right' : 'down';
    const pickupKey = `character.xu_old.pickup.${direction}`;
    this.playerActionTimer?.remove(false);
    this.playerAction = 'pickup';
    const actionVersion = ++this.playerActionVersion;
    this.playerActor.setFlipX(state.player.facing === 'left');
    this.playerActor.stop();
    if (state.settings.reducedMotion) {
      this.playerActor.setTexture(pickupKey, 2);
      this.playerActionTimer = this.time.delayedCall(180, () =>
        this.finishPlayerAction(actionVersion),
      );
      return;
    }
    if (!this.anims.exists(`${pickupKey}.animation`)) {
      this.finishPlayerAction(actionVersion);
      return;
    }
    this.playerActor.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () =>
      this.finishPlayerAction(actionVersion),
    );
    this.playerActor.play(`${pickupKey}.animation`);
  }

  private finishPlayerAction(actionVersion: number): void {
    if (actionVersion !== this.playerActionVersion) return;
    this.playerActionTimer?.remove(false);
    this.playerActionTimer = null;
    this.playerAction = null;
    this.updatePlayerPose(this.bridge.getSnapshot());
  }

  private updateXiulanPose(state: Readonly<GameState>): void {
    if (!this.xiulanActor) return;
    const shouldReach = state.flags.includes('ending.dialogue_started');
    if (!shouldReach) {
      this.xiulanReachStarted = false;
      this.xiulanActor.stop();
      this.xiulanActor.setTexture('character.xiulan_old.reach_hand.right', 0);
      return;
    }
    if (state.settings.reducedMotion) {
      this.xiulanReachStarted = true;
      this.xiulanActor.stop();
      this.xiulanActor.setTexture('character.xiulan_old.reach_hand.right', 7);
      return;
    }
    if (this.xiulanReachStarted) return;
    this.xiulanReachStarted = true;
    this.xiulanActor.play('character.xiulan_old.reach_hand.right.animation');
  }

  private updateHoldWarmth(state: Readonly<GameState>): void {
    if (!this.holdWarmth) return;
    const progress = state.holdProgress;
    if (progress <= 0 || !state.flags.includes('ending.ready_to_hold')) {
      this.holdWarmth.setVisible(false);
      return;
    }
    const scale = state.settings.reducedMotion ? 1 : 0.82 + progress * 0.18;
    this.holdWarmth
      .setVisible(true)
      .setScale(scale)
      .setAlpha(0.18 + progress * 0.72);
  }

  private updateHoldHand(state: Readonly<GameState>): void {
    if (!this.holdHandActor) return;
    const progress = state.holdProgress;
    const shouldShow =
      progress > 0 &&
      progress < 1 &&
      state.dialogue.length === 0 &&
      state.flags.includes('ending.ready_to_hold');
    if (!shouldShow) {
      this.holdHandActor.setVisible(false).setFrame(0);
      return;
    }
    const frame = state.settings.reducedMotion ? 2 : Math.min(3, Math.floor(progress * 4));
    this.holdHandActor
      .setVisible(true)
      .setFrame(frame)
      .setAlpha(state.settings.reducedMotion ? 0.96 : 0.78 + progress * 0.22);
  }

  private createEntity(entity: WorldEntity, visualPlacement?: VisualPlacement): EntityView {
    const color = entity.color ?? (entity.kind === 'exit' ? 0xeee7d8 : 0xd6c58e);
    const isXiulan = entity.id === 'entity.ending.xiulan';
    const isUmbrella = entity.id.includes('umbrella');
    const propVisual = homePropVisuals[entity.id];
    const visualActorOffsetX = visualPlacement ? visualPlacement.x - entity.x : 0;
    const visualActorOffsetY = visualPlacement ? visualPlacement.y - entity.y : 0;
    const container = this.add.container(entity.x, entity.y);
    const sortYMap = this.tiledContent
      ? extractEntitySortY(this.tiledContent, homeEntitySortY)
      : homeEntitySortY;
    container.setDepth(worldDepth(sortYMap[entity.id] ?? entity.y));

    // Tiny resting dot that only becomes visible on hover; replaces the old big circle button.
    const marker = this.add.circle(0, 0, 6, color, 1).setAlpha(0).setDepth(0);

    const actor = isXiulan
      ? this.add
          .sprite(0, 16, 'character.xiulan_old.reach_hand.right', 0)
          .setOrigin(0.5, 1)
          .setDepth(0)
      : visualPlacement?.assetKey
        ? this.add
            .image(
              visualActorOffsetX,
              visualActorOffsetY,
              visualPlacement.assetKey,
              visualPlacement.frame,
            )
            .setDisplaySize(visualPlacement.size, visualPlacement.size)
            .setDepth(0)
        : isUmbrella
          ? this.add
              .image(visualActorOffsetX, visualActorOffsetY, 'prop.red_umbrella.closed')
              .setDisplaySize(visualPlacement?.size ?? 58, visualPlacement?.size ?? 58)
              .setDepth(0)
          : propVisual
            ? this.add
                .image(
                  propVisual.offsetX ?? 0,
                  propVisual.offsetY ?? 0,
                  propVisual.key,
                  propVisual.frame,
                )
                .setDisplaySize(propVisual.size, propVisual.size)
                .setDepth(0)
            : null;

    const labelOffset =
      propVisual?.labelOffset ??
      (isXiulan ? 24 : isUmbrella ? 32 : (visualPlacement?.size ?? 60) / 2 + 8);
    const label = this.add
      .text(
        visualPlacement?.x ?? entity.x,
        (visualPlacement?.y ?? entity.y) + labelOffset,
        entity.label,
        {
          color: '#f7f3e8',
          backgroundColor: '#2f2b28cc',
          fontFamily: '"Noto Sans SC", "Microsoft YaHei", sans-serif',
          fontSize: '15px',
          padding: { x: 8, y: 4 },
        },
      )
      .setOrigin(0.5, 0)
      .setAlpha(0)
      .setDepth(overlayDepth);

    const children: Phaser.GameObjects.GameObject[] = [marker];
    if (actor) children.push(actor);
    container.add(children);

    // Generous circular hit area so the label appears before the cursor is exactly on the sprite.
    container.setInteractive(new Phaser.Geom.Circle(0, 0, 30), Phaser.Geom.Circle.Contains);

    const breathKind: EntityView['breathKind'] = isXiulan ? 'none' : actor ? 'scale' : 'dot';
    const breathBaseScale = actor ? actor.scaleX : 1;
    // 稳定错相，避免所有道具同步；用当前实体数量作为确定性索引。
    const breathPhase = this.entityViews.length * 0.6;

    const view: EntityView = {
      definition: entity,
      container,
      marker,
      label,
      actor,
      breathKind,
      breathBaseScale,
      breathPhase,
      hover: false,
    };

    container.on('pointerover', () => {
      view.hover = true;
      this.setEntityHover(view, true);
    });
    container.on('pointerout', () => {
      view.hover = false;
      this.setEntityHover(view, false);
    });
    container.on('pointerdown', () => this.interactWith(view));

    if (isXiulan) this.xiulanActor = actor as Phaser.GameObjects.Sprite;
    return view;
  }

  private setEntityHover(view: EntityView, active: boolean): void {
    const reduced = this.bridge.getSnapshot().settings.reducedMotion;
    const labelAlpha = active ? 0.95 : 0;
    const markerAlpha = active ? 0.55 : 0;
    const markerScale = active ? 1.6 : 1;

    this.input.setDefaultCursor(active ? 'pointer' : 'default');
    this.tweens.killTweensOf(view.label);
    this.tweens.killTweensOf(view.marker);

    if (reduced) {
      view.label.setAlpha(labelAlpha);
      view.marker.setAlpha(markerAlpha).setScale(1);
      return;
    }

    this.tweens.add({
      targets: view.label,
      alpha: labelAlpha,
      duration: 120,
      ease: 'Sine.easeInOut',
    });

    this.tweens.add({
      targets: view.marker,
      alpha: markerAlpha,
      scale: markerScale,
      duration: 120,
      ease: 'Sine.easeInOut',
    });
  }

  private updateEntityVisibility(state: Readonly<GameState>): void {
    for (const view of this.entityViews) {
      const visible = isEntityAvailable(state, view.definition.id);
      view.container.setVisible(visible);
      view.label.setVisible(visible);
      if (!visible && view.hover) {
        view.hover = false;
        this.setEntityHover(view, false);
      }
    }
  }

  private updateEntityBreathing(state: Readonly<GameState>, timeMs: number): void {
    const active = isBreathingActive(state);
    const timeSeconds = timeMs / 1000;
    for (const view of this.entityViews) {
      if (!view.container.visible) continue;
      if (view.breathKind === 'none') continue;

      if (view.breathKind === 'scale') {
        const actor = view.actor;
        if (!actor) continue;
        if (active && !view.hover) {
          actor.setScale(computeBreathScale(view.breathBaseScale, timeSeconds, view.breathPhase));
        } else {
          actor.setScale(view.breathBaseScale);
        }
        continue;
      }

      // breathKind === 'dot'
      if (view.hover) continue; // let setEntityHover own the marker
      if (active) {
        const s = computeBreathSine(timeSeconds, view.breathPhase);
        view.marker
          .setScale(1 + s * DOT_SCALE_AMPLITUDE)
          .setAlpha(DOT_ALPHA_MIN + ((s + 1) * (DOT_ALPHA_MAX - DOT_ALPHA_MIN)) / 2);
      } else {
        view.marker.setScale(1).setAlpha(0);
      }
    }
  }

  private interactWith(view: EntityView): void {
    const state = this.bridge.getSnapshot();
    if (
      state.phase !== 'playing' ||
      state.modal ||
      state.dialogue.length > 0 ||
      Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        view.definition.x,
        view.definition.y,
      ) >= 125
    ) {
      return;
    }

    const inventoryCount = state.inventory.length;
    this.bridge.interact(view.definition.id);
    const nextState = this.bridge.getSnapshot();
    if (view.definition.kind === 'pickup' && nextState.inventory.length > inventoryCount) {
      this.playPickup(nextState);
    }
  }

  private nearestEntity(maxDistance: number): EntityView | null {
    let nearest: EntityView | null = null;
    let best = maxDistance;
    for (const view of this.entityViews) {
      if (!view.container.visible) continue;
      const distance = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        view.definition.x,
        view.definition.y,
      );
      if (distance < best) {
        nearest = view;
        best = distance;
      }
    }
    return nearest;
  }
}
