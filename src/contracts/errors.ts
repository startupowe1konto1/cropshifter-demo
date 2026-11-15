/** Thrown by data clients when a source fails. `source` is the name shown in the error state, e.g. 'NASA POWER'. */
export class SourceError extends Error {
  readonly source: string;
  constructor(source: string, message?: string) {
    super(message ?? `${source} did not answer`);
    this.name = 'SourceError';
    this.source = source;
  }
}
