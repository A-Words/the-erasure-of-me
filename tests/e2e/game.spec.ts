import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('boots, starts, moves by keyboard, pauses and keeps accessibility stable', async ({
  page,
}) => {
  await expect(page.getByRole('heading', { name: '记忆的缝隙' })).toBeVisible();
  await expect(page.getByText('许志远是虚构人物')).toBeVisible();

  await page.getByRole('button', { name: /标准模式/ }).click();
  await page.getByRole('button', { name: '继续对白' }).click();
  await page.getByRole('button', { name: '继续对白' }).click();

  const app = page.locator('#app');
  await expect(app).toHaveAttribute('data-chapter', 'home');
  const canvas = page.locator('canvas[aria-label="可操作游戏画面"]');
  await canvas.focus();
  await canvas.press('ArrowRight');
  await expect(app).toHaveAttribute('data-player-x', '192');

  await canvas.press('Escape');
  await expect(page.getByRole('heading', { name: '暂停' })).toBeVisible();
  await page.getByLabel('减少动态效果').check();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
});

test('offers a safe checkpoint continuation after refresh', async ({ page }) => {
  await page.getByRole('button', { name: /低扰动模式/ }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-checkpoint', 'checkpoint.home.start');
  await page.reload();
  await expect(page.getByRole('button', { name: '从最近的安全位置继续' })).toBeVisible();
  await page.getByRole('button', { name: '从最近的安全位置继续' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-chapter', 'home');
});
