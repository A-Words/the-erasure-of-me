import { writeFileSync } from 'node:fs';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

type ChapterId = 'home' | 'rain' | 'life' | 'return' | 'ending';

const chapterState: Record<
  ChapterId,
  {
    stage: string;
    checkpoint: string;
    objective: string;
    player: { x: number; y: number; facing: string };
  }
> = {
  home: {
    stage: 'D0',
    checkpoint: 'checkpoint.home.start',
    objective: '找到钥匙和秀兰留下的日记',
    player: { x: 310, y: 302, facing: 'down' },
  },
  rain: {
    stage: 'D1',
    checkpoint: 'checkpoint.rain.start',
    objective: '按 2 → 4 → 5 踩亮石板，再跟随红伞',
    player: { x: 100, y: 600, facing: 'up' },
  },
  life: {
    stage: 'D2',
    checkpoint: 'checkpoint.life.start',
    objective: '整理照片，并让三件生活物品回到原处',
    player: { x: 640, y: 590, facing: 'up' },
  },
  return: {
    stage: 'D3',
    checkpoint: 'checkpoint.return.training',
    objective: '理解新的方向，沿着仍可靠的线索回家',
    player: { x: 640, y: 360, facing: 'up' },
  },
  ending: {
    stage: 'D4',
    checkpoint: 'checkpoint.ending.start',
    objective: '走近秀兰',
    player: { x: 920, y: 430, facing: 'left' },
  },
};

async function createSave(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'title');
  await expect(page.locator('canvas')).toHaveAttribute('data-scene-ready', 'true');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: /标准模式/ }).click();
  for (let index = 0; index < 2; index += 1)
    await page.getByRole('button', { name: '继续对白' }).click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('erasure.save.v1')))
    .not.toBeNull();
}

async function loadChapter(
  page: Page,
  chapterId: ChapterId,
  patch: Record<string, unknown> = {},
): Promise<void> {
  const authored = chapterState[chapterId];
  await page.evaluate(
    ({ chapterId, authored, patch }) => {
      const key = 'erasure.save.v1';
      const state = JSON.parse(localStorage.getItem(key) ?? 'null');
      if (!state) throw new Error('Release screenshot seed save is missing');
      Object.assign(state, {
        phase: 'playing',
        chapterId,
        checkpointId: authored.checkpoint,
        degradationStage: authored.stage,
        objective: authored.objective,
        player: { ...authored.player, moving: false },
        modal: null,
        dialogue: [],
        dialogueIndex: 0,
        activeMemoryId: null,
        holdProgress: 0,
        message: null,
        ...patch,
      });
      if (patch.puzzles) state.puzzles = { ...state.puzzles, ...patch.puzzles };
      if (patch.settings) state.settings = { ...state.settings, ...patch.settings };
      localStorage.setItem(key, JSON.stringify(state));
    },
    { chapterId, authored, patch },
  );
  await page.reload();
  await page.getByRole('button', { name: '从最近的安全位置继续' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-chapter', chapterId);
  await expect(page.locator('canvas')).toHaveAttribute('data-scene-ready', 'true');
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForTimeout(120);
}

async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await expect(page.getByRole('main')).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath(`release-${name}.png`),
    fullPage: true,
    animations: 'disabled',
  });
}

for (const viewport of [
  { width: 1024, height: 576 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
]) {
  test(`captures D0-D4 and support screens at ${viewport.width}x${viewport.height}`, async ({
    page,
  }, testInfo) => {
    const browserErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') browserErrors.push(message.text());
    });
    page.on('pageerror', (error) => browserErrors.push(error.stack ?? error.message));
    await page.setViewportSize(viewport);
    await createSave(page);

    const performanceSample = await page.evaluate(
      () =>
        new Promise<{ averageFps: number; firstPlayBytes: number }>((resolve) => {
          const frameTimes: number[] = [];
          let previous = performance.now();
          const sample = (now: number) => {
            frameTimes.push(now - previous);
            previous = now;
            if (frameTimes.length < 90) {
              requestAnimationFrame(sample);
              return;
            }
            const averageFrameTime =
              frameTimes.slice(1).reduce((sum, value) => sum + value, 0) / (frameTimes.length - 1);
            const firstPlayBytes = performance
              .getEntriesByType('resource')
              .map((entry) => entry as PerformanceResourceTiming)
              .reduce(
                (sum, entry) =>
                  sum + Math.max(entry.transferSize, entry.encodedBodySize, entry.decodedBodySize),
                0,
              );
            resolve({ averageFps: 1000 / averageFrameTime, firstPlayBytes });
          };
          requestAnimationFrame(sample);
        }),
    );
    expect(performanceSample.averageFps).toBeGreaterThanOrEqual(30);
    expect(performanceSample.firstPlayBytes).toBeLessThanOrEqual(15 * 1024 * 1024);
    const performancePath = testInfo.outputPath('performance-budget.json');
    writeFileSync(performancePath, JSON.stringify({ viewport, ...performanceSample }, null, 2));
    await testInfo.attach('performance-budget', {
      path: performancePath,
      contentType: 'application/json',
    });

    await capture(page, testInfo, 'd0-home');

    await loadChapter(page, 'rain', {
      flags: ['degradation.d1.started'],
      puzzles: { stationSequence: [2, 4], rainSigns: ['shape.circle', 'texture.ribbed'] },
    });
    await capture(page, testInfo, 'd1-rain');

    await loadChapter(page, 'life', {
      inventory: ['item.life.wood_comb', 'item.life.enamel_cup', 'item.life.cassette'],
      flags: ['degradation.d2.started'],
      puzzles: { photoOrder: ['photo.1979', 'photo.1992', 'photo.2001'] },
    });
    await page.locator('canvas').focus();
    await page.keyboard.down('i');
    await page.waitForTimeout(120);
    await page.keyboard.up('i');
    await expect(page.getByRole('heading', { name: '背包' })).toBeVisible();
    await capture(page, testInfo, 'd2-inventory');
    await page.getByRole('button', { name: /关闭/ }).click();

    await loadChapter(page, 'return', {
      flags: ['degradation.d3.started'],
      message: '方向关系已经改变，但暂停、字幕和退出始终保持不变。',
    });
    await capture(page, testInfo, 'd3-training');

    await loadChapter(page, 'return', {
      flags: ['degradation.d3.started', 'flag.return.mapping_learned'],
      puzzles: { returnJunction: 2, returnPrefix: ['up', 'left'] },
      hintLevel: 2,
      message: '地上有一对浅浅的脚印。有人走过，也有人在等我。',
    });
    await capture(page, testInfo, 'd3-third-junction');

    await loadChapter(page, 'ending', {
      flags: ['ending.dialogue_started', 'ending.ready_to_hold'],
      message: '按住 E / Enter，握住她的手。',
    });
    await capture(page, testInfo, 'd4-before-handhold');

    await page.locator('canvas').focus();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: '暂停' })).toBeVisible();
    await capture(page, testInfo, 'pause');
    await page.getByLabel('减少动态效果').check();
    await page.getByLabel('体验模式').selectOption('low_stimulation');
    await page.getByLabel('体验模式').scrollIntoViewIfNeeded();
    await capture(page, testInfo, 'low-stimulation-settings');
    await page.getByRole('button', { name: '继续' }).click();

    await page.evaluate(() => {
      const key = 'erasure.save.v1';
      const state = JSON.parse(localStorage.getItem(key) ?? 'null');
      state.settings.holdMode = 'single';
      state.flags = ['ending.dialogue_started', 'ending.ready_to_hold'];
      localStorage.setItem(key, JSON.stringify(state));
    });
    await page.reload();
    await page.getByRole('button', { name: '从最近的安全位置继续' }).click();
    const canvas = page.locator('canvas');
    await expect(canvas).toHaveAttribute('data-scene-ready', 'true');
    await canvas.press('e', { delay: 100 });
    for (let index = 0; index < 3; index += 1)
      await page.getByRole('button', { name: '继续对白' }).click();
    await expect(page.getByRole('heading', { name: '早期表现与就医陪伴指南' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '制作与致谢' })).toBeVisible();
    await capture(page, testInfo, 'guide-and-credits');
    expect(browserErrors).toEqual([]);
  });
}
