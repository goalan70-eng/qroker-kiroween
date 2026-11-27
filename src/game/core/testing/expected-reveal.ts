import type { RevealRecord } from '../state';
import type { IdentityVisibility } from '../types';

/** Expected public record from the sealed scoring result, independent of the view projector. */
export function expectedReveal(record: RevealRecord, mode: IdentityVisibility): RevealRecord<number | null> {
  if (mode === 'OWNER_ONLY' || mode === 'FACE_UP') return record;
  return {
    ...record,
    codes: record.codes.map(code => ({
      quadKey: code.quadKey,
      cards: [],
      hiddenSum: mode === 'BLIND_SCORE_ONLY' ? null : code.hiddenSum,
    })),
  };
}
