import { AgentPresenceFsm } from './AgentPresenceFsm';

const baseFlags = {
  loginState: false,
  pauseState: false,
  inCall: false,
  ringingState: false,
};

describe('AgentPresenceFsm', () => {
  it('returns DESCONECTADO when not logged in', () => {
    expect(AgentPresenceFsm.derivePresenceState(baseFlags)).toBe('DESCONECTADO');
  });

  it('returns LIVRE when logged in and idle', () => {
    expect(
      AgentPresenceFsm.derivePresenceState({
        ...baseFlags,
        loginState: true,
      }),
    ).toBe('LIVRE');
  });

  it('returns PAUSADO when logged in and paused', () => {
    expect(
      AgentPresenceFsm.derivePresenceState({
        ...baseFlags,
        loginState: true,
        pauseState: true,
      }),
    ).toBe('PAUSADO');
  });

  it('returns OCUPADO when logged in and in call', () => {
    expect(
      AgentPresenceFsm.derivePresenceState({
        ...baseFlags,
        loginState: true,
        inCall: true,
      }),
    ).toBe('OCUPADO');
  });

  it('returns CHAMANDO when logged in and ringing', () => {
    expect(
      AgentPresenceFsm.derivePresenceState({
        ...baseFlags,
        loginState: true,
        ringingState: true,
      }),
    ).toBe('CHAMANDO');
  });
});
