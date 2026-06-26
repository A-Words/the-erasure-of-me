/**
 * Collision data provider for GameStore.
 *
 * GameStore is a domain-layer class created outside Phaser, so it cannot
 * access Phaser's asset cache. Instead, it receives collision data through
 * this interface — a pure data dependency injection.
 *
 * The production implementation loads Tiled JSON at startup and parses it with
 * tiledMapLoader. Missing or invalid map data fails explicitly; tests that need
 * code fallback should use CodeCollisionProvider instead.
 */

import type { AxisAlignedRect, MovementBounds } from '../simulation/collision';
import type { ChapterId } from '../state/GameState';
import {
  parseTiledMap,
  extractCollisionObstacles,
  extractWalkBounds,
} from './tiledMapLoader';
import type { WorldEntity } from './maps';
import { chapterMaps } from './maps';
import {
  homeCollisionObstacles,
  homeWalkBounds,
} from './homeLayout';

export interface ChapterCollisionData {
  obstacles: readonly AxisAlignedRect[];
  walkBounds: MovementBounds;
}

export interface CollisionDataProvider {
  getCollisionData(chapterId: ChapterId): ChapterCollisionData;
}

/** Generic walk bounds for chapters without Tiled collision/navigation data. */
function genericWalkBounds(chapterId: ChapterId): MovementBounds {
  const map = chapterMaps[chapterId];
  return { minX: 55, maxX: map.width - 55, minY: 75, maxY: map.height - 45 };
}

/**
 * Accepts a Record of mapId → raw Tiled JSON so all chapters can be
 * collision-driven without Phaser.
 */
export class TiledCollisionProvider implements CollisionDataProvider {
  private readonly chapterData: Partial<Record<ChapterId, ChapterCollisionData>> = {};

  constructor(tiledJsons: Record<string, unknown> = {}) {
    for (const [mapId, rawJson] of Object.entries(tiledJsons)) {
      const chapter = this.mapIdToChapter(mapId);
      if (!chapter) continue;
      const content = parseTiledMap(
        mapId,
        rawJson,
        chapterMaps[chapter].entities as WorldEntity[],
      );
      const obstacles = extractCollisionObstacles(content);
      if (obstacles.length === 0) {
        throw new Error(`Tiled map "${mapId}" has no collision obstacles`);
      }
      if (content.spawns.length === 0) {
        throw new Error(`Tiled map "${mapId}" has no navigation spawn area`);
      }
      this.chapterData[chapter] = {
        obstacles,
        walkBounds: extractWalkBounds(content, genericWalkBounds(chapter)),
      };
    }

    for (const chapter of Object.keys(chapterMaps) as ChapterId[]) {
      if (!this.chapterData[chapter]) {
        throw new Error(`Missing Tiled collision data for chapter "${chapter}"`);
      }
    }
  }

  private mapIdToChapter(mapId: string): ChapterId | null {
    for (const [chapter, map] of Object.entries(chapterMaps)) {
      if (map.id === mapId) return chapter as ChapterId;
    }
    return null;
  }

  getCollisionData(chapterId: ChapterId): ChapterCollisionData {
    const data = this.chapterData[chapterId];
    if (data) return data;
    throw new Error(`Missing Tiled collision data for chapter "${chapterId}"`);
  }
}

/**
 * Fallback provider that always uses code constants.
 * Used in tests where Tiled JSON is not available.
 */
export class CodeCollisionProvider implements CollisionDataProvider {
  getCollisionData(chapterId: ChapterId): ChapterCollisionData {
    if (chapterId === 'home') {
      return {
        obstacles: homeCollisionObstacles,
        walkBounds: homeWalkBounds,
      };
    }
    return { obstacles: [], walkBounds: genericWalkBounds(chapterId) };
  }
}
