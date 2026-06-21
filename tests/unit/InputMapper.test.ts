import { describe, expect, it } from 'vitest';
import { mapMovement, physicalKeyToAction } from '../../src/game/input/InputMapper';

describe('InputMapper', () => {
  it('keeps standard movement in D0', () => {
    expect(mapMovement('move_up', 'D0', 'standard')).toBe('up');
    expect(mapMovement('move_left', 'D0', 'standard')).toBe('left');
  });

  it('rotates only gameplay movement clockwise in standard D3', () => {
    expect(mapMovement('move_up', 'D3', 'standard')).toBe('right');
    expect(mapMovement('move_right', 'D3', 'standard')).toBe('down');
    expect(mapMovement('pause', 'D3', 'standard')).toBeNull();
  });

  it('uses identity movement in low-stimulation D3', () => {
    expect(mapMovement('move_up', 'D3', 'low_stimulation')).toBe('up');
  });

  it('maps physical keys to semantic actions', () => {
    expect(physicalKeyToAction('KeyW')).toBe('move_up');
    expect(physicalKeyToAction('Escape')).toBe('pause');
  });
});
