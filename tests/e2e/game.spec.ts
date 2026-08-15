import { expect, test } from '@playwright/test';
import { continueLatestGame, gotoGame, startNewGame } from './helpers/game-navigation';

let browserErrors: string[];

const OBSERVATION_SAMPLE_RADIUS = 224;
const OBSERVATION_SAMPLE_STEP = 4;
const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;

test.beforeEach(async ({ page }, testInfo) => {
  browserErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error')
      browserErrors.push(`${message.text()}\n${JSON.stringify(message.location())}`);
  });
  page.on('pageerror', (error) => browserErrors.push(error.stack ?? error.message));
  await page.addInitScript(() => {
    const initializedKey = 'erasure.e2e.storage-initialized';
    if (sessionStorage.getItem(initializedKey)) return;
    localStorage.clear();
    sessionStorage.setItem(initializedKey, 'true');
  });
  const initialPath = testInfo.title.includes('development debug layer') ? '/?debug=1' : '/';
  await gotoGame(page, initialPath);
});

test.afterEach(() => {
  expect(browserErrors).toEqual([]);
});

test('uses the system locale by default and applies a persisted manual override immediately', async ({
  page,
}) => {
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.getByRole('heading', { name: '记忆的缝隙' })).toBeVisible();
  await expect(page.getByText('选择语言', { exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: '设置' }).click();
  const locale = page.locator('[data-setting="localePreference"]');
  await expect(locale).toHaveValue('system');

  await locale.selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { name: 'Sound and accessibility' })).toBeVisible();
  await expect(page).toHaveTitle('The Erasure of Me');
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { name: '记忆的缝隙' })).toBeVisible();
  await page.getByRole('button', { name: 'Settings' }).click();

  await page.locator('[data-setting="localePreference"]').selectOption('zh-HK');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-HK');
  await expect(page.getByRole('heading', { name: '聲音與無障礙' })).toBeVisible();
  await expect(page).toHaveTitle('記憶的縫隙');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-HK');
  await expect(page.getByRole('heading', { name: '聲音與無障礙' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '記憶的縫隙' })).toBeVisible();
  await page.getByRole('button', { name: '設定' }).click();
  await page.locator('[data-setting="localePreference"]').selectOption('system');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
});

test('advances dialogue from the playfield without treating holds or drags as clicks', async ({
  page,
}) => {
  await startNewGame(page);
  await expect(page.getByText(/已自动保存/)).toHaveCount(0);
  await expect(page.locator('.observation-hint')).toHaveCount(0);
  const advance = page.getByRole('button', { name: '继续对白' });
  const line = page.locator('.dialogue-text');
  const firstLine = await line.textContent();

  await page.mouse.click(24, 240);
  await expect(line).not.toHaveText(firstLine ?? '');
  const secondLine = await line.textContent();

  await page.mouse.move(36, 220);
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
  await expect(line).toHaveText(secondLine ?? '');

  await page.mouse.move(36, 220);
  await page.mouse.down();
  await page.mouse.move(96, 220, { steps: 3 });
  await page.mouse.up();
  await expect(line).toHaveText(secondLine ?? '');

  await advance.focus();
  await advance.press('e');
  await expect(advance).toBeHidden();
});

test('boots, starts, moves by keyboard, pauses and keeps accessibility stable', async ({
  page,
}) => {
  await expect(page.getByRole('heading', { name: '记忆的缝隙' })).toBeVisible();
  await expect(page.getByText('许志远是虚构人物')).toBeVisible();

  await startNewGame(page);
  await page.getByRole('button', { name: '继续对白' }).click();
  await page.getByRole('button', { name: '继续对白' }).click();

  const app = page.locator('#app');
  await expect(app).toHaveAttribute('data-chapter', 'home');
  const canvas = page.locator('canvas[aria-label="可操作游戏画面"]');
  await expect(canvas).toHaveAttribute('data-scene-ready', 'true');
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
  await startNewGame(page);
  await page.getByRole('button', { name: '继续对白' }).click();
  await page.getByRole('button', { name: '继续对白' }).click();

  const app = page.locator('#app');
  const canvas = page.locator('canvas[aria-label="可操作游戏画面"]');
  await expect(canvas).toHaveAttribute('data-scene-ready', 'true');
  await expect(canvas).toHaveAttribute('data-camera-fade-running', 'false');
  await expect(app).toHaveAttribute('data-player-x', /^\d+$/);
  await expect(app).toHaveAttribute('data-player-y', /^\d+$/);
  const player = {
    x: Number(await app.getAttribute('data-player-x')),
    y: Number(await app.getAttribute('data-player-y')),
  };
  const sampleCanvas = (radius = OBSERVATION_SAMPLE_RADIUS) =>
    canvas.evaluate(
      (element, { center, sampleRadius, step, offsetBasis, prime }) => {
        const canvasElement = element as HTMLCanvasElement;
        const context = canvasElement.getContext('2d');
        if (!context) throw new Error('Canvas 2D context is unavailable');
        const left = Math.max(0, Math.floor(center.x - sampleRadius));
        const top = Math.max(0, Math.floor(center.y - sampleRadius));
        const right = Math.min(canvasElement.width, Math.ceil(center.x + sampleRadius));
        const bottom = Math.min(canvasElement.height, Math.ceil(center.y + sampleRadius));
        const image = context.getImageData(left, top, right - left, bottom - top).data;
        let hash = offsetBasis;
        for (let index = 0; index < image.length; index += step * 4) {
          hash ^= image[index];
          hash = Math.imul(hash, prime);
          hash ^= image[index + 1];
          hash = Math.imul(hash, prime);
          hash ^= image[index + 2];
          hash = Math.imul(hash, prime);
          hash ^= image[index + 3];
          hash = Math.imul(hash, prime);
        }
        return hash >>> 0;
      },
      {
        center: player,
        sampleRadius: radius,
        step: OBSERVATION_SAMPLE_STEP,
        offsetBasis: FNV_OFFSET_BASIS,
        prime: FNV_PRIME,
      },
    );
  const changed = (first: number, second: number) => first !== second;

  await canvas.focus();
  await page.keyboard.down('Shift');
  await expect(canvas).toHaveAttribute('data-observation-active', 'true');
  await page.waitForTimeout(90);
  const standardFirst = await sampleCanvas();
  await expect
    .poll(async () => changed(standardFirst, await sampleCanvas()), { timeout: 4000 })
    .toBe(true);
  await canvas.press('ArrowRight');
  await expect(canvas).toHaveAttribute('data-observation-active', 'false');
  await page.keyboard.up('Shift');
  await expect(canvas).toHaveAttribute('data-observation-active', 'false');

  await canvas.press('Escape');
  await page.getByLabel('减少动态效果').check();
  await page.getByRole('button', { name: '继续' }).click();
  await expect(canvas).toHaveAttribute('data-scene-ready', 'true');
  await expect(canvas).toHaveAttribute('data-camera-fade-running', 'false');
  await canvas.focus();
  await page.keyboard.down('Shift');
  await expect(canvas).toHaveAttribute('data-observation-active', 'true');
  await expect(canvas).toHaveAttribute('data-player-pose', /^character\.xu_old\.observe\./);
  await expect(canvas).toHaveAttribute('data-player-pose-frame', '2');
  const reducedFirst = await canvas.getAttribute('data-player-pose-frame');
  await page.waitForTimeout(320);
  const reducedSecond = await canvas.getAttribute('data-player-pose-frame');
  await page.keyboard.up('Shift');
  await expect(canvas).toHaveAttribute('data-observation-active', 'false');
  await expect(canvas).toHaveAttribute('data-player-pose', /^character\.xu_old\.idle\./);
  await expect(canvas).toHaveAttribute('data-player-pose-frame', '0');

  expect(reducedFirst).toBe('2');
  expect(reducedSecond).toBe(reducedFirst);
});

test('shows a restrained nearby interaction prompt and keeps reduced-motion hover static', async ({
  page,
}, testInfo) => {
  await startNewGame(page);
  await page.getByRole('button', { name: '继续对白' }).click();
  await page.getByRole('button', { name: '继续对白' }).click();

  const app = page.locator('#app');
  const canvas = page.locator('canvas[aria-label="可操作游戏画面"]');
  await expect(canvas).toHaveAttribute('data-scene-ready', 'true');
  await canvas.focus();
  await canvas.press('Escape');
  await page.getByLabel('减少动态效果').check();
  await page.getByRole('button', { name: '继续' }).click();
  await canvas.focus();

  for (let step = 0; step < 8; step += 1) await canvas.press('ArrowUp');
  for (let step = 0; step < 6; step += 1) await canvas.press('ArrowRight');
  expect(Number(await app.getAttribute('data-player-y'))).toBeLessThan(250);
  expect(Number(await app.getAttribute('data-player-x'))).toBeGreaterThan(220);

  const prompt = page.getByRole('button', { name: '与床边合影交互' });
  await expect(prompt).toBeVisible();

  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  const resting = await canvas.screenshot();
  await page.mouse.move(
    bounds!.x + (280 / 1280) * bounds!.width,
    bounds!.y + (160 / 720) * bounds!.height,
  );
  await page.waitForTimeout(40);
  const hovered = await canvas.screenshot({ path: testInfo.outputPath('interaction-hover.png') });
  await page.waitForTimeout(240);
  const hoveredLater = await canvas.screenshot();
  expect(hovered.equals(resting)).toBe(false);
  expect(hoveredLater.equals(hovered)).toBe(true);

  await prompt.click();
  await expect(page.getByText('照片里，我们站在一把红伞下面。')).toBeVisible();
  await expect(prompt).toHaveCount(0);
});

test('offers a safe checkpoint continuation after refresh', async ({ page }) => {
  await startNewGame(page, { mode: 'low_stimulation' });
  await expect(page.locator('#app')).toHaveAttribute('data-checkpoint', 'checkpoint.home.start');
  await expect(page.locator('canvas')).toHaveAttribute('data-scene-ready', 'true');
  await page.reload();
  await expect(page.locator('canvas')).toHaveAttribute('data-scene-ready', 'true');
  await expect(page.getByRole('button', { name: '继续游戏' })).toBeEnabled();
  await continueLatestGame(page);
  await expect(page.locator('#app')).toHaveAttribute('data-chapter', 'home');
});

test('places a stable pause layer over active dialogue when the window loses focus', async ({
  page,
}) => {
  await startNewGame(page);
  await expect(page.getByRole('button', { name: '继续对白' })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.getByRole('heading', { name: '暂停' })).toBeVisible();
  await page.getByRole('button', { name: '继续' }).click();
  await expect(page.getByRole('button', { name: '继续对白' })).toBeVisible();
});

test('does not expose the development debug layer in a production build', async ({ page }) => {
  await startNewGame(page);
  await page.getByRole('button', { name: '继续对白' }).click();
  await page.getByRole('button', { name: '继续对白' }).click();
  await expect(page.getByLabel('开发调试层')).toHaveCount(0);
});
