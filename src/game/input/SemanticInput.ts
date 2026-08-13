import type { InputAction } from './actions';

export type SemanticInputListener = (action: InputAction, pressed: boolean) => void;

export class SemanticInput {
  private readonly sourcesByAction = new Map<InputAction, Set<string>>();
  private readonly listeners = new Set<SemanticInputListener>();

  press(action: InputAction, sourceId: string): void {
    const sources = this.sourcesByAction.get(action) ?? new Set<string>();
    const wasPressed = sources.size > 0;
    sources.add(sourceId);
    this.sourcesByAction.set(action, sources);
    if (!wasPressed) this.emit(action, true);
  }

  release(action: InputAction, sourceId: string): void {
    const sources = this.sourcesByAction.get(action);
    if (!sources?.delete(sourceId)) return;
    if (sources.size > 0) return;
    this.sourcesByAction.delete(action);
    this.emit(action, false);
  }

  releaseSource(sourceId: string): void {
    for (const action of [...this.sourcesByAction.keys()]) this.release(action, sourceId);
  }

  isPressed(action: InputAction): boolean {
    return (this.sourcesByAction.get(action)?.size ?? 0) > 0;
  }

  clear(): void {
    const pressedActions = [...this.sourcesByAction.keys()];
    this.sourcesByAction.clear();
    for (const action of pressedActions) this.emit(action, false);
  }

  subscribe(listener: SemanticInputListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(action: InputAction, pressed: boolean): void {
    for (const listener of this.listeners) listener(action, pressed);
  }
}
