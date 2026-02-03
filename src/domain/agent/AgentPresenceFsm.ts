import { AgentFlags } from './AgentAggregate';

export type PresenceState =
  | 'DESCONECTADO'
  | 'LIVRE'
  | 'PAUSADO'
  | 'CHAMANDO'
  | 'OCUPADO';

export const AgentPresenceFsm = {
  derivePresenceState(flags: AgentFlags): PresenceState {
    if (!flags.loginState) {
      return 'DESCONECTADO';
    }
    if (flags.inCall) {
      return 'OCUPADO';
    }
    if (flags.ringingState) {
      return 'CHAMANDO';
    }
    if (flags.pauseState) {
      return 'PAUSADO';
    }
    return 'LIVRE';
  },
};
