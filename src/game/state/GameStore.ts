import type { CollisionDataProvider } from '../content/collisionProvider';
import { CodeCollisionProvider } from '../content/collisionProvider';
import { chapterMaps, getCheckpointSpawn } from '../content/maps';
import { returnRouteAnswers } from '../content/returnRoute';
import { findNearestWalkablePosition, moveWithCollisions } from '../simulation/collision';
import type {
  ChapterId,
  GameCommand,
  GameState,
  MemoryIllustrationId,
  WorldDirection,
} from './GameState';
import { createInitialState, normalizeSettings } from './initialState';
import { getMapMode } from '../presentation/mapPresentation';
import { hintKeyFor, text, type TextRef } from '../../i18n';

type Listener = (state: Readonly<GameState>) => void;

const chapterConfig: Record<
  ChapterId,
  { stage: GameState['degradationStage']; checkpoint: string; objective: TextRef }
> = {
  home: {
    stage: 'D0',
    checkpoint: 'checkpoint.home.start',
    objective: text('objective.home.start'),
  },
  rain: {
    stage: 'D1',
    checkpoint: 'checkpoint.rain.start',
    objective: text('objective.rain.start'),
  },
  life: {
    stage: 'D2',
    checkpoint: 'checkpoint.life.start',
    objective: text('objective.life.start'),
  },
  return: {
    stage: 'D3',
    checkpoint: 'checkpoint.return.training',
    objective: text('objective.return.start'),
  },
  ending: {
    stage: 'D4',
    checkpoint: 'checkpoint.ending.start',
    objective: text('objective.ending.start'),
  },
};

const slotItems: Record<string, string> = {
  'slot.life.dresser': 'item.life.wood_comb',
  'slot.life.windowsill': 'item.life.enamel_cup',
  'slot.life.radio': 'item.life.cassette',
};

function includes(list: string[], value: string): boolean {
  return list.includes(value);
}

function addUnique(list: string[], value: string): void {
  if (!list.includes(value)) list.push(value);
}

const RAIN_STONE_TRIGGER_RADIUS = 48;

export class GameStore {
  private state: GameState;
  private listeners = new Set<Listener>();
  private readonly collisionProvider: CollisionDataProvider;

  constructor(
    initialState = createInitialState(),
    collisionProvider: CollisionDataProvider = new CodeCollisionProvider(),
  ) {
    this.state = structuredClone(initialState);
    this.collisionProvider = collisionProvider;
  }

  getState(): Readonly<GameState> {
    return this.state;
  }

  replaceFromSave(state: GameState): void {
    const settings = this.state.settings;
    this.state = structuredClone(state);
    this.state.settings = settings;
    this.recoverPlayerFromCollision();
    this.emit();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  dispatch(command: GameCommand): void {
    switch (command.type) {
      case 'NEW_GAME': {
        const settings = this.state.settings;
        this.state = createInitialState(command.mode);
        this.state.settings = settings;
        this.state.phase = 'playing';
        this.state.dialogue = [
          text('dialogue.opening.question'),
          text('dialogue.opening.controls'),
        ];
        break;
      }
      case 'CONTINUE_GAME':
        this.state.phase = 'playing';
        break;
      case 'MOVE':
        this.move(command.direction, command.deltaSeconds);
        break;
      case 'STOP_MOVING':
        this.state.player.moving = false;
        break;
      case 'INTERACT':
        this.interact(command.entityId);
        break;
      case 'ADVANCE_DIALOGUE':
        this.advanceDialogue();
        break;
      case 'OPEN_MODAL':
        if (command.modal === 'map' && getMapMode(this.state) === 'hidden') break;
        this.state.modal = command.modal;
        if (this.state.chapterId === 'rain' && command.modal === 'map') {
          addUnique(this.state.flags, 'flag.rain.map_opened');
        }
        break;
      case 'CLOSE_MODAL': {
        const closingMap = this.state.chapterId === 'rain' && this.state.modal === 'map';
        this.state.modal = null;
        this.state.holdProgress = 0;
        if (closingMap) {
          addUnique(this.state.flags, 'flag.rain.map_closed');
          this.state.rainMapClosedAtX = this.state.player.x;
        }
        break;
      }
      case 'SETTINGS':
        this.state.settings = normalizeSettings({
          ...this.state.settings,
          ...command.patch,
          audioVolumes: {
            ...this.state.settings.audioVolumes,
            ...command.patch.audioVolumes,
          },
        });
        break;
      case 'SET_MODE':
        this.state.mode = command.mode;
        break;
      case 'PHOTO_ORDER':
        this.state.puzzles.photoOrder = [...command.order];
        if (command.order.join('|') === 'photo.1979|photo.1992|photo.2001') {
          addUnique(this.state.flags, 'puzzle.life.photo_order.completed');
          this.state.checkpointId = 'checkpoint.life.photos';
          this.state.message = text('message.photo.order.done');
          this.state.modal = null;
          this.resetHintTimer();
          this.updateLifeObjective();
        } else {
          this.state.message = text('message.photo.order.wrong');
        }
        break;
      case 'ACKNOWLEDGE_D3':
        addUnique(this.state.flags, 'flag.return.mapping_learned');
        this.state.message =
          this.state.mode === 'standard' ? text('message.d3.standard') : text('message.d3.low');
        break;
      case 'HOLD':
        this.updateHold(command.deltaSeconds);
        break;
      case 'TICK':
        this.tick(command.deltaSeconds);
        break;
      case 'CANCEL_HOLD':
        this.state.holdProgress = 0;
        break;
      case 'RETURN_TITLE':
        this.state.phase = 'title';
        this.state.modal = null;
        this.state.dialogue = [];
        this.state.activeMemoryId = null;
        break;
      case 'DEBUG_JUMP_CHAPTER':
        this.state.phase = 'playing';
        this.enterChapter(command.chapterId);
        break;
      case 'DEBUG_SHOW_MEMORY':
        this.state.phase = 'playing';
        if (command.memoryId === 'rain') {
          this.enterChapter('rain');
          this.state.dialogue = [];
          this.state.puzzles.stationSequence = [2, 4, 5];
          this.state.puzzles.rainSigns = [
            'entity.rain.umbrella_sign_a',
            'entity.rain.umbrella_sign_b',
          ];
          this.interactRain('entity.rain.red_umbrella');
        } else if (command.memoryId === 'life.move') {
          this.enterChapter('life');
          this.state.dialogue = [];
          addUnique(this.state.flags, 'puzzle.life.photo_order.completed');
          addUnique(this.state.inventory, 'item.life.wood_comb');
          this.interactLife('slot.life.dresser');
        } else if (command.memoryId === 'life.osmanthus') {
          this.enterChapter('life');
          this.state.dialogue = [];
          addUnique(this.state.flags, 'puzzle.life.photo_order.completed');
          addUnique(this.state.inventory, 'item.life.enamel_cup');
          this.interactLife('slot.life.windowsill');
        } else if (command.memoryId === 'life.cassette') {
          this.enterChapter('life');
          this.state.dialogue = [];
          addUnique(this.state.flags, 'puzzle.life.photo_order.completed');
          addUnique(this.state.inventory, 'item.life.cassette');
          this.interactLife('slot.life.radio');
        } else {
          this.enterChapter('ending');
          this.state.dialogue = [];
          this.interactEnding('entity.ending.xiulan');
          while (this.state.dialogue.length > 0) this.advanceDialogue();
          this.updateHold(1.5);
        }
        break;
      case 'CLEAR_MESSAGE':
        this.state.message = null;
        break;
    }
    this.applyPendingTransition();
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.state);
  }

  private recoverPlayerFromCollision(): void {
    const collisionData = this.collisionProvider.getCollisionData(this.state.chapterId);
    const recovered = findNearestWalkablePosition(
      this.state.player,
      collisionData.walkBounds,
      collisionData.obstacles,
    );
    if (!recovered) return;
    this.state.player.x = recovered.x;
    this.state.player.y = recovered.y;
    this.state.player.moving = false;
  }

  private move(direction: WorldDirection, deltaSeconds: number): void {
    if (
      this.state.phase !== 'playing' ||
      this.state.modal ||
      this.state.dialogue.length > 0 ||
      this.state.mapWashSeconds > 0 ||
      (this.state.chapterId === 'return' &&
        !includes(this.state.flags, 'flag.return.mapping_learned'))
    ) {
      this.state.player.moving = false;
      return;
    }
    const speed = 180 * Math.min(deltaSeconds, 0.05);
    const previousPosition = { x: this.state.player.x, y: this.state.player.y };
    const delta: Record<WorldDirection, [number, number]> = {
      up: [0, -speed],
      down: [0, speed],
      left: [-speed, 0],
      right: [speed, 0],
    };
    const [dx, dy] = delta[direction];
    const collisionData = this.collisionProvider.getCollisionData(this.state.chapterId);
    const next = moveWithCollisions(
      this.state.player,
      { x: dx, y: dy },
      collisionData.walkBounds,
      collisionData.obstacles,
    );
    this.state.player.x = next.x;
    this.state.player.y = next.y;
    this.state.player.facing = direction;
    this.state.player.moving = true;
    if (
      this.state.chapterId === 'rain' &&
      includes(this.state.flags, 'flag.rain.map_closed') &&
      !includes(this.state.flags, 'degradation.d1.started') &&
      direction === 'right' &&
      this.state.rainMapClosedAtX !== null &&
      this.state.player.x - this.state.rainMapClosedAtX > 128
    ) {
      addUnique(this.state.flags, 'degradation.d1.started');
      this.state.message = text('system.degradation.d1');
      this.state.mapWashSeconds = 1.2;
      this.state.rainMapClosedAtX = null;
      this.state.player.moving = false;
    }
    this.triggerRainStoneOnEntry(previousPosition);
  }

  private triggerRainStoneOnEntry(previousPosition: { x: number; y: number }): void {
    if (
      this.state.chapterId !== 'rain' ||
      this.state.puzzles.stationSequence.length >= 3 ||
      this.state.mapWashSeconds > 0
    ) {
      return;
    }

    const entered = chapterMaps.rain.entities.find((entity) => {
      if (entity.kind !== 'puzzle' || !entity.id.includes('stone_')) return false;
      const wasOutside =
        Math.hypot(previousPosition.x - entity.x, previousPosition.y - entity.y) >
        RAIN_STONE_TRIGGER_RADIUS;
      const isInside =
        Math.hypot(this.state.player.x - entity.x, this.state.player.y - entity.y) <=
        RAIN_STONE_TRIGGER_RADIUS;
      return wasOutside && isInside;
    });
    if (!entered) return;

    const sequenceBefore = this.state.puzzles.stationSequence.length;
    this.interactRain(entered.id);
    if (this.state.puzzles.stationSequence.length !== sequenceBefore) this.resetHintTimer();
  }

  private setDialogue(lines: TextRef[], activeMemoryId: MemoryIllustrationId | null = null): void {
    this.state.dialogue = lines;
    this.state.dialogueIndex = 0;
    this.state.activeMemoryId = activeMemoryId;
  }

  private advanceDialogue(): void {
    if (this.state.dialogue.length === 0) return;
    if (this.state.dialogueIndex < this.state.dialogue.length - 1) {
      this.state.dialogueIndex += 1;
    } else {
      this.state.dialogue = [];
      this.state.dialogueIndex = 0;
      this.state.activeMemoryId = null;
      if (includes(this.state.flags, 'transition.to.guide')) {
        this.state.phase = 'guide';
        this.state.flags = this.state.flags.filter((flag) => flag !== 'transition.to.guide');
      } else if (includes(this.state.flags, 'ending.dialogue_started')) {
        addUnique(this.state.flags, 'ending.ready_to_hold');
        this.state.message =
          this.state.settings.holdMode === 'hold'
            ? text('message.hold.long')
            : text('message.hold.short');
      }
    }
  }

  private interact(entityId: string): void {
    if (this.state.dialogue.length > 0 || this.state.modal) return;
    const progressBefore = this.progressSignature();
    switch (this.state.chapterId) {
      case 'home':
        this.interactHome(entityId);
        break;
      case 'rain':
        this.interactRain(entityId);
        break;
      case 'life':
        this.interactLife(entityId);
        break;
      case 'return':
        this.interactReturn(entityId);
        break;
      case 'ending':
        this.interactEnding(entityId);
        break;
    }
    if (this.progressSignature() !== progressBefore) this.resetHintTimer();
  }

  private progressSignature(): string {
    return JSON.stringify({
      checkpoint: this.state.checkpointId,
      inventory: this.state.inventory,
      journal: this.state.journalPages,
      memories: this.state.memories,
      puzzles: this.state.puzzles,
      flags: this.state.flags,
    });
  }

  private resetHintTimer(): void {
    this.state.hintSeconds = 0;
  }

  private tick(deltaSeconds: number): void {
    if (this.state.phase !== 'playing' || this.state.modal || this.state.dialogue.length > 0)
      return;
    if (this.state.mapWashSeconds > 0) {
      this.state.mapWashSeconds = Math.max(0, this.state.mapWashSeconds - deltaSeconds);
      this.state.player.moving = false;
    }
    this.state.playTimeSeconds += deltaSeconds;
    if (this.state.chapterId === 'ending') return;
    this.state.hintSeconds += deltaSeconds;
    const nextLevel =
      this.state.hintSeconds >= 210
        ? 3
        : this.state.hintSeconds >= 150
          ? 2
          : this.state.hintSeconds >= 90
            ? 1
            : 0;
    if (nextLevel <= this.state.hintLevel) return;
    this.state.hintLevel = nextLevel as 1 | 2 | 3;
    this.state.message = text(hintKeyFor(this.state.chapterId, nextLevel as 1 | 2 | 3));
  }

  private interactHome(entityId: string): void {
    if (entityId === 'entity.home.bedside_photo') {
      this.setDialogue([text('dialogue.home.photo.1'), text('dialogue.home.photo.2')]);
    } else if (entityId === 'entity.home.journal') {
      addUnique(this.state.inventory, 'item.home.journal');
      addUnique(this.state.journalPages, 'journal.home.key');
      this.state.checkpointId = 'checkpoint.home.journal';
      this.setDialogue([text('dialogue.home.journal.1'), text('dialogue.home.journal.2')]);
    } else if (entityId === 'entity.home.key_bowl') {
      addUnique(this.state.inventory, 'item.home.key');
      this.state.checkpointId = 'checkpoint.home.key';
      this.state.message = text('message.home.key_found');
    } else if (entityId === 'entity.home.glasses_case') {
      addUnique(this.state.inventory, 'item.home.glasses_case');
      this.state.message = text('message.home.glasses');
    } else if (entityId === 'entity.home.front_door') {
      if (!includes(this.state.inventory, 'item.home.key')) {
        this.state.message = text('message.home.key_hint');
      } else if (!includes(this.state.inventory, 'item.home.journal')) {
        this.state.message = text('message.home.journal_hint');
      } else {
        this.setDialogue([text('dialogue.home.door.1'), text('dialogue.home.door.2')]);
        addUnique(this.state.flags, 'transition.to.rain');
      }
    }
  }

  private interactRain(entityId: string): void {
    if (entityId === 'entity.rain.ticket') {
      if (includes(this.state.inventory, 'item.rain.ticket')) return;
      addUnique(this.state.inventory, 'item.rain.ticket');
      addUnique(this.state.journalPages, 'journal.rain.route');
      this.setDialogue([text('inspect.rain.ticket'), text('system.item_pickup.old_ticket')]);
      return;
    }
    const stone = Number(entityId.match(/stone_(\d)/)?.[1]);
    if (stone) {
      if (this.state.puzzles.stationSequence.length >= 3) return;
      const expected = [2, 4, 5][this.state.puzzles.stationSequence.length];
      if (stone === expected) {
        this.state.puzzles.stationSequence.push(stone);
        this.state.message = text('system.rain.sequence_progress');
        if (this.state.puzzles.stationSequence.length === 3) {
          this.state.checkpointId = 'checkpoint.rain.sequence';
          this.state.message = text('message.rain.stone_done');
        }
      } else {
        this.state.message = text('system.rain.sequence_soft_miss');
      }
      return;
    }
    if (entityId.includes('umbrella_sign_')) {
      const order = ['entity.rain.umbrella_sign_a', 'entity.rain.umbrella_sign_b'];
      const expected = order[this.state.puzzles.rainSigns.length];
      if (entityId === expected) {
        this.state.puzzles.rainSigns.push(entityId);
        this.state.message = entityId.endsWith('_a')
          ? text('inspect.rain.umbrella_sign_a')
          : text('inspect.rain.umbrella_sign_b');
      } else if (!includes(this.state.puzzles.rainSigns, entityId)) {
        this.state.message = text('message.rain.sign_wrong');
      }
      return;
    }
    if (entityId === 'entity.rain.red_umbrella') {
      if (includes(this.state.memories, 'memory.rain.umbrella')) return;
      if (
        this.state.puzzles.stationSequence.length < 3 ||
        this.state.puzzles.rainSigns.length < 2
      ) {
        this.state.message = text('message.rain.umbrella_hint');
        return;
      }
      this.startRainMemory();
    }
  }

  private startRainMemory(): void {
    this.state.activeMemoryId = 'rain';
    addUnique(this.state.memories, 'memory.rain.umbrella');
    this.state.checkpointId = 'checkpoint.rain.complete';
    this.setDialogue(
      [
        text('dialogue.rain.1'),
        text('dialogue.rain.2'),
        text('dialogue.rain.3'),
        text('dialogue.rain.4'),
        text('dialogue.rain.5'),
        text('narration.rain.memory_end'),
      ],
      'rain',
    );
    addUnique(this.state.flags, 'transition.to.life');
  }

  private interactLife(entityId: string): void {
    const photoMap: Record<string, string> = {
      'item.photo.move_1979': 'item.photo.1979',
      'item.photo.osmanthus_1992': 'item.photo.1992',
      'item.photo.anniversary_2001': 'item.photo.2001',
    };
    if (photoMap[entityId]) {
      addUnique(this.state.inventory, photoMap[entityId]);
      this.state.message = text('message.life.photo_found', {
        year: photoMap[entityId].slice(-4),
      });
      return;
    }
    if (entityId.startsWith('item.life.')) {
      addUnique(this.state.inventory, entityId);
      this.state.message =
        entityId === 'item.life.wood_comb'
          ? text('message.life.comb')
          : entityId === 'item.life.enamel_cup'
            ? text('message.life.cup')
            : text('message.life.cassette');
      return;
    }
    if (entityId === 'entity.life.album') {
      const photos = ['item.photo.1979', 'item.photo.1992', 'item.photo.2001'];
      if (!photos.every((photo) => includes(this.state.inventory, photo))) {
        this.state.message = text('message.life.album_missing');
      } else {
        this.state.modal = 'photo_order';
      }
      return;
    }
    if (slotItems[entityId]) {
      const item = slotItems[entityId];
      if (!includes(this.state.inventory, item)) {
        this.state.message = text('message.life.slot_missing');
      } else if (!includes(this.state.flags, 'puzzle.life.photo_order.completed')) {
        this.state.message = text('message.life.photo_order_first');
      } else {
        addUnique(this.state.puzzles.placedObjects, item);
        const memory =
          item === 'item.life.wood_comb'
            ? text('dialogue.life.move')
            : item === 'item.life.enamel_cup'
              ? text('dialogue.life.osmanthus')
              : text('dialogue.life.cassette');
        this.setDialogue(
          [memory],
          item === 'item.life.wood_comb'
            ? 'life.move'
            : item === 'item.life.enamel_cup'
              ? 'life.osmanthus'
              : 'life.cassette',
        );
        this.updateLifeObjective();
      }
      return;
    }
    if (entityId === 'entity.life.exit') {
      if (!this.lifeCompleted()) {
        this.state.message = text('message.life.not_complete');
      } else {
        addUnique(this.state.memories, 'memory.life.ordinary_days');
        addUnique(this.state.journalPages, 'journal.life.ordinary_days');
        this.state.checkpointId = 'checkpoint.life.complete';
        this.setDialogue([text('dialogue.life.complete.1'), text('dialogue.life.complete.2')]);
        addUnique(this.state.flags, 'transition.to.return');
      }
    }
  }

  private updateLifeObjective(): void {
    const photosDone = includes(this.state.flags, 'puzzle.life.photo_order.completed');
    this.state.objective = photosDone
      ? text('objective.life.objects', { count: this.state.puzzles.placedObjects.length })
      : text('objective.life.photos');
    if (this.lifeCompleted()) {
      this.state.objective = text('objective.life.corridor');
      this.state.checkpointId = 'checkpoint.life.complete';
    }
  }

  private lifeCompleted(): boolean {
    return (
      includes(this.state.flags, 'puzzle.life.photo_order.completed') &&
      this.state.puzzles.placedObjects.length === 3
    );
  }

  private interactReturn(entityId: string): void {
    if (!includes(this.state.flags, 'flag.return.mapping_learned')) return;
    const direction = entityId.replace('route.', '') as WorldDirection;
    if (!['up', 'down', 'left', 'right'].includes(direction)) return;
    if (this.state.puzzles.returnJunction >= returnRouteAnswers.length) {
      if (direction === 'up') this.enterChapter('ending');
      else this.state.message = text('message.return.humming_above');
      return;
    }
    const answer = returnRouteAnswers[this.state.puzzles.returnJunction];
    const expected = answer[this.state.puzzles.returnPrefix.length];
    if (direction === expected) {
      this.state.puzzles.returnPrefix.push(direction);
      if (this.state.puzzles.returnPrefix.length === answer.length) {
        this.state.puzzles.returnJunction += 1;
        this.state.puzzles.returnPrefix = [];
        this.state.puzzles.routeLoops = 0;
        this.state.checkpointId = `checkpoint.return.junction_${this.state.puzzles.returnJunction}`;
        this.state.player = { x: 640, y: 360, facing: 'up', moving: false };
        this.state.message =
          this.state.puzzles.returnJunction === 3
            ? text('message.return.door_appeared')
            : text('message.return.junction', {
                junction: this.state.puzzles.returnJunction,
              });
        if (this.state.puzzles.returnJunction === 3) {
          addUnique(this.state.journalPages, 'journal.return.last_page');
          this.state.objective = text('objective.return.door');
        }
      } else {
        this.state.player = { x: 640, y: 360, facing: direction, moving: false };
        this.state.message = text('message.return.step_right');
      }
    } else {
      this.state.puzzles.routeLoops += 1;
      this.state.player = { x: 640, y: 360, facing: 'up', moving: false };
      this.state.message =
        this.state.puzzles.routeLoops === 1
          ? text('message.return.loop_one')
          : this.state.puzzles.routeLoops === 2
            ? text('message.return.loop_two')
            : text('message.return.loop_three');
    }
  }

  private interactEnding(entityId: string): void {
    if (
      entityId !== 'entity.ending.xiulan' ||
      includes(this.state.flags, 'ending.dialogue_started')
    )
      return;
    addUnique(this.state.flags, 'ending.dialogue_started');
    this.setDialogue([
      text('dialogue.ending.1'),
      text('dialogue.ending.2'),
      text('dialogue.ending.3'),
      text('dialogue.ending.4'),
    ]);
  }

  private updateHold(deltaSeconds: number): void {
    if (!includes(this.state.flags, 'ending.ready_to_hold')) return;
    const required =
      this.state.settings.holdMode === 'hold'
        ? 1.5
        : this.state.settings.holdMode === 'short'
          ? 0.6
          : 0;
    this.state.holdProgress =
      required === 0 ? 1 : Math.min(1, this.state.holdProgress + deltaSeconds / required);
    if (this.state.holdProgress >= 1) {
      addUnique(this.state.flags, 'ending.completed');
      addUnique(this.state.flags, 'transition.to.guide');
      this.setDialogue(
        [
          text('dialogue.ending.hand.1'),
          text('dialogue.ending.hand.2'),
          text('dialogue.ending.hand.3'),
        ],
        'ending.hand',
      );
      this.state.checkpointId = 'checkpoint.ending.complete';
    }
  }

  private enterChapter(chapterId: ChapterId): void {
    const config = chapterConfig[chapterId];
    const map = chapterMaps[chapterId];
    this.state.chapterId = chapterId;
    this.state.degradationStage = config.stage;
    this.state.checkpointId = config.checkpoint;
    this.state.objective = config.objective;
    this.state.player =
      getCheckpointSpawn(config.checkpoint, chapterId) ??
      ({ ...map.spawn, facing: 'down', moving: false } satisfies GameState['player']);
    this.state.modal = null;
    this.state.message = null;
    this.state.activeMemoryId = null;
    this.state.mapWashSeconds = 0;
    this.state.rainMapClosedAtX = null;
    this.state.hintSeconds = 0;
    this.state.hintLevel = 0;
    if (chapterId === 'rain') {
      this.setDialogue([text('dialogue.rain.arrival'), text('dialogue.rain.arrival.question')]);
    } else if (chapterId === 'life') {
      this.setDialogue([text('dialogue.chapter.life.1'), text('dialogue.chapter.life.2')]);
    } else if (chapterId === 'return') {
      this.setDialogue([text('dialogue.chapter.return.1'), text('dialogue.chapter.return.2')]);
    } else if (chapterId === 'ending') {
      this.setDialogue([text('dialogue.chapter.ending.1')]);
    }
  }

  private applyPendingTransition(): void {
    const transitions: [string, ChapterId][] = [
      ['transition.to.rain', 'rain'],
      ['transition.to.life', 'life'],
      ['transition.to.return', 'return'],
    ];
    if (this.state.dialogue.length > 0) return;
    const transition = transitions.find(([flag]) => includes(this.state.flags, flag));
    if (!transition) return;
    this.state.flags = this.state.flags.filter((flag) => flag !== transition[0]);
    this.enterChapter(transition[1]);
  }
}
