import { Batch } from '@oakoliver/bubbletea';
import type { Cmd, Model, MouseMsg } from '@oakoliver/bubbletea';
import { MsgZoneInBounds } from './messages.js';
import { scanView } from './scanner.js';
import { ZoneInfo } from './zoneinfo.js';
import type { MouseLike } from './zoneinfo.js';

// The markers are ANSI escape codes, so Lip Gloss does not count them as part
// of the width of a view: ESC [ <number> z. Sequences whose final byte is
// 0x70-0x7E are "private" and terminals are free to ignore them.
const IDENT_START = '\x1b';
const IDENT_BRACKET = '[';
const IDENT_END = 'z';

// Shared by every manager, like upstream's package-level counters.
let markerCounter = 1000;
let prefixCounter = 0;
let scanCounter = 0;

/**
 * Parses zone information from the output of your components and stores it for
 * later bounds checks. Enabled by default.
 */
export class Manager {
  #enabled = true;
  #closed = false;
  #zones = new Map<string, ZoneInfo>();
  #ids = new Map<string, string>(); // user ID -> marker sequence
  #rids = new Map<string, string>(); // marker sequence -> user ID

  /** Stops the manager. Later scans still strip markers but no longer store zones. */
  close(): void {
    this.#closed = true;
  }

  /**
   * Enables or disables the manager. When disabled, `mark()` returns its input
   * unchanged and `scan()` only strips markers (from views cached earlier).
   * Disabling also forgets every stored zone.
   */
  setEnabled(enabled: boolean): void {
    this.#enabled = enabled;
    if (!enabled) this.#zones.clear();
  }

  /** Reports whether the manager is enabled. */
  enabled(): boolean {
    return this.#enabled;
  }

  /**
   * Returns a prefix that is unique across calls, for components that build zone
   * IDs of their own and must not collide with a sibling instance:
   * `zone.mark(this.id + 'item-3', row)`.
   */
  newPrefix(): string {
    return 'zone_' + String(++prefixCounter) + '__';
  }

  /**
   * Wraps `v` in a start and end marker so `scan()` can find where it ended up
   * on screen. Returns `v` unchanged when the manager is disabled or when `id`
   * or `v` is empty.
   */
  mark(id: string, v: string): string {
    if (!this.#enabled) return v;
    if (id === '' || v === '') return v;

    let gid = this.#ids.get(id);
    if (gid === undefined) {
      gid = IDENT_START + IDENT_BRACKET + String(++markerCounter) + IDENT_END;
      this.#ids.set(id, gid);
      this.#rids.set(gid, id);
    }
    return gid + v + gid;
  }

  /** Forgets the stored zone for `id`. It is recorded again by the next scan that sees it. */
  clear(id: string): void {
    this.#zones.delete(id);
  }

  /**
   * Returns the zone stored for `id`. For an ID that is not known (yet) it
   * returns a zero zone whose `isZero()` is true and whose `inBounds()` is
   * false, so `get('x').inBounds(msg)` is always safe to call.
   */
  get(id: string): ZoneInfo {
    return this.#zones.get(id) ?? new ZoneInfo();
  }

  /**
   * Strips the markers out of a view and records where each zone is. Call it
   * once, on the outermost view, not inside child components.
   *
   * Unlike upstream, which hands the zones to a background worker, the zones are
   * stored before `scan()` returns, so `get()` right afterwards sees them.
   */
  scan(v: string): string {
    const iteration = ++scanCounter;
    const found: ZoneInfo[] = [];
    const out = scanView(
      {
        enabled: this.#enabled,
        resolve: (rid) => this.#rids.get(rid),
        emit: (zone) => found.push(zone),
      },
      v,
      iteration,
    );
    if (this.#closed) return out;

    // Same bookkeeping as upstream's worker: store this scan's zones (the last
    // one wins when an ID is marked more than once), then drop zones that were
    // not seen in this scan.
    for (const zone of found) this.#zones.set(zone.id, zone);
    for (const [id, zone] of this.#zones) {
      if (zone.iteration !== iteration) this.#zones.delete(id);
    }
    return out;
  }

  #findInBounds(mouse: MouseLike): ZoneInfo[] {
    const ids = [...this.#zones.keys()].sort();
    const hit: ZoneInfo[] = [];
    for (const id of ids) {
      const zone = this.#zones.get(id)!;
      if (zone.inBounds(mouse)) hit.push(zone);
    }
    return hit;
  }

  /**
   * Sends a `MsgZoneInBounds` to `model.update()` for every zone the mouse event
   * is inside, in alphabetical order of their IDs. The results of `update()` are
   * discarded.
   */
  anyInBounds(model: Model, mouse: MouseMsg): void {
    for (const zone of this.#findInBounds(mouse)) {
      model.update(new MsgZoneInBounds(zone, mouse));
    }
  }

  /**
   * Like `anyInBounds()`, but the model returned by each `update()` is passed to
   * the next one and returned at the end; the commands are combined with `Batch`.
   */
  anyInBoundsAndUpdate(model: Model, mouse: MouseMsg): [Model, Cmd] {
    const cmds: Cmd[] = [];
    for (const zone of this.#findInBounds(mouse)) {
      let cmd: Cmd;
      [model, cmd] = model.update(new MsgZoneInBounds(zone, mouse));
      cmds.push(cmd);
    }
    return [model, Batch(...cmds)];
  }
}

/**
 * Creates a manager that is not global. Give it to the components that mark
 * zones and to the root model that scans.
 */
export function New(): Manager {
  return new Manager();
}
