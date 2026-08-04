import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractWalkBounds, parseTiledMap } from '../../src/game/content/tiledMapLoader';
import { chapterMaps, checkpointSpawns } from '../../src/game/content/maps';
import { overlapsCollision } from '../../src/game/simulation/collision';
import type { ChapterId } from '../../src/game/state/GameState';
import {
  asEditableTiledMap,
  validateMapCollisionSemantics,
} from '../../src/phaser/dev/mapEditorModel';

const files: Record<ChapterId, string> = {
  home: 'map.home.json',
  rain: 'map.rain_station.json',
  life: 'map.shared_life.json',
  return: 'map.return_corridor.json',
  ending: 'map.home_ending.json',
};

function loadChapter(chapterId: ChapterId) {
  const map = chapterMaps[chapterId];
  const raw = JSON.parse(
    readFileSync(resolve(process.cwd(), 'public', 'assets', 'data', files[chapterId]), 'utf8'),
  );
  return parseTiledMap(map.id, raw, map.entities);
}

function loadRawChapter(chapterId: ChapterId): unknown {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), 'public', 'assets', 'data', files[chapterId]), 'utf8'),
  );
}

function isFree(
  point: { x: number; y: number },
  obstacles: ReturnType<typeof loadChapter>['collisionRects'],
): boolean {
  return !obstacles.some((obstacle) => overlapsCollision(point, obstacle));
}

describe('authored map collision integrity', () => {
  for (const chapterId of Object.keys(files) as ChapterId[]) {
    it(`${chapterId} keeps spawns, checkpoints, and interactables reachable`, () => {
      const map = chapterMaps[chapterId];
      const content = loadChapter(chapterId);
      expect(
        validateMapCollisionSemantics(map.id, asEditableTiledMap(loadRawChapter(chapterId))),
      ).toEqual([]);
      const bounds = extractWalkBounds(content, {
        minX: 0,
        maxX: map.width,
        minY: 0,
        maxY: map.height,
      });
      const obstacles = content.collisionRects;

      expect(isFree(map.spawn, obstacles), `${chapterId} chapter spawn`).toBe(true);
      for (const [checkpointId, checkpoint] of Object.entries(checkpointSpawns)) {
        if (checkpoint.chapterId !== chapterId) continue;
        expect(isFree(checkpoint, obstacles), checkpointId).toBe(true);
      }

      const step = 8;
      const columns = Math.floor((bounds.maxX - bounds.minX) / step) + 1;
      const rows = Math.floor((bounds.maxY - bounds.minY) / step) + 1;
      const gridPoint = (column: number, row: number) => ({
        x: bounds.minX + column * step,
        y: bounds.minY + row * step,
      });
      const start = {
        column: Math.round((map.spawn.x - bounds.minX) / step),
        row: Math.round((map.spawn.y - bounds.minY) / step),
      };
      const key = (column: number, row: number) => `${column},${row}`;
      const queue = [start];
      const visited = new Set([key(start.column, start.row)]);
      const reachablePoints: Array<{ x: number; y: number }> = [];

      for (let index = 0; index < queue.length; index += 1) {
        const current = queue[index];
        reachablePoints.push(gridPoint(current.column, current.row));
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const column = current.column + dx;
          const row = current.row + dy;
          const candidateKey = key(column, row);
          if (
            column < 0 ||
            row < 0 ||
            column >= columns ||
            row >= rows ||
            visited.has(candidateKey) ||
            !isFree(gridPoint(column, row), obstacles)
          ) {
            continue;
          }
          visited.add(candidateKey);
          queue.push({ column, row });
        }
      }

      for (const entity of content.interactables) {
        const nearestDistance = Math.min(
          ...reachablePoints.map((point) => Math.hypot(point.x - entity.x, point.y - entity.y)),
        );
        expect(nearestDistance, `${chapterId}/${entity.id}`).toBeLessThanOrEqual(125);
      }
    });
  }
});
