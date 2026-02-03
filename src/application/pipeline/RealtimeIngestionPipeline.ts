import { EventClassifier } from './EventClassifier';
import { Translator, RawEvent } from './Translator';
import { PresenceFlow } from './PresenceFlow';
import { AnalyticsFlow } from './AnalyticsFlow';
import { IdGenerator } from '../../shared/types/IdGenerator';
import { Clock } from '../../shared/types/Clock';

export type PipelineLogger = {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
};

export class RealtimeIngestionPipeline {
  constructor(
    private readonly presenceFlow: PresenceFlow,
    private readonly analyticsFlow: AnalyticsFlow,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
    private readonly logger: PipelineLogger,
  ) {}

  async handle(rawEvent: RawEvent): Promise<void> {
    const classification = EventClassifier.classify(rawEvent);
    const baseMeta = {
      eventId: rawEvent.eventId,
      clientId: rawEvent.clientId,
      branchNumber: rawEvent.branchNumber,
      stream: classification,
      canonicalType: rawEvent.type,
    };

    if (classification === 'PRESENCE') {
      const canonical = Translator.toPresenceCanonical(
        rawEvent,
        this.idGenerator,
        this.clock,
      );
      const command = Translator.toCommand(canonical);
      const agentId = `${canonical.clientId}:${canonical.branchNumber}`;

      const result = await this.presenceFlow.execute(
        command,
        agentId,
        canonical.clientId,
        canonical.branchNumber,
      );

      if (!result.ok) {
        this.logger.error('pipeline.presence.error', {
          ...baseMeta,
          error: result.error.message,
        });
        return;
      }

      this.logger.info('pipeline.presence.processed', {
        ...baseMeta,
        eventId: canonical.eventId,
        publishedStatus: result.value.publishedStatus,
      });
      return;
    }

    const analyticsCanonical = Translator.toAnalyticsCanonical(
      rawEvent,
      this.idGenerator,
      this.clock,
    );
    await this.analyticsFlow.execute(analyticsCanonical);
    this.logger.info('pipeline.analytics.processed', {
      ...baseMeta,
      eventId: analyticsCanonical.eventId,
      canonicalType: analyticsCanonical.type,
      publishedFactType: 'AgentQueueMembershipChangedFact',
    });
  }
}
