import type { TranslationKey } from './catalogs';

export type Locale = 'zh-CN' | 'zh-HK' | 'en';

export type LocalePreference = 'system' | Locale;

export interface TextRef {
  key: TranslationKey;
  params?: Record<string, string | number>;
}

export function text(key: TranslationKey, params?: Record<string, string | number>): TextRef {
  return params ? { key, params } : { key };
}
