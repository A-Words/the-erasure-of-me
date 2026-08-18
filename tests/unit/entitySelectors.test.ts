import { describe, expect, it } from 'vitest';
import { isEntityAvailable, nearestAvailableEntity } from '../../src/game/content/entitySelectors';
import { createInitialState } from '../../src/game/state/initialState';

describe('entity selectors', () => {
  it('finds an available nearby interaction for the contextual HUD prompt', () => {
    const state = createInitialState();
    state.phase = 'playing';
    state.player = { x: 1020, y: 500, facing: 'right', moving: false };

    expect(nearestAvailableEntity(state, 125)?.id).toBe('entity.home.key_bowl');
  });

  it('does not expose a collected prop as an interaction target', () => {
    const state = createInitialState();
    state.phase = 'playing';
    state.player = { x: 1020, y: 500, facing: 'right', moving: false };
    state.inventory.push('item.home.key');

    expect(isEntityAvailable(state, 'entity.home.key_bowl')).toBe(false);
    expect(nearestAvailableEntity(state, 125)).toBeNull();
  });

  it('does not expose a reached rain stone as an interaction target', () => {
    const state = createInitialState();
    state.phase = 'playing';
    state.chapterId = 'rain';
    state.puzzles.stationSequence = [2];

    expect(isEntityAvailable(state, 'entity.rain.stone_2')).toBe(false);
    expect(isEntityAvailable(state, 'entity.rain.stone_4')).toBe(true);
  });

  it('keeps the clock-shop umbrella locked until both route signs are reached', () => {
    const state = createInitialState();
    state.phase = 'playing';
    state.chapterId = 'rain';

    expect(isEntityAvailable(state, 'entity.rain.red_umbrella')).toBe(false);

    state.puzzles.rainSigns = ['entity.rain.umbrella_sign_a'];
    expect(isEntityAvailable(state, 'entity.rain.red_umbrella')).toBe(false);

    state.puzzles.rainSigns.push('entity.rain.umbrella_sign_b');
    expect(isEntityAvailable(state, 'entity.rain.red_umbrella')).toBe(true);
  });
});
