import { AgentDomainEvent } from '../../domain/agent/AgentDomainEvents';
import { AgentState } from '../../domain/agent/AgentAggregate';
import { AgentPresenceEventFact, AgentStatusChangedFact } from '../pipeline/FactBuilder';

export type UnitOfWork = {
  agentId: string;
  previousState: AgentState | null;
  newState: AgentState;
  events: AgentDomainEvent[];
  presenceFacts: AgentPresenceEventFact[];
  statusFact: AgentStatusChangedFact | null;
};
