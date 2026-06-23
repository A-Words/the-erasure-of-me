import { describe, expect, it } from 'vitest';
import { GameStore } from '../../src/game/state/GameStore';
import { createInitialState } from '../../src/game/state/initialState';

function clearDialogue(store: GameStore): void {
  while (store.getState().dialogue.length > 0) store.dispatch({ type: 'ADVANCE_DIALOGUE' });
}

describe('GameStore', () => {
  it('blocks movement under a modal', () => {
    const store = new GameStore(createInitialState());
    store.dispatch({ type: 'NEW_GAME', mode: 'standard' });
    clearDialogue(store);
    const before = store.getState().player.x;
    store.dispatch({ type: 'OPEN_MODAL', modal: 'pause' });
    store.dispatch({ type: 'MOVE', direction: 'right', deltaSeconds: 1 });
    expect(store.getState().player.x).toBe(before);
  });

  it('stops movement without changing the last position or facing', () => {
    const state = createInitialState();
    state.phase = 'playing';
    const store = new GameStore(state);
    store.dispatch({ type: 'MOVE', direction: 'right', deltaSeconds: 0.05 });
    const afterMove = { ...store.getState().player };

    store.dispatch({ type: 'STOP_MOVING' });

    expect(store.getState().player).toEqual({ ...afterMove, moving: false });
    expect(store.getState().player.facing).toBe('right');
  });

  it('keeps the player outside home furniture footprints', () => {
    const state = createInitialState();
    state.phase = 'playing';
    state.player = { x: 66, y: 240, facing: 'right', moving: false };
    const store = new GameStore(state);

    store.dispatch({ type: 'MOVE', direction: 'right', deltaSeconds: 0.05 });

    expect(store.getState().player.x).toBe(66);
    expect(store.getState().player.facing).toBe('right');
  });

  it('keeps the correct station prefix after a soft miss', () => {
    const state = createInitialState();
    state.phase = 'playing';
    state.chapterId = 'rain';
    state.degradationStage = 'D1';
    const store = new GameStore(state);
    store.dispatch({ type: 'INTERACT', entityId: 'entity.rain.stone_2' });
    store.dispatch({ type: 'INTERACT', entityId: 'entity.rain.stone_5' });
    expect(store.getState().puzzles.stationSequence).toEqual([2]);
  });

  it('accepts the documented photo order', () => {
    const state = createInitialState();
    state.phase = 'playing';
    state.chapterId = 'life';
    const store = new GameStore(state);
    store.dispatch({ type: 'PHOTO_ORDER', order: ['photo.1979', 'photo.1992', 'photo.2001'] });
    expect(store.getState().flags).toContain('puzzle.life.photo_order.completed');
    expect(store.getState().checkpointId).toBe('checkpoint.life.photos');
  });

  it('preserves a correct route prefix after a wrong exit', () => {
    const state = createInitialState();
    state.phase = 'playing';
    state.chapterId = 'return';
    state.degradationStage = 'D3';
    state.flags = ['flag.return.mapping_learned'];
    const store = new GameStore(state);
    store.dispatch({ type: 'INTERACT', entityId: 'route.right' });
    store.dispatch({ type: 'INTERACT', entityId: 'route.down' });
    expect(store.getState().puzzles.returnPrefix).toEqual(['right']);
    expect(store.getState().puzzles.routeLoops).toBe(1);
  });

  it('pauses hint time under stable system UI and unlocks neutral hints', () => {
    const state = createInitialState();
    state.phase = 'playing';
    const store = new GameStore(state);
    store.dispatch({ type: 'OPEN_MODAL', modal: 'pause' });
    store.dispatch({ type: 'TICK', deltaSeconds: 100 });
    expect(store.getState().hintLevel).toBe(0);
    store.dispatch({ type: 'CLOSE_MODAL' });
    store.dispatch({ type: 'TICK', deltaSeconds: 90 });
    expect(store.getState().hintLevel).toBe(1);
    expect(store.getState().message).toContain('蓝色小碗');
  });

  it('updates one audio bus without resetting the other mix values', () => {
    const store = new GameStore();
    const ambienceBefore = store.getState().settings.audioVolumes.ambience;
    store.dispatch({ type: 'SETTINGS', patch: { audioVolumes: { music: 0.2 } } });
    expect(store.getState().settings.audioVolumes.music).toBe(0.2);
    expect(store.getState().settings.audioVolumes.ambience).toBe(ambienceBefore);
  });

  it('can seed a documented chapter state for development visual review', () => {
    const store = new GameStore();
    store.dispatch({ type: 'DEBUG_JUMP_CHAPTER', chapterId: 'ending' });
    expect(store.getState().chapterId).toBe('ending');
    expect(store.getState().degradationStage).toBe('D4');
    expect(store.getState().checkpointId).toBe('checkpoint.ending.start');
  });

  it('can seed the rain memory cutscene without bypassing its domain flags', () => {
    const store = new GameStore();
    store.dispatch({ type: 'DEBUG_SHOW_MEMORY', memoryId: 'rain' });
    expect(store.getState().memories).toContain('memory.rain.umbrella');
    expect(store.getState().flags).toContain('transition.to.life');
    expect(store.getState().dialogue.length).toBeGreaterThan(0);
    expect(store.getState().activeMemoryId).toBe('rain');
  });

  it('can seed the moving-day memory through the real placement rules', () => {
    const store = new GameStore();
    store.dispatch({ type: 'DEBUG_SHOW_MEMORY', memoryId: 'life.move' });
    expect(store.getState().chapterId).toBe('life');
    expect(store.getState().puzzles.placedObjects).toContain('item.life.wood_comb');
    expect(store.getState().activeMemoryId).toBe('life.move');
  });

  it('can seed the osmanthus memory through the real placement rules', () => {
    const store = new GameStore();
    store.dispatch({ type: 'DEBUG_SHOW_MEMORY', memoryId: 'life.osmanthus' });
    expect(store.getState().puzzles.placedObjects).toContain('item.life.enamel_cup');
    expect(store.getState().activeMemoryId).toBe('life.osmanthus');
  });

  it('can seed the cassette memory through the real placement rules', () => {
    const store = new GameStore();
    store.dispatch({ type: 'DEBUG_SHOW_MEMORY', memoryId: 'life.cassette' });
    expect(store.getState().puzzles.placedObjects).toContain('item.life.cassette');
    expect(store.getState().activeMemoryId).toBe('life.cassette');
  });

  it('can seed the held-hand ending through the real consent and hold rules', () => {
    const store = new GameStore();
    store.dispatch({ type: 'DEBUG_SHOW_MEMORY', memoryId: 'ending.hand' });
    expect(store.getState().chapterId).toBe('ending');
    expect(store.getState().flags).toContain('ending.ready_to_hold');
    expect(store.getState().flags).toContain('ending.completed');
    expect(store.getState().activeMemoryId).toBe('ending.hand');
  });

  it('cancels an incomplete hand hold and only completes after the configured duration', () => {
    const state = createInitialState();
    state.phase = 'playing';
    state.chapterId = 'ending';
    state.flags = ['ending.ready_to_hold'];
    const store = new GameStore(state);

    store.dispatch({ type: 'HOLD', deltaSeconds: 0.75 });
    expect(store.getState().holdProgress).toBe(0.5);
    expect(store.getState().flags).not.toContain('ending.completed');
    store.dispatch({ type: 'CANCEL_HOLD' });
    expect(store.getState().holdProgress).toBe(0);

    store.dispatch({ type: 'HOLD', deltaSeconds: 1.5 });
    expect(store.getState().holdProgress).toBe(1);
    expect(store.getState().flags).toContain('ending.completed');
  });
});
