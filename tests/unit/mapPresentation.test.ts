import { describe, expect, it } from 'vitest';
import { createMapPresentation, getMapMode } from '../../src/game/presentation/mapPresentation';
import { createInitialState } from '../../src/game/state/initialState';

describe('map presentation', () => {
  it('uses the live player position on the complete home map', () => {
    const state = createInitialState();
    state.phase = 'playing';
    state.player = { x: 512, y: 384, facing: 'right', moving: false };

    const map = createMapPresentation(state);

    expect(map.mode).toBe('full');
    expect(map.player).toEqual({ x: 512, y: 384 });
    expect(map.labels.map((label) => label.text)).toEqual(['卧室', '客厅', '厨房', '玄关']);
    expect(map.landmarks.find((landmark) => landmark.id === 'entity.home.journal')?.symbol).toBe(
      'landmark',
    );
  });

  it('keeps the first rain map complete until the wash trigger starts', () => {
    const state = createInitialState();
    state.phase = 'playing';
    state.chapterId = 'rain';
    state.degradationStage = 'D1';

    expect(getMapMode(state)).toBe('full');
    expect(createMapPresentation(state).labels.length).toBeGreaterThan(0);
  });

  it('retains reached stations, red umbrellas, player and sound direction after D1', () => {
    const state = createInitialState();
    state.phase = 'playing';
    state.chapterId = 'rain';
    state.degradationStage = 'D1';
    state.flags = ['degradation.d1.started'];
    state.puzzles.stationSequence = [2, 4];

    const map = createMapPresentation(state);
    const visibleIds = map.landmarks
      .filter((landmark) => landmark.visible)
      .map((landmark) => landmark.id);

    expect(map.mode).toBe('washed');
    expect(map.player).toEqual({ x: state.player.x, y: state.player.y });
    expect(map.soundCue?.label).toBe('钟声方向');
    expect(visibleIds).toContain('entity.rain.stone_2');
    expect(visibleIds).toContain('entity.rain.stone_4');
    expect(visibleIds).not.toContain('entity.rain.stone_5');
    expect(visibleIds).toContain('entity.rain.umbrella_sign_a');
    expect(visibleIds).toContain('entity.rain.red_umbrella');
  });

  it('hides the gameplay map during D4', () => {
    const state = createInitialState();
    state.phase = 'playing';
    state.chapterId = 'ending';
    state.degradationStage = 'D4';

    expect(getMapMode(state)).toBe('hidden');
  });
});
