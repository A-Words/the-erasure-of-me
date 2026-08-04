import { describe, expect, it } from 'vitest';
import {
  addCollisionRecord,
  asEditableTiledMap,
  collectMapEditorRecords,
  collisionHandlePoint,
  collisionLocalPoint,
  deleteCollisionRecord,
  moveMapEditorRecord,
  resizeCollisionRecord,
  rotateCollisionRecord,
  updateCollisionMetadata,
  validateMapCollisionSemantics,
} from '../../src/phaser/dev/mapEditorModel';

function fixture() {
  return asEditableTiledMap({
    nextobjectid: 5,
    layers: [
      {
        name: 'visual_furniture',
        type: 'objectgroup',
        objects: [
          {
            id: 1,
            name: 'visual.home.bed',
            x: 50,
            y: 250,
            width: 200,
            height: 200,
            gid: 1,
            properties: [
              { name: 'sortY', type: 'int', value: 280 },
              { name: 'collisionId', type: 'string', value: 'collision.home.bed' },
            ],
          },
        ],
      },
      {
        name: 'interactables',
        type: 'objectgroup',
        objects: [{ id: 2, name: 'entity.home.photo', x: 300, y: 170, width: 44, height: 44 }],
      },
      {
        name: 'visual_props',
        type: 'objectgroup',
        objects: [
          {
            id: 3,
            name: 'visual.home.photo',
            x: 282,
            y: 188,
            width: 36,
            height: 36,
            gid: 2,
            properties: [
              { name: 'entityId', type: 'string', value: 'entity.home.photo' },
              { name: 'sortY', type: 'int', value: 205 },
            ],
          },
        ],
      },
      {
        name: 'collision',
        type: 'objectgroup',
        objects: [
          {
            id: 4,
            name: 'collision.home.bed',
            type: 'furniture',
            x: 80,
            y: 220,
            width: 160,
            height: 60,
          },
        ],
      },
    ],
  });
}

describe('mapEditorModel', () => {
  it('converts Tiled tile and rectangle origins to display centers', () => {
    const records = collectMapEditorRecords(fixture());
    expect(records.find((record) => record.layerName === 'visual_furniture')).toMatchObject({
      displayX: 150,
      displayY: 150,
    });
    expect(records.find((record) => record.layerName === 'collision')).toMatchObject({
      displayX: 160,
      displayY: 250,
    });
  });

  it('moves furniture with its linked collision and sort line', () => {
    const map = fixture();
    const furniture = collectMapEditorRecords(map).find(
      (record) => record.layerName === 'visual_furniture',
    )!;
    moveMapEditorRecord(map, furniture, 160, 170, {
      linkFurnitureCollision: true,
      linkInteractableVisual: true,
    });
    expect(furniture.object).toMatchObject({ x: 60, y: 270 });
    expect(map.layers.find((layer) => layer.name === 'collision')!.objects![0]).toMatchObject({
      x: 90,
      y: 240,
    });
    expect(furniture.object.properties?.find((property) => property.name === 'sortY')?.value).toBe(
      300,
    );
  });

  it('moves an interactable with its linked visual prop', () => {
    const map = fixture();
    const interactable = collectMapEditorRecords(map).find(
      (record) => record.layerName === 'interactables',
    )!;
    moveMapEditorRecord(map, interactable, 320, 180, {
      linkFurnitureCollision: true,
      linkInteractableVisual: true,
    });
    expect(interactable.object).toMatchObject({ x: 320, y: 180 });
    const visual = map.layers.find((layer) => layer.name === 'visual_props')!.objects![0];
    expect(visual).toMatchObject({ x: 302, y: 198 });
    expect(visual.properties?.find((property) => property.name === 'sortY')?.value).toBe(215);
  });

  it('adds an explicitly named semantic collision and advances nextobjectid', () => {
    const map = fixture();
    const added = addCollisionRecord(map, {
      centerX: 640,
      centerY: 360,
      mapId: 'map.home',
      name: 'collision.home.hall_partition',
      type: 'wall',
    });
    expect(added).toMatchObject({
      key: 'collision:5',
      displayX: 640,
      displayY: 360,
      displayWidth: 64,
      displayHeight: 64,
    });
    expect(added.object).toMatchObject({
      id: 5,
      name: 'collision.home.hall_partition',
      type: 'wall',
      x: 608,
      y: 328,
      width: 64,
      height: 64,
    });
    expect(map.nextobjectid).toBe(6);
  });

  it('renames collision IDs and migrates linked furniture references', () => {
    const map = fixture();
    const collision = collectMapEditorRecords(map).find(
      (record) => record.layerName === 'collision',
    )!;

    updateCollisionMetadata(
      map,
      collision,
      'map.home',
      'collision.home.bed_footprint',
      'furniture',
    );

    expect(collision.object).toMatchObject({
      name: 'collision.home.bed_footprint',
      type: 'furniture',
    });
    expect(
      map.layers
        .find((layer) => layer.name === 'visual_furniture')!
        .objects![0].properties?.find((property) => property.name === 'collisionId')?.value,
    ).toBe('collision.home.bed_footprint');
  });

  it('rejects temporary, cross-chapter, and duplicate collision IDs', () => {
    const map = fixture();
    const collision = collectMapEditorRecords(map).find(
      (record) => record.layerName === 'collision',
    )!;

    expect(() =>
      addCollisionRecord(map, {
        centerX: 640,
        centerY: 360,
        mapId: 'map.home',
        name: 'collision.home.new_1',
        type: 'wall',
      }),
    ).toThrow('临时名称');
    expect(() =>
      updateCollisionMetadata(map, collision, 'map.home', 'collision.rain.station_wall', 'wall'),
    ).toThrow('collision.home.');
    expect(() =>
      addCollisionRecord(map, {
        centerX: 640,
        centerY: 360,
        mapId: 'map.home',
        name: 'collision.home.bed',
        type: 'furniture',
      }),
    ).toThrow('已存在');
  });

  it('reports semantic validation errors before a map can be saved', () => {
    const map = fixture();
    map.layers.find((layer) => layer.name === 'collision')!.objects![0].name =
      'collision.home.new_1';

    expect(validateMapCollisionSemantics('map.home', map)).toEqual([
      'collision.home.new_1：碰撞 ID 必须描述实际墙体、家具或地形，不能使用临时名称',
    ]);
  });

  it('resizes a collision around its center or from its top-left corner', () => {
    const collision = collectMapEditorRecords(fixture()).find(
      (record) => record.layerName === 'collision',
    )!;
    resizeCollisionRecord(collision, 200, 80);
    expect(collision.object).toMatchObject({ x: 60, y: 210, width: 200, height: 80 });
    expect(collision).toMatchObject({ displayX: 160, displayY: 250 });

    resizeCollisionRecord(collision, 220, 100, 'top_left');
    expect(collision.object).toMatchObject({ x: 60, y: 210, width: 220, height: 100 });
    expect(collision).toMatchObject({ displayX: 170, displayY: 260 });
  });

  it('reads and edits rotation while preserving the collision center', () => {
    const map = fixture();
    const object = map.layers.find((layer) => layer.name === 'collision')!.objects![0];
    object.rotation = 90;
    const collision = collectMapEditorRecords(map).find(
      (record) => record.layerName === 'collision',
    )!;
    expect(collision).toMatchObject({ displayX: 50, displayY: 300, displayRotation: 90 });

    rotateCollisionRecord(collision, 180);
    expect(collision).toMatchObject({ displayX: 50, displayY: 300, displayRotation: 180 });
    expect(collision.object).toMatchObject({ x: 130, y: 330, rotation: 180 });

    resizeCollisionRecord(collision, 200, 80);
    expect(collision.object).toMatchObject({ x: 150, y: 340, width: 200, height: 80 });
    expect(collision).toMatchObject({ displayX: 50, displayY: 300 });
  });

  it('converts rotation and resize handles between local and world coordinates', () => {
    const map = fixture();
    const collision = collectMapEditorRecords(map).find(
      (record) => record.layerName === 'collision',
    )!;
    rotateCollisionRecord(collision, 90);

    const bottomRight = collisionHandlePoint(
      collision,
      collision.displayWidth / 2,
      collision.displayHeight / 2,
    );
    expect(bottomRight).toEqual({ x: 130, y: 330 });
    expect(collisionLocalPoint(collision, bottomRight.x, bottomRight.y)).toEqual({ x: 160, y: 60 });
  });

  it('deletes a collision and removes matching furniture references', () => {
    const map = fixture();
    const collision = collectMapEditorRecords(map).find(
      (record) => record.layerName === 'collision',
    )!;
    expect(deleteCollisionRecord(map, collision)).toBe(true);
    expect(map.layers.find((layer) => layer.name === 'collision')!.objects).toEqual([]);
    const furniture = map.layers.find((layer) => layer.name === 'visual_furniture')!.objects![0];
    expect(furniture.properties?.some((property) => property.name === 'collisionId')).toBe(false);
  });
});
