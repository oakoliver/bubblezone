import { describe, expect, test } from 'bun:test';
import { newStyle, roundedBorder } from '@oakoliver/lipgloss';
import * as zone from '../src/index.ts';

zone.NewGlobal();

const testStyle = newStyle()
  .foreground('#FFFFFF')
  .background('#383838')
  .bold(true)
  .italic(true)
  .blink(true);

const longStyle = newStyle()
  .foreground('#FFFFFF')
  .background('#383838')
  .bold(true)
  .italic(true)
  .blink(true)
  .underline(true)
  .border(roundedBorder())
  .borderForeground('#F12356')
  .borderBackground('#459082')
  .padding(5, 4);

const { Mark } = zone;

interface Case {
  name: string;
  input: string;
  want: string;
  ids: string[];
}
const c = (name: string, input: string, want: string, ids: string[] = []): Case => ({ name, input, want, ids });
const rep = (s: string, n: number) => s.repeat(n);

// Port of the table in manager_test.go (TestMain).
const testsScan: Case[] = [
  c('empty', '', ''),
  c('single', 'a', 'a'),
  c('double', 'aa', 'aa'),
  c('triple', 'aaa', 'aaa'),
  c('quad', 'aaaa', 'aaaa'),
  c('lipgloss-empty', testStyle.render(''), testStyle.render('')),
  c('lipgloss-basic', testStyle.render('testing'), testStyle.render('testing')),
  c('lipgloss-basic-start', 'a' + testStyle.render('testing'), 'a' + testStyle.render('testing')),
  c('lipgloss-basic-end', testStyle.render('testing') + 'a', testStyle.render('testing') + 'a'),
  c('lipgloss-basic-start-end', 'a' + testStyle.render('testing') + 'a', 'a' + testStyle.render('testing') + 'a'),
  c(
    'lipgloss-basic-between',
    testStyle.render('testing') + 'a' + testStyle.render('testing'),
    testStyle.render('testing') + 'a' + testStyle.render('testing'),
  ),
  c('id-empty', Mark('testing1', ''), ''),
  c('id-single-start', 'a' + Mark('testing2', 'a'), 'aa', ['testing2']),
  c('id-single-end', Mark('testing3', 'a') + 'a', 'aa', ['testing3']),
  c('id-single-start-end', 'a' + Mark('testing4', 'b') + 'a', 'aba', ['testing4']),
  c('id-single-between', Mark('testing5', 'b') + 'a' + Mark('testing6', 'b'), 'bab', ['testing5', 'testing6']),
  c('id-with-lipgloss-start', testStyle.render(Mark('testing7', 'testing') + 'testing'), testStyle.render('testingtesting'), ['testing7']),
  c('id-with-lipgloss-end', testStyle.render('testing' + Mark('testing8', 'testing')), testStyle.render('testingtesting'), ['testing8']),
  c('id-multi-empty', Mark('foo1', '') + Mark('bar1', ''), ''),
  c('id-multi-start', 'a' + Mark('foo2', 'b') + Mark('bar2', 'c'), 'abc', ['foo2', 'bar2']),
  c('id-multi-end', Mark('foo3', 'a') + Mark('bar3', 'b') + 'c', 'abc', ['foo3', 'bar3']),
  c('id-multi-start-end', 'a' + Mark('foo4', 'b') + Mark('bar4', 'c') + 'd', 'abcd', ['foo4', 'bar4']),
  c('inception', Mark('foo', Mark('bar', 'b')), 'b', ['foo', 'bar']),
  c('long-x1', 'a' + Mark('longtest5', longStyle.render('testing')) + 'a', 'a' + longStyle.render('testing') + 'a', ['longtest5']),
  ...[2, 4, 6, 8, 10].map((n) =>
    c(
      `long-x${n}`,
      rep('a' + Mark('longtest', longStyle.render('testing')) + 'a', n),
      rep('a' + longStyle.render('testing') + 'a', n),
      ['longtest'],
    ),
  ),
  c('invalid-no-bracket', 'a\x1B12345Zb', 'a\x1B12345Zb'),
  c('invalid-no-bracket-end', 'a\x1B', 'a\x1B'),
  c('invalid-no-numbers', 'a\x1BZb', 'a\x1BZb'),
  c('invalid-no-numbers-end', 'a\x1BZ', 'a\x1BZ'),
  c('invalid-marker-end', 'a\x1B12345b', 'a\x1B12345b'),
  c('invalid-marker-end-2', 'a\x1B12345', 'a\x1B12345'),
  c('invalid-run-of-numbers', 'a\x1B12345b6Z', 'a\x1B12345b6Z'),
  c('invalid-misc', '\x1Ba\x1B\x1B\x1B12345b6Z\x1B', '\x1Ba\x1B\x1B\x1B12345b6Z\x1B'),
];

describe('scan', () => {
  for (const t of testsScan) {
    test(t.name, () => {
      expect(zone.Scan(t.input)).toBe(t.want);
      // Unlike upstream, no sleep is needed: zones are stored before scan returns.
      for (const id of t.ids) expect(zone.Get(id).isZero()).toBe(false);
    });
  }

  test('scan of a view without markers returns the same string', () => {
    const v = 'plain\n' + testStyle.render('styled') + '\nend';
    expect(zone.Scan(v)).toBe(v);
  });

  test('fuzz-style: random bytes never throw and never grow the output', () => {
    let seed = 1;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const alphabet = ['\x1b', '[', 'z', '0', '1', '9', '\n', 'a', 'é', '漢', '\x07', ';', 'm'];
    for (let i = 0; i < 2000; i++) {
      let s = '';
      const n = Math.floor(rnd() * 30);
      for (let j = 0; j < n; j++) s += alphabet[Math.floor(rnd() * alphabet.length)];
      const out = zone.Scan(s);
      expect(out.length).toBeLessThanOrEqual(s.length);
    }
  });
});

describe('scan, disabled', () => {
  for (const t of testsScan) {
    test(t.name, () => {
      const zm = zone.New();
      zm.setEnabled(false);
      expect(zm.scan(t.input)).toBe(t.want);
    });
  }

  test('markers made while enabled are stripped, and nothing is stored', () => {
    const zm = zone.New();
    const view = 'a' + zm.mark('x', 'b') + 'c';
    zm.setEnabled(false);
    expect(zm.scan(view)).toBe('abc');
    expect(zm.get('x').isZero()).toBe(true);
  });

  test('disabling forgets stored zones', () => {
    const zm = zone.New();
    zm.scan('a' + zm.mark('x', 'b'));
    expect(zm.get('x').isZero()).toBe(false);
    zm.setEnabled(false);
    expect(zm.get('x').isZero()).toBe(true);
    expect(zm.enabled()).toBe(false);
  });
});

describe('mark', () => {
  test('wraps with the same marker on both sides and keeps it per id', () => {
    const zm = zone.New();
    const a = zm.mark('a', 'text');
    expect(a).toMatch(/^\x1b\[\d+ztext\x1b\[\d+z$/);
    expect(zm.mark('a', 'other')).toStartWith(a.slice(0, a.indexOf('text')));
    expect(zm.mark('b', 'text')).not.toBe(a);
  });

  test('first 10 cases of the table mark and scan', () => {
    let out = '';
    for (const t of testsScan.slice(0, 10)) out += Mark(t.name, t.input);
    zone.Scan(out);
    for (const t of testsScan.slice(0, 10)) zone.Get(t.name);
  });

  test('disabled manager returns input unchanged', () => {
    const zm = zone.New();
    zm.setEnabled(false);
    for (const t of testsScan.slice(0, 10)) expect(zm.mark(t.name, t.input)).toBe(t.input);
  });

  test('empty id or empty content is returned as is', () => {
    expect(Mark('', 'x')).toBe('x');
    expect(Mark('x', '')).toBe('');
  });

  test('markers have no printable width', () => {
    const marked = Mark('w', 'abc');
    expect(zone.printableWidth(marked)).toBe(3);
  });
});

describe('lifecycle', () => {
  test('a zone from an earlier scan is gone after a scan without it (TestWorkerClear)', () => {
    zone.Scan('a' + Mark('foo', 'b') + 'c');
    zone.Scan('a' + Mark('bar', 'b') + 'c');
    expect(zone.Get('foo').isZero()).toBe(true);
    expect(zone.Get('bar').isZero()).toBe(false);
  });

  test('clear', () => {
    zone.Scan('a' + Mark('foo', 'b') + 'c');
    zone.Clear('foo');
    expect(zone.Get('foo').isZero()).toBe(true);
  });

  test('close: a closed manager strips markers but stores nothing', () => {
    const zm = zone.New();
    zm.close();
    expect(zm.scan('a' + zm.mark('foo', 'b') + 'c')).toBe('abc');
    expect(zm.get('foo').isZero()).toBe(true);
  });

  test('NewGlobal twice is fine', () => {
    zone.NewGlobal();
    zone.NewGlobal();
    expect(zone.DefaultManager).toBeDefined();
  });

  test('the global functions fail clearly without a global manager', async () => {
    const mod = await import('../src/global.ts?fresh');
    expect(() => mod.Mark('a', 'b')).toThrow('manager not initialized');
  });

  test('newPrefix is unique', () => {
    const a = zone.NewPrefix();
    const b = zone.NewPrefix();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^zone_\d+__$/);
  });

  test('two managers do not see each other zones', () => {
    const a = zone.New();
    const b = zone.New();
    const view = 'x' + a.mark('id', 'yy');
    expect(b.scan(view)).toBe('xyy'); // foreign markers are stripped
    expect(b.get('id').isZero()).toBe(true);
    a.scan(view);
    expect(a.get('id').isZero()).toBe(false);
  });
});
