import { chapterMaps } from '../content/maps';
import type {
  ChapterId,
  GameCommand,
  GameState,
  MemoryIllustrationId,
  WorldDirection,
} from './GameState';
import { createInitialState } from './initialState';

type Listener = (state: Readonly<GameState>) => void;

const chapterConfig: Record<
  ChapterId,
  { stage: GameState['degradationStage']; checkpoint: string; objective: string }
> = {
  home: { stage: 'D0', checkpoint: 'checkpoint.home.start', objective: '找到钥匙和秀兰留下的日记' },
  rain: {
    stage: 'D1',
    checkpoint: 'checkpoint.rain.start',
    objective: '按 2 → 4 → 5 踩亮石板，再跟随红伞',
  },
  life: {
    stage: 'D2',
    checkpoint: 'checkpoint.life.start',
    objective: '整理照片，并让三件生活物品回到原处',
  },
  return: {
    stage: 'D3',
    checkpoint: 'checkpoint.return.training',
    objective: '理解新的方向，沿着仍可靠的线索回家',
  },
  ending: { stage: 'D4', checkpoint: 'checkpoint.ending.start', objective: '走近秀兰' },
};

const routeAnswers: WorldDirection[][] = [
  ['right', 'up'],
  ['down', 'right'],
  ['up', 'left', 'up'],
];

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

export class GameStore {
  private state: GameState;
  private listeners = new Set<Listener>();

  constructor(initialState = createInitialState()) {
    this.state = structuredClone(initialState);
  }

  getState(): Readonly<GameState> {
    return this.state;
  }

  replaceFromSave(state: GameState): void {
    this.state = structuredClone(state);
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
          '钥匙……今天要出门吗？',
          '使用 WASD 或方向键移动，靠近物件后按 E 交互。',
        ];
        break;
      }
      case 'CONTINUE_GAME':
        this.state.phase = 'playing';
        break;
      case 'MOVE':
        this.move(command.direction, command.deltaSeconds);
        break;
      case 'INTERACT':
        this.interact(command.entityId);
        break;
      case 'ADVANCE_DIALOGUE':
        this.advanceDialogue();
        break;
      case 'OPEN_MODAL':
        this.state.modal = command.modal;
        break;
      case 'CLOSE_MODAL':
        this.state.modal = null;
        this.state.holdProgress = 0;
        break;
      case 'SETTINGS':
        this.state.settings = { ...this.state.settings, ...command.patch };
        break;
      case 'SET_MODE':
        this.state.mode = command.mode;
        break;
      case 'PHOTO_ORDER':
        this.state.puzzles.photoOrder = [...command.order];
        if (command.order.join('|') === 'photo.1979|photo.1992|photo.2001') {
          addUnique(this.state.flags, 'puzzle.life.photo_order.completed');
          this.state.checkpointId = 'checkpoint.life.photos';
          this.state.message = '三个年份安静地排在了一起。';
          this.state.modal = null;
          this.resetHintTimer();
          this.updateLifeObjective();
        } else {
          this.state.message = '这个顺序似乎接不上。其他照片没有移动。';
        }
        break;
      case 'ACKNOWLEDGE_D3':
        addUnique(this.state.flags, 'flag.return.mapping_learned');
        this.state.message =
          this.state.mode === 'standard'
            ? '方向变了。地上的箭头还在。'
            : '提示变得不可靠。地上的箭头还在。';
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
        } else {
          this.enterChapter('life');
          this.state.dialogue = [];
          addUnique(this.state.flags, 'puzzle.life.photo_order.completed');
          addUnique(this.state.inventory, 'item.life.cassette');
          this.interactLife('slot.life.radio');
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

  private move(direction: WorldDirection, deltaSeconds: number): void {
    if (
      this.state.phase !== 'playing' ||
      this.state.modal ||
      this.state.dialogue.length > 0 ||
      (this.state.chapterId === 'return' &&
        !includes(this.state.flags, 'flag.return.mapping_learned'))
    ) {
      this.state.player.moving = false;
      return;
    }
    const speed = 180 * Math.min(deltaSeconds, 0.05);
    const delta: Record<WorldDirection, [number, number]> = {
      up: [0, -speed],
      down: [0, speed],
      left: [-speed, 0],
      right: [speed, 0],
    };
    const [dx, dy] = delta[direction];
    const map = chapterMaps[this.state.chapterId];
    this.state.player.x = Math.max(55, Math.min(map.width - 55, this.state.player.x + dx));
    this.state.player.y = Math.max(75, Math.min(map.height - 45, this.state.player.y + dy));
    this.state.player.facing = direction;
    this.state.player.moving = true;
  }

  private setDialogue(lines: string[], activeMemoryId: MemoryIllustrationId | null = null): void {
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
            ? '按住确认键，握住她的手'
            : '按确认键，握住她的手';
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
    const hints: Record<ChapterId, string[]> = {
      home: [
        '玄关的蓝色小碗反射了一点晨光。',
        '日记里的红线书签轻轻露出桌沿。',
        '从客厅到玄关，地上浮出一串很淡的脚印。',
      ],
      rain: [
        '旧车票边缘发亮：2 → 4 → 5。',
        '下一块石板的圆点在积水里映了一下。',
        '红伞与钟声方向之间，水面连续泛起波纹。',
      ],
      life: [
        '照片空位显出年代轮廓。',
        '条纹、圆点和波纹在相应位置轻轻回应。',
        '正确位置出现了物件的剪影。',
      ],
      return: [
        '当前红伞标记更亮了一点。',
        '正确世界方向出现一对淡脚印。',
        '先朝伞柄指向的方向走。按键和脚步的关系已经转过一圈。',
      ],
      ending: ['', '', ''],
    };
    this.state.message = hints[this.state.chapterId][nextLevel - 1];
  }

  private interactHome(entityId: string): void {
    if (entityId === 'entity.home.bedside_photo') {
      this.setDialogue(['照片里，我们站在一把红伞下面。', '伞面太小，两个人的肩膀都湿了一半。']);
    } else if (entityId === 'entity.home.journal') {
      addUnique(this.state.inventory, 'item.home.journal');
      addUnique(this.state.journalPages, 'journal.home.key');
      this.state.checkpointId = 'checkpoint.home.journal';
      this.setDialogue([
        '六月二十二日，晴转雨。',
        '钥匙还在玄关的蓝色小碗里。别急，我去买面，很快回来。——秀兰',
      ]);
    } else if (entityId === 'entity.home.key_bowl') {
      addUnique(this.state.inventory, 'item.home.key');
      this.state.checkpointId = 'checkpoint.home.key';
      this.state.message = '取得：家门钥匙';
    } else if (entityId === 'entity.home.glasses_case') {
      addUnique(this.state.inventory, 'item.home.glasses_case');
      this.state.message = '眼镜盒是空的。边角贴着一小块红胶布。';
    } else if (entityId === 'entity.home.front_door') {
      if (!includes(this.state.inventory, 'item.home.key')) {
        this.state.message = '钥匙也许还在玄关的小碗里。';
      } else if (!includes(this.state.inventory, 'item.home.journal')) {
        this.state.message = '桌边的日记也许会有帮助。';
      } else {
        this.setDialogue(['钥匙插入门锁。远处响起雷声。', '这场雨……我见过。']);
        addUnique(this.state.flags, 'transition.to.rain');
      }
    }
  }

  private interactRain(entityId: string): void {
    if (entityId === 'entity.rain.ticket') {
      addUnique(this.state.inventory, 'item.rain.ticket');
      addUnique(this.state.journalPages, 'journal.rain.route');
      this.state.message = '旧车票背面写着：2 → 4 → 5';
      return;
    }
    const stone = Number(entityId.match(/stone_(\d)/)?.[1]);
    if (stone) {
      const expected = [2, 4, 5][this.state.puzzles.stationSequence.length];
      if (stone === expected) {
        this.state.puzzles.stationSequence.push(stone);
        this.state.message = '石板在雨里亮了一下。';
        if (this.state.puzzles.stationSequence.length === 3) {
          this.state.checkpointId = 'checkpoint.rain.sequence';
          this.state.message = '三块石板亮起。雨幕深处，一把红伞变得清晰。';
        }
      } else {
        this.state.message = '这块石板没有回应。已经亮起的还在。';
      }
      return;
    }
    if (entityId.includes('umbrella_sign_')) {
      const order = ['entity.rain.umbrella_sign_a', 'entity.rain.umbrella_sign_b'];
      const expected = order[this.state.puzzles.rainSigns.length];
      if (entityId === expected) {
        this.state.puzzles.rainSigns.push(entityId);
        this.state.message = entityId.endsWith('_a') ? '伞柄朝向小巷。' : '只有这个颜色没有散开。';
      } else if (!includes(this.state.puzzles.rainSigns, entityId)) {
        this.state.message = '钟声让积水朝更近的一把红伞发颤。';
      }
      return;
    }
    if (entityId === 'entity.rain.red_umbrella') {
      if (
        this.state.puzzles.stationSequence.length < 3 ||
        this.state.puzzles.rainSigns.length < 2
      ) {
        this.state.message = '雨太密了。旧车票、石板和路边的伞会带我过去。';
        return;
      }
      addUnique(this.state.memories, 'memory.rain.umbrella');
      this.state.checkpointId = 'checkpoint.rain.complete';
      this.setDialogue(
        [
          '年轻的林秀兰：“你要去车站吗？”',
          '“那一起走吧。伞往你那边一点，别淋着。”',
          '我不记得车开去了哪里，只记得她的半边肩膀湿了。',
        ],
        'rain',
      );
      addUnique(this.state.flags, 'transition.to.life');
    }
  }

  private interactLife(entityId: string): void {
    const photoMap: Record<string, string> = {
      'item.photo.move_1979': 'item.photo.1979',
      'item.photo.osmanthus_1992': 'item.photo.1992',
      'item.photo.anniversary_2001': 'item.photo.2001',
    };
    if (photoMap[entityId]) {
      addUnique(this.state.inventory, photoMap[entityId]);
      this.state.message = `取得照片：${photoMap[entityId].slice(-4)}`;
      return;
    }
    if (entityId.startsWith('item.life.')) {
      addUnique(this.state.inventory, entityId);
      this.state.message =
        entityId === 'item.life.wood_comb'
          ? '木＿：齿很密，握柄有一道修过的裂缝。'
          : entityId === 'item.life.enamel_cup'
            ? '＿瓷＿：一圈桂花，底部磨出了银色。'
            : '〰 〰 〰：双线圈里藏着熟悉的旋律。';
      return;
    }
    if (entityId === 'entity.life.album') {
      const photos = ['item.photo.1979', 'item.photo.1992', 'item.photo.2001'];
      if (!photos.every((photo) => includes(this.state.inventory, photo))) {
        this.state.message = '相册空着三格。散落在房间里的照片还没有找齐。';
      } else {
        this.state.modal = 'photo_order';
      }
      return;
    }
    if (slotItems[entityId]) {
      const item = slotItems[entityId];
      if (!includes(this.state.inventory, item)) {
        this.state.message = '这个位置留下了熟悉的纹理，但对应的物件还没找到。';
      } else if (!includes(this.state.flags, 'puzzle.life.photo_order.completed')) {
        this.state.message = '也许先把照片的年份排好，会看得更清楚。';
      } else {
        addUnique(this.state.puzzles.placedObjects, item);
        const memory =
          item === 'item.life.wood_comb'
            ? '一起拆纸箱，床还没装好，两个人先坐在箱子上笑。'
            : item === 'item.life.enamel_cup'
              ? '桂花第一次开。她说，明年也一起闻。'
              : '停电的纪念日里，录音带的声音还在。';
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
        this.state.message = '房间还没有收束。照片和三件物品都在等自己的位置。';
      } else {
        addUnique(this.state.memories, 'memory.life.ordinary_days');
        addUnique(this.state.journalPages, 'journal.life.ordinary_days');
        this.state.checkpointId = 'checkpoint.life.complete';
        this.setDialogue([
          '不是照片替我们记住了一生。',
          '是这些做过很多次、当时并不觉得特别的小事。',
        ]);
        addUnique(this.state.flags, 'transition.to.return');
      }
    }
  }

  private updateLifeObjective(): void {
    const photosDone = includes(this.state.flags, 'puzzle.life.photo_order.completed');
    this.state.objective = photosDone
      ? `让生活物品回到原处（${this.state.puzzles.placedObjects.length}/3）`
      : '找齐三张照片，在相册中按时间排序';
    if (this.lifeCompleted()) {
      this.state.objective = '走进房间上方延长的走廊';
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
    if (this.state.puzzles.returnJunction >= routeAnswers.length) {
      if (direction === 'up') this.enterChapter('ending');
      else this.state.message = '门后有人在哼歌。它就在上方。';
      return;
    }
    const answer = routeAnswers[this.state.puzzles.returnJunction];
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
            ? '门后有人在哼歌。向上的家门已经出现。'
            : `走过路口 ${this.state.puzzles.returnJunction}。熟悉的空间重新落在脚下。`;
        if (this.state.puzzles.returnJunction === 3) {
          addUnique(this.state.journalPages, 'journal.return.last_page');
          this.state.objective = '与上方的家门交互';
        }
      } else {
        this.state.player = { x: 640, y: 360, facing: direction, moving: false };
        this.state.message = '这一步和仍留下的线索对上了。';
      }
    } else {
      this.state.puzzles.routeLoops += 1;
      this.state.player = { x: 640, y: 360, facing: 'up', moving: false };
      this.state.message =
        this.state.puzzles.routeLoops === 1
          ? '我好像又回来了。红伞还在前面。'
          : this.state.puzzles.routeLoops === 2
            ? '地上有一对浅浅的脚印。有人走过，也有人在等我。'
            : '先朝伞柄指向的方向走。按键和脚步的关系已经转过一圈。';
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
      '林秀兰：“我回来了。”',
      '许志远：“我……你是……”',
      '林秀兰：“我是秀兰。别急，我回来了。”',
      '她把手停在那里，没有催我。',
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
      this.setDialogue([
        '许志远主动握住她的手：“手是暖的。”',
        '林秀兰：“面也还是热的。”',
        '有些名字会远去，爱曾经来过的地方还留着温度。',
      ]);
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
    this.state.player = { ...map.spawn, facing: 'down', moving: false };
    this.state.modal = null;
    this.state.message = null;
    this.state.activeMemoryId = null;
    this.state.hintSeconds = 0;
    this.state.hintLevel = 0;
    if (chapterId === 'rain') {
      this.setDialogue(['现实的门锁声变成车站广播的底噪。', '这是哪一站？']);
    } else if (chapterId === 'life') {
      this.setDialogue(['这个家……怎么有三扇一样的窗？', '名字有些远。样子和触感还在。']);
    } else if (chapterId === 'return') {
      this.setDialogue(['路怎么转了？', '先看看地上的箭头。这里不会催你。']);
    } else if (chapterId === 'ending') {
      this.setDialogue(['门打开了。熟悉的清晨重新落回房间。']);
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
