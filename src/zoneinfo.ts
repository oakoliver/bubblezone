import type { Mouse, MouseMsg } from '@oakoliver/bubbletea';

/** Something that carries a mouse position: a Bubble Tea `MouseMsg` or a plain `{ x, y }`. */
export type MouseLike = MouseMsg | Pick<Mouse, 'x' | 'y'>;

function position(msg: MouseLike): { x: number; y: number } {
  const m = msg as { mouse?: () => Mouse; x?: number; y?: number };
  if (typeof m.mouse === 'function') return m.mouse();
  return { x: m.x as number, y: m.y as number };
}

/**
 * Holds the start and end cells of a zone. All coordinates are zero-based and
 * inclusive: `(endX, endY)` is the bottom-right cell that belongs to the zone.
 */
export class ZoneInfo {
  /** The ID passed to `mark()`; empty for a zone that is not known yet. */
  readonly id: string;
  /** @internal The generated marker sequence that stands for `id` in a view. */
  readonly rid: string;
  /** @internal The scan this zone came from, used to drop stale zones. */
  readonly iteration: number;

  /** X of the top-left cell of the zone. */
  startX: number;
  /** Y of the top-left cell of the zone. */
  startY: number;
  /** X of the bottom-right cell of the zone. */
  endX: number;
  /** Y of the bottom-right cell of the zone. */
  endY: number;

  constructor(init: {
    id?: string;
    rid?: string;
    iteration?: number;
    startX?: number;
    startY?: number;
    endX?: number;
    endY?: number;
  } = {}) {
    this.id = init.id ?? '';
    this.rid = init.rid ?? '';
    this.iteration = init.iteration ?? 0;
    this.startX = init.startX ?? 0;
    this.startY = init.startY ?? 0;
    this.endX = init.endX ?? 0;
    this.endY = init.endY ?? 0;
  }

  /** Reports whether the zone is not known (yet). `Manager.get()` returns such a zone for unknown IDs. */
  isZero(): boolean {
    return this.id === '';
  }

  /**
   * Reports whether the mouse event is inside the box between the start and end
   * cells. Unknown zones are never in bounds. A zone whose end lies before its
   * start (for example text that wrapped onto the next line) is never in bounds
   * either; for shapes a box cannot describe, do the check yourself.
   */
  inBounds(msg: MouseLike): boolean {
    if (this.isZero()) return false;
    if (this.startX > this.endX || this.startY > this.endY) return false;
    const { x, y } = position(msg);
    if (x < this.startX || y < this.startY) return false;
    if (x > this.endX || y > this.endY) return false;
    return true;
  }

  /**
   * Returns the event position relative to the zone, with (0, 0) at its top-left
   * cell, or `[-1, -1]` if the zone is unknown or the event is outside it.
   */
  pos(msg: MouseLike): [x: number, y: number] {
    if (this.isZero() || !this.inBounds(msg)) return [-1, -1];
    const { x, y } = position(msg);
    return [x - this.startX, y - this.startY];
  }

  /** Width in cells (0 for an unknown or inverted zone). */
  get width(): number {
    return this.isZero() || this.endX < this.startX ? 0 : this.endX - this.startX + 1;
  }

  /** Height in rows (0 for an unknown or inverted zone). */
  get height(): number {
    return this.isZero() || this.endY < this.startY ? 0 : this.endY - this.startY + 1;
  }
}
