import { describe, expect, it } from 'vitest';
import { resolveRainPresentation } from '../../src/game/presentation/rainMotion';

describe('resolveRainPresentation', () => {
  it('moves the rain downward at a frame-rate-independent speed', () => {
    expect(resolveRainPresentation(1000, false, 720)).toEqual({
      offsetY: 240,
      alpha: 0.68,
    });
    expect(resolveRainPresentation(2500, false, 720)).toEqual({
      offsetY: 600,
      alpha: 0.68,
    });
  });

  it('wraps at the rain texture height', () => {
    expect(resolveRainPresentation(3500, false, 720)).toEqual({
      offsetY: 120,
      alpha: 0.68,
    });
  });

  it('keeps a restrained static rain layer under reduced motion', () => {
    expect(resolveRainPresentation(2500, true, 720)).toEqual({
      offsetY: 0,
      alpha: 0.5,
    });
  });

  it('clamps negative elapsed time to the starting frame', () => {
    expect(resolveRainPresentation(-100, false, 720)).toEqual({
      offsetY: 0,
      alpha: 0.68,
    });
  });

  it('wraps at the caller-provided loop height', () => {
    expect(resolveRainPresentation(1000, false, 240)).toEqual({
      offsetY: 0,
      alpha: 0.68,
    });
  });
});
