import type { ChapterId } from '../state/GameState';

export interface AssetManifestEntry {
  key: string;
  type: 'tilemap' | 'image' | 'spritesheet';
  url: string;
  frameConfig?: { frameWidth: number; frameHeight: number };
  chapter?: ChapterId;
  preload: boolean;
}

export const assetManifest = [
  {
    key: 'map.home',
    type: 'tilemap',
    url: 'assets/data/map.home.json',
    chapter: 'home',
    preload: true,
  },
  {
    key: 'map.rain_station',
    type: 'tilemap',
    url: 'assets/data/map.rain_station.json',
    chapter: 'rain',
    preload: true,
  },
  {
    key: 'map.shared_life',
    type: 'tilemap',
    url: 'assets/data/map.shared_life.json',
    chapter: 'life',
    preload: true,
  },
  {
    key: 'map.return_corridor',
    type: 'tilemap',
    url: 'assets/data/map.return_corridor.json',
    chapter: 'return',
    preload: true,
  },
  {
    key: 'map.home_ending',
    type: 'tilemap',
    url: 'assets/data/map.home_ending.json',
    chapter: 'ending',
    preload: true,
  },
  {
    key: 'environment.home.background',
    type: 'image',
    url: 'assets/environments/environment_home_v01.png',
    chapter: 'home',
    preload: true,
  },
  {
    key: 'environment.rain.background',
    type: 'image',
    url: 'assets/environments/environment_rain_v01.png',
    chapter: 'rain',
    preload: true,
  },
  {
    key: 'environment.life.background',
    type: 'image',
    url: 'assets/environments/environment_life_v01.png',
    chapter: 'life',
    preload: true,
  },
  {
    key: 'environment.return.background',
    type: 'image',
    url: 'assets/environments/environment_return_v01.png',
    chapter: 'return',
    preload: true,
  },
  {
    key: 'environment.ending.background',
    type: 'image',
    url: 'assets/environments/environment_ending_v01.png',
    chapter: 'ending',
    preload: true,
  },
  {
    key: 'character.xu_old.idle.down',
    type: 'spritesheet',
    url: 'assets/characters/character_xu_old_idle_down_v01_4x64x96.png',
    frameConfig: { frameWidth: 64, frameHeight: 96 },
    preload: true,
  },
  {
    key: 'character.xu_old.idle.up',
    type: 'spritesheet',
    url: 'assets/characters/character_xu_old_idle_up_v01_4x64x96.png',
    frameConfig: { frameWidth: 64, frameHeight: 96 },
    preload: true,
  },
  {
    key: 'character.xu_old.idle.right',
    type: 'spritesheet',
    url: 'assets/characters/character_xu_old_idle_right_v01_4x64x96.png',
    frameConfig: { frameWidth: 64, frameHeight: 96 },
    preload: true,
  },
  {
    key: 'character.xu_old.walk.down',
    type: 'spritesheet',
    url: 'assets/characters/character_xu_old_walk_down_v01_6x64x96.png',
    frameConfig: { frameWidth: 64, frameHeight: 96 },
    preload: true,
  },
  {
    key: 'character.xu_old.walk.up',
    type: 'spritesheet',
    url: 'assets/characters/character_xu_old_walk_up_v01_6x64x96.png',
    frameConfig: { frameWidth: 64, frameHeight: 96 },
    preload: true,
  },
  {
    key: 'character.xu_old.walk.right',
    type: 'spritesheet',
    url: 'assets/characters/character_xu_old_walk_right_v01_6x64x96.png',
    frameConfig: { frameWidth: 64, frameHeight: 96 },
    preload: true,
  },
  {
    key: 'character.xiulan_old.reach_hand.right',
    type: 'spritesheet',
    url: 'assets/characters/character_xiulan_old_reach_hand_right_v01_8x64x96.png',
    frameConfig: { frameWidth: 64, frameHeight: 96 },
    chapter: 'ending',
    preload: true,
  },
  {
    key: 'prop.red_umbrella.closed',
    type: 'image',
    url: 'assets/props/prop_red_umbrella_closed_v01.png',
    preload: true,
  },
  {
    key: 'memory.rain.umbrella.illustration',
    type: 'image',
    url: 'assets/memories/memory_rain_umbrella_v01.webp',
    chapter: 'rain',
    preload: true,
  },
  {
    key: 'memory.life.move.illustration',
    type: 'image',
    url: 'assets/memories/memory_life_move_v01.webp',
    chapter: 'life',
    preload: true,
  },
  {
    key: 'memory.life.osmanthus.illustration',
    type: 'image',
    url: 'assets/memories/memory_life_osmanthus_v01.webp',
    chapter: 'life',
    preload: true,
  },
  {
    key: 'memory.life.cassette.illustration',
    type: 'image',
    url: 'assets/memories/memory_life_cassette_v01.webp',
    chapter: 'life',
    preload: true,
  },
  {
    key: 'memory.ending.hand.illustration',
    type: 'image',
    url: 'assets/memories/memory_ending_hand_v01.webp',
    chapter: 'ending',
    preload: true,
  },
] as const satisfies readonly AssetManifestEntry[];

export function assetUrl(key: (typeof assetManifest)[number]['key']): string {
  const asset = assetManifest.find((entry) => entry.key === key);
  if (!asset) throw new Error(`Unknown asset key: ${key}`);
  return asset.url;
}
