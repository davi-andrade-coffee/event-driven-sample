import { KafkaPublisherPort } from '../../ports/messaging/KafkaPublisherPort';
import { FactBuilder } from './FactBuilder';
import { AnalyticsCanonicalEvent } from '../../domain/analytics/AnalyticsCanonicalEvents';
import { IdGenerator } from '../../shared/types/IdGenerator';

export type AnalyticsFlowLogger = {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
};

export class AnalyticsFlow {
  constructor(
    private readonly publisher: KafkaPublisherPort,
    private readonly idGenerator: IdGenerator,
    private readonly topic: string,
    private readonly logger: AnalyticsFlowLogger,
  ) {}

  async execute(canonical: AnalyticsCanonicalEvent): Promise<void> {
    const record = FactBuilder.buildQueueMembershipEventRecord(
      canonical,
      this.idGenerator,
    );
    await this.publisher.publish(this.topic, record);
    this.logger.info('analyticsFlow.published', {
      clientId: canonical.clientId,
      branchNumber: canonical.branchNumber,
      canonicalType: canonical.type,
      publishedRecordType: 'AgentQueueMembershipChanged',
    });
  }
}
