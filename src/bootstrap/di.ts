import { PresenceFlow } from '../application/pipeline/PresenceFlow';
import { AnalyticsFlow } from '../application/pipeline/AnalyticsFlow';
import { RealtimeIngestionPipeline } from '../application/pipeline/RealtimeIngestionPipeline';
import { SystemClock } from '../shared/types/Clock';
import { UuidGenerator } from '../shared/types/IdGenerator';
import { AgentStateRepository } from '../ports/persistence/AgentStateRepository';
import { KafkaPublisherPort } from '../ports/messaging/KafkaPublisherPort';

export type RuntimeConfig = {
  statusTopic: string;
  analyticsTopic: string;
};

export type Logger = {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
};

export const buildPipeline = (
  repository: AgentStateRepository,
  publisher: KafkaPublisherPort,
  config: RuntimeConfig,
  logger: Logger,
): RealtimeIngestionPipeline => {
  const clock = new SystemClock();
  const idGenerator = new UuidGenerator();
  const presenceFlow = new PresenceFlow(
    repository,
    publisher,
    idGenerator,
    clock,
    { statusTopic: config.statusTopic, analyticsTopic: config.analyticsTopic },
    logger,
  );
  const analyticsFlow = new AnalyticsFlow(
    publisher,
    idGenerator,
    clock,
    config.analyticsTopic,
    logger,
  );
  return new RealtimeIngestionPipeline(
    presenceFlow,
    analyticsFlow,
    idGenerator,
    clock,
    logger,
  );
};
