import { AnalyticsCanonicalEvent } from '../../domain/analytics/AnalyticsCanonicalEvents';
import { AgentCommand } from '../../domain/agent/AgentCommands';
import { IdGenerator } from '../../shared/types/IdGenerator';
import { Clock } from '../../shared/types/Clock';

export type RawEvent = {
  eventId?: string;
  occurredAt?: string | Date;
  clientId: string;
  branchNumber: string;
  type: 'LOGIN' | 'LOGOUT' | 'PAUSA' | 'SAIUPAUSA';
  data1?: string | null;
  data4?: boolean | string;
  id_ext_fila?: string | null;
  queueExternalId?: string | null;
  sequenceId?: string | number | null;
  lastSequence?: string | number | null;
};

export type CanonicalPresenceEvent = {
  eventId: string;
  occurredAt: Date;
  clientId: string;
  branchNumber: string;
  type: RawEvent['type'];
  pauseReason: string | null;
  sequenceMeta: {
    sequenceId: string | null;
    lastSequence: string | null;
  };
};

export const Translator = {
  toPresenceCanonical(
    rawEvent: RawEvent,
    idGenerator: IdGenerator,
    clock: Clock,
  ): CanonicalPresenceEvent {
    const occurredAt = toDate(rawEvent.occurredAt, clock);
    return {
      eventId: rawEvent.eventId ?? idGenerator.generate(),
      occurredAt,
      clientId: rawEvent.clientId,
      branchNumber: rawEvent.branchNumber,
      type: rawEvent.type,
      pauseReason: rawEvent.type === 'PAUSA' ? rawEvent.data1 ?? null : null,
      sequenceMeta: {
        sequenceId: normalizeString(rawEvent.sequenceId),
        lastSequence: normalizeString(rawEvent.lastSequence),
      },
    };
  },
  toCommand(canonical: CanonicalPresenceEvent): AgentCommand {
    switch (canonical.type) {
      case 'LOGIN':
        return { type: 'LogInAgent', occurredAt: canonical.occurredAt };
      case 'LOGOUT':
        return { type: 'LogOutAgent', occurredAt: canonical.occurredAt };
      case 'PAUSA':
        return {
          type: 'EnterPause',
          occurredAt: canonical.occurredAt,
          pauseReason: canonical.pauseReason,
        };
      case 'SAIUPAUSA':
        return { type: 'ExitPause', occurredAt: canonical.occurredAt };
    }
  },
  toAnalyticsCanonical(
    rawEvent: RawEvent,
    idGenerator: IdGenerator,
    clock: Clock,
  ): AnalyticsCanonicalEvent {
    const occurredAt = toDate(rawEvent.occurredAt, clock);
    const queueExternalId =
      rawEvent.queueExternalId ?? rawEvent.id_ext_fila ?? null;
    if (rawEvent.type === 'LOGIN') {
      return {
        type: 'AgentQueueMembershipEnqueueReceived',
        eventId: rawEvent.eventId ?? idGenerator.generate(),
        occurredAt,
        clientId: rawEvent.clientId,
        branchNumber: rawEvent.branchNumber,
        queueExternalId,
        sourceRawType: 'LOGIN',
      };
    }
    return {
      type: 'AgentQueueMembershipDequeueReceived',
      eventId: rawEvent.eventId ?? idGenerator.generate(),
      occurredAt,
      clientId: rawEvent.clientId,
      branchNumber: rawEvent.branchNumber,
      queueExternalId,
      sourceRawType: rawEvent.type === 'LOGOUT' ? 'LOGOUT' : 'LOGIN',
    };
  },
};

const normalizeString = (value: string | number | null | undefined): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  return String(value);
};

const toDate = (value: string | Date | undefined, clock: Clock): Date => {
  if (!value) {
    return clock.now();
  }
  return value instanceof Date ? value : new Date(value);
};
