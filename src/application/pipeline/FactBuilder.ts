import { AgentDomainEvent } from '../../domain/agent/AgentDomainEvents';
import { PresenceState } from '../../domain/agent/AgentPresenceFsm';
import { AnalyticsCanonicalEvent } from '../../domain/analytics/AnalyticsCanonicalEvents';
import { IdGenerator } from '../../shared/types/IdGenerator';
import { Clock } from '../../shared/types/Clock';
import { AgentState } from '../../domain/agent/AgentAggregate';

export type AgentStatusChangedFact = {
  factId: string;
  occurredAt: Date;
  clientId: string;
  branchNumber: string;
  previousPresence: PresenceState;
  newPresence: PresenceState;
  flags: AgentState['flags'];
};

export type AgentPresenceEventRecord = {
  recordId: string;
  occurredAt: Date;
  clientId: string;
  branchNumber: string;
  eventType: AgentDomainEvent['type'];
  payload: AgentDomainEvent;
};

export type AgentQueueMembershipEventRecord = {
  recordId: string;
  occurredAt: Date;
  clientId: string;
  branchNumber: string;
  queueExternalId: string | null;
  action: 'ENQUEUE' | 'DEQUEUE';
  sourceRawType: 'LOGIN' | 'LOGOUT';
};

export const FactBuilder = {
  buildStatusChangedFact(
    agent: AgentState,
    previousPresence: PresenceState,
    newPresence: PresenceState,
    idGenerator: IdGenerator,
    clock: Clock,
  ): AgentStatusChangedFact {
    return {
      factId: idGenerator.generate(),
      occurredAt: clock.now(),
      clientId: agent.clientId,
      branchNumber: agent.branchNumber,
      previousPresence,
      newPresence,
      flags: agent.flags,
    };
  },
  buildPresenceEventRecord(
    agent: AgentState,
    event: AgentDomainEvent,
    idGenerator: IdGenerator,
  ): AgentPresenceEventRecord {
    return {
      recordId: idGenerator.generate(),
      occurredAt: event.occurredAt,
      clientId: agent.clientId,
      branchNumber: agent.branchNumber,
      eventType: event.type,
      payload: event,
    };
  },
  buildQueueMembershipEventRecord(
    canonical: AnalyticsCanonicalEvent,
    idGenerator: IdGenerator,
  ): AgentQueueMembershipEventRecord {
    return {
      recordId: idGenerator.generate(),
      occurredAt: canonical.occurredAt,
      clientId: canonical.clientId,
      branchNumber: canonical.branchNumber,
      queueExternalId: canonical.queueExternalId,
      action:
        canonical.type === 'AgentQueueMembershipEnqueueReceived'
          ? 'ENQUEUE'
          : 'DEQUEUE',
      sourceRawType: canonical.sourceRawType,
    };
  },
};
