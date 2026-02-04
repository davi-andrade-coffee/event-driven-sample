export type AgentCommand =
  | LogInAgent
  | LogOutAgent
  | EnterPause
  | ExitPause;

export type LogInAgent = {
  type: 'LogInAgent';
  occurredAt: Date;
};

export type LogOutAgent = {
  type: 'LogOutAgent';
  occurredAt: Date;
};

export type EnterPause = {
  type: 'EnterPause';
  occurredAt: Date;
  pauseReason: string | null;
};

export type ExitPause = {
  type: 'ExitPause';
  occurredAt: Date;
};
