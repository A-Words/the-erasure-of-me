import Phaser from 'phaser';
import { assetManifest } from '../../game/assets/manifest';
import { chapterMaps, type WorldEntity } from '../../game/content/maps';
import { mapMovement } from '../../game/input/InputMapper';
import type { InputAction } from '../../game/input/actions';
import type { GameState } from '../../game/state/GameState';
import type { GameStore } from '../../game/state/GameStore';
import { SceneBridge } from '../bridge/SceneBridge';

interface EntityView {
  definition: WorldEntity;
  container: Phaser.GameObjects.Container;
  marker: Phaser.GameObjects.Shape;
}

export class GameScene extends Phaser.Scene {
  private readonly bridge: SceneBridge;
  private player!: Phaser.GameObjects.Container;
  private playerActor: Phaser.GameObjects.Sprite | null = null;
  private xiulanActor: Phaser.GameObjects.Sprite | null = null;
  private holdWarmth: Phaser.GameObjects.Arc | null = null;
  private xiulanReachStarted = false;
  private entityViews: EntityView[] = [];
  private renderedChapter: GameState['chapterId'] | null = null;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private holdingConfirm = false;
  private tickAccumulator = 0;
  private unsubscribe: (() => void) | null = null;

  constructor(store: GameStore) {
    super('GameScene');
    this.bridge = new SceneBridge(store);
  }

  preload(): void {
    for (const asset of assetManifest) {
      if (asset.type === 'tilemap') this.load.tilemapTiledJSON(asset.key, asset.url);
      else if (asset.type === 'spritesheet') {
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
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribe?.();
      this.playerActor = null;
      this.xiulanActor = null;
      this.holdWarmth = null;
    });
  }

  update(_time: number, delta: number): void {
    const state = this.bridge.getSnapshot();
    const action = state.phase === 'playing' ? this.currentMovementAction() : null;
    if (!action && state.player.moving) this.bridge.send({ type: 'STOP_MOVING' });
    if (state.phase !== 'playing') return;
    this.tickAccumulator += delta / 1000;
    if (this.tickAccumulator >= 1) {
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
    this.highlightNearby(this.keys.observe.isDown);
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
    if (nearest) this.bridge.interact(nearest.definition.id);
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
    this.bridge.send(
      state.modal === modal ? { type: 'CLOSE_MODAL' } : { type: 'OPEN_MODAL', modal },
    );
  }

  private syncState(state: Readonly<GameState>): void {
    if (this.renderedChapter !== state.chapterId) this.buildChapter(state);
    if (!this.player || !this.playerActor) return;
    this.player.setPosition(state.player.x, state.player.y);
    this.player.setAlpha(state.phase === 'playing' ? 1 : 0.22);
    this.updatePlayerPose(state);
    this.updateXiulanPose(state);
    this.updateHoldWarmth(state);
    this.updateEntityVisibility(state);
  }

  private buildChapter(state: Readonly<GameState>): void {
    this.children.removeAll(true);
    this.entityViews = [];
    this.playerActor = null;
    this.xiulanActor = null;
    this.holdWarmth = null;
    this.xiulanReachStarted = false;
    const map = chapterMaps[state.chapterId];
    this.renderedChapter = state.chapterId;
    this.cameras.main.setBackgroundColor(map.palette.wall);
    this.cameras.main.setBounds(0, 0, map.width, map.height);
    this.add
      .image(map.width / 2, map.height / 2, map.backgroundKey)
      .setDisplaySize(map.width, map.height)
      .setDepth(0);

    const tiledMap = this.make.tilemap({ key: map.id });
    const tiledObjects = tiledMap.getObjectLayer('interactables')?.objects ?? [];
    for (const entity of map.entities) {
      const authored = tiledObjects.find((object) => object.name === entity.id);
      const runtimeEntity = authored
        ? { ...entity, x: authored.x ?? entity.x, y: authored.y ?? entity.y }
        : entity;
      this.entityViews.push(this.createEntity(runtimeEntity));
    }
    if (state.chapterId === 'ending') {
      const xiulan = this.entityViews.find((view) => view.definition.id === 'entity.ending.xiulan');
      if (xiulan) {
        this.holdWarmth = this.add
          .circle(xiulan.definition.x + 22, xiulan.definition.y - 43, 24, 0xd3a380, 0.7)
          .setStrokeStyle(2, 0xf3d6b8, 0.75)
          .setDepth(12)
          .setVisible(false);
      }
    }
    this.player = this.add.container(state.player.x, state.player.y);
    const shadow = this.add.ellipse(0, 9, 38, 16, 0x2f2b28, 0.25);
    this.playerActor = this.add.sprite(0, 16, 'character.xu_old.walk.down', 0).setOrigin(0.5, 1);
    this.player.add([shadow, this.playerActor]);
    this.player.setDepth(10);
    this.updatePlayerPose(state);
  }

  private createPlayerAnimations(): void {
    const directions = ['down', 'up', 'right'] as const;
    for (const direction of directions) {
      const animationKey = `character.xu_old.walk.${direction}.animation`;
      if (this.anims.exists(animationKey)) continue;
      const textureKey = `character.xu_old.walk.${direction}`;
      this.anims.create({
        key: animationKey,
        frames: this.anims.generateFrameNumbers(textureKey, { start: 0, end: 5 }),
        frameRate: 8,
        repeat: -1,
      });
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
    const direction = state.player.facing === 'left' ? 'right' : state.player.facing;
    const textureKey = `character.xu_old.walk.${direction}`;
    this.playerActor.setFlipX(state.player.facing === 'left');
    if (state.player.moving) {
      this.playerActor.play(`${textureKey}.animation`, true);
    } else {
      this.playerActor.stop();
      this.playerActor.setTexture(textureKey, 0);
    }
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

  private createEntity(entity: WorldEntity): EntityView {
    const color = entity.color ?? (entity.kind === 'exit' ? 0xeee7d8 : 0xd6c58e);
    const isXiulan = entity.id === 'entity.ending.xiulan';
    const isUmbrella = entity.id.includes('umbrella');
    const container = this.add.container(entity.x, entity.y);
    const marker = this.add
      .circle(0, 0, entity.kind === 'exit' ? 30 : 22, color, 0.88)
      .setStrokeStyle(3, 0x2f2b28, 0.7)
      .setVisible(!isXiulan && !isUmbrella);
    const actor = isXiulan
      ? this.add.sprite(0, 16, 'character.xiulan_old.reach_hand.right', 0).setOrigin(0.5, 1)
      : isUmbrella
        ? this.add.image(0, 0, 'prop.red_umbrella.closed').setDisplaySize(58, 58)
        : null;
    const glyph = this.add
      .text(0, 0, this.entityGlyph(entity), {
        color: '#2f2b28',
        fontFamily: 'serif',
        fontSize: entity.kind === 'exit' ? '24px' : '17px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setVisible(!isXiulan && !isUmbrella);
    const label = this.add
      .text(0, isXiulan ? 24 : isUmbrella ? 32 : 38, entity.label, {
        color: '#f7f3e8',
        backgroundColor: '#2f2b28cc',
        fontFamily: 'sans-serif',
        fontSize: '15px',
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0.5, 0)
      .setAlpha(0.82);
    container.add(actor ? [marker, actor, glyph, label] : [marker, glyph, label]);
    if (isXiulan) this.xiulanActor = actor as Phaser.GameObjects.Sprite;
    return { definition: entity, container, marker };
  }

  private entityGlyph(entity: WorldEntity): string {
    if (entity.id.includes('umbrella')) return '☂';
    if (entity.id.includes('stone')) return entity.id.slice(-1);
    if (entity.id.startsWith('route.'))
      return (
        { 'route.up': '↑', 'route.right': '→', 'route.down': '↓', 'route.left': '←' }[entity.id] ??
        '·'
      );
    if (entity.kind === 'exit') return '门';
    if (entity.kind === 'slot') return '◇';
    if (entity.kind === 'pickup') return '拾';
    if (entity.kind === 'puzzle') return '解';
    return '看';
  }

  private updateEntityVisibility(state: Readonly<GameState>): void {
    for (const view of this.entityViews) {
      const id = view.definition.id;
      const collected =
        (id === 'entity.home.journal' && state.inventory.includes('item.home.journal')) ||
        (id === 'entity.home.key_bowl' && state.inventory.includes('item.home.key')) ||
        (id === 'entity.home.glasses_case' && state.inventory.includes('item.home.glasses_case')) ||
        (id === 'entity.rain.ticket' && state.inventory.includes('item.rain.ticket')) ||
        (id === 'item.photo.move_1979' && state.inventory.includes('item.photo.1979')) ||
        (id === 'item.photo.osmanthus_1992' && state.inventory.includes('item.photo.1992')) ||
        (id === 'item.photo.anniversary_2001' && state.inventory.includes('item.photo.2001')) ||
        (id.startsWith('item.life.') && state.inventory.includes(id));
      const routeHidden =
        state.chapterId === 'return' && state.puzzles.returnJunction >= 3 && id !== 'route.up';
      view.container.setVisible(!collected && !routeHidden);
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

  private highlightNearby(observe: boolean): void {
    for (const view of this.entityViews) {
      if (!view.container.visible) continue;
      const distance = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        view.definition.x,
        view.definition.y,
      );
      const near = distance < (observe ? 210 : 125);
      view.marker.setScale(near ? 1.16 : 1);
      view.container.setAlpha(near ? 1 : 0.72);
    }
  }
}
