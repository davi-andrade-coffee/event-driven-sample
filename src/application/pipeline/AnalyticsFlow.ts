import { KafkaPublisherPort } from '../../ports/messaging/KafkaPublisherPort';
import { FactBuilder } from './FactBuilder';
import { AnalyticsCanonicalEvent } from '../../domain/analytics/AnalyticsCanonicalEvents';
import { IdGenerator } from '../../shared/types/IdGenerator';
import { Clock } from '../../shared/types/Clock';

export type AnalyticsFlowLogger = {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
};

export class AnalyticsFlow {
  constructor(
    private readonly publisher: KafkaPublisherPort,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
    private readonly topic: string,
    private readonly logger: AnalyticsFlowLogger,
  ) {}

  async execute(canonical: AnalyticsCanonicalEvent): Promise<void> {
    const fact = FactBuilder.buildQueueMembershipFact(
      canonical,
      this.idGenerator,
      this.clock,
    );
    await this.publisher.publish(this.topic, fact);
    this.logger.info('analyticsFlow.published', {
      clientId: canonical.clientId,
      branchNumber: canonical.branchNumber,
      canonicalType: canonical.type,
      publishedFactType: 'AgentQueueMembershipChangedFact',
    });
  }
}
