import type {
  AccessibilitySettings,
  ChapterId,
  GameMode,
  GameState,
} from '../game/state/GameState';
import { createInitialState, normalizeSettings } from '../game/state/initialState';
import { chapterMaps, getCheckpointSpawn } from '../game/content/maps';

const LEGACY_SAVE_KEY = 'erasure.save.v1';
const SETTINGS_KEY = 'erasure.settings.v1';

export const SAVE_SLOT_IDS = [1, 2, 3] as const;
export type SaveSlotId = (typeof SAVE_SLOT_IDS)[number];
export type SaveSlotStatus = 'empty' | 'valid' | 'invalid';

export interface SaveSlotRecordV1 {
  formatVersion: 1;
  savedAt: string;
  state: GameState;
}

export interface SaveSlotSummary {
  slotId: SaveSlotId;
  status: SaveSlotStatus;
  savedAt: string | null;
  chapterId: ChapterId | null;
  checkpointId: string | null;
  mode: GameMode | null;
  playTimeSeconds: number | null;
}

export type SaveResult =
  | { ok: true; summary: SaveSlotSummary }
  | { ok: false; reason: 'no_active_slot' | 'not_playing' | 'storage_error' };

export function saveSlotKey(slotId: SaveSlotId): string {
  return `erasure.save.slot.${slotId}.v1`;
}

function emptySummary(slotId: SaveSlotId): SaveSlotSummary {
  return {
    slotId,
    status: 'empty',
    savedAt: null,
    chapterId: null,
    checkpointId: null,
    mode: null,
    playTimeSeconds: null,
  };
}

function invalidSummary(slotId: SaveSlotId): SaveSlotSummary {
  return { ...emptySummary(slotId), status: 'invalid' };
}

export class SaveRepository {
  private activeSlot: SaveSlotId | null = null;

  constructor(
    private readonly storage: Storage = localStorage,
    private readonly now: () => Date = () => new Date(),
  ) {}

  getActiveSlot(): SaveSlotId | null {
    return this.activeSlot;
  }

  setActiveSlot(slotId: SaveSlotId | null): void {
    this.activeSlot = slotId;
  }

  getSlotSummaries(): SaveSlotSummary[] {
    return SAVE_SLOT_IDS.map((slotId) => this.getSlotSummary(slotId));
  }

  getSlotSummary(slotId: SaveSlotId): SaveSlotSummary {
    const raw = this.safeGetItem(saveSlotKey(slotId));
    if (raw === null) return emptySummary(slotId);
    const record = this.parseRecord(raw);
    return record ? this.summaryFromRecord(slotId, record) : invalidSummary(slotId);
  }

  getFirstEmptySlot(): SaveSlotId | null {
    return this.getSlotSummaries().find((slot) => slot.status === 'empty')?.slotId ?? null;
  }

  getMostRecentValidSlot(): SaveSlotSummary | null {
    return (
      this.getSlotSummaries()
        .filter(
          (slot): slot is SaveSlotSummary & { savedAt: string } =>
            slot.status === 'valid' && slot.savedAt !== null,
        )
        .sort(
          (left, right) =>
            Date.parse(right.savedAt) - Date.parse(left.savedAt) || left.slotId - right.slotId,
        )[0] ?? null
    );
  }

  saveToSlot(slotId: SaveSlotId, state: Readonly<GameState>): SaveResult {
    if (state.phase === 'title') return { ok: false, reason: 'not_playing' };
    const record: SaveSlotRecordV1 = {
      formatVersion: 1,
      savedAt: this.now().toISOString(),
      state: this.createSnapshot(state),
    };
    try {
      this.storage.setItem(saveSlotKey(slotId), JSON.stringify(record));
      return { ok: true, summary: this.summaryFromRecord(slotId, record) };
    } catch {
      return { ok: false, reason: 'storage_error' };
    }
  }

  saveActive(state: Readonly<GameState>): SaveResult {
    if (!this.activeSlot) return { ok: false, reason: 'no_active_slot' };
    return this.saveToSlot(this.activeSlot, state);
  }

  loadSlot(slotId: SaveSlotId, settings?: AccessibilitySettings): GameState | null {
    const raw = this.safeGetItem(saveSlotKey(slotId));
    if (raw === null) return null;
    const state = this.parseRecord(raw)?.state ?? null;
    if (!state) return null;
    if (settings) state.settings = normalizeSettings(settings);
    return state;
  }

  deleteSlot(slotId: SaveSlotId): boolean {
    try {
      this.storage.removeItem(saveSlotKey(slotId));
      if (this.activeSlot === slotId) this.activeSlot = null;
      return true;
    } catch {
      return false;
    }
  }

  loadSettings(): AccessibilitySettings | null {
    const raw = this.safeGetItem(SETTINGS_KEY);
    if (raw === null) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      return normalizeSettings(parsed);
    } catch {
      return null;
    }
  }

  saveSettings(settings: AccessibilitySettings): boolean {
    try {
      this.storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      return true;
    } catch {
      return false;
    }
  }

  clearAll(): boolean {
    try {
      for (const slotId of SAVE_SLOT_IDS) this.storage.removeItem(saveSlotKey(slotId));
      this.storage.removeItem(LEGACY_SAVE_KEY);
      this.storage.removeItem(SETTINGS_KEY);
      this.activeSlot = null;
      return true;
    } catch {
      return false;
    }
  }

  private safeGetItem(key: string): string | null {
    try {
      return this.storage.getItem(key);
    } catch {
      return null;
    }
  }

  private createSnapshot(state: Readonly<GameState>): GameState {
    const snapshot = structuredClone(state) as GameState;
    snapshot.phase = 'playing';
    snapshot.modal = null;
    snapshot.dialogue = [];
    snapshot.dialogueIndex = 0;
    snapshot.activeMemoryId = null;
    snapshot.holdProgress = 0;
    snapshot.mapWashSeconds = 0;
    snapshot.player.moving = false;
    return snapshot;
  }

  private summaryFromRecord(slotId: SaveSlotId, record: SaveSlotRecordV1): SaveSlotSummary {
    return {
      slotId,
      status: 'valid',
      savedAt: record.savedAt,
      chapterId: record.state.chapterId,
      checkpointId: record.state.checkpointId,
      mode: record.state.mode,
      playTimeSeconds: record.state.playTimeSeconds,
    };
  }

  private parseRecord(raw: string): SaveSlotRecordV1 | null {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      const record = parsed as Partial<SaveSlotRecordV1>;
      if (
        record.formatVersion !== 1 ||
        typeof record.savedAt !== 'string' ||
        !Number.isFinite(Date.parse(record.savedAt)) ||
        !record.state
      ) {
        return null;
      }
      const state = this.parseState(record.state);
      return state ? { formatVersion: 1, savedAt: record.savedAt, state } : null;
    } catch {
      return null;
    }
  }

  private parseState(candidate: unknown): GameState | null {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
    const parsed = candidate as GameState;
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
    ) {
      return null;
    }
    const map = chapterMaps[parsed.chapterId];
    const defaultPuzzles = createInitialState(parsed.mode).puzzles;
    const savedPuzzles = parsed.puzzles as Partial<GameState['puzzles']>;
    parsed.puzzles = {
      stationSequence: Array.isArray(savedPuzzles.stationSequence)
        ? savedPuzzles.stationSequence.filter((value): value is number => Number.isFinite(value))
        : defaultPuzzles.stationSequence,
      rainSigns: Array.isArray(savedPuzzles.rainSigns)
        ? savedPuzzles.rainSigns.filter((value): value is string => typeof value === 'string')
        : defaultPuzzles.rainSigns,
      photoOrder: Array.isArray(savedPuzzles.photoOrder)
        ? savedPuzzles.photoOrder.filter((value): value is string => typeof value === 'string')
        : defaultPuzzles.photoOrder,
      placedObjects: Array.isArray(savedPuzzles.placedObjects)
        ? savedPuzzles.placedObjects.filter((value): value is string => typeof value === 'string')
        : defaultPuzzles.placedObjects,
      returnJunction: Number.isFinite(savedPuzzles.returnJunction)
        ? Math.max(0, Math.min(3, Math.trunc(savedPuzzles.returnJunction as number)))
        : defaultPuzzles.returnJunction,
      returnPrefix: Array.isArray(savedPuzzles.returnPrefix)
        ? savedPuzzles.returnPrefix.filter(
            (value): value is GameState['puzzles']['returnPrefix'][number] =>
              value === 'up' || value === 'down' || value === 'left' || value === 'right',
          )
        : defaultPuzzles.returnPrefix,
      routeLoops: Number.isFinite(savedPuzzles.routeLoops)
        ? Math.max(0, Math.trunc(savedPuzzles.routeLoops as number))
        : defaultPuzzles.routeLoops,
    };
    if (
      !Number.isFinite(parsed.player.x) ||
      !Number.isFinite(parsed.player.y) ||
      parsed.player.x < 0 ||
      parsed.player.x > map.width ||
      parsed.player.y < 0 ||
      parsed.player.y > map.height
    ) {
      parsed.player =
        getCheckpointSpawn(parsed.checkpointId, parsed.chapterId) ??
        ({ ...map.spawn, facing: 'down', moving: false } satisfies GameState['player']);
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
    parsed.holdProgress = 0;
    parsed.mapWashSeconds = 0;
    parsed.rainMapClosedAtX = Number.isFinite(parsed.rainMapClosedAtX)
      ? parsed.rainMapClosedAtX
      : null;
    parsed.playTimeSeconds ??= 0;
    return parsed;
  }
}
