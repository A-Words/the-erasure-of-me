import type { ChapterId } from '../state/GameState';

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
  title: string;
  subtitle: string;
  width: number;
  height: number;
  spawn: { x: number; y: number };
  palette: { floor: number; wall: number; accent: number };
  entities: WorldEntity[];
}

export const chapterMaps: Record<ChapterId, ChapterMap> = {
  home: {
    id: 'map.home',
    title: '第一章 · 清晨的家',
    subtitle: '熟悉的东西，都在它们原来的位置。',
    width: 1280,
    height: 720,
    spawn: { x: 180, y: 300 },
    palette: { floor: 0xc7b9a3, wall: 0x756253, accent: 0x8da2a6 },
    entities: [
      { id: 'entity.home.bedside_photo', label: '床边合影', x: 280, y: 160, kind: 'inspect' },
      {
        id: 'entity.home.journal',
        label: '红线日记',
        x: 610,
        y: 250,
        kind: 'pickup',
        color: 0xb54949,
      },
      { id: 'entity.home.glasses_case', label: '眼镜盒', x: 720, y: 470, kind: 'pickup' },
      {
        id: 'entity.home.key_bowl',
        label: '蓝色小碗',
        x: 1040,
        y: 500,
        kind: 'pickup',
        color: 0x276a78,
      },
      { id: 'entity.home.front_door', label: '玄关门', x: 1160, y: 360, kind: 'exit' },
    ],
  },
  rain: {
    id: 'map.rain_station',
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
    title: '第三章 · 共同生活',
    subtitle: '名字有些远。样子和触感还在。',
    width: 1280,
    height: 720,
    spawn: { x: 640, y: 590 },
    palette: { floor: 0x87917a, wall: 0x5a6254, accent: 0xd0bd79 },
    entities: [
      { id: 'item.photo.move_1979', label: '纸箱旁的照片', x: 230, y: 520, kind: 'pickup' },
      { id: 'item.photo.osmanthus_1992', label: '桂花窗台照片', x: 1060, y: 180, kind: 'pickup' },
      { id: 'item.photo.anniversary_2001', label: '银婚照片', x: 1030, y: 520, kind: 'pickup' },
      { id: 'entity.life.album', label: '空着三格的相册', x: 640, y: 160, kind: 'puzzle' },
      { id: 'item.life.wood_comb', label: '有裂缝的条纹物件', x: 310, y: 340, kind: 'pickup' },
      { id: 'item.life.enamel_cup', label: '带桂花圆点的物件', x: 890, y: 330, kind: 'pickup' },
      { id: 'item.life.cassette', label: '双线圈波纹物件', x: 880, y: 570, kind: 'pickup' },
      { id: 'slot.life.dresser', label: '镜台 · 条纹槽', x: 260, y: 150, kind: 'slot' },
      { id: 'slot.life.windowsill', label: '窗台 · 圆点槽', x: 1030, y: 150, kind: 'slot' },
      { id: 'slot.life.radio', label: '收音机 · 波纹槽', x: 1040, y: 590, kind: 'slot' },
      { id: 'entity.life.exit', label: '延长的走廊', x: 640, y: 50, kind: 'exit' },
    ],
  },
  return: {
    id: 'map.return_corridor',
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
