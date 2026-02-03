import { IngressPort } from '../../../ports/ingress/IngressPort';
import { RawEvent } from '../../../application/pipeline/Translator';

export class IpcIngressAdapter implements IngressPort {
  start(handler: (event: RawEvent) => Promise<void> | void): void {
    process.on('message', async (message: RawEvent) => {
      await handler(message);
    });
  }
}
