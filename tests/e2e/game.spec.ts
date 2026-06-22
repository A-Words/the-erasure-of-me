import { expect, test } from '@playwright/test';

let browserErrors: string[];

test.beforeEach(async ({ page }) => {
  browserErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test.afterEach(() => {
  expect(browserErrors).toEqual([]);
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
  expect(Number(await app.getAttribute('data-player-x'))).toBeGreaterThan(180);

  await canvas.press('Escape');
  await expect(page.getByRole('heading', { name: '暂停' })).toBeVisible();
  await expect(page.getByRole('group', { name: '音量混音' })).toBeVisible();
  await page.getByLabel('音乐').fill('0.25');
  await expect(page.getByLabel('音乐')).toHaveValue('0.25');
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

test('places a stable pause layer over active dialogue when the window loses focus', async ({
  page,
}) => {
  await page.getByRole('button', { name: /标准模式/ }).click();
  await expect(page.getByRole('button', { name: '继续对白' })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.getByRole('heading', { name: '暂停' })).toBeVisible();
  await page.getByRole('button', { name: '继续' }).click();
  await expect(page.getByRole('button', { name: '继续对白' })).toBeVisible();
});

test('does not expose the development debug layer in a production build', async ({ page }) => {
  await page.goto('/?debug=1');
  await page.getByRole('button', { name: /标准模式/ }).click();
  await page.getByRole('button', { name: '继续对白' }).click();
  await page.getByRole('button', { name: '继续对白' }).click();
  await expect(page.getByLabel('开发调试层')).toHaveCount(0);
});
