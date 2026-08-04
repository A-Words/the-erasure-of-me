export interface DevPanelPosition {
  left: number;
  top: number;
}

interface DevPanelDragOptions {
  initialPosition?: DevPanelPosition | null;
  onPositionChange?: (position: DevPanelPosition) => void;
}

const arrowDeltas: Record<string, readonly [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

export function enableDevPanelDrag(
  panel: HTMLElement,
  handle: HTMLElement,
  options: DevPanelDragOptions = {},
): void {
  let activePointer: number | null = null;
  let pointerOffsetX = 0;
  let pointerOffsetY = 0;

  const moveTo = (left: number, top: number): DevPanelPosition => {
    const bounds = panel.getBoundingClientRect();
    const position = {
      left: Math.round(Math.min(Math.max(0, left), Math.max(0, window.innerWidth - bounds.width))),
      top: Math.round(Math.min(Math.max(0, top), Math.max(0, window.innerHeight - bounds.height))),
    };
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.left = `${position.left}px`;
    panel.style.top = `${position.top}px`;
    options.onPositionChange?.(position);
    return position;
  };

  if (options.initialPosition) {
    requestAnimationFrame(() =>
      moveTo(options.initialPosition!.left, options.initialPosition!.top),
    );
  }

  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const bounds = panel.getBoundingClientRect();
    activePointer = event.pointerId;
    pointerOffsetX = event.clientX - bounds.left;
    pointerOffsetY = event.clientY - bounds.top;
    handle.setPointerCapture(event.pointerId);
    handle.classList.add('is-dragging');
    event.preventDefault();
    event.stopPropagation();
  });
  handle.addEventListener('pointermove', (event) => {
    if (activePointer !== event.pointerId) return;
    moveTo(event.clientX - pointerOffsetX, event.clientY - pointerOffsetY);
    event.preventDefault();
  });
  const finishPointerDrag = (event: PointerEvent): void => {
    if (activePointer !== event.pointerId) return;
    activePointer = null;
    handle.classList.remove('is-dragging');
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
  };
  handle.addEventListener('pointerup', finishPointerDrag);
  handle.addEventListener('pointercancel', finishPointerDrag);
  handle.addEventListener('keydown', (event) => {
    const delta = arrowDeltas[event.key];
    if (!delta) return;
    const bounds = panel.getBoundingClientRect();
    const amount = event.shiftKey ? 20 : 10;
    moveTo(bounds.left + delta[0] * amount, bounds.top + delta[1] * amount);
    event.preventDefault();
    event.stopPropagation();
  });
}
