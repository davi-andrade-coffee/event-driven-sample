import { AgentDomainEvent } from './AgentDomainEvents';

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
  apply(state: AgentState, event: AgentDomainEvent): AgentState {
    switch (event.type) {
      case 'AgentLoggedIn':
        return {
          ...state,
          flags: {
            ...state.flags,
            loginState: true,
          },
          lastLoginAt: event.occurredAt,
        };
      case 'AgentLoggedOut':
        return {
          ...state,
          flags: {
            ...state.flags,
            loginState: false,
            pauseState: false,
          },
          pauseReason: null,
          pauseStartedAt: null,
          lastLogoutAt: event.occurredAt,
        };
      case 'AgentPaused':
        return {
          ...state,
          flags: {
            ...state.flags,
            pauseState: true,
          },
          pauseReason: event.pauseReason,
          pauseStartedAt: event.occurredAt,
        };
      case 'AgentExitedPause':
        return {
          ...state,
          flags: {
            ...state.flags,
            pauseState: false,
          },
          pauseReason: null,
          pauseStartedAt: null,
          pauseTotalMs: state.pauseTotalMs + event.pauseDurationMs,
          lastPauseEndedAt: event.occurredAt,
        };
      default:
        return state;
    }
  },
};
