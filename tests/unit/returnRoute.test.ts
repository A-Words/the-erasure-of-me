import { describe, expect, it } from 'vitest';
import {
  resolveReturnPresentation,
  returnRouteAnswers,
  type ReturnRouteProgress,
} from '../../src/game/content/returnRoute';

describe('returnRoute', () => {
  it('keeps the documented route answers in world directions', () => {
    expect(returnRouteAnswers).toEqual([
      ['right', 'up'],
      ['down', 'right'],
      ['up', 'left', 'up'],
    ]);
  });

  it.each([
    [0, [], 'right', 'floor_arrow', 0, 2],
    [0, ['right'], 'up', 'floor_arrow', 1, 2],
    [1, [], 'down', 'floor_arrow', 0, 2],
    [1, ['down'], 'right', 'umbrella_shadow', 1, 2],
    [2, [], 'up', 'humming_wave', 0, 3],
    [2, ['up'], 'left', 'humming_wave', 1, 3],
    [2, ['up', 'left'], 'up', 'humming_wave', 2, 3],
  ] as const)(
    'resolves junction %i prefix %j to %s with its reliable clue',
    (returnJunction, returnPrefix, worldDirection, clueType, completedSteps, totalSteps) => {
      expect(
        resolveReturnPresentation({
          returnJunction,
          returnPrefix,
          routeLoops: 0,
          hintLevel: 0,
        }),
      ).toEqual({
        worldDirection,
        clueType,
        showFootprints: false,
        intensity: 0.55,
        completedSteps,
        totalSteps,
        isComplete: false,
      });
    },
  );

  it.each([
    [0, 0, false, 0.55],
    [1, 0, false, 0.7],
    [2, 0, true, 0.85],
    [3, 0, true, 1],
    [0, 1, false, 0.7],
    [0, 2, true, 0.85],
    [0, 3, true, 1],
    [1, 3, true, 1],
  ] as const)(
    'derives assistance from %i loops and hint level %i',
    (routeLoops, hintLevel, showFootprints, intensity) => {
      const presentation = resolveReturnPresentation({
        returnJunction: 0,
        returnPrefix: [],
        routeLoops,
        hintLevel,
      });

      expect(presentation.showFootprints).toBe(showFootprints);
      expect(presentation.intensity).toBe(intensity);
    },
  );

  it('resolves the completed route to the existing upward home door', () => {
    expect(
      resolveReturnPresentation({
        returnJunction: 3,
        returnPrefix: [],
        routeLoops: 0,
        hintLevel: 0,
      }),
    ).toEqual({
      worldDirection: 'up',
      clueType: 'home_door',
      showFootprints: false,
      intensity: 1,
      completedSteps: 0,
      totalSteps: 0,
      isComplete: true,
    });
  });

  it('does not let assistance escalation change the route answer or clue identity', () => {
    const expectedRouteData = {
      worldDirection: 'right',
      clueType: 'umbrella_shadow',
      completedSteps: 1,
      totalSteps: 2,
      isComplete: false,
    } as const;

    for (const assistance of [
      { routeLoops: 0, hintLevel: 0 },
      { routeLoops: 2, hintLevel: 0 },
      { routeLoops: 0, hintLevel: 3 },
    ]) {
      expect(
        resolveReturnPresentation({
          returnJunction: 1,
          returnPrefix: ['down'],
          ...assistance,
        }),
      ).toMatchObject(expectedRouteData);
    }
  });

  it('does not mutate progress or the shared route answers', () => {
    const progress: ReturnRouteProgress = {
      returnJunction: 2,
      returnPrefix: ['up'],
      routeLoops: 2,
      hintLevel: 1,
    };
    const progressBefore = structuredClone(progress);
    const answersBefore = structuredClone(returnRouteAnswers);

    const first = resolveReturnPresentation(progress);
    const second = resolveReturnPresentation(progress);

    expect(first).toEqual(second);
    expect(progress).toEqual(progressBefore);
    expect(returnRouteAnswers).toEqual(answersBefore);
    expect(Object.isFrozen(returnRouteAnswers)).toBe(true);
    expect(returnRouteAnswers.every((answer) => Object.isFrozen(answer))).toBe(true);
  });
});
