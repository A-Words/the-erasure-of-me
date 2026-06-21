import type { ChapterId } from '../state/GameState';

export interface AssetManifestEntry {
  key: string;
  type: 'tilemap' | 'image';
  url: string;
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
    key: 'character.xu_old.idle.down',
    type: 'image',
    url: 'assets/characters/character_xu_old_idle_down_v01_64x96.png',
    preload: true,
  },
  {
    key: 'character.xiulan_old.idle.down',
    type: 'image',
    url: 'assets/characters/character_xiulan_old_idle_down_v01_64x96.png',
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
] as const satisfies readonly AssetManifestEntry[];

export function assetUrl(key: (typeof assetManifest)[number]['key']): string {
  const asset = assetManifest.find((entry) => entry.key === key);
  if (!asset) throw new Error(`Unknown asset key: ${key}`);
  return asset.url;
}
