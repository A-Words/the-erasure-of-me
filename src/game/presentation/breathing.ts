import type { GameState } from '../state/GameState';

/**
 * 呼吸微动门控：仅在标准模式的纯游玩态下启用。
 * modal / 对白 / 牵手长按 / reducedMotion / 非游玩态 全部关闭。
 */
export function isBreathingActive(state: Readonly<GameState>): boolean {
  return (
    state.phase === 'playing' &&
    !state.modal &&
    state.dialogue.length === 0 &&
    !state.flags.includes('ending.ready_to_hold') &&
    !state.settings.reducedMotion
  );
}

/**
 * 共享正弦波：返回 -1..1。供 computeBreathScale 与 GameScene 的 dot 分支共用，
 * 避免同一呼吸公式散落两处。
 */
export function computeBreathSine(
  timeSeconds: number,
  phaseOffset: number,
  periodSeconds = 2.4,
): number {
  const t = (timeSeconds + phaseOffset) / periodSeconds;
  return Math.sin(t * Math.PI * 2);
}

/**
 * 纯正弦呼吸缩放计算。不依赖 Phaser，便于单测。
 * 公式：base + computeBreathSine(...) * amplitude
 */
export function computeBreathScale(
  base: number,
  timeSeconds: number,
  phaseOffset: number,
  periodSeconds = 2.4,
  amplitude = 0.035,
): number {
  return base + computeBreathSine(timeSeconds, phaseOffset, periodSeconds) * amplitude;
}
