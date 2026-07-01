import { describe, expect, it } from 'vitest';
import { resolveReturnCues } from '../../src/game/presentation/returnCues';

describe('resolveReturnCues', () => {
  it('shows both complete arrows at the first junction', () => {
    expect(resolveReturnCues({ returnJunction: 0, returnPrefixLength: 0, routeLoops: 0 })).toEqual([
      { direction: 'right', kind: 'arrow', alpha: 0.9 },
      { direction: 'up', kind: 'arrow', alpha: 0.42 },
    ]);
  });

  it('switches the active cue to footprints after the second wrong exit', () => {
    expect(resolveReturnCues({ returnJunction: 1, returnPrefixLength: 1, routeLoops: 2 })).toEqual([
      { direction: 'right', kind: 'footprints', alpha: 1 },
    ]);
  });

  it('uses curtain and umbrella-shadow cues without exposing an arrow at junction three', () => {
    expect(resolveReturnCues({ returnJunction: 2, returnPrefixLength: 0, routeLoops: 0 })).toEqual([
      { direction: 'up', kind: 'curtain', alpha: 0.9 },
      { direction: 'left', kind: 'umbrella', alpha: 0.42 },
    ]);
  });

  it('reveals only the home door after all three junctions', () => {
    expect(resolveReturnCues({ returnJunction: 3, returnPrefixLength: 0, routeLoops: 0 })).toEqual([
      { direction: 'up', kind: 'door', alpha: 1 },
    ]);
  });

  it('falls back to the first junction for partial or legacy puzzle state', () => {
    expect(resolveReturnCues({})).toEqual([
      { direction: 'right', kind: 'arrow', alpha: 0.9 },
      { direction: 'up', kind: 'arrow', alpha: 0.42 },
    ]);
  });
});
