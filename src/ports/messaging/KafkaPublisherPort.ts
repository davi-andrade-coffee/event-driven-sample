export interface KafkaPublisherPort {
  publish(topic: string, payload: unknown): Promise<void>;
}
