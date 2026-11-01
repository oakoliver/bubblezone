/**
 * Helpers shared by the examples. Nothing in here is part of the package.
 *
 *  - Demo: a scripted "mouse" for --demo. A terminal recorder (VHS) cannot click, so
 *    the script sends real MouseMotionMsg / MouseReleaseMsg / MouseWheelMsg values to
 *    the running program. The targets are zone IDs: each step asks the zone manager
 *    where the zone is and aims at its middle, so the click goes through the same
 *    hit-testing as a real one. A yellow cell and a badge in the corner show that the
 *    pointer is scripted.
 *  - splice: puts one block of text over another WITHOUT dropping zone markers (Lip
 *    Gloss's compositor strips them).
 *  - dim: mutes the colours of a frame, for the background of a dialog.
 */
import {
  KeyCode, KeyPressMsg, MouseButton, MouseMotionMsg, MouseReleaseMsg, MouseClickMsg, MouseWheelMsg,
} from '@oakoliver/bubbletea';
import type { Program } from '@oakoliver/bubbletea';
import { newStyle, sliceAnsi, stringWidth, stripAnsi, truncate } from '@oakoliver/lipgloss';
import type { Manager } from '../src/index.ts';

export type Target = string | [x: number, y: number] | { id: string; dx?: number; dy?: number };

export type Step =
  | { sleep: number }
  | { move: Target }
  | { click: Target; button?: 'left' | 'right'; double?: boolean }
  | { wheel: Target; dir: 'up' | 'down'; n?: number }
  | { type: string }
  | { key: 'enter' | 'escape' | 'backspace' | 'tab' | 'up' | 'down' | 'left' | 'right' }
  | { quit: true };

const keyCodes = {
  enter: KeyCode.Enter, escape: KeyCode.Escape, backspace: KeyCode.Backspace, tab: KeyCode.Tab,
  up: KeyCode.Up, down: KeyCode.Down, left: KeyCode.Left, right: KeyCode.Right,
} as const;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Demo {
  pointer: { x: number; y: number } | null = null;
  /** Targets the script could not find (a zone that was not on screen). Printed after exit. */
  missed: string[] = [];

  constructor(private zm: Manager, private steps: Step[], private pace = 1) {}

  private resolve(t: Target): { x: number; y: number } | null {
    if (Array.isArray(t)) return { x: t[0], y: t[1] };
    const id = typeof t === 'string' ? t : t.id;
    const z = this.zm.get(id);
    if (z.isZero()) {
      this.missed.push(id);
      return null;
    }
    const d: { dx?: number; dy?: number } = typeof t === 'string' ? {} : t;
    return { x: z.startX + Math.floor((z.endX - z.startX) / 2) + (d.dx ?? 0), y: z.startY + (d.dy ?? 0) };
  }

  /** Runs the script against `program`. Resolves when it ends. */
  async run(program: Program): Promise<void> {
    await wait(900 * this.pace);
    const motion = (p: { x: number; y: number }) =>
      program.send(new MouseMotionMsg({ x: p.x, y: p.y, button: MouseButton.None, mod: 0 }));
    for (const step of this.steps) {
      if ('sleep' in step) await wait(step.sleep * this.pace);
      else if ('move' in step) {
        const p = this.resolve(step.move);
        if (p) { this.pointer = p; motion(p); }
      } else if ('click' in step) {
        const p = this.resolve(step.click);
        if (!p) continue;
        this.pointer = p;
        motion(p);
        await wait(420 * this.pace);
        const button = step.button === 'right' ? MouseButton.Right : MouseButton.Left;
        for (let i = 0; i < (step.double ? 2 : 1); i++) {
          program.send(new MouseClickMsg({ x: p.x, y: p.y, button, mod: 0 }));
          await wait(60);
          program.send(new MouseReleaseMsg({ x: p.x, y: p.y, button, mod: 0 }));
          await wait(90);
        }
      } else if ('wheel' in step) {
        const p = this.resolve(step.wheel);
        if (!p) continue;
        this.pointer = p;
        motion(p);
        await wait(300 * this.pace);
        for (let i = 0; i < (step.n ?? 1); i++) {
          const button = step.dir === 'up' ? MouseButton.WheelUp : MouseButton.WheelDown;
          program.send(new MouseWheelMsg({ x: p.x, y: p.y, button, mod: 0 }));
          await wait(160 * this.pace);
        }
      } else if ('type' in step) {
        for (const ch of step.type) {
          program.send(new KeyPressMsg({ text: ch, code: ch.codePointAt(0)!, mod: 0 }));
          await wait(90);
        }
      } else if ('key' in step) {
        program.send(new KeyPressMsg({ text: '', code: keyCodes[step.key], mod: 0 }));
      } else if ('quit' in step) {
        program.quit();
        return;
      }
    }
  }

  /** Draws the scripted pointer and the badge onto a frame that has been through scan(). */
  overlay(frame: string, label = ' demo: scripted mouse '): string {
    const lines = frame.split('\n');
    if (this.pointer && this.pointer.y < lines.length) {
      const { x, y } = this.pointer;
      const line = lines[y]!;
      const cell = stripAnsi(sliceAnsi(line, x, x + 1)) || ' ';
      lines[y] = sliceAnsi(line, 0, x) + newStyle().inline(true).background('#F9E2AF').foreground('#11111B').bold(true).render(cell) + sliceAnsi(line, x + 1);
    }
    const last = lines.length - 1;
    const w = stringWidth(label);
    const lw = stringWidth(lines[last]!);
    if (lw >= w + 2) {
      lines[last] = sliceAnsi(lines[last]!, 0, lw - w) + newStyle().inline(true).background('#F9E2AF').foreground('#11111B').render(label);
    }
    return lines.join('\n');
  }
}

/** Parses the flags the examples share: `--demo` and `--help`. */
export function flags(name: string, extra = ''): { demo: boolean } {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`usage: bun examples/${name}.ts [--demo]${extra}`);
    console.log('  --demo   replay a scripted mouse (for recordings): the pointer is a yellow cell, and every event');
    console.log('           goes through the real zone hit-testing');
    process.exit(0);
  }
  const unknown = args.filter((a) => a !== '--demo');
  if (unknown.length) {
    console.error(`${name}: unknown argument ${unknown[0]} (try --help)`);
    process.exit(2);
  }
  return { demo: args.includes('--demo') };
}

/**
 * Lays `top` over `base` with its top-left corner at (x, y). Both are multi-line
 * strings; `top` must be a rectangle. Unlike Lip Gloss's compositor this keeps zone
 * markers, as long as the base text carries none under the cut (render the base
 * without zones while a dialog is open).
 */
export function splice(base: string, top: string, x: number, y: number): string {
  const lines = base.split('\n');
  const over = top.split('\n');
  for (let i = 0; i < over.length; i++) {
    const row = y + i;
    if (row < 0 || row >= lines.length) continue;
    const w = stringWidth(over[i]!);
    const line = lines[row]!;
    const lw = stringWidth(line);
    const left = lw >= x ? sliceAnsi(line, 0, x) : line + ' '.repeat(x - lw);
    lines[row] = left + '\x1b[m' + over[i] + '\x1b[m' + sliceAnsi(line, x + w);
  }
  return lines.join('\n');
}

/**
 * Mutes every colour of an ANSI string by blending it toward a dark base, so a dialog
 * drawn over it stands out. Truecolor sequences are rewritten.
 */
export function dim(s: string): string {
  const K = 0.62;
  const base = [0x1e, 0x1e, 0x2e];
  const mix = (r: number, g: number, b: number) => [r, g, b].map((v, i) => Math.round(v + (base[i]! - v) * K));
  const fallback = `38;2;${mix(0xa8, 0xa8, 0xc0).join(';')}`;
  const out = s.replace(/\x1b\[([0-9;]*)m/g, (_, p: string) => {
    if (p === '' || p === '0') return `\x1b[0;${fallback}m`;
    const t = p.split(';');
    const o: string[] = [];
    for (let i = 0; i < t.length; i++) {
      if ((t[i] === '38' || t[i] === '48') && t[i + 1] === '2') {
        o.push(t[i]!, '2', ...mix(+t[i + 2]!, +t[i + 3]!, +t[i + 4]!).map(String));
        i += 4;
      } else if ((t[i] === '38' || t[i] === '48') && t[i + 1] === '5') {
        o.push(t[i]!, '5', t[i + 2]!);
        i += 2;
      } else o.push(t[i]!);
    }
    return `\x1b[${o.join(';')}m`;
  });
  return out.split('\n').map((l) => `\x1b[${fallback}m${l}`).join('\n') + '\x1b[m';
}

/** Styled text on one line. */
export interface Sty { fg?: string; bg?: string; b?: boolean; i?: boolean; u?: boolean }
export const S = (text: string, o: Sty = {}): string => {
  if (!text) return '';
  let s = newStyle().inline(true);
  if (o.fg) s = s.foreground(o.fg);
  if (o.bg) s = s.background(o.bg);
  if (o.b) s = s.bold(true);
  if (o.i) s = s.italic(true);
  if (o.u) s = s.underline(true);
  return s.render(text);
};

/** Pads or shortens plain or styled text to exactly `w` cells. */
export function cell(s: string, w: number): string {
  const sw = stringWidth(s);
  if (sw > w) return truncate(s, w);
  return s + ' '.repeat(w - sw);
}

/** Catppuccin Mocha, the theme of the recordings. */
export const C = {
  base: '#1E1E2E', mantle: '#181825', crust: '#11111B', surface0: '#313244', surface1: '#45475A', surface2: '#585B70',
  overlay: '#6C7086', subtext: '#A6ADC8', text: '#CDD6F4', lavender: '#B4BEFE', blue: '#89B4FA', sapphire: '#74C7EC',
  teal: '#94E2D5', green: '#A6E3A1', yellow: '#F9E2AF', peach: '#FAB387', red: '#F38BA8', mauve: '#CBA6F7', pink: '#F5C2E7',
};
