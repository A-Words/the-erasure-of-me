import { chapterMaps, type WorldEntity } from '../content/maps';
import type { ChapterId, GameState } from '../state/GameState';

export type MapMode = 'full' | 'washed' | 'hidden';

export interface MapPath {
  id: string;
  d: string;
  secondary?: boolean;
}

export interface MapLabel {
  id: string;
  text: string;
  x: number;
  y: number;
}

export interface MapLandmark extends WorldEntity {
  symbol: 'umbrella' | 'station' | 'exit' | 'landmark';
  reached: boolean;
  visible: boolean;
}

export interface MapPresentation {
  mode: MapMode;
  chapterId: ChapterId;
  title: string;
  width: number;
  height: number;
  player: { x: number; y: number };
  paths: MapPath[];
  labels: MapLabel[];
  landmarks: MapLandmark[];
  soundCue: { x: number; y: number; label: string } | null;
}

interface MapLayout {
  paths: MapPath[];
  labels: MapLabel[];
}

const layouts: Record<ChapterId, MapLayout> = {
  home: {
    paths: [
      { id: 'outer', d: 'M64 64H1216V656H64Z' },
      { id: 'bedroom-wall', d: 'M520 64V390H64' },
      { id: 'kitchen-wall', d: 'M760 64V310H1216' },
      { id: 'entry-wall', d: 'M940 430H1216' },
    ],
    labels: [
      { id: 'room.bedroom', text: '卧室', x: 270, y: 245 },
      { id: 'room.living', text: '客厅', x: 650, y: 430 },
      { id: 'room.kitchen', text: '厨房', x: 990, y: 205 },
      { id: 'room.entry', text: '玄关', x: 1020, y: 610 },
    ],
  },
  rain: {
    paths: [
      {
        id: 'main-road',
        d: 'M80 620C260 610 250 520 390 500S560 390 690 330S875 245 1010 185S1120 135 1190 95',
      },
      { id: 'platform', d: 'M55 665H455', secondary: true },
      { id: 'market-lane', d: 'M410 505C520 580 710 575 825 480', secondary: true },
      { id: 'clock-lane', d: 'M805 480C960 430 1065 330 1160 205', secondary: true },
    ],
    labels: [
      { id: 'area.platform', text: '旧站台', x: 185, y: 675 },
      { id: 'area.market', text: '棚街', x: 640, y: 560 },
      { id: 'area.clock', text: '钟表铺', x: 1110, y: 165 },
    ],
  },
  life: {
    paths: [
      { id: 'outer', d: 'M70 90H1210V660H70Z' },
      { id: 'periods', d: 'M430 90V660M850 90V660' },
      { id: 'corridor', d: 'M560 90V30H760V90' },
    ],
    labels: [
      { id: 'period.first', text: '纸箱与新木纹', x: 245, y: 150 },
      { id: 'period.second', text: '桂花与杯印', x: 640, y: 150 },
      { id: 'period.third', text: '灯火与旧木纹', x: 1040, y: 150 },
    ],
  },
  return: {
    paths: [
      { id: 'vertical', d: 'M640 60V660' },
      { id: 'horizontal', d: 'M90 360H1190' },
      { id: 'room', d: 'M455 235H825V485H455Z', secondary: true },
    ],
    labels: [{ id: 'junction', text: '当前路口', x: 640, y: 335 }],
  },
  ending: {
    paths: [
      { id: 'outer', d: 'M150 120H1130V620H150Z' },
      { id: 'table', d: 'M490 285H790V470H490Z', secondary: true },
    ],
    labels: [{ id: 'home', text: '熟悉的家', x: 640, y: 180 }],
  },
};

export function getMapMode(state: Readonly<GameState>): MapMode {
  if (state.degradationStage === 'D4') return 'hidden';
  if (state.chapterId === 'rain') {
    return state.flags.includes('degradation.d1.started') ? 'washed' : 'full';
  }
  return state.degradationStage === 'D0' ? 'full' : 'washed';
}

function stationNumber(entityId: string): number | null {
  const value = entityId.match(/stone_(\d+)/)?.[1];
  return value ? Number(value) : null;
}

function isReached(state: Readonly<GameState>, entity: WorldEntity): boolean {
  if (entity.id === 'entity.rain.ticket') return state.inventory.includes('item.rain.ticket');
  const station = stationNumber(entity.id);
  if (station !== null) return state.puzzles.stationSequence.includes(station);
  if (entity.id.includes('umbrella_sign_')) return state.puzzles.rainSigns.includes(entity.id);
  if (entity.id === 'entity.rain.red_umbrella') {
    return state.memories.includes('memory.rain.umbrella');
  }
  return entity.kind === 'exit' ? state.checkpointId.includes('complete') : false;
}

function symbolFor(entity: WorldEntity): MapLandmark['symbol'] {
  if (entity.id.includes('umbrella')) return 'umbrella';
  if (entity.id.includes('stone_')) return 'station';
  if (entity.kind === 'exit') return 'exit';
  return 'landmark';
}

function shouldInclude(entity: WorldEntity): boolean {
  return Boolean(entity.color) || entity.kind === 'exit' || entity.id.includes('stone_');
}

export function createMapPresentation(state: Readonly<GameState>): MapPresentation {
  const map = chapterMaps[state.chapterId];
  const mode = getMapMode(state);
  const landmarks = map.entities.filter(shouldInclude).map((entity): MapLandmark => {
    const symbol = symbolFor(entity);
    const reached = isReached(state, entity);
    return {
      ...entity,
      symbol,
      reached,
      visible:
        mode === 'full' ||
        symbol === 'umbrella' ||
        (state.chapterId === 'rain' && symbol === 'station' && reached) ||
        (state.chapterId !== 'rain' && entity.kind === 'exit'),
    };
  });

  return {
    mode,
    chapterId: state.chapterId,
    title: map.title,
    width: map.width,
    height: map.height,
    player: { x: state.player.x, y: state.player.y },
    paths: layouts[state.chapterId].paths,
    labels: mode === 'full' ? layouts[state.chapterId].labels : [],
    landmarks,
    soundCue:
      state.chapterId === 'rain' && mode === 'washed'
        ? { x: 1150, y: 82, label: '钟声方向' }
        : null,
  };
}
