import { expect, test, type Page } from '@playwright/test';

async function startGame(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: /标准模式/ }).click();
  await page.getByRole('button', { name: '继续对白' }).click();
  await page.getByRole('button', { name: '继续对白' }).click();
  await expect(page.locator('canvas')).toHaveAttribute('data-scene-ready', 'true');
}

async function loadRain(page: Page): Promise<void> {
  await page.evaluate(() => {
    const key = 'erasure.save.v1';
    const state = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (!state) throw new Error('Expected a save after starting the game');
    Object.assign(state, {
      phase: 'playing',
      chapterId: 'rain',
      checkpointId: 'checkpoint.rain.start',
      degradationStage: 'D1',
      objective: '按 2 → 4 → 5 踩亮石板，再跟随红伞',
      player: { x: 228, y: 600, facing: 'right', moving: false },
      flags: [],
      modal: null,
      dialogue: [],
      dialogueIndex: 0,
      activeMemoryId: null,
      message: null,
    });
    state.puzzles.stationSequence = [2];
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();
  await page.getByRole('button', { name: '从最近的安全位置继续' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-chapter', 'rain');
}

async function loadEnding(page: Page): Promise<void> {
  await page.evaluate(() => {
    const key = 'erasure.save.v1';
    const state = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (!state) throw new Error('Expected a save after starting the game');
    Object.assign(state, {
      phase: 'playing',
      chapterId: 'ending',
      checkpointId: 'checkpoint.ending.start',
      degradationStage: 'D4',
      objective: '走近秀兰',
      player: { x: 920, y: 430, facing: 'down', moving: false },
      flags: [],
      modal: null,
      dialogue: [],
      dialogueIndex: 0,
      activeMemoryId: null,
      message: null,
    });
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();
  await page.getByRole('button', { name: '从最近的安全位置继续' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-chapter', 'ending');
}

test('shows a live keyboard-accessible map and freezes movement while open', async ({
  page,
}, testInfo) => {
  await startGame(page);
  const app = page.locator('#app');
  const mapButton = page.getByRole('button', { name: /地图/ });
  await expect(mapButton).toBeVisible();

  await mapButton.click();
  await expect(page.getByRole('heading', { name: /第一章 · 清晨的家/ })).toBeVisible();
  await expect(page.getByRole('img', { name: /蓝色圆点/ })).toBeVisible();
  await expect(page.getByText('卧室')).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('map-home-expanded.png'),
    animations: 'disabled',
  });

  const before = await app.getAttribute('data-player-x');
  await page.keyboard.press('ArrowRight');
  await expect(app).toHaveAttribute('data-player-x', before ?? '');
  await page.keyboard.press('q');
  await expect(page.getByRole('heading', { name: /第一章 · 清晨的家/ })).not.toBeVisible();
  await expect(mapButton).toBeFocused();
});

test('shows the washed rain map while retaining reliable markers', async ({ page }, testInfo) => {
  await startGame(page);
  await loadRain(page);
  const app = page.locator('#app');
  const mapButton = page.getByRole('button', { name: /地图/ });

  await expect(app).toHaveAttribute('data-map-mode', 'full');
  await mapButton.click();
  await expect(page.locator('.map-drawing.expanded')).toHaveClass(/full/);
  await page.keyboard.press('q');
  const washedSave = await page.evaluate(() => {
    const key = 'erasure.save.v1';
    const state = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (!state) throw new Error('Expected the rain save to exist');
    state.flags = [
      ...new Set([
        ...state.flags,
        'flag.rain.map_opened',
        'flag.rain.map_closed',
        'degradation.d1.started',
      ]),
    ];
    return JSON.stringify(state);
  });
  await page.addInitScript(({ key, save }) => localStorage.setItem(key, save), {
    key: 'erasure.save.v1',
    save: washedSave,
  });
  await page.reload();
  await page.getByRole('button', { name: '从最近的安全位置继续' }).click();
  await expect(app).toHaveAttribute('data-map-mode', 'washed', { timeout: 3000 });

  await mapButton.click();
  const expanded = page.locator('.map-drawing.expanded');
  await expect(expanded).toHaveClass(/washed/);
  await expect(expanded.locator('.map-landmark.station')).toHaveCount(1);
  await expect(expanded.locator('.map-landmark.umbrella')).toHaveCount(3);
  await expect(expanded.locator('.map-sound-cue')).toBeVisible();
  await expect(page.getByText(/当前位置、已到达的站牌、红伞和钟声方向/)).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('map-rain-washed.png'),
    animations: 'disabled',
  });
});

test('keeps the map closed via keyboard when the map mode is hidden in D4', async ({ page }) => {
  await startGame(page);
  await loadEnding(page);
  const app = page.locator('#app');
  await expect(app).toHaveAttribute('data-map-mode', 'hidden');

  // The HUD map button is not rendered once the map is fully hidden.
  await expect(page.getByRole('button', { name: /地图/ })).toHaveCount(0);

  // The keyboard shortcut must be blocked too, not just the button.
  await page.keyboard.press('m');
  await expect(page.getByRole('heading', { name: /尾声 · 面还是热的/ })).toHaveCount(0);
  await expect(app).toHaveAttribute('data-map-mode', 'hidden');
});
