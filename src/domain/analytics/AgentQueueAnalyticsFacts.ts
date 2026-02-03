export type AgentQueueMembershipChangedFact = {
  factId: string;
  occurredAt: Date;
  clientId: string;
  branchNumber: string;
  queueExternalId: string | null;
  action: 'ENQUEUE' | 'DEQUEUE';
  sourceRawType: 'LOGIN' | 'LOGOUT';
};
