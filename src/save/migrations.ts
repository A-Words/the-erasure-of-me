import { toTextRef, text } from '../i18n';
import type { GameState } from '../game/state/GameState';

function migrateText(value: unknown): ReturnType<typeof toTextRef> {
  if (typeof value === 'string') {
    const objectCount = value.match(/^让生活物品回到原处（(\d+)\/3）$/);
    if (objectCount) return text('objective.life.objects', { count: Number(objectCount[1]) });

    const junction = value.match(/^走过路口 (\d+)。熟悉的空间重新落在脚下。$/);
    if (junction) return text('message.return.junction', { junction: Number(junction[1]) });

    const photo = value.match(/^取得照片：(\d{4})$/);
    if (photo) return text('message.life.photo_found', { year: photo[1] });
  }
  return toTextRef(value);
}

/** Convert schema 1 plain strings while keeping the existing slot key/container format. */
export function migrateGameState(candidate: unknown): GameState | null {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  const parsed = structuredClone(candidate) as Record<string, unknown>;
  if (parsed.schemaVersion !== 1 && parsed.schemaVersion !== 2) return null;

  parsed.schemaVersion = 2;
  parsed.objective = migrateText(parsed.objective);
  parsed.message =
    !Object.hasOwn(parsed, 'message') || parsed.message === null
      ? null
      : migrateText(parsed.message);
  parsed.dialogue = Array.isArray(parsed.dialogue) ? parsed.dialogue.map(migrateText) : [];
  return parsed as unknown as GameState;
}
