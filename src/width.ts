/**
 * Cell-width measurement for the scanner.
 *
 * Upstream uses `runewidth.RuneWidth` on every code point of the text in front
 * of a marker and skips ANSI escape sequences by hand. This is the same idea
 * with two differences: OSC/DCS/APC/PM/SOS strings (hyperlinks, titles) are
 * skipped up to their BEL or ST terminator instead of the first letter, and the
 * width table is self-contained (no dependency).
 */

const ESC = 0x1b;
const BEL = 0x07;

const wideEmoji = /^\p{Emoji_Presentation}$/u;
const zeroWidth = /^[\p{Mn}\p{Me}\p{Cf}]$/u;

/** East Asian Wide and Fullwidth ranges (Unicode 15). */
function isWide(cp: number): boolean {
  return (
    cp >= 0x1100 &&
    (cp <= 0x115f ||
      cp === 0x2329 ||
      cp === 0x232a ||
      (cp >= 0x2e80 && cp <= 0x303e) ||
      (cp >= 0x3041 && cp <= 0x33ff) ||
      (cp >= 0x3400 && cp <= 0x4dbf) ||
      (cp >= 0x4e00 && cp <= 0xa4cf) ||
      (cp >= 0xa960 && cp <= 0xa97f) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe10 && cp <= 0xfe19) ||
      (cp >= 0xfe30 && cp <= 0xfe6f) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) ||
      (cp >= 0x16fe0 && cp <= 0x16fe4) ||
      (cp >= 0x17000 && cp <= 0x18cff) ||
      (cp >= 0x1b000 && cp <= 0x1b2ff) ||
      (cp >= 0x20000 && cp <= 0x3fffd))
  );
}

/** Printable width of one code point: 0 for controls and combining marks, 2 for wide, else 1. */
export function runeWidth(cp: number): number {
  if (cp < 0x20 || (cp >= 0x7f && cp < 0xa0)) return 0;
  if (cp < 0x300) return 1;
  if (cp === 0x200b || cp === 0x200d || (cp >= 0xfe00 && cp <= 0xfe0f)) return 0;
  if (isWide(cp)) return 2;
  if (zeroWidth.test(String.fromCodePoint(cp))) return 0;
  if (cp >= 0x231a && wideEmoji.test(String.fromCodePoint(cp))) return 2;
  return 1;
}

// Printable ASCII with no escape: the width is just the length.
const plain = /^[\x20-\x7e]*$/;

/**
 * Returns the number of terminal cells `s` occupies when printed, skipping
 * ANSI escape sequences.
 */
export function printableWidth(s: string): number {
  if (plain.test(s)) return s.length;
  let n = 0;
  for (let i = 0; i < s.length; ) {
    const cp = s.codePointAt(i)!;
    const len = cp > 0xffff ? 2 : 1;
    if (cp !== ESC) {
      n += runeWidth(cp);
      i += len;
      continue;
    }
    // Escape sequence.
    const next = s.charCodeAt(i + 1);
    if (Number.isNaN(next)) break;
    if (next === 0x5b) {
      // CSI: parameters 0x30-0x3f, intermediates 0x20-0x2f, final 0x40-0x7e.
      i += 2;
      while (i < s.length) {
        const c = s.charCodeAt(i++);
        if (c >= 0x40 && c <= 0x7e) break;
      }
    } else if (next === 0x5d || next === 0x50 || next === 0x5f || next === 0x5e || next === 0x58) {
      // OSC, DCS, APC, PM, SOS: string up to BEL or ST (ESC \).
      i += 2;
      while (i < s.length) {
        const c = s.charCodeAt(i);
        if (c === BEL) {
          i++;
          break;
        }
        if (c === ESC && s.charCodeAt(i + 1) === 0x5c) {
          i += 2;
          break;
        }
        i++;
      }
    } else if (next >= 0x20 && next <= 0x2f) {
      // nF sequence: intermediates then one final byte.
      i += 2;
      while (i < s.length && s.charCodeAt(i) >= 0x20 && s.charCodeAt(i) <= 0x2f) i++;
      i++;
    } else {
      // Two-byte escape (ESC 7, ESC =, ESC c ...).
      i += 2;
    }
  }
  return n;
}
