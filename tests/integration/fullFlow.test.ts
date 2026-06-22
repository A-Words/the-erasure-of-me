import { describe, expect, it } from 'vitest';
import { GameStore } from '../../src/game/state/GameStore';
import type { GameMode } from '../../src/game/state/GameState';

function finishDialogue(store: GameStore): void {
  while (store.getState().dialogue.length > 0) store.dispatch({ type: 'ADVANCE_DIALOGUE' });
}

function interact(store: GameStore, entityId: string): void {
  store.dispatch({ type: 'INTERACT', entityId });
  finishDialogue(store);
}

describe('complete vertical slice', () => {
  it.each<GameMode>(['standard', 'low_stimulation'])(
    'runs the %s mode from the content warning to the guide without a dead end',
    (mode) => {
      const store = new GameStore();
      store.dispatch({ type: 'NEW_GAME', mode });
      finishDialogue(store);

      interact(store, 'entity.home.journal');
      interact(store, 'entity.home.key_bowl');
      interact(store, 'entity.home.front_door');
      expect(store.getState().chapterId).toBe('rain');

      interact(store, 'entity.rain.ticket');
      interact(store, 'entity.rain.stone_2');
      interact(store, 'entity.rain.stone_4');
      interact(store, 'entity.rain.stone_5');
      interact(store, 'entity.rain.umbrella_sign_a');
      interact(store, 'entity.rain.umbrella_sign_b');
      interact(store, 'entity.rain.red_umbrella');
      expect(store.getState().chapterId).toBe('life');

      interact(store, 'item.photo.move_1979');
      interact(store, 'item.photo.osmanthus_1992');
      interact(store, 'item.photo.anniversary_2001');
      store.dispatch({ type: 'PHOTO_ORDER', order: ['photo.1979', 'photo.1992', 'photo.2001'] });
      interact(store, 'item.life.wood_comb');
      interact(store, 'item.life.enamel_cup');
      interact(store, 'item.life.cassette');
      interact(store, 'slot.life.dresser');
      interact(store, 'slot.life.windowsill');
      interact(store, 'slot.life.radio');
      interact(store, 'entity.life.exit');
      expect(store.getState().chapterId).toBe('return');

      store.dispatch({ type: 'ACKNOWLEDGE_D3' });
      for (const direction of ['right', 'up', 'down', 'right', 'up', 'left', 'up']) {
        interact(store, `route.${direction}`);
      }
      interact(store, 'route.up');
      expect(store.getState().chapterId).toBe('ending');

      interact(store, 'entity.ending.xiulan');
      expect(store.getState().flags).toContain('ending.ready_to_hold');
      store.dispatch({ type: 'HOLD', deltaSeconds: 2 });
      expect(store.getState().activeMemoryId).toBe('ending.hand');
      finishDialogue(store);
      expect(store.getState().phase).toBe('guide');
      expect(store.getState().checkpointId).toBe('checkpoint.ending.complete');
    },
  );
});
