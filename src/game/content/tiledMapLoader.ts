/**
 * Tiled content adapter layer.
 *
 * Converts raw Tiled JSON object layers into pure TypeScript data structures
 * that the game systems and Phaser Scene consume. This is the single place
 * that interprets Tiled object properties — systems and Scene never parse
 * Tiled JSON directly.
 *
 * Design constraints:
 * - Output types are plain data (no Phaser imports).
 * - Visual placement data never enters save state.
 * - Missing layers or properties produce safe fallbacks or clear errors.
 * - Duplicate stable IDs are rejected.
 */

import type { AxisAlignedRect, MovementBounds } from '../simulation/collision';
import type { WorldEntity } from './maps';

// ---------------------------------------------------------------------------
// Tiled JSON type definitions (minimal subset we read at runtime)
// ---------------------------------------------------------------------------

interface TiledProperty {
  name: string;
  type: string;
  value: unknown;
}

interface TiledObject {
  id: number;
  name?: string;
  type?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  gid?: number;
  properties?: TiledProperty[];
  visible?: boolean;
}

interface TiledLayer {
  name: string;
  type: string;
  objects?: TiledObject[];
  visible?: boolean;
  properties?: TiledProperty[];
}

interface TiledTileset {
  firstgid: number;
  name: string;
  image?: string;
  imagewidth?: number;
  imageheight?: number;
  tilewidth?: number;
  tileheight?: number;
  columns?: number;
  tilecount?: number;
}

interface TiledMapData {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: TiledLayer[];
  tilesets?: TiledTileset[];
}

// ---------------------------------------------------------------------------
// Output data structures
// ---------------------------------------------------------------------------

/** Visual placement for furniture, decor, and props. Never persisted. */
export interface VisualPlacement {
  id: string;
  assetKey: string;
  frame: number;
  x: number;
  y: number;
  size: number;
  sortY: number;
  /** Links to a collision object name, if this visual has a collision rect. */
  collisionId?: string;
}

/** Collision rectangle with a stable name for debugging. */
export interface NamedCollisionRect extends AxisAlignedRect {
  name: string;
  type: string;
}

/** Spawn point extracted from the navigation layer. */
export interface SpawnPoint {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Complete parsed map content, all from Tiled, no code fallbacks mixed in. */
export interface TiledMapContent {
  mapId: string;
  width: number;
  height: number;
  interactables: WorldEntity[];
  collisionRects: NamedCollisionRect[];
  visualFurniture: VisualPlacement[];
  visualDecor: VisualPlacement[];
  visualProps: VisualPlacement[];
  spawns: SpawnPoint[];
}

// ---------------------------------------------------------------------------
// Property helpers
// ---------------------------------------------------------------------------

function getProperty(obj: TiledObject, name: string): unknown {
  const prop = obj.properties?.find((p) => p.name === name);
  return prop?.value;
}

function getStringProperty(obj: TiledObject, name: string, fallback?: string): string {
  const value = getProperty(obj, name);
  if (typeof value === 'string' && value.length > 0) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Tiled object "${obj.name ?? obj.id}" missing required string property "${name}"`);
}

function getOptionalStringProperty(obj: TiledObject, name: string): string | undefined {
  const value = getProperty(obj, name);
  if (typeof value === 'string' && value.length > 0) return value;
  return undefined;
}

function getNumberProperty(obj: TiledObject, name: string, fallback?: number): number {
  const value = getProperty(obj, name);
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Tiled object "${obj.name ?? obj.id}" missing required number property "${name}"`);
}

function getOptionalNumberProperty(obj: TiledObject, name: string): number | undefined {
  const value = getProperty(obj, name);
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  return undefined;
}

// ---------------------------------------------------------------------------
// Tileset → frame resolution
// ---------------------------------------------------------------------------

interface TilesetInfo {
  name: string;
  firstgid: number;
  tilewidth: number;
  tileheight: number;
  columns: number;
  /** Asset manifest key for this tileset's image. */
  assetKey: string;
}

/** Maps Tiled tileset names to Phaser asset manifest keys. */
const TILESET_ASSET_KEYS: Record<string, string> = {
  furniture_home_atlas: 'furniture.home.atlas',
  decor_home_atlas: 'decor.home.atlas',
  prop_home_bedside_photo: 'prop.home.bedside_photo',
  prop_home_red_thread_journal: 'prop.home.red_thread_journal',
  prop_home_glasses_case: 'prop.home.glasses_case',
  prop_home_blue_key_bowl: 'prop.home.blue_key_bowl',
};

function resolveTilesetAssetKey(tilesetName: string): string {
  const key = TILESET_ASSET_KEYS[tilesetName];
  if (!key) {
    throw new Error(`No asset key mapping for tileset "${tilesetName}"`);
  }
  return key;
}

function buildTilesetIndex(tilesets: TiledTileset[]): Map<number, TilesetInfo> {
  const index = new Map<number, TilesetInfo>();
  for (const ts of tilesets ?? []) {
    const columns = ts.columns ?? 1;
    const tilewidth = ts.tilewidth ?? 256;
    const tileheight = ts.tileheight ?? 256;
    const tilecount = ts.tilecount ?? 1;
    const assetKey = resolveTilesetAssetKey(ts.name);
    for (let i = 0; i < tilecount; i++) {
      const gid = ts.firstgid + i;
      index.set(gid, {
        name: ts.name,
        firstgid: ts.firstgid,
        tilewidth,
        tileheight,
        columns,
        assetKey,
      });
    }
  }
  return index;
}

function resolveGid(
  gid: number | undefined,
  tilesetIndex: Map<number, TilesetInfo>,
): { assetKey: string; frame: number } {
  if (gid === undefined) {
    throw new Error('Tiled object has no gid (not a tile object)');
  }
  const info = tilesetIndex.get(gid);
  if (!info) {
    throw new Error(`No tileset found for gid ${gid}`);
  }
  return { assetKey: info.assetKey, frame: gid - info.firstgid };
}

// ---------------------------------------------------------------------------
// Layer parsers
// ---------------------------------------------------------------------------

function findLayer(layers: TiledLayer[], name: string): TiledLayer | undefined {
  return layers.find((l) => l.name === name && l.type === 'objectgroup');
}

function parseInteractables(
  layer: TiledLayer | undefined,
  fallbackEntities: WorldEntity[],
): WorldEntity[] {
  if (!layer?.objects || layer.objects.length === 0) return fallbackEntities;

  const entities: WorldEntity[] = [];
  const seenIds = new Set<string>();

  for (const obj of layer.objects) {
    if (obj.visible === false) continue;
    const id = obj.name;
    if (!id) continue;

    if (seenIds.has(id)) {
      throw new Error(`Duplicate stable ID in interactables: "${id}"`);
    }
    seenIds.add(id);

    const kind = (obj.type ?? 'inspect') as WorldEntity['kind'];
    const colorProp = getOptionalNumberProperty(obj, 'color');
    // Tiled stores color as int in some exports; we pass through if present.
    const color = typeof colorProp === 'number' ? colorProp : undefined;

    entities.push({
      id,
      label: getStringProperty(obj, 'label', id),
      x: obj.x,
      y: obj.y,
      kind,
      color,
    });
  }

  return entities;
}

function parseCollision(layer: TiledLayer | undefined): NamedCollisionRect[] {
  if (!layer?.objects) return [];

  const rects: NamedCollisionRect[] = [];
  const seenIds = new Set<string>();

  for (const obj of layer.objects) {
    if (obj.visible === false) continue;
    const name = obj.name ?? `collision_${obj.id}`;
    if (seenIds.has(name)) {
      throw new Error(`Duplicate collision ID: "${name}"`);
    }
    seenIds.add(name);

    rects.push({
      name,
      type: obj.type ?? 'wall',
      x: obj.x,
      y: obj.y,
      width: obj.width ?? 0,
      height: obj.height ?? 0,
    });
  }

  return rects;
}

function parseVisualLayer(
  layer: TiledLayer | undefined,
  tilesetIndex: Map<number, TilesetInfo>,
): VisualPlacement[] {
  if (!layer?.objects) return [];

  const placements: VisualPlacement[] = [];
  const seenIds = new Set<string>();

  for (const obj of layer.objects) {
    if (obj.visible === false) continue;
    const id = obj.name ?? `visual_${obj.id}`;
    if (seenIds.has(id)) {
      throw new Error(`Duplicate visual ID: "${id}" in layer "${layer.name}"`);
    }
    seenIds.add(id);

    const { assetKey, frame } = resolveGid(obj.gid, tilesetIndex);
    const size = getNumberProperty(obj, 'size', obj.width ?? 0);
    const sortY = getNumberProperty(obj, 'sortY', obj.y);
    const collisionId = getOptionalStringProperty(obj, 'collisionId');

    placements.push({
      id,
      assetKey,
      frame,
      x: obj.x,
      y: obj.y,
      size,
      sortY,
      collisionId,
    });
  }

  return placements;
}

function parseSpawns(layer: TiledLayer | undefined): SpawnPoint[] {
  if (!layer?.objects) return [];

  const spawns: SpawnPoint[] = [];
  for (const obj of layer.objects) {
    if (obj.visible === false) continue;
    if (!obj.name) continue;
    spawns.push({
      name: obj.name,
      x: obj.x,
      y: obj.y,
      width: obj.width ?? 0,
      height: obj.height ?? 0,
    });
  }
  return spawns;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a raw Tiled JSON object (as loaded by Phaser or imported directly)
 * into pure TypeScript data structures.
 *
 * @param mapId - Stable map ID, e.g. "map.home"
 * @param rawData - Raw Tiled JSON object
 * @param fallbackEntities - Code-defined entities to use if interactables layer is empty
 * @throws if duplicate stable IDs are found
 */
export function parseTiledMap(
  mapId: string,
  rawData: unknown,
  fallbackEntities: WorldEntity[],
): TiledMapContent {
  const data = rawData as TiledMapData;
  if (!data || !Array.isArray(data.layers)) {
    throw new Error(`Invalid Tiled map data for "${mapId}": missing layers array`);
  }

  const tilesetIndex = buildTilesetIndex(data.tilesets ?? []);

  const interactablesLayer = findLayer(data.layers, 'interactables');
  const collisionLayer = findLayer(data.layers, 'collision');
  const visualFurnitureLayer = findLayer(data.layers, 'visual_furniture');
  const visualDecorLayer = findLayer(data.layers, 'visual_decor');
  const visualPropsLayer = findLayer(data.layers, 'visual_props');
  const navigationLayer = findLayer(data.layers, 'navigation');

  return {
    mapId,
    width: data.width * data.tilewidth,
    height: data.height * data.tileheight,
    interactables: parseInteractables(interactablesLayer, fallbackEntities),
    collisionRects: parseCollision(collisionLayer),
    visualFurniture: parseVisualLayer(visualFurnitureLayer, tilesetIndex),
    visualDecor: parseVisualLayer(visualDecorLayer, tilesetIndex),
    visualProps: parseVisualLayer(visualPropsLayer, tilesetIndex),
    spawns: parseSpawns(navigationLayer),
  };
}

/**
 * Extract collision obstacles from parsed Tiled content as plain AxisAlignedRect[].
 * Filters out zero-area rects that would not block movement.
 */
export function extractCollisionObstacles(content: TiledMapContent): AxisAlignedRect[] {
  return content.collisionRects
    .filter((r) => r.width > 0 && r.height > 0)
    .map(({ x, y, width, height }) => ({ x, y, width, height }));
}

/**
 * Extract walk bounds from the navigation spawn area.
 * Falls back to the map edges if no spawn area is found.
 */
export function extractWalkBounds(
  content: TiledMapContent,
  fallback: MovementBounds,
): MovementBounds {
  const spawn = content.spawns[0];
  if (!spawn) return fallback;
  return {
    minX: spawn.x,
    maxX: spawn.x + spawn.width,
    minY: spawn.y,
    maxY: spawn.y + spawn.height,
  };
}

/**
 * Extract entity sortY values from visual_props placements.
 * Returns a map of entity ID → sortY for depth sorting.
 */
export function extractEntitySortY(
  content: TiledMapContent,
  fallback: Readonly<Record<string, number>>,
): Record<string, number> {
  const result: Record<string, number> = {};
  // Copy fallback first
  for (const [key, value] of Object.entries(fallback)) {
    result[key] = value;
  }
  // Override with Tiled data if available
  for (const prop of content.visualProps) {
    // visual.home.bedside_photo → entity.home.bedside_photo
    if (prop.id.startsWith('visual.')) {
      const entityId = prop.id.replace('visual.', 'entity.');
      result[entityId] = prop.sortY;
    }
  }
  return result;
}
