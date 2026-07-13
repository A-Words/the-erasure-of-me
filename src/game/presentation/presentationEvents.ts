import type { GameState, WorldDirection } from '../state/GameState';

export type RainStoneStep = 1 | 2 | 3;
export type RainSignStep = 1 | 2;
export type LifeObjectCount = 1 | 2 | 3;
export type ReturnJunctionNumber = 1 | 2 | 3;
export type ReturnPrefixStep = 1 | 2 | 3;

export interface PresentationSnapshot {
  readonly phase: GameState['phase'];
  readonly chapterId: GameState['chapterId'];
  readonly rainStoneProgress: 0 | RainStoneStep;
  readonly rainSignProgress: 0 | RainSignStep;
  readonly lifePlacedObjects: readonly string[];
  readonly returnJunctionsCompleted: 0 | ReturnJunctionNumber;
  readonly returnPrefix: readonly WorldDirection[];
  readonly memories: readonly string[];
  readonly endingHandshakeCompleted: boolean;
}

export type PresentationEvent =
  | Readonly<{ type: 'rain_stone_progress'; step: RainStoneStep }>
  | Readonly<{ type: 'rain_sign_progress'; step: RainSignStep }>
  | Readonly<{
      type: 'life_object_restored';
      itemId: string;
      restoredCount: LifeObjectCount;
    }>
  | Readonly<{
      type: 'return_prefix_progress';
      junction: ReturnJunctionNumber;
      step: ReturnPrefixStep;
      direction: WorldDirection;
    }>
  | Readonly<{ type: 'return_junction_completed'; junction: ReturnJunctionNumber }>
  | Readonly<{ type: 'memory_added'; memoryId: string }>
  | Readonly<{ type: 'ending_handshake_completed' }>;

const RAIN_STONE_ORDER = [2, 4, 5] as const;
const RAIN_SIGN_ORDER = ['entity.rain.umbrella_sign_a', 'entity.rain.umbrella_sign_b'] as const;
const LIFE_OBJECT_ORDER = [
  'item.life.wood_comb',
  'item.life.enamel_cup',
  'item.life.cassette',
] as const;
const WORLD_DIRECTIONS: readonly WorldDirection[] = ['up', 'down', 'left', 'right'];
const NO_PRESENTATION_EVENTS: readonly PresentationEvent[] = Object.freeze([]);

function matchingPrefixLength<T>(values: readonly T[], expected: readonly T[]): number {
  let length = 0;
  while (length < expected.length && values[length] === expected[length]) length += 1;
  return length;
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)]);
}

function isWorldDirection(value: string): value is WorldDirection {
  return WORLD_DIRECTIONS.includes(value as WorldDirection);
}

export function createPresentationSnapshot(
  state: Readonly<GameState>,
): Readonly<PresentationSnapshot> {
  const lifePlacedObjects = Object.freeze(
    LIFE_OBJECT_ORDER.filter((itemId) => state.puzzles.placedObjects.includes(itemId)),
  );
  const returnPrefix = Object.freeze(state.puzzles.returnPrefix.filter(isWorldDirection));
  const returnJunctionsCompleted = Math.max(
    0,
    Math.min(3, Math.trunc(state.puzzles.returnJunction)),
  ) as PresentationSnapshot['returnJunctionsCompleted'];

  return Object.freeze({
    phase: state.phase,
    chapterId: state.chapterId,
    rainStoneProgress: matchingPrefixLength(
      state.puzzles.stationSequence,
      RAIN_STONE_ORDER,
    ) as PresentationSnapshot['rainStoneProgress'],
    rainSignProgress: matchingPrefixLength(
      state.puzzles.rainSigns,
      RAIN_SIGN_ORDER,
    ) as PresentationSnapshot['rainSignProgress'],
    lifePlacedObjects,
    returnJunctionsCompleted,
    returnPrefix,
    memories: uniqueStrings(state.memories),
    endingHandshakeCompleted: state.flags.includes('ending.completed'),
  });
}

function prefixExtends(
  previous: readonly WorldDirection[],
  current: readonly WorldDirection[],
): boolean {
  return previous.every((direction, index) => current[index] === direction);
}

function pushFrozen(events: PresentationEvent[], event: PresentationEvent): void {
  events.push(Object.freeze(event));
}

export function diffPresentationSnapshots(
  previous: Readonly<PresentationSnapshot> | null,
  current: Readonly<PresentationSnapshot>,
): readonly PresentationEvent[] {
  if (!previous) return NO_PRESENTATION_EVENTS;
  if (
    previous.phase !== 'playing' ||
    current.phase !== 'playing' ||
    previous.chapterId !== current.chapterId
  ) {
    return NO_PRESENTATION_EVENTS;
  }

  const events: PresentationEvent[] = [];

  for (let step = previous.rainStoneProgress + 1; step <= current.rainStoneProgress; step += 1) {
    pushFrozen(events, { type: 'rain_stone_progress', step: step as RainStoneStep });
  }

  for (let step = previous.rainSignProgress + 1; step <= current.rainSignProgress; step += 1) {
    pushFrozen(events, { type: 'rain_sign_progress', step: step as RainSignStep });
  }

  const newlyPlacedObjects = current.lifePlacedObjects.filter(
    (itemId) => !previous.lifePlacedObjects.includes(itemId),
  );
  for (const [index, itemId] of newlyPlacedObjects.entries()) {
    pushFrozen(events, {
      type: 'life_object_restored',
      itemId,
      restoredCount: (previous.lifePlacedObjects.length + index + 1) as LifeObjectCount,
    });
  }

  for (
    let junction = previous.returnJunctionsCompleted + 1;
    junction <= current.returnJunctionsCompleted;
    junction += 1
  ) {
    pushFrozen(events, {
      type: 'return_junction_completed',
      junction: junction as ReturnJunctionNumber,
    });
  }

  const prefixBaseline =
    current.returnJunctionsCompleted > previous.returnJunctionsCompleted
      ? 0
      : current.returnJunctionsCompleted === previous.returnJunctionsCompleted &&
          prefixExtends(previous.returnPrefix, current.returnPrefix)
        ? previous.returnPrefix.length
        : current.returnPrefix.length;
  const activeJunction = current.returnJunctionsCompleted + 1;
  if (activeJunction <= 3) {
    for (let index = prefixBaseline; index < current.returnPrefix.length; index += 1) {
      pushFrozen(events, {
        type: 'return_prefix_progress',
        junction: activeJunction as ReturnJunctionNumber,
        step: (index + 1) as ReturnPrefixStep,
        direction: current.returnPrefix[index],
      });
    }
  }

  for (const memoryId of current.memories) {
    if (!previous.memories.includes(memoryId)) {
      pushFrozen(events, { type: 'memory_added', memoryId });
    }
  }

  if (!previous.endingHandshakeCompleted && current.endingHandshakeCompleted) {
    pushFrozen(events, { type: 'ending_handshake_completed' });
  }

  return events.length === 0 ? NO_PRESENTATION_EVENTS : Object.freeze(events);
}
