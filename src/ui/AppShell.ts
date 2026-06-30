import { chapterMaps, itemLabels } from '../game/content/maps';
import { nearestAvailableEntity } from '../game/content/entitySelectors';
import { assetUrl } from '../game/assets/manifest';
import { normalizeSettings } from '../game/state/initialState';
import { isBreathingActive } from '../game/presentation/breathing';
import type {
  AccessibilitySettings,
  GameMode,
  GameState,
  MemoryIllustrationId,
  ModalId,
} from '../game/state/GameState';
import type { GameStore } from '../game/state/GameStore';
import type {
  SaveRepository,
  SaveResult,
  SaveSlotId,
  SaveSlotSummary,
} from '../save/SaveRepository';

const journalText: Record<string, { title: string; body: string }> = {
  'journal.home.key': {
    title: '六月二十二日',
    body: '钥匙还在玄关的蓝色小碗里。别急，我去买面，很快回来。——秀兰',
  },
  'journal.rain.route': {
    title: '旧车站',
    body: '第一次见到志远是在旧车站。先经过三个站牌，再听钟楼的三声响。',
  },
  'journal.life.ordinary_days': {
    title: '许多普通的日子',
    body: '记不得年份，也不妨碍我们一起闻过花香。',
  },
  'journal.return.last_page': {
    title: '最后一页',
    body: '如果你一时叫不出我的名字，也没关系。我会再告诉你。你不需要证明自己还记得多少，才值得被好好陪着。——秀兰',
  },
};

const photoLabels = {
  'photo.1979': '1979 · 搬家纸箱',
  'photo.1992': '1992 · 桂花窗台',
  'photo.2001': '2001 · 银婚蛋糕',
} as const;

type PhotoId = keyof typeof photoLabels;
type TitleView = 'home' | 'mode' | 'new_game_memories' | 'memories' | 'settings';

const photoClues: Record<PhotoId, string> = {
  'photo.1979': '年份写在尚未拆开的纸箱角落。',
  'photo.1992': '年份写在孩子的身高刻度旁。',
  'photo.2001': '年份写在银婚蛋糕的小牌上。',
};

export class AppShell {
  private readonly hud = document.querySelector<HTMLDivElement>('#hud')!;
  private readonly panel = document.querySelector<HTMLDivElement>('#panel-layer')!;
  private readonly system = document.querySelector<HTMLDivElement>('#system-layer')!;
  private signature = '';
  private photoOrder: string[] = [];
  private confirmingClearData = false;
  private titleView: TitleView = 'home';
  private pendingNewMode: GameMode | null = null;
  private confirmingStartSlot: SaveSlotId | null = null;
  private confirmingDeleteSlot: SaveSlotId | null = null;
  private saveNotice = '';
  private readonly debugEnabled =
    import.meta.env.DEV && new URLSearchParams(window.location.search).get('debug') === '1';

  constructor(
    private readonly store: GameStore,
    private readonly saves: SaveRepository,
  ) {
    if (!this.hud || !this.panel || !this.system)
      throw new Error('App shell containers are missing');
    for (const layer of [this.hud, this.panel, this.system]) {
      layer.addEventListener('keydown', this.protectDomKeyboardInput);
      layer.addEventListener('keyup', this.protectDomKeyboardInput);
    }
    store.subscribe((state) => this.render(state));
    window.addEventListener('blur', () => {
      const state = this.store.getState();
      if (state.phase === 'playing' && !state.modal) {
        this.store.dispatch({ type: 'OPEN_MODAL', modal: 'pause' });
      }
    });
  }

  reportSaveResult(result: SaveResult): void {
    if (!result.ok) {
      if (result.reason === 'no_active_slot') return;
      this.saveNotice = '无法写入本地存档，请检查浏览器存储空间与隐私设置。';
    } else {
      this.saveNotice = `已自动保存 · 记忆片段 ${this.fragmentNumber(result.summary.slotId)}`;
    }
    this.signature = '';
    this.render(this.store.getState());
  }

  private readonly protectDomKeyboardInput = (event: KeyboardEvent): void => {
    const target = event.target;
    if (
      target instanceof HTMLButtonElement ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLAnchorElement
    ) {
      event.stopPropagation();
    }
  };

  private render(state: Readonly<GameState>): void {
    const app = document.querySelector<HTMLElement>('#app');
    if (app) {
      app.dataset.phase = state.phase;
      app.dataset.chapter = state.chapterId;
      app.dataset.checkpoint = state.checkpointId;
      app.dataset.playerX = String(Math.round(state.player.x));
      app.dataset.playerY = String(Math.round(state.player.y));
      app.dataset.holdProgress = String(Math.round(state.holdProgress * 100));
      app.dataset.breathingActive = String(isBreathingActive(state));
    }
    document.documentElement.dataset.font = state.settings.fontSize;
    document.documentElement.dataset.contrast = String(state.settings.highContrast);
    document.documentElement.dataset.motion = state.settings.reducedMotion ? 'reduced' : 'full';
    const nearbyEntity = this.nearbyEntity(state);
    const signature = JSON.stringify({
      phase: state.phase,
      chapter: state.chapterId,
      checkpoint: state.checkpointId,
      stage: state.degradationStage,
      mode: state.mode,
      inventory: state.inventory,
      journal: state.journalPages,
      memories: state.memories,
      flags: state.flags,
      puzzles: state.puzzles,
      settings: state.settings,
      modal: state.modal,
      objective: state.objective,
      message: state.message,
      dialogue: state.dialogue,
      dialogueIndex: state.dialogueIndex,
      hold: Math.round(state.holdProgress * 20),
      nearbyEntity: nearbyEntity?.id ?? null,
    });
    if (signature === this.signature) return;
    this.signature = signature;
    this.renderHud(state);
    this.renderPanel(state);
    this.renderSystem(state);
    this.bindEvents(state);
  }

  private renderHud(state: Readonly<GameState>): void {
    if (state.phase !== 'playing') {
      this.hud.innerHTML = '';
      return;
    }
    const d4 = state.degradationStage === 'D4';
    const washed = state.degradationStage === 'D1';
    const nearbyEntity = this.nearbyEntity(state);
    this.hud.innerHTML = `
      <section class="objective-chip ${d4 ? 'hud-faded' : ''}" aria-label="当前目标">
        <small>${chapterMaps[state.chapterId].title}</small>
        <span>${state.objective}</span>
      </section>
      <section class="stage-chip ${d4 ? 'hud-faded' : ''}" aria-label="当前信息状态">
        <span class="anchor-dot" aria-hidden="true"></span>
        ${state.degradationStage} · ${state.mode === 'standard' ? '标准' : '低扰动'}
      </section>
      <nav class="hud-actions ${d4 ? 'hud-faded' : ''}" aria-label="游戏工具">
        <button data-open="inventory">背包 <kbd>I</kbd></button>
        <button data-open="journal">日记 <kbd>J</kbd></button>
        <button data-open="map" class="${washed ? 'washed' : ''}">地图 <kbd>M</kbd></button>
      </nav>
      ${nearbyEntity ? `<button class="interaction-prompt" data-interact="${nearbyEntity.id}" aria-label="与${nearbyEntity.label}交互"><kbd>E</kbd><span>${nearbyEntity.label}</span><span class="touch-action">交互</span></button>` : ''}
      ${state.message && state.holdProgress === 0 ? `<button class="toast" data-clear-message aria-label="关闭提示">${state.message}</button>` : ''}
      ${this.saveNotice ? `<div class="save-notice" role="status" aria-live="polite">${this.saveNotice}</div>` : ''}
      ${state.holdProgress > 0 ? `<div class="hold-progress-a11y" role="progressbar" aria-label="掌心逐渐变暖" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(state.holdProgress * 100)}"></div>` : ''}
      ${this.debugEnabled ? this.debugPanel(state) : ''}
    `;
  }

  private nearbyEntity(state: Readonly<GameState>) {
    if (
      state.phase !== 'playing' ||
      state.modal ||
      state.dialogue.length > 0 ||
      state.holdProgress > 0
    ) {
      return null;
    }
    return nearestAvailableEntity(state, 125);
  }

  private debugPanel(state: Readonly<GameState>): string {
    const chapters: GameState['chapterId'][] = ['home', 'rain', 'life', 'return', 'ending'];
    return `<aside class="debug-panel" aria-label="开发调试层"><strong>DEBUG</strong><span>${state.chapterId} · ${state.checkpointId}</span><span>${state.degradationStage} · (${Math.round(state.player.x)}, ${Math.round(state.player.y)}) · hint ${state.hintLevel}</span><div>${chapters.map((chapter) => `<button data-debug-chapter="${chapter}">${chapter}</button>`).join('')}<button data-debug-memory="rain">memory-rain</button><button data-debug-memory="life.move">memory-move</button><button data-debug-memory="life.osmanthus">memory-osmanthus</button><button data-debug-memory="life.cassette">memory-cassette</button><button data-debug-memory="ending.hand">memory-hand</button></div></aside>`;
  }

  private renderPanel(state: Readonly<GameState>): void {
    if (!state.modal || state.modal === 'pause') {
      this.panel.innerHTML = '';
      return;
    }
    const content =
      state.modal === 'inventory'
        ? this.inventoryPanel(state)
        : state.modal === 'journal'
          ? this.journalPanel(state)
          : state.modal === 'map'
            ? this.mapPanel(state)
            : this.photoPanel(state);
    this.panel.innerHTML = `<div class="scrim"><section class="paper-panel" role="dialog" aria-modal="true">${content}<button class="secondary" data-close>关闭 <kbd>Q</kbd></button></section></div>`;
  }

  private inventoryPanel(state: Readonly<GameState>): string {
    const items = state.inventory.length
      ? state.inventory
          .map((id) => {
            const original = itemLabels[id] ?? id;
            const label =
              state.degradationStage === 'D2'
                ? id === 'item.life.wood_comb'
                  ? '木＿ · 条纹'
                  : id === 'item.life.enamel_cup'
                    ? '＿瓷＿ · 圆点'
                    : id === 'item.life.cassette'
                      ? '〰 〰 〰 · 波纹'
                      : original
                : original;
            return `<li aria-label="${original}"><span class="item-shape" aria-hidden="true">◇</span>${label}</li>`;
          })
          .join('')
      : '<li>还没有收起任何物件。</li>';
    return `<h2>背包</h2><p class="muted">名字会变化，物件的形状和纹理不会。</p><ul class="inventory-list">${items}</ul>`;
  }

  private journalPanel(state: Readonly<GameState>): string {
    const pages = state.journalPages.length
      ? state.journalPages
          .map((id) => {
            const page = journalText[id];
            return page ? `<article><h3>${page.title}</h3><p>${page.body}</p></article>` : '';
          })
          .join('')
      : '<p>红线书签还停在封面。</p>';
    return `<h2>秀兰的日记</h2><div class="journal-pages">${pages}</div>`;
  }

  private mapPanel(state: Readonly<GameState>): string {
    const map = chapterMaps[state.chapterId];
    const landmarks = map.entities
      .filter((entity) => entity.color || entity.kind === 'exit')
      .map((entity) => `<li>${entity.color === 0xb54949 ? '☂' : '◇'} ${entity.label}</li>`)
      .join('');
    return `<h2 class="${state.degradationStage === 'D1' ? 'washed-text' : ''}">${map.title}</h2><div class="map-sketch ${state.degradationStage === 'D1' ? 'washed-map' : ''}" aria-label="示意地图"><span>你在这里</span><i></i><i></i><i></i><b>☂</b></div><ul>${landmarks}</ul>`;
  }

  private photoPanel(state: Readonly<GameState>): string {
    if (this.photoOrder.length === 0) this.photoOrder = [...state.puzzles.photoOrder];
    const rows = this.photoOrder
      .map((id, index) => {
        const photoId = id in photoLabels ? (id as PhotoId) : null;
        const label = photoId ? photoLabels[photoId] : '未识别的照片';
        const clue = photoId ? photoClues[photoId] : '暂时无法辨认这张照片的线索。';
        return `<li><span class="photo-clue-copy"><span>${index + 1}. ${label}</span><small>${clue}</small></span><span><button data-photo-up="${index}" aria-label="上移 ${label}">↑</button><button data-photo-down="${index}" aria-label="下移 ${label}">↓</button></span></li>`;
      })
      .join('');
    return `<h2>把照片放回时间里</h2><p>年份、家具的新旧和桂花的高度都能提供线索。</p><ol class="photo-order">${rows}</ol><button class="primary" data-submit-photos>确认顺序</button>`;
  }

  private renderSystem(state: Readonly<GameState>): void {
    if (state.phase === 'title') {
      this.system.innerHTML = this.titleScreen(state) + this.titleDialog();
      return;
    }
    if (state.phase === 'guide') {
      this.system.innerHTML = this.guideScreen();
      return;
    }
    if (state.modal === 'pause') {
      this.system.innerHTML = this.pauseScreen(state);
      return;
    }
    if (state.dialogue.length > 0) {
      const dialogue = `<button class="dialogue-box" data-dialogue aria-label="继续对白"><span>${state.dialogue[state.dialogueIndex]}</span><small>按 E / Enter / 空格继续</small></button>`;
      this.system.innerHTML = state.activeMemoryId
        ? this.memoryCutscene(state.activeMemoryId, dialogue)
        : dialogue;
      return;
    }
    if (state.chapterId === 'return' && !state.flags.includes('flag.return.mapping_learned')) {
      this.system.innerHTML = this.d3Training(state);
      return;
    }
    this.system.innerHTML = '';
  }

  private memoryCutscene(memoryId: MemoryIllustrationId, dialogue: string): string {
    if (memoryId === 'rain') {
      return `<section class="memory-cutscene" aria-label="雨中的初遇记忆"><img src="${assetUrl('memory.rain.umbrella.illustration')}" alt="年轻的秀兰在旧车站把修补过的红伞倾向淋雨的志远">${dialogue}</section>`;
    }
    if (memoryId === 'life.move') {
      return `<section class="memory-cutscene" aria-label="搬进新家的记忆"><img src="${assetUrl('memory.life.move.illustration')}" alt="年轻的志远和秀兰坐在搬家纸箱上，未装好的床架和旧红伞留在一旁">${dialogue}</section>`;
    }
    if (memoryId === 'life.osmanthus') {
      return `<section class="memory-cutscene" aria-label="桂花第一次开放的记忆"><img src="${assetUrl('memory.life.osmanthus.illustration')}" alt="中年的秀兰擦拭桂花窗台，志远拿着带桂花纹样的搪瓷杯站在一旁">${dialogue}</section>`;
    }
    if (memoryId === 'life.cassette') {
      return `<section class="memory-cutscene" aria-label="停电纪念日的记忆"><img src="${assetUrl('memory.life.cassette.illustration')}" alt="停电的纪念日里，中年的秀兰在录音机旁轻轻哼唱，志远在灯火下安静倾听">${dialogue}</section>`;
    }
    return `<section class="memory-cutscene ending-hand" aria-label="志远主动握住秀兰的手"><img src="${assetUrl('memory.ending.hand.illustration')}" alt="志远从左侧主动把手覆在秀兰停下等待的掌心上，背景里放着仍然温热的面">${dialogue}</section>`;
  }

  private titleScreen(state: Readonly<GameState>): string {
    if (this.titleView === 'mode') return this.modeScreen();
    if (this.titleView === 'new_game_memories') return this.newGameMemoriesScreen();
    if (this.titleView === 'memories') return this.memoriesScreen();
    if (this.titleView === 'settings') return this.titleSettingsScreen(state.settings);
    const latest = this.saves.getMostRecentValidSlot();
    const latestChapter = latest?.chapterId ? chapterMaps[latest.chapterId].title : null;
    return `<section class="title-screen" aria-labelledby="game-title">
      <div class="title-art" aria-hidden="true"><span>☂</span></div>
      <p class="eyebrow">一段关于记忆、尊严与陪伴的故事</p>
      <h1 id="game-title">记忆的缝隙</h1>
      <p class="english-title">THE ERASURE OF ME</p>
      <aside class="content-note"><strong>内容提示</strong><span>本作涉及认知衰退、迷路与家庭照护。许志远是虚构人物，他的经历不代表所有阿尔茨海默病患者。你可以随时暂停、退出或启用低扰动模式。</span></aside>
      <nav class="title-menu" aria-label="主菜单">
        <button class="title-menu-card primary" data-continue-latest ${latest ? '' : 'disabled'}><strong>继续游戏</strong><span>${latest && latestChapter ? `记忆片段 ${this.fragmentNumber(latest.slotId)} · ${latestChapter}` : '还没有可以继续的记忆'}</span></button>
        <button class="title-menu-card" data-title-view="mode"><strong>开始游戏</strong><span>选择体验方式，从记忆的起点开始</span></button>
        <button class="title-menu-card" data-title-view="memories"><strong>读取记忆</strong><span>查看、读取或整理三个记忆片段</span></button>
        <button class="title-menu-card" data-title-view="settings"><strong>设置</strong><span>声音、字幕与无障碍选项</span></button>
      </nav>
      ${this.saveNotice ? `<p class="title-save-notice" role="status" aria-live="polite">${this.saveNotice}</p>` : ''}
      <p class="controls">纯键盘可完成 · WASD / 方向键移动 · E 交互 · Esc 暂停</p>
    </section>`;
  }

  private modeScreen(): string {
    return `<section class="title-screen title-subpage" aria-labelledby="mode-title"><div class="title-panel"><p class="eyebrow">开始游戏</p><h1 id="mode-title">选择体验方式</h1><p>体验方式可以在暂停菜单中随时调整，不会重置进度。</p><div class="mode-grid"><button class="mode-card primary" data-select-mode="standard"><strong>标准模式</strong><span>固定、可学习的方向错位与完整退化表现</span></button><button class="mode-card" data-select-mode="low_stimulation"><strong>低扰动模式</strong><span>保留标准方向，降低模糊、漂移和动态</span></button></div><button class="secondary" data-title-view="home">返回</button></div></section>`;
  }

  private newGameMemoriesScreen(): string {
    const fragments = this.saves
      .getSlotSummaries()
      .map(
        (slot) =>
          `<button class="memory-fragment selectable" data-select-start-slot="${slot.slotId}">${this.memoryFragmentSummary(slot)}</button>`,
      )
      .join('');
    return `<section class="title-screen title-subpage" aria-labelledby="new-memory-title"><div class="title-panel"><p class="eyebrow">开始游戏 · ${this.pendingNewMode === 'low_stimulation' ? '低扰动模式' : '标准模式'}</p><h1 id="new-memory-title">选择一个记忆片段</h1><p>故事会自动保存在选中的片段中。</p><div class="memory-fragment-list">${fragments}</div><button class="secondary" data-title-view="mode">返回</button></div></section>`;
  }

  private memoriesScreen(): string {
    const fragments = this.saves
      .getSlotSummaries()
      .map((slot) => {
        const actions =
          slot.status === 'valid'
            ? `<div><button class="continue" data-continue-slot="${slot.slotId}">读取</button><button class="secondary" data-delete-slot="${slot.slotId}">删除</button></div>`
            : slot.status === 'invalid'
              ? `<div><button class="secondary" data-delete-slot="${slot.slotId}">删除</button></div>`
              : '';
        return `<article class="memory-fragment ${slot.status}">${this.memoryFragmentSummary(slot)}${actions}</article>`;
      })
      .join('');
    return `<section class="title-screen title-subpage" aria-labelledby="memories-title"><div class="title-panel"><p class="eyebrow">读取记忆</p><h1 id="memories-title">记忆片段</h1><p>每个片段保存一段独立的游戏进度。</p><div class="memory-fragment-list">${fragments}</div><button class="secondary" data-title-view="home">返回首页</button></div></section>`;
  }

  private titleSettingsScreen(settings: AccessibilitySettings): string {
    return `<section class="title-screen title-subpage" aria-labelledby="title-settings-title"><div class="title-panel title-settings"><p class="eyebrow">设置</p><h1 id="title-settings-title">声音与无障碍</h1><fieldset><legend>全局设置</legend>${this.toggle('muted', '静音（所有声音线索都有视觉替代）', settings.muted)}${this.audioMixer(settings)}${this.toggle('reducedMotion', '减少动态效果', settings.reducedMotion)}${this.toggle('highContrast', '高对比度', settings.highContrast)}${this.toggle('subtitles', '字幕', settings.subtitles)}<label>文字大小<select data-setting="fontSize"><option value="normal" ${settings.fontSize === 'normal' ? 'selected' : ''}>标准</option><option value="large" ${settings.fontSize === 'large' ? 'selected' : ''}>大</option></select></label><label>牵手操作<select data-setting="holdMode"><option value="hold" ${settings.holdMode === 'hold' ? 'selected' : ''}>长按 1.5 秒</option><option value="short" ${settings.holdMode === 'short' ? 'selected' : ''}>短按 0.6 秒</option><option value="single" ${settings.holdMode === 'single' ? 'selected' : ''}>单次确认</option></select></label></fieldset><button class="secondary" data-title-view="home">返回首页</button></div></section>`;
  }

  private memoryFragmentSummary(slot: SaveSlotSummary): string {
    const label = `记忆片段 ${this.fragmentNumber(slot.slotId)}`;
    if (slot.status === 'empty')
      return `<span><strong>${label}</strong><small>空白的记忆</small></span>`;
    if (slot.status === 'invalid')
      return `<span><strong>${label}</strong><small>模糊的记忆</small></span>`;
    const chapter = slot.chapterId ? chapterMaps[slot.chapterId].title : '未知章节';
    return `<span><strong>${label}</strong><small>${chapter}</small><time datetime="${slot.savedAt}">${this.formatSavedAt(slot.savedAt)}</time></span>`;
  }

  private fragmentNumber(slotId: SaveSlotId): string {
    return String(slotId).padStart(2, '0');
  }

  private formatSavedAt(savedAt: string | null): string {
    if (!savedAt) return '时间未知';
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(savedAt));
  }

  private titleDialog(): string {
    if (this.confirmingStartSlot && this.pendingNewMode) {
      const slot = this.saves.getSlotSummary(this.confirmingStartSlot);
      const empty = slot.status === 'empty';
      const label = `记忆片段 ${this.fragmentNumber(slot.slotId)}`;
      return `<div class="scrim save-management-scrim"><section class="paper-panel save-dialog" role="dialog" aria-modal="true" aria-labelledby="start-memory-title"><h2 id="start-memory-title">${empty ? '要从这个空白的记忆片段开始吗？' : `要覆盖「${label}」并从头开始吗？`}</h2>${empty ? '' : '<p>这个记忆片段中已有的进度将被新的故事替代。</p>'}<div class="confirm-row"><button class="primary" data-confirm-start>${empty ? '开始' : '覆盖并开始'}</button><button data-cancel-title-dialog>返回</button></div></section></div>`;
    }
    if (this.confirmingDeleteSlot) {
      const label = `记忆片段 ${this.fragmentNumber(this.confirmingDeleteSlot)}`;
      return `<div class="scrim save-management-scrim"><section class="paper-panel save-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-save-title"><h2 id="delete-save-title">让「${label}」重新留白吗？</h2><p>这段游戏进度将被永久删除，全局无障碍与音量设置会保留。</p><div class="confirm-row"><button class="secondary" data-confirm-delete-slot="${this.confirmingDeleteSlot}">确认删除</button><button data-cancel-title-dialog>返回</button></div></section></div>`;
    }
    return '';
  }

  private d3Training(state: Readonly<GameState>): string {
    const standard = state.mode === 'standard';
    return `<div class="scrim"><section class="paper-panel training" role="dialog" aria-modal="true"><span class="compass ${standard ? 'rotated' : ''}" aria-hidden="true">↑</span><h2>${standard ? '方向与脚步的关系转过了一圈' : '旧按键提示变得不可靠'}</h2><p>${standard ? '接下来，按“上”会向世界的右侧移动。这个映射全章固定，不会随机变化。' : '实际移动仍保持标准方向。地面箭头、伞柄和窗帘会继续告诉你世界方向。'}</p><p>暂停、退出和设置永远保持标准操作。</p><button class="primary" data-ack-d3>我准备好了</button></section></div>`;
  }

  private pauseScreen(state: Readonly<GameState>): string {
    const settings = state.settings;
    return `<div class="scrim"><section class="paper-panel pause-panel" role="dialog" aria-modal="true"><p class="eyebrow">${chapterMaps[state.chapterId].title}</p><h2>暂停</h2><button class="primary" data-close>继续</button><fieldset><legend>设置与无障碍</legend>${this.toggle('muted', '静音（所有声音线索都有视觉替代）', settings.muted)}${this.audioMixer(settings)}${this.toggle('reducedMotion', '减少动态效果', settings.reducedMotion)}${this.toggle('highContrast', '高对比度', settings.highContrast)}${this.toggle('subtitles', '字幕', settings.subtitles)}<label>文字大小<select data-setting="fontSize"><option value="normal" ${settings.fontSize === 'normal' ? 'selected' : ''}>标准</option><option value="large" ${settings.fontSize === 'large' ? 'selected' : ''}>大</option></select></label><label>牵手操作<select data-setting="holdMode"><option value="hold" ${settings.holdMode === 'hold' ? 'selected' : ''}>长按 1.5 秒</option><option value="short" ${settings.holdMode === 'short' ? 'selected' : ''}>短按 0.6 秒</option><option value="single" ${settings.holdMode === 'single' ? 'selected' : ''}>单次确认</option></select></label><label>体验模式<select data-mode><option value="standard" ${state.mode === 'standard' ? 'selected' : ''}>标准</option><option value="low_stimulation" ${state.mode === 'low_stimulation' ? 'selected' : ''}>低扰动</option></select></label></fieldset><section class="clear-data"><h3>本地数据</h3><p class="muted">清除后将删除本机上的全部记忆片段和设置，且无法恢复。</p>${this.clearDataControl()}</section><button class="secondary" data-title>返回标题</button></section></div>`;
  }

  private clearDataControl(): string {
    return this.confirmingClearData
      ? '<div class="confirm-row" role="group" aria-label="确认清除本地数据"><button class="secondary" data-confirm-clear>确认清除本地数据</button><button data-cancel-clear>取消</button></div>'
      : '<button class="secondary" data-request-clear>清除本地数据</button>';
  }

  private audioMixer(settings: AccessibilitySettings): string {
    const labels: Record<keyof AccessibilitySettings['audioVolumes'], string> = {
      music: '音乐',
      ambience: '环境声',
      voice: '对白与哼唱',
      sfx: '界面与提示音',
    };
    return `<div class="audio-mixer" role="group" aria-label="音量混音">${Object.entries(labels)
      .map(([bus, label]) => {
        const value = settings.audioVolumes[bus as keyof typeof settings.audioVolumes];
        return `<label>${label}<input type="range" min="0" max="1" step="0.05" value="${value}" data-audio-bus="${bus}"><output>${Math.round(value * 100)}%</output></label>`;
      })
      .join('')}</div>`;
  }

  private toggle(key: keyof AccessibilitySettings, label: string, checked: boolean): string {
    return `<label class="toggle"><input type="checkbox" data-setting="${key}" ${checked ? 'checked' : ''}><span>${label}</span></label>`;
  }

  private guideScreen(): string {
    return `<article class="guide-page"><header><p class="eyebrow">故事结束后，留下一点可以带走的东西</p><h1>早期表现与就医陪伴指南</h1><p class="disclaimer">本页用于一般健康科普，不能替代专业筛查、诊断或治疗。如果你发现自己或家人的认知、情绪或日常能力持续发生变化并影响生活，请记录具体情况，并向正规医疗机构的相关专业人员咨询。</p></header><section><h2>值得留意的持续变化</h2><ul><li>比过去更频繁地忘记近期事件，或反复询问同一件事</li><li>经常放错物品，并且难以沿原路寻找</li><li>在熟悉地点迷路，或混淆时间、地点</li><li>完成熟悉任务、解决问题或作出决定变得困难</li><li>跟随对话、理解表达或寻找词语变得困难</li><li>视觉空间判断、情绪、行为或社交状态持续改变</li></ul><p>这些表现可能有多种原因，不能凭单一表现自行判断疾病。</p></section><section><h2>可以怎样行动</h2><ol><li>记录变化出现的时间、频率、场景和对生活的影响。</li><li>与本人平静沟通，避免测试、指责或争辩。</li><li>预约正规医疗机构评估，携带病史、用药信息和观察记录。</li><li>用稳定日程、清晰标记、充足照明改善日常安全。</li><li>鼓励本人继续参与力所能及的熟悉活动与社会交往。</li><li>照护者也需要休息，并可以向家人、社区和专业人员求助。</li></ol></section><aside class="game-notice"><h2>关于游戏中的谜题</h2><p>照片排序、数字连接、颜色和形状辨识只用于叙事体验，不是医学筛查，也不能产生任何认知健康结论。</p></aside><section><h2>资料来源</h2><ul><li><a href="https://www.who.int/news-room/fact-sheets/detail/dementia" target="_blank" rel="noopener noreferrer">世界卫生组织：Dementia</a></li><li><a href="https://www.gov.cn/zhengce/zhengceku/202501/content_6996231.htm" target="_blank" rel="noopener noreferrer">应对老年期痴呆国家行动计划（2024—2030年）</a></li><li><a href="https://www.gov.cn/zhengce/202501/content_6996237.htm" target="_blank" rel="noopener noreferrer">国家行动计划政策解读</a></li></ul><p class="muted">来源最近核验：2026-06-23。正式发布前仍需专业审核。</p></section><section><h2>制作与致谢</h2><p>本作由项目团队原创制作，使用 Phaser、TypeScript、Vite 与 Tiled。生成式图像的来源和处理记录见仓库资产台账。</p><p class="muted">感谢公开权威资料的维护者；上列机构未参与本作制作，也不代表对本作背书。医学与敏感性专业审核完成后，仅在取得同意时补充公开致谢。</p></section><footer><button class="primary" data-title>回到标题</button><button class="secondary" data-start-game>重新开始</button></footer></article>`;
  }

  private openNewGameFlow(): void {
    const state = this.store.getState();
    this.saveBeforeLeaving(state);
    this.titleView = 'mode';
    this.pendingNewMode = null;
    this.confirmingStartSlot = null;
    this.confirmingDeleteSlot = null;
    this.signature = '';
    if (state.phase === 'title') this.render(state);
    else this.store.dispatch({ type: 'RETURN_TITLE' });
  }

  private beginNewGame(slotId: SaveSlotId, mode: GameMode, overwrite: boolean): void {
    if (overwrite && !this.saves.deleteSlot(slotId)) {
      this.saveNotice = `无法覆盖存档 ${slotId}，请检查浏览器存储权限。`;
      this.pendingNewMode = null;
      this.signature = '';
      this.render(this.store.getState());
      return;
    }
    this.saves.setActiveSlot(slotId);
    this.titleView = 'home';
    this.pendingNewMode = null;
    this.confirmingStartSlot = null;
    this.confirmingDeleteSlot = null;
    this.saveNotice = '';
    this.store.dispatch({ type: 'NEW_GAME', mode });
  }

  private continueFromSlot(slotId: SaveSlotId, state: Readonly<GameState>): void {
    const loaded = this.saves.loadSlot(slotId, state.settings);
    if (loaded) {
      this.saves.setActiveSlot(slotId);
      this.titleView = 'home';
      this.saveNotice = '';
      this.store.replaceFromSave(loaded);
      return;
    }
    this.saveNotice = `记忆片段 ${this.fragmentNumber(slotId)} 无法读取。`;
    this.signature = '';
    this.render(state);
  }

  private saveBeforeLeaving(state: Readonly<GameState>): void {
    if (state.phase === 'title') return;
    this.reportSaveResult(this.saves.saveActive(state));
  }

  private bindEvents(state: Readonly<GameState>): void {
    document
      .querySelectorAll<HTMLElement>('[data-start-game]')
      .forEach((button) => button.addEventListener('click', () => this.openNewGameFlow()));
    document.querySelectorAll<HTMLElement>('[data-title-view]').forEach((button) =>
      button.addEventListener('click', () => {
        this.titleView = button.dataset.titleView as TitleView;
        this.confirmingStartSlot = null;
        this.confirmingDeleteSlot = null;
        if (this.titleView !== 'new_game_memories') this.pendingNewMode = null;
        this.signature = '';
        this.render(state);
      }),
    );
    document.querySelectorAll<HTMLElement>('[data-select-mode]').forEach((button) =>
      button.addEventListener('click', () => {
        this.pendingNewMode = button.dataset.selectMode as GameMode;
        this.titleView = 'new_game_memories';
        this.signature = '';
        this.render(state);
      }),
    );
    document.querySelectorAll<HTMLElement>('[data-select-start-slot]').forEach((button) =>
      button.addEventListener('click', () => {
        this.confirmingStartSlot = Number(button.dataset.selectStartSlot) as SaveSlotId;
        this.signature = '';
        this.render(state);
      }),
    );
    document.querySelectorAll<HTMLElement>('[data-confirm-start]').forEach((button) =>
      button.addEventListener('click', () => {
        if (!this.pendingNewMode || !this.confirmingStartSlot) return;
        const slotId = this.confirmingStartSlot;
        this.beginNewGame(
          slotId,
          this.pendingNewMode,
          this.saves.getSlotSummary(slotId).status !== 'empty',
        );
      }),
    );
    document.querySelectorAll<HTMLElement>('[data-continue-latest]').forEach((button) =>
      button.addEventListener('click', () => {
        const latest = this.saves.getMostRecentValidSlot();
        if (latest) this.continueFromSlot(latest.slotId, state);
      }),
    );
    document
      .querySelectorAll<HTMLElement>('[data-continue-slot]')
      .forEach((button) =>
        button.addEventListener('click', () =>
          this.continueFromSlot(Number(button.dataset.continueSlot) as SaveSlotId, state),
        ),
      );
    document.querySelectorAll<HTMLElement>('[data-delete-slot]').forEach((button) =>
      button.addEventListener('click', () => {
        this.confirmingDeleteSlot = Number(button.dataset.deleteSlot) as SaveSlotId;
        this.pendingNewMode = null;
        this.signature = '';
        this.render(state);
      }),
    );
    document.querySelectorAll<HTMLElement>('[data-confirm-delete-slot]').forEach((button) =>
      button.addEventListener('click', () => {
        const slotId = Number(button.dataset.confirmDeleteSlot) as SaveSlotId;
        this.saveNotice = this.saves.deleteSlot(slotId)
          ? `记忆片段 ${this.fragmentNumber(slotId)} 已重新留白`
          : `无法删除记忆片段 ${this.fragmentNumber(slotId)}，请检查浏览器存储权限。`;
        this.confirmingDeleteSlot = null;
        this.signature = '';
        this.render(state);
      }),
    );
    document.querySelectorAll<HTMLElement>('[data-cancel-title-dialog]').forEach((button) =>
      button.addEventListener('click', () => {
        this.confirmingStartSlot = null;
        this.confirmingDeleteSlot = null;
        this.signature = '';
        this.render(state);
      }),
    );
    document.querySelectorAll<HTMLElement>('[data-open]').forEach((button) =>
      button.addEventListener('click', () =>
        this.store.dispatch({
          type: 'OPEN_MODAL',
          modal: button.dataset.open as Exclude<ModalId, null>,
        }),
      ),
    );
    document
      .querySelectorAll<HTMLElement>('[data-interact]')
      .forEach((button) =>
        button.addEventListener('click', () =>
          this.store.dispatch({ type: 'INTERACT', entityId: button.dataset.interact! }),
        ),
      );
    document.querySelectorAll<HTMLElement>('[data-close]').forEach((button) =>
      button.addEventListener('click', () => {
        this.confirmingClearData = false;
        this.store.dispatch({ type: 'CLOSE_MODAL' });
      }),
    );
    document.querySelectorAll<HTMLElement>('[data-title]').forEach((button) =>
      button.addEventListener('click', () => {
        this.saveBeforeLeaving(state);
        this.confirmingClearData = false;
        this.titleView = 'home';
        this.pendingNewMode = null;
        this.confirmingStartSlot = null;
        this.confirmingDeleteSlot = null;
        this.store.dispatch({ type: 'RETURN_TITLE' });
      }),
    );
    document.querySelectorAll<HTMLElement>('[data-request-clear]').forEach((button) =>
      button.addEventListener('click', () => {
        this.confirmingClearData = true;
        this.signature = '';
        this.render(state);
      }),
    );
    document.querySelectorAll<HTMLElement>('[data-cancel-clear]').forEach((button) =>
      button.addEventListener('click', () => {
        this.confirmingClearData = false;
        this.titleView = 'home';
        this.signature = '';
        this.render(state);
      }),
    );
    document.querySelectorAll<HTMLElement>('[data-confirm-clear]').forEach((button) =>
      button.addEventListener('click', () => {
        this.confirmingClearData = false;
        this.store.dispatch({ type: 'RETURN_TITLE' });
        this.store.dispatch({ type: 'SETTINGS', patch: normalizeSettings() });
        if (!this.saves.clearAll()) {
          this.saveNotice = '无法清除全部本地数据，请检查浏览器存储权限。';
          this.signature = '';
          this.render(this.store.getState());
          return;
        }
        this.saveNotice = '已清除全部本地数据';
        this.signature = '';
        this.render(this.store.getState());
      }),
    );
    document
      .querySelectorAll<HTMLElement>('[data-dialogue]')
      .forEach((button) =>
        button.addEventListener('click', () => this.store.dispatch({ type: 'ADVANCE_DIALOGUE' })),
      );
    document
      .querySelectorAll<HTMLElement>('[data-ack-d3]')
      .forEach((button) =>
        button.addEventListener('click', () => this.store.dispatch({ type: 'ACKNOWLEDGE_D3' })),
      );
    document
      .querySelectorAll<HTMLElement>('[data-clear-message]')
      .forEach((button) =>
        button.addEventListener('click', () => this.store.dispatch({ type: 'CLEAR_MESSAGE' })),
      );
    document
      .querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-setting]')
      .forEach((control) =>
        control.addEventListener('change', () => {
          const key = control.dataset.setting as keyof AccessibilitySettings;
          const value =
            control instanceof HTMLInputElement && control.type === 'checkbox'
              ? control.checked
              : control.value;
          this.store.dispatch({ type: 'SETTINGS', patch: { [key]: value } });
        }),
      );
    document
      .querySelectorAll<HTMLSelectElement>('[data-mode]')
      .forEach((control) =>
        control.addEventListener('change', () =>
          this.store.dispatch({ type: 'SET_MODE', mode: control.value as GameState['mode'] }),
        ),
      );
    document.querySelectorAll<HTMLInputElement>('[data-audio-bus]').forEach((control) =>
      control.addEventListener('change', () => {
        const bus = control.dataset.audioBus as keyof AccessibilitySettings['audioVolumes'];
        this.store.dispatch({
          type: 'SETTINGS',
          patch: { audioVolumes: { [bus]: Number(control.value) } },
        });
      }),
    );
    document
      .querySelectorAll<HTMLElement>('[data-photo-up]')
      .forEach((button) =>
        button.addEventListener('click', () =>
          this.movePhoto(Number(button.dataset.photoUp), -1, state),
        ),
      );
    document
      .querySelectorAll<HTMLElement>('[data-photo-down]')
      .forEach((button) =>
        button.addEventListener('click', () =>
          this.movePhoto(Number(button.dataset.photoDown), 1, state),
        ),
      );
    document
      .querySelectorAll<HTMLElement>('[data-submit-photos]')
      .forEach((button) =>
        button.addEventListener('click', () =>
          this.store.dispatch({ type: 'PHOTO_ORDER', order: this.photoOrder }),
        ),
      );
    document.querySelectorAll<HTMLElement>('[data-debug-chapter]').forEach((button) =>
      button.addEventListener('click', () =>
        this.store.dispatch({
          type: 'DEBUG_JUMP_CHAPTER',
          chapterId: button.dataset.debugChapter as GameState['chapterId'],
        }),
      ),
    );
    document.querySelectorAll<HTMLElement>('[data-debug-memory]').forEach((button) =>
      button.addEventListener('click', () =>
        this.store.dispatch({
          type: 'DEBUG_SHOW_MEMORY',
          memoryId: button.dataset.debugMemory as MemoryIllustrationId,
        }),
      ),
    );
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    if (dialog && !dialog.contains(document.activeElement)) {
      const focusable = dialog.querySelector<HTMLElement>('button, select, input');
      focusable?.focus({ preventScroll: true });
    }
  }

  private movePhoto(index: number, delta: number, state: Readonly<GameState>): void {
    const next = index + delta;
    if (next < 0 || next >= this.photoOrder.length) return;
    [this.photoOrder[index], this.photoOrder[next]] = [
      this.photoOrder[next],
      this.photoOrder[index],
    ];
    this.signature = '';
    this.render(state);
  }
}
