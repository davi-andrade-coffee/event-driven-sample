import { IngressPort } from '../../../ports/ingress/IngressPort';
import { RawEvent } from '../../../application/pipeline/Translator';

export class KafkaIngressAdapter implements IngressPort {
  start(_: (event: RawEvent) => Promise<void> | void): void {
    throw new Error('Kafka ingress adapter is not implemented yet.');
  }
}
