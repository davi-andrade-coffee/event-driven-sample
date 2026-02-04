import { AgentState } from '../../domain/agent/AgentAggregate';

export interface AgentStateRepository {
  get(agentId: string): Promise<AgentState | null>;
  save(agentId: string, state: AgentState): Promise<void>;
}
