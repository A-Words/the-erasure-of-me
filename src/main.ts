import './styles.css';
import { createGame } from './phaser/config';
import { GameStore } from './game/state/GameStore';
import { createInitialState, normalizeSettings } from './game/state/initialState';
import { SaveRepository } from './save/SaveRepository';
import { AppShell } from './ui/AppShell';
import { AudioManager } from './phaser/audio/AudioManager';
import { TiledCollisionProvider } from './game/content/collisionProvider';
import {
  createPresentationSnapshot,
  diffPresentationSnapshots,
} from './game/presentation/presentationEvents';
import type { GameState } from './game/state/GameState';
import type {
  PresentationEvent,
  PresentationSnapshot,
  RainStoneStep,
} from './game/presentation/presentationEvents';
import type { SemanticAudioCue } from './phaser/audio/AudioManager';
import type { SaveSlotId } from './save/SaveRepository';

const rainStoneCues: Record<RainStoneStep, SemanticAudioCue> = {
  1: 'rain_stone_1',
  2: 'rain_stone_2',
  3: 'rain_stone_3',
};

function audioCueForPresentationEvent(event: PresentationEvent): SemanticAudioCue {
  switch (event.type) {
    case 'rain_stone_progress':
      return rainStoneCues[event.step];
    case 'rain_sign_progress':
      return 'rain_wayfinder';
    case 'life_object_restored':
      return 'life_object_returned';
    case 'return_prefix_progress':
      return 'return_path_step';
    case 'return_junction_completed':
      return 'return_junction';
    case 'memory_added':
      return 'memory_recalled';
    case 'ending_handshake_completed':
      return 'ending_handshake';
  }
}

function progressSignature(state: Readonly<GameState>): string {
  return JSON.stringify({
    phase: state.phase,
    checkpoint: state.checkpointId,
    inventory: state.inventory,
    journal: state.journalPages,
    memories: state.memories,
    flags: state.flags,
    puzzles: state.puzzles,
    mode: state.mode,
    rainMapClosedAtX: state.rainMapClosedAtX,
  });
}

async function loadJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status}`);
  return (await response.json()) as T;
}

async function bootstrap(): Promise<void> {
  const mapIds = [
    'map.home',
    'map.rain_station',
    'map.shared_life',
    'map.return_corridor',
    'map.home_ending',
  ];
  const baseUrl = import.meta.env.BASE_URL;
  const tiledJsons: Record<string, unknown> = {};
  for (const mapId of mapIds) {
    tiledJsons[mapId] = await loadJson<unknown>(`${baseUrl}assets/data/${mapId}.json`);
  }
  const collisionProvider = new TiledCollisionProvider(tiledJsons);
  const store = new GameStore(createInitialState(), collisionProvider);
  const saves = new SaveRepository();
  const audio = new AudioManager();
  const savedSettings = saves.loadSettings();
  if (savedSettings) store.dispatch({ type: 'SETTINGS', patch: savedSettings });
  const game = createGame(store);
  game.canvas.tabIndex = 0;
  game.canvas.setAttribute('aria-label', '可操作游戏画面');
  game.canvas.addEventListener('pointerdown', () => game.canvas.focus());
  let lastSettingsSignature = '';
  const appShell = new AppShell(store, saves, {
    onSettingsCleared: () => {
      // clearAll() 已删除设置键；把基线对齐到默认设置，使随后的 SETTINGS 分派不再写回该键。
      lastSettingsSignature = JSON.stringify(normalizeSettings());
    },
  });
  const unlockAudio = () => void audio.unlock();
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);

  let lastSaveSignature = '';
  let lastActiveSlot: SaveSlotId | null = null;
  let previousPresentationSnapshot: Readonly<PresentationSnapshot> | null = null;
  let lastAudioMessage: string | null = null;
  let wasPaused = false;
  store.subscribe((state) => {
    audio.setSettings(state.settings);
    audio.setChapter(state.phase === 'playing' ? state.chapterId : null);

    const previousSnapshot = previousPresentationSnapshot;
    const presentationSnapshot = createPresentationSnapshot(state);
    const presentationEvents = diffPresentationSnapshots(previousSnapshot, presentationSnapshot);
    previousPresentationSnapshot = presentationSnapshot;
    for (const event of presentationEvents) {
      audio.play(audioCueForPresentationEvent(event));
    }

    const messageChanged = state.message !== lastAudioMessage;
    lastAudioMessage = state.message;
    const remainsInPlayingChapter =
      previousSnapshot?.phase === 'playing' &&
      state.phase === 'playing' &&
      previousSnapshot.chapterId === state.chapterId;
    if (
      state.message &&
      messageChanged &&
      presentationEvents.length === 0 &&
      remainsInPlayingChapter
    ) {
      audio.play('soft_feedback');
    }
    const settingsSignature = JSON.stringify(state.settings);
    if (settingsSignature !== lastSettingsSignature) {
      if (saves.saveSettings(state.settings)) {
        lastSettingsSignature = settingsSignature;
      } else {
        appShell.reportSaveResult({ ok: false, reason: 'storage_error' });
      }
    }
    if (state.phase === 'title') {
      lastSaveSignature = '';
      lastActiveSlot = null;
      wasPaused = false;
      return;
    }
    const activeSlot = saves.getActiveSlot();
    if (!activeSlot) return;
    if (activeSlot !== lastActiveSlot) {
      lastActiveSlot = activeSlot;
      const existing = saves.loadSlot(activeSlot, state.settings);
      lastSaveSignature = existing ? progressSignature(existing) : '';
    }
    const signature = progressSignature(state);
    let savedThisEmission = false;
    if (signature !== lastSaveSignature) {
      const result = saves.saveActive(state);
      if (result.ok) {
        lastSaveSignature = signature;
        savedThisEmission = true;
      }
      appShell.reportSaveResult(result);
    }
    const paused = state.phase === 'playing' && state.modal === 'pause';
    if (paused && !wasPaused && !savedThisEmission) {
      appShell.reportSaveResult(saves.saveActive(state));
    }
    wasPaused = paused;
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      void audio.suspend();
      const state = store.getState();
      if (state.phase === 'playing' && state.modal !== 'pause') {
        store.dispatch({ type: 'OPEN_MODAL', modal: 'pause' });
      }
    }
  });

  window.addEventListener('beforeunload', () => {
    saves.saveActive(store.getState());
    game.destroy(true);
  });
}

void bootstrap();
