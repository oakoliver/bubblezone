import { describe, expect, test } from 'bun:test';
import { stringWidth } from '@oakoliver/lipgloss';
import { printableWidth, runeWidth } from '../src/index.ts';

describe('printableWidth', () => {
  test('ASCII', () => {
    expect(printableWidth('')).toBe(0);
    expect(printableWidth('hello world')).toBe(11);
  });

  test('skips CSI sequences', () => {
    expect(printableWidth('\x1b[1;38;2;1;2;3mhi\x1b[0m')).toBe(2);
    expect(printableWidth('\x1b[2K\x1b[?25lx')).toBe(1);
  });

  test('skips OSC and DCS strings up to BEL or ST', () => {
    expect(printableWidth('\x1b]0;a window title\x07ab')).toBe(2);
    expect(printableWidth('\x1b]8;;http://a.b/c\x1b\\ab\x1b]8;;\x1b\\')).toBe(2);
    expect(printableWidth('\x1bPq#0;2;0;0;0\x1b\\ab')).toBe(2);
  });

  test('skips two-byte escapes and a trailing lone ESC', () => {
    expect(printableWidth('\x1b7ab\x1b8')).toBe(2);
    expect(printableWidth('ab\x1b')).toBe(2);
  });

  test('controls and combining marks are zero, wide is two', () => {
    expect(printableWidth('a\tb\r')).toBe(2);
    expect(printableWidth('é')).toBe(1);
    expect(printableWidth('漢字')).toBe(4);
    expect(printableWidth('ｱ')).toBe(1);
    expect(printableWidth('Ａ')).toBe(2);
    expect(printableWidth('✅')).toBe(2);
    expect(printableWidth('❤')).toBe(1);
    expect(runeWidth(0x200d)).toBe(0);
  });

  test('agrees with Lip Gloss stringWidth on text without ZWJ sequences', () => {
    const samples = [
      'plain text',
      '\x1b[31mred\x1b[0m and 漢字 and café',
      'box ─│┌┐└┘ █▓▒░ ●○ ▶ ✓',
      '\x1b]8;;https://example.com\x07link\x1b]8;;\x07 after',
      'Привет мир, γειά σου',
    ];
    for (const s of samples) expect(printableWidth(s)).toBe(stringWidth(s));
  });
});
