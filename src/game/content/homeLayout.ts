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

export interface HomeArchitectureOverlay {
  key:
    | 'environment.home.partition_overlay'
    | 'environment.home.crosswall_overlay'
    | 'environment.home.frontwall_overlay';
  sortY: number;
}

export interface HomeDecorPlacement {
  frame: number;
  x: number;
  y: number;
  size: number;
  sortY: number;
}

/**
 * Single source of truth for the home scene's visual scale. Values are square
 * Phaser display canvases; transparent padding inside each asset is intentional.
 */
export const homeVisualSizes = {
  characterScale: 1.2,
  furniture: {
    bed: 225,
    bedsideTable: 64,
    sofa: 205,
    livingSideTable: 58,
    coffeeTable: 165,
    kitchenCounter: 220,
    storageCabinet: 160,
    entryConsole: 100,
  },
  decor: {
    bedsideRug: 160,
    slippers: 34,
    kitchenClutter: 64,
  },
  props: {
    bedsidePhoto: 36,
    journal: 44,
    keyBowl: 32,
    glassesCase: 38,
  },
} as const;

export const homeFurnitureLayout: readonly HomeFurniturePlacement[] = [
  {
    id: 'bed',
    frame: 0,
    x: 170,
    y: 190,
    size: homeVisualSizes.furniture.bed,
    sortY: 282,
    collision: { x: 86, y: 221, width: 168, height: 61 },
  },
  {
    id: 'bedside_table',
    frame: 1,
    x: 300,
    y: 174,
    size: homeVisualSizes.furniture.bedsideTable,
    sortY: 204,
    collision: { x: 275, y: 181, width: 50, height: 23 },
  },
  {
    id: 'sofa',
    frame: 2,
    x: 620,
    y: 158,
    size: homeVisualSizes.furniture.sofa,
    sortY: 229,
    collision: { x: 526, y: 166, width: 188, height: 60 },
  },
  {
    id: 'living_side_table',
    frame: 1,
    x: 610,
    y: 290,
    size: homeVisualSizes.furniture.livingSideTable,
    sortY: 318,
    collision: { x: 588, y: 297, width: 44, height: 21 },
  },
  {
    id: 'coffee_table',
    frame: 3,
    x: 700,
    y: 528,
    size: homeVisualSizes.furniture.coffeeTable,
    sortY: 568,
    collision: { x: 627, y: 527, width: 146, height: 41 },
  },
  {
    id: 'kitchen_counter',
    frame: 4,
    x: 1060,
    y: 164,
    size: homeVisualSizes.furniture.kitchenCounter,
    sortY: 229,
    collision: { x: 958, y: 156, width: 204, height: 72 },
  },
  {
    id: 'storage_cabinet',
    frame: 5,
    x: 220,
    y: 560,
    size: homeVisualSizes.furniture.storageCabinet,
    sortY: 608,
    collision: { x: 150, y: 557, width: 140, height: 51 },
  },
  {
    id: 'entry_console',
    frame: 6,
    x: 1080,
    y: 540,
    size: homeVisualSizes.furniture.entryConsole,
    sortY: 576,
    collision: { x: 1037, y: 551, width: 86, height: 25 },
  },
] as const;

export const homeDecorLayout: readonly HomeDecorPlacement[] = [
  { frame: 0, x: 170, y: 282, size: homeVisualSizes.decor.bedsideRug, sortY: 32 },
  { frame: 1, x: 286, y: 310, size: homeVisualSizes.decor.slippers, sortY: 34 },
  { frame: 2, x: 1082, y: 118, size: homeVisualSizes.decor.kitchenClutter, sortY: 230 },
] as const;

export const homeWalkBounds: MovementBounds = {
  minX: 72,
  maxX: 1208,
  minY: 90,
  maxY: 698,
};

export const homeWallObstacles: readonly AxisAlignedRect[] = [
  { x: 0, y: 0, width: 1280, height: 90 },  // wall_outer_top
  { x: 0, y: 0, width: 72, height: 720 },  // wall_outer_left
  { x: 1208, y: 0, width: 72, height: 720 },  // wall_outer_right
  { x: 0, y: 698, width: 1280, height: 22 },  // wall_outer_bottom
  { x: 346, y: 30, width: 32, height: 248 },  // wall_left_top
  { x: 346, y: 398, width: 34, height: 120 },  // wall_left_middle
  { x: 346, y: 598, width: 34, height: 100 },  // wall_left_bottom
  { x: 800, y: 30, width: 36, height: 248 },  // wall_right_top
  { x: 44, y: 398, width: 466, height: 32 },  // wall_cross_left
  { x: 697, y: 398, width: 538, height: 32 },  // wall_cross_right
] as const;

export const homeCollisionObstacles: readonly AxisAlignedRect[] = [
  ...homeWallObstacles,
  ...homeFurnitureLayout.map((furniture) => furniture.collision),
];

export const homeArchitectureOverlays: readonly HomeArchitectureOverlay[] = [
  { key: 'environment.home.crosswall_overlay', sortY: 398 },
  { key: 'environment.home.frontwall_overlay', sortY: 698 },
] as const;

export const homeEntitySortY: Readonly<Record<string, number>> = {
  'entity.home.bedside_photo': 205,
  'entity.home.journal': 319,
  'entity.home.glasses_case': 569,
  'entity.home.key_bowl': 577,
};
