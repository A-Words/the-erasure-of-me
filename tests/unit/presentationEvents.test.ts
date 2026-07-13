import { describe, expect, it } from 'vitest';
import {
  createPresentationSnapshot,
  diffPresentationSnapshots,
} from '../../src/game/presentation/presentationEvents';
import { createInitialState } from '../../src/game/state/initialState';

function createPlayingState() {
  const state = createInitialState();
  state.phase = 'playing';
  return state;
}

describe('presentation events', () => {
  it('creates a detached immutable baseline without reporting progress', () => {
    const state = createPlayingState();
    const snapshot = createPresentationSnapshot(state);

    state.puzzles.stationSequence.push(2);
    state.memories.push('memory.rain.umbrella');

    expect(snapshot.rainStoneProgress).toBe(0);
    expect(snapshot.memories).toEqual([]);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.memories)).toBe(true);
    expect(Object.isFrozen(snapshot.lifePlacedObjects)).toBe(true);
    expect(Object.isFrozen(snapshot.returnPrefix)).toBe(true);
    expect(diffPresentationSnapshots(null, snapshot)).toEqual([]);
  });

  it('reports each newly reached rain stone and umbrella-sign step', () => {
    const before = createPlayingState();
    const after = structuredClone(before);
    after.puzzles.stationSequence = [2, 4, 5];
    after.puzzles.rainSigns = ['entity.rain.umbrella_sign_a', 'entity.rain.umbrella_sign_b'];

    expect(
      diffPresentationSnapshots(
        createPresentationSnapshot(before),
        createPresentationSnapshot(after),
      ),
    ).toEqual([
      { type: 'rain_stone_progress', step: 1 },
      { type: 'rain_stone_progress', step: 2 },
      { type: 'rain_stone_progress', step: 3 },
      { type: 'rain_sign_progress', step: 1 },
      { type: 'rain_sign_progress', step: 2 },
    ]);
  });

  it('reports life objects that newly return home with the resulting count', () => {
    const before = createPlayingState();
    before.puzzles.placedObjects = ['item.life.cassette'];
    const after = structuredClone(before);
    after.puzzles.placedObjects.push('item.life.wood_comb');

    expect(
      diffPresentationSnapshots(
        createPresentationSnapshot(before),
        createPresentationSnapshot(after),
      ),
    ).toEqual([
      {
        type: 'life_object_restored',
        itemId: 'item.life.wood_comb',
        restoredCount: 2,
      },
    ]);
  });

  it('distinguishes a correct return prefix from a completed junction', () => {
    const before = createPlayingState();
    const prefixReached = structuredClone(before);
    prefixReached.puzzles.returnPrefix = ['right'];
    const junctionCompleted = structuredClone(prefixReached);
    junctionCompleted.puzzles.returnPrefix = [];
    junctionCompleted.puzzles.returnJunction = 1;

    expect(
      diffPresentationSnapshots(
        createPresentationSnapshot(before),
        createPresentationSnapshot(prefixReached),
      ),
    ).toEqual([
      {
        type: 'return_prefix_progress',
        junction: 1,
        step: 1,
        direction: 'right',
      },
    ]);
    expect(
      diffPresentationSnapshots(
        createPresentationSnapshot(prefixReached),
        createPresentationSnapshot(junctionCompleted),
      ),
    ).toEqual([{ type: 'return_junction_completed', junction: 1 }]);
  });

  it('reports new memories and the ending handshake without score-like metadata', () => {
    const before = createPlayingState();
    const after = structuredClone(before);
    after.memories.push('memory.rain.umbrella');
    after.flags.push('ending.completed');

    const events = diffPresentationSnapshots(
      createPresentationSnapshot(before),
      createPresentationSnapshot(after),
    );

    expect(events).toEqual([
      { type: 'memory_added', memoryId: 'memory.rain.umbrella' },
      { type: 'ending_handshake_completed' },
    ]);
    expect(JSON.stringify(events)).not.toMatch(/score|success|rate/i);
    expect(Object.isFrozen(events)).toBe(true);
    expect(events.every(Object.isFrozen)).toBe(true);
  });

  it('does not turn regressions or unchanged state into progress', () => {
    const before = createPlayingState();
    before.puzzles.stationSequence = [2, 4, 5];
    before.puzzles.rainSigns = ['entity.rain.umbrella_sign_a', 'entity.rain.umbrella_sign_b'];
    before.puzzles.returnJunction = 2;
    const after = createPlayingState();

    expect(
      diffPresentationSnapshots(
        createPresentationSnapshot(before),
        createPresentationSnapshot(after),
      ),
    ).toEqual([]);
  });

  it('does not replay historical progress while loading, changing chapter, or returning to title', () => {
    const title = createInitialState();
    const loaded = createPlayingState();
    loaded.puzzles.stationSequence = [2, 4, 5];

    expect(
      diffPresentationSnapshots(
        createPresentationSnapshot(title),
        createPresentationSnapshot(loaded),
      ),
    ).toEqual([]);

    const nextChapter = structuredClone(loaded);
    nextChapter.chapterId = 'rain';
    expect(
      diffPresentationSnapshots(
        createPresentationSnapshot(loaded),
        createPresentationSnapshot(nextChapter),
      ),
    ).toEqual([]);

    const backAtTitle = structuredClone(loaded);
    backAtTitle.phase = 'title';
    expect(
      diffPresentationSnapshots(
        createPresentationSnapshot(loaded),
        createPresentationSnapshot(backAtTitle),
      ),
    ).toEqual([]);
  });
});
