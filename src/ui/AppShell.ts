import { chapterMaps, entityLabelKey, itemLabelKeys } from '../game/content/maps';
import { nearestAvailableEntity } from '../game/content/entitySelectors';
import { assetUrl } from '../game/assets/manifest';
import { normalizeSettings } from '../game/state/initialState';
import { isBreathingActive } from '../game/presentation/breathing';
import {
  createMapPresentation,
  type MapLandmark,
  type MapMode,
  type MapPresentation,
} from '../game/presentation/mapPresentation';
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
import { enableDevPanelDrag, type DevPanelPosition } from './devPanelDrag';
import type { SemanticInput } from '../game/input/SemanticInput';
import type { InputAction } from '../game/input/actions';
import { FullscreenController, type FullscreenResult } from './FullscreenController';
import { renderText, resolveLocale, t, type Locale, type TextRef } from '../i18n';

const journalText: Record<string, { titleKey: string; bodyKey: string }> = {
  'journal.home.key': {
    titleKey: 'journal.home.key.title',
    bodyKey: 'journal.home.key.body',
  },
  'journal.rain.route': {
    titleKey: 'journal.rain.route.title',
    bodyKey: 'journal.rain.route.body',
  },
  'journal.life.ordinary_days': {
    titleKey: 'journal.life.ordinary_days.title',
    bodyKey: 'journal.life.ordinary_days.body',
  },
  'journal.return.last_page': {
    titleKey: 'journal.return.last_page.title',
    bodyKey: 'journal.return.last_page.body',
  },
};

const photoLabels = {
  'photo.1979': 'legacy.photo.caption.1979',
  'photo.1992': 'legacy.photo.caption.1992',
  'photo.2001': 'legacy.photo.caption.2001',
} as const;

type PhotoId = keyof typeof photoLabels;
type TitleView = 'home' | 'mode' | 'new_game_memories' | 'memories' | 'settings';

const photoClues: Record<PhotoId, string> = {
  'photo.1979': 'legacy.photo.clue.1979',
  'photo.1992': 'legacy.photo.clue.1992',
  'photo.2001': 'legacy.photo.clue.2001',
};

const photoAssets = {
  'photo.1979': 'prop.life.photo.move_1979',
  'photo.1992': 'prop.life.photo.osmanthus_1992',
  'photo.2001': 'prop.life.photo.anniversary_2001',
} as const;

const photoAlt: Record<PhotoId, string> = {
  'photo.1979': 'legacy.photo.alt.1979',
  'photo.1992': 'legacy.photo.alt.1992',
  'photo.2001': 'legacy.photo.alt.2001',
};

export class AppShell {
  private readonly root = document.querySelector<HTMLDivElement>('#app')!;
  private readonly hud = document.querySelector<HTMLDivElement>('#hud')!;
  private readonly panel = document.querySelector<HTMLDivElement>('#panel-layer')!;
  private readonly system = document.querySelector<HTMLDivElement>('#system-layer')!;
  private readonly touch = document.querySelector<HTMLDivElement>('#touch-layer')!;
  private readonly fullscreenLayer = document.querySelector<HTMLDivElement>('#fullscreen-layer')!;
  private readonly orientation = document.querySelector<HTMLDivElement>('#orientation-layer')!;
  private signature = '';
  private photoOrder: string[] = [];
  private confirmingClearData = false;
  private titleView: TitleView = 'home';
  private pendingNewMode: GameMode | null = null;
  private confirmingStartSlot: SaveSlotId | null = null;
  private confirmingDeleteSlot: SaveSlotId | null = null;
  private saveNotice = '';
  private lastModal: ModalId = null;
  private modalReturnFocus: HTMLElement | null = null;
  private modalReturnFocusSelector: string | null = null;
  private titleDialogReturnFocusSelector: string | null = null;
  private readonly coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  private fullscreenEntryAcknowledged = !this.coarsePointer;
  private locale: Locale = resolveLocale('system');
  private fullscreenNotice = '';
  private fullscreenNoticeTimer: number | null = null;
  private fullscreenLayerKey = '';
  private debugPanelPosition: DevPanelPosition | null = null;
  private readonly debugEnabled =
    import.meta.env.DEV &&
    ['debug', 'editor'].some(
      (parameter) => new URLSearchParams(window.location.search).get(parameter) === '1',
    );

  private translate(key: string, params: Record<string, string | number> = {}): string {
    return t(this.locale, key, params);
  }

  constructor(
    private readonly store: GameStore,
    private readonly saves: SaveRepository,
    private readonly semanticInput: SemanticInput,
    private readonly fullscreen: FullscreenController,
    private readonly options?: { onSettingsCleared?: () => void },
  ) {
    if (
      !this.root ||
      !this.hud ||
      !this.panel ||
      !this.system ||
      !this.touch ||
      !this.fullscreenLayer ||
      !this.orientation
    )
      throw new Error('App shell containers are missing');
    this.locale = resolveLocale(store.getState().settings.localePreference);
    for (const layer of [this.hud, this.panel, this.system]) {
      layer.addEventListener('keydown', this.protectDomKeyboardInput);
      layer.addEventListener('keyup', this.protectDomKeyboardInput);
    }
    this.renderTouchControls();
    this.bindTouchControls();
    this.renderFullscreenLayer();
    this.updateOrientationGate();
    window.addEventListener('resize', this.updateOrientationGate);
    window.addEventListener('orientationchange', this.updateOrientationGate);
    this.fullscreen.subscribe(() => {
      this.signature = '';
      this.renderFullscreenLayer();
      this.render(this.store.getState());
    });
    store.subscribe((state) => this.render(state));
    window.addEventListener('blur', () => {
      this.semanticInput.clear();
      const state = this.store.getState();
      if (state.phase === 'playing' && !state.modal) {
        this.store.dispatch({ type: 'OPEN_MODAL', modal: 'pause' });
      }
    });
  }

  private renderTouchControls(): void {
    this.touch.innerHTML = `
      <div class="touch-controls" aria-label="${this.translate('app.aria.touch_controls')}">
        <div class="touch-dpad" aria-label="${this.translate('app.aria.direction')}">
          <button class="touch-up" data-touch-action="move_up" aria-label="${this.translate('touch.up')}">↑</button>
          <button class="touch-left" data-touch-action="move_left" aria-label="${this.translate('touch.left')}">←</button>
          <button class="touch-down" data-touch-action="move_down" aria-label="${this.translate('touch.down')}">↓</button>
          <button class="touch-right" data-touch-action="move_right" aria-label="${this.translate('touch.right')}">→</button>
        </div>
        <div class="touch-context-actions">
          <button data-touch-action="observe" aria-label="${this.translate('touch.observe')}">${this.translate('touch.observe.short')}</button>
          <button class="touch-confirm" data-touch-action="interact" aria-label="${this.translate('touch.interact')}">${this.translate('touch.interact.short')}</button>
        </div>
        <button class="touch-pause" data-touch-action="pause" aria-label="${this.translate('touch.pause')}">${this.translate('touch.pause.short')}</button>
      </div>`;
  }

  private bindTouchControls(): void {
    this.touch.querySelectorAll<HTMLButtonElement>('[data-touch-action]').forEach((button) => {
      const action = button.dataset.touchAction as InputAction;
      if (action === 'pause') {
        button.addEventListener('click', () => {
          const sourceId = 'touch:pause-click';
          this.semanticInput.press(action, sourceId);
          this.semanticInput.release(action, sourceId);
        });
        button.addEventListener('contextmenu', (event) => event.preventDefault());
        return;
      }
      const activePointers = new Set<number>();
      const release = (event: PointerEvent) => {
        if (!activePointers.delete(event.pointerId)) return;
        this.semanticInput.release(action, `touch:${event.pointerId}`);
        button.removeAttribute('data-pressed');
      };
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        activePointers.add(event.pointerId);
        button.dataset.pressed = 'true';
        this.semanticInput.press(action, `touch:${event.pointerId}`);
        try {
          button.setPointerCapture(event.pointerId);
        } catch {
          // Synthetic accessibility tools may not create a capturable native pointer.
        }
      });
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('lostpointercapture', release);
      button.addEventListener('pointermove', (event) => {
        if (!activePointers.has(event.pointerId)) return;
        const bounds = button.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        ) {
          release(event);
        }
      });
      button.addEventListener('contextmenu', (event) => event.preventDefault());
    });
  }

  private updateTouchInteractLabel(
    state: Readonly<GameState>,
    nearbyEntity: ReturnType<typeof nearestAvailableEntity>,
  ): void {
    const button = this.touch.querySelector<HTMLButtonElement>('[data-touch-action="interact"]');
    if (!button) return;

    let label = this.translate('touch.interact.short');
    let accessibleLabel = this.translate('touch.interact');
    if (state.dialogue.length > 0) {
      label = this.translate('common.continue');
      accessibleLabel = this.translate('dialogue.continue');
    } else if (state.flags.includes('ending.ready_to_hold')) {
      label = this.translate('common.hold');
      accessibleLabel =
        state.settings.holdMode === 'hold'
          ? this.translate('common.hold.long')
          : this.translate('common.hold');
    } else if (nearbyEntity) {
      const verb = {
        inspect: this.translate('common.inspect'),
        pickup: this.translate('common.pickup'),
        puzzle: this.translate('common.inspect'),
        exit: this.translate('common.go'),
        anchor: this.translate('common.inspect'),
        slot: this.translate('common.place'),
      }[nearbyEntity.kind];
      label = verb;
      accessibleLabel = this.translate('common.action_with', {
        verb,
        label: this.translate(entityLabelKey(nearbyEntity)),
      });
    }

    button.textContent = label;
    button.setAttribute('aria-label', accessibleLabel);
  }

  private readonly updateOrientationGate = (): void => {
    const portrait = window.innerHeight > window.innerWidth;
    const blocked = this.coarsePointer && portrait;
    document.documentElement.dataset.touch = String(this.coarsePointer);
    document.documentElement.dataset.orientationBlocked = String(blocked);
    this.renderFullscreenLayer();
    this.orientation.innerHTML = blocked
      ? `<section class="orientation-notice" role="dialog" aria-modal="true" tabindex="-1" aria-labelledby="orientation-title"><span aria-hidden="true">↻</span><h1 id="orientation-title">${this.translate('orientation.title')}</h1><p>${this.translate('orientation.body')}</p></section>`
      : '';
    if (!blocked) return;
    this.semanticInput.clear();
    const state = this.store.getState();
    if (state.phase === 'playing' && !state.modal) {
      this.store.dispatch({ type: 'OPEN_MODAL', modal: 'pause' });
    }
    this.orientation
      .querySelector<HTMLElement>('.orientation-notice')
      ?.focus({ preventScroll: true });
  };

  private renderFullscreenLayer(): void {
    const landscape = window.innerWidth >= window.innerHeight;
    const orientationBlocked = this.coarsePointer && !landscape;
    const showGate =
      this.coarsePointer && landscape && !this.fullscreenEntryAcknowledged && !orientationBlocked;
    this.root.dataset.fullscreenEntry = String(showGate);
    this.root.dataset.orientationBlocked = String(orientationBlocked);
    const interactionBlocked = showGate || orientationBlocked;
    for (const layer of [this.hud, this.panel, this.system, this.touch]) {
      layer.inert = interactionBlocked;
    }
    const layerKey = showGate
      ? 'entry'
      : this.fullscreenNotice
        ? `notice:${this.fullscreenNotice}`
        : 'empty';
    if (this.fullscreenLayerKey === layerKey) return;
    this.fullscreenLayerKey = layerKey;
    this.fullscreenLayer.innerHTML = showGate
      ? `<section class="fullscreen-entry" role="dialog" aria-modal="true" aria-labelledby="fullscreen-entry-title" aria-describedby="fullscreen-entry-description"><div class="fullscreen-entry-copy"><p class="eyebrow">${this.translate('fullscreen.eyebrow')}</p><h1 id="fullscreen-entry-title">${this.translate('fullscreen.title')}</h1><p id="fullscreen-entry-description">${this.translate('fullscreen.body')}</p></div><button data-enter-fullscreen aria-label="${this.translate('fullscreen.start')}"><span>${this.translate('fullscreen.tap')}</span></button></section>`
      : this.fullscreenNotice
        ? `<p class="fullscreen-notice" role="status" aria-live="polite">${this.fullscreenNotice}</p>`
        : '';
    if (!showGate) return;
    const button = this.fullscreenLayer.querySelector<HTMLButtonElement>('[data-enter-fullscreen]');
    button?.addEventListener('click', () => void this.acceptFullscreenEntry());
    requestAnimationFrame(() => button?.focus({ preventScroll: true }));
  }

  private async acceptFullscreenEntry(): Promise<void> {
    const result = await this.fullscreen.request();
    this.fullscreenEntryAcknowledged = true;
    this.updateFullscreenNotice(result);
    this.renderFullscreenLayer();
  }

  private async toggleFullscreen(): Promise<void> {
    const result = this.fullscreen.isActive()
      ? await this.fullscreen.exit()
      : await this.fullscreen.request();
    this.updateFullscreenNotice(result);
    this.signature = '';
    this.renderFullscreenLayer();
    this.render(this.store.getState());
  }

  private updateFullscreenNotice(result: FullscreenResult): void {
    if (this.fullscreenNoticeTimer !== null) {
      window.clearTimeout(this.fullscreenNoticeTimer);
      this.fullscreenNoticeTimer = null;
    }
    this.fullscreenNotice =
      result === 'unsupported' || result === 'denied' ? this.translate('fullscreen.notice') : '';
    if (this.fullscreenNotice) {
      this.fullscreenNoticeTimer = window.setTimeout(() => {
        this.fullscreenNotice = '';
        this.fullscreenNoticeTimer = null;
        this.renderFullscreenLayer();
      }, 5000);
    }
  }

  private fullscreenControl(): string {
    if (!this.coarsePointer) return '';
    const active = this.fullscreen.isActive();
    return `<div class="fullscreen-setting"><span><strong>${this.translate('fullscreen.setting.title')}</strong><small>${active ? this.translate('fullscreen.setting.active') : this.translate('fullscreen.setting.inactive')}</small></span><button class="secondary fullscreen-toggle" data-fullscreen-toggle>${active ? this.translate('fullscreen.exit') : this.translate('fullscreen.enter')}</button></div>`;
  }

  reportSaveResult(result: SaveResult): void {
    if (!result.ok) {
      if (result.reason === 'no_active_slot') return;
      this.saveNotice = this.translate('save.failed');
    } else {
      this.saveNotice = '';
    }
    this.signature = '';
    this.render(this.store.getState());
  }

  private readonly protectDomKeyboardInput = (event: KeyboardEvent): void => {
    const target = event.target;
    if (
      event.type === 'keydown' &&
      this.store.getState().modal &&
      ['q', 'Q', 'Backspace', 'Escape'].includes(event.key)
    ) {
      event.preventDefault();
      event.stopPropagation();
      this.store.dispatch({ type: 'CLOSE_MODAL' });
      return;
    }
    if (
      target instanceof HTMLButtonElement ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLAnchorElement
    ) {
      event.stopPropagation();
    }
  };

  private updateDocumentMetadata(): void {
    document.documentElement.lang = this.locale;
    document.title = this.translate('app.title');
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute('content', this.translate('app.description'));
    this.root.setAttribute('aria-label', this.translate('app.aria.game'));
    document
      .querySelector<HTMLElement>('.skip-link')
      ?.replaceChildren(document.createTextNode(this.translate('app.skip_to_menu')));
    document
      .querySelector<HTMLElement>('#game-canvas')
      ?.setAttribute('aria-label', this.translate('app.aria.scene'));
    document
      .querySelector<HTMLCanvasElement>('canvas[data-game-canvas]')
      ?.setAttribute('aria-label', this.translate('app.aria.canvas'));
    document.documentElement.dataset.locale = this.locale;
  }

  private render(state: Readonly<GameState>): void {
    this.locale = resolveLocale(state.settings.localePreference);
    this.updateDocumentMetadata();
    const previousModal = this.lastModal;
    const openingModal = !previousModal && state.modal;
    const closingModal = previousModal && !state.modal;
    if (openingModal && document.activeElement instanceof HTMLElement) {
      this.modalReturnFocus = document.activeElement;
      this.modalReturnFocusSelector = document.activeElement.dataset.open
        ? `[data-open="${document.activeElement.dataset.open}"]`
        : document.activeElement instanceof HTMLCanvasElement
          ? 'canvas[data-game-canvas]'
          : null;
    }
    this.lastModal = state.modal;
    const map = createMapPresentation(state, this.locale);
    const mapMode = map.mode;
    const app = document.querySelector<HTMLElement>('#app');
    if (app) {
      app.dataset.phase = state.phase;
      app.dataset.chapter = state.chapterId;
      app.dataset.stage = state.degradationStage;
      app.dataset.mode = state.mode;
      app.dataset.checkpoint = state.checkpointId;
      app.dataset.playerX = String(Math.round(state.player.x));
      app.dataset.playerY = String(Math.round(state.player.y));
      app.dataset.holdProgress = String(Math.round(state.holdProgress * 100));
      app.dataset.modal = state.modal ?? 'none';
      app.dataset.dialogueActive = String(state.dialogue.length > 0);
      app.dataset.breathingActive = String(isBreathingActive(state));
      app.dataset.mapMode = mapMode;
    }
    document.documentElement.dataset.font = state.settings.fontSize;
    document.documentElement.dataset.contrast = String(state.settings.highContrast);
    document.documentElement.dataset.motion = state.settings.reducedMotion ? 'reduced' : 'full';
    const nearbyEntity = this.nearbyEntity(state);
    this.updateTouchInteractLabel(state, nearbyEntity);
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
      mapPlayer: [Math.round(state.player.x / 16), Math.round(state.player.y / 16)],
      nearbyEntity: nearbyEntity?.id ?? null,
    });
    if (signature === this.signature) return;
    this.signature = signature;
    this.renderHud(state, mapMode);
    this.renderPanel(state, map);
    this.renderSystem(state);
    this.bindEvents(state);
    if (closingModal) {
      const returnFocus = this.modalReturnFocusSelector
        ? document.querySelector<HTMLElement>(this.modalReturnFocusSelector)
        : this.modalReturnFocus?.isConnected
          ? this.modalReturnFocus
          : null;
      requestAnimationFrame(() => returnFocus?.focus({ preventScroll: true }));
      this.modalReturnFocus = null;
      this.modalReturnFocusSelector = null;
    }
  }

  private restoreTitleDialogFocus(): void {
    const selector = this.titleDialogReturnFocusSelector;
    this.titleDialogReturnFocusSelector = null;
    if (!selector) return;
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
    });
  }

  private renderHud(state: Readonly<GameState>, mapMode: MapMode): void {
    if (state.phase !== 'playing') {
      this.hud.innerHTML = '';
      return;
    }
    const d4 = state.degradationStage === 'D4';
    const nearbyEntity = this.nearbyEntity(state);
    this.hud.innerHTML = `
      <section class="objective-chip hud-memory-layer ${d4 ? 'hud-memory-faded' : ''}" aria-label="${this.translate('hud.objective')}">
        <div class="objective-copy">
          <small class="objective-chapter">${this.translate(chapterMaps[state.chapterId].titleKey)}</small>
          <span class="objective-text">${renderText(this.locale, state.objective)}</span>
        </div>
      </section>
      <section class="stage-chip hud-memory-layer ${d4 ? 'hud-memory-faded' : ''}" aria-label="${this.translate('hud.status')}">
        <span class="anchor-dot" aria-hidden="true"></span>
        <span class="stage-code">${state.degradationStage}</span>
        <span aria-hidden="true">·</span>
        <span>${this.translate(state.mode === 'standard' ? 'common.standard' : 'mode.low_stimulation')}</span>
      </section>
      <nav class="hud-actions" aria-label="${this.translate('hud.tools')}">
        <button data-open="inventory">${this.translate('hud.inventory')} <kbd>I</kbd></button>
        <button data-open="journal">${this.translate('hud.journal')} <kbd>J</kbd></button>
        ${mapMode === 'hidden' ? '' : `<button data-open="map">${this.translate('hud.map')} <kbd>M</kbd></button>`}
      </nav>
      ${nearbyEntity ? `<button class="interaction-prompt" data-interact="${nearbyEntity.id}" aria-label="${this.translate('common.interact_with', { label: this.translate(entityLabelKey(nearbyEntity)) })}"><kbd>E</kbd><span>${this.translate(entityLabelKey(nearbyEntity))}</span><span class="touch-action">${this.translate('common.interact')}</span></button>` : ''}
      ${state.message && state.holdProgress === 0 ? `<button class="toast" data-clear-message aria-label="${this.translate('hud.close_message')}">${renderText(this.locale, state.message)}</button>` : ''}
      ${this.saveNotice ? `<div class="save-notice" role="status" aria-live="polite">${this.saveNotice}</div>` : ''}
      ${state.holdProgress > 0 ? `<div class="hold-progress-a11y" role="progressbar" aria-label="${this.translate('hud.hold_warmth')}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(state.holdProgress * 100)}"></div>` : ''}
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
    return `<aside class="debug-panel" aria-label="开发调试层"><div class="debug-panel-handle" data-debug-drag-handle tabindex="0" aria-label="移动开发调试面板，拖动或使用方向键"><strong>⠿ DEBUG</strong><span>${state.chapterId} · ${state.checkpointId}</span><span>${state.degradationStage} · (${Math.round(state.player.x)}, ${Math.round(state.player.y)}) · hint ${state.hintLevel}</span></div><div>${chapters.map((chapter) => `<button data-debug-chapter="${chapter}">${chapter}</button>`).join('')}<button data-debug-memory="rain">memory-rain</button><button data-debug-memory="life.move">memory-move</button><button data-debug-memory="life.osmanthus">memory-osmanthus</button><button data-debug-memory="life.cassette">memory-cassette</button><button data-debug-memory="ending.hand">memory-hand</button></div></aside>`;
  }

  private renderPanel(state: Readonly<GameState>, map: MapPresentation): void {
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
            ? this.mapPanel(map)
            : this.photoPanel(state);
    this.panel.innerHTML = `<div class="scrim"><section class="paper-panel ${state.modal}-panel" role="dialog" aria-modal="true">${content}<button class="secondary" data-close>${this.translate('common.close')} <kbd>Q</kbd></button></section></div>`;
  }

  private inventoryPanel(state: Readonly<GameState>): string {
    const items = state.inventory.length
      ? state.inventory
          .map((id) => {
            const original = this.translate(itemLabelKeys[id] ?? id);
            const label =
              state.degradationStage === 'D2'
                ? id === 'item.life.wood_comb'
                  ? this.translate('item.life.wood_comb.d2')
                  : id === 'item.life.enamel_cup'
                    ? this.translate('item.life.enamel_cup.d2')
                    : id === 'item.life.cassette'
                      ? this.translate('item.life.cassette.d2')
                      : original
                : original;
            return `<li aria-label="${original}"><span class="item-shape" aria-hidden="true">◇</span>${label}</li>`;
          })
          .join('')
      : `<li>${this.translate('panel.inventory.empty')}</li>`;
    return `<h2>${this.translate('panel.inventory.title')}</h2><p class="muted">${this.translate('panel.inventory.body')}</p><ul class="inventory-list">${items}</ul>`;
  }

  private journalPanel(state: Readonly<GameState>): string {
    const pages = state.journalPages.length
      ? state.journalPages
          .map((id) => {
            const page = journalText[id];
            return page
              ? `<article><h3>${this.translate(page.titleKey)}</h3><p>${this.translate(page.bodyKey)}</p></article>`
              : '';
          })
          .join('')
      : `<p>${this.translate('panel.journal.empty')}</p>`;
    return `<h2>${this.translate('panel.journal.title')}</h2><div class="journal-pages">${pages}</div>`;
  }

  private mapPanel(map: MapPresentation): string {
    const landmarks = map.landmarks
      .filter((entity) => entity.visible)
      .map(
        (entity) =>
          `<li>${this.landmarkSymbol(entity)} <span>${this.translate(entityLabelKey(entity))}</span>${entity.reached ? `<small>${this.translate('panel.map.reached')}</small>` : ''}</li>`,
      )
      .join('');
    const status =
      map.mode === 'washed'
        ? this.translate('panel.map.washed_status')
        : this.translate('panel.map.full_status');
    return `<div class="map-panel-heading"><div><p class="eyebrow">${this.translate('panel.map.eyebrow')}</p><h2 class="${map.mode === 'washed' ? 'washed-text' : ''}">${map.title}</h2></div><p class="map-status">${status}</p></div>${this.mapSvg(map)}<ul class="map-legend" aria-label="${this.translate('panel.map.legend')}">${landmarks}</ul>`;
  }

  private mapSvg(map: MapPresentation): string {
    const paths = map.paths
      .map(
        (path) =>
          `<path class="map-route ${path.secondary ? 'secondary' : ''}" data-map-path="${path.id}" d="${path.d}" />`,
      )
      .join('');
    const labels = map.labels
      .map(
        (label) =>
          `<text class="map-place-label" x="${label.x}" y="${label.y}" text-anchor="middle">${label.text}</text>`,
      )
      .join('');
    const landmarks = map.landmarks
      .filter((landmark) => landmark.visible)
      .map((landmark) => this.mapLandmark(landmark))
      .join('');
    const soundCue = map.soundCue
      ? `<g class="map-sound-cue" transform="translate(${map.soundCue.x} ${map.soundCue.y})" aria-label="${map.soundCue.label}"><path d="M-34 18Q0-18 34 18M-22 28Q0 4 22 28M-8 36Q0 28 8 36" /></g>`
      : '';
    const wash =
      map.mode === 'washed'
        ? '<g class="map-water-stains" aria-hidden="true"><ellipse cx="410" cy="205" rx="285" ry="135"/><ellipse cx="805" cy="505" rx="360" ry="175"/></g>'
        : '';
    return `<svg class="map-drawing expanded ${map.mode}" viewBox="0 0 ${map.width} ${map.height}" role="img" aria-label="${this.translate('panel.map.player', { title: map.title })}"><title>${map.title}</title><rect class="map-paper" x="10" y="10" width="${map.width - 20}" height="${map.height - 20}" rx="22"/>${paths}${labels}${wash}${landmarks}${soundCue}<g class="map-player" transform="translate(${map.player.x} ${map.player.y})"><circle r="24"/><circle class="map-player-core" r="9"/></g></svg>`;
  }

  private mapLandmark(landmark: MapLandmark): string {
    const className = `map-landmark ${landmark.symbol} ${landmark.reached ? 'reached' : ''}`;
    if (landmark.symbol === 'umbrella') {
      return `<text class="${className}" x="${landmark.x}" y="${landmark.y}" text-anchor="middle" aria-label="${this.translate(entityLabelKey(landmark))}">☂</text>`;
    }
    if (landmark.symbol === 'station') {
      const number = landmark.id.match(/stone_(\d+)/)?.[1] ?? '';
      return `<g class="${className}" transform="translate(${landmark.x} ${landmark.y})" aria-label="${this.translate(entityLabelKey(landmark))}"><circle r="19"/><text y="9" text-anchor="middle">${number}</text></g>`;
    }
    return `<path class="${className}" aria-label="${this.translate(entityLabelKey(landmark))}" d="M${landmark.x} ${landmark.y - 24}l24 24-24 24-24-24Z"/>`;
  }

  private landmarkSymbol(landmark: MapLandmark): string {
    if (landmark.symbol === 'umbrella') return '<span aria-hidden="true">☂</span>';
    if (landmark.symbol === 'station') return '<span aria-hidden="true">●</span>';
    return '<span aria-hidden="true">◇</span>';
  }

  private photoPanel(state: Readonly<GameState>): string {
    if (this.photoOrder.length === 0) this.photoOrder = [...state.puzzles.photoOrder];
    const rows = this.photoOrder
      .map((id, index) => {
        const photoId = id in photoLabels ? (id as PhotoId) : null;
        const label = photoId
          ? this.translate(photoLabels[photoId])
          : this.translate('legacy.photo.unknown');
        const clue = photoId
          ? this.translate(photoClues[photoId])
          : this.translate('legacy.photo.clue_unknown');
        const [year, moment = this.translate('legacy.photo.moment_unknown')] = label.split(' · ');
        const image = photoId
          ? `<img src="${assetUrl(photoAssets[photoId])}" alt="${this.translate(photoAlt[photoId])}">`
          : `<span class="photo-placeholder" aria-hidden="true">?</span>`;
        return `<li class="photo-card" data-photo-position="${index + 1}"><span class="photo-position" aria-hidden="true"><small>${this.translate('panel.photo.position.prefix')}</small><strong>${index + 1}</strong><small>${this.translate('panel.photo.position.suffix')}</small></span><figure><span class="photo-mat">${image}</span><figcaption><strong>${year}</strong><span>${moment}</span><small>${clue}</small></figcaption></figure><span class="photo-controls" role="group" aria-label="${this.translate('panel.photo.adjust', { label })}"><button data-photo-up="${index}" aria-label="${this.translate('panel.photo.move_earlier', { label })}" ${index === 0 ? 'disabled' : ''}><span aria-hidden="true">←</span> ${this.translate('panel.photo.earlier')}</button><button data-photo-down="${index}" aria-label="${this.translate('panel.photo.move_later', { label })}" ${index === this.photoOrder.length - 1 ? 'disabled' : ''}>${this.translate('panel.photo.later')} <span aria-hidden="true">→</span></button></span></li>`;
      })
      .join('');
    return `<section class="photo-album" aria-labelledby="photo-album-title"><header><p class="album-kicker">${this.translate('panel.photo.kicker')}</p><h2 id="photo-album-title">${this.translate('panel.photo.title')}</h2><p>${this.translate('panel.photo.body')}</p></header><ol class="photo-order">${rows}</ol><footer><span aria-hidden="true">${this.translate('panel.photo.timeline')}</span><button class="primary" data-submit-photos aria-label="${this.translate('panel.photo.confirm_aria')}">${this.translate('panel.photo.confirm')}</button></footer></section>`;
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
      const dialogue = this.dialogueOverlay(state.dialogue[state.dialogueIndex]);
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

  private dialogueOverlay(line: TextRef | string): string {
    return `<button class="dialogue-advance" data-dialogue aria-label="${this.translate('dialogue.continue')}"><span class="dialogue-box"><span class="dialogue-text">${renderText(this.locale, line)}</span><small class="dialogue-hint dialogue-hint-keyboard">${this.translate('dialogue.keyboard_hint')}</small><small class="dialogue-hint dialogue-hint-touch">${this.translate('dialogue.touch_hint')}</small></span></button>`;
  }

  private memoryCutscene(memoryId: MemoryIllustrationId, dialogue: string): string {
    if (memoryId === 'rain') {
      return `<section class="memory-cutscene" aria-label="${this.translate('memory.rain.label')}"><img src="${assetUrl('memory.rain.umbrella.illustration')}" alt="${this.translate('memory.rain.alt')}">${dialogue}</section>`;
    }
    if (memoryId === 'life.move') {
      return `<section class="memory-cutscene" aria-label="${this.translate('memory.life.move.label')}"><img src="${assetUrl('memory.life.move.illustration')}" alt="${this.translate('memory.life.move.alt')}">${dialogue}</section>`;
    }
    if (memoryId === 'life.osmanthus') {
      return `<section class="memory-cutscene" aria-label="${this.translate('memory.life.osmanthus.label')}"><img src="${assetUrl('memory.life.osmanthus.illustration')}" alt="${this.translate('memory.life.osmanthus.alt')}">${dialogue}</section>`;
    }
    if (memoryId === 'life.cassette') {
      return `<section class="memory-cutscene" aria-label="${this.translate('memory.life.cassette.label')}"><img src="${assetUrl('memory.life.cassette.illustration')}" alt="${this.translate('memory.life.cassette.alt')}">${dialogue}</section>`;
    }
    return `<section class="memory-cutscene ending-hand" aria-label="${this.translate('memory.ending.hand.label')}"><img src="${assetUrl('memory.ending.hand.illustration')}" alt="${this.translate('memory.ending.hand.alt')}">${dialogue}</section>`;
  }

  private titleSaveNotice(): string {
    return this.saveNotice
      ? `<p class="title-save-notice" role="status" aria-live="polite">${this.saveNotice}</p>`
      : '';
  }

  private titleScreen(state: Readonly<GameState>): string {
    if (this.titleView === 'mode') return this.modeScreen();
    if (this.titleView === 'new_game_memories') return this.newGameMemoriesScreen();
    if (this.titleView === 'memories') return this.memoriesScreen();
    if (this.titleView === 'settings') return this.titleSettingsScreen(state.settings);
    const latest = this.saves.getMostRecentValidSlot();
    const latestChapter = latest?.chapterId
      ? this.translate(chapterMaps[latest.chapterId].titleKey)
      : null;
    return `<section class="title-screen" aria-labelledby="game-title">
      <div class="title-emblem" aria-hidden="true"><div class="title-art"><span>☂</span></div><span class="emblem-seam"></span></div>
      <header class="title-heading">
        <p class="eyebrow">${this.translate('title.eyebrow')}</p>
        <h1 id="game-title">${this.translate('title.name')}</h1>
        <p class="english-title">THE ERASURE OF ME</p>
      </header>
      <aside class="content-note"><strong>${this.translate('title.content_warning.title')}</strong><span>${this.translate('title.content_warning.body')}</span></aside>
      <nav class="title-menu" aria-label="${this.translate('menu.aria')}">
        <button class="title-menu-card primary" data-continue-latest ${latest ? '' : 'disabled'}><strong>${this.translate('menu.continue')}</strong><span>${latest && latestChapter ? this.translate('menu.continue.description', { slot: this.fragmentNumber(latest.slotId), chapter: latestChapter }) : this.translate('menu.continue.empty')}</span></button>
        <button class="title-menu-card" data-title-view="mode"><strong>${this.translate('menu.start')}</strong><span>${this.translate('menu.start.description')}</span></button>
        <button class="title-menu-card" data-title-view="memories"><strong>${this.translate('menu.memories')}</strong><span>${this.translate('menu.memories.description')}</span></button>
        <button class="title-menu-card" data-title-view="settings"><strong>${this.translate('menu.settings')}</strong><span>${this.translate('menu.settings.description')}</span></button>
      </nav>
      ${this.titleSaveNotice()}
      <p class="controls"><span>${this.translate('controls')}</span><span class="observe-control"><kbd>Shift</kbd> ${this.translate('controls.observe')}</span></p>
    </section>`;
  }

  private modeScreen(): string {
    return `<section class="title-screen title-subpage" aria-labelledby="mode-title"><div class="title-panel title-mode"><header class="title-panel-heading"><p class="eyebrow">${this.translate('start.eyebrow')}</p><h1 id="mode-title">${this.translate('start.mode.title')}</h1><p>${this.translate('start.mode.body')}</p></header><div class="mode-grid"><button class="mode-card primary" data-select-mode="standard"><strong>${this.translate('mode.standard')}</strong><span>${this.translate('mode.standard.description')}</span></button><button class="mode-card" data-select-mode="low_stimulation"><strong>${this.translate('mode.low_stimulation')}</strong><span>${this.translate('mode.low_stimulation.description')}</span></button></div><button class="secondary" data-title-view="home">${this.translate('common.back')}</button></div>${this.titleSaveNotice()}</section>`;
  }

  private newGameMemoriesScreen(): string {
    const fragments = this.saves
      .getSlotSummaries()
      .map(
        (slot) =>
          `<button class="memory-fragment selectable" data-select-start-slot="${slot.slotId}">${this.memoryFragmentSummary(slot)}</button>`,
      )
      .join('');
    return `<section class="title-screen title-subpage" aria-labelledby="new-memory-title"><div class="title-panel title-memory-picker"><header class="title-panel-heading"><p class="eyebrow">${this.translate('start.memories.eyebrow', { mode: this.translate(this.pendingNewMode === 'low_stimulation' ? 'mode.low_stimulation' : 'mode.standard') })}</p><h1 id="new-memory-title">${this.translate('start.memories.title')}</h1><p>${this.translate('start.memories.body')}</p></header><div class="memory-fragment-list">${fragments}</div><button class="secondary" data-title-view="mode">${this.translate('common.back')}</button></div>${this.titleSaveNotice()}</section>`;
  }

  private memoriesScreen(): string {
    const fragments = this.saves
      .getSlotSummaries()
      .map((slot) => {
        const actions =
          slot.status === 'valid'
            ? `<div class="memory-fragment-actions"><button class="continue" data-continue-slot="${slot.slotId}">${this.translate('common.read')}</button><button class="secondary" data-delete-slot="${slot.slotId}">${this.translate('common.delete')}</button></div>`
            : slot.status === 'invalid'
              ? `<div class="memory-fragment-actions single"><button class="secondary" data-delete-slot="${slot.slotId}">${this.translate('common.delete')}</button></div>`
              : '';
        return `<article class="memory-fragment ${slot.status}">${this.memoryFragmentSummary(slot)}${actions}</article>`;
      })
      .join('');
    return `<section class="title-screen title-subpage" aria-labelledby="memories-title"><div class="title-panel title-memories"><header class="title-panel-heading"><p class="eyebrow">${this.translate('memories.eyebrow')}</p><h1 id="memories-title">${this.translate('memories.title')}</h1><p>${this.translate('memories.body')}</p></header><div class="memory-fragment-list">${fragments}</div><button class="secondary" data-title-view="home">${this.translate('common.back')}</button></div>${this.titleSaveNotice()}</section>`;
  }

  private titleSettingsScreen(settings: AccessibilitySettings): string {
    return `<section class="title-screen title-subpage" aria-labelledby="title-settings-title"><div class="title-panel title-settings"><header class="title-panel-heading"><p class="eyebrow">${this.translate('settings.eyebrow')}</p><h1 id="title-settings-title">${this.translate('settings.title')}</h1></header><div class="settings-grid"><fieldset class="settings-section settings-audio"><legend>${this.translate('settings.sound')}</legend>${this.toggle('muted', 'settings.muted', settings.muted)}${this.audioMixer(settings)}</fieldset><fieldset class="settings-section settings-accessibility"><legend>${this.translate('settings.accessibility')}</legend><div class="settings-toggle-list">${this.toggle('reducedMotion', 'settings.reduced_motion', settings.reducedMotion)}${this.toggle('highContrast', 'settings.high_contrast', settings.highContrast)}${this.toggle('subtitles', 'settings.subtitles', settings.subtitles)}</div><div class="settings-select-list"><label><span>${this.translate('settings.font_size')}</span><select data-setting="fontSize"><option value="normal" ${settings.fontSize === 'normal' ? 'selected' : ''}>${this.translate('common.standard')}</option><option value="large" ${settings.fontSize === 'large' ? 'selected' : ''}>${this.translate('common.large')}</option></select></label><label><span>${this.translate('settings.hold_mode')}</span><select data-setting="holdMode"><option value="hold" ${settings.holdMode === 'hold' ? 'selected' : ''}>${this.translate('settings.hold.long')}</option><option value="short" ${settings.holdMode === 'short' ? 'selected' : ''}>${this.translate('settings.hold.short')}</option><option value="single" ${settings.holdMode === 'single' ? 'selected' : ''}>${this.translate('settings.hold.single')}</option></select></label><label><span>${this.translate('settings.language')}</span><select data-setting="localePreference"><option value="system" ${settings.localePreference === 'system' ? 'selected' : ''}>${this.translate('settings.language.system')}</option><option value="zh-CN" ${settings.localePreference === 'zh-CN' ? 'selected' : ''}>${this.translate('settings.language.simplified')}</option><option value="zh-HK" ${settings.localePreference === 'zh-HK' ? 'selected' : ''}>${this.translate('settings.language.traditional')}</option><option value="en" ${settings.localePreference === 'en' ? 'selected' : ''}>${this.translate('settings.language.english')}</option></select></label></div>${this.fullscreenControl()}</fieldset></div><button class="secondary" data-title-view="home">${this.translate('common.back')}</button></div>${this.titleSaveNotice()}</section>`;
  }

  private memoryFragmentSummary(slot: SaveSlotSummary): string {
    const label = this.translate('save.slot', { slot: this.fragmentNumber(slot.slotId) });
    if (slot.status === 'empty')
      return `<span><strong>${label}</strong><small>${this.translate('save.slot.empty')}</small></span>`;
    if (slot.status === 'invalid')
      return `<span><strong>${label}</strong><small>${this.translate('save.slot.invalid')}</small></span>`;
    const chapter = slot.chapterId
      ? this.translate(chapterMaps[slot.chapterId].titleKey)
      : this.translate('legacy.unknown_chapter');
    return `<span><strong>${label}</strong><small>${chapter}</small><time datetime="${slot.savedAt}">${this.formatSavedAt(slot.savedAt)}</time></span>`;
  }

  private fragmentNumber(slotId: SaveSlotId): string {
    return String(slotId).padStart(2, '0');
  }

  private formatSavedAt(savedAt: string | null): string {
    if (!savedAt) return this.translate('save.time_unknown');
    return new Intl.DateTimeFormat(this.locale, {
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
      const label = this.translate('save.slot', { slot: this.fragmentNumber(slot.slotId) });
      return `<div class="scrim save-management-scrim"><section class="paper-panel save-dialog" role="dialog" aria-modal="true" aria-labelledby="start-memory-title"><h2 id="start-memory-title">${empty ? this.translate('save.empty_confirm') : this.translate('save.overwrite_confirm', { label })}</h2>${empty ? '' : `<p>${this.translate('save.overwrite_body')}</p>`}<div class="confirm-row"><button class="primary" data-confirm-start>${empty ? this.translate('common.start') : this.translate('save.overwrite_start')}</button><button data-cancel-title-dialog>${this.translate('common.back')}</button></div></section></div>`;
    }
    if (this.confirmingDeleteSlot) {
      const label = this.translate('save.slot', {
        slot: this.fragmentNumber(this.confirmingDeleteSlot),
      });
      return `<div class="scrim save-management-scrim"><section class="paper-panel save-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-save-title"><h2 id="delete-save-title">${this.translate('save.delete_confirm', { label })}</h2><p>${this.translate('save.delete_body')}</p><div class="confirm-row"><button class="secondary" data-confirm-delete-slot="${this.confirmingDeleteSlot}">${this.translate('save.delete_action')}</button><button data-cancel-title-dialog>${this.translate('common.back')}</button></div></section></div>`;
    }
    return '';
  }

  private d3Training(state: Readonly<GameState>): string {
    const standard = state.mode === 'standard';
    return `<div class="scrim"><section class="paper-panel training" role="dialog" aria-modal="true"><span class="compass ${standard ? 'rotated' : ''}" aria-hidden="true">↑</span><h2>${this.translate(standard ? 'd3.standard.title' : 'd3.low.title')}</h2><p>${this.translate(standard ? 'd3.standard.body' : 'd3.low.body')}</p><p>${this.translate('d3.common.body')}</p><button class="primary" data-ack-d3>${this.translate('d3.ready')}</button></section></div>`;
  }

  private pauseScreen(state: Readonly<GameState>): string {
    const settings = state.settings;
    return `<div class="scrim"><section class="paper-panel pause-panel" role="dialog" aria-modal="true"><header class="pause-heading"><div><p class="eyebrow">${this.translate(chapterMaps[state.chapterId].titleKey)}</p><h2>${this.translate('pause.title')}</h2></div><button class="primary" data-close>${this.translate('common.continue')}</button></header><fieldset><legend>${this.translate('pause.settings')}</legend><div class="pause-quick-settings">${this.toggle('muted', 'settings.muted', settings.muted)}${this.toggle('reducedMotion', 'settings.reduced_motion', settings.reducedMotion)}${this.toggle('highContrast', 'settings.high_contrast', settings.highContrast)}${this.toggle('subtitles', 'settings.subtitles', settings.subtitles)}<label>${this.translate('settings.font_size')}<select data-setting="fontSize"><option value="normal" ${settings.fontSize === 'normal' ? 'selected' : ''}>${this.translate('common.standard')}</option><option value="large" ${settings.fontSize === 'large' ? 'selected' : ''}>${this.translate('common.large')}</option></select></label><label>${this.translate('settings.hold_mode')}<select data-setting="holdMode"><option value="hold" ${settings.holdMode === 'hold' ? 'selected' : ''}>${this.translate('settings.hold.long')}</option><option value="short" ${settings.holdMode === 'short' ? 'selected' : ''}>${this.translate('settings.hold.short')}</option><option value="single" ${settings.holdMode === 'single' ? 'selected' : ''}>${this.translate('settings.hold.single')}</option></select></label><label>${this.translate('settings.language')}<select data-setting="localePreference"><option value="system" ${settings.localePreference === 'system' ? 'selected' : ''}>${this.translate('settings.language.system')}</option><option value="zh-CN" ${settings.localePreference === 'zh-CN' ? 'selected' : ''}>${this.translate('settings.language.simplified')}</option><option value="zh-HK" ${settings.localePreference === 'zh-HK' ? 'selected' : ''}>${this.translate('settings.language.traditional')}</option><option value="en" ${settings.localePreference === 'en' ? 'selected' : ''}>${this.translate('settings.language.english')}</option></select></label><label>${this.translate('settings.mode')}<select data-mode><option value="standard" ${state.mode === 'standard' ? 'selected' : ''}>${this.translate('mode.standard')}</option><option value="low_stimulation" ${state.mode === 'low_stimulation' ? 'selected' : ''}>${this.translate('mode.low_stimulation')}</option></select></label>${this.fullscreenControl()}<details class="clear-data" ${this.confirmingClearData ? 'open' : ''}><summary>${this.translate('save.clear.title')}</summary><p class="muted">${this.translate('save.clear.body')}</p>${this.clearDataControl()}</details></div>${this.audioMixer(settings)}</fieldset><button class="secondary" data-title>${this.translate('settings.return_title')}</button></section></div>`;
  }

  private clearDataControl(): string {
    return this.confirmingClearData
      ? `<div class="confirm-row" role="group" aria-label="${this.translate('save.clear.confirm')}"><button class="secondary" data-confirm-clear>${this.translate('save.clear.confirm')}</button><button data-cancel-clear>${this.translate('common.cancel')}</button></div>`
      : `<button class="secondary" data-request-clear>${this.translate('save.clear.request')}</button>`;
  }

  private audioMixer(settings: AccessibilitySettings): string {
    const labels: Record<keyof AccessibilitySettings['audioVolumes'], string> = {
      music: 'settings.audio.music',
      ambience: 'settings.audio.ambience',
      voice: 'settings.audio.voice',
      sfx: 'settings.audio.sfx',
    };
    return `<div class="audio-mixer" role="group" aria-label="${this.translate('settings.volume_mixer')}">${Object.entries(
      labels,
    )
      .map(([bus, label]) => {
        const value = settings.audioVolumes[bus as keyof typeof settings.audioVolumes];
        return `<label>${this.translate(label)}<input type="range" min="0" max="1" step="0.05" value="${value}" data-audio-bus="${bus}"><output>${Math.round(value * 100)}%</output></label>`;
      })
      .join('')}</div>`;
  }

  private toggle(key: keyof AccessibilitySettings, label: string, checked: boolean): string {
    return `<label class="toggle"><input type="checkbox" data-setting="${key}" ${checked ? 'checked' : ''}><span>${this.translate(label)}</span></label>`;
  }

  private guideScreen(): string {
    const signs = Array.from(
      { length: 6 },
      (_, index) => `<li>${this.translate(`guide.signs.${index + 1}`)}</li>`,
    ).join('');
    const actions = Array.from(
      { length: 6 },
      (_, index) => `<li>${this.translate(`guide.actions.${index + 1}`)}</li>`,
    ).join('');
    return `<article class="guide-page"><header><p class="eyebrow">${this.translate('guide.eyebrow')}</p><h1>${this.translate('guide.title')}</h1><p class="disclaimer">${this.translate('guide.disclaimer')}</p></header><section><h2>${this.translate('guide.signs.title')}</h2><ul>${signs}</ul><p>${this.translate('guide.signs.body')}</p></section><section><h2>${this.translate('guide.actions.title')}</h2><ol>${actions}</ol></section><aside class="game-notice"><h2>${this.translate('guide.game.title')}</h2><p>${this.translate('guide.game.body')}</p></aside><section><h2>${this.translate('guide.sources.title')}</h2><ul><li><a href="https://www.who.int/news-room/fact-sheets/detail/dementia" target="_blank" rel="noopener noreferrer">${this.translate('guide.source.who')}</a></li><li><a href="https://www.gov.cn/zhengce/zhengceku/202501/content_6996231.htm" target="_blank" rel="noopener noreferrer">${this.translate('guide.source.cn_action')}</a></li><li><a href="https://www.gov.cn/zhengce/202501/content_6996237.htm" target="_blank" rel="noopener noreferrer">${this.translate('guide.source.cn_explain')}</a></li></ul><p class="muted">${this.translate('guide.sources.checked')}</p></section><section><h2>${this.translate('guide.credits.title')}</h2><p>${this.translate('guide.credits.body')}</p><p class="muted">${this.translate('guide.credits.body2')}</p></section><footer><button class="primary" data-title>${this.translate('common.back')}</button><button class="secondary" data-start-game>${this.translate('common.start')}</button></footer></article>`;
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
      this.saveNotice = this.translate('save.failed');
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
    this.saveNotice = this.translate('save.slot.read_failed', {
      slot: this.fragmentNumber(slotId),
    });
    this.signature = '';
    this.render(state);
  }

  private saveBeforeLeaving(state: Readonly<GameState>): void {
    if (state.phase === 'title') return;
    this.reportSaveResult(this.saves.saveActive(state));
  }

  private bindEvents(state: Readonly<GameState>): void {
    const debugPanel = document.querySelector<HTMLElement>('.debug-panel');
    const debugDragHandle = debugPanel?.querySelector<HTMLElement>('[data-debug-drag-handle]');
    if (debugPanel && debugDragHandle) {
      enableDevPanelDrag(debugPanel, debugDragHandle, {
        initialPosition: this.debugPanelPosition,
        onPositionChange: (position) => {
          this.debugPanelPosition = position;
        },
      });
    }
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
        this.titleDialogReturnFocusSelector = `[data-select-start-slot="${button.dataset.selectStartSlot}"]`;
        this.signature = '';
        this.render(state);
      }),
    );
    document.querySelectorAll<HTMLElement>('[data-confirm-start]').forEach((button) =>
      button.addEventListener('click', () => {
        if (!this.pendingNewMode || !this.confirmingStartSlot) return;
        const slotId = this.confirmingStartSlot;
        this.titleDialogReturnFocusSelector = null;
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
        if (latest) {
          this.continueFromSlot(latest.slotId, state);
        }
      }),
    );
    document.querySelectorAll<HTMLElement>('[data-continue-slot]').forEach((button) =>
      button.addEventListener('click', () => {
        this.continueFromSlot(Number(button.dataset.continueSlot) as SaveSlotId, state);
      }),
    );
    document
      .querySelectorAll<HTMLElement>('[data-fullscreen-toggle]')
      .forEach((button) => button.addEventListener('click', () => void this.toggleFullscreen()));
    document.querySelectorAll<HTMLElement>('[data-delete-slot]').forEach((button) =>
      button.addEventListener('click', () => {
        this.confirmingDeleteSlot = Number(button.dataset.deleteSlot) as SaveSlotId;
        this.pendingNewMode = null;
        this.titleDialogReturnFocusSelector = `[data-delete-slot="${button.dataset.deleteSlot}"]`;
        this.signature = '';
        this.render(state);
      }),
    );
    document.querySelectorAll<HTMLElement>('[data-confirm-delete-slot]').forEach((button) =>
      button.addEventListener('click', () => {
        const slotId = Number(button.dataset.confirmDeleteSlot) as SaveSlotId;
        this.saveNotice = this.saves.deleteSlot(slotId)
          ? this.translate('save.delete_done', { slot: this.fragmentNumber(slotId) })
          : this.translate('save.delete_failed', { slot: this.fragmentNumber(slotId) });
        this.confirmingDeleteSlot = null;
        this.titleDialogReturnFocusSelector = null;
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
        this.restoreTitleDialogFocus();
      }),
    );
    document.querySelectorAll<HTMLElement>('[data-open]').forEach((button) =>
      button.addEventListener('click', () => {
        button.focus({ preventScroll: true });
        this.store.dispatch({
          type: 'OPEN_MODAL',
          modal: button.dataset.open as Exclude<ModalId, null>,
        });
      }),
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
        this.titleDialogReturnFocusSelector = '[data-request-clear]';
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
        this.restoreTitleDialogFocus();
      }),
    );
    document.querySelectorAll<HTMLElement>('[data-confirm-clear]').forEach((button) =>
      button.addEventListener('click', () => {
        if (!this.saves.clearAll()) {
          this.saveNotice = this.translate('save.clear_failed');
          this.signature = '';
          this.render(this.store.getState());
          return;
        }
        this.confirmingClearData = false;
        this.titleDialogReturnFocusSelector = null;
        // 先同步设置持久化基线，再用 SETTINGS 把内存设置重置为默认值，
        // 这样随后的分派不会把 clearAll() 刚删除的设置键写回本地存储。
        this.options?.onSettingsCleared?.();
        this.store.dispatch({ type: 'SETTINGS', patch: normalizeSettings() });
        this.store.dispatch({ type: 'RETURN_TITLE' });
        this.saveNotice = this.translate('save.cleared');
        this.signature = '';
        this.render(this.store.getState());
      }),
    );
    document
      .querySelectorAll<HTMLButtonElement>('[data-dialogue]')
      .forEach((button) => this.bindDialogueAdvance(button));
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

  private bindDialogueAdvance(button: HTMLButtonElement): void {
    const maximumPointerDistanceSquared = 12 * 12;
    const maximumPointerDurationMs = 600;
    let activePointerId: number | null = null;
    let pointerStartedAt = 0;
    let pointerStartX = 0;
    let pointerStartY = 0;
    let pointerMoved = false;
    let allowPointerClick = false;

    button.addEventListener('keydown', (event) => {
      if (event.code !== 'KeyE' || event.repeat || event.altKey || event.ctrlKey || event.metaKey)
        return;
      event.preventDefault();
      const sourceId = 'keyboard:dialogue:KeyE';
      this.semanticInput.press('interact', sourceId);
      this.semanticInput.release('interact', sourceId);
    });
    button.addEventListener('pointerdown', (event) => {
      if (!event.isPrimary || event.button !== 0) return;
      activePointerId = event.pointerId;
      pointerStartedAt = event.timeStamp;
      pointerStartX = event.clientX;
      pointerStartY = event.clientY;
      pointerMoved = false;
      allowPointerClick = false;
    });
    button.addEventListener('pointermove', (event) => {
      if (event.pointerId !== activePointerId) return;
      const deltaX = event.clientX - pointerStartX;
      const deltaY = event.clientY - pointerStartY;
      if (deltaX * deltaX + deltaY * deltaY > maximumPointerDistanceSquared) pointerMoved = true;
    });
    button.addEventListener('pointerup', (event) => {
      if (event.pointerId !== activePointerId) return;
      allowPointerClick =
        !pointerMoved && event.timeStamp - pointerStartedAt <= maximumPointerDurationMs;
      activePointerId = null;
    });
    button.addEventListener('pointercancel', () => {
      activePointerId = null;
      allowPointerClick = false;
    });
    button.addEventListener('click', (event) => {
      const keyboardActivation = event.detail === 0;
      if (!keyboardActivation && !allowPointerClick) return;
      allowPointerClick = false;
      this.store.dispatch({ type: 'ADVANCE_DIALOGUE' });
    });
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
