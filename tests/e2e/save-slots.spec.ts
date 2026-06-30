import { expect, test, type Page } from '@playwright/test';
import { continueLatestGame, startNewGame } from './helpers/game-navigation';

const slotKey = (slotId: number) => `erasure.save.slot.${slotId}.v1`;

let browserErrors: string[];

test.beforeEach(async ({ page }) => {
  browserErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.stack ?? error.message));
  await page.addInitScript(() => {
    const initializedKey = 'erasure.e2e.save-slots-initialized';
    if (sessionStorage.getItem(initializedKey)) return;
    localStorage.clear();
    sessionStorage.setItem(initializedKey, 'true');
  });
  await page.goto('/');
  await expect(page.locator('canvas')).toHaveAttribute('data-scene-ready', 'true');
});

test.afterEach(() => {
  expect(browserErrors).toEqual([]);
});

async function finishOpeningDialogue(page: Page): Promise<void> {
  for (let index = 0; index < 2; index += 1) {
    await page.getByRole('button', { name: '继续对白' }).click();
  }
}

async function returnToTitle(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.getByRole('heading', { name: '暂停' })).toBeVisible();
  await page.getByRole('button', { name: '返回标题' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'title');
}

test('shows four compact home actions and disables continue without a valid memory', async ({
  page,
}) => {
  const menu = page.getByRole('navigation', { name: '主菜单' });
  await expect(menu.getByRole('button')).toHaveCount(4);
  await expect(menu.getByRole('button', { name: /继续游戏/ })).toBeDisabled();
  await expect(menu.getByRole('button', { name: /开始游戏/ })).toBeEnabled();
  await expect(menu.getByRole('button', { name: /读取记忆/ })).toBeEnabled();
  await expect(menu.getByRole('button', { name: /设置/ })).toBeEnabled();
  await expect(page.locator('.memory-fragment')).toHaveCount(0);

  await menu.getByRole('button', { name: /设置/ }).click();
  await expect(page.getByRole('heading', { name: '声音与无障碍' })).toBeVisible();
  await expect(page.getByLabel('减少动态效果')).toBeVisible();
  await page.getByRole('button', { name: '返回首页' }).click();
  await expect(menu).toBeVisible();
});

test('starts through mode, memory, and the empty-fragment confirmation', async ({ page }) => {
  await page.getByRole('button', { name: /开始游戏/ }).click();
  await page.getByRole('button', { name: /低扰动模式/ }).click();
  await page.getByRole('button', { name: /记忆片段 01.*空白的记忆/ }).click();
  const dialog = page.getByRole('dialog', { name: '要从这个空白的记忆片段开始吗？' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '开始' }).click();

  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'playing');
  await expect
    .poll(() =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) ?? 'null')?.state?.mode,
        slotKey(1),
      ),
    )
    .toBe('low_stimulation');
  await finishOpeningDialogue(page);
  await page.locator('canvas').focus();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: '暂停' })).toBeVisible();
  await expect(page.getByRole('button', { name: '立即保存' })).toHaveCount(0);
  await expect(page.locator('.current-save')).toHaveCount(0);
});

test('continues the most recent memory and only replaces the selected fragment', async ({
  page,
}) => {
  await startNewGame(page, { slotId: 1 });
  await finishOpeningDialogue(page);
  await returnToTitle(page);
  await startNewGame(page, { mode: 'low_stimulation', slotId: 2 });
  await finishOpeningDialogue(page);
  await returnToTitle(page);

  await continueLatestGame(page);
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'playing');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.getByRole('heading', { name: '暂停' })).toBeVisible();
  await expect(page.getByLabel('体验模式')).toHaveValue('low_stimulation');
  await page.getByRole('button', { name: '返回标题' }).click();

  const secondBefore = await page.evaluate((key) => localStorage.getItem(key), slotKey(2));
  await page.getByRole('button', { name: /开始游戏/ }).click();
  await page.getByRole('button', { name: /标准模式/ }).click();
  await page.getByRole('button', { name: /记忆片段 01/ }).click();
  const dialog = page.getByRole('dialog', {
    name: '要覆盖「记忆片段 01」并从头开始吗？',
  });
  await expect(dialog).toContainText('这个记忆片段中已有的进度将被新的故事替代。');
  await dialog.getByRole('button', { name: '覆盖并开始' }).click();
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), slotKey(2)))
    .toBe(secondBefore);
});

test('reads, labels, and deletes memories with keyboard controls on a narrow viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 520, height: 720 });
  await startNewGame(page);
  await finishOpeningDialogue(page);
  await returnToTitle(page);
  await page.evaluate((key) => localStorage.setItem(key, '{broken-json'), slotKey(2));
  await page.getByRole('button', { name: /读取记忆/ }).click();

  await expect(page.getByText('记忆片段 01')).toBeVisible();
  await expect(page.getByText(/第一章 · 清晨的家/)).toBeVisible();
  await expect(page.getByText(/\d{4}\/\d{2}\/\d{2}.*\d{2}:\d{2}/)).toBeVisible();
  await expect(page.getByText('模糊的记忆')).toBeVisible();
  await expect(page.getByText('空白的记忆')).toBeVisible();

  const damaged = page.locator('.memory-fragment.invalid');
  const deleteButton = damaged.getByRole('button', { name: '删除' });
  await deleteButton.focus();
  await deleteButton.press('Enter');
  const confirm = page.getByRole('button', { name: '确认删除' });
  await expect(confirm).toBeFocused();
  await confirm.press('Enter');
  await expect(page.getByText('空白的记忆')).toHaveCount(2);

  await page.locator('.memory-fragment.valid').getByRole('button', { name: '读取' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'playing');
  const width = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    viewport: innerWidth,
  }));
  expect(width.body).toBeLessThanOrEqual(width.viewport);
});

test('automatically saves the current position on pause, return, and page unload', async ({
  page,
}) => {
  await startNewGame(page);
  await finishOpeningDialogue(page);
  const canvas = page.locator('canvas');
  await canvas.focus();
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(160);
  await page.keyboard.up('ArrowRight');
  const movedX = Number(await page.locator('#app').getAttribute('data-player-x'));

  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.getByRole('heading', { name: '暂停' })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) ?? 'null')?.state?.player?.x,
        slotKey(1),
      ),
    )
    .toBeGreaterThanOrEqual(movedX - 1);
  await page.getByRole('button', { name: '继续' }).click();

  await page.reload();
  await continueLatestGame(page);
  expect(Number(await page.locator('#app').getAttribute('data-player-x'))).toBeGreaterThanOrEqual(
    movedX - 1,
  );
  await returnToTitle(page);
  await expect(page.getByRole('button', { name: /继续游戏/ })).toBeEnabled();
});

test('clears all memories, global settings, and the ignored legacy save after confirmation', async ({
  page,
}) => {
  await startNewGame(page);
  await finishOpeningDialogue(page);
  await page.evaluate(() => localStorage.setItem('erasure.save.v1', '{legacy-save}'));
  await page.locator('canvas').press('Escape');
  await page.getByRole('button', { name: '清除本地数据' }).click();
  await page.getByRole('button', { name: '确认清除本地数据' }).click();

  await expect(page.getByRole('button', { name: /继续游戏/ })).toBeDisabled();
  await page.getByRole('button', { name: /读取记忆/ }).click();
  await expect(page.getByText('空白的记忆')).toHaveCount(3);
  const remaining = await page.evaluate(() => ({
    slots: [1, 2, 3].map((slotId) => localStorage.getItem(`erasure.save.slot.${slotId}.v1`)),
    settings: localStorage.getItem('erasure.settings.v1'),
    legacy: localStorage.getItem('erasure.save.v1'),
  }));
  expect(remaining).toEqual({ slots: [null, null, null], settings: null, legacy: null });
});
