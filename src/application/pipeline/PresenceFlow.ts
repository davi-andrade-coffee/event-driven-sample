import { AgentDecider } from '../../domain/agent/AgentDecider';
import { AgentPresenceFsm } from '../../domain/agent/AgentPresenceFsm';
import { AgentState } from '../../domain/agent/AgentAggregate';
import { AgentStateRepository } from '../../ports/persistence/AgentStateRepository';
import { KafkaPublisherPort } from '../../ports/messaging/KafkaPublisherPort';
import { Result } from '../../shared/types/Result';
import { AgentCommand } from '../../domain/agent/AgentCommands';
import { FactBuilder } from './FactBuilder';
import { UnitOfWork } from '../uow/UnitOfWork';
import { UnitOfWorkResult } from '../uow/UnitOfWorkResult';
import { IdGenerator } from '../../shared/types/IdGenerator';
import { Clock } from '../../shared/types/Clock';

export type PresenceFlowTopics = {
  statusTopic: string;
  eventsTopic: string;
};

export type PresenceFlowLogger = {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
};

export class PresenceFlow {
  constructor(
    private readonly repository: AgentStateRepository,
    private readonly publisher: KafkaPublisherPort,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
    private readonly topics: PresenceFlowTopics,
    private readonly logger: PresenceFlowLogger,
  ) {}

  async execute(
    command: AgentCommand,
    agentId: string,
    clientId: string,
    branchNumber: string,
  ): Promise<Result<UnitOfWorkResult, Error>> {
    const current = await this.repository.get(agentId);
    if (!current && command.type !== 'LogInAgent') {
      const error = new Error('Agent snapshot not found for non-login command');
      this.logger.error('presenceFlow.agentMissing', {
        agentId,
        clientId,
        branchNumber,
        commandType: command.type,
      });
      return Result.err(error);
    }

    const baseState =
      current ?? AgentState.initial(agentId, clientId, branchNumber);
    const previousPresence = AgentPresenceFsm.derivePresenceState(
      baseState.flags,
    );

    const events = AgentDecider.decide(baseState, command);
    if (events.length === 0) {
      this.logger.info('presenceFlow.noop', {
        agentId,
        clientId,
        branchNumber,
        commandType: command.type,
      });
      const work: UnitOfWork = {
        agentId,
        previousState: current,
        newState: baseState,
        events,
        presenceRecords: [],
        statusFact: null,
      };
      return Result.ok({ work, persisted: false, publishedStatus: false });
    }

    const newState = events.reduce(AgentState.apply, baseState);
    const newPresence = AgentPresenceFsm.derivePresenceState(newState.flags);

    const presenceRecords = events.map((event) =>
      FactBuilder.buildPresenceEventRecord(newState, event, this.idGenerator),
    );

    await this.repository.save(agentId, newState);

    for (const record of presenceRecords) {
      await this.publisher.publish(this.topics.eventsTopic, record);
      this.logger.info('presenceFlow.publishedPresenceEvent', {
        agentId,
        clientId,
        branchNumber,
        publishedRecordType: record.eventType,
      });
    }

    let statusFact = null;
    let publishedStatus = false;
    if (previousPresence !== newPresence) {
      statusFact = FactBuilder.buildStatusChangedFact(
        newState,
        previousPresence,
        newPresence,
        this.idGenerator,
        this.clock,
      );
      await this.publisher.publish(this.topics.statusTopic, statusFact);
      publishedStatus = true;
      this.logger.info('presenceFlow.publishedStatus', {
        agentId,
        clientId,
        branchNumber,
        publishedRecordType: 'AgentStatusChangedFact',
      });
    }

    const work: UnitOfWork = {
      agentId,
      previousState: current,
      newState,
      events,
      presenceRecords,
      statusFact,
    };

    return Result.ok({ work, persisted: true, publishedStatus });
  }
}
