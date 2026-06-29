import type { WorldDirection } from '../state/GameState';

export type ReturnCueKind = 'arrow' | 'umbrella' | 'footprints' | 'curtain' | 'door';

export interface ReturnCue {
  direction: WorldDirection;
  kind: ReturnCueKind;
  alpha: number;
}

interface ReturnCueState {
  returnJunction?: number;
  returnPrefixLength?: number;
  routeLoops?: number;
}

const cuePlans: ReadonlyArray<ReadonlyArray<Omit<ReturnCue, 'alpha'>>> = [
  [
    { direction: 'right', kind: 'arrow' },
    { direction: 'up', kind: 'arrow' },
  ],
  [
    { direction: 'down', kind: 'arrow' },
    { direction: 'right', kind: 'umbrella' },
  ],
  [
    { direction: 'up', kind: 'curtain' },
    { direction: 'left', kind: 'umbrella' },
    { direction: 'up', kind: 'curtain' },
  ],
];

export function resolveReturnCues(state: ReturnCueState): ReturnCue[] {
  const junction = state.returnJunction ?? 0;
  const prefixLength = state.returnPrefixLength ?? 0;
  const routeLoops = state.routeLoops ?? 0;

  if (junction >= cuePlans.length) {
    return [{ direction: 'up', kind: 'door', alpha: 1 }];
  }

  const plan = cuePlans[junction];
  const step = Math.min(prefixLength, plan.length - 1);
  const visible = new Map<WorldDirection, ReturnCue>();

  for (let index = step; index < plan.length; index += 1) {
    const cue = plan[index];
    if (visible.has(cue.direction)) continue;
    const primary = index === step;
    visible.set(cue.direction, {
      ...cue,
      kind: primary && routeLoops >= 2 ? 'footprints' : cue.kind,
      alpha: primary ? (routeLoops >= 1 ? 1 : 0.9) : 0.42,
    });
  }

  return [...visible.values()];
}
