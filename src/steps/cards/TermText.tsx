// A sentence from the message file with glossary terms inside it: "{rootZone}" in the text becomes <Term> for that id.
import { Fragment } from 'react';
import { t } from '../../app/i18n';
import { Term } from '../../ui-kit';
import { term, type TermId } from '../glossary/useTerm';

export function TermText({ code, terms }: { code: string; terms: Record<string, TermId> }) {
  // t() leaves unknown placeholders in place, so the template still holds {name} for each term.
  const parts = t(code).split(/\{(\w+)\}/);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0) return <Fragment key={i}>{part}</Fragment>;
        const id = terms[part];
        return id ? <Term key={i} {...term(id)} /> : <Fragment key={i}>{`{${part}}`}</Fragment>;
      })}
    </>
  );
}
