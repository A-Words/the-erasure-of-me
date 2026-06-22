import './styles.css';
import { createGame } from './phaser/config';
import { GameStore } from './game/state/GameStore';
import { SaveRepository } from './save/SaveRepository';
import { AppShell } from './ui/AppShell';
import { AudioManager } from './phaser/audio/AudioManager';

const store = new GameStore();
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
