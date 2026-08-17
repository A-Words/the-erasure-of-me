import { describe, expect, it } from 'vitest';
import { mapMovement, physicalKeyToAction } from '../../src/game/input/InputMapper';

describe('InputMapper', () => {
  it('keeps standard movement before the fixed mapping is learned', () => {
    expect(mapMovement('move_up', 'standard', false)).toBe('up');
    expect(mapMovement('move_left', 'standard', false)).toBe('left');
  });

  it('keeps the learned clockwise mapping after the D3 stage advances', () => {
    expect(mapMovement('move_up', 'standard', true)).toBe('right');
    expect(mapMovement('move_right', 'standard', true)).toBe('down');
    expect(mapMovement('pause', 'standard', true)).toBeNull();
  });

  it('uses identity movement in low-stimulation mode after D3', () => {
    expect(mapMovement('move_up', 'low_stimulation', true)).toBe('up');
  });

  it('maps physical keys to semantic actions', () => {
    expect(physicalKeyToAction('KeyW')).toBe('move_up');
    expect(physicalKeyToAction('Escape')).toBe('pause');
  });
});
