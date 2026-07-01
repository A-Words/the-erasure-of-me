import './styles.css';
import { createGame } from './phaser/config';
import { GameStore } from './game/state/GameStore';
import { createInitialState, normalizeSettings } from './game/state/initialState';
import { SaveRepository } from './save/SaveRepository';
import { AppShell } from './ui/AppShell';
import { AudioManager } from './phaser/audio/AudioManager';
import { TiledCollisionProvider } from './game/content/collisionProvider';
import type { GameState } from './game/state/GameState';
import type { SaveSlotId } from './save/SaveRepository';

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
  let lastAudioMessage = '';
  let wasPaused = false;
  store.subscribe((state) => {
    audio.setSettings(state.settings);
    audio.setChapter(state.phase === 'playing' ? state.chapterId : null);
    if (state.message && state.message !== lastAudioMessage) {
      lastAudioMessage = state.message;
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
