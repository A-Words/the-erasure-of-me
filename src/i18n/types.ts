export type Locale = 'zh-CN' | 'zh-HK' | 'en';

export type LocalePreference = 'system' | Locale;

export interface TextRef {
  key: string;
  params?: Record<string, string | number>;
}

export function text(key: string, params?: Record<string, string | number>): TextRef {
  return params ? { key, params } : { key };
}
