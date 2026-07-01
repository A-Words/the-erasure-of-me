import type { ChapterId, PlayerState } from '../state/GameState';

export interface WorldEntity {
  id: string;
  label: string;
  x: number;
  y: number;
  kind: 'inspect' | 'pickup' | 'puzzle' | 'exit' | 'anchor' | 'slot';
  color?: number;
}

export interface ChapterMap {
  id: string;
  backgroundKey: string;
  title: string;
  subtitle: string;
  width: number;
  height: number;
  spawn: { x: number; y: number };
  palette: { floor: number; wall: number; accent: number };
  entities: WorldEntity[];
}

export interface CheckpointSpawn {
  chapterId: ChapterId;
  x: number;
  y: number;
  facing: PlayerState['facing'];
}

export const chapterMaps: Record<ChapterId, ChapterMap> = {
  home: {
    id: 'map.home',
    backgroundKey: 'environment.home.background',
    title: '第一章 · 清晨的家',
    subtitle: '熟悉的东西，都在它们原来的位置。',
    width: 1280,
    height: 720,
    spawn: { x: 310, y: 302 },
    palette: { floor: 0xc7b9a3, wall: 0x756253, accent: 0x8da2a6 },
    entities: [
      { id: 'entity.home.bedside_photo', label: '床边合影', x: 300, y: 168, kind: 'inspect' },
      {
        id: 'entity.home.journal',
        label: '红线日记',
        x: 610,
        y: 282,
        kind: 'pickup',
        color: 0xb54949,
      },
      { id: 'entity.home.glasses_case', label: '眼镜盒', x: 700, y: 510, kind: 'pickup' },
      {
        id: 'entity.home.key_bowl',
        label: '蓝色小碗',
        x: 1080,
        y: 502,
        kind: 'pickup',
        color: 0x276a78,
      },
      { id: 'entity.home.front_door', label: '玄关门', x: 1225, y: 560, kind: 'exit' },
    ],
  },
  rain: {
    id: 'map.rain_station',
    backgroundKey: 'environment.rain.background',
    title: '第二章 · 雨中的初遇',
    subtitle: '有些路名看不清了。钟声还在。',
    width: 1280,
    height: 720,
    spawn: { x: 100, y: 600 },
    palette: { floor: 0x526b75, wall: 0x31444d, accent: 0xb7aa82 },
    entities: [
      { id: 'entity.rain.ticket', label: '泡软的旧车票', x: 180, y: 560, kind: 'pickup' },
      { id: 'entity.rain.stone_2', label: '两个圆点', x: 330, y: 520, kind: 'puzzle' },
      { id: 'entity.rain.stone_4', label: '四个圆点', x: 510, y: 410, kind: 'puzzle' },
      { id: 'entity.rain.stone_5', label: '五个圆点', x: 680, y: 310, kind: 'puzzle' },
      {
        id: 'entity.rain.umbrella_sign_a',
        label: '红伞招牌',
        x: 820,
        y: 270,
        kind: 'anchor',
        color: 0xb54949,
      },
      {
        id: 'entity.rain.umbrella_sign_b',
        label: '又一把红伞',
        x: 980,
        y: 180,
        kind: 'anchor',
        color: 0xb54949,
      },
      {
        id: 'entity.rain.red_umbrella',
        label: '钟表铺前的红伞',
        x: 1140,
        y: 120,
        kind: 'exit',
        color: 0xb54949,
      },
    ],
  },
  life: {
    id: 'map.shared_life',
    backgroundKey: 'environment.life.background',
    title: '第三章 · 共同生活',
    subtitle: '名字有些远。样子和触感还在。',
    width: 1280,
    height: 720,
    spawn: { x: 640, y: 590 },
    palette: { floor: 0x87917a, wall: 0x5a6254, accent: 0xd0bd79 },
    entities: [
      { id: 'item.photo.move_1979', label: '纸箱旁的照片', x: 140, y: 430, kind: 'pickup' },
      { id: 'item.photo.osmanthus_1992', label: '桂花窗台照片', x: 500, y: 250, kind: 'pickup' },
      { id: 'item.photo.anniversary_2001', label: '银婚照片', x: 885, y: 420, kind: 'pickup' },
      { id: 'entity.life.album', label: '空着三格的相册', x: 625, y: 465, kind: 'puzzle' },
      { id: 'item.life.wood_comb', label: '有裂缝的条纹物件', x: 320, y: 390, kind: 'pickup' },
      { id: 'item.life.enamel_cup', label: '带桂花圆点的物件', x: 610, y: 320, kind: 'pickup' },
      { id: 'item.life.cassette', label: '双线圈波纹物件', x: 870, y: 570, kind: 'pickup' },
      { id: 'slot.life.dresser', label: '镜台 · 条纹槽', x: 335, y: 285, kind: 'slot' },
      { id: 'slot.life.windowsill', label: '窗台 · 圆点槽', x: 585, y: 215, kind: 'slot' },
      { id: 'slot.life.radio', label: '收音机 · 波纹槽', x: 1065, y: 285, kind: 'slot' },
      { id: 'entity.life.exit', label: '延长的走廊', x: 700, y: 70, kind: 'exit' },
    ],
  },
  return: {
    id: 'map.return_corridor',
    backgroundKey: 'environment.return.background',
    title: '第四章 · 回家的路',
    subtitle: '方向变了。地上的箭头还在。',
    width: 1280,
    height: 720,
    spawn: { x: 640, y: 360 },
    palette: { floor: 0x53616c, wall: 0x293640, accent: 0xb54949 },
    entities: [
      { id: 'route.up', label: '向上的出口', x: 640, y: 90, kind: 'exit' },
      { id: 'route.right', label: '向右的出口', x: 1160, y: 360, kind: 'exit' },
      { id: 'route.down', label: '向下的出口', x: 640, y: 630, kind: 'exit' },
      { id: 'route.left', label: '向左的出口', x: 120, y: 360, kind: 'exit' },
    ],
  },
  ending: {
    id: 'map.home_ending',
    backgroundKey: 'environment.ending.background',
    title: '尾声 · 面还是热的',
    subtitle: '',
    width: 1280,
    height: 720,
    spawn: { x: 920, y: 430 },
    palette: { floor: 0xd8cbb8, wall: 0x8b7665, accent: 0xb54949 },
    entities: [
      {
        id: 'entity.ending.xiulan',
        label: '她把手停在那里',
        x: 620,
        y: 360,
        kind: 'anchor',
        color: 0xb54949,
      },
    ],
  },
};

export const checkpointSpawns: Readonly<Record<string, CheckpointSpawn>> = {
  'checkpoint.home.start': {
    chapterId: 'home',
    ...chapterMaps.home.spawn,
    facing: 'down',
  },
  'checkpoint.home.journal': { chapterId: 'home', x: 610, y: 350, facing: 'up' },
  'checkpoint.home.key': { chapterId: 'home', x: 1100, y: 620, facing: 'up' },
  'checkpoint.rain.start': {
    chapterId: 'rain',
    ...chapterMaps.rain.spawn,
    facing: 'right',
  },
  'checkpoint.rain.sequence': { chapterId: 'rain', x: 720, y: 310, facing: 'up' },
  'checkpoint.rain.complete': { chapterId: 'rain', x: 1120, y: 160, facing: 'up' },
  'checkpoint.life.start': {
    chapterId: 'life',
    ...chapterMaps.life.spawn,
    facing: 'up',
  },
  'checkpoint.life.photos': { chapterId: 'life', x: 640, y: 590, facing: 'up' },
  'checkpoint.life.complete': { chapterId: 'life', x: 700, y: 120, facing: 'up' },
  'checkpoint.return.training': {
    chapterId: 'return',
    ...chapterMaps.return.spawn,
    facing: 'right',
  },
  'checkpoint.return.junction_1': { chapterId: 'return', x: 640, y: 360, facing: 'up' },
  'checkpoint.return.junction_2': { chapterId: 'return', x: 640, y: 360, facing: 'up' },
  'checkpoint.return.junction_3': { chapterId: 'return', x: 640, y: 360, facing: 'up' },
  'checkpoint.return.complete': { chapterId: 'return', x: 640, y: 120, facing: 'up' },
  'checkpoint.ending.start': {
    chapterId: 'ending',
    ...chapterMaps.ending.spawn,
    facing: 'left',
  },
  'checkpoint.ending.complete': { chapterId: 'ending', x: 760, y: 430, facing: 'left' },
};

export function getCheckpointSpawn(checkpointId: string, chapterId: ChapterId): PlayerState | null {
  const checkpoint = checkpointSpawns[checkpointId];
  if (!checkpoint || checkpoint.chapterId !== chapterId) return null;
  return {
    x: checkpoint.x,
    y: checkpoint.y,
    facing: checkpoint.facing,
    moving: false,
  };
}

export const itemLabels: Record<string, string> = {
  'item.home.journal': '红线日记',
  'item.home.key': '家门钥匙',
  'item.home.glasses_case': '眼镜盒',
  'item.rain.ticket': '旧车票 · 2 → 4 → 5',
  'item.photo.1979': '1979 · 搬家',
  'item.photo.1992': '1992 · 桂花窗台',
  'item.photo.2001': '2001 · 银婚',
  'item.life.wood_comb': '木梳 · 条纹',
  'item.life.enamel_cup': '搪瓷杯 · 圆点',
  'item.life.cassette': '录音带 · 波纹',
};
