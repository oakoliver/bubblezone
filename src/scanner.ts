import { ZoneInfo } from './zoneinfo.js';
import { printableWidth } from './width.js';

// A marker is ESC [ <digits> z, a private CSI sequence (final byte 0x7A) that
// terminals ignore and that carries no printable width.
const tokens = /\x1b\[(\d+)z|\n/g;

/** Callbacks the scanner uses to talk to its manager. */
export interface ScanHost {
  /** Reports whether markers should be recorded (otherwise they are only stripped). */
  readonly enabled: boolean;
  /** Maps a marker sequence back to the ID given to `mark()`, or undefined if this manager did not create it. */
  resolve(rid: string): string | undefined;
  /** Called for each completed zone. */
  emit(zone: ZoneInfo): void;
}

/**
 * Strips every marker out of `input` and reports each zone whose start and end
 * markers were both found. Returns the cleaned view.
 *
 * Positions are measured on the cleaned text: columns are the printable width
 * of everything since the last newline, rows count newlines.
 */
export function scanView(host: ScanHost, input: string, iteration: number): string {
  if (input.indexOf('\x1b[') === -1 && input.indexOf('\n') === -1) return input;

  let out = '';
  let line = ''; // cleaned text since the last newline
  let rows = 0;
  let last = 0;
  const tracked = new Map<string, ZoneInfo>();

  tokens.lastIndex = 0;
  for (let m = tokens.exec(input); m !== null; m = tokens.exec(input)) {
    line += input.slice(last, m.index);
    last = m.index + m[0].length;

    if (m[0] === '\n') {
      out += line + '\n';
      line = '';
      rows++;
      continue;
    }
    if (!host.enabled) continue;

    const rid = m[0];
    const id = host.resolve(rid);
    if (id === undefined) continue; // not ours: strip it, record nothing
    const open = tracked.get(rid);
    if (open) {
      // The end sits on the last cell of the zone, not one past it.
      open.endX = printableWidth(line) - 1;
      open.endY = rows;
      host.emit(open);
      tracked.delete(rid);
    } else {
      tracked.set(rid, new ZoneInfo({ id, rid, iteration, startX: printableWidth(line), startY: rows }));
    }
  }
  return out + line + input.slice(last);
}
