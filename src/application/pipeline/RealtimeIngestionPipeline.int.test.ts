import { RealtimeIngestionPipeline } from './RealtimeIngestionPipeline';
import { PresenceFlow } from './PresenceFlow';
import { AnalyticsFlow } from './AnalyticsFlow';
import { AgentStateRepository } from '../../ports/persistence/AgentStateRepository';
import { KafkaPublisherPort } from '../../ports/messaging/KafkaPublisherPort';
import { Clock } from '../../shared/types/Clock';
import { IdGenerator } from '../../shared/types/IdGenerator';
import { RawEvent } from './Translator';

const makeLogger = () => ({
  info: jest.fn(),
  error: jest.fn(),
});

const fixedClock: Clock = {
  now: () => new Date('2024-01-01T10:00:00Z'),
};

const fixedIdGenerator: IdGenerator = {
  generate: () => 'fixed-id',
};

describe('RealtimeIngestionPipeline integration', () => {
  it('data4=false loads snapshot, saves new state, and publishes status only when changed', async () => {
    const repository: AgentStateRepository = {
      get: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const publisher: KafkaPublisherPort = {
      publish: jest.fn().mockResolvedValue(undefined),
    };
    const logger = makeLogger();

    const presenceFlow = new PresenceFlow(
      repository,
      publisher,
      fixedIdGenerator,
      fixedClock,
      { statusTopic: 'status-topic', eventsTopic: 'events-topic' },
      logger,
    );
    const analyticsFlow = new AnalyticsFlow(
      publisher,
      fixedIdGenerator,
      'analytics-topic',
      logger,
    );
    const pipeline = new RealtimeIngestionPipeline(
      presenceFlow,
      analyticsFlow,
      fixedIdGenerator,
      fixedClock,
      logger,
    );

    const rawEvent: RawEvent = {
      clientId: 'client',
      branchNumber: 'branch',
      type: 'LOGIN',
      data4: false,
    };

    await pipeline.handle(rawEvent);

    expect(repository.get).toHaveBeenCalledTimes(1);
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(publisher.publish).toHaveBeenCalledWith(
      'events-topic',
      expect.objectContaining({ eventType: 'AgentLoggedIn' }),
    );
    expect(publisher.publish).toHaveBeenCalledWith(
      'status-topic',
      expect.objectContaining({ newPresence: 'LIVRE' }),
    );
  });

  it('data4=true publishes analytics event without loading snapshot', async () => {
    const repository: AgentStateRepository = {
      get: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const publisher: KafkaPublisherPort = {
      publish: jest.fn().mockResolvedValue(undefined),
    };
    const logger = makeLogger();

    const presenceFlow = new PresenceFlow(
      repository,
      publisher,
      fixedIdGenerator,
      fixedClock,
      { statusTopic: 'status-topic', eventsTopic: 'events-topic' },
      logger,
    );
    const analyticsFlow = new AnalyticsFlow(
      publisher,
      fixedIdGenerator,
      'analytics-topic',
      logger,
    );
    const pipeline = new RealtimeIngestionPipeline(
      presenceFlow,
      analyticsFlow,
      fixedIdGenerator,
      fixedClock,
      logger,
    );

    const rawEvent: RawEvent = {
      clientId: 'client',
      branchNumber: 'branch',
      type: 'LOGIN',
      data4: 'true',
      id_ext_fila: 'queue-1',
    };

    await pipeline.handle(rawEvent);

    expect(repository.get).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
    expect(publisher.publish).toHaveBeenCalledWith(
      'analytics-topic',
      expect.objectContaining({ action: 'ENQUEUE' }),
    );
  });
});
