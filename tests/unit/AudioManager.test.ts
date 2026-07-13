import { describe, expect, it } from 'vitest';
import {
  AudioManager,
  resolveChapterAudioProfile,
  resolveSemanticAudioPattern,
} from '../../src/phaser/audio/AudioManager';
import type { SemanticAudioCue } from '../../src/phaser/audio/AudioManager';
import { normalizeSettings } from '../../src/game/state/initialState';

const progressCues: readonly SemanticAudioCue[] = [
  'rain_stone_1',
  'rain_stone_2',
  'rain_stone_3',
  'rain_wayfinder',
  'life_object_returned',
  'return_path_step',
  'return_junction',
  'memory_recalled',
  'ending_handshake',
];

describe('chapter audio profiles', () => {
  it('removes high-frequency theme layers as degradation advances', () => {
    const home = resolveChapterAudioProfile('home');
    const life = resolveChapterAudioProfile('life');
    const ending = resolveChapterAudioProfile('ending');

    expect(home).toMatchObject({ stage: 'D0', melody: true, rhythm: true });
    expect(life).toMatchObject({ stage: 'D2', melody: false, harmony: true });
    expect(ending).toMatchObject({ stage: 'D4', melody: false, harmony: false, drone: true });
  });

  it('returns a copy so renderer code cannot mutate the authored profile', () => {
    const first = resolveChapterAudioProfile('rain');
    first.ambienceLevel = 1;
    expect(resolveChapterAudioProfile('rain').ambienceLevel).not.toBe(1);
  });

  it('migrates older settings snapshots with the full default mix', () => {
    const settings = normalizeSettings({ muted: true });
    expect(settings.muted).toBe(true);
    expect(settings.audioVolumes).toEqual({
      music: 0.55,
      ambience: 0.65,
      voice: 0.75,
      sfx: 0.65,
    });
  });

  it('falls back to silence when Web Audio is unavailable', async () => {
    const manager = new AudioManager();

    await expect(manager.unlock()).resolves.toBeUndefined();
  });

  it.each(progressCues)('keeps %s to a restrained three-note semantic anchor', (cue) => {
    const pattern = resolveSemanticAudioPattern(cue);

    expect(pattern.notes).toHaveLength(3);
    expect(pattern.notes.some(([frequency]) => frequency <= 150)).toBe(true);
    expect(pattern.level).toBeLessThanOrEqual(0.05);
    expect(pattern.bus).not.toBe('music');
  });

  it('gives the three rain stones distinct bell resolutions', () => {
    const resolutions = (['rain_stone_1', 'rain_stone_2', 'rain_stone_3'] as const).map((cue) => {
      const notes = resolveSemanticAudioPattern(cue).notes;
      return notes[notes.length - 1][0];
    });

    expect(new Set(resolutions).size).toBe(3);
  });

  it('returns detached immutable semantic patterns', () => {
    const pattern = resolveSemanticAudioPattern('memory_recalled');

    expect(Object.isFrozen(pattern)).toBe(true);
    expect(Object.isFrozen(pattern.notes)).toBe(true);
    expect(pattern.notes.every(Object.isFrozen)).toBe(true);
    expect(resolveSemanticAudioPattern('memory_recalled')).not.toBe(pattern);
  });
});
