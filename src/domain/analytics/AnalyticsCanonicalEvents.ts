export type AnalyticsCanonicalEvent =
  | AgentQueueMembershipEnqueueReceived
  | AgentQueueMembershipDequeueReceived;

export type AgentQueueMembershipEnqueueReceived = {
  type: 'AgentQueueMembershipEnqueueReceived';
  eventId: string;
  occurredAt: Date;
  clientId: string;
  branchNumber: string;
  queueExternalId: string | null;
  sourceRawType: 'LOGIN' | 'LOGOUT';
};

export type AgentQueueMembershipDequeueReceived = {
  type: 'AgentQueueMembershipDequeueReceived';
  eventId: string;
  occurredAt: Date;
  clientId: string;
  branchNumber: string;
  queueExternalId: string | null;
  sourceRawType: 'LOGIN' | 'LOGOUT';
};
