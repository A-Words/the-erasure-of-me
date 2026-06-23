import { chapterMaps, type WorldEntity } from './maps';
import type { GameState } from '../state/GameState';

export function isEntityAvailable(state: Readonly<GameState>, entityId: string): boolean {
  const collected =
    (entityId === 'entity.home.journal' && state.inventory.includes('item.home.journal')) ||
    (entityId === 'entity.home.key_bowl' && state.inventory.includes('item.home.key')) ||
    (entityId === 'entity.home.glasses_case' &&
      state.inventory.includes('item.home.glasses_case')) ||
    (entityId === 'entity.rain.ticket' && state.inventory.includes('item.rain.ticket')) ||
    (entityId === 'item.photo.move_1979' && state.inventory.includes('item.photo.1979')) ||
    (entityId === 'item.photo.osmanthus_1992' && state.inventory.includes('item.photo.1992')) ||
    (entityId === 'item.photo.anniversary_2001' && state.inventory.includes('item.photo.2001')) ||
    (entityId.startsWith('item.life.') && state.inventory.includes(entityId));
  const routeHidden =
    state.chapterId === 'return' && state.puzzles.returnJunction >= 3 && entityId !== 'route.up';

  return !collected && !routeHidden;
}

export function nearestAvailableEntity(
  state: Readonly<GameState>,
  maxDistance: number,
): WorldEntity | null {
  let nearest: WorldEntity | null = null;
  let bestDistance = maxDistance;

  for (const entity of chapterMaps[state.chapterId].entities) {
    if (!isEntityAvailable(state, entity.id)) continue;
    const distance = Math.hypot(state.player.x - entity.x, state.player.y - entity.y);
    if (distance < bestDistance) {
      nearest = entity;
      bestDistance = distance;
    }
  }

  return nearest;
}
