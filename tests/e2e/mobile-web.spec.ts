import { expect, test, type Page } from '@playwright/test';
import { gotoGame, startNewGame } from './helpers/game-navigation';

async function finishOpeningDialogue(page: Page): Promise<void> {
  const advance = page.getByRole('button', { name: '继续对白' });
  const dialogue = page.locator('.dialogue-box');
  await expect(dialogue).toBeVisible();
  for (let step = 0; step < 40; step += 1) {
    if (!(await dialogue.isVisible())) break;
    await advance.tap({ position: { x: 20, y: 180 } });
  }
  await expect(dialogue).toBeHidden();
}

async function expectTitlePanelFits(page: Page): Promise<void> {
  await expectPanelShellFits(page, '.title-panel');
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

async function enterFullscreenExperience(page: Page, label = '开始体验'): Promise<void> {
  const entry = page.getByRole('button', { name: label });
  await expect(entry).toBeVisible();
  await entry.tap();
  await expect(entry).toBeHidden();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    let fullscreenElement: Element | null = null;
    Object.defineProperty(document, 'fullscreenEnabled', {
      configurable: true,
      get: () => sessionStorage.getItem('erasure.e2e.fullscreen') !== 'unsupported',
    });
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fullscreenElement,
    });
    Object.defineProperty(document, 'webkitFullscreenEnabled', {
      configurable: true,
      get: () => sessionStorage.getItem('erasure.e2e.fullscreen') !== 'unsupported',
    });
    Object.defineProperty(document, 'webkitFullscreenElement', {
      configurable: true,
      get: () => fullscreenElement,
    });
    const requestFullscreen = async (changeEvent: string) => {
      const requests = Number(sessionStorage.getItem('erasure.e2e.fullscreen.requests') ?? 0);
      sessionStorage.setItem('erasure.e2e.fullscreen.requests', String(requests + 1));
      if (sessionStorage.getItem('erasure.e2e.fullscreen') === 'denied') {
        throw new DOMException('denied', 'NotAllowedError');
      }
      fullscreenElement = document.querySelector('#app');
      document.dispatchEvent(new Event(changeEvent));
    };
    Object.defineProperty(Element.prototype, 'requestFullscreen', {
      configurable: true,
      get() {
        if (sessionStorage.getItem('erasure.e2e.fullscreen') === 'unsupported') return undefined;
        return () => requestFullscreen('fullscreenchange');
      },
    });
    Object.defineProperty(Element.prototype, 'webkitRequestFullscreen', {
      configurable: true,
      get() {
        if (sessionStorage.getItem('erasure.e2e.fullscreen') === 'unsupported') return undefined;
        return () => requestFullscreen('webkitfullscreenchange');
      },
    });
    const exitFullscreen = async (changeEvent: string) => {
      fullscreenElement = null;
      document.dispatchEvent(new Event(changeEvent));
    };
    Object.defineProperty(Document.prototype, 'exitFullscreen', {
      configurable: true,
      value: () => exitFullscreen('fullscreenchange'),
    });
    Object.defineProperty(Document.prototype, 'webkitExitFullscreen', {
      configurable: true,
      value: () => exitFullscreen('webkitfullscreenchange'),
    });
  });
  await gotoGame(page);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('shows the portrait gate before fullscreen on every mobile entry', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.reload();

  const orientationDialog = page.getByRole('dialog', { name: '请旋转至横屏' });
  const fullscreenDialog = page.getByRole('dialog', { name: '准备好进入这段记忆了吗？' });
  await expect(orientationDialog).toBeVisible();
  await expect(fullscreenDialog).toBeHidden();
  await expect(page.getByRole('button', { name: '开始游戏' })).toBeHidden();
  expect(
    await page.evaluate(() =>
      Number(sessionStorage.getItem('erasure.e2e.fullscreen.requests') ?? 0),
    ),
  ).toBe(0);

  await page.setViewportSize({ width: 780, height: 360 });
  await expect(orientationDialog).toBeHidden();
  await expect(fullscreenDialog).toBeVisible();
  await expect(page.getByRole('button', { name: '开始体验' })).toBeVisible();
});

test('keeps mobile entry gates focused and blocks Phaser keyboard input', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.reload();

  const orientationDialog = page.getByRole('dialog', { name: '请旋转至横屏' });
  const orientationNotice = page.locator('.orientation-notice');
  const canvas = page.locator('canvas[data-game-canvas]');
  await expect(orientationDialog).toBeVisible();
  await expect(orientationNotice).toBeFocused();
  await expect(canvas).toHaveJSProperty('inert', true);
  await page.keyboard.press('Tab');
  await expect(orientationNotice).toBeFocused();

  await page.setViewportSize({ width: 780, height: 360 });
  const entry = page.getByRole('button', { name: '开始体验' });
  await expect(entry).toBeFocused();
  await expect(canvas).toHaveJSProperty('inert', true);
  await page.keyboard.press('Tab');
  await expect(entry).toBeFocused();

  await entry.tap();
  await startNewGame(page);
  await finishOpeningDialogue(page);
  const app = page.locator('#app');
  await expect(app).toHaveAttribute('data-player-x', /\d+/);
  const beforePortraitX = Number(await app.getAttribute('data-player-x'));
  expect(Number.isFinite(beforePortraitX)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(orientationDialog).toBeVisible();
  await expect(app).toHaveAttribute('data-modal', 'pause');
  await expect(canvas).toHaveJSProperty('inert', true);

  await page.keyboard.press('q');
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(180);
  await page.keyboard.up('ArrowRight');
  await expect(app).toHaveAttribute('data-modal', 'pause');
  await expect(app).toHaveAttribute('data-player-x', /\d+/);
  expect(Number(await app.getAttribute('data-player-x'))).toBe(beforePortraitX);

  await page.setViewportSize({ width: 780, height: 360 });
  await expect(orientationDialog).toBeHidden();
  await expect(page.getByRole('heading', { name: '暂停' })).toBeVisible();
});

test('uses the persisted locale for the first mobile entry gates after refresh', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.evaluate(() => {
    localStorage.setItem('erasure.settings.v1', JSON.stringify({ localePreference: 'en' }));
  });
  await page.reload();

  const orientationDialog = page.getByRole('dialog', { name: 'Please rotate to landscape' });
  const fullscreenDialog = page.getByRole('dialog', { name: 'Ready to enter this memory?' });
  await expect(orientationDialog).toBeVisible();
  await expect(fullscreenDialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Start game' })).toBeHidden();

  await page.setViewportSize({ width: 780, height: 360 });
  await expect(orientationDialog).toBeHidden();
  await expect(fullscreenDialog).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start experience' })).toBeVisible();
});

test('opens through a fullscreen entry gate and degrades gracefully when unavailable', async ({
  page,
}, testInfo) => {
  for (const availability of ['denied', 'unsupported']) {
    await test.step(`degrades when fullscreen is ${availability}`, async () => {
      const entryDialog = page.getByRole('dialog', { name: '准备好进入这段记忆了吗？' });
      const entryButton = page.getByRole('button', { name: '开始体验' });
      await expect(entryDialog).toBeVisible();
      await expect(page.getByRole('heading', { name: '准备好进入这段记忆了吗？' })).toBeVisible();
      await expect(entryDialog).toContainText('点击任意处开始');
      await expect(entryDialog).not.toContainText('浏览器不支持全屏时仍可继续');
      await expect(page.getByRole('button', { name: '开始游戏' })).toBeHidden();
      await expect(entryButton).toBeFocused();
      if (availability === 'denied') {
        await entryButton.evaluate((button) => {
          button.dataset.resizeMarker = 'stable';
          window.dispatchEvent(new Event('resize'));
        });
        await expect(entryButton).toHaveAttribute('data-resize-marker', 'stable');
        await page.screenshot({ path: testInfo.outputPath('mobile-fullscreen-entry.png') });
      }

      await page.evaluate(
        (value) => sessionStorage.setItem('erasure.e2e.fullscreen', value),
        availability,
      );
      if (availability === 'denied') {
        await entryButton.tap();
        await expect
          .poll(() =>
            page.evaluate(() =>
              Number(sessionStorage.getItem('erasure.e2e.fullscreen.requests') ?? 0),
            ),
          )
          .toBe(1);
      } else {
        const [dialogBox, buttonBox] = await Promise.all([
          entryDialog.boundingBox(),
          entryButton.boundingBox(),
        ]);
        expect(dialogBox).not.toBeNull();
        expect(buttonBox).not.toBeNull();
        for (const key of ['x', 'y', 'width', 'height'] as const) {
          expect(buttonBox![key]).toBeCloseTo(dialogBox![key], 0);
        }
        await entryButton.tap({ position: { x: 96, y: 72 } });
      }

      await expect(entryDialog).toBeHidden();
      await expect(page.getByRole('status')).toContainText('无法进入全屏，已继续横屏模式');
      await expect(page.getByRole('button', { name: '开始游戏' })).toBeVisible();
      if (availability === 'denied') await page.reload();
    });
  }
});

test('restores fullscreen from title settings and pause without blocking gameplay', async ({
  page,
}) => {
  await enterFullscreenExperience(page);
  await page.evaluate(() => document.exitFullscreen());
  await page.getByRole('button', { name: '设置' }).tap();
  await page.getByRole('button', { name: '进入全屏' }).tap();
  await expect(page.getByRole('button', { name: '退出全屏' })).toBeVisible();
  await page.getByRole('button', { name: '返回' }).tap();

  await startNewGame(page);
  await finishOpeningDialogue(page);
  await page.evaluate(() => document.exitFullscreen());
  await page.getByRole('button', { name: '暂停游戏' }).tap();
  await page.getByRole('button', { name: '进入全屏' }).tap();
  await expect(page.getByRole('button', { name: '退出全屏' })).toBeVisible();
});

test('refreshes fixed touch control labels after changing language in pause', async ({ page }) => {
  await enterFullscreenExperience(page);
  await startNewGame(page);
  await finishOpeningDialogue(page);
  await page.getByRole('button', { name: '暂停游戏' }).tap();
  await expect(page.getByRole('heading', { name: '暂停' })).toBeVisible();

  await page.getByLabel('语言').selectOption('en');
  await expect(page.getByRole('heading', { name: 'Pause' })).toBeVisible();
  await expect(page.locator('.touch-controls')).toHaveAttribute(
    'aria-label',
    'Touch game controls',
  );
  await expect(page.locator('.touch-up')).toHaveAttribute('aria-label', 'Move up');
  await expect(page.locator('.touch-dpad')).toHaveAttribute('aria-label', 'Movement direction');
  await expect(page.locator('[data-touch-action="observe"]')).toHaveAttribute(
    'aria-label',
    'Hold to quietly notice',
  );
  await expect(page.locator('[data-touch-action="interact"]')).toHaveAttribute(
    'aria-label',
    'Interact with nearby object',
  );
  await expect(page.locator('.touch-pause')).toHaveAttribute('aria-label', 'Pause game');

  await page.getByRole('button', { name: 'Continue', exact: true }).tap();
  await expect(page.getByRole('button', { name: 'Pause game' })).toBeVisible();
  await page.getByRole('button', { name: 'Pause game' }).tap();
  await expect(page.getByRole('heading', { name: 'Pause' })).toBeVisible();
});

test('does not retry fullscreen when starting, continuing, or reading a memory', async ({
  page,
}) => {
  await enterFullscreenExperience(page);
  await page.evaluate(() => document.exitFullscreen());
  await startNewGame(page);
  await finishOpeningDialogue(page);
  await page.locator('canvas').press('Escape');
  await page.getByRole('button', { name: '返回标题' }).click();

  await page.evaluate(() => document.exitFullscreen());
  await page.getByRole('button', { name: '继续游戏' }).tap();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.getByRole('button', { name: '返回标题' }).click();

  await page.evaluate(() => document.exitFullscreen());
  await page.getByRole('button', { name: '读取记忆' }).tap();
  await page.getByRole('button', { name: '读取' }).tap();

  await expect
    .poll(() =>
      page.evaluate(() => Number(sessionStorage.getItem('erasure.e2e.fullscreen.requests') ?? 0)),
    )
    .toBe(1);
});

test('keeps every title action visible without scrolling on supported landscape phones', async ({
  page,
}, testInfo) => {
  for (const viewport of [
    { width: 754, height: 269, fullscreen: 'unsupported' as const },
    { width: 754, height: 361, fullscreen: 'supported' as const },
    { width: 780, height: 360, fullscreen: 'supported' as const },
    { width: 932, height: 430, fullscreen: 'supported' as const },
  ]) {
    const { fullscreen, ...size } = viewport;
    await page.setViewportSize(size);
    await page.evaluate((availability) => {
      sessionStorage.setItem('erasure.e2e.fullscreen', availability);
    }, fullscreen);
    await page.reload();
    await enterFullscreenExperience(page);

    const viewportState = await page.evaluate(() => ({
      fullscreenElement: document.fullscreenElement?.id ?? null,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
    }));
    expect(viewportState.innerWidth).toBe(size.width);
    expect(viewportState.innerHeight).toBe(size.height);
    if (fullscreen === 'unsupported') {
      expect(viewportState.fullscreenElement).toBeNull();
      expect(viewportState.innerHeight).toBeLessThanOrEqual(300);
    } else {
      expect(viewportState.fullscreenElement).toBe('app');
    }

    await expect
      .poll(() =>
        page.locator('.title-screen').evaluate((title) => getComputedStyle(title).display),
      )
      .toBe('grid');

    for (const name of ['继续游戏', '开始游戏', '读取记忆', '设置']) {
      await expect(page.getByRole('button', { name })).toBeInViewport();
    }

    const cards = page.locator('.title-screen:not(.title-subpage) .title-menu-card');
    await expect(cards).toHaveCount(4);
    const heights = await cards.evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().height),
    );
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);

    const overflow = await page.locator('.title-screen').evaluate((title) => ({
      page: document.documentElement.scrollHeight - window.innerHeight,
      title: title.scrollHeight - title.clientHeight,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      visualHeight: window.visualViewport?.height,
    }));
    expect(overflow.page).toBeLessThanOrEqual(1);
    expect(overflow.title, JSON.stringify(overflow)).toBeLessThanOrEqual(1);

    await page.screenshot({
      path: testInfo.outputPath(`mobile-landscape-title-${viewport.width}x${viewport.height}.png`),
    });
  }
});

test('keeps localized mobile title pages readable without clipping', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 780, height: 360 });
  for (const scenario of [
    { locale: 'zh-CN', entry: '开始体验', heading: '记忆的缝隙' },
    { locale: 'zh-HK', entry: '開始體驗', heading: '記憶的縫隙' },
    { locale: 'en', entry: 'Start experience', heading: '记忆的缝隙' },
  ]) {
    await page.evaluate((locale) => {
      localStorage.setItem('erasure.settings.v1', JSON.stringify({ localePreference: locale }));
      sessionStorage.setItem('erasure.e2e.fullscreen', 'supported');
    }, scenario.locale);
    await page.reload();

    await enterFullscreenExperience(page, scenario.entry);
    await expect(page.locator('html')).toHaveAttribute('data-locale', scenario.locale);
    await expect(page.locator('.title-screen h1')).toHaveText(scenario.heading);
    await expect(page.locator('.title-menu-card')).toHaveCount(4);
    await expectEveryElementInViewport(page, '.title-heading, .content-note, .title-menu-card');

    const layout = await page.locator('.title-screen').evaluate((title) => {
      const boxes = [
        ...title.querySelectorAll('.title-heading, .content-note, .title-menu-card'),
      ].map((element) => {
        const box = element.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
      });
      return {
        horizontalOverflow: title.scrollWidth - title.clientWidth,
        verticalOverflow: title.scrollHeight - title.clientHeight,
        boxes,
        viewport: { width: window.innerWidth, height: window.innerHeight },
      };
    });
    expect(layout.horizontalOverflow, JSON.stringify(layout)).toBeLessThanOrEqual(1);
    expect(layout.verticalOverflow, JSON.stringify(layout)).toBeLessThanOrEqual(1);
    for (const box of layout.boxes) {
      expect(box.left).toBeGreaterThanOrEqual(-1);
      expect(box.right).toBeLessThanOrEqual(layout.viewport.width + 1);
      expect(box.top).toBeGreaterThanOrEqual(-1);
      expect(box.bottom).toBeLessThanOrEqual(layout.viewport.height + 1);
    }

    await page.screenshot({
      path: testInfo.outputPath(`mobile-title-${scenario.locale}-780x360.png`),
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
    await enterFullscreenExperience(page);

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

test('advances dialogue from the mobile playfield while keeping pause available', async ({
  page,
}, testInfo) => {
  for (const viewport of [
    { width: 754, height: 361 },
    { width: 780, height: 360 },
  ]) {
    await page.setViewportSize(viewport);
    await page.reload();
    await enterFullscreenExperience(page);
    await startNewGame(page);

    const advance = page.getByRole('button', { name: '继续对白' });
    const line = page.locator('.dialogue-text');
    const dialogueBox = page.locator('.dialogue-box');
    const firstLine = await line.textContent();
    const box = await dialogueBox.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(544.5);
    await page.locator('#app').evaluate((app) => {
      app.setAttribute('data-chapter', 'life');
    });
    const lifeBox = await dialogueBox.boundingBox();
    expect(lifeBox).not.toBeNull();
    expect(lifeBox!.width).toBeLessThanOrEqual(544.5);
    await page.locator('#app').evaluate((app) => {
      app.setAttribute('data-chapter', 'home');
    });
    await expect(dialogueBox).toContainText('点击任意位置继续');
    await expect(page.locator('.dialogue-hint-keyboard')).toBeHidden();

    await expect(page.locator('.touch-dpad')).toBeHidden();
    await expect(page.locator('.touch-context-actions')).toBeHidden();
    await expect(page.locator('.hud-actions')).toBeHidden();
    const pause = page.getByRole('button', { name: '暂停游戏' });
    await expect(pause).toBeVisible();

    if (viewport.width === 754) {
      await page.setViewportSize({ width: 390, height: 844 });
      const orientationNotice = page.getByRole('dialog', { name: '请旋转至横屏' });
      await expect(orientationNotice).toBeVisible();
      await page.touchscreen.tap(195, 422);
      await page.setViewportSize(viewport);
      await expect(page.getByRole('heading', { name: '暂停' })).toBeVisible();
      await page.getByRole('button', { name: '继续', exact: true }).tap();
      await expect(line).toHaveText(firstLine ?? '');
    }

    await page.touchscreen.tap(24, Math.floor(viewport.height / 2));
    await expect(line).not.toHaveText(firstLine ?? '');
    const pausedLine = await line.textContent();

    await pause.tap();
    await expect(page.getByRole('heading', { name: '暂停' })).toBeVisible();
    await expect(advance).toBeHidden();
    await page.getByRole('button', { name: '继续', exact: true }).tap();
    await expect(line).toHaveText(pausedLine ?? '');

    await page.screenshot({
      path: testInfo.outputPath(
        `mobile-dialogue-anywhere-${viewport.width}x${viewport.height}.png`,
      ),
    });
    await finishOpeningDialogue(page);
  }
});

test('keeps the first memory line after the touch that opens it', async ({ page }, testInfo) => {
  await enterFullscreenExperience(page);
  await startNewGame(page);
  await finishOpeningDialogue(page);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.getByRole('button', { name: '返回标题' }).tap();

  await page.evaluate(() => {
    const key = 'erasure.save.slot.1.v1';
    const record = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (!record?.state) throw new Error('missing save record for slot 1');
    Object.assign(record.state, {
      phase: 'playing',
      chapterId: 'rain',
      checkpointId: 'checkpoint.rain.start',
      degradationStage: 'D1',
      objective: '走到钟表铺前的红伞旁',
      player: { x: 1120, y: 180, facing: 'up', moving: false },
      flags: [],
      dialogue: [],
      dialogueIndex: 0,
      activeMemoryId: null,
      modal: null,
      puzzles: {
        ...record.state.puzzles,
        stationSequence: [2, 4, 5],
        rainSigns: ['shape.circle', 'texture.ribbed'],
      },
    });
    localStorage.setItem(key, JSON.stringify(record));
  });
  await page.reload();
  await enterFullscreenExperience(page);
  await page.getByRole('button', { name: '继续游戏' }).tap();

  const interact = page.locator('[data-touch-action="interact"]');
  const right = page.getByRole('button', { name: '向右移动' });
  const pointerId = 60;
  await right.dispatchEvent('pointerdown', { pointerId, pointerType: 'touch' });
  try {
    await expect(interact).toHaveAttribute('aria-label', '前往钟表铺前的红伞');
  } finally {
    await right.dispatchEvent('pointerup', { pointerId, pointerType: 'touch' });
  }
  await interact.tap();
  const line = page.locator('.dialogue-text');
  await expect(page.locator('.memory-cutscene')).toBeVisible();
  await expect(line).toHaveText('年轻的林秀兰：“你要去车站吗？”');

  await page.touchscreen.tap(24, 180);
  await expect(line).toHaveText('“那一起走吧。伞往你那边一点，别淋着。”');
  await page.screenshot({ path: testInfo.outputPath('mobile-memory-dialogue-anywhere.png') });
});

test('plays with touch controls at the minimum supported landscape viewport', async ({
  page,
}, testInfo) => {
  await enterFullscreenExperience(page);
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

  await expect(page.getByText(/已自动保存/)).toHaveCount(0);
  await expect(page.locator('.observation-hint')).toHaveCount(0);

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
  await enterFullscreenExperience(page);
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
  await enterFullscreenExperience(page);
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
  await page.locator('.clear-data > summary').click();
  await expect(page.getByRole('button', { name: '清除本地数据' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('mobile-landscape-pause-panel.png') });
});

test('pauses in portrait and requires an explicit resume after rotating back', async ({ page }) => {
  await enterFullscreenExperience(page);
  await startNewGame(page);
  await finishOpeningDialogue(page);
  await page.setViewportSize({ width: 390, height: 844 });

  const orientationNotice = page.getByRole('dialog', { name: '请旋转至横屏' });
  await expect(orientationNotice).toBeVisible();
  await expect(orientationNotice).toBeFocused();
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
  await enterFullscreenExperience(page);
  await startNewGame(page);
  await finishOpeningDialogue(page);
  await page.addInitScript(() => {
    const record = JSON.parse(localStorage.getItem('erasure.save.slot.1.v1') ?? 'null');
    if (!record?.state) throw new Error('missing save record for slot 1');
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
  await enterFullscreenExperience(page);
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
    if (!record?.state) throw new Error('missing save record for slot 1');
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
  await enterFullscreenExperience(page);
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
