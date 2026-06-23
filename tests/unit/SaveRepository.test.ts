import { beforeEach, describe, expect, it } from 'vitest';
import { createInitialState } from '../../src/game/state/initialState';
import { SaveRepository } from '../../src/save/SaveRepository';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

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

describe('SaveRepository', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: new MemoryStorage(),
      configurable: true,
    });
  });

  it('keeps accessibility settings after clearing only game progress', () => {
    const repository = new SaveRepository();
    const state = createInitialState();
    state.phase = 'playing';
    state.settings.fontSize = 'large';
    state.settings.muted = true;

    repository.save(state);
    repository.clear();

    expect(repository.getSaveStatus()).toBe('none');
    expect(repository.loadSettings()).toMatchObject({ fontSize: 'large', muted: true });
  });

  it('reports malformed data without deleting or overwriting the original string', () => {
    const repository = new SaveRepository();
    localStorage.setItem('erasure.save.v1', '{broken-json');

    expect(repository.getSaveStatus()).toBe('invalid');
    expect(repository.load()).toBeNull();
    expect(localStorage.getItem('erasure.save.v1')).toBe('{broken-json');
  });

  it('ignores settings that are valid JSON but not an object', () => {
    const repository = new SaveRepository();
    localStorage.setItem('erasure.settings.v1', 'null');

    expect(repository.loadSettings()).toBeNull();
  });

  it('recovers invalid coordinates to the authored chapter spawn', () => {
    const repository = new SaveRepository();
    const state = createInitialState();
    state.phase = 'playing';
    state.player.x = 99999;
    state.player.y = -10;
    repository.save(state);

    expect(repository.load()?.player).toEqual({ x: 310, y: 302, facing: 'down', moving: false });
  });

  it('clears progress and settings only after the all-data operation', () => {
    const repository = new SaveRepository();
    const state = createInitialState();
    state.phase = 'playing';
    repository.save(state);

    repository.clearAll();

    expect(repository.getSaveStatus()).toBe('none');
    expect(repository.loadSettings()).toBeNull();
  });
});
