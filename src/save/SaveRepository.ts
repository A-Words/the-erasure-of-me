import type { AccessibilitySettings, GameState } from '../game/state/GameState';
import { normalizeSettings } from '../game/state/initialState';
import { chapterMaps } from '../game/content/maps';

const SAVE_KEY = 'erasure.save.v1';
const SETTINGS_KEY = 'erasure.settings.v1';

export type SaveStatus = 'none' | 'valid' | 'invalid';

export class SaveRepository {
  getSaveStatus(): SaveStatus {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return 'none';
    return this.parse(raw) ? 'valid' : 'invalid';
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
    return this.parse(raw);
  }

  loadSettings(): AccessibilitySettings | null {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      return normalizeSettings(parsed);
    } catch {
      return null;
    }
  }

  clear(): void {
    localStorage.removeItem(SAVE_KEY);
  }

  clearAll(): void {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem(SETTINGS_KEY);
  }

  private parse(raw: string): GameState | null {
    try {
      const parsed = JSON.parse(raw) as GameState;
      if (
        parsed.schemaVersion !== 1 ||
        !Object.hasOwn(chapterMaps, parsed.chapterId) ||
        typeof parsed.checkpointId !== 'string' ||
        !parsed.player ||
        !Array.isArray(parsed.inventory) ||
        !Array.isArray(parsed.journalPages) ||
        !Array.isArray(parsed.memories) ||
        !Array.isArray(parsed.flags) ||
        !parsed.puzzles
      )
        return null;
      const map = chapterMaps[parsed.chapterId];
      if (
        !Number.isFinite(parsed.player.x) ||
        !Number.isFinite(parsed.player.y) ||
        parsed.player.x < 0 ||
        parsed.player.x > map.width ||
        parsed.player.y < 0 ||
        parsed.player.y > map.height
      ) {
        parsed.player = { ...map.spawn, facing: 'down', moving: false };
      }
      parsed.phase = 'playing';
      parsed.modal = null;
      parsed.dialogue = [];
      parsed.dialogueIndex = 0;
      parsed.activeMemoryId = null;
      parsed.player.moving = false;
      parsed.settings = normalizeSettings(parsed.settings ?? {});
      parsed.hintSeconds ??= 0;
      parsed.hintLevel ??= 0;
      parsed.holdProgress ??= 0;
      parsed.playTimeSeconds ??= 0;
      return parsed;
    } catch {
      return null;
    }
  }
}
