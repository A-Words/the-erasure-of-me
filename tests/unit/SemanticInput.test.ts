import { describe, expect, it, vi } from 'vitest';
import { SemanticInput } from '../../src/game/input/SemanticInput';

describe('SemanticInput', () => {
  it('keeps an action pressed until every source releases it', () => {
    const input = new SemanticInput();
    const listener = vi.fn();
    input.subscribe(listener);

    input.press('move_right', 'touch:1');
    input.press('move_right', 'touch:2');
    input.release('move_right', 'touch:1');

    expect(input.isPressed('move_right')).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    input.release('move_right', 'touch:2');
    expect(input.isPressed('move_right')).toBe(false);
    expect(listener).toHaveBeenLastCalledWith('move_right', false);
  });

  it('releases every action owned by a canceled pointer source', () => {
    const input = new SemanticInput();
    input.press('move_up', 'touch:7');
    input.press('observe', 'touch:7');

    input.releaseSource('touch:7');

    expect(input.isPressed('move_up')).toBe(false);
    expect(input.isPressed('observe')).toBe(false);
  });

  it('clears all held actions and emits their release transitions', () => {
    const input = new SemanticInput();
    const listener = vi.fn();
    input.subscribe(listener);
    input.press('move_left', 'touch:1');
    input.press('interact', 'touch:2');

    input.clear();

    expect(input.isPressed('move_left')).toBe(false);
    expect(input.isPressed('interact')).toBe(false);
    expect(listener).toHaveBeenCalledWith('move_left', false);
    expect(listener).toHaveBeenCalledWith('interact', false);
  });
});
