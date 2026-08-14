import { expect, type Locator, type Page } from '@playwright/test';

async function activate(locator: Locator, keyboard: boolean): Promise<void> {
  if (keyboard) {
    await locator.focus();
    await locator.press('Enter');
  } else {
    await locator.click();
  }
}

export async function gotoGame(page: Page, path = '/'): Promise<void> {
  // Firefox can intermittently abort a local preview transfer while several
  // browser projects start together. Retry only that known transient error;
  // all other navigation failures remain visible to the test.
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.goto(path);
      return;
    } catch (error) {
      const message = String(error);
      if (!message.includes('NS_ERROR_NET_PARTIAL_TRANSFER') || attempt === 3) throw error;
      await page.waitForTimeout(attempt * 100);
    }
  }
}

export async function holdKey(page: Page, key: string, durationMs: number): Promise<void> {
  await page.keyboard.down(key);
  try {
    await page.waitForTimeout(durationMs);
  } finally {
    await page.keyboard.up(key);
  }
}

export async function startNewGame(
  page: Page,
  options: { mode?: 'standard' | 'low_stimulation'; slotId?: 1 | 2 | 3; keyboard?: boolean } = {},
): Promise<void> {
  const { mode = 'standard', slotId = 1, keyboard = false } = options;
  await activate(page.getByRole('button', { name: '开始游戏' }), keyboard);
  await activate(
    page.getByRole('button', {
      name: mode === 'standard' ? /标准模式/ : /低扰动模式/,
    }),
    keyboard,
  );
  await activate(page.getByRole('button', { name: new RegExp(`记忆片段 0${slotId}`) }), keyboard);
  await activate(page.getByRole('button', { name: /^(开始|覆盖并开始)$/ }), keyboard);
}

export async function continueLatestGame(page: Page, keyboard = false): Promise<void> {
  await activate(page.getByRole('button', { name: '继续游戏' }), keyboard);
}

export async function returnToTitle(page: Page): Promise<void> {
  if ((await page.locator('#app').getAttribute('data-phase')) === 'title') return;
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.getByRole('button', { name: '返回标题' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'title');
}
