import { buildPipeline } from './di';
import { IngressPort } from '../ports/ingress/IngressPort';
import { AgentStateRepository } from '../ports/persistence/AgentStateRepository';
import { KafkaPublisherPort } from '../ports/messaging/KafkaPublisherPort';

export type RuntimeDeps = {
  ingress: IngressPort;
  repository: AgentStateRepository;
  publisher: KafkaPublisherPort;
  statusTopic: string;
  analyticsTopic: string;
  logger: {
    info(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
  };
};

export const startRuntime = ({
  ingress,
  repository,
  publisher,
  statusTopic,
  analyticsTopic,
  logger,
}: RuntimeDeps): void => {
  const pipeline = buildPipeline(
    repository,
    publisher,
    { statusTopic, analyticsTopic },
    logger,
  );

  ingress.start(async (rawEvent) => {
    await pipeline.handle(rawEvent);
  });
};
