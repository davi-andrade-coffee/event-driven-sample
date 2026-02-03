import { RawEvent } from '../../application/pipeline/Translator';

export interface IngressPort {
  start(handler: (event: RawEvent) => Promise<void> | void): void;
}
