import type { AccessibilitySettings, GameMode, GameState } from './GameState';

export const defaultSettings: AccessibilitySettings = {
  fontSize: 'normal',
  reducedMotion: false,
  subtitles: true,
  highContrast: false,
  muted: false,
  holdMode: 'hold',
};

export function createInitialState(mode: GameMode = 'standard'): GameState {
  return {
    schemaVersion: 1,
    phase: 'title',
    mode,
    chapterId: 'home',
    checkpointId: 'checkpoint.home.start',
    degradationStage: 'D0',
    player: { x: 180, y: 300, facing: 'down', moving: false },
    inventory: [],
    journalPages: [],
    memories: [],
    flags: [],
    puzzles: {
      stationSequence: [],
      rainSigns: [],
      photoOrder: ['photo.2001', 'photo.1979', 'photo.1992'],
      placedObjects: [],
      returnJunction: 0,
      returnPrefix: [],
      routeLoops: 0,
    },
    settings: { ...defaultSettings },
    modal: null,
    objective: '找到钥匙和秀兰留下的日记',
    message: null,
    dialogue: [],
    dialogueIndex: 0,
    holdProgress: 0,
    hintSeconds: 0,
    hintLevel: 0,
    playTimeSeconds: 0,
  };
}
