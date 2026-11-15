// Merges every module's message files and turns a Message into text in the current language.
// Any folder under src may hold messages/en.json and messages/pl.json (flat: { "code": "text with {param}" }).
// One file per folder and language, so no shared text file. A code with no Polish text falls back to English.
import { create } from 'zustand';
import type { Message } from '../contracts';

type Dictionary = Record<string, string>;
export type Lang = 'en' | 'pl';
export const LANGS: readonly Lang[] = ['en', 'pl'];

const enFiles = import.meta.glob<Dictionary>('../**/messages/en.json', { eager: true, import: 'default' });
const plFiles = import.meta.glob<Dictionary>('../**/messages/pl.json', { eager: true, import: 'default' });

/** English texts, the full set every other language falls back to. */
export const dictionary: Dictionary = Object.assign({}, ...Object.values(enFiles));
export const dictionaries: Record<Lang, Dictionary> = {
  en: dictionary,
  pl: Object.assign({}, ...Object.values(plFiles)),
};

const STORAGE_KEY = 'fieldshift.lang';

function isLang(value: unknown): value is Lang {
  return value === 'en' || value === 'pl';
}

/** `?lang=pl` in the address wins, then the saved choice, then English. A blocked storage counts as no choice. */
export function readInitialLang(search: string, storage: Pick<Storage, 'getItem'> | undefined): Lang {
  const fromUrl = new URLSearchParams(search).get('lang');
  if (isLang(fromUrl)) return fromUrl;
  try {
    const saved = storage?.getItem(STORAGE_KEY);
    if (isLang(saved)) return saved;
  } catch {
    // Private mode or blocked site data: keep the default.
  }
  return 'en';
}

function browserStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function initialLang(): Lang {
  if (typeof window === 'undefined') return 'en';
  return readInitialLang(window.location.search, browserStorage());
}

interface LangState {
  lang: Lang;
}

/** Current UI language. Components subscribe with `useLang((s) => s.lang)`. */
export const useLang = create<LangState>(() => ({ lang: initialLang() }));

function applyToDocument(lang: Lang) {
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}
applyToDocument(useLang.getState().lang);

export function setLang(lang: Lang): void {
  useLang.setState({ lang });
  applyToDocument(lang);
  try {
    browserStorage()?.setItem(STORAGE_KEY, lang);
  } catch {
    // Not saved; the choice still holds for this visit.
  }
}

/** The current language for code outside React (the glossary lookup, for one). */
export function currentLang(): Lang {
  return useLang.getState().lang;
}

/** Text for a code in a given language, with English as the fallback. An unknown code is returned as-is so a gap is visible. */
export function textFor(
  code: string,
  lang: Lang,
  params?: Record<string, string | number>,
  dicts: Record<Lang, Dictionary> = dictionaries,
): string {
  const template = dicts[lang][code] ?? dicts.en[code];
  if (template === undefined) return code;
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (params && key in params ? String(params[key]) : whole));
}

/** Text for a message code in the current language. An unknown code is returned as-is so a missing text is visible, not silent. */
export function t(message: Message | string, params?: Record<string, string | number>): string {
  const code = typeof message === 'string' ? message : message.code;
  const values = typeof message === 'string' ? params : { ...message.params, ...params };
  const lang = currentLang();
  if (lang === 'en' || !values) return textFor(code, lang, values);
  const text = textFor(code, lang, localNames(values, dictionaries[lang]));
  // A Polish sentence that opens with a crop name still opens with a capital letter.
  return /^\{\w+\}/.test(dictionaries[lang][code] ?? '') ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * The engine fills its messages with English words: crop labels ("field pea", from the crop id), hazards ("drought")
 * and month names ("July"). In another language each one is swapped for the name that language already has for it
 * (crop.<id>, calendar.hazard.<id>, calendar.month.<n>), in lower case as it sits inside a sentence.
 */
function localNames(values: Record<string, string | number>, dict: Dictionary): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(values)) {
    if (typeof value !== 'string') {
      out[key] = value;
      continue;
    }
    const month = EN_MONTHS.indexOf(value);
    const local =
      dict[`crop.${value.replace(/ /g, '-')}`] ??
      dict[`calendar.hazard.${value}`] ??
      (month >= 0 ? dict[`calendar.month.${month + 1}`] : undefined);
    out[key] = local ? local.charAt(0).toLowerCase() + local.slice(1) : value;
  }
  return out;
}
