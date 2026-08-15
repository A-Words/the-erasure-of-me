import { describe, expect, it } from 'vitest';
import { catalogs, translationKeys } from '../../src/i18n/catalogs';
import {
  normalizeLocalePreference,
  resolveLocale,
  resolveSystemLocale,
  t,
  toTextRef,
} from '../../src/i18n';
import { createInitialState } from '../../src/game/state/initialState';
import { migrateGameState } from '../../src/save/migrations';

describe('i18n', () => {
  it('keeps non-title metadata localized', () => {
    expect(t('zh-HK', 'app.title')).toBe('記憶的縫隙');
    expect(t('en', 'app.title')).toBe('The Erasure of Me');
    expect(t('zh-HK', 'fullscreen.eyebrow')).toBe('記憶的縫隙');
    expect(t('en', 'fullscreen.eyebrow')).toBe('THE ERASURE OF ME');
  });

  it('maps browser language tags to the supported locales', () => {
    expect(resolveSystemLocale(['zh-CN', 'en-US'])).toBe('zh-CN');
    expect(resolveSystemLocale(['zh-SG'])).toBe('zh-CN');
    expect(resolveSystemLocale(['zh-Hans-CN'])).toBe('zh-CN');
    expect(resolveSystemLocale(['zh-HK'])).toBe('zh-HK');
    expect(resolveSystemLocale(['zh-TW'])).toBe('zh-HK');
    expect(resolveSystemLocale(['zh-Hant'])).toBe('zh-HK');
    expect(resolveSystemLocale(['ja-JP', 'en-US'])).toBe('en');
  });

  it('prefers a manual locale and falls back to the system locale', () => {
    expect(resolveLocale('zh-HK', ['en-US'])).toBe('zh-HK');
    expect(resolveLocale('en', ['zh-CN'])).toBe('en');
    expect(resolveLocale('system', ['zh-TW'])).toBe('zh-HK');
    expect(normalizeLocalePreference('not-a-locale')).toBe('system');
  });

  it('interpolates translated text and preserves unknown legacy text safely', () => {
    expect(t('en', 'save.slot', { slot: '03' })).toBe('Memory fragment 03');
    expect(t('zh-HK', 'settings.language.system')).toBe('跟隨系統');
    expect(toTextRef('未知的旧文本')).toEqual({
      key: 'legacy.unknown',
      params: { source: '未知的旧文本' },
    });
  });

  it('keeps all three catalogs complete', () => {
    expect(Object.keys(catalogs['zh-CN']).sort()).toEqual([...translationKeys].sort());
    expect(Object.keys(catalogs['zh-HK']).sort()).toEqual([...translationKeys].sort());
    expect(Object.keys(catalogs.en).sort()).toEqual([...translationKeys].sort());
    for (const key of translationKeys) {
      expect(catalogs['zh-CN']).toHaveProperty(key);
      expect(catalogs['zh-HK']).toHaveProperty(key);
      expect(catalogs.en).toHaveProperty(key);
    }
  });

  it('migrates schema 1 content strings without changing progress fields', () => {
    const oldState = createInitialState();
    oldState.schemaVersion = 2;
    const candidate = {
      ...structuredClone(oldState),
      schemaVersion: 1,
      objective: '让生活物品回到原处（1/3）',
      message: '取得照片：1979',
      dialogue: ['一段旧对白'],
      checkpointId: 'checkpoint.life.photos',
      playTimeSeconds: 42,
    };

    const migrated = migrateGameState(candidate);
    expect(migrated?.schemaVersion).toBe(2);
    expect(migrated?.objective).toEqual({ key: 'objective.life.objects', params: { count: 1 } });
    expect(migrated?.message).toEqual({
      key: 'message.life.photo_found',
      params: { year: '1979' },
    });
    expect(migrated?.dialogue[0]).toEqual({
      key: 'legacy.unknown',
      params: { source: '一段旧对白' },
    });
    expect(migrated?.checkpointId).toBe('checkpoint.life.photos');
    expect(migrated?.playTimeSeconds).toBe(42);
  });
});
