import { collisionRectCenter } from '../../game/simulation/collision';
import {
  collisionSemanticIdError,
  collisionSemanticTypes,
  validateCollisionSemantics,
  type CollisionSemanticType,
} from '../../game/content/collisionSemantics';

export {
  collisionPrefixForMapId,
  collisionSemanticTypes,
  type CollisionSemanticType,
} from '../../game/content/collisionSemantics';

export type EditableLayerName = 'visual_furniture' | 'interactables' | 'collision';

export interface EditableTiledProperty {
  name: string;
  type: string;
  value: unknown;
}

export interface EditableTiledObject {
  id: number;
  name?: string;
  type?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  rotation?: number;
  gid?: number;
  properties?: EditableTiledProperty[];
}

export interface EditableTiledLayer {
  name: string;
  type: string;
  objects?: EditableTiledObject[];
}

export interface EditableTiledMap {
  layers: EditableTiledLayer[];
  nextobjectid?: number;
  [key: string]: unknown;
}

export interface MapEditorRecord {
  key: string;
  layerName: EditableLayerName;
  object: EditableTiledObject;
  displayX: number;
  displayY: number;
  displayWidth: number;
  displayHeight: number;
  displayRotation: number;
}

const editableLayers = new Set<EditableLayerName>([
  'visual_furniture',
  'interactables',
  'collision',
]);

export function asEditableTiledMap(raw: unknown): EditableTiledMap {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as EditableTiledMap).layers)) {
    throw new Error('地图缺少 Tiled layers 数组');
  }
  return raw as EditableTiledMap;
}

function propertyValue(object: EditableTiledObject, name: string): unknown {
  return object.properties?.find((property) => property.name === name)?.value;
}

function setNumericProperty(object: EditableTiledObject, name: string, value: number): void {
  const property = object.properties?.find((candidate) => candidate.name === name);
  if (property && typeof property.value === 'number') property.value = value;
}

function displayPosition(layerName: EditableLayerName, object: EditableTiledObject) {
  const width = object.width ?? 0;
  const height = object.height ?? 0;
  if (layerName === 'visual_furniture') {
    return { x: object.x + width / 2, y: object.y - height / 2 };
  }
  if (layerName === 'collision') {
    return collisionRectCenter({
      x: object.x,
      y: object.y,
      width,
      height,
      rotation: object.rotation,
    });
  }
  return { x: object.x, y: object.y };
}

function createRecord(layerName: EditableLayerName, object: EditableTiledObject): MapEditorRecord {
  const position = displayPosition(layerName, object);
  return {
    key: `${layerName}:${object.id}`,
    layerName,
    object,
    displayX: position.x,
    displayY: position.y,
    displayWidth: Math.max(object.width ?? 24, 16),
    displayHeight: Math.max(object.height ?? 24, 16),
    displayRotation: layerName === 'collision' ? (object.rotation ?? 0) : 0,
  };
}

export function collectMapEditorRecords(map: EditableTiledMap): MapEditorRecord[] {
  const records: MapEditorRecord[] = [];
  for (const layer of map.layers) {
    if (!editableLayers.has(layer.name as EditableLayerName) || !layer.objects) continue;
    const layerName = layer.name as EditableLayerName;
    for (const object of layer.objects) {
      records.push(createRecord(layerName, object));
    }
  }
  return records;
}

function collisionLayer(map: EditableTiledMap): EditableTiledLayer {
  const layer = map.layers.find(
    (candidate) => candidate.name === 'collision' && candidate.type === 'objectgroup',
  );
  if (!layer) throw new Error('地图缺少 collision 对象层');
  layer.objects ??= [];
  return layer;
}

function nextObjectId(map: EditableTiledMap): number {
  const highestId = map.layers.reduce(
    (highest, layer) => Math.max(highest, ...(layer.objects?.map((object) => object.id) ?? [0])),
    0,
  );
  const id = Math.max(map.nextobjectid ?? 1, highestId + 1);
  map.nextobjectid = id + 1;
  return id;
}

export interface AddCollisionOptions {
  centerX: number;
  centerY: number;
  width?: number;
  height?: number;
  mapId: string;
  name: string;
  type: CollisionSemanticType;
}

export function addCollisionRecord(
  map: EditableTiledMap,
  options: AddCollisionOptions,
): MapEditorRecord {
  const layer = collisionLayer(map);
  const nameError = collisionSemanticIdError(options.mapId, options.name);
  if (nameError) throw new Error(nameError);
  if (layer.objects?.some((object) => object.name === options.name)) {
    throw new Error(`碰撞 ID 已存在：${options.name}`);
  }
  const width = Math.max(8, options.width ?? 64);
  const height = Math.max(8, options.height ?? 64);
  const object: EditableTiledObject = {
    id: nextObjectId(map),
    name: options.name,
    type: options.type,
    x: options.centerX - width / 2,
    y: options.centerY - height / 2,
    width,
    height,
    rotation: 0,
  };
  layer.objects!.push(object);
  return createRecord('collision', object);
}

export function updateCollisionMetadata(
  map: EditableTiledMap,
  record: MapEditorRecord,
  mapId: string,
  name: string,
  type: CollisionSemanticType,
): void {
  if (record.layerName !== 'collision') throw new Error('只有碰撞对象可以修改碰撞元数据');
  const nameError = collisionSemanticIdError(mapId, name);
  if (nameError) throw new Error(nameError);
  const layer = collisionLayer(map);
  if (layer.objects?.some((object) => object.id !== record.object.id && object.name === name)) {
    throw new Error(`碰撞 ID 已存在：${name}`);
  }
  if (!collisionSemanticTypes.includes(type)) throw new Error(`不支持的碰撞类型：${type}`);

  const previousName = record.object.name;
  record.object.name = name;
  record.object.type = type;
  if (!previousName || previousName === name) return;
  for (const furniture of map.layers.find((candidate) => candidate.name === 'visual_furniture')
    ?.objects ?? []) {
    const collisionId = furniture.properties?.find((property) => property.name === 'collisionId');
    if (collisionId?.value === previousName) collisionId.value = name;
  }
}

export function validateMapCollisionSemantics(mapId: string, map: EditableTiledMap): string[] {
  let layer: EditableTiledLayer;
  try {
    layer = collisionLayer(map);
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
  return validateCollisionSemantics(mapId, layer.objects ?? []);
}

export function deleteCollisionRecord(map: EditableTiledMap, record: MapEditorRecord): boolean {
  if (record.layerName !== 'collision') return false;
  const layer = collisionLayer(map);
  const index = layer.objects!.findIndex((object) => object.id === record.object.id);
  if (index < 0) return false;
  layer.objects!.splice(index, 1);

  for (const furniture of map.layers.find((candidate) => candidate.name === 'visual_furniture')
    ?.objects ?? []) {
    furniture.properties = furniture.properties?.filter(
      (property) => property.name !== 'collisionId' || property.value !== record.object.name,
    );
  }
  return true;
}

export function resizeCollisionRecord(
  record: MapEditorRecord,
  requestedWidth: number,
  requestedHeight: number,
  anchor: 'center' | 'top_left' = 'center',
): void {
  if (record.layerName !== 'collision') return;
  const width = Math.max(8, requestedWidth);
  const height = Math.max(8, requestedHeight);
  if (anchor === 'center') {
    const offset = rotatedOffset(width / 2, height / 2, record.displayRotation);
    record.object.x = record.displayX - offset.x;
    record.object.y = record.displayY - offset.y;
  } else {
    const offset = rotatedOffset(width / 2, height / 2, record.displayRotation);
    record.displayX = record.object.x + offset.x;
    record.displayY = record.object.y + offset.y;
  }
  record.object.width = width;
  record.object.height = height;
  record.displayWidth = width;
  record.displayHeight = height;
}

function rotatedOffset(x: number, y: number, degrees: number): { x: number; y: number } {
  const angle = (degrees * Math.PI) / 180;
  const rawCos = Math.cos(angle);
  const rawSin = Math.sin(angle);
  const cos = Math.abs(rawCos) < 1e-10 ? 0 : rawCos;
  const sin = Math.abs(rawSin) < 1e-10 ? 0 : rawSin;
  return { x: cos * x - sin * y, y: sin * x + cos * y };
}

export function collisionHandlePoint(
  record: MapEditorRecord,
  offsetX: number,
  offsetY: number,
): { x: number; y: number } {
  const offset = rotatedOffset(offsetX, offsetY, record.displayRotation);
  return { x: record.displayX + offset.x, y: record.displayY + offset.y };
}

export function collisionLocalPoint(
  record: MapEditorRecord,
  worldX: number,
  worldY: number,
): { x: number; y: number } {
  return rotatedOffset(worldX - record.object.x, worldY - record.object.y, -record.displayRotation);
}

export function rotateCollisionRecord(record: MapEditorRecord, requestedDegrees: number): void {
  if (record.layerName !== 'collision') return;
  const rotation = ((requestedDegrees % 360) + 360) % 360;
  record.displayRotation = rotation;
  record.object.rotation = rotation;
  const offset = rotatedOffset(record.displayWidth / 2, record.displayHeight / 2, rotation);
  record.object.x = record.displayX - offset.x;
  record.object.y = record.displayY - offset.y;
}

function findObject(
  map: EditableTiledMap,
  layerName: string,
  predicate: (object: EditableTiledObject) => boolean,
): EditableTiledObject | undefined {
  return map.layers.find((layer) => layer.name === layerName)?.objects?.find(predicate);
}

export interface MoveRecordOptions {
  linkFurnitureCollision: boolean;
  linkInteractableVisual: boolean;
}

export function moveMapEditorRecord(
  map: EditableTiledMap,
  record: MapEditorRecord,
  nextDisplayX: number,
  nextDisplayY: number,
  options: MoveRecordOptions,
): void {
  const dx = nextDisplayX - record.displayX;
  const dy = nextDisplayY - record.displayY;
  record.object.x += dx;
  record.object.y += dy;
  record.displayX = nextDisplayX;
  record.displayY = nextDisplayY;

  if (record.layerName === 'visual_furniture') {
    setNumericProperty(
      record.object,
      'sortY',
      Number(propertyValue(record.object, 'sortY') ?? record.displayY) + dy,
    );
    if (options.linkFurnitureCollision) {
      const collisionId = propertyValue(record.object, 'collisionId');
      if (typeof collisionId === 'string') {
        const collision = findObject(map, 'collision', (object) => object.name === collisionId);
        if (collision) {
          collision.x += dx;
          collision.y += dy;
        }
      }
    }
  }

  if (record.layerName === 'interactables' && options.linkInteractableVisual) {
    const entityId = record.object.name;
    if (!entityId) return;
    const visual = findObject(
      map,
      'visual_props',
      (object) => propertyValue(object, 'entityId') === entityId,
    );
    if (visual) {
      visual.x += dx;
      visual.y += dy;
      setNumericProperty(
        visual,
        'sortY',
        Number(propertyValue(visual, 'sortY') ?? record.displayY) + dy,
      );
    }
  }
}

export function cloneEditableMap(map: EditableTiledMap): EditableTiledMap {
  return JSON.parse(JSON.stringify(map)) as EditableTiledMap;
}
