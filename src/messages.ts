import type { MouseMsg } from '@oakoliver/bubbletea';
import type { ZoneInfo } from './zoneinfo.js';

/**
 * Sent to a model by `anyInBounds()` for each zone a mouse event landed in.
 * Recognised by `_tag`, like the Bubble Tea messages.
 */
export class MsgZoneInBounds {
  readonly _tag = 'MsgZoneInBounds' as const;

  constructor(
    /** The zone that is in bounds. */
    public readonly zone: ZoneInfo,
    /** The mouse event that caused it. */
    public readonly event: MouseMsg,
  ) {}
}
