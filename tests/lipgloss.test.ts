import { beforeAll, describe, expect, test } from 'bun:test';
import {
  newStyle, joinHorizontal, joinVertical, place, roundedBorder, newLayer, newCompositor,
  Top, Left, Center, stringWidth, width, truncate, sliceAnsi,
} from '@oakoliver/lipgloss';
import * as zone from '../src/index.ts';

beforeAll(() => zone.NewGlobal());

const box = (z: zone.ZoneInfo) => [z.startX, z.startY, z.endX, z.endY];

describe('zones through Lip Gloss layout', () => {
  test('markers add no width', () => {
    const marked = zone.Mark('w', newStyle().padding(0, 2).render('OK'));
    expect(width(marked)).toBe(6);
    expect(stringWidth(marked)).toBe(6);
  });

  test('joinHorizontal, border and padding shift the zone as drawn', () => {
    const btn = zone.Mark('ok', newStyle().padding(0, 2).background('#7D56F4').render('OK'));
    const panel = newStyle().border(roundedBorder()).padding(1, 2).render(btn);
    const out = zone.Scan(joinHorizontal(Top, 'LEFT\nPANE', panel));
    // "LEFT" (4) + border (1) + padding (2) = column 7; row: border (1) + padding (1) = 2
    expect(box(zone.Get('ok'))).toEqual([7, 2, 12, 2]);
    // the cells at the box are the button's cells
    const row = out.split('\n')[2]!;
    expect(row.replace(/\x1b\[[0-9;]*m/g, '').slice(7, 13)).toBe('  OK  ');
  });

  test('joinVertical keeps each zone on its own rows', () => {
    zone.Scan(joinVertical(Left, zone.Mark('a', 'aaa'), zone.Mark('b', 'bbbbb')));
    expect(box(zone.Get('a'))).toEqual([0, 0, 2, 0]);
    expect(box(zone.Get('b'))).toEqual([0, 1, 4, 1]);
  });

  test('place centres a zone', () => {
    zone.Scan(place(21, 5, Center, Center, zone.Mark('mid', 'abc')));
    expect(box(zone.Get('mid'))).toEqual([9, 2, 11, 2]);
  });

  test('a multi-line zone is a box from its first cell to its last', () => {
    zone.Scan('..' + zone.Mark('m', 'abcd\nefgh\nijkl'));
    expect(box(zone.Get('m'))).toEqual([2, 0, 3, 2]); // starts at x=2, but ends at the last cell of the last line
  });

  test('text wrapped by a width constraint breaks the box (documented limit)', () => {
    const out = newStyle().width(10).render('aaaa ' + zone.Mark('lnk', 'bbbb cccc') + ' dddd');
    zone.Scan(out);
    const z = zone.Get('lnk');
    expect(z.isZero()).toBe(false);
    expect(z.startY).toBeLessThanOrEqual(z.endY);
    // The zone starts on one line and ends on the next, at a column before its start.
    expect(z.startX).toBeGreaterThan(z.endX);
    expect(z.inBounds({ x: z.startX, y: z.startY })).toBe(false);
  });

  test('maxWidth keeps both markers when the cut falls inside the zone', () => {
    const out = newStyle().maxWidth(10).render(zone.Mark('t', 'abcdefghijklmnopqrstuvwxyz'));
    zone.Scan(out);
    expect(box(zone.Get('t'))).toEqual([0, 0, 9, 0]);
  });

  test('truncate and sliceAnsi keep the markers: a cut zone shrinks, a zone cut off entirely is empty', () => {
    const line = 'ab' + zone.Mark('z', 'cdefgh') + 'ij';
    const at = (s: string) => { zone.Scan(s); return box(zone.Get('z')); };
    expect(at(truncate(line, 20))).toEqual([2, 0, 7, 0]);
    expect(at(truncate(line, 4))).toEqual([2, 0, 3, 0]); // cut inside the zone
    expect(at(sliceAnsi(line, 4))).toEqual([0, 0, 3, 0]); // the right-hand piece starts a new zone at column 0
    zone.Scan(truncate(line, 2)); // cut before the zone: an empty zone, nothing is in bounds
    expect(zone.Get('z').isZero()).toBe(false);
    expect(zone.Get('z').inBounds({ x: 2, y: 0 })).toBe(false);
  });

  test('Lip Gloss compositor strips the markers, so nothing is found (documented limit)', () => {
    const base = newStyle().render('.'.repeat(20) + '\n' + '.'.repeat(20));
    const top = zone.Mark('layer', 'XX');
    const out = newCompositor(newLayer(base).z(0), newLayer(top).x(3).y(1).z(1)).render();
    zone.Scan(out);
    expect(out).toContain('XX');
    expect(zone.Get('layer').isZero()).toBe(true);
  });
});
