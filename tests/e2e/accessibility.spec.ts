import { expect, test, type Locator, type Page } from '@playwright/test';

let browserErrors: string[];

test.beforeEach(async ({ page }) => {
  browserErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.stack ?? error.message));
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test.afterEach(() => {
  expect(browserErrors).toEqual([]);
});

async function activateWithKeyboard(locator: Locator): Promise<void> {
  await locator.focus();
  await locator.press('Enter');
}

async function startGameWithKeyboard(page: Page): Promise<void> {
  await activateWithKeyboard(page.getByRole('button', { name: /标准模式/ }));
}

async function finishOpeningDialogue(page: Page): Promise<void> {
  for (let index = 0; index < 2; index += 1)
    await activateWithKeyboard(page.getByRole('button', { name: '继续对白' }));
}

test('keeps dialogue, movement, inventory and 200% zoom settings keyboard-operable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await startGameWithKeyboard(page);
  const checkpoint = await page.locator('#app').getAttribute('data-checkpoint');

  await page.setViewportSize({ width: 1024, height: 576 });
  await expect(page.getByRole('button', { name: '继续对白' })).toBeVisible();
  await expect(page.locator('#app')).toHaveAttribute('data-checkpoint', checkpoint ?? '');
  await finishOpeningDialogue(page);

  const canvas = page.locator('canvas[aria-label="可操作游戏画面"]');
  await canvas.focus();
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(100);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.waitForTimeout(100);
  await page.keyboard.up('ArrowRight');
  const playerX = Number(await page.locator('#app').getAttribute('data-player-x'));
  expect(playerX).toBeGreaterThan(180);
  expect(playerX).toBeLessThanOrEqual(1280);

  await canvas.focus();
  await page.keyboard.down('i');
  await page.waitForTimeout(120);
  await page.keyboard.up('i');
  await expect(page.getByRole('heading', { name: '背包' })).toBeVisible();
  await page.setViewportSize({ width: 1024, height: 576 });
  await expect(page.getByRole('heading', { name: '背包' })).toBeVisible();
  await activateWithKeyboard(page.getByRole('button', { name: /关闭/ }));

  await page.evaluate(() => {
    document.documentElement.style.zoom = '2';
  });
  await canvas.focus();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: '暂停' })).toBeVisible();
  const muted = page.getByLabel('静音（所有声音线索都有视觉替代）');
  await muted.scrollIntoViewIfNeeded();
  await muted.focus();
  await page.keyboard.press('Space');
  await expect(muted).toBeChecked();
  const fontSize = page.getByLabel('文字大小');
  await fontSize.scrollIntoViewIfNeeded();
  await fontSize.focus();
  await page.keyboard.press('ArrowDown');
  await expect(fontSize).toHaveValue('large');
  await expect(page.locator('#app')).toHaveAttribute('data-chapter', 'home');
});

test('exposes content warning, objectives, settings, guide sources and credits semantically', async ({
  page,
}) => {
  await expect(page.getByRole('complementary').getByText('内容提示')).toBeVisible();
  await expect(page.getByRole('main', { name: '记忆的缝隙游戏' })).toBeVisible();
  await startGameWithKeyboard(page);
  await finishOpeningDialogue(page);
  await expect(page.getByRole('region', { name: '当前目标' })).toContainText('找到钥匙');
  await expect(page.getByRole('region', { name: '当前信息状态' })).toContainText('D0');

  await page.evaluate(() => {
    const key = 'erasure.save.v1';
    const state = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (!state) throw new Error('Expected a save after starting the game');
    Object.assign(state, {
      phase: 'playing',
      chapterId: 'ending',
      checkpointId: 'checkpoint.ending.start',
      degradationStage: 'D4',
      objective: '握住她的手',
      player: { x: 920, y: 430, facing: 'left', moving: false },
      flags: ['ending.dialogue_started', 'ending.ready_to_hold'],
      dialogue: [],
      dialogueIndex: 0,
      activeMemoryId: null,
      holdProgress: 0,
      message: '按住 E / Enter，握住她的手。',
    });
    state.settings.holdMode = 'single';
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();
  await activateWithKeyboard(page.getByRole('button', { name: '从最近的安全位置继续' }));
  const canvas = page.locator('canvas[aria-label="可操作游戏画面"]');
  await canvas.focus();
  await page.keyboard.press('e');
  for (let index = 0; index < 3; index += 1)
    await activateWithKeyboard(page.getByRole('button', { name: '继续对白' }));

  await expect(page.getByRole('heading', { name: '早期表现与就医陪伴指南' })).toBeVisible();
  await expect(page.getByText('不能替代专业筛查、诊断或治疗')).toBeVisible();
  await expect(page.getByRole('heading', { name: '制作与致谢' })).toBeVisible();
  const sourceLinks = page.locator('.guide-page a[target="_blank"][rel="noopener noreferrer"]');
  await expect(sourceLinks).toHaveCount(3);
  await expect(page.getByRole('link', { name: /世界卫生组织/ })).toHaveAttribute(
    'href',
    /who\.int/,
  );
});

test('retains shape and texture labels under forced colors', async ({ page }, testInfo) => {
  await startGameWithKeyboard(page);
  await finishOpeningDialogue(page);
  await page.evaluate(() => {
    const key = 'erasure.save.v1';
    const state = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (!state) throw new Error('Expected a save after starting the game');
    Object.assign(state, {
      phase: 'playing',
      chapterId: 'life',
      checkpointId: 'checkpoint.life.start',
      degradationStage: 'D2',
      objective: '整理照片，并让三件生活物品回到原处',
      player: { x: 640, y: 590, facing: 'up', moving: false },
      inventory: ['item.life.wood_comb', 'item.life.enamel_cup', 'item.life.cassette'],
      flags: ['degradation.d2.started'],
      dialogue: [],
      dialogueIndex: 0,
      activeMemoryId: null,
      message: null,
    });
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();
  await page.emulateMedia({ forcedColors: 'active' });
  await activateWithKeyboard(page.getByRole('button', { name: '从最近的安全位置继续' }));
  await activateWithKeyboard(page.getByRole('button', { name: /背包/ }));

  await expect(page.getByLabel('木梳 · 条纹')).toContainText('条纹');
  await expect(page.getByLabel('搪瓷杯 · 圆点')).toContainText('圆点');
  await expect(page.getByLabel('录音带 · 波纹')).toContainText('波纹');
  await expect(page.locator('.inventory-list .item-shape')).toHaveCount(3);
  await page.screenshot({
    path: testInfo.outputPath('accessibility-color-redundancy.png'),
    animations: 'disabled',
  });
});

test('keeps interactive props stable under reduced motion', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await startGameWithKeyboard(page);
  await finishOpeningDialogue(page);

  const app = page.locator('#app');
  const canvas = page.locator('canvas[aria-label="可操作游戏画面"]');
  await canvas.focus();

  // 开启减少动态效果：暂停菜单里的 labeled checkbox（沿用既有 settings 取法）。
  await page.keyboard.press('Escape');
  const reducedMotion = page.getByLabel('减少动态效果');
  await reducedMotion.scrollIntoViewIfNeeded();
  await reducedMotion.focus();
  await page.keyboard.press('Space');
  await expect(reducedMotion).toBeChecked();
  await page.getByRole('button', { name: '继续' }).click();
  await expect(page.getByRole('heading', { name: '暂停' })).not.toBeVisible();

  // reducedMotion 下呼吸必须完全关闭。
  await expect(app).toHaveAttribute('data-breathing-active', 'false');
  await page.screenshot({
    path: testInfo.outputPath('reduced-motion-prop-base-scale.png'),
    animations: 'disabled',
  });
});

test('captures standard-mode breathing snapshot for review', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await startGameWithKeyboard(page);
  await finishOpeningDialogue(page);

  const app = page.locator('#app');
  await expect(app).toHaveAttribute('data-breathing-active', 'true');

  // 标准模式：不开启 reducedMotion，让呼吸运行，截一张供人工复核。
  await page.screenshot({
    path: testInfo.outputPath('standard-mode-breathing.png'),
    animations: 'allow',
  });
});

test('shows hover marker for spriteless interactables under reduced motion', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await startGameWithKeyboard(page);
  await finishOpeningDialogue(page);

  const app = page.locator('#app');
  const canvas = page.locator('canvas[aria-label="可操作游戏画面"]');
  await canvas.focus();

  // 在 reducedMotion 下测试：呼吸静止，只需验证 marker 显形。
  await page.keyboard.press('Escape');
  const reducedMotion = page.getByLabel('减少动态效果');
  await reducedMotion.scrollIntoViewIfNeeded();
  await reducedMotion.focus();
  await page.keyboard.press('Space');
  await expect(reducedMotion).toBeChecked();
  await page.getByRole('button', { name: '继续' }).click();
  await expect(page.getByRole('heading', { name: '暂停' })).not.toBeVisible();
  await expect(app).toHaveAttribute('data-breathing-active', 'false');

  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();

  // entity.home.front_door is at logical (1225, 560) with a radius-30 hit area。
  // 只截 marker 周围的小区域，避开下方 38px 处的名称标签。
  const doorScreenX = bounds!.x + (1225 / 1280) * bounds!.width;
  const doorScreenY = bounds!.y + (560 / 720) * bounds!.height;
  const clip = {
    x: Math.round(doorScreenX - 25),
    y: Math.round(doorScreenY - 25),
    width: 50,
    height: 50,
  };
  const resting = await page.screenshot({ clip, animations: 'disabled' });
  await page.mouse.move(doorScreenX, doorScreenY);
  await page.waitForTimeout(40);
  const hovered = await page.screenshot({
    clip,
    path: testInfo.outputPath('dot-hover-marker.png'),
    animations: 'disabled',
  });
  await page.waitForTimeout(120);
  const hoveredLater = await page.screenshot({ clip, animations: 'disabled' });

  expect(hovered.equals(resting)).toBe(false);
  expect(hoveredLater.equals(hovered)).toBe(true);
});
