import { KafkaPublisherPort } from '../../../ports/messaging/KafkaPublisherPort';

export type KafkaProducer = {
  send(params: { topic: string; messages: { value: string }[] }): Promise<void>;
};

export type KafkaLogger = {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
};

export class KafkaDirectPublisher implements KafkaPublisherPort {
  constructor(
    private readonly producer: KafkaProducer,
    private readonly logger: KafkaLogger,
  ) {}

  async publish(topic: string, payload: unknown): Promise<void> {
    try {
      await this.producer.send({
        topic,
        messages: [{ value: JSON.stringify(payload) }],
      });
      this.logger.info('kafka.publish.success', { topic });
    } catch (error) {
      this.logger.error('kafka.publish.failed', {
        topic,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
