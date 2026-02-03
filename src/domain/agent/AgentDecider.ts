import { AgentCommand } from './AgentCommands';
import { AgentState } from './AgentAggregate';
import { AgentDomainEvent } from './AgentDomainEvents';

export const AgentDecider = {
  decide(state: AgentState, command: AgentCommand): AgentDomainEvent[] {
    switch (command.type) {
      case 'LogInAgent': {
        if (state.flags.loginState) {
          return [];
        }
        return [{ type: 'AgentLoggedIn', occurredAt: command.occurredAt }];
      }
      case 'LogOutAgent': {
        if (!state.flags.loginState) {
          return [];
        }
        const events: AgentDomainEvent[] = [];
        if (state.flags.pauseState) {
          const pauseDurationMs = state.pauseStartedAt
            ? command.occurredAt.getTime() - state.pauseStartedAt.getTime()
            : 0;
          events.push({
            type: 'AgentExitedPause',
            occurredAt: command.occurredAt,
            pauseDurationMs,
          });
        }
        events.push({ type: 'AgentLoggedOut', occurredAt: command.occurredAt });
        return events;
      }
      case 'EnterPause': {
        if (!state.flags.loginState || state.flags.pauseState) {
          return [];
        }
        return [
          {
            type: 'AgentPaused',
            occurredAt: command.occurredAt,
            pauseReason: command.pauseReason,
          },
        ];
      }
      case 'ExitPause': {
        if (!state.flags.loginState || !state.flags.pauseState) {
          return [];
        }
        const pauseDurationMs = state.pauseStartedAt
          ? command.occurredAt.getTime() - state.pauseStartedAt.getTime()
          : 0;
        return [
          {
            type: 'AgentExitedPause',
            occurredAt: command.occurredAt,
            pauseDurationMs,
          },
        ];
      }
      default:
        return [];
    }
  },
  evolve(state: AgentState, event: AgentDomainEvent): AgentState {
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
