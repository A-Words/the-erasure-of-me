/**
 * Collision data provider for GameStore.
 *
 * GameStore is a domain-layer class created outside Phaser, so it cannot
 * access Phaser's asset cache. Instead, it receives collision data through
 * this interface — a pure data dependency injection.
 *
 * The default implementation loads Tiled JSON at startup and parses it with
 * tiledMapLoader. If Tiled data is unavailable, it falls back to
 * homeLayout.ts code constants for home and generic bounds for other chapters.
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
 * Default provider that uses Tiled-parsed data when available,
 * falling back to code constants when Tiled data is missing or unparseable.
 *
 * Accepts a Record of mapId → raw Tiled JSON so all chapters can be
 * collision-driven without Phaser.
 */
export class TiledCollisionProvider implements CollisionDataProvider {
  private readonly chapterData: Partial<Record<ChapterId, ChapterCollisionData>> = {};

  constructor(tiledJsons: Record<string, unknown> = {}) {
    for (const [mapId, rawJson] of Object.entries(tiledJsons)) {
      const chapter = this.mapIdToChapter(mapId);
      if (!chapter) continue;
      try {
        const content = parseTiledMap(
          mapId,
          rawJson,
          chapterMaps[chapter].entities as WorldEntity[],
        );
        this.chapterData[chapter] = {
          obstacles: extractCollisionObstacles(content),
          walkBounds: extractWalkBounds(content, genericWalkBounds(chapter)),
        };
      } catch (err) {
        console.warn(
          `[TiledCollisionProvider] Failed to parse ${mapId} for chapter "${chapter}", using generic fallback:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    // Ensure home always has data (code fallback if Tiled parse failed)
    if (!this.chapterData.home) {
      this.chapterData.home = {
        obstacles: homeCollisionObstacles,
        walkBounds: homeWalkBounds,
      };
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
    // Fallback for chapters without Tiled data
    return { obstacles: [], walkBounds: genericWalkBounds(chapterId) };
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
