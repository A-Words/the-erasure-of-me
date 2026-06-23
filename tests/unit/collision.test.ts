import { describe, expect, it } from 'vitest';
import { moveWithCollisions } from '../../src/game/simulation/collision';

const bounds = { minX: 0, maxX: 200, minY: 0, maxY: 200 };
const obstacle = { x: 80, y: 60, width: 40, height: 60 };

describe('moveWithCollisions', () => {
  it('stops the player foot body at a furniture edge', () => {
    const result = moveWithCollisions({ x: 50, y: 90 }, { x: 50, y: 0 }, bounds, [obstacle], {
      halfWidth: 10,
      halfHeight: 6,
    });

    expect(result).toEqual({ x: 70, y: 90 });
  });

  it('allows movement parallel to an obstacle for natural sliding', () => {
    const result = moveWithCollisions({ x: 70, y: 130 }, { x: 0, y: 30 }, bounds, [obstacle], {
      halfWidth: 10,
      halfHeight: 6,
    });

    expect(result).toEqual({ x: 70, y: 160 });
  });

  it('prevents tunnelling through a thin wall in one update', () => {
    const wall = { x: 100, y: 0, width: 8, height: 200 };
    const result = moveWithCollisions({ x: 40, y: 100 }, { x: 100, y: 0 }, bounds, [wall], {
      halfWidth: 10,
      halfHeight: 6,
    });

    expect(result.x).toBe(90);
  });
});
