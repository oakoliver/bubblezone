/**
 * Buttons: the whole idea of bubblezone in one small program. Two buttons are wrapped
 * in zone.mark(), the finished view goes through zone.scan() once, and the mouse
 * handler asks zone.get(id).inBounds(msg).
 *
 * Usage:  bun examples/buttons.ts [--demo]
 * Keys:   q quit. Mouse: hover a button, click it.
 */
import { NewProgram, View, Quit, MouseMode, MouseReleaseMsg, MouseMotionMsg, MouseButton, KeyPressMsg } from '@oakoliver/bubbletea';
import type { Cmd, Model, Msg } from '@oakoliver/bubbletea';
import { newStyle, joinHorizontal, joinVertical, place, Top, Left, Center, roundedBorder } from '@oakoliver/lipgloss';
import * as zone from '../src/index.ts';
import { Demo, flags, C, S } from './_kit.ts';

zone.NewGlobal();
const { demo: DEMO } = flags('buttons');

const button = (label: string, active: boolean, hot: string) =>
  newStyle()
    .padding(0, 3)
    .bold(true)
    .foreground(active ? C.crust : C.text)
    .background(active ? hot : C.surface1)
    .render(label);

class Buttons implements Model {
  w = 80;
  h = 24;
  ready = false; // nothing is drawn before the first WindowSizeMsg
  hover = '';
  log: string[] = ['click a button'];
  demo: Demo | null = null;

  init(): Cmd { return null; }

  update(msg: Msg): [Model, Cmd] {
    if (msg._tag === 'WindowSizeMsg') { this.w = msg.width; this.h = msg.height; this.ready = true; }
    else if (msg instanceof KeyPressMsg && ['q', 'ctrl+c', 'esc'].includes(msg.toString())) return [this, Quit];
    else if (msg instanceof MouseMotionMsg) {
      this.hover = ['yes', 'no'].find((id) => zone.get(id).inBounds(msg)) ?? '';
    } else if (msg instanceof MouseReleaseMsg && msg.button === MouseButton.Left) {
      for (const id of ['yes', 'no']) {
        const z = zone.get(id);
        if (!z.inBounds(msg)) continue;
        const [x, y] = z.pos(msg);
        this.log = [`released on "${id}" at x=${x}, y=${y} inside the zone (${msg.x},${msg.y} on screen)`, ...this.log].slice(0, 4);
      }
    }
    return [this, null];
  }

  view(): View {
    if (!this.ready) { const v = new View(''); v.altScreen = true; return v; }
    const buttons = joinHorizontal(Top,
      zone.mark('yes', button('Yes', this.hover === 'yes', C.green)),
      '    ',
      zone.mark('no', button('No', this.hover === 'no', C.red)));
    const box = newStyle().border(roundedBorder()).borderForeground(C.lavender).padding(1, 4)
      .render(S('Delete 3 files?', { fg: C.text, b: true }) + '\n\n' + buttons);
    const log = joinVertical(Left, ...this.log.map((l, i) => S(l, { fg: i === 0 ? C.subtext : C.overlay })));
    const page = place(this.w, this.h - 6, Center, Center, box) + '\n\n' + place(this.w, 4, Center, Top, log);
    let out = zone.scan(page);
    if (this.demo) out = this.demo.overlay(out);
    const v = new View(out);
    v.altScreen = true;
    v.mouseMode = MouseMode.AllMotion;
    return v;
  }
}

const model = new Buttons();
const program = NewProgram(model);
if (DEMO) {
  model.demo = new Demo(zone.DefaultManager!, [
    { sleep: 700 }, { move: 'yes' }, { sleep: 600 }, { click: 'yes' }, { sleep: 900 },
    { click: { id: 'no', dx: -2 } }, { sleep: 900 }, { click: 'yes', button: 'left' }, { sleep: 1000 },
    { move: [3, 3] }, { sleep: 500 }, { quit: true },
  ]);
}
const done = program.run();
void model.demo?.run(program);
await done;
if (model.demo?.missed.length) console.error('demo: zones not found:', model.demo.missed.join(', '));
process.exit(0);
