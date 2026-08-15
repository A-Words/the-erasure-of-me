import type { AccessibilitySettings, GameMode, GameState, SettingsPatch } from './GameState';
import { normalizeLocalePreference, text } from '../../i18n';

export const defaultSettings: AccessibilitySettings = {
  localePreference: 'system',
  fontSize: 'normal',
  reducedMotion: false,
  subtitles: true,
  highContrast: false,
  muted: false,
  holdMode: 'hold',
  audioVolumes: {
    music: 0.55,
    ambience: 0.65,
    voice: 0.75,
    sfx: 0.65,
  },
};

export function normalizeSettings(settings: SettingsPatch = {}): AccessibilitySettings {
  return {
    ...defaultSettings,
    ...settings,
    localePreference: normalizeLocalePreference(settings.localePreference),
    audioVolumes: {
      ...defaultSettings.audioVolumes,
      ...settings.audioVolumes,
    },
  };
}

export function createInitialState(mode: GameMode = 'standard'): GameState {
  return {
    schemaVersion: 2,
    phase: 'title',
    mode,
    chapterId: 'home',
    checkpointId: 'checkpoint.home.start',
    degradationStage: 'D0',
    player: { x: 310, y: 302, facing: 'down', moving: false },
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
    settings: normalizeSettings(),
    modal: null,
    objective: text('objective.home.start'),
    message: null,
    dialogue: [],
    dialogueIndex: 0,
    activeMemoryId: null,
    holdProgress: 0,
    mapWashSeconds: 0,
    rainMapClosedAtX: null,
    hintSeconds: 0,
    hintLevel: 0,
    playTimeSeconds: 0,
  };
}
