import { beforeAll, describe, expect, test } from 'bun:test';
import { MouseButton, MouseClickMsg, MouseMotionMsg } from '@oakoliver/bubbletea';
import * as zone from '../src/index.ts';

const motion = (x: number, y: number) => new MouseMotionMsg({ x, y, button: MouseButton.None, mod: 0 });
const click = (x: number, y: number) => new MouseClickMsg({ x, y, button: MouseButton.Left, mod: 0 });

beforeAll(() => zone.NewGlobal());

// Starts at X:4, Y:2, ends at X:12, Y:3.
const view = () => zone.Scan('test\nfoo\naaa ' + zone.Mark('foo', 'bar\ntest123456789') + ' aaa\nbaz');

describe('ZoneInfo', () => {
  test('valid position', () => {
    view();
    const xy = zone.Get('foo');
    expect(xy.isZero()).toBe(false);
    expect([xy.startX, xy.startY, xy.endX, xy.endY]).toEqual([4, 2, 12, 3]);
    expect([xy.width, xy.height]).toEqual([9, 2]);
  });

  test('in bounds', () => {
    view();
    const xy = zone.Get('foo');
    expect(xy.inBounds(motion(0, 0))).toBe(false); // outside left
    expect(xy.inBounds(motion(3, 3))).toBe(false); // directly left
    expect(xy.inBounds(motion(99, 99))).toBe(false); // outside right
    expect(xy.inBounds(motion(13, 3))).toBe(false); // directly right
    expect(xy.inBounds(motion(4, 1))).toBe(false); // above
    expect(xy.inBounds(motion(4, 4))).toBe(false); // below
    expect(xy.inBounds(motion(4, 2))).toBe(true); // top-left
    expect(xy.inBounds(motion(12, 3))).toBe(true); // bottom-right

    // A zone whose end is before its start never matches.
    zone.Scan('test ' + zone.Mark('foo', 'bar\nt') + ' other things here');
    expect(zone.Get('foo').inBounds(motion(2, 1))).toBe(false);
  });

  test('in bounds, zero zones', () => {
    expect(new zone.ZoneInfo().inBounds(motion(0, 0))).toBe(false);
    expect(zone.Get('non-existent').inBounds(motion(0, 0))).toBe(false);
  });

  test('pos', () => {
    view();
    const xy = zone.Get('foo');
    expect(xy.pos(motion(4, 2))).toEqual([0, 0]);
    expect(xy.pos(motion(5, 2))).toEqual([1, 0]);
    expect(xy.pos(motion(12, 3))).toEqual([8, 1]);
    expect(xy.pos(motion(0, 0))).toEqual([-1, -1]);
    expect(new zone.ZoneInfo().pos(motion(0, 0))).toEqual([-1, -1]);
    expect(zone.Get('non-existent').pos(motion(0, 0))).toEqual([-1, -1]);
  });

  test('accepts plain { x, y } and every mouse message type', () => {
    view();
    const xy = zone.Get('foo');
    expect(xy.inBounds({ x: 5, y: 2 })).toBe(true);
    expect(xy.inBounds(click(5, 2))).toBe(true);
    expect(xy.pos({ x: 6, y: 3 })).toEqual([2, 1]);
  });
});

describe('measuring', () => {
  test('wide characters count as two cells', () => {
    zone.Scan('漢字' + zone.Mark('w', 'ab'));
    expect(zone.Get('w').startX).toBe(4);
    expect(zone.Get('w').endX).toBe(5);
  });

  test('combining marks and styling do not count', () => {
    zone.Scan('é\x1b[1;31mx\x1b[0m' + zone.Mark('c', 'ab'));
    expect(zone.Get('c').startX).toBe(2);
  });

  test('OSC hyperlinks do not count (upstream would stop at the first letter of the URL)', () => {
    const link = '\x1b]8;;https://example.com/path\x07link\x1b]8;;\x07';
    zone.Scan(link + zone.Mark('h', 'ab'));
    expect(zone.Get('h').startX).toBe(4);
    const st = '\x1b]8;;https://example.com/path\x1b\\link\x1b]8;;\x1b\\';
    zone.Scan(st + zone.Mark('h', 'ab'));
    expect(zone.Get('h').startX).toBe(4);
  });

  test('a zone on the last line works without a trailing newline', () => {
    zone.Scan('a\nb\n' + zone.Mark('last', 'xyz'));
    const z = zone.Get('last');
    expect([z.startX, z.startY, z.endX, z.endY]).toEqual([0, 2, 2, 2]);
  });

  test('the same id marked twice: the last one wins, like upstream', () => {
    zone.Scan(zone.Mark('t', 'aa') + '\n' + zone.Mark('t', 'bb'));
    expect(zone.Get('t').startY).toBe(1);
  });
});
