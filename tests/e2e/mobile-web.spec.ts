import { expect, test, type Page } from '@playwright/test';
import { startNewGame } from './helpers/game-navigation';

async function finishOpeningDialogue(page: Page): Promise<void> {
  const confirm = page.locator('[data-touch-action="interact"]');
  while (await page.locator('.dialogue-box').isVisible()) {
    await expect(confirm).toHaveText('继续');
    await confirm.tap();
  }
}

async function expectTitlePanelFits(page: Page): Promise<void> {
  const overflow = await page.locator('.title-panel').evaluate((panel) => ({
    horizontal: panel.scrollWidth - panel.clientWidth,
    vertical: panel.scrollHeight - panel.clientHeight,
  }));
  expect(overflow.horizontal).toBeLessThanOrEqual(1);
  expect(overflow.vertical).toBeLessThanOrEqual(1);
}

async function expectEveryElementInViewport(page: Page, selector: string): Promise<void> {
  const elements = page.locator(selector);
  for (let index = 0; index < (await elements.count()); index += 1) {
    await expect(elements.nth(index)).toBeInViewport();
  }
}

async function expectPanelShellFits(page: Page, selector: string): Promise<void> {
  const overflow = await page.locator(selector).evaluate((panel) => ({
    horizontal: panel.scrollWidth - panel.clientWidth,
    vertical: panel.scrollHeight - panel.clientHeight,
  }));
  expect(overflow.horizontal).toBeLessThanOrEqual(1);
  expect(overflow.vertical).toBeLessThanOrEqual(1);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('keeps every title action visible without scrolling on supported landscape phones', async ({
  page,
}, testInfo) => {
  for (const viewport of [
    { width: 780, height: 360 },
    { width: 932, height: 430 },
  ]) {
    await page.setViewportSize(viewport);

    for (const name of ['继续游戏', '开始游戏', '读取记忆', '设置']) {
      await expect(page.getByRole('button', { name })).toBeInViewport();
    }

    const overflow = await page.locator('.title-screen').evaluate((title) => ({
      page: document.documentElement.scrollHeight - window.innerHeight,
      title: title.scrollHeight - title.clientHeight,
    }));
    expect(overflow.page).toBeLessThanOrEqual(1);
    expect(overflow.title).toBeLessThanOrEqual(1);

    await page.screenshot({
      path: testInfo.outputPath(`mobile-landscape-title-${viewport.width}x${viewport.height}.png`),
    });
  }
});

test('fits start, memory, and settings pages into supported landscape phones', async ({
  page,
}, testInfo) => {
  for (const viewport of [
    { width: 780, height: 360 },
    { width: 932, height: 430 },
  ]) {
    await page.setViewportSize(viewport);
    await page.reload();

    await page.locator('[data-title-view="mode"]').tap();
    await expectEveryElementInViewport(page, '.title-mode .mode-card, .title-mode > .secondary');
    await expectTitlePanelFits(page);
    await page.screenshot({
      path: testInfo.outputPath(`mobile-start-${viewport.width}x${viewport.height}.png`),
    });

    await page.locator('[data-select-mode="standard"]').tap();
    await expectEveryElementInViewport(
      page,
      '.title-memory-picker .memory-fragment, .title-memory-picker > .secondary',
    );
    await expectTitlePanelFits(page);
    await page.screenshot({
      path: testInfo.outputPath(`mobile-new-game-slots-${viewport.width}x${viewport.height}.png`),
    });

    await page.locator('.title-memory-picker > .secondary').tap();
    await page.locator('.title-mode > .secondary').tap();
    await page.locator('[data-title-view="memories"]').tap();
    await expectEveryElementInViewport(
      page,
      '.title-memories .memory-fragment, .title-memories > .secondary',
    );
    await expectTitlePanelFits(page);
    await page.screenshot({
      path: testInfo.outputPath(`mobile-memories-${viewport.width}x${viewport.height}.png`),
    });

    await page.locator('.title-memories > .secondary').tap();
    await page.locator('[data-title-view="settings"]').tap();
    await expectEveryElementInViewport(
      page,
      '.title-settings .settings-section, .title-settings > .secondary',
    );
    await expectTitlePanelFits(page);
    await page.screenshot({
      path: testInfo.outputPath(`mobile-settings-${viewport.width}x${viewport.height}.png`),
    });
    await page.locator('[data-setting="fontSize"]').selectOption('large');
    await expect(page.locator('.title-settings > .secondary')).toBeInViewport();
    await expectTitlePanelFits(page);
  }
});

test('plays with touch controls at the minimum supported landscape viewport', async ({
  page,
}, testInfo) => {
  await page.screenshot({ path: testInfo.outputPath('mobile-landscape-title.png') });
  await startNewGame(page);
  await page.screenshot({ path: testInfo.outputPath('mobile-landscape-dialogue.png') });
  await finishOpeningDialogue(page);
  const canvas = page.locator('canvas');
  await expect(canvas).toHaveAttribute('data-scene-ready', 'true');
  await page.screenshot({ path: testInfo.outputPath('mobile-landscape-hud.png') });

  const touchTargets = await page.locator('.touch-controls button').evaluateAll((buttons) =>
    buttons.map((button) => {
      const rect = button.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }),
  );
  for (const target of touchTargets) {
    expect(target.width).toBeGreaterThanOrEqual(44);
    expect(target.height).toBeGreaterThanOrEqual(44);
  }

  const dpad = await page.locator('.touch-dpad').boundingBox();
  expect(dpad?.width).toBeLessThanOrEqual(140);
  expect(dpad?.height).toBeLessThanOrEqual(140);

  const directionBoxes = Object.fromEntries(
    await Promise.all(
      ['上', '下', '左', '右'].map(async (direction) => [
        direction,
        await page.getByRole('button', { name: `向${direction}移动` }).boundingBox(),
      ]),
    ),
  );
  expect(directionBoxes.上?.x).toBe(directionBoxes.下?.x);
  expect(directionBoxes.左?.y).toBe(directionBoxes.右?.y);
  expect(directionBoxes.上?.y).toBeLessThan(directionBoxes.左?.y ?? 0);
  expect(directionBoxes.下?.y).toBeGreaterThan(directionBoxes.左?.y ?? 0);

  const observeBox = await page.getByRole('button', { name: '按住静静留意' }).boundingBox();
  const interact = page.locator('[data-touch-action="interact"]');
  const confirmBox = await interact.boundingBox();
  expect(confirmBox?.width).toBe(observeBox?.width);
  expect(confirmBox?.height).toBe(observeBox?.height);
  await expect(interact).toHaveText(/^(交互|查看|拾取|放置|前往)$/);

  const up = page.getByRole('button', { name: '向上移动' });
  await up.dispatchEvent('pointerdown', { pointerId: 10, pointerType: 'touch' });
  await expect(interact).toHaveText('查看');
  await expect(interact).toHaveAttribute('aria-label', '查看床边合影');
  await up.dispatchEvent('pointerup', { pointerId: 10, pointerType: 'touch' });

  const pause = await page.getByRole('button', { name: '暂停游戏' }).boundingBox();
  const saveNotice = await page.getByRole('status').boundingBox();
  expect(pause && saveNotice && pause.x < saveNotice.x + saveNotice.width).toBe(false);

  const right = page.getByRole('button', { name: '向右移动' });
  const before = Number(await page.locator('#app').getAttribute('data-player-x'));
  await right.dispatchEvent('pointerdown', { pointerId: 11, pointerType: 'touch' });
  await page.waitForTimeout(350);
  await right.dispatchEvent('pointerup', { pointerId: 11, pointerType: 'touch' });
  await expect
    .poll(async () => Number(await page.locator('#app').getAttribute('data-player-x')))
    .toBeGreaterThan(before);

  const observe = page.getByRole('button', { name: '按住静静留意' });
  await observe.dispatchEvent('pointerdown', { pointerId: 12, pointerType: 'touch' });
  await expect(canvas).toHaveAttribute('data-observation-active', 'true');
  await observe.dispatchEvent('pointercancel', { pointerId: 12, pointerType: 'touch' });
  await expect(canvas).toHaveAttribute('data-observation-active', 'false');

  await page.getByRole('button', { name: '暂停游戏' }).tap();
  await expect(page.getByRole('heading', { name: '暂停' })).toBeVisible();
  await page.waitForTimeout(150);
  await expect(page.getByRole('heading', { name: '暂停' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('mobile-landscape-pause.png') });
});

test('adapts inventory, journal, map, and pause panels to mobile landscape', async ({
  page,
}, testInfo) => {
  await startNewGame(page);
  await finishOpeningDialogue(page);
  await page.addInitScript(() => {
    const key = 'erasure.save.slot.1.v1';
    const record = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (!record) return;
    Object.assign(record.state, {
      inventory: ['item.life.wood_comb', 'item.life.enamel_cup', 'item.life.cassette'],
      journalPages: [
        'journal.home.key',
        'journal.rain.route',
        'journal.life.ordinary_days',
        'journal.return.last_page',
      ],
      modal: null,
      dialogue: [],
      dialogueIndex: 0,
    });
    localStorage.setItem(key, JSON.stringify(record));
  });
  await page.reload();
  await page.getByRole('button', { name: '继续游戏' }).tap();
  await expect(page.locator('canvas')).toHaveAttribute('data-scene-ready', 'true');

  await page.getByRole('button', { name: /背包/ }).tap();
  await expect(page.locator('.inventory-list li')).toHaveCount(3);
  await expectEveryElementInViewport(page, '.inventory-panel h2, .inventory-panel > [data-close]');
  await expectPanelShellFits(page, '.inventory-panel');
  await page.screenshot({ path: testInfo.outputPath('mobile-landscape-inventory.png') });
  await page.locator('.inventory-panel > [data-close]').tap();

  await page.getByRole('button', { name: /日记/ }).tap();
  await expect(page.locator('.journal-pages article')).toHaveCount(4);
  await expectEveryElementInViewport(page, '.journal-panel h2, .journal-panel > [data-close]');
  await expectPanelShellFits(page, '.journal-panel');
  await page.screenshot({ path: testInfo.outputPath('mobile-landscape-journal.png') });
  await page.locator('.journal-panel > [data-close]').tap();

  await page.getByRole('button', { name: /地图/ }).tap();
  await expectEveryElementInViewport(
    page,
    '.map-panel h2, .map-panel .map-drawing, .map-panel > [data-close]',
  );
  await expectPanelShellFits(page, '.map-panel');
  await page.screenshot({ path: testInfo.outputPath('mobile-landscape-map.png') });
  await page.locator('.map-panel > [data-close]').tap();

  await page.getByRole('button', { name: '暂停游戏' }).tap();
  await expect(page.getByRole('heading', { name: '暂停' })).toBeVisible();
  await expectEveryElementInViewport(
    page,
    '.pause-panel h2, .pause-panel select, .pause-panel [data-close], .pause-panel [data-title]',
  );
  await expectPanelShellFits(page, '.pause-panel');
  const settingsBox = await page.locator('.pause-panel > fieldset').boundingBox();
  const clearDataBox = await page.locator('.pause-panel .clear-data').boundingBox();
  expect(clearDataBox?.height).toBeLessThan(settingsBox?.height ?? 0);
  expect(clearDataBox?.width).toBeLessThan(settingsBox?.width ?? 0);
  await expect(page.getByRole('button', { name: '清除本地数据' })).toBeHidden();
  await page.getByText('本地数据', { exact: true }).click();
  await expect(page.getByRole('button', { name: '清除本地数据' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('mobile-landscape-pause-panel.png') });
});

test('pauses in portrait and requires an explicit resume after rotating back', async ({ page }) => {
  await startNewGame(page);
  await finishOpeningDialogue(page);
  await page.setViewportSize({ width: 390, height: 844 });

  await expect(page.getByRole('heading', { name: '请旋转至横屏' })).toBeVisible();
  await expect(page.locator('#app')).toHaveAttribute('data-modal', 'pause');

  await page.setViewportSize({ width: 780, height: 360 });
  await expect(page.getByRole('heading', { name: '请旋转至横屏' })).toBeHidden();
  await expect(page.getByRole('heading', { name: '暂停' })).toBeVisible();
  await page.getByRole('button', { name: '继续', exact: true }).tap();
  await expect(page.getByRole('heading', { name: '暂停' })).toBeHidden();
});

test('applies D3 mapping and completes the default hold ending by touch', async ({
  page,
}, testInfo) => {
  await startNewGame(page);
  await finishOpeningDialogue(page);
  await page.addInitScript(() => {
    const record = JSON.parse(localStorage.getItem('erasure.save.slot.1.v1') ?? 'null');
    Object.assign(record.state, {
      phase: 'playing',
      chapterId: 'return',
      checkpointId: 'checkpoint.return.junction_1',
      degradationStage: 'D3',
      objective: '理解新的方向，沿着仍可靠的线索回家',
      player: { x: 640, y: 360, facing: 'up', moving: false },
      flags: ['flag.return.mapping_learned'],
      dialogue: [],
      dialogueIndex: 0,
      modal: null,
    });
    localStorage.setItem('erasure.save.slot.1.v1', JSON.stringify(record));
  });
  await page.reload();
  await page.getByRole('button', { name: '继续游戏' }).tap();
  await expect(page.locator('canvas')).toHaveAttribute('data-scene-ready', 'true');
  await page.screenshot({ path: testInfo.outputPath('mobile-landscape-d3.png') });
  const beforeY = Number(await page.locator('#app').getAttribute('data-player-y'));
  const beforeX = Number(await page.locator('#app').getAttribute('data-player-x'));
  const up = page.getByRole('button', { name: '向上移动' });
  await up.dispatchEvent('pointerdown', { pointerId: 21, pointerType: 'touch' });
  await page.waitForTimeout(250);
  await up.dispatchEvent('pointerup', { pointerId: 21, pointerType: 'touch' });
  await expect
    .poll(async () => Number(await page.locator('#app').getAttribute('data-player-x')))
    .toBeGreaterThan(beforeX);
  expect(Number(await page.locator('#app').getAttribute('data-player-y'))).toBe(beforeY);

  await page.addInitScript(() => {
    const record = JSON.parse(localStorage.getItem('erasure.save.slot.1.v1') ?? 'null');
    Object.assign(record.state, {
      chapterId: 'ending',
      checkpointId: 'checkpoint.ending.start',
      degradationStage: 'D4',
      objective: '握住她的手',
      player: { x: 920, y: 480, facing: 'left', moving: false },
      flags: ['ending.dialogue_started', 'ending.ready_to_hold'],
      dialogue: [],
      dialogueIndex: 0,
      modal: null,
      holdProgress: 0,
    });
    localStorage.setItem('erasure.save.slot.1.v1', JSON.stringify(record));
  });
  await page.reload();
  await page.getByRole('button', { name: '继续游戏' }).tap();
  await expect(page.locator('canvas')).toHaveAttribute('data-scene-ready', 'true');
  await page.screenshot({ path: testInfo.outputPath('mobile-landscape-d4.png') });
  const confirm = page.locator('[data-touch-action="interact"]');
  await expect(confirm).toHaveText('牵手');
  await expect(confirm).toHaveAttribute('aria-label', '按住牵手');
  await confirm.dispatchEvent('pointerdown', { pointerId: 22, pointerType: 'touch' });
  await expect(page.locator('#app')).toHaveAttribute('data-hold-progress', '100');
  await confirm.dispatchEvent('pointerup', { pointerId: 22, pointerType: 'touch' });
});
