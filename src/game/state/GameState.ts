export type ChapterId = 'home' | 'rain' | 'life' | 'return' | 'ending';
export type DegradationStage = 'D0' | 'D1' | 'D2' | 'D3' | 'D4';
export type GameMode = 'standard' | 'low_stimulation';
export type ModalId = 'inventory' | 'journal' | 'map' | 'pause' | 'photo_order' | null;
export type AudioBus = 'music' | 'ambience' | 'voice' | 'sfx';
export type MemoryIllustrationId =
  | 'rain'
  | 'life.move'
  | 'life.osmanthus'
  | 'life.cassette'
  | 'ending.hand';

export interface AccessibilitySettings {
  fontSize: 'normal' | 'large';
  reducedMotion: boolean;
  subtitles: boolean;
  highContrast: boolean;
  muted: boolean;
  holdMode: 'hold' | 'short' | 'single';
  audioVolumes: Record<AudioBus, number>;
}

export type SettingsPatch = Omit<Partial<AccessibilitySettings>, 'audioVolumes'> & {
  audioVolumes?: Partial<AccessibilitySettings['audioVolumes']>;
};

export interface PlayerState {
  x: number;
  y: number;
  facing: 'up' | 'down' | 'left' | 'right';
  moving: boolean;
}

export interface PuzzleProgress {
  stationSequence: number[];
  rainSigns: string[];
  photoOrder: string[];
  placedObjects: string[];
  returnJunction: number;
  returnPrefix: string[];
  routeLoops: number;
}

export interface GameState {
  schemaVersion: 1;
  phase: 'title' | 'playing' | 'guide';
  mode: GameMode;
  chapterId: ChapterId;
  checkpointId: string;
  degradationStage: DegradationStage;
  player: PlayerState;
  inventory: string[];
  journalPages: string[];
  memories: string[];
  flags: string[];
  puzzles: PuzzleProgress;
  settings: AccessibilitySettings;
  modal: ModalId;
  objective: string;
  message: string | null;
  dialogue: string[];
  dialogueIndex: number;
  activeMemoryId: MemoryIllustrationId | null;
  holdProgress: number;
  mapWashSeconds: number;
  rainMapClosedAtX: number | null;
  hintSeconds: number;
  hintLevel: 0 | 1 | 2 | 3;
  playTimeSeconds: number;
}

export type GameCommand =
  | { type: 'NEW_GAME'; mode: GameMode }
  | { type: 'CONTINUE_GAME' }
  | { type: 'MOVE'; direction: WorldDirection; deltaSeconds: number }
  | { type: 'STOP_MOVING' }
  | { type: 'INTERACT'; entityId: string }
  | { type: 'ADVANCE_DIALOGUE' }
  | { type: 'OPEN_MODAL'; modal: Exclude<ModalId, null> }
  | { type: 'CLOSE_MODAL' }
  | { type: 'SETTINGS'; patch: SettingsPatch }
  | { type: 'SET_MODE'; mode: GameMode }
  | { type: 'PHOTO_ORDER'; order: string[] }
  | { type: 'ACKNOWLEDGE_D3' }
  | { type: 'HOLD'; deltaSeconds: number }
  | { type: 'TICK'; deltaSeconds: number }
  | { type: 'CANCEL_HOLD' }
  | { type: 'RETURN_TITLE' }
  | { type: 'DEBUG_JUMP_CHAPTER'; chapterId: ChapterId }
  | { type: 'DEBUG_SHOW_MEMORY'; memoryId: MemoryIllustrationId }
  | { type: 'CLEAR_MESSAGE' };

export type WorldDirection = 'up' | 'down' | 'left' | 'right';
