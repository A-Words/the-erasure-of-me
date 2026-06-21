import type { GameMode, WorldDirection } from '../state/GameState';
import type { InputAction } from './actions';

const movementByAction: Partial<Record<InputAction, WorldDirection>> = {
  move_up: 'up',
  move_down: 'down',
  move_left: 'left',
  move_right: 'right',
};

const clockwise: Record<WorldDirection, WorldDirection> = {
  up: 'right',
  right: 'down',
  down: 'left',
  left: 'up',
};

export function mapMovement(
  action: InputAction,
  stage: string,
  mode: GameMode,
): WorldDirection | null {
  const direction = movementByAction[action];
  if (!direction) return null;
  return stage === 'D3' && mode === 'standard' ? clockwise[direction] : direction;
}

export function physicalKeyToAction(code: string): InputAction | null {
  const bindings: Record<string, InputAction> = {
    KeyW: 'move_up',
    ArrowUp: 'move_up',
    KeyS: 'move_down',
    ArrowDown: 'move_down',
    KeyA: 'move_left',
    ArrowLeft: 'move_left',
    KeyD: 'move_right',
    ArrowRight: 'move_right',
    ShiftLeft: 'observe',
    ShiftRight: 'observe',
    KeyE: 'interact',
    Enter: 'interact',
    Space: 'interact',
    KeyQ: 'cancel',
    Backspace: 'cancel',
    KeyI: 'open_inventory',
    KeyJ: 'open_journal',
    KeyM: 'open_map',
    Escape: 'pause',
  };
  return bindings[code] ?? null;
}
