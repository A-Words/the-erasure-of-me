import { describe, expect, it } from 'vitest';
import { AudioManager, resolveChapterAudioProfile } from '../../src/phaser/audio/AudioManager';
import { normalizeSettings } from '../../src/game/state/initialState';

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
});
