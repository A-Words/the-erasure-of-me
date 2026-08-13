import { expect, test, type Page } from '@playwright/test';
import { startNewGame } from './helpers/game-navigation';

async function finishOpeningDialogue(page: Page): Promise<void> {
  const confirm = page.getByRole('button', { name: '交互或确认' });
  while (await page.getByRole('button', { name: '继续对白' }).isVisible()) {
    await confirm.tap();
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
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
  await page.screenshot({ path: testInfo.outputPath('mobile-landscape-pause.png') });
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
  const confirm = page.getByRole('button', { name: '交互或确认' });
  await confirm.dispatchEvent('pointerdown', { pointerId: 22, pointerType: 'touch' });
  await expect(page.locator('#app')).toHaveAttribute('data-hold-progress', '100');
  await confirm.dispatchEvent('pointerup', { pointerId: 22, pointerType: 'touch' });
});
