/**
 * @oakoliver/bubblezone: mouse hit-zones for Bubble Tea.
 *
 * Port of lrstanley/bubblezone (Go) for @oakoliver/bubbletea. Wrap the part of
 * a view you care about in `mark()`, run the whole view through `scan()` once,
 * and ask `get(id).inBounds(msg)` when a mouse event arrives.
 *
 * @module
 */

export { Manager, New } from './manager.js';
export { ZoneInfo } from './zoneinfo.js';
export type { MouseLike } from './zoneinfo.js';
export { MsgZoneInBounds } from './messages.js';
export { printableWidth, runeWidth } from './width.js';
export {
  DefaultManager,
  NewGlobal, Close, SetEnabled, Enabled, NewPrefix, Mark, Clear, Get, Scan,
  AnyInBounds, AnyInBoundsAndUpdate,
  newGlobal, close, setEnabled, enabled, newPrefix, mark, clear, get, scan,
  anyInBounds, anyInBoundsAndUpdate,
} from './global.js';
