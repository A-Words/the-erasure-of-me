import { expect, test } from '@playwright/test';

let browserErrors: string[];

test.beforeEach(async ({ page }) => {
  browserErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error')
      browserErrors.push(`${message.text()}\n${JSON.stringify(message.location())}`);
  });
  page.on('pageerror', (error) => browserErrors.push(error.stack ?? error.message));
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

test('animates observation while held and uses a static reduced-motion pose', async ({ page }) => {
  await page.getByRole('button', { name: /标准模式/ }).click();
  await page.getByRole('button', { name: '继续对白' }).click();
  await page.getByRole('button', { name: '继续对白' }).click();

  const app = page.locator('#app');
  const canvas = page.locator('canvas[aria-label="可操作游戏画面"]');
  const playerX = Number(await app.getAttribute('data-player-x'));
  const playerY = Number(await app.getAttribute('data-player-y'));
  const samplePlayer = () =>
    page.evaluate(
      ({ x, y }) => {
        const canvasElement = document.querySelector<HTMLCanvasElement>('canvas');
        const context = canvasElement?.getContext('2d');
        if (!context) throw new Error('Canvas 2D context is unavailable');
        return Array.from(context.getImageData(x - 40, y - 90, 80, 115).data);
      },
      { x: playerX, y: playerY },
    );
  const changedPixels = (first: number[], second: number[]) => {
    let changed = 0;
    for (let index = 0; index < first.length; index += 4) {
      if (
        first[index] !== second[index] ||
        first[index + 1] !== second[index + 1] ||
        first[index + 2] !== second[index + 2] ||
        first[index + 3] !== second[index + 3]
      )
        changed += 1;
    }
    return changed;
  };

  await canvas.focus();
  await page.keyboard.down('Shift');
  await page.waitForTimeout(90);
  const standardFirst = await samplePlayer();
  await page.waitForTimeout(240);
  const standardSecond = await samplePlayer();
  await page.keyboard.up('Shift');
  expect(changedPixels(standardFirst, standardSecond)).toBeGreaterThan(100);

  await canvas.press('Escape');
  await page.getByLabel('减少动态效果').check();
  await page.getByRole('button', { name: '继续' }).click();
  await canvas.focus();
  await page.keyboard.down('Shift');
  await page.waitForTimeout(90);
  const reducedFirst = await samplePlayer();
  await page.waitForTimeout(320);
  const reducedSecond = await samplePlayer();
  await page.keyboard.up('Shift');
  await page.waitForTimeout(90);
  const reducedIdle = await samplePlayer();

  expect(changedPixels(reducedFirst, reducedSecond)).toBe(0);
  expect(changedPixels(reducedSecond, reducedIdle)).toBeGreaterThan(100);
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
