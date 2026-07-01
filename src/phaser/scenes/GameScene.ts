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

  constructor(store: GameStore) {
    super('GameScene');
    this.bridge = new SceneBridge(store);
  }

  preload(): void {
    this.game.canvas.dataset.sceneReady = 'false';
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
        const state = this.bridge.getSnapshot();
        const direction = mapMovement(action, state.degradationStage, state.mode);
        if (direction) this.bridge.send({ type: 'MOVE', direction, deltaSeconds: 0.1 });
      });
    }

    this.unsubscribe = this.bridge.subscribe((state) => this.syncState(state));
    this.game.events.once(Phaser.Core.Events.POST_RENDER, () => {
      this.game.events.once(Phaser.Core.Events.POST_RENDER, () => {
        this.game.canvas.dataset.sceneReady = 'true';
      });
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      delete this.game.canvas.dataset.sceneReady;
      this.unsubscribe?.();
      this.playerActor = null;
      this.xiulanActor = null;
      this.holdWarmth = null;
      this.holdHandActor = null;
      this.playerActionTimer?.remove(false);
      this.playerActionTimer = null;
      this.input.setDefaultCursor('default');
    });
  }

  update(time: number, delta: number): void {
    const state = this.bridge.getSnapshot();
    const action = state.phase === 'playing' ? this.currentMovementAction() : null;
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

  private currentMovementAction(): InputAction | null {
    if (this.keys.up.isDown || this.keys.upAlt.isDown) return 'move_up';
    if (this.keys.down.isDown || this.keys.downAlt.isDown) return 'move_down';
    if (this.keys.left.isDown || this.keys.leftAlt.isDown) return 'move_left';
    if (this.keys.right.isDown || this.keys.rightAlt.isDown) return 'move_right';
    return null;
  }

  private confirmDown(): void {
    const state = this.bridge.getSnapshot();
    if (state.phase !== 'playing') return;
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
    this.bridge.send(
      state.modal === modal ? { type: 'CLOSE_MODAL' } : { type: 'OPEN_MODAL', modal },
    );
  }

  private syncState(state: Readonly<GameState>): void {
    if (!this.sys.isActive() || !this.game.isRunning) return;
    const motionPreferenceChanged = this.reducedMotion !== state.settings.reducedMotion;
    this.reducedMotion = state.settings.reducedMotion;
    if (this.renderedChapter !== state.chapterId) this.buildChapter(state);
    if (!this.player || !this.playerActor) return;
    this.player.setPosition(state.player.x, state.player.y);
    this.player.setDepth(worldDepth(state.player.y));
    this.player.setAlpha(state.phase === 'playing' ? 1 : 0.22);
    this.updatePlayerPose(state);
    this.updateXiulanPose(state);
    this.updateHoldWarmth(state);
    this.updateHoldHand(state);
    this.updateEntityVisibility(state);
    this.updateLifeVisualState(state);
    if (motionPreferenceChanged) {
      for (const view of this.entityViews) {
        if (view.hover) this.setEntityHover(view, true);
      }
    }
  }

  private buildChapter(state: Readonly<GameState>): void {
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
    this.xiulanReachStarted = false;
    this.playerAction = null;
    this.playerActionVersion += 1;
    this.playerActionTimer?.remove(false);
    this.playerActionTimer = null;
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
      this.add
        .image(map.width / 2, map.height / 2, 'environment.rain.rain_overlay')
        .setDisplaySize(map.width, map.height)
        .setDepth(8)
        .setAlpha(state.settings.reducedMotion ? 0.5 : 0.68);
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
  }

  private createHomeArchitectureOverlays(width: number, height: number): void {
    for (const overlay of homeArchitectureOverlays) {
      this.add
        .image(width / 2, height / 2, overlay.key)
        .setDisplaySize(width, height)
        .setDepth(worldDepth(overlay.sortY));
    }
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
      this.keys.observe.isDown
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
