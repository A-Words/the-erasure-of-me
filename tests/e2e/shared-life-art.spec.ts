import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';

const SAVE_KEY = 'erasure.save.v1';

async function activateWithKeyboard(locator: Locator): Promise<void> {
  await locator.focus();
  await locator.press('Enter');
}

async function createSave(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'title');
  await expect(page.locator('canvas')).toHaveAttribute('data-scene-ready', 'true');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await activateWithKeyboard(page.getByRole('button', { name: /标准模式/ }));
  for (let index = 0; index < 2; index += 1)
    await activateWithKeyboard(page.getByRole('button', { name: '继续对白' }));
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), SAVE_KEY))
    .not.toBeNull();
}

async function patchSave(page: Page, patch: Record<string, unknown>): Promise<void> {
  await page.evaluate(
    ({ key, patch }) => {
      const state = JSON.parse(localStorage.getItem(key) ?? 'null');
      if (!state) throw new Error('Expected an existing save');
      const puzzles = patch.puzzles ? { ...state.puzzles, ...patch.puzzles } : state.puzzles;
      const settings = patch.settings ? { ...state.settings, ...patch.settings } : state.settings;
      Object.assign(state, patch, { puzzles, settings });
      localStorage.setItem(key, JSON.stringify(state));
    },
    { key: SAVE_KEY, patch },
  );
}

async function continueSavedGame(page: Page): Promise<void> {
  await page.reload();
  await activateWithKeyboard(page.getByRole('button', { name: '从最近的安全位置继续' }));
  await expect(page.locator('canvas')).toHaveAttribute('data-scene-ready', 'true');
}

async function enterLifeFromRain(page: Page): Promise<void> {
  await createSave(page);
  await patchSave(page, {
    phase: 'playing',
    chapterId: 'rain',
    checkpointId: 'checkpoint.rain.complete',
    degradationStage: 'D1',
    player: { x: 1140, y: 120, facing: 'up', moving: false },
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
  const app = page.locator('#app');
  return {
    x: Number(await app.getAttribute('data-player-x')),
    y: Number(await app.getAttribute('data-player-y')),
  };
}

async function moveTo(page: Page, x: number, y: number, tolerance = 9): Promise<void> {
  const canvas = page.locator('canvas');
  await canvas.focus();
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const current = await playerPosition(page);
    const deltaX = x - current.x;
    const deltaY = y - current.y;
    if (Math.abs(deltaX) <= tolerance && Math.abs(deltaY) <= tolerance) return;
    if (Math.abs(deltaX) > tolerance) {
      await page.keyboard.press(deltaX > 0 ? 'ArrowRight' : 'ArrowLeft');
    } else {
      await page.keyboard.press(deltaY > 0 ? 'ArrowDown' : 'ArrowUp');
    }
    await page.waitForTimeout(8);
  }
  throw new Error(
    `Could not move player to (${x}, ${y}); stopped at ${JSON.stringify(await playerPosition(page))}`,
  );
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
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await enterLifeFromRain(page);
  for (let index = 0; index < 2; index += 1)
    await activateWithKeyboard(page.getByRole('button', { name: '继续对白' }));

  await moveTo(page, 480, 590);
  await moveTo(page, 500, 250);
  await interactWith(page, '桂花窗台照片');
  await continueSavedGame(page);

  await moveTo(page, 500, 200);
  await moveTo(page, 270, 200);
  await moveTo(page, 270, 430);
  await moveTo(page, 150, 430);
  await interactWith(page, '纸箱旁的照片');
  await continueSavedGame(page);

  await moveTo(page, 850, 430);
  await interactWith(page, '银婚照片');
  await continueSavedGame(page);

  await moveTo(page, 850, 465);
  await moveTo(page, 740, 465);
  await interactWith(page, '空着三格的相册');
  await capture(page, testInfo, 'shared-life-photo-clues');

  await activateWithKeyboard(page.getByRole('button', { name: '上移 1979 · 搬家纸箱' }));
  await activateWithKeyboard(page.getByRole('button', { name: '上移 1992 · 桂花窗台' }));
  await activateWithKeyboard(page.getByRole('button', { name: '确认顺序' }));
  await expect(page.locator('#app')).toHaveAttribute('data-checkpoint', 'checkpoint.life.photos');
  await capture(page, testInfo, 'shared-life-photos-ordered');

  await moveTo(page, 740, 570);
  await moveTo(page, 320, 570);
  await moveTo(page, 320, 390);
  await interactWith(page, '有裂缝的条纹物件');
  await continueSavedGame(page);

  await moveTo(page, 610, 390);
  await moveTo(page, 610, 320);
  await interactWith(page, '带桂花圆点的物件');
  await continueSavedGame(page);

  await moveTo(page, 870, 320);
  await moveTo(page, 870, 570);
  await interactWith(page, '双线圈波纹物件');
  await continueSavedGame(page);

  await moveTo(page, 320, 570);
  await moveTo(page, 320, 385);
  await interactWith(page, '镜台 · 条纹槽');
  await activateWithKeyboard(page.getByRole('button', { name: '继续对白' }));
  await capture(page, testInfo, 'shared-life-1979-stabilized');

  await moveTo(page, 585, 385);
  await moveTo(page, 585, 215);
  await interactWith(page, '窗台 · 圆点槽');
  await activateWithKeyboard(page.getByRole('button', { name: '继续对白' }));
  await capture(page, testInfo, 'shared-life-1992-stabilized');

  await moveTo(page, 940, 215);
  await moveTo(page, 940, 385);
  await moveTo(page, 1065, 385);
  const radioPrompt = page.locator('.interaction-prompt');
  await expect(radioPrompt).toContainText('收音机 · 波纹槽');
  await activateWithKeyboard(radioPrompt);
  await page.waitForTimeout(340);
  await captureCanvas(page, testInfo, 'shared-life-resolved-crossfade-midpoint');
  await page.waitForTimeout(510);
  await activateWithKeyboard(page.getByRole('button', { name: '继续对白' }));
  await expect(page.locator('.objective-chip')).toContainText('走进房间上方延长的走廊');
  await capture(page, testInfo, 'shared-life-all-objects-placed');

  await moveTo(page, 700, 385);
  await moveTo(page, 700, 70);
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
    player: { x: 740, y: 465, facing: 'left', moving: false },
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
  await expect.poll(() => canvasSampleColorCount(page)).toBeGreaterThan(16);
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  await expect(page.locator('.stage-chip')).toContainText('低扰动');
  await page.waitForTimeout(180);
  await assertNoPageScroll(page);
  await capture(page, testInfo, 'shared-life-low-stimulation-reduced-motion');
});
