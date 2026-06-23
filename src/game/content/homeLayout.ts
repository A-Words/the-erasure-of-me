import type { AxisAlignedRect, MovementBounds } from '../simulation/collision';

export interface HomeFurniturePlacement {
  id: string;
  frame: number;
  x: number;
  y: number;
  size: number;
  sortY: number;
  collision: AxisAlignedRect;
}

export interface HomeWallOccluder {
  x: number;
  y: number;
  width: number;
  height: number;
  sortY: number;
}

export const homeFurnitureLayout: readonly HomeFurniturePlacement[] = [
  {
    id: 'bed',
    frame: 0,
    x: 170,
    y: 190,
    size: 235,
    sortY: 282,
    collision: { x: 82, y: 218, width: 176, height: 64 },
  },
  {
    id: 'bedside_table',
    frame: 1,
    x: 300,
    y: 174,
    size: 78,
    sortY: 204,
    collision: { x: 270, y: 176, width: 60, height: 28 },
  },
  {
    id: 'sofa',
    frame: 2,
    x: 620,
    y: 158,
    size: 220,
    sortY: 226,
    collision: { x: 520, y: 180, width: 200, height: 46 },
  },
  {
    id: 'living_side_table',
    frame: 1,
    x: 610,
    y: 290,
    size: 76,
    sortY: 319,
    collision: { x: 581, y: 290, width: 58, height: 29 },
  },
  {
    id: 'coffee_table',
    frame: 3,
    x: 700,
    y: 528,
    size: 210,
    sortY: 582,
    collision: { x: 607, y: 530, width: 186, height: 52 },
  },
  {
    id: 'kitchen_counter',
    frame: 4,
    x: 1060,
    y: 164,
    size: 250,
    sortY: 238,
    collision: { x: 948, y: 186, width: 224, height: 52 },
  },
  {
    id: 'storage_cabinet',
    frame: 5,
    x: 220,
    y: 560,
    size: 190,
    sortY: 618,
    collision: { x: 137, y: 558, width: 166, height: 60 },
  },
  {
    id: 'entry_console',
    frame: 6,
    x: 1040,
    y: 520,
    size: 188,
    sortY: 588,
    collision: { x: 958, y: 530, width: 164, height: 58 },
  },
] as const;

export const homeWalkBounds: MovementBounds = {
  minX: 55,
  maxX: 1224,
  minY: 82,
  maxY: 662,
};

export const homeWallObstacles: readonly AxisAlignedRect[] = [
  { x: 388, y: 20, width: 24, height: 242 },
  { x: 388, y: 338, width: 24, height: 164 },
  { x: 388, y: 588, width: 24, height: 112 },
  { x: 868, y: 20, width: 24, height: 244 },
  { x: 868, y: 340, width: 24, height: 106 },
  { x: 20, y: 408, width: 578, height: 38 },
  { x: 718, y: 408, width: 542, height: 38 },
] as const;

export const homeCollisionObstacles: readonly AxisAlignedRect[] = [
  ...homeWallObstacles,
  ...homeFurnitureLayout.map((furniture) => furniture.collision),
];

export const homeWallOccluders: readonly HomeWallOccluder[] = [
  { x: 20, y: 408, width: 578, height: 38, sortY: 446 },
  { x: 718, y: 408, width: 542, height: 38, sortY: 446 },
  { x: 20, y: 666, width: 1240, height: 34, sortY: 700 },
] as const;

export const homeEntitySortY: Readonly<Record<string, number>> = {
  'entity.home.bedside_photo': 205,
  'entity.home.journal': 320,
  'entity.home.glasses_case': 583,
  'entity.home.key_bowl': 589,
  'entity.home.front_door': 420,
};
