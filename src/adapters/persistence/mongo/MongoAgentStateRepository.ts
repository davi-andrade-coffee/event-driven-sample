import { Collection } from 'mongodb';
import { AgentState } from '../../../domain/agent/AgentAggregate';
import { AgentStateRepository } from '../../../ports/persistence/AgentStateRepository';

export class MongoAgentStateRepository implements AgentStateRepository {
  constructor(private readonly collection: Collection<AgentState>) {}

  async get(agentId: string): Promise<AgentState | null> {
    return this.collection.findOne({ agentId });
  }

  async save(agentId: string, state: AgentState): Promise<void> {
    await this.collection.updateOne(
      { agentId },
      { $set: state },
      { upsert: true },
    );
  }
}
