// Glossary text for <Term>: `<Term {...useTerm('ndvi')} />`. Nothing here is stateful, so useTerm is a plain lookup
// with a hook-style name; `term` is the same function for use outside components.
// The text follows the UI language (src/app/i18n.ts): terms.pl.json under Polish, terms.en.json otherwise. A term
// with no Polish entry falls back to English, the same way t() does for messages. Components re-render on a language
// switch because App subscribes to useLang.
import { currentLang, type Lang } from '../../app/i18n';
import terms from './terms.en.json';
import plTerms from './terms.pl.json';

export type TermId = keyof typeof terms;
export interface TermText {
  label: string;
  explanation: string;
}

type TermTable = Record<string, TermText>;

const TABLES: Record<Lang, TermTable> = { en: terms, pl: plTerms };

export const TERM_IDS = Object.keys(terms) as TermId[];

/**
 * Text for a term in a language, English as the fallback. With `strict`, an unknown id throws; without it, the id is
 * shown so the gap is visible on screen.
 */
export function lookupTerm(id: string, strict: boolean, lang: Lang = currentLang(), tables: Record<Lang, TermTable> = TABLES): TermText {
  const entry = tables[lang][id] ?? tables.en[id];
  if (entry) return entry;
  if (strict) throw new Error(`Unknown glossary term "${id}". Add it to src/steps/glossary/terms.en.json.`);
  return { label: id, explanation: id };
}

/** Tests fail on an unknown id; the running app shows the id instead of crashing. */
export function term(id: TermId): TermText {
  return lookupTerm(id, import.meta.env.MODE === 'test');
}

export const useTerm = term;
