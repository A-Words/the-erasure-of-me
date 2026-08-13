import Phaser from 'phaser';
import type { GameStore } from '../game/state/GameStore';
import type { SemanticInput } from '../game/input/SemanticInput';
import { GameScene } from './scenes/GameScene';

export function createGame(store: GameStore, semanticInput: SemanticInput): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.CANVAS,
    parent: 'game-canvas',
    width: 1280,
    height: 720,
    backgroundColor: '#2f2b28',
    loader: { maxParallelDownloads: 6 },
    scene: [new GameScene(store, semanticInput)],
    render: { antialias: true, pixelArt: false },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: 1280,
      height: 720,
    },
  });
}
