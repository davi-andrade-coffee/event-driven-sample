export type AgentDomainEvent =
  | AgentLoggedIn
  | AgentLoggedOut
  | AgentPaused
  | AgentExitedPause;

export type AgentLoggedIn = {
  type: 'AgentLoggedIn';
  occurredAt: Date;
};

export type AgentLoggedOut = {
  type: 'AgentLoggedOut';
  occurredAt: Date;
};

export type AgentPaused = {
  type: 'AgentPaused';
  occurredAt: Date;
  pauseReason: string | null;
};

export type AgentExitedPause = {
  type: 'AgentExitedPause';
  occurredAt: Date;
  pauseDurationMs: number;
};
