import './styles.css';
import { createGame } from './phaser/config';
import { GameStore } from './game/state/GameStore';
import { createInitialState } from './game/state/initialState';
import { SaveRepository } from './save/SaveRepository';
import { AppShell } from './ui/AppShell';
import { AudioManager } from './phaser/audio/AudioManager';
import { TiledCollisionProvider } from './game/content/collisionProvider';

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
  const tiledJsons: Record<string, unknown> = {};
  for (const mapId of mapIds) {
    try {
      tiledJsons[mapId] = await loadJson<unknown>(`/assets/data/${mapId}.json`);
    } catch {
      // Map JSON may fail to load in some environments; provider will use fallback.
    }
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
  new AppShell(store, saves);
  const unlockAudio = () => void audio.unlock();
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);

  let lastSaveSignature = '';
  let lastAudioMessage = '';
  store.subscribe((state) => {
    audio.setSettings(state.settings);
    audio.setChapter(state.phase === 'playing' ? state.chapterId : null);
    if (state.message && state.message !== lastAudioMessage) {
      lastAudioMessage = state.message;
      audio.play('soft_feedback');
    }
    if (state.phase === 'title') return;
    const signature = JSON.stringify({
      phase: state.phase,
      checkpoint: state.checkpointId,
      inventory: state.inventory,
      journal: state.journalPages,
      memories: state.memories,
      flags: state.flags,
      puzzles: state.puzzles,
      mode: state.mode,
      settings: state.settings,
    });
    if (signature !== lastSaveSignature) {
      lastSaveSignature = signature;
      saves.save(state);
    }
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

  window.addEventListener('beforeunload', () => game.destroy(true));
}

void bootstrap();
