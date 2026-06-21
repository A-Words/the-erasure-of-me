import type { GameState } from '../game/state/GameState';

const SAVE_KEY = 'erasure.save.v1';
const SETTINGS_KEY = 'erasure.settings.v1';

export class SaveRepository {
  hasSave(): boolean {
    return localStorage.getItem(SAVE_KEY) !== null;
  }

  save(state: Readonly<GameState>): void {
    if (state.phase === 'title') return;
    const snapshot = structuredClone(state) as GameState;
    snapshot.modal = null;
    snapshot.dialogue = [];
    snapshot.dialogueIndex = 0;
    snapshot.activeMemoryId = null;
    snapshot.player.moving = false;
    localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot));
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  }

  load(): GameState | null {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as GameState;
      if (parsed.schemaVersion !== 1 || !parsed.chapterId || !parsed.player) return null;
      parsed.phase = 'playing';
      parsed.modal = null;
      parsed.dialogue = [];
      parsed.dialogueIndex = 0;
      parsed.activeMemoryId = null;
      parsed.hintSeconds ??= 0;
      parsed.hintLevel ??= 0;
      return parsed;
    } catch {
      return null;
    }
  }

  clear(): void {
    localStorage.removeItem(SAVE_KEY);
  }
}
