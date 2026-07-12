import Phaser from 'phaser';
import type { WorldEntity } from '../../game/content/maps';
import { resolveReturnPresentation } from '../../game/content/returnRoute';
import type { GameState, WorldDirection } from '../../game/state/GameState';

const BACKGROUND_DEPTH = 40;
const CUE_DEPTH = 84;
const OBSERVATION_VEIL_DEPTH = 1850;
const OBSERVATION_DEPTH = 1900;
const RESPONSE_DEPTH = 1950;

interface Point {
  x: number;
  y: number;
}

export interface WorldResponse {
  x: number;
  y: number;
  color?: number;
  major?: boolean;
}

const directionPoints: Record<WorldDirection, Point> = {
  up: { x: 640, y: 164 },
  right: { x: 1052, y: 360 },
  down: { x: 640, y: 574 },
  left: { x: 228, y: 360 },
};

const observationColors: Record<GameState['degradationStage'], number> = {
  D0: 0xd6c58e,
  D1: 0xaac8d0,
  D2: 0xd0bd79,
  D3: 0xc7d0d6,
  D4: 0xe8c7a4,
};

/**
 * Disposable, renderer-only presentation layer. It never mutates GameState and
 * owns no data that belongs in a save file.
 */
export class PresentationDirector {
  private chapter: GameState['chapterId'] | null = null;
  private returnGraphics: Phaser.GameObjects.Graphics | null = null;
  private observationGraphics: Phaser.GameObjects.Graphics | null = null;
  private observationVeils: Phaser.GameObjects.Rectangle[] = [];
  private observing = false;
  private observationStartedAt = 0;
  private observationState: Readonly<GameState> | null = null;
  private observationPlayer: Point | null = null;
  private observationEntities: readonly WorldEntity[] = [];
  private ambientObjects: Phaser.GameObjects.GameObject[] = [];
  private transientObjects = new Set<Phaser.GameObjects.GameObject>();
  private transientTimers = new Set<Phaser.Time.TimerEvent>();
  private wrongTurnObjects: Phaser.GameObjects.GameObject[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  get isObserving(): boolean {
    return this.observing;
  }

  destroyChapter(): void {
    this.finishWrongTurnEcho();
    this.scene.tweens.killTweensOf(this.ambientObjects);
    this.scene.tweens.killTweensOf([...this.transientObjects]);
    for (const object of this.ambientObjects) object.destroy();
    for (const timer of this.transientTimers) timer.remove(false);
    for (const object of this.transientObjects) object.destroy();
    this.ambientObjects = [];
    this.transientObjects.clear();
    this.transientTimers.clear();
    this.returnGraphics?.destroy();
    this.observationGraphics?.destroy();
    for (const veil of this.observationVeils) veil.destroy();
    this.returnGraphics = null;
    this.observationGraphics = null;
    this.observationVeils = [];
    this.observing = false;
    this.observationState = null;
    this.observationPlayer = null;
    this.observationEntities = [];
    this.chapter = null;
    delete this.scene.game.canvas.dataset.returnClue;
    delete this.scene.game.canvas.dataset.returnDirection;
    delete this.scene.game.canvas.dataset.returnFootprints;
  }

  buildChapter(state: Readonly<GameState>): number {
    this.chapter = state.chapterId;
    this.observationVeils = Array.from({ length: 4 }, () =>
      this.scene.add
        .rectangle(0, 0, 1, 1, 0x172027, 0)
        .setOrigin(0.5)
        .setDepth(OBSERVATION_VEIL_DEPTH)
        .setVisible(false),
    );
    this.observationGraphics = this.scene.add.graphics().setDepth(OBSERVATION_DEPTH);

    if (state.chapterId === 'return') {
      this.returnGraphics = this.scene.add.graphics().setDepth(CUE_DEPTH);
      this.createReturnAtmosphere(state.settings.reducedMotion);
      this.renderReturnCues(state, 0);
    } else if (state.chapterId === 'ending') {
      this.createEndingAtmosphere(state.settings.reducedMotion);
    }

    const duration = state.settings.reducedMotion ? 120 : state.chapterId === 'ending' ? 900 : 620;
    this.scene.cameras.main.fadeIn(duration, 24, 20, 17);
    return duration;
  }

  sync(state: Readonly<GameState>, timeMs: number): void {
    if (state.chapterId !== this.chapter) return;
    if (state.chapterId === 'return') this.renderReturnCues(state, timeMs);
    if (this.observing) {
      this.observationState = state;
      this.renderObservation(timeMs);
    }
  }

  update(timeMs: number, state: Readonly<GameState>): void {
    if (state.chapterId === 'return' && !state.settings.reducedMotion) {
      this.renderReturnCues(state, timeMs);
    }
    if (this.observing && !state.settings.reducedMotion) this.renderObservation(timeMs);
  }

  beginObservation(
    state: Readonly<GameState>,
    player: Point,
    entities: readonly WorldEntity[],
    timeMs: number,
  ): void {
    if (
      state.phase !== 'playing' ||
      state.modal ||
      state.dialogue.length > 0 ||
      state.player.moving
    )
      return;
    this.observing = true;
    this.observationStartedAt = timeMs;
    this.observationState = state;
    this.observationPlayer = { ...player };
    this.observationEntities = entities;
    this.layoutObservationVeils(player);
    for (const veil of this.observationVeils) {
      veil
        .setFillStyle(this.observationVeilColor(state.degradationStage))
        .setAlpha(state.settings.reducedMotion ? 0.14 : 0.22)
        .setVisible(true);
    }
    this.renderObservation(timeMs);
  }

  endObservation(): void {
    this.observing = false;
    this.observationState = null;
    this.observationPlayer = null;
    this.observationEntities = [];
    this.observationGraphics?.clear();
    for (const veil of this.observationVeils) veil.setVisible(false).setAlpha(0);
  }

  playWorldResponse(response: WorldResponse, reducedMotion: boolean): void {
    const color = response.color ?? 0xd6c58e;
    const ring = this.scene.add
      .circle(response.x, response.y, response.major ? 24 : 17, color, 0.08)
      .setStrokeStyle(response.major ? 5 : 3, color, 0.88)
      .setDepth(RESPONSE_DEPTH);
    this.transientObjects.add(ring);
    const fragments: Phaser.GameObjects.Rectangle[] = [];
    const fragmentCount = response.major ? 10 : 6;
    for (let index = 0; index < fragmentCount; index += 1) {
      const angle = (Math.PI * 2 * index) / fragmentCount + 0.17;
      const fragment = this.scene.add
        .rectangle(response.x, response.y, response.major ? 8 : 6, 2, color, 0.74)
        .setRotation(angle)
        .setDepth(RESPONSE_DEPTH);
      fragments.push(fragment);
      this.transientObjects.add(fragment);
    }

    if (reducedMotion) {
      ring.setScale(response.major ? 1.3 : 1.15).setAlpha(0.72);
      for (const fragment of fragments) fragment.setAlpha(0.55);
      const timer = this.scene.time.delayedCall(600, () => {
        this.transientTimers.delete(timer);
        this.destroyTransient(ring);
        for (const fragment of fragments) this.destroyTransient(fragment);
      });
      this.transientTimers.add(timer);
      return;
    }

    this.scene.tweens.add({
      targets: ring,
      scale: response.major ? 5.2 : 3.6,
      alpha: 0,
      duration: response.major ? 940 : 680,
      ease: 'Sine.easeOut',
      onComplete: () => this.destroyTransient(ring),
    });
    fragments.forEach((fragment, index) => {
      const angle = (Math.PI * 2 * index) / fragmentCount + 0.17;
      const distance = response.major ? 62 : 42;
      this.scene.tweens.add({
        targets: fragment,
        x: response.x + Math.cos(angle) * distance,
        y: response.y + Math.sin(angle) * distance,
        alpha: 0,
        angle: fragment.angle + (index % 2 === 0 ? 24 : -24),
        duration: response.major ? 820 : 580,
        ease: 'Cubic.easeOut',
        onComplete: () => this.destroyTransient(fragment),
      });
    });
  }

  playWrongTurnEcho(junction: number, reducedMotion: boolean): number {
    this.finishWrongTurnEcho();
    const memories = [
      'environment.home.background',
      'environment.rain.background',
      'environment.life.background',
    ] as const;
    const memoryKey = memories[Phaser.Math.Clamp(Math.trunc(junction), 0, memories.length - 1)];
    const echo = this.scene.add
      .image(640, 360, memoryKey)
      .setDisplaySize(1080, 608)
      .setTint(0xc5c9c2)
      .setAlpha(reducedMotion ? 0.26 : 0)
      .setDepth(RESPONSE_DEPTH - 2);
    const frame = this.scene.add
      .rectangle(640, 360, 1092, 620, 0x172027, reducedMotion ? 0.08 : 0)
      .setStrokeStyle(2, 0xd9d0bd, reducedMotion ? 0.42 : 0)
      .setDepth(RESPONSE_DEPTH - 1);
    this.transientObjects.add(echo);
    this.transientObjects.add(frame);
    this.wrongTurnObjects = [echo, frame];

    if (reducedMotion) {
      return 760;
    }

    this.scene.tweens.add({
      targets: echo,
      alpha: 0.42,
      duration: 260,
      hold: 680,
      yoyo: true,
      ease: 'Sine.easeInOut',
      onComplete: () => this.destroyTransient(echo),
    });
    this.scene.tweens.add({
      targets: frame,
      alpha: 0.34,
      duration: 260,
      hold: 680,
      yoyo: true,
      ease: 'Sine.easeInOut',
      onComplete: () => this.destroyTransient(frame),
    });
    return 1200;
  }

  finishWrongTurnEcho(): void {
    this.scene.tweens.killTweensOf(this.wrongTurnObjects);
    for (const object of this.wrongTurnObjects) this.destroyTransient(object);
    this.wrongTurnObjects = [];
  }

  private destroyTransient(object: Phaser.GameObjects.GameObject): void {
    this.transientObjects.delete(object);
    this.wrongTurnObjects = this.wrongTurnObjects.filter((candidate) => candidate !== object);
    if (object.active) object.destroy();
  }

  private renderObservation(timeMs: number): void {
    const graphics = this.observationGraphics;
    const state = this.observationState;
    const player = this.observationPlayer;
    if (!graphics || !state || !player) return;
    graphics.clear();
    const color = observationColors[state.degradationStage];
    const elapsed = Math.max(0, timeMs - this.observationStartedAt);
    const phase = state.settings.reducedMotion ? 0.5 : (elapsed % 1100) / 1100;
    const pulseRadius = state.settings.reducedMotion ? 192 : 56 + phase * 136;
    const pulseAlpha = state.settings.reducedMotion ? 0.34 : 0.5 * (1 - phase);

    graphics.lineStyle(state.settings.reducedMotion ? 2 : 3, color, pulseAlpha);
    graphics.strokeCircle(player.x, player.y, pulseRadius);
    graphics.lineStyle(1, color, state.settings.reducedMotion ? 0.2 : 0.12);
    graphics.strokeCircle(player.x, player.y, 192);

    const nearby = this.observationEntities
      .map((entity) => ({
        entity,
        distance: Phaser.Math.Distance.Between(player.x, player.y, entity.x, entity.y),
      }))
      .filter(({ distance }) => distance <= 192)
      .sort((a, b) => a.distance - b.distance);

    nearby.forEach(({ entity, distance }, index) => {
      const intensity = Phaser.Math.Clamp(1 - distance / 240, 0.24, 0.76);
      const radius =
        21 + index * 2 + (state.settings.reducedMotion ? 0 : Math.sin(elapsed / 180 + index) * 2);
      const targetColor = entity.color ?? color;
      graphics.lineStyle(index === 0 ? 3 : 2, targetColor, intensity);
      graphics.strokeCircle(entity.x, entity.y, radius);
      if (index === 0) {
        graphics.lineStyle(1, targetColor, 0.2);
        graphics.lineBetween(player.x, player.y, entity.x, entity.y);
      }
    });
    if (state.chapterId === 'home' && state.hintLevel >= 3) {
      const keyBowl = this.observationEntities.find(
        (entity) => entity.id === 'entity.home.key_bowl',
      );
      if (keyBowl) this.drawHomeHintFootprints(graphics, keyBowl, color);
    }
  }

  private drawHomeHintFootprints(
    graphics: Phaser.GameObjects.Graphics,
    target: Point,
    color: number,
  ): void {
    const start = { x: 720, y: 520 };
    const steps = 7;
    const angle = Math.atan2(target.y - start.y, target.x - start.x);
    const perpendicular = { x: -Math.sin(angle), y: Math.cos(angle) };
    graphics.fillStyle(color, 0.24);
    for (let index = 0; index < steps; index += 1) {
      const progress = (index + 1) / (steps + 1);
      const side = index % 2 === 0 ? -8 : 8;
      graphics.fillEllipse(
        Phaser.Math.Linear(start.x, target.x, progress) + perpendicular.x * side,
        Phaser.Math.Linear(start.y, target.y, progress) + perpendicular.y * side,
        10,
        19,
      );
    }
  }

  private layoutObservationVeils(player: Point): void {
    if (this.observationVeils.length !== 4) return;
    const radius = 192;
    const left = Phaser.Math.Clamp(player.x - radius, 0, 1280);
    const right = Phaser.Math.Clamp(player.x + radius, 0, 1280);
    const top = Phaser.Math.Clamp(player.y - radius, 0, 720);
    const bottom = Phaser.Math.Clamp(player.y + radius, 0, 720);
    const layouts = [
      { x: 640, y: top / 2, width: 1280, height: top },
      { x: 640, y: bottom + (720 - bottom) / 2, width: 1280, height: 720 - bottom },
      { x: left / 2, y: top + (bottom - top) / 2, width: left, height: bottom - top },
      {
        x: right + (1280 - right) / 2,
        y: top + (bottom - top) / 2,
        width: 1280 - right,
        height: bottom - top,
      },
    ];
    this.observationVeils.forEach((veil, index) => {
      const layout = layouts[index];
      veil.setPosition(layout.x, layout.y).setDisplaySize(layout.width, layout.height);
    });
  }

  private renderReturnCues(state: Readonly<GameState>, timeMs: number): void {
    const graphics = this.returnGraphics;
    if (!graphics) return;
    graphics.clear();
    const cue = resolveReturnPresentation({
      returnJunction: state.puzzles.returnJunction,
      returnPrefix: state.puzzles.returnPrefix,
      routeLoops: state.puzzles.routeLoops,
      hintLevel: state.hintLevel,
    });
    this.scene.game.canvas.dataset.returnClue = cue.clueType;
    this.scene.game.canvas.dataset.returnDirection = cue.worldDirection;
    this.scene.game.canvas.dataset.returnFootprints = String(cue.showFootprints);
    const breathe = state.settings.reducedMotion ? 1 : 0.88 + Math.sin(timeMs / 520) * 0.12;
    const alpha = Phaser.Math.Clamp(cue.intensity * breathe, 0.24, 0.9);
    const point = directionPoints[cue.worldDirection];

    if (cue.clueType === 'floor_arrow') {
      this.drawArrow(graphics, point, cue.worldDirection, 0xd9d0bd, alpha);
    } else if (cue.clueType === 'umbrella_shadow') {
      this.drawUmbrellaShadow(graphics, point, cue.worldDirection, alpha);
    } else if (cue.clueType === 'humming_wave') {
      this.drawHummingWave(graphics, point, cue.worldDirection, alpha);
    } else {
      this.drawHomeDoor(graphics, point, alpha);
    }

    if (cue.showFootprints) this.drawFootprints(graphics, cue.worldDirection, alpha * 0.72);
    this.drawReturnProgress(graphics, cue.completedSteps, cue.totalSteps);
  }

  private drawArrow(
    graphics: Phaser.GameObjects.Graphics,
    point: Point,
    direction: WorldDirection,
    color: number,
    alpha: number,
  ): void {
    const vector = this.directionVector(direction);
    const perpendicular = { x: -vector.y, y: vector.x };
    const start = { x: point.x - vector.x * 42, y: point.y - vector.y * 42 };
    const tip = { x: point.x + vector.x * 42, y: point.y + vector.y * 42 };
    graphics.lineStyle(10, color, alpha);
    graphics.lineBetween(start.x, start.y, tip.x, tip.y);
    graphics.lineBetween(
      tip.x,
      tip.y,
      tip.x - vector.x * 25 + perpendicular.x * 22,
      tip.y - vector.y * 25 + perpendicular.y * 22,
    );
    graphics.lineBetween(
      tip.x,
      tip.y,
      tip.x - vector.x * 25 - perpendicular.x * 22,
      tip.y - vector.y * 25 - perpendicular.y * 22,
    );
  }

  private drawUmbrellaShadow(
    graphics: Phaser.GameObjects.Graphics,
    point: Point,
    direction: WorldDirection,
    alpha: number,
  ): void {
    const vector = this.directionVector(direction);
    const perpendicular = { x: -vector.y, y: vector.x };
    const center = { x: point.x - vector.x * 18, y: point.y - vector.y * 18 };
    const canopy = [
      { x: center.x - perpendicular.x * 42, y: center.y - perpendicular.y * 42 },
      { x: center.x + vector.x * 18, y: center.y + vector.y * 18 },
      { x: center.x + perpendicular.x * 42, y: center.y + perpendicular.y * 42 },
      { x: center.x - vector.x * 14, y: center.y - vector.y * 14 },
    ];
    graphics.fillStyle(0xb54949, alpha * 0.68);
    graphics.fillPoints(canopy, true);
    graphics.lineStyle(7, 0x6d4844, alpha);
    graphics.lineBetween(
      center.x + vector.x * 10,
      center.y + vector.y * 10,
      center.x + vector.x * 72,
      center.y + vector.y * 72,
    );
    graphics.lineStyle(5, 0xb54949, alpha * 0.7);
    graphics.lineBetween(
      center.x + vector.x * 70,
      center.y + vector.y * 70,
      center.x + vector.x * 70 + perpendicular.x * 18,
      center.y + vector.y * 70 + perpendicular.y * 18,
    );
  }

  private drawHummingWave(
    graphics: Phaser.GameObjects.Graphics,
    point: Point,
    direction: WorldDirection,
    alpha: number,
  ): void {
    const vector = this.directionVector(direction);
    const baseAngle = Math.atan2(vector.y, vector.x);
    graphics.lineStyle(4, 0xaac8d0, alpha);
    for (const radius of [22, 38, 56]) {
      graphics.beginPath();
      graphics.arc(point.x, point.y, radius, baseAngle - 0.72, baseAngle + 0.72, false);
      graphics.strokePath();
    }
    graphics.fillStyle(0xb54949, alpha * 0.58);
    graphics.fillCircle(point.x - vector.x * 18, point.y - vector.y * 18, 7);
  }

  private drawHomeDoor(graphics: Phaser.GameObjects.Graphics, point: Point, alpha: number): void {
    graphics.fillStyle(0xf0d4aa, alpha * 0.18);
    graphics.fillRect(point.x - 64, point.y - 86, 128, 172);
    graphics.lineStyle(5, 0xe6c18e, alpha);
    graphics.strokeRect(point.x - 48, point.y - 72, 96, 144);
    graphics.fillStyle(0xe6c18e, alpha);
    graphics.fillCircle(point.x + 28, point.y + 5, 5);
  }

  private drawFootprints(
    graphics: Phaser.GameObjects.Graphics,
    direction: WorldDirection,
    alpha: number,
  ): void {
    const vector = this.directionVector(direction);
    const perpendicular = { x: -vector.y, y: vector.x };
    graphics.fillStyle(0xd9d0bd, alpha);
    for (let index = 0; index < 4; index += 1) {
      const offset = 52 + index * 46;
      const side = index % 2 === 0 ? -10 : 10;
      const x = 640 + vector.x * offset + perpendicular.x * side;
      const y = 360 + vector.y * offset + perpendicular.y * side;
      graphics.fillEllipse(x, y, 13, 25);
    }
  }

  private drawReturnProgress(
    graphics: Phaser.GameObjects.Graphics,
    completedSteps: number,
    totalSteps: number,
  ): void {
    const startX = 640 - ((totalSteps - 1) * 17) / 2;
    for (let index = 0; index < totalSteps; index += 1) {
      graphics.fillStyle(
        index < completedSteps ? 0xb54949 : 0xd9d0bd,
        index < completedSteps ? 0.74 : 0.25,
      );
      graphics.fillCircle(startX + index * 17, 676, index < completedSteps ? 4 : 3);
    }
  }

  private createReturnAtmosphere(reducedMotion: boolean): void {
    const tint = this.scene.add
      .rectangle(640, 360, 1280, 720, 0x22313a, 0.09)
      .setDepth(BACKGROUND_DEPTH);
    this.ambientObjects.push(tint);
    for (let index = 0; index < 14; index += 1) {
      const mote = this.scene.add
        .rectangle(130 + ((index * 83) % 1040), 96 + ((index * 137) % 520), 8, 2, 0xd4c9b4, 0.12)
        .setRotation((index * 0.47) % Math.PI)
        .setDepth(BACKGROUND_DEPTH + 1);
      this.ambientObjects.push(mote);
      if (!reducedMotion) {
        this.scene.tweens.add({
          targets: mote,
          y: mote.y - 18 - (index % 3) * 6,
          alpha: 0.04,
          duration: 2600 + index * 90,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }
    }
  }

  private createEndingAtmosphere(reducedMotion: boolean): void {
    const morningGlow = this.scene.add
      .ellipse(640, 348, 590, 390, 0xf0d4aa, 0.12)
      .setDepth(BACKGROUND_DEPTH);
    this.ambientObjects.push(morningGlow);
    for (let index = 0; index < 10; index += 1) {
      const dust = this.scene.add
        .circle(
          410 + ((index * 97) % 470),
          160 + ((index * 71) % 310),
          2 + (index % 2),
          0xf3d6b8,
          0.18,
        )
        .setDepth(BACKGROUND_DEPTH + 1);
      this.ambientObjects.push(dust);
      if (!reducedMotion) {
        this.scene.tweens.add({
          targets: dust,
          y: dust.y - 24,
          x: dust.x + (index % 2 === 0 ? 8 : -8),
          alpha: 0.06,
          duration: 2400 + index * 120,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }
    }
  }

  private observationVeilColor(stage: GameState['degradationStage']): number {
    if (stage === 'D1') return 0x1c3038;
    if (stage === 'D2') return 0x2b3028;
    if (stage === 'D3') return 0x16232c;
    if (stage === 'D4') return 0x3b2c22;
    return 0x29231f;
  }

  private directionVector(direction: WorldDirection): Point {
    if (direction === 'up') return { x: 0, y: -1 };
    if (direction === 'right') return { x: 1, y: 0 };
    if (direction === 'down') return { x: 0, y: 1 };
    return { x: -1, y: 0 };
  }
}
