import { expect, test, type Page } from '@playwright/test';

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

async function startStandardGame(page: Page): Promise<void> {
  await page.getByRole('button', { name: /标准模式/ }).click();
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), slotKey(1)))
    .not.toBeNull();
}

test('allocates empty slots in order and supports a manual save from pause', async ({ page }) => {
  await startStandardGame(page);
  const firstSavedAt = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? 'null')?.savedAt,
    slotKey(1),
  );

  for (let index = 0; index < 2; index += 1) {
    await page.getByRole('button', { name: '继续对白' }).click();
  }
  await page.locator('canvas').press('Escape');
  await expect(page.getByRole('heading', { name: '暂停' })).toBeVisible();
  await page.waitForTimeout(20);
  await page.getByRole('button', { name: '立即保存' }).click();
  await expect(page.locator('.current-save [role="status"]')).toHaveText('已保存 · 存档 1');
  const manualSavedAt = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? 'null')?.savedAt,
    slotKey(1),
  );
  expect(Date.parse(manualSavedAt)).toBeGreaterThanOrEqual(Date.parse(firstSavedAt));

  await page.getByRole('button', { name: '返回标题' }).click();
  await page.getByRole('button', { name: /低扰动模式/ }).click();
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), slotKey(2)))
    .not.toBeNull();
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), slotKey(1)))
    .not.toBeNull();
});

test('requires an explicit slot choice before overwriting three full slots', async ({ page }) => {
  await startStandardGame(page);
  await page.evaluate(
    ({ first, second, third }) => {
      const record = localStorage.getItem(first);
      if (!record) throw new Error('Expected the first slot to exist');
      localStorage.setItem(second, record);
      localStorage.setItem(third, record);
    },
    { first: slotKey(1), second: slotKey(2), third: slotKey(3) },
  );
  await page.waitForLoadState('networkidle');
  await page.reload();

  await page.getByRole('button', { name: /低扰动模式/ }).click();
  const dialog = page.getByRole('dialog', { name: '选择要覆盖的存档' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /确认覆盖存档 2/ }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'playing');
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const record = JSON.parse(localStorage.getItem(key) ?? 'null');
        return record?.state?.mode;
      }, slotKey(2)),
    )
    .toBe('low_stimulation');
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), slotKey(1)))
    .not.toBeNull();
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), slotKey(3)))
    .not.toBeNull();
});

test('isolates and deletes a damaged slot with keyboard controls on a narrow viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 520, height: 720 });
  await page.evaluate((key) => {
    localStorage.setItem(key, '{broken-json');
    localStorage.setItem('erasure.settings.v1', JSON.stringify({ fontSize: 'large' }));
  }, slotKey(2));
  await page.waitForLoadState('networkidle');
  await page.reload();

  const deleteButton = page.getByRole('button', { name: '删除损坏存档' });
  await deleteButton.focus();
  await deleteButton.press('Enter');
  const confirm = page.getByRole('button', { name: '确认删除' });
  await expect(confirm).toBeFocused();
  await confirm.press('Enter');

  await expect(page.locator('.save-slot.empty').filter({ hasText: '存档 2' })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), slotKey(2))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('erasure.settings.v1'))).not.toBeNull();
  const width = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    viewport: innerWidth,
  }));
  expect(width.body).toBeLessThanOrEqual(width.viewport);
});

test('clears all slots, global settings, and the ignored legacy save after confirmation', async ({
  page,
}) => {
  await startStandardGame(page);
  for (let index = 0; index < 2; index += 1) {
    await page.getByRole('button', { name: '继续对白' }).click();
  }
  await page.evaluate(() => localStorage.setItem('erasure.save.v1', '{legacy-save}'));
  await page.locator('canvas').press('Escape');
  await page.getByRole('button', { name: '清除本地数据' }).click();
  await page.getByRole('button', { name: '确认清除本地数据' }).click();

  await expect(page.locator('.save-slot.empty')).toHaveCount(3);
  const remaining = await page.evaluate(() => ({
    slots: [1, 2, 3].map((slotId) => localStorage.getItem(`erasure.save.slot.${slotId}.v1`)),
    settings: localStorage.getItem('erasure.settings.v1'),
    legacy: localStorage.getItem('erasure.save.v1'),
  }));
  expect(remaining).toEqual({ slots: [null, null, null], settings: null, legacy: null });
});
