import { catalogs, translationEntries, translationKeys } from './catalogs';
import { text } from './types';
import type { Locale, LocalePreference, TextRef } from './types';

export { catalogs, text, translationEntries, translationKeys };
export type { Locale, LocalePreference, TextRef };

export function isLocale(value: unknown): value is Locale {
  return value === 'zh-CN' || value === 'zh-HK' || value === 'en';
}

export function normalizeLocalePreference(value: unknown): LocalePreference {
  return value === 'system' || isLocale(value) ? value : 'system';
}

export function localeFromLanguageTag(languageTag: string): Locale {
  const normalized = languageTag.trim().toLowerCase().replace('_', '-');
  if (!normalized) return 'en';
  if (!normalized.startsWith('zh')) return 'en';
  const parts = normalized.split('-');
  const hasTraditionalScript = parts.includes('hant');
  const traditionalRegion = parts.includes('tw') || parts.includes('hk') || parts.includes('mo');
  return hasTraditionalScript || traditionalRegion ? 'zh-HK' : 'zh-CN';
}

export function resolveSystemLocale(languages: readonly string[] = []): Locale {
  const first = languages.find((language) => typeof language === 'string' && language.trim());
  return first ? localeFromLanguageTag(first) : 'en';
}

export function resolveLocale(
  preference: LocalePreference = 'system',
  languages: readonly string[] = typeof navigator !== 'undefined'
    ? navigator.languages.length > 0
      ? navigator.languages
      : [navigator.language]
    : [],
): Locale {
  return preference === 'system' ? resolveSystemLocale(languages) : preference;
}

export function t(
  locale: Locale,
  key: string,
  params: Record<string, string | number> = {},
): string {
  const template = catalogs[locale][key] ?? catalogs['zh-CN'][key] ?? key;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

export function renderText(locale: Locale, value: TextRef | string | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  return t(locale, value.key, value.params);
}

const legacyTextKey = new Map<string, string>();
for (const [key, values] of Object.entries(translationEntries)) {
  if (!legacyTextKey.has(values[0])) legacyTextKey.set(values[0], key);
}

export function toTextRef(value: unknown): TextRef {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const candidate = value as Partial<TextRef>;
    if (typeof candidate.key === 'string') {
      return {
        key: candidate.key,
        ...(candidate.params && typeof candidate.params === 'object'
          ? { params: candidate.params as Record<string, string | number> }
          : {}),
      };
    }
  }
  if (typeof value === 'string') {
    const key = legacyTextKey.get(value);
    if (key) return text(key);
    return text('legacy.unknown', { source: value });
  }
  return text('legacy.unknown', { source: '' });
}
