import type { Locator, Page } from '@playwright/test';

async function activate(locator: Locator, keyboard: boolean): Promise<void> {
  if (keyboard) {
    await locator.focus();
    await locator.press('Enter');
  } else {
    await locator.click();
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
}
