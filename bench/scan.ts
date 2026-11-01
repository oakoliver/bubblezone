/**
 * Measures mark() and scan() on views of three sizes, built with Lip Gloss so the lines
 * carry real styling. Run: bun bench/scan.ts
 * Prints the median and the spread of 5 rounds per case; each round times many calls.
 */
import { newStyle, joinHorizontal, Top, roundedBorder } from '@oakoliver/lipgloss';
import * as zone from '../src/index.ts';

const zm = zone.New();

function view(cols: number, rows: number, zones: number, marked: boolean): string {
  const lines: string[] = [];
  const perRow = Math.max(1, Math.ceil(zones / rows));
  let n = 0;
  for (let y = 0; y < rows; y++) {
    let line = '';
    for (let i = 0; i < perRow && n < zones; i++, n++) {
      const label = newStyle().foreground('#CDD6F4').background(n % 2 ? '#313244' : '#45475A').render(` item ${n} `);
      line += marked ? zm.mark('z' + n, label) : label;
      line += ' ';
    }
    lines.push(line + ' '.repeat(Math.max(0, cols - 4 - line.length)));
  }
  const box = newStyle().border(roundedBorder()).borderForeground('#B4BEFE').render(lines.join('\n'));
  return joinHorizontal(Top, box);
}

const cases: Array<[string, number, number, number]> = [
  ['80x24, 10 zones', 80, 24, 10],
  ['120x40, 60 zones', 120, 40, 60],
  ['200x60, 600 zones', 200, 60, 600],
];

function timeIt(fn: () => void, iters: number): number {
  const t0 = performance.now();
  for (let i = 0; i < iters; i++) fn();
  return ((performance.now() - t0) / iters) * 1000; // microseconds per call
}
const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]!;

console.log('| view | zones | bytes | mark all (µs) | scan (µs) | scan, no zones (µs) |');
console.log('|---|---|---|---|---|---|');
for (const [name, cols, rows, zones] of cases) {
  const marked = view(cols, rows, zones, true);
  const plain = view(cols, rows, zones, false);
  const iters = zones > 100 ? 200 : 2000;
  timeIt(() => zm.scan(marked), 50); // warm up
  const scans: number[] = [], plains: number[] = [], marks: number[] = [];
  for (let r = 0; r < 5; r++) {
    scans.push(timeIt(() => zm.scan(marked), iters));
    plains.push(timeIt(() => zm.scan(plain), iters));
    marks.push(timeIt(() => { for (let i = 0; i < zones; i++) zm.mark('z' + i, 'x'); }, iters));
  }
  const fmt = (a: number[]) => `${median(a).toFixed(1)} (${Math.min(...a).toFixed(1)}–${Math.max(...a).toFixed(1)})`;
  console.log(`| ${name} | ${zones} | ${marked.length} | ${fmt(marks)} | ${fmt(scans)} | ${fmt(plains)} |`);
}
