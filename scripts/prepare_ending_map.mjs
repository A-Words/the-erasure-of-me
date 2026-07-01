#!/usr/bin/env node
/** Build the epilogue Tiled reference map from the approved home registration. */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const homePath = resolve(root, 'public/assets/data/map.home.json');
const endingPath = resolve(root, 'public/assets/data/map.home_ending.json');
const home = JSON.parse(readFileSync(homePath, 'utf8'));

const clone = (value) => structuredClone(value);
const layer = (name) => {
  const found = home.layers.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`map.home is missing layer "${name}"`);
  return clone(found);
};
const renameVisuals = (value) => {
  for (const object of value.objects ?? []) {
    object.name = object.name.replace('visual.home.', 'visual.ending.');
  }
  return value;
};

const background = layer('background');
background.image = '../environments/environment_ending_v02.png';
background.properties.find((property) => property.name === 'runtime_authority').value =
  'manifest.ts:environment.ending.background';

const visualDecor = renameVisuals(layer('visual_decor'));
visualDecor.id = 5;
visualDecor.properties.find((property) => property.name === 'runtime_authority').value =
  'map.home_ending:epilogue decor';
visualDecor.objects.push(
  {
    gid: 11,
    height: 88,
    id: 40,
    name: 'visual.ending.noodle_tray',
    properties: [
      { name: 'visual_reference', type: 'bool', value: true },
      { name: 'size', type: 'int', value: 88 },
      { name: 'sortY', type: 'int', value: 569 },
    ],
    rotation: 0,
    type: 'decor',
    visible: true,
    width: 88,
    x: 656,
    y: 556,
  },
  {
    gid: 12,
    height: 58,
    id: 41,
    name: 'visual.ending.faded_umbrella',
    properties: [
      { name: 'visual_reference', type: 'bool', value: true },
      { name: 'size', type: 'int', value: 58 },
      { name: 'sortY', type: 'int', value: 578 },
    ],
    rotation: 0,
    type: 'decor',
    visible: true,
    width: 58,
    x: 1136,
    y: 597,
  },
);

const visualFurniture = renameVisuals(layer('visual_furniture'));
visualFurniture.id = 6;
for (const object of visualFurniture.objects ?? []) {
  const collisionId = object.properties?.find((property) => property.name === 'collisionId');
  if (collisionId && typeof collisionId.value === 'string') {
    collisionId.value = collisionId.value.replace('collision.home.', 'collision.ending.');
  }
}

const visualProps = {
  draworder: 'topdown',
  id: 7,
  name: 'visual_props',
  objects: [
    {
      height: 64,
      id: 42,
      name: 'visual.ending.xiulan',
      properties: [
        { name: 'size', type: 'int', value: 64 },
        { name: 'sortY', type: 'int', value: 392 },
        { name: 'entityId', type: 'string', value: 'entity.ending.xiulan' },
        { name: 'visual_reference', type: 'bool', value: true },
        { name: 'status', type: 'string', value: 'actor-bound' },
      ],
      rotation: 0,
      type: 'prop',
      visible: true,
      width: 64,
      x: 588,
      y: 392,
    },
  ],
  opacity: 1,
  properties: [
    { name: 'visual_reference', type: 'bool', value: true },
    { name: 'runtime_authority', type: 'string', value: 'maps.ts:chapterMaps.ending.entities' },
  ],
  type: 'objectgroup',
  visible: true,
  x: 0,
  y: 0,
};

const navigation = {
  draworder: 'topdown',
  id: 1,
  name: 'navigation',
  objects: [
    {
      height: 608,
      id: 1,
      name: 'spawn.ending.hall',
      type: 'spawn',
      width: 1136,
      x: 72,
      y: 90,
    },
  ],
  opacity: 1,
  type: 'objectgroup',
  visible: true,
  x: 0,
  y: 0,
};

const interactables = {
  draworder: 'topdown',
  id: 2,
  name: 'interactables',
  objects: [
    {
      height: 64,
      id: 2,
      name: 'entity.ending.xiulan',
      properties: [{ name: 'label', type: 'string', value: '她把手停在那里' }],
      type: 'anchor',
      width: 64,
      x: 620,
      y: 360,
    },
  ],
  opacity: 1,
  type: 'objectgroup',
  visible: true,
  x: 0,
  y: 0,
};

const collision = layer('collision');
collision.id = 3;
for (const object of collision.objects ?? []) {
  object.name = object.name.replace('collision.home.', 'collision.ending.');
}

const ending = {
  ...home,
  layers: [
    background,
    visualDecor,
    visualFurniture,
    visualProps,
    navigation,
    interactables,
    collision,
  ],
  nextlayerid: 8,
  nextobjectid: 43,
  tilesets: [
    clone(home.tilesets[0]),
    clone(home.tilesets[1]),
    {
      columns: 1,
      firstgid: 11,
      image: '../props/prop_ending_noodle_tray_v01.png',
      imageheight: 128,
      imagewidth: 128,
      margin: 0,
      name: 'prop_ending_noodle_tray',
      spacing: 0,
      tilecount: 1,
      tileheight: 128,
      tilewidth: 128,
    },
    {
      columns: 1,
      firstgid: 12,
      image: '../props/prop_ending_red_umbrella_faded_v01.png',
      imageheight: 96,
      imagewidth: 96,
      margin: 0,
      name: 'prop_ending_red_umbrella_faded',
      spacing: 0,
      tilecount: 1,
      tileheight: 96,
      tilewidth: 96,
    },
  ],
  width: 20,
};

writeFileSync(endingPath, `${JSON.stringify(ending, null, 2)}\n`);
console.log(`Wrote ${endingPath}`);
