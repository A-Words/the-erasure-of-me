import './styles.css';
import { createGame } from './phaser/config';
import { GameStore } from './game/state/GameStore';
import { SaveRepository } from './save/SaveRepository';
import { AppShell } from './ui/AppShell';
import { AudioManager, type SemanticAudioCue } from './phaser/audio/AudioManager';

const store = new GameStore();
const saves = new SaveRepository();
const audio = new AudioManager();
const game = createGame(store);
game.canvas.tabIndex = 0;
game.canvas.setAttribute('aria-label', '可操作游戏画面');
game.canvas.addEventListener('pointerdown', () => game.canvas.focus());
new AppShell(store, saves);
const unlockAudio = () => void audio.unlock();
window.addEventListener('pointerdown', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });

let lastSaveSignature = '';
let lastAudioChapter = '';
let lastAudioMessage = '';
store.subscribe((state) => {
  audio.setMuted(state.settings.muted);
  if (state.phase === 'playing' && state.chapterId !== lastAudioChapter) {
    lastAudioChapter = state.chapterId;
    const chapterCues: Record<string, SemanticAudioCue> = {
      home: 'home_clock',
      rain: 'rain_bell',
      life: 'life_memory',
      return: 'return_hum',
      ending: 'ending_warmth',
    };
    audio.play(chapterCues[state.chapterId]);
  }
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

window.addEventListener('beforeunload', () => game.destroy(true));
