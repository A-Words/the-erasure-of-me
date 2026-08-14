import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import {
  continueLatestGame,
  gotoGame,
  returnToTitle,
  startNewGame,
} from './helpers/game-navigation';

const SAVE_KEY = 'erasure.save.slot.1.v1';

async function activateWithKeyboard(locator: Locator): Promise<void> {
  await locator.focus();
  await locator.press('Enter');
}

async function createSave(page: Page): Promise<void> {
  await gotoGame(page);
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'title');
  await expect(page.locator('canvas')).toHaveAttribute('data-scene-ready', 'true', {
    timeout: 15_000,
  });
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await startNewGame(page, { keyboard: true });
  for (let index = 0; index < 2; index += 1)
    await activateWithKeyboard(page.getByRole('button', { name: '继续对白' }));
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), SAVE_KEY))
    .not.toBeNull();
}

async function patchSave(page: Page, patch: Record<string, unknown>): Promise<void> {
  await returnToTitle(page);
  await page.evaluate(
    ({ key, patch }) => {
      const record = JSON.parse(localStorage.getItem(key) ?? 'null');
      const state = record?.state;
      if (!state) throw new Error('Expected an existing save');
      const puzzles = patch.puzzles ? { ...state.puzzles, ...patch.puzzles } : state.puzzles;
      const settings = patch.settings ? { ...state.settings, ...patch.settings } : state.settings;
      Object.assign(state, patch, { puzzles, settings });
      localStorage.setItem(key, JSON.stringify(record));
      if (patch.settings) {
        localStorage.setItem('erasure.settings.v1', JSON.stringify(settings));
      }
    },
    { key: SAVE_KEY, patch },
  );
}

async function continueSavedGame(page: Page): Promise<void> {
  await page.reload();
  await continueLatestGame(page, true);
  await expect(page.locator('canvas')).toHaveAttribute('data-scene-ready', 'true');
}

async function enterLifeFromRain(page: Page): Promise<void> {
  await createSave(page);
  await patchSave(page, {
    phase: 'playing',
    chapterId: 'rain',
    checkpointId: 'checkpoint.rain.complete',
    degradationStage: 'D1',
    player: { x: 1090, y: 290, facing: 'up', moving: false },
    inventory: ['item.rain.ticket'],
    flags: ['degradation.d1.started'],
    puzzles: {
      stationSequence: [2, 4, 5],
      rainSigns: ['entity.rain.umbrella_sign_a', 'entity.rain.umbrella_sign_b'],
      photoOrder: ['photo.2001', 'photo.1979', 'photo.1992'],
      placedObjects: [],
    },
    modal: null,
    dialogue: [],
    dialogueIndex: 0,
    activeMemoryId: null,
    message: null,
  });
  await continueSavedGame(page);

  const rainExitPrompt = page.getByRole('button', { name: '与钟表铺前的红伞交互' });
  await expect(rainExitPrompt).toBeVisible();
  await activateWithKeyboard(rainExitPrompt);
  for (let index = 0; index < 3; index += 1)
    await activateWithKeyboard(page.getByRole('button', { name: '继续对白' }));

  await expect(page.locator('#app')).toHaveAttribute('data-chapter', 'life');
  await expect(page.getByRole('button', { name: '继续对白' })).toContainText(
    '这个家……怎么有三扇一样的窗？',
  );
}

async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await page.screenshot({
    path: testInfo.outputPath(`${name}.png`),
    fullPage: true,
    animations: 'disabled',
  });
}

async function captureCanvas(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const overlays = page.locator('#hud, #panel-layer, #system-layer');
  await overlays.evaluateAll((elements) => {
    for (const element of elements) (element as HTMLElement).style.visibility = 'hidden';
  });
  try {
    await page.locator('canvas').screenshot({
      path: testInfo.outputPath(`${name}.png`),
      animations: 'allow',
    });
  } finally {
    await overlays.evaluateAll((elements) => {
      for (const element of elements) (element as HTMLElement).style.visibility = '';
    });
  }
}

async function assertNoPageScroll(page: Page): Promise<void> {
  const metrics = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    bodyWidth: document.body.scrollWidth,
    bodyHeight: document.body.scrollHeight,
    htmlWidth: document.documentElement.scrollWidth,
    htmlHeight: document.documentElement.scrollHeight,
  }));
  expect(metrics.bodyWidth).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.htmlWidth).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.bodyHeight).toBeLessThanOrEqual(metrics.viewportHeight);
  expect(metrics.htmlHeight).toBeLessThanOrEqual(metrics.viewportHeight);
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

async function playerPosition(page: Page): Promise<{ x: number; y: number }> {
  return page.locator('#app').evaluate((element) => ({
    x: Number((element as HTMLElement).dataset.playerX),
    y: Number((element as HTMLElement).dataset.playerY),
  }));
}

// Movement runs at 180 px/s real time (per-frame delta is capped at 50 ms, so
// it can only be slower under load). Quick keyboard.press() taps converge
// nicely on a healthy page but can land entirely between game frames when the
// browser is starved (parallel workers, CI) — keydown and keyup are then
// consumed in the same event batch and the game never sees the key. So: tap
// while taps make progress; once progress stalls, recover by holding the key
// until movement is actually observed, alternating with perpendicular nudges
// that keep stepping toward the other axis to slip past furniture corners
// clipped at the edge of the tolerance band.
const AXIS_KEYS = {
  x: { negative: 'ArrowLeft', positive: 'ArrowRight' },
  y: { negative: 'ArrowUp', positive: 'ArrowDown' },
} as const;

async function holdUntilMovement(
  page: Page,
  key: string,
  start: { x: number; y: number },
  maxMs: number,
): Promise<{ x: number; y: number }> {
  await page.keyboard.down(key);
  try {
    let position = start;
    const holdDeadline = Date.now() + maxMs;
    while (Date.now() < holdDeadline) {
      await page.waitForTimeout(20);
      position = await playerPosition(page);
      if (position.x !== start.x || position.y !== start.y) return position;
    }
    return position;
  } finally {
    await page.keyboard.up(key);
  }
}

async function moveTo(page: Page, x: number, y: number, tolerance = 9): Promise<void> {
  const canvas = page.locator('canvas');
  await canvas.focus();
  const deadline = Date.now() + 45_000;
  let lastPosition = await playerPosition(page);
  let lastProgressAt = Date.now();
  let nudgeCount = 0;
  let nudgeSign = 1;
  let lastNudgeFailed = false;
  for (;;) {
    const position = await playerPosition(page);
    const deltaX = x - position.x;
    const deltaY = y - position.y;
    if (Math.abs(deltaX) <= tolerance && Math.abs(deltaY) <= tolerance) return;
    if (position.x !== lastPosition.x || position.y !== lastPosition.y) {
      lastPosition = position;
      lastProgressAt = Date.now();
    }
    if (Date.now() > deadline) {
      throw new Error(
        `Could not move player to (${x}, ${y}); stopped at ${JSON.stringify(position)}`,
      );
    }
    const axis = Math.abs(deltaX) > tolerance ? 'x' : 'y';
    const delta = axis === 'x' ? deltaX : deltaY;
    const key = delta > 0 ? AXIS_KEYS[axis].positive : AXIS_KEYS[axis].negative;
    if (Date.now() - lastProgressAt > 1_200) {
      if (nudgeCount % 2 === 0) {
        // Slip past a corner: step along the other axis, toward its target.
        // Keep stepping while the nudges land — a wall side may take several
        // nudges to clear — and reverse only when one goes nowhere.
        const nudgeAxis = axis === 'x' ? 'y' : 'x';
        const remaining = nudgeAxis === 'y' ? deltaY : deltaX;
        const toward = remaining !== 0 ? Math.sign(remaining) : nudgeSign;
        nudgeSign = lastNudgeFailed ? -toward : toward;
        const keys = AXIS_KEYS[nudgeAxis];
        const after = await holdUntilMovement(
          page,
          nudgeSign > 0 ? keys.positive : keys.negative,
          position,
          1_000,
        );
        lastNudgeFailed = after.x === position.x && after.y === position.y;
      } else if (Math.abs(delta) > 60) {
        // Far from the target: a long hold spans several frames even on a
        // starved page, so progress is guaranteed unless geometry blocks it.
        await page.keyboard.down(key);
        await page.waitForTimeout(600);
        await page.keyboard.up(key);
      } else {
        // Near the target: release as soon as any movement is observed to
        // avoid overshooting past the tolerance window.
        await holdUntilMovement(page, key, position, 1_000);
      }
      nudgeCount += 1;
      lastProgressAt = Date.now();
      continue;
    }
    await page.keyboard.press(key);
    await page.waitForTimeout(16);
  }
}

async function interactWith(page: Page, label: string): Promise<void> {
  const prompt = page.locator('.interaction-prompt');
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText(label);
  await activateWithKeyboard(prompt);
  await page.waitForTimeout(850);
}

for (const viewport of [
  { width: 1024, height: 576 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
]) {
  test(`shows the three source-identical time windows at ${viewport.width}x${viewport.height}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    const browserErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') browserErrors.push(message.text());
    });
    page.on('pageerror', (error) => browserErrors.push(error.stack ?? error.message));
    await page.setViewportSize(viewport);
    await enterLifeFromRain(page);
    await assertNoPageScroll(page);
    await capture(page, testInfo, `shared-life-arrival-${viewport.width}x${viewport.height}`);
    expect(browserErrors).toEqual([]);
  });
}

test('completes photo ordering, all three placements and the corridor exit using only the keyboard', async ({
  page,
}, testInfo) => {
  // Webkit needs ~55 s under parallel-worker contention; give the slowest
  // engine generous headroom.
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await enterLifeFromRain(page);
  for (let index = 0; index < 2; index += 1)
    await activateWithKeyboard(page.getByRole('button', { name: '继续对白' }));

  await moveTo(page, 480, 590);
  await moveTo(page, 485, 400);
  await interactWith(page, '桂花窗台照片');
  await continueSavedGame(page);

  await moveTo(page, 485, 430);
  await moveTo(page, 270, 430);
  await moveTo(page, 220, 430);
  await interactWith(page, '纸箱旁的照片');
  await continueSavedGame(page);

  await moveTo(page, 850, 430);
  await interactWith(page, '银婚照片');
  await continueSavedGame(page);

  await moveTo(page, 581, 440);
  await interactWith(page, '空着三格的相册');
  await capture(page, testInfo, 'shared-life-photo-clues');

  await activateWithKeyboard(page.getByRole('button', { name: '上移 1979 · 搬家纸箱' }));
  await activateWithKeyboard(page.getByRole('button', { name: '上移 1992 · 桂花窗台' }));
  await activateWithKeyboard(page.getByRole('button', { name: '确认顺序' }));
  await expect(page.locator('#app')).toHaveAttribute('data-checkpoint', 'checkpoint.life.photos');
  await capture(page, testInfo, 'shared-life-photos-ordered');

  await moveTo(page, 500, 440);
  await moveTo(page, 320, 440);
  await moveTo(page, 320, 390);
  await interactWith(page, '有裂缝的条纹物件');
  await continueSavedGame(page);

  await moveTo(page, 693, 430);
  await interactWith(page, '带桂花圆点的物件');
  await continueSavedGame(page);

  await moveTo(page, 870, 430);
  await moveTo(page, 870, 570);
  await interactWith(page, '双线圈波纹物件');
  await continueSavedGame(page);

  await moveTo(page, 500, 570);
  await moveTo(page, 500, 430);
  await moveTo(page, 320, 430);
  await moveTo(page, 320, 385);
  await interactWith(page, '镜台 · 条纹槽');
  await activateWithKeyboard(page.getByRole('button', { name: '继续对白' }));
  await capture(page, testInfo, 'shared-life-1979-stabilized');

  await moveTo(page, 528, 385);
  await interactWith(page, '窗台 · 圆点槽');
  await activateWithKeyboard(page.getByRole('button', { name: '继续对白' }));
  await capture(page, testInfo, 'shared-life-1992-stabilized');

  await moveTo(page, 700, 390);
  await moveTo(page, 940, 390);
  const radioPrompt = page.locator('.interaction-prompt');
  await expect(radioPrompt).toContainText('收音机 · 波纹槽');
  await activateWithKeyboard(radioPrompt);
  await page.waitForTimeout(340);
  await captureCanvas(page, testInfo, 'shared-life-resolved-crossfade-midpoint');
  await page.waitForTimeout(510);
  await activateWithKeyboard(page.getByRole('button', { name: '继续对白' }));
  await expect(page.locator('.objective-chip')).toContainText('走进房间上方延长的走廊');
  await capture(page, testInfo, 'shared-life-all-objects-placed');

  await moveTo(page, 680, 170);
  await interactWith(page, '延长的走廊');
  await capture(page, testInfo, 'shared-life-exit-dialogue');
  for (let index = 0; index < 2; index += 1)
    await activateWithKeyboard(page.getByRole('button', { name: '继续对白' }));
  await expect(page.locator('#app')).toHaveAttribute('data-chapter', 'return');
});

test('uses visible photo clues to progress while muted', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await createSave(page);
  await patchSave(page, {
    phase: 'playing',
    chapterId: 'life',
    checkpointId: 'checkpoint.life.start',
    degradationStage: 'D2',
    objective: '整理照片，并让三件生活物品回到原处',
    player: { x: 581, y: 440, facing: 'left', moving: false },
    inventory: ['item.photo.1979', 'item.photo.1992', 'item.photo.2001'],
    flags: ['degradation.d2.started'],
    puzzles: {
      photoOrder: ['photo.2001', 'photo.1979', 'photo.1992'],
      placedObjects: [],
    },
    settings: { muted: true },
    modal: null,
    dialogue: [],
    dialogueIndex: 0,
    activeMemoryId: null,
    message: null,
  });
  await continueSavedGame(page);

  const canvas = page.locator('canvas[aria-label="可操作游戏画面"]');
  await canvas.press('Escape');
  await expect(page.getByLabel('静音（所有声音线索都有视觉替代）')).toBeChecked();
  await activateWithKeyboard(page.getByRole('button', { name: '继续', exact: true }));

  await interactWith(page, '空着三格的相册');
  await expect(page.locator('.photo-card img')).toHaveCount(3);
  await expect(page.getByRole('heading', { name: '把照片放回时间里' })).toBeVisible();
  await expect(page.getByText('年份写在尚未拆开的纸箱角落。')).toBeVisible();
  await expect(page.getByText('年份写在孩子的身高刻度旁。')).toBeVisible();
  await expect(page.getByText('年份写在银婚蛋糕的小牌上。')).toBeVisible();
  await activateWithKeyboard(page.getByRole('button', { name: '上移 1979 · 搬家纸箱' }));
  await activateWithKeyboard(page.getByRole('button', { name: '上移 1992 · 桂花窗台' }));
  await activateWithKeyboard(page.getByRole('button', { name: '确认顺序' }));

  await expect(page.locator('#app')).toHaveAttribute('data-checkpoint', 'checkpoint.life.photos');
  await expect(page.locator('.toast')).toContainText('三个年份安静地排在了一起');
});

test('keeps Shared Life stable with low stimulation and reduced motion', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await createSave(page);
  await patchSave(page, {
    phase: 'playing',
    chapterId: 'life',
    checkpointId: 'checkpoint.life.complete',
    objective: '走进房间上方延长的走廊',
    degradationStage: 'D2',
    mode: 'low_stimulation',
    player: { x: 640, y: 590, facing: 'up', moving: false },
    inventory: ['item.life.wood_comb', 'item.life.enamel_cup', 'item.life.cassette'],
    flags: ['degradation.d2.started', 'puzzle.life.photo_order.completed'],
    puzzles: {
      photoOrder: ['photo.1979', 'photo.1992', 'photo.2001'],
      placedObjects: ['item.life.wood_comb', 'item.life.enamel_cup', 'item.life.cassette'],
    },
    settings: { reducedMotion: true },
    modal: null,
    dialogue: [],
    dialogueIndex: 0,
    activeMemoryId: null,
  });
  await continueSavedGame(page);
  await expect(page.locator('#app')).toHaveAttribute('data-chapter', 'life');
  await expect.poll(() => canvasSampleColorCount(page), { timeout: 15_000 }).toBeGreaterThan(16);
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  await expect(page.locator('.stage-chip')).toContainText('低扰动');
  await page.waitForTimeout(180);
  await assertNoPageScroll(page);
  await capture(page, testInfo, 'shared-life-low-stimulation-reduced-motion');
});
