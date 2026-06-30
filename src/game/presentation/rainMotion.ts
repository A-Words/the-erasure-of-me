export interface RainPresentationFrame {
  offsetY: number;
  alpha: number;
}

const RAIN_FALL_Y_PER_SECOND = 240;
const RAIN_LOOP_HEIGHT = 720;

export function resolveRainPresentation(
  elapsedMs: number,
  reducedMotion: boolean,
): RainPresentationFrame {
  if (reducedMotion) {
    return { offsetY: 0, alpha: 0.5 };
  }

  const elapsedSeconds = Math.max(0, elapsedMs) / 1000;
  if (elapsedSeconds === 0) {
    return { offsetY: 0, alpha: 0.68 };
  }
  return {
    offsetY: (elapsedSeconds * RAIN_FALL_Y_PER_SECOND) % RAIN_LOOP_HEIGHT,
    alpha: 0.68,
  };
}
