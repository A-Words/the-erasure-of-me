#!/usr/bin/env node
/**
 * Validates Tiled map JSON files for visual reference layer integrity.
 *
 * Checks performed (at minimum for map.home.json):
 * 1. Required visual layers exist: background, visual_furniture, visual_decor, visual_props
 * 2. All image references in tilesets and image layers point to files that exist on disk
 * 3. Stable IDs (object names in interactables, collision, navigation layers) are unique
 * 4. visual_* layer objects are marked with visual_reference=true property
 *
 * Usage:
 *   node scripts/validate_tiled_maps.mjs [mapId]
 *
 * If no mapId is given, validates map.home by default.
 * Exit code 0 = pass, 1 = fail.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicAssetsData = resolve(__dirname, '..', 'public', 'assets', 'data');

const MAP_FILES = {
  'map.home': 'map.home.json',
  'map.rain_station': 'map.rain_station.json',
  'map.shared_life': 'map.shared_life.json',
  'map.return_corridor': 'map.return_corridor.json',
  'map.home_ending': 'map.home_ending.json',
};

const REQUIRED_VISUAL_LAYERS_ALL = ['background', 'visual_props'];
const REQUIRED_VISUAL_LAYERS_HOME = ['visual_furniture', 'visual_decor'];
const LOGICAL_LAYERS = ['navigation', 'interactables', 'collision'];

// Must match TILESET_ASSET_KEYS in src/game/content/tiledMapLoader.ts
const VALID_TILESET_NAMES = new Set([
  'furniture_home_atlas',
  'decor_home_atlas',
  'prop_home_bedside_photo',
  'prop_home_red_thread_journal',
  'prop_home_glasses_case',
  'prop_home_blue_key_bowl',
  'prop_red_umbrella_closed',
  'prop_life_shared_life_atlas',
]);

/**
 * @param {string} mapId
 * @returns {{errors: string[], warnings: string[], passed: boolean}}
 */
function validateMap(mapId) {
  const errors = [];
  const warnings = [];

  const fileName = MAP_FILES[mapId];
  if (!fileName) {
    errors.push(`Unknown map ID: ${mapId}`);
    return { errors, warnings, passed: false };
  }

  const mapPath = resolve(publicAssetsData, fileName);
  if (!existsSync(mapPath)) {
    errors.push(`Map file not found: ${mapPath}`);
    return { errors, warnings, passed: false };
  }

  /** @type {any} */
  let mapData;
  try {
    mapData = JSON.parse(readFileSync(mapPath, 'utf-8'));
  } catch (err) {
    errors.push(`Failed to parse JSON: ${err.message}`);
    return { errors, warnings, passed: false };
  }

  const mapDir = dirname(mapPath);
  const layers = mapData.layers ?? [];

  // --- Check 1: Required visual layers exist ---
  const layerNames = layers.map((l) => l.name);
  for (const required of REQUIRED_VISUAL_LAYERS_ALL) {
    if (!layerNames.includes(required)) {
      errors.push(`Missing required visual layer: "${required}"`);
    }
  }
  // Home requires additional furniture/decor layers
  if (mapId === 'map.home') {
    for (const required of REQUIRED_VISUAL_LAYERS_HOME) {
      if (!layerNames.includes(required)) {
        errors.push(`Missing required visual layer: "${required}"`);
      }
    }
  }

  // --- Check 2: Image references exist on disk ---
  // 2a: Image layer images
  for (const layer of layers) {
    if (layer.type === 'imagelayer' && layer.image) {
      const imgPath = resolve(mapDir, layer.image);
      if (!existsSync(imgPath)) {
        errors.push(`Image layer "${layer.name}" references missing file: ${layer.image}`);
      }
    }
  }

  // 2b: Tileset images
  for (const ts of mapData.tilesets ?? []) {
    if (ts.image) {
      const imgPath = resolve(mapDir, ts.image);
      if (!existsSync(imgPath)) {
        errors.push(`Tileset "${ts.name}" references missing file: ${ts.image}`);
      }
    }
    // 2c: Tileset name must be mappable to a runtime asset key
    if (!VALID_TILESET_NAMES.has(ts.name)) {
      errors.push(
        `Tileset "${ts.name}" has no mapping to a Phaser asset key in TILESET_ASSET_KEYS`,
      );
    }
  }

  // --- Check 3: Stable IDs are unique within logical layers ---
  const seenIds = new Map();
  for (const layer of layers) {
    if (!LOGICAL_LAYERS.includes(layer.name)) continue;
    if (layer.type !== 'objectgroup') continue;
    for (const obj of layer.objects ?? []) {
      if (!obj.name) continue;
      if (seenIds.has(obj.name)) {
        errors.push(
          `Duplicate stable ID "${obj.name}" found in layers "${seenIds.get(obj.name)}" and "${layer.name}"`,
        );
      } else {
        seenIds.set(obj.name, layer.name);
      }
    }
  }

  // --- Check 3b: All maps must have non-empty collision and navigation layers ---
  for (const requiredLayer of ['collision', 'navigation']) {
    const layer = layers.find((l) => l.name === requiredLayer && l.type === 'objectgroup');
    if (!layer) {
      errors.push(`Missing required logical layer: "${requiredLayer}"`);
    } else if (!layer.objects || layer.objects.length === 0) {
      errors.push(`Logical layer "${requiredLayer}" has no objects`);
    }
  }

  // --- Check 4: visual_* layers and objects have visual_reference property ---
  for (const layer of layers) {
    if (!layer.name?.startsWith('visual_')) continue;
    const props = layer.properties ?? [];
    const hasFlag = props.some((p) => p.name === 'visual_reference' && p.value === true);
    if (!hasFlag) {
      warnings.push(`Layer "${layer.name}" is missing visual_reference=true property`);
    }
    for (const obj of layer.objects ?? []) {
      const objectProps = obj.properties ?? [];
      const objectHasFlag = objectProps.some(
        (p) => p.name === 'visual_reference' && p.value === true,
      );
      if (!objectHasFlag) {
        warnings.push(
          `Visual object "${obj.name ?? '(unnamed)'}" in "${layer.name}" is missing visual_reference=true property`,
        );
      }
    }
  }

  // --- Check 5: visual_* objects don't collide with logical layer IDs ---
  const visualObjectNames = new Set();
  for (const layer of layers) {
    if (!layer.name?.startsWith('visual_')) continue;
    for (const obj of layer.objects ?? []) {
      if (obj.name) visualObjectNames.add(obj.name);
    }
  }
  for (const logicalName of seenIds.keys()) {
    if (visualObjectNames.has(logicalName)) {
      errors.push(`Visual object name "${logicalName}" conflicts with a logical layer stable ID`);
    }
  }

  // --- Check 6: Binding integrity — collisionId and entityId point to real objects ---
  // Build sets of valid collision and interactable object names
  const collisionNames = new Set();
  const interactableNames = new Set();
  for (const layer of layers) {
    if (layer.name === 'collision' && layer.type === 'objectgroup') {
      for (const obj of layer.objects ?? []) {
        if (obj.name) collisionNames.add(obj.name);
      }
    }
    if (layer.name === 'interactables' && layer.type === 'objectgroup') {
      for (const obj of layer.objects ?? []) {
        if (obj.name) interactableNames.add(obj.name);
      }
    }
  }

  for (const layer of layers) {
    if (!layer.name?.startsWith('visual_')) continue;
    for (const obj of layer.objects ?? []) {
      const props = obj.properties ?? [];
      // Check collisionId binding (visual_furniture)
      const collisionIdProp = props.find((p) => p.name === 'collisionId');
      if (collisionIdProp && typeof collisionIdProp.value === 'string') {
        if (!collisionNames.has(collisionIdProp.value)) {
          errors.push(
            `Visual object "${obj.name}" has collisionId "${collisionIdProp.value}" but no collision object with that name exists`,
          );
        }
      }
      // Check entityId binding (visual_props)
      const entityIdProp = props.find((p) => p.name === 'entityId');
      if (entityIdProp && typeof entityIdProp.value === 'string') {
        if (!interactableNames.has(entityIdProp.value)) {
          errors.push(
            `Visual object "${obj.name}" has entityId "${entityIdProp.value}" but no interactable object with that name exists`,
          );
        }
      }
    }
  }

  // --- Check 7: Placeholder vs real tile object validation ---
  for (const layer of layers) {
    if (!layer.name?.startsWith('visual_')) continue;
    for (const obj of layer.objects ?? []) {
      const props = obj.properties ?? [];
      const hasGid = obj.gid !== undefined;

      if (hasGid) {
        // Real tile object: must have a tileset whose name maps to an asset key
        // (already checked in Check 2c). Must NOT be marked as placeholder.
        const placeholderProp = props.find((p) => p.name === 'placeholder');
        if (placeholderProp && placeholderProp.value === true) {
          errors.push(
            `Visual object "${obj.name}" has a gid (real tile) but is marked placeholder=true`,
          );
        }
      } else {
        // Placeholder object (no gid): must have placeholder=true,
        // status=visual-placeholder, and a non-empty replacement string.
        const placeholderProp = props.find((p) => p.name === 'placeholder');
        if (!placeholderProp || placeholderProp.value !== true) {
          errors.push(
            `Visual object "${obj.name}" has no gid but is missing placeholder=true`,
          );
        }
        const statusProp = props.find((p) => p.name === 'status');
        if (!statusProp || statusProp.value !== 'visual-placeholder') {
          errors.push(
            `Visual object "${obj.name}" has no gid but status is not "visual-placeholder"`,
          );
        }
        const replacementProp = props.find((p) => p.name === 'replacement');
        if (!replacementProp || typeof replacementProp.value !== 'string' || replacementProp.value.length === 0) {
          errors.push(
            `Visual object "${obj.name}" is a placeholder but has no replacement description`,
          );
        }
        // Placeholder must still have entityId pointing to a real interactable
        const entityIdProp = props.find((p) => p.name === 'entityId');
        if (!entityIdProp || typeof entityIdProp.value !== 'string' || entityIdProp.value.length === 0) {
          errors.push(
            `Visual object "${obj.name}" is a placeholder but has no entityId binding`,
          );
        }
      }
    }
  }

  const passed = errors.length === 0;
  return { errors, warnings, passed };
}

// --- CLI entry point ---
const targetMap = process.argv[2] ?? 'map.home';
const mapsToCheck = targetMap === 'all' ? Object.keys(MAP_FILES) : [targetMap];

let allPassed = true;
for (const mapId of mapsToCheck) {
  const result = validateMap(mapId);
  const tag = result.passed ? 'PASS' : 'FAIL';
  console.log(`[${tag}] ${mapId}`);
  for (const err of result.errors) {
    console.log(`  ERROR: ${err}`);
  }
  for (const warn of result.warnings) {
    console.log(`  WARN:  ${warn}`);
  }
  if (!result.passed) allPassed = false;
}

if (!allPassed) {
  process.exit(1);
}
