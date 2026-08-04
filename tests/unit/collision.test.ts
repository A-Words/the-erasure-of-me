import { describe, expect, it } from 'vitest';
import {
  collisionRectCenter,
  collisionRectCorners,
  findNearestWalkablePosition,
  moveWithCollisions,
  overlapsCollision,
} from '../../src/game/simulation/collision';

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

  it('uses the Tiled top-left origin when rotating collision rectangles', () => {
    const rotated = { x: 100, y: 50, width: 80, height: 20, rotation: 90 };
    expect(collisionRectCenter(rotated)).toEqual({ x: 90, y: 90 });
    expect(collisionRectCorners(rotated)).toEqual([
      { x: 100, y: 50 },
      { x: 100, y: 130 },
      { x: 80, y: 130 },
      { x: 80, y: 50 },
    ]);
  });

  it('stops tunnelling through a rotated wall and slides along its surface', () => {
    const wall = { x: 100, y: 40, width: 100, height: 10, rotation: 45 };
    const result = moveWithCollisions({ x: 130, y: 140 }, { x: 0, y: -120 }, bounds, [wall], {
      halfWidth: 5,
      halfHeight: 5,
    });

    expect(result.x).toBeCloseTo(92.9289321881, 6);
    expect(result.y).toBeCloseTo(57.0710678119, 6);
  });

  it('rechecks a prior rotated obstacle after an adjacent collision changes the slide', () => {
    const waterEdge = {
      x: 386.7,
      y: 716.79,
      width: 1000,
      height: 400,
      rotation: 333,
    };
    const clockShop = {
      x: 893.36,
      y: -113.19,
      width: 450,
      height: 300,
      rotation: 18,
    };
    const result = moveWithCollisions(
      { x: 1157.73, y: 305.67 },
      { x: 8.33, y: 3.42 },
      { minX: 32, maxX: 1248, minY: 32, maxY: 688 },
      [waterEdge, clockShop],
    );

    expect(overlapsCollision(result, waterEdge)).toBe(false);
    expect(overlapsCollision(result, clockShop)).toBe(false);
  });

  it('lets the player leave a tight gap while only touching the table edge', () => {
    const radioCabinet = { x: 994, y: 250, width: 194, height: 108 };
    const rightWall = { x: 1177.5, y: 0, width: 95, height: 544 };
    const tableUpperRight = { x: 1031, y: 401, width: 158, height: 60 };
    const roomBounds = { minX: 32, maxX: 1248, minY: 32, maxY: 688 };

    const result = moveWithCollisions({ x: 1144, y: 391 }, { x: -9, y: 0 }, roomBounds, [
      radioCabinet,
      rightWall,
      tableUpperRight,
    ]);

    expect(result).toEqual({ x: 1135, y: 391 });
  });

  it('finds the nearest safe grid position when a saved player overlaps furniture', () => {
    const furniture = { x: 994, y: 250, width: 194, height: 108 };
    const roomBounds = { minX: 32, maxX: 1248, minY: 32, maxY: 688 };

    expect(overlapsCollision({ x: 1100, y: 360 }, furniture)).toBe(true);
    expect(findNearestWalkablePosition({ x: 1100, y: 360 }, roomBounds, [furniture])).toEqual({
      x: 1100,
      y: 368,
    });
  });

  it('preserves an already walkable saved position', () => {
    expect(findNearestWalkablePosition({ x: 40, y: 40 }, bounds, [obstacle])).toEqual({
      x: 40,
      y: 40,
    });
  });
});
