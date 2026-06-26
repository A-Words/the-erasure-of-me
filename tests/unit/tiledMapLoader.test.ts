import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  parseTiledMap,
  extractCollisionObstacles,
  extractWalkBounds,
  extractEntitySortY,
} from '../../src/game/content/tiledMapLoader';
import type { WorldEntity } from '../../src/game/content/maps';
import { chapterMaps } from '../../src/game/content/maps';

// Minimal Tiled JSON fixture matching the structure of map.home.json
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeHomeMapFixture(): any {
  return {
    width: 32,
    height: 18,
    tilewidth: 64,
    tileheight: 64,
    layers: [
      {
        name: 'background',
        type: 'imagelayer',
        image: '../environments/environment_home_v10.png',
      },
      {
        name: 'visual_decor',
        type: 'objectgroup',
        objects: [
          {
            id: 37,
            name: 'visual.home.bedside_rug',
            type: 'decor',
            x: 90,
            y: 362,
            width: 160,
            height: 160,
            gid: 8,
            properties: [
              { name: 'size', type: 'int', value: 160 },
              { name: 'sortY', type: 'int', value: 32 },
              { name: 'visual_reference', type: 'bool', value: true },
            ],
          },
        ],
      },
      {
        name: 'visual_furniture',
        type: 'objectgroup',
        objects: [
          {
            id: 29,
            name: 'visual.home.bed',
            type: 'furniture',
            x: 57.5,
            y: 302.5,
            width: 225,
            height: 225,
            gid: 1,
            properties: [
              { name: 'size', type: 'int', value: 225 },
              { name: 'sortY', type: 'int', value: 282 },
              { name: 'collisionId', type: 'string', value: 'collision.home.bed' },
              { name: 'visual_reference', type: 'bool', value: true },
            ],
          },
        ],
      },
      {
        name: 'visual_props',
        type: 'objectgroup',
        objects: [
          {
            id: 40,
            name: 'visual.home.bedside_photo',
            type: 'prop',
            x: 282,
            y: 186,
            width: 36,
            height: 36,
            gid: 11,
            properties: [
              { name: 'size', type: 'int', value: 36 },
              { name: 'sortY', type: 'int', value: 205 },
              { name: 'entityId', type: 'string', value: 'entity.home.bedside_photo' },
              { name: 'visual_reference', type: 'bool', value: true },
            ],
          },
        ],
      },
      {
        name: 'navigation',
        type: 'objectgroup',
        objects: [
          {
            id: 1,
            name: 'spawn.home.bed',
            type: 'spawn',
            x: 32,
            y: 32,
            width: 1216,
            height: 656,
          },
        ],
      },
      {
        name: 'interactables',
        type: 'objectgroup',
        objects: [
          {
            id: 2,
            name: 'entity.home.bedside_photo',
            type: 'inspect',
            x: 300,
            y: 168,
            width: 44,
            height: 44,
            properties: [{ name: 'label', type: 'string', value: '床边合影' }],
          },
          {
            id: 3,
            name: 'entity.home.journal',
            type: 'pickup',
            x: 610,
            y: 282,
            width: 44,
            height: 44,
            properties: [{ name: 'label', type: 'string', value: '红线日记' }],
          },
        ],
      },
      {
        name: 'collision',
        type: 'objectgroup',
        objects: [
          {
            id: 7,
            name: 'collision.home.bed',
            type: 'furniture',
            x: 86,
            y: 221,
            width: 168,
            height: 61,
          },
          {
            id: 25,
            name: 'collision.home.wall_outer_top',
            type: 'wall',
            x: 0,
            y: 0,
            width: 1280,
            height: 90,
          },
        ],
      },
    ],
    tilesets: [
      {
        firstgid: 1,
        name: 'furniture_home_atlas',
        image: '../furniture/furniture_home_atlas_v08_7x256x256.png',
        imagewidth: 1792,
        imageheight: 256,
        tilewidth: 256,
        tileheight: 256,
        columns: 7,
        tilecount: 7,
      },
      {
        firstgid: 8,
        name: 'decor_home_atlas',
        image: '../decor/decor_home_atlas_v01_3x256x256.png',
        imagewidth: 768,
        imageheight: 256,
        tilewidth: 256,
        tileheight: 256,
        columns: 3,
        tilecount: 3,
      },
      {
        firstgid: 11,
        name: 'prop_home_bedside_photo',
        image: '../props/prop_home_bedside_photo_v01.png',
        imagewidth: 128,
        imageheight: 128,
        tilewidth: 128,
        tileheight: 128,
        columns: 1,
        tilecount: 1,
      },
    ],
  };
}

const fallbackEntities: WorldEntity[] = [
  { id: 'entity.home.bedside_photo', label: '床边合影', x: 0, y: 0, kind: 'inspect' },
];

describe('parseTiledMap', () => {
  it('reads interactables coordinates from Tiled', () => {
    const content = parseTiledMap('map.home', makeHomeMapFixture(), fallbackEntities);
    expect(content.interactables).toHaveLength(2);
    const photo = content.interactables.find((e) => e.id === 'entity.home.bedside_photo');
    expect(photo).toBeDefined();
    expect(photo!.x).toBe(300);
    expect(photo!.y).toBe(168);
    expect(photo!.kind).toBe('inspect');
    expect(photo!.label).toBe('床边合影');
  });

  it('reads collision rectangles from Tiled', () => {
    const content = parseTiledMap('map.home', makeHomeMapFixture(), fallbackEntities);
    expect(content.collisionRects).toHaveLength(2);
    const bed = content.collisionRects.find((r) => r.name === 'collision.home.bed');
    expect(bed).toBeDefined();
    expect(bed!.x).toBe(86);
    expect(bed!.y).toBe(221);
    expect(bed!.width).toBe(168);
    expect(bed!.height).toBe(61);
    expect(bed!.type).toBe('furniture');
  });

  it('reads visual_furniture frame, sortY, and size', () => {
    const content = parseTiledMap('map.home', makeHomeMapFixture(), fallbackEntities);
    expect(content.visualFurniture).toHaveLength(1);
    const bed = content.visualFurniture[0];
    expect(bed.id).toBe('visual.home.bed');
    expect(bed.assetKey).toBe('furniture.home.atlas');
    expect(bed.frame).toBe(0);
    expect(bed.x).toBe(170);
    expect(bed.y).toBe(190);
    expect(bed.size).toBe(225);
    expect(bed.sortY).toBe(282);
    expect(bed.collisionId).toBe('collision.home.bed');
  });

  it('reads visual_decor placements', () => {
    const content = parseTiledMap('map.home', makeHomeMapFixture(), fallbackEntities);
    expect(content.visualDecor).toHaveLength(1);
    const rug = content.visualDecor[0];
    expect(rug.assetKey).toBe('decor.home.atlas');
    expect(rug.frame).toBe(0);
    expect(rug.x).toBe(170);
    expect(rug.y).toBe(282);
    expect(rug.size).toBe(160);
    expect(rug.sortY).toBe(32);
  });

  it('reads visual_props placements including entityId binding', () => {
    const content = parseTiledMap('map.home', makeHomeMapFixture(), fallbackEntities);
    expect(content.visualProps).toHaveLength(1);
    const photo = content.visualProps[0];
    expect(photo.assetKey).toBe('prop.home.bedside_photo');
    expect(photo.frame).toBe(0);
    expect(photo.x).toBe(300);
    expect(photo.y).toBe(168);
    expect(photo.size).toBe(36);
    expect(photo.sortY).toBe(205);
    expect(photo.entityId).toBe('entity.home.bedside_photo');
  });

  it('reads visual_furniture collisionId binding', () => {
    const content = parseTiledMap('map.home', makeHomeMapFixture(), fallbackEntities);
    const bed = content.visualFurniture[0];
    expect(bed.collisionId).toBe('collision.home.bed');
  });

  it('falls back to code entities when interactables layer is empty', () => {
    const fixture = makeHomeMapFixture();
    const interactablesLayer = fixture.layers.find((l: Record<string, unknown>) => l.name === 'interactables');
    if (interactablesLayer) interactablesLayer.objects = [];
    const content = parseTiledMap('map.home', fixture, fallbackEntities);
    expect(content.interactables).toBe(fallbackEntities);
  });

  it('falls back to code entities when interactables layer is missing', () => {
    const fixture = makeHomeMapFixture();
    fixture.layers = fixture.layers.filter((l: Record<string, unknown>) => l.name !== 'interactables');
    const content = parseTiledMap('map.home', fixture, fallbackEntities);
    expect(content.interactables).toBe(fallbackEntities);
  });

  it('throws on duplicate stable IDs in interactables', () => {
    const fixture = makeHomeMapFixture();
    const layer = fixture.layers.find((l: Record<string, unknown>) => l.name === 'interactables');
    if (layer && layer.objects) {
      layer.objects.push({ ...layer.objects[0], id: 999 });
    }
    expect(() => parseTiledMap('map.home', fixture, fallbackEntities)).toThrow(
      /Duplicate stable ID/,
    );
  });

  it('throws on duplicate collision IDs', () => {
    const fixture = makeHomeMapFixture();
    const layer = fixture.layers.find((l: Record<string, unknown>) => l.name === 'collision');
    if (layer && layer.objects) {
      layer.objects.push({ ...layer.objects[0], id: 999 });
    }
    expect(() => parseTiledMap('map.home', fixture, fallbackEntities)).toThrow(
      /Duplicate collision ID/,
    );
  });

  it('throws on invalid map data', () => {
    expect(() => parseTiledMap('map.home', null, fallbackEntities)).toThrow(/Invalid Tiled map/);
    expect(() => parseTiledMap('map.home', {}, fallbackEntities)).toThrow(/Invalid Tiled map/);
  });

  it('computes map dimensions from tile size', () => {
    const content = parseTiledMap('map.home', makeHomeMapFixture(), fallbackEntities);
    expect(content.width).toBe(32 * 64);
    expect(content.height).toBe(18 * 64);
  });
});

describe('extractCollisionObstacles', () => {
  it('returns plain AxisAlignedRect array', () => {
    const content = parseTiledMap('map.home', makeHomeMapFixture(), fallbackEntities);
    const obstacles = extractCollisionObstacles(content);
    expect(obstacles).toHaveLength(2);
    expect(obstacles[0]).toEqual({ x: 86, y: 221, width: 168, height: 61 });
    expect(obstacles[0]).not.toHaveProperty('name');
    expect(obstacles[0]).not.toHaveProperty('type');
  });

  it('filters out zero-area rects', () => {
    const fixture = makeHomeMapFixture();
    const layer = fixture.layers.find((l: Record<string, unknown>) => l.name === 'collision');
    if (layer && layer.objects) {
      layer.objects.push({
        id: 999,
        name: 'collision.zero',
        type: 'wall',
        x: 0,
        y: 0,
        width: 0,
        height: 0,
      });
    }
    const content = parseTiledMap('map.home', fixture, fallbackEntities);
    const obstacles = extractCollisionObstacles(content);
    expect(obstacles).toHaveLength(2);
  });
});

describe('extractWalkBounds', () => {
  it('extracts bounds from navigation spawn area', () => {
    const content = parseTiledMap('map.home', makeHomeMapFixture(), fallbackEntities);
    const bounds = extractWalkBounds(content, { minX: 0, maxX: 0, minY: 0, maxY: 0 });
    expect(bounds.minX).toBe(32);
    expect(bounds.maxX).toBe(32 + 1216);
    expect(bounds.minY).toBe(32);
    expect(bounds.maxY).toBe(32 + 656);
  });

  it('falls back when no spawn area exists', () => {
    const fixture = makeHomeMapFixture();
    fixture.layers = fixture.layers.filter((l: Record<string, unknown>) => l.name !== 'navigation');
    const content = parseTiledMap('map.home', fixture, fallbackEntities);
    const fallback = { minX: 72, maxX: 1208, minY: 90, maxY: 698 };
    const bounds = extractWalkBounds(content, fallback);
    expect(bounds).toEqual(fallback);
  });
});

describe('extractEntitySortY', () => {
  it('extracts sortY from visual_props and merges with fallback', () => {
    const content = parseTiledMap('map.home', makeHomeMapFixture(), fallbackEntities);
    const fallback = { 'entity.home.journal': 319 };
    const sortYMap = extractEntitySortY(content, fallback);
    // From visual_props: bedside_photo → entity.home.bedside_photo
    expect(sortYMap['entity.home.bedside_photo']).toBe(205);
    // From fallback
    expect(sortYMap['entity.home.journal']).toBe(319);
  });

  it('returns fallback when no visual_props exist', () => {
    const fixture = makeHomeMapFixture();
    fixture.layers = fixture.layers.filter((l: Record<string, unknown>) => l.name !== 'visual_props');
    const content = parseTiledMap('map.home', fixture, fallbackEntities);
    const fallback = { 'entity.home.journal': 319 };
    const sortYMap = extractEntitySortY(content, fallback);
    expect(sortYMap['entity.home.journal']).toBe(319);
  });
});

// --- Tests using actual map JSON files from public/assets/data ---

function loadMapJson(mapId: string): unknown {
  const path = resolve(process.cwd(), 'public', 'assets', 'data', `${mapId}.json`);
  return JSON.parse(readFileSync(path, 'utf-8'));
}

describe('parseTiledMap with real map.rain_station.json', () => {
  const mapId = 'map.rain_station';
  const entities = chapterMaps.rain.entities as WorldEntity[];

  it('parses visual_props with entityId bindings', () => {
    const content = parseTiledMap(mapId, loadMapJson(mapId), entities);
    expect(content.visualProps.length).toBeGreaterThan(0);

    // Every visual_prop should have an entityId
    for (const prop of content.visualProps) {
      expect(prop.entityId).toBeDefined();
    }

    // Check a specific entity binding
    const umbrella = content.visualProps.find((p) => p.id === 'visual.rain.red_umbrella');
    expect(umbrella).toBeDefined();
    expect(umbrella!.entityId).toBe('entity.rain.red_umbrella');
  });

  it('parses interactables from Tiled layer', () => {
    const content = parseTiledMap(mapId, loadMapJson(mapId), entities);
    expect(content.interactables.length).toBe(7);
    const ticket = content.interactables.find((e) => e.id === 'entity.rain.ticket');
    expect(ticket).toBeDefined();
    expect(ticket!.x).toBe(180);
    expect(ticket!.y).toBe(560);
    expect(ticket!.kind).toBe('pickup');
  });

  it('has background image layer', () => {
    const data = loadMapJson(mapId) as { layers: Array<{ name: string; type: string }> };
    const bg = data.layers.find((l) => l.name === 'background');
    expect(bg).toBeDefined();
    expect(bg!.type).toBe('imagelayer');
  });
});

describe('parseTiledMap with real map.home_ending.json', () => {
  const mapId = 'map.home_ending';
  const entities = chapterMaps.ending.entities as WorldEntity[];

  it('parses visual_props with entityId binding for xiulan', () => {
    const content = parseTiledMap(mapId, loadMapJson(mapId), entities);
    expect(content.visualProps).toHaveLength(1);
    expect(content.visualProps[0].entityId).toBe('entity.ending.xiulan');
  });
});

describe('TiledCollisionProvider with multi-map data', () => {
  it('reads collision data from Tiled for all 5 chapters', async () => {
    const { TiledCollisionProvider } = await import(
      '../../src/game/content/collisionProvider'
    );
    const provider = new TiledCollisionProvider({
      'map.home': loadMapJson('map.home'),
      'map.rain_station': loadMapJson('map.rain_station'),
      'map.shared_life': loadMapJson('map.shared_life'),
      'map.return_corridor': loadMapJson('map.return_corridor'),
      'map.home_ending': loadMapJson('map.home_ending'),
    });

    // Home should have many collision obstacles (walls + furniture)
    const homeData = provider.getCollisionData('home');
    expect(homeData.obstacles.length).toBeGreaterThan(10);

    // Non-home chapters should now have border wall collision obstacles
    const rainData = provider.getCollisionData('rain');
    expect(rainData.obstacles.length).toBeGreaterThan(0);

    const lifeData = provider.getCollisionData('life');
    expect(lifeData.obstacles.length).toBeGreaterThan(0);

    const returnData = provider.getCollisionData('return');
    expect(returnData.obstacles.length).toBeGreaterThan(0);

    const endingData = provider.getCollisionData('ending');
    expect(endingData.obstacles.length).toBeGreaterThan(0);
  });

  it('does not use home collision data for non-home chapters', async () => {
    const { TiledCollisionProvider } = await import(
      '../../src/game/content/collisionProvider'
    );
    const provider = new TiledCollisionProvider({
      'map.home': loadMapJson('map.home'),
      'map.rain_station': loadMapJson('map.rain_station'),
    });

    const homeData = provider.getCollisionData('home');
    const rainData = provider.getCollisionData('rain');

    // Rain walk bounds should not be the same as home walk bounds
    expect(rainData.walkBounds).not.toEqual(homeData.walkBounds);
  });

  it('falls back to generic bounds for chapters without Tiled data', async () => {
    const { TiledCollisionProvider } = await import(
      '../../src/game/content/collisionProvider'
    );
    const provider = new TiledCollisionProvider({});

    const rainData = provider.getCollisionData('rain');
    expect(rainData.obstacles.length).toBe(0);
    expect(rainData.walkBounds.minX).toBe(55);
  });
});
