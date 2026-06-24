import { describe, expect, it } from 'vitest';
import {
  computeBreathScale,
  computeBreathSine,
  isBreathingActive,
} from '../../src/game/presentation/breathing';
import { createInitialState } from '../../src/game/state/initialState';

function playingState() {
  const state = createInitialState();
  state.phase = 'playing';
  state.modal = null;
  state.dialogue = [];
  state.flags = [];
  state.settings.reducedMotion = false;
  return state;
}

describe('isBreathingActive', () => {
  it('is active during plain playing', () => {
    expect(isBreathingActive(playingState())).toBe(true);
  });

  it('is inactive when a modal is open', () => {
    const state = playingState();
    state.modal = 'inventory';
    expect(isBreathingActive(state)).toBe(false);
  });

  it('is inactive during dialogue', () => {
    const state = playingState();
    state.dialogue = ['一句话'];
    expect(isBreathingActive(state)).toBe(false);
  });

  it('is inactive while ready to hold', () => {
    const state = playingState();
    state.flags = ['ending.ready_to_hold'];
    expect(isBreathingActive(state)).toBe(false);
  });

  it('is inactive under reduced motion', () => {
    const state = playingState();
    state.settings.reducedMotion = true;
    expect(isBreathingActive(state)).toBe(false);
  });

  it('is inactive outside the playing phase', () => {
    const state = playingState();
    state.phase = 'title';
    expect(isBreathingActive(state)).toBe(false);
  });
});

describe('computeBreathSine', () => {
  it('returns 0 at phase 0', () => {
    expect(computeBreathSine(0, 0, 2.4)).toBeCloseTo(0, 5);
  });

  it('returns 1 at a quarter period', () => {
    expect(computeBreathSine(0.6, 0, 2.4)).toBeCloseTo(1, 5);
  });

  it('returns -1 at three quarters of a period', () => {
    expect(computeBreathSine(1.8, 0, 2.4)).toBeCloseTo(-1, 5);
  });

  it('applies the phase offset', () => {
    expect(computeBreathSine(0, 0.6, 2.4)).toBeCloseTo(1, 5);
  });

  it('supports a non-default period', () => {
    expect(computeBreathSine(0.25, 0, 1.0)).toBeCloseTo(1, 5);
    expect(computeBreathSine(0.75, 0, 1.0)).toBeCloseTo(-1, 5);
  });
});

describe('computeBreathScale', () => {
  it('equals base at phase 0', () => {
    expect(computeBreathScale(1, 0, 0, 2.4, 0.035)).toBeCloseTo(1, 5);
  });

  it('reaches base + amplitude at a quarter period', () => {
    expect(computeBreathScale(1, 0.6, 0, 2.4, 0.035)).toBeCloseTo(1.035, 5);
  });

  it('reaches base - amplitude at three quarters of a period', () => {
    expect(computeBreathScale(1, 1.8, 0, 2.4, 0.035)).toBeCloseTo(0.965, 5);
  });

  it('applies the phase offset', () => {
    expect(computeBreathScale(1, 0, 0.6, 2.4, 0.035)).toBeCloseTo(1.035, 5);
  });
});
