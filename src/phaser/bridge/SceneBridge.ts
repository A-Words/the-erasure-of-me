import type { GameStore } from '../../game/state/GameStore';
import type { GameCommand, GameState } from '../../game/state/GameState';

export class SceneBridge {
  constructor(private readonly store: GameStore) {}

  getSnapshot(): Readonly<GameState> {
    return this.store.getState();
  }

  send(command: GameCommand): void {
    this.store.dispatch(command);
  }

  interact(targetId: string): void {
    this.store.dispatch({ type: 'INTERACT', entityId: targetId });
  }

  subscribe(listener: (state: Readonly<GameState>) => void): () => void {
    return this.store.subscribe(listener);
  }
}
