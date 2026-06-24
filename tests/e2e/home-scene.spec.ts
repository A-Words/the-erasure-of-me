import { expect, test } from '@playwright/test';

async function setSavedPlayer(page: import('@playwright/test').Page, x: number, y: number) {
  await page.evaluate(
    ({ x, y }) => {
      const key = 'erasure.save.v1';
      const state = JSON.parse(localStorage.getItem(key) ?? 'null');
      if (!state) throw new Error('Expected a home save before moving the player');
      state.player = { x, y, facing: 'down', moving: false };
      state.dialogue = [];
      state.modal = null;
      localStorage.setItem(key, JSON.stringify(state));
    },
    { x, y },
  );
  await page.reload();
  await page.getByRole('button', { name: '从最近的安全位置继续' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-chapter', 'home');
}

test('renders the layered home and blocks the player at the bed footprint', async ({
  page,
}, testInfo) => {
  const browserErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.stack ?? error.message));

  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: /标准模式/ }).click();
  await page.getByRole('button', { name: '继续对白' }).click();
  await page.getByRole('button', { name: '继续对白' }).click();

  const app = page.locator('#app');
  const canvas = page.locator('canvas[aria-label="可操作游戏画面"]');
  await expect(app).toHaveAttribute('data-chapter', 'home');
  await expect(canvas).toBeVisible();
  await canvas.screenshot({ path: testInfo.outputPath('home-layered-scene.png') });

  await setSavedPlayer(page, 170, 310);
  await canvas.focus();
  for (let step = 0; step < 8; step += 1) await canvas.press('ArrowUp');
  const stoppedY = Number(await app.getAttribute('data-player-y'));
  for (let step = 0; step < 4; step += 1) await canvas.press('ArrowUp');

  expect(Number(await app.getAttribute('data-player-y'))).toBe(stoppedY);
  expect(stoppedY).toBeGreaterThanOrEqual(290);

  await setSavedPlayer(page, 700, 520);
  const behindTable = await canvas.screenshot({
    path: testInfo.outputPath('home-player-behind-table.png'),
  });
  await setSavedPlayer(page, 700, 630);
  const inFrontOfTable = await canvas.screenshot({
    path: testInfo.outputPath('home-player-in-front-of-table.png'),
  });
  expect(behindTable.equals(inFrontOfTable)).toBe(false);

  await setSavedPlayer(page, 1130, 360);
  await expect(page.getByRole('button', { name: '与玄关门交互' })).toBeVisible();
  await canvas.screenshot({ path: testInfo.outputPath('home-right-wall-door.png') });
  expect(browserErrors).toEqual([]);
});
