import { expect, test, type Page } from '@playwright/test';
import { continueLatestGame, startNewGame } from './helpers/game-navigation';

/**
 * Lightweight runtime smoke tests for all 5 Tiled maps.
 *
 * These tests verify that the Tiled JSON → tiledMapLoader → GameScene pipeline
 * works for every chapter: canvas renders, chapterId is correct, and no browser
 * console errors or fallback warnings occur.
 *
 * They do NOT verify pixel-perfect rendering or puzzle logic — those are
 * covered by the dedicated home-scene and game e2e tests.
 *
 * NOTE: The debug panel (data-debug-chapter buttons) only renders in DEV mode.
 * Since Playwright runs against the production preview build, we use localStorage
 * save injection to jump to non-home chapters, following the same pattern as
 * home-scene.spec.ts.
 */

const CHAPTERS = ['home', 'rain', 'life', 'return', 'ending'] as const;

type ChapterConfig = {
  stage: string;
  checkpoint: string;
  objective: string;
  spawn: { x: number; y: number };
};

const CHAPTER_DATA: Record<string, ChapterConfig> = {
  home: {
    stage: 'D0',
    checkpoint: 'checkpoint.home.start',
    objective: '找到钥匙和秀兰留下的日记',
    spawn: { x: 310, y: 302 },
  },
  rain: {
    stage: 'D1',
    checkpoint: 'checkpoint.rain.start',
    objective: '按 2 → 4 → 5 踩亮石板，再跟随红伞',
    spawn: { x: 100, y: 600 },
  },
  life: {
    stage: 'D2',
    checkpoint: 'checkpoint.life.start',
    objective: '整理照片，并让三件生活物品回到原处',
    spawn: { x: 640, y: 590 },
  },
  return: {
    stage: 'D3',
    checkpoint: 'checkpoint.return.training',
    objective: '理解新的方向，沿着仍可靠的线索回家',
    spawn: { x: 640, y: 360 },
  },
  ending: {
    stage: 'D4',
    checkpoint: 'checkpoint.ending.start',
    objective: '走近秀兰',
    spawn: { x: 920, y: 480 },
  },
};

/**
 * Build a minimal valid save object for a given chapter.
 * SaveRepository.parse() validates: schemaVersion, chapterId in chapterMaps,
 * checkpointId string, player position within map bounds (1280×720), arrays, puzzles.
 * It also sets phase='playing', clears dialogue/modal on load.
 */
function buildChapterSave(chapterId: string): Record<string, unknown> {
  const cfg = CHAPTER_DATA[chapterId];
  return {
    schemaVersion: 1,
    phase: 'playing',
    mode: 'standard',
    chapterId,
    checkpointId: cfg.checkpoint,
    degradationStage: cfg.stage,
    player: { ...cfg.spawn, facing: 'down', moving: false },
    inventory: [],
    journalPages: [],
    memories: [],
    flags: [],
    puzzles: {
      stationSequence: [],
      rainSigns: [],
      photoOrder: ['photo.2001', 'photo.1979', 'photo.1992'],
      placedObjects: [],
      returnJunction: 0,
      returnPrefix: [],
      routeLoops: 0,
    },
    settings: {
      fontSize: 'normal',
      reducedMotion: false,
      subtitles: true,
      highContrast: false,
      muted: false,
      holdMode: 'hold',
      audioVolumes: { music: 0.55, ambience: 0.65, voice: 0.75, sfx: 0.65 },
    },
    modal: null,
    objective: cfg.objective,
    message: null,
    dialogue: [],
    dialogueIndex: 0,
    activeMemoryId: null,
    holdProgress: 0,
    hintSeconds: 0,
    hintLevel: 0,
    playTimeSeconds: 0,
  };
}

/** Collect browser errors and Tiled data pipeline warnings for assertion. */
interface ConsoleCapture {
  errors: string[];
  tiledWarns: string[];
}

function setupConsoleCapture(page: Page): ConsoleCapture {
  const capture: ConsoleCapture = { errors: [], tiledWarns: [] };
  page.on('console', (m) => {
    if (m.type() === 'error') {
      capture.errors.push(m.text());
    } else if (m.type() === 'warning') {
      const text = m.text();
      // Only flag warnings from the Tiled data pipeline, not bootstrap fetch
      // failures which can occur intermittently in test environments.
      if (text.includes('[TiledCollisionProvider]')) {
        capture.tiledWarns.push(text);
      }
    }
  });
  page.on('pageerror', (e) => capture.errors.push(e.stack ?? e.message));
  return capture;
}

async function canvasSampleColorCount(page: Page): Promise<number> {
  return page.locator('canvas').evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const context = canvas.getContext('2d');
    if (!context) return 0;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set<string>();
    const stride = Math.max(4, Math.floor((canvas.width * canvas.height) / 256) * 4);
    for (let offset = 0; offset < pixels.length; offset += stride) {
      colors.add(`${pixels[offset]},${pixels[offset + 1]},${pixels[offset + 2]}`);
    }
    return colors.size;
  });
}

async function canvasBlackOrTransparentRatio(page: Page): Promise<number> {
  return page.locator('canvas').evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const context = canvas.getContext('2d');
    if (!context) return 1;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let artifactPixels = 0;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      if (
        pixels[offset + 3] < 250 ||
        (pixels[offset] < 5 && pixels[offset + 1] < 5 && pixels[offset + 2] < 5)
      ) {
        artifactPixels += 1;
      }
    }
    return artifactPixels / (pixels.length / 4);
  });
}

/** Boot the game from a fresh state (home chapter). */
async function bootFreshGame(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'title');
  await expect(page.locator('canvas')).toHaveAttribute('data-scene-ready', 'true', {
    timeout: 15_000,
  });
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await startNewGame(page);
  // Home chapter opens with two dialogue lines
  await page.getByRole('button', { name: '继续对白' }).click();
  await page.getByRole('button', { name: '继续对白' }).click();
}

/** Boot the game and jump to a specific chapter via localStorage save injection. */
async function bootIntoChapter(
  page: Page,
  chapterId: string,
  patch: Record<string, unknown> = {},
): Promise<void> {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'title');
  await expect(page.locator('canvas')).toHaveAttribute('data-scene-ready', 'true', {
    timeout: 15_000,
  });
  await page.evaluate(() => localStorage.clear());
  // Inject save before reload so the game picks it up
  const save = buildChapterSave(chapterId);
  const basePuzzles = save.puzzles as Record<string, unknown>;
  Object.assign(save, patch);
  if (patch.puzzles) {
    save.puzzles = { ...basePuzzles, ...(patch.puzzles as Record<string, unknown>) };
  }
  await page.evaluate(
    ({ save }) => {
      localStorage.setItem(
        'erasure.save.slot.1.v1',
        JSON.stringify({ formatVersion: 1, savedAt: new Date().toISOString(), state: save }),
      );
    },
    { save },
  );
  await page.reload();
  await continueLatestGame(page);
}

/** Verify the chapter renders correctly: canvas visible, chapterId matches, no errors or fallbacks. */
async function assertChapterRenders(
  page: Page,
  chapterId: string,
  capture: ConsoleCapture,
): Promise<void> {
  const app = page.locator('#app');
  const canvas = page.locator('canvas[aria-label="可操作游戏画面"]');

  // Wait for chapter to be set
  await expect(app).toHaveAttribute('data-chapter', chapterId, { timeout: 10_000 });

  // Canvas visible and non-empty
  await expect(canvas).toBeVisible({ timeout: 5_000 });
  await expect(canvas).toHaveAttribute('data-scene-ready', 'true');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(100);
  expect(box!.height).toBeGreaterThan(100);

  // Player position within map bounds (all chapters use 1280×720 logical size)
  const playerX = Number(await app.getAttribute('data-player-x'));
  const playerY = Number(await app.getAttribute('data-player-y'));
  expect(playerX).toBeGreaterThanOrEqual(0);
  expect(playerX).toBeLessThanOrEqual(1280);
  expect(playerY).toBeGreaterThanOrEqual(0);
  expect(playerY).toBeLessThanOrEqual(720);

  // Canvas has rendered pixels
  const canvasPixel = await canvas.screenshot();
  expect(canvasPixel.byteLength).toBeGreaterThan(0);

  // No browser errors and no Tiled data pipeline warnings
  expect(capture.errors).toEqual([]);
  expect(capture.tiledWarns).toEqual([]);
}

// ---------------------------------------------------------------------------
// Individual chapter smoke tests
// ---------------------------------------------------------------------------

test('tiled map smoke: home renders, player in bounds, no errors', async ({ page }) => {
  const capture = setupConsoleCapture(page);
  await bootFreshGame(page);
  await assertChapterRenders(page, 'home', capture);
});

test('tiled map smoke: rain renders, player in bounds, no errors', async ({ page }) => {
  const capture = setupConsoleCapture(page);
  await bootIntoChapter(page, 'rain');
  await assertChapterRenders(page, 'rain', capture);
});

test('rain weather moves continuously and respects reduced motion', async ({ page }, testInfo) => {
  const capture = setupConsoleCapture(page);
  await bootIntoChapter(page, 'rain');
  await assertChapterRenders(page, 'rain', capture);
  await expect.poll(() => canvasSampleColorCount(page)).toBeGreaterThan(16);

  const canvas = page.locator('canvas[aria-label="可操作游戏画面"]');
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  const rainOnlyClip = {
    x: Math.round(bounds!.x + bounds!.width * 0.45),
    y: Math.round(bounds!.y + bounds!.height * 0.08),
    width: Math.round(bounds!.width * 0.18),
    height: Math.round(bounds!.height * 0.16),
  };

  const movingFrameA = await page.screenshot({
    path: testInfo.outputPath('rain-moving-frame-a.png'),
    clip: rainOnlyClip,
  });
  await page.waitForTimeout(180);
  const movingFrameB = await page.screenshot({
    path: testInfo.outputPath('rain-moving-frame-b.png'),
    clip: rainOnlyClip,
  });
  expect(movingFrameA.equals(movingFrameB)).toBe(false);
  await page.screenshot({
    path: testInfo.outputPath('rain-standard-scene.png'),
    animations: 'allow',
  });

  await canvas.press('Escape');
  const reducedMotion = page.getByLabel('减少动态效果');
  await reducedMotion.focus();
  await page.keyboard.press('Space');
  await expect(reducedMotion).toBeChecked();
  await page.getByRole('button', { name: '继续' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  await page.waitForTimeout(50);

  const staticFrameA = await page.screenshot({
    path: testInfo.outputPath('rain-reduced-motion-frame-a.png'),
    clip: rainOnlyClip,
  });
  await page.waitForTimeout(180);
  const staticFrameB = await page.screenshot({
    path: testInfo.outputPath('rain-reduced-motion-frame-b.png'),
    clip: rainOnlyClip,
  });
  expect(staticFrameA.equals(staticFrameB)).toBe(true);
  await expect.poll(() => canvasBlackOrTransparentRatio(page)).toBeLessThan(0.01);
  await page.screenshot({
    path: testInfo.outputPath('rain-reduced-motion-scene.png'),
    animations: 'allow',
  });
  expect(capture.errors).toEqual([]);
});

test('tiled map smoke: life renders, player in bounds, no errors', async ({ page }) => {
  const capture = setupConsoleCapture(page);
  await bootIntoChapter(page, 'life');
  await assertChapterRenders(page, 'life', capture);
});

test('tiled map smoke: return renders, player in bounds, no errors', async ({ page }) => {
  const capture = setupConsoleCapture(page);
  await bootIntoChapter(page, 'return');
  await assertChapterRenders(page, 'return', capture);
  const canvas = page.locator('canvas');
  await expect(canvas).toHaveAttribute('data-return-clue', 'floor_arrow');
  await expect(canvas).toHaveAttribute('data-return-direction', 'right');
  await expect(canvas).toHaveAttribute('data-return-footprints', 'false');
});

test('a wrong return route briefly reveals a familiar-room echo and ignores movement', async ({
  page,
}) => {
  const capture = setupConsoleCapture(page);
  await bootIntoChapter(page, 'return', {
    flags: ['degradation.d3.started', 'flag.return.mapping_learned'],
    player: { x: 120, y: 360, facing: 'left', moving: false },
  });
  await assertChapterRenders(page, 'return', capture);

  const app = page.locator('#app');
  const canvas = page.locator('canvas');
  await page.getByRole('button', { name: '与向左的出口交互' }).click();
  await expect(canvas).toHaveAttribute('data-wrong-turn-echo', 'true');
  const lockedPosition = {
    x: await app.getAttribute('data-player-x'),
    y: await app.getAttribute('data-player-y'),
  };
  await canvas.press('ArrowRight');
  await page.waitForTimeout(100);
  await expect(app).toHaveAttribute('data-player-x', lockedPosition.x ?? '');
  await expect(app).toHaveAttribute('data-player-y', lockedPosition.y ?? '');
  await expect(canvas).toHaveAttribute('data-wrong-turn-echo', 'false', { timeout: 3_000 });
  await canvas.press('ArrowRight');
  await expect
    .poll(async () => ({
      x: await app.getAttribute('data-player-x'),
      y: await app.getAttribute('data-player-y'),
    }))
    .not.toEqual(lockedPosition);
  expect(capture.errors).toEqual([]);
});

test('tiled map smoke: ending renders, player in bounds, no errors', async ({ page }) => {
  const capture = setupConsoleCapture(page);
  await bootIntoChapter(page, 'ending');
  await assertChapterRenders(page, 'ending', capture);
});

test('solid scenery blocks movement at the visible footprint', async ({ page }, testInfo) => {
  const capture = setupConsoleCapture(page);
  const app = page.locator('#app');
  const canvas = page.locator('canvas[aria-label="可操作游戏画面"]');

  await bootIntoChapter(page, 'rain', {
    player: { x: 180, y: 470, facing: 'up', moving: false },
  });
  await canvas.focus();
  await canvas.press('ArrowUp');
  await page.waitForTimeout(100);
  await expect(app).toHaveAttribute('data-player-y', '470');
  await canvas.screenshot({ path: testInfo.outputPath('rain-station-building-collision.png') });

  await bootIntoChapter(page, 'ending', {
    player: { x: 700, y: 510, facing: 'down', moving: false },
  });
  await canvas.focus();
  await canvas.press('ArrowDown');
  await page.waitForTimeout(100);
  await expect(app).toHaveAttribute('data-player-y', '510');
  await canvas.screenshot({ path: testInfo.outputPath('ending-table-collision.png') });
  expect(capture.errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// Sequential chapter jump — verifies save→reload cycle doesn't corrupt state
// ---------------------------------------------------------------------------

test('tiled map smoke: sequential chapter saves do not corrupt state', async ({ page }) => {
  const capture = setupConsoleCapture(page);
  await page.setViewportSize({ width: 1366, height: 768 });

  for (const chapterId of CHAPTERS) {
    // Inject save and reload for each chapter
    await page.goto('/');
    await expect(page.locator('#app')).toHaveAttribute('data-phase', 'title');
    await expect(page.locator('canvas')).toHaveAttribute('data-scene-ready', 'true');
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => localStorage.clear());
    await page.evaluate(
      ({ save }) => {
        localStorage.setItem(
          'erasure.save.slot.1.v1',
          JSON.stringify({ formatVersion: 1, savedAt: new Date().toISOString(), state: save }),
        );
      },
      { save: buildChapterSave(chapterId) },
    );
    await page.reload();
    await continueLatestGame(page);

    const app = page.locator('#app');
    await expect(app).toHaveAttribute('data-chapter', chapterId, { timeout: 10_000 });

    const canvas = page.locator('canvas[aria-label="可操作游戏画面"]');
    await expect(canvas).toBeVisible({ timeout: 5_000 });
    await page.waitForLoadState('networkidle');
  }

  expect(capture.errors).toEqual([]);
  expect(capture.tiledWarns).toEqual([]);
});
