import { beforeEach, describe, expect, it } from 'vitest';
import { createInitialState } from '../../src/game/state/initialState';
import { SAVE_SLOT_IDS, SaveRepository, saveSlotKey } from '../../src/save/SaveRepository';

class MemoryStorage implements Storage {
  protected readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

class ThrowingStorage extends MemoryStorage {
  override setItem(): void {
    throw new DOMException('Quota exceeded', 'QuotaExceededError');
  }
}

describe('SaveRepository', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it('keeps three save slots isolated and reports their summaries', () => {
    const repository = new SaveRepository(storage, () => new Date('2026-06-29T08:00:00.000Z'));
    const first = createInitialState();
    first.phase = 'playing';
    const second = createInitialState('low_stimulation');
    second.phase = 'playing';
    second.chapterId = 'rain';
    second.checkpointId = 'checkpoint.rain.start';
    second.playTimeSeconds = 375;

    expect(repository.saveToSlot(1, first).ok).toBe(true);
    expect(repository.saveToSlot(2, second).ok).toBe(true);

    expect(repository.getSlotSummaries()).toEqual([
      expect.objectContaining({ slotId: 1, status: 'valid', chapterId: 'home' }),
      expect.objectContaining({
        slotId: 2,
        status: 'valid',
        chapterId: 'rain',
        mode: 'low_stimulation',
        playTimeSeconds: 375,
      }),
      expect.objectContaining({ slotId: 3, status: 'empty' }),
    ]);
    expect(repository.getFirstEmptySlot()).toBe(3);
  });

  it('saves through the active slot and removes transient view state', () => {
    const repository = new SaveRepository(storage);
    const state = createInitialState();
    state.phase = 'playing';
    state.modal = 'pause';
    state.dialogue = ['临时对白'];
    state.dialogueIndex = 0;
    state.activeMemoryId = 'rain';
    state.holdProgress = 0.5;
    state.player.moving = true;
    repository.setActiveSlot(2);

    expect(repository.saveActive(state).ok).toBe(true);
    expect(repository.loadSlot(2)).toMatchObject({
      phase: 'playing',
      modal: null,
      dialogue: [],
      activeMemoryId: null,
      holdProgress: 0,
      player: expect.objectContaining({ moving: false }),
    });
  });

  it('keeps global settings when loading another slot', () => {
    const repository = new SaveRepository(storage);
    const state = createInitialState();
    state.phase = 'playing';
    state.settings.fontSize = 'normal';
    repository.saveToSlot(1, state);
    const globalSettings = { ...state.settings, fontSize: 'large' as const, muted: true };

    expect(repository.loadSlot(1, globalSettings)?.settings).toMatchObject({
      fontSize: 'large',
      muted: true,
    });
  });

  it('reports one malformed slot without hiding valid or empty slots', () => {
    const repository = new SaveRepository(storage);
    const state = createInitialState();
    state.phase = 'playing';
    repository.saveToSlot(1, state);
    storage.setItem(saveSlotKey(2), '{broken-json');

    expect(repository.getSlotSummaries().map((slot) => slot.status)).toEqual([
      'valid',
      'invalid',
      'empty',
    ]);
    expect(repository.loadSlot(2)).toBeNull();
    expect(storage.getItem(saveSlotKey(2))).toBe('{broken-json');
  });

  it('recovers invalid coordinates to the authored chapter spawn', () => {
    const repository = new SaveRepository(storage);
    const state = createInitialState();
    state.phase = 'playing';
    state.player.x = 99999;
    state.player.y = -10;
    repository.saveToSlot(1, state);

    expect(repository.loadSlot(1)?.player).toEqual({
      x: 310,
      y: 302,
      facing: 'down',
      moving: false,
    });
  });

  it('does not claim success or replace a slot when storage rejects the write', () => {
    const repository = new SaveRepository(new ThrowingStorage());
    const state = createInitialState();
    state.phase = 'playing';

    expect(repository.saveToSlot(1, state)).toEqual({ ok: false, reason: 'storage_error' });
    expect(repository.getSlotSummary(1).status).toBe('empty');
  });

  it('deletes individual slots and clears all new, legacy, and settings data', () => {
    const repository = new SaveRepository(storage);
    const state = createInitialState();
    state.phase = 'playing';
    for (const slotId of SAVE_SLOT_IDS) repository.saveToSlot(slotId, state);
    repository.saveSettings({ ...state.settings, muted: true });
    storage.setItem('erasure.save.v1', JSON.stringify(state));

    expect(repository.deleteSlot(2)).toBe(true);
    expect(repository.getSlotSummary(2).status).toBe('empty');
    expect(storage.getItem('erasure.save.v1')).not.toBeNull();

    expect(repository.clearAll()).toBe(true);
    expect(repository.getSlotSummaries().every((slot) => slot.status === 'empty')).toBe(true);
    expect(repository.loadSettings()).toBeNull();
    expect(storage.getItem('erasure.save.v1')).toBeNull();
  });

  it('ignores the legacy save instead of migrating it', () => {
    const repository = new SaveRepository(storage);
    const state = createInitialState();
    state.phase = 'playing';
    storage.setItem('erasure.save.v1', JSON.stringify(state));

    expect(repository.getSlotSummaries().every((slot) => slot.status === 'empty')).toBe(true);
    expect(repository.getFirstEmptySlot()).toBe(1);
    expect(storage.getItem('erasure.save.v1')).not.toBeNull();
  });
});
