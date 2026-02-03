import { AgentDecider } from './AgentDecider';
import { AgentState } from './AgentAggregate';

const baseState = (overrides?: Partial<AgentState>): AgentState => ({
  ...AgentState.initial('client:branch', 'client', 'branch'),
  ...overrides,
});

describe('AgentDecider', () => {
  it('LogInAgent when logged out emits AgentLoggedIn', () => {
    const state = baseState();
    const events = AgentDecider.decide(state, {
      type: 'LogInAgent',
      occurredAt: new Date('2024-01-01T10:00:00Z'),
    });

    expect(events).toEqual([
      { type: 'AgentLoggedIn', occurredAt: new Date('2024-01-01T10:00:00Z') },
    ]);
  });

  it('LogInAgent when logged in emits no events', () => {
    const state = baseState({ flags: { ...baseState().flags, loginState: true } });
    const events = AgentDecider.decide(state, {
      type: 'LogInAgent',
      occurredAt: new Date('2024-01-01T10:00:00Z'),
    });

    expect(events).toEqual([]);
  });

  it('EnterPause when logged out emits no events', () => {
    const state = baseState();
    const events = AgentDecider.decide(state, {
      type: 'EnterPause',
      occurredAt: new Date('2024-01-01T10:00:00Z'),
      pauseReason: 'break',
    });

    expect(events).toEqual([]);
  });

  it('EnterPause when logged in and not paused emits AgentPaused', () => {
    const state = baseState({ flags: { ...baseState().flags, loginState: true } });
    const events = AgentDecider.decide(state, {
      type: 'EnterPause',
      occurredAt: new Date('2024-01-01T10:00:00Z'),
      pauseReason: 'break',
    });

    expect(events).toEqual([
      {
        type: 'AgentPaused',
        occurredAt: new Date('2024-01-01T10:00:00Z'),
        pauseReason: 'break',
      },
    ]);
  });

  it('ExitPause when not paused emits no events', () => {
    const state = baseState({ flags: { ...baseState().flags, loginState: true } });
    const events = AgentDecider.decide(state, {
      type: 'ExitPause',
      occurredAt: new Date('2024-01-01T10:00:00Z'),
    });

    expect(events).toEqual([]);
  });

  it('LogOutAgent when paused emits exit pause then logout', () => {
    const state = baseState({
      flags: { ...baseState().flags, loginState: true, pauseState: true },
      pauseStartedAt: new Date('2024-01-01T09:00:00Z'),
    });
    const events = AgentDecider.decide(state, {
      type: 'LogOutAgent',
      occurredAt: new Date('2024-01-01T10:00:00Z'),
    });

    expect(events).toEqual([
      {
        type: 'AgentExitedPause',
        occurredAt: new Date('2024-01-01T10:00:00Z'),
        pauseDurationMs: 60 * 60 * 1000,
      },
      { type: 'AgentLoggedOut', occurredAt: new Date('2024-01-01T10:00:00Z') },
    ]);
  });
});
