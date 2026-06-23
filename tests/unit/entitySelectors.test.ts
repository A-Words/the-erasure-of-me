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
});
