/**
 * Collision data provider for GameStore.
 *
 * GameStore is a domain-layer class created outside Phaser, so it cannot
 * access Phaser's asset cache. Instead, it receives collision data through
 * this interface — a pure data dependency injection.
 *
 * The default implementation loads Tiled JSON via fetch at startup and
 * parses it with tiledMapLoader. If Tiled data is unavailable, it falls
 * back to homeLayout.ts code constants.
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

/**
 * Default provider that uses Tiled-parsed data when available,
 * falling back to homeLayout.ts code constants.
 *
 * Tiled JSON is loaded synchronously at construction time (from pre-fetched
 * data) so GameStore never needs to be async.
 */
export class TiledCollisionProvider implements CollisionDataProvider {
  private readonly homeData: ChapterCollisionData;

  constructor(homeTiledJson: unknown | null) {
    if (homeTiledJson) {
      try {
        const content = parseTiledMap(
          'map.home',
          homeTiledJson,
          chapterMaps.home.entities as WorldEntity[],
        );
        this.homeData = {
          obstacles: extractCollisionObstacles(content),
          walkBounds: extractWalkBounds(content, homeWalkBounds),
        };
      } catch {
        this.homeData = {
          obstacles: homeCollisionObstacles,
          walkBounds: homeWalkBounds,
        };
      }
    } else {
      this.homeData = {
        obstacles: homeCollisionObstacles,
        walkBounds: homeWalkBounds,
      };
    }
  }

  getCollisionData(chapterId: ChapterId): ChapterCollisionData {
    if (chapterId === 'home') return this.homeData;
    const map = chapterMaps[chapterId];
    return {
      obstacles: [],
      walkBounds: { minX: 55, maxX: map.width - 55, minY: 75, maxY: map.height - 45 },
    };
  }
}

/**
 * Fallback provider that always uses homeLayout.ts code constants.
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
    const map = chapterMaps[chapterId];
    return {
      obstacles: [],
      walkBounds: { minX: 55, maxX: map.width - 55, minY: 75, maxY: map.height - 45 },
    };
  }
}
