export interface RainPresentationFrame {
  offsetY: number;
  alpha: number;
}

const RAIN_FALL_Y_PER_SECOND = 240;

export function resolveRainPresentation(
  elapsedMs: number,
  reducedMotion: boolean,
  loopHeight: number,
): RainPresentationFrame {
  if (reducedMotion) {
    return { offsetY: 0, alpha: 0.5 };
  }

  const elapsedSeconds = Math.max(0, elapsedMs) / 1000;
  return {
    offsetY: (elapsedSeconds * RAIN_FALL_Y_PER_SECOND) % loopHeight,
    alpha: 0.68,
  };
}
