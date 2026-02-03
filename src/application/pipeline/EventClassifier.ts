import { RawEvent } from './Translator';

export type EventStream = 'PRESENCE' | 'ANALYTICS';

export const EventClassifier = {
  classify(rawEvent: RawEvent): EventStream {
    const data4 = rawEvent.data4;
    if (typeof data4 === 'boolean') {
      return data4 ? 'ANALYTICS' : 'PRESENCE';
    }
    if (typeof data4 === 'string') {
      const normalized = data4.trim().toLowerCase();
      return normalized === 'true' ? 'ANALYTICS' : 'PRESENCE';
    }
    return 'PRESENCE';
  },
};
