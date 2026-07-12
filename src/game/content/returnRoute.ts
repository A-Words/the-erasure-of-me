import type { WorldDirection } from '../state/GameState';

export const returnRouteAnswers = Object.freeze([
  Object.freeze(['right', 'up'] as const),
  Object.freeze(['down', 'right'] as const),
  Object.freeze(['up', 'left', 'up'] as const),
]);

export type ReturnClueType = 'floor_arrow' | 'umbrella_shadow' | 'humming_wave' | 'home_door';

export interface ReturnRouteProgress {
  returnJunction: number;
  returnPrefix: readonly string[];
  routeLoops: number;
  hintLevel: number;
}

export interface ReturnPresentation {
  worldDirection: WorldDirection;
  clueType: ReturnClueType;
  showFootprints: boolean;
  intensity: number;
  completedSteps: number;
  totalSteps: number;
  isComplete: boolean;
}

const clueIntensities = [0.55, 0.7, 0.85, 1] as const;

function resolveClueType(junction: number, completedSteps: number): ReturnClueType {
  if (junction === 0) return 'floor_arrow';
  if (junction === 1) return completedSteps === 0 ? 'floor_arrow' : 'umbrella_shadow';
  return 'humming_wave';
}

function countCompletedSteps(answer: readonly WorldDirection[], prefix: readonly string[]): number {
  let completedSteps = 0;
  while (completedSteps < answer.length && prefix[completedSteps] === answer[completedSteps]) {
    completedSteps += 1;
  }
  return Math.min(completedSteps, answer.length - 1);
}

export function resolveReturnPresentation(progress: ReturnRouteProgress): ReturnPresentation {
  const assistanceLevel = Math.min(
    clueIntensities.length - 1,
    Math.max(0, Math.trunc(progress.routeLoops), Math.trunc(progress.hintLevel)),
  );
  const showFootprints = progress.routeLoops >= 2 || progress.hintLevel >= 2;
  const junction = Math.min(
    returnRouteAnswers.length,
    Math.max(0, Math.trunc(progress.returnJunction)),
  );

  if (junction === returnRouteAnswers.length) {
    return {
      worldDirection: 'up',
      clueType: 'home_door',
      showFootprints,
      intensity: 1,
      completedSteps: 0,
      totalSteps: 0,
      isComplete: true,
    };
  }

  const answer = returnRouteAnswers[junction];
  const completedSteps = countCompletedSteps(answer, progress.returnPrefix);

  return {
    worldDirection: answer[completedSteps],
    clueType: resolveClueType(junction, completedSteps),
    showFootprints,
    intensity: clueIntensities[assistanceLevel],
    completedSteps,
    totalSteps: answer.length,
    isComplete: false,
  };
}
