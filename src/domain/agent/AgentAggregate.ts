export type AgentFlags = {
  loginState: boolean;
  pauseState: boolean;
  inCall: boolean;
  ringingState: boolean;
};

export type AgentState = {
  agentId: string;
  clientId: string;
  branchNumber: string;
  flags: AgentFlags;
  pauseReason: string | null;
  pauseStartedAt: Date | null;
  pauseTotalMs: number;
  lastLoginAt: Date | null;
  lastLogoutAt: Date | null;
  lastPauseEndedAt: Date | null;
};

export const AgentState = {
  initial(agentId: string, clientId: string, branchNumber: string): AgentState {
    return {
      agentId,
      clientId,
      branchNumber,
      flags: {
        loginState: false,
        pauseState: false,
        inCall: false,
        ringingState: false,
      },
      pauseReason: null,
      pauseStartedAt: null,
      pauseTotalMs: 0,
      lastLoginAt: null,
      lastLogoutAt: null,
      lastPauseEndedAt: null,
    };
  },
};
