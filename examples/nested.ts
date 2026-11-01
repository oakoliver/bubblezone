/**
 * Nested: child components that each mark zones of their own. Every child asks
 * zone.newPrefix() once and puts the prefix in front of its zone IDs, so three copies
 * of the same component never collide on "inc" or "dec". The root scans the view once
 * and calls zone.anyInBoundsAndUpdate(): one MsgZoneInBounds per zone under the mouse
 * (nested zones included, in alphabetical order of ID), and each child recognises its
 * own by the prefix.
 *
 * Usage:  bun examples/nested.ts [--demo]
 * Keys:   tab next panel · +/- change the focused counter · r reset · q quit
 * Mouse:  click a panel to focus it, click − + reset inside a panel.
 */
import { NewProgram, View, Quit, MouseMode, MouseReleaseMsg, MouseButton, KeyPressMsg } from '@oakoliver/bubbletea';
import type { Cmd, Model, Msg } from '@oakoliver/bubbletea';
import { newStyle, joinHorizontal, joinVertical, place, Top, Left, Center, roundedBorder } from '@oakoliver/lipgloss';
import * as zone from '../src/index.ts';
import { Demo, flags, C, S } from './_kit.ts';

zone.NewGlobal();
const { demo: DEMO } = flags('nested');

class Counter {
  readonly id = zone.newPrefix(); // "zone_1__", "zone_2__", ...
  n = 0;
  constructor(readonly name: string, readonly color: string) {}

  /** Reacts to a zone that is under the mouse. Returns true if it was one of ours. */
  hit(m: zone.MsgZoneInBounds): boolean {
    if (!m.zone.id.startsWith(this.id)) return false;
    const local = m.zone.id.slice(this.id.length);
    if (local === 'inc') this.n++;
    else if (local === 'dec') this.n--;
    else if (local === 'reset') this.n = 0;
    return true;
  }

  view(focused: boolean): string {
    const btn = (id: string, label: string, bg: string) =>
      zone.mark(this.id + id, newStyle().padding(0, 1).bold(true).foreground(C.crust).background(bg).render(label));
    const body = joinVertical(Left,
      S(this.name, { fg: this.color, b: true }),
      '',
      S(String(this.n).padStart(4), { fg: C.text, b: true }) + '  ' + S(this.n === 0 ? 'zero' : this.n > 0 ? 'positive' : 'negative', { fg: C.overlay }),
      '',
      joinHorizontal(Top, btn('dec', ' − ', C.red), ' ', btn('inc', ' + ', C.green), ' ', btn('reset', 'reset', C.blue)));
    const box = newStyle().border(roundedBorder()).borderForeground(focused ? this.color : C.surface2).padding(1, 2).render(body);
    return zone.mark(this.id + 'panel', box);
  }
}

class App implements Model {
  w = 80; h = 24; ready = false;
  counters = [new Counter('apples', C.green), new Counter('pears', C.peach), new Counter('plums', C.mauve)];
  focus = 0;
  zonesSeen: string[] = [];
  demo: Demo | null = null;

  init(): Cmd { return null; }

  update(msg: Msg): [Model, Cmd] {
    if (msg._tag === 'WindowSizeMsg') { this.w = msg.width; this.h = msg.height; this.ready = true; }
    else if (msg instanceof KeyPressMsg) {
      const k = msg.toString();
      if (k === 'q' || k === 'ctrl+c') return [this, Quit];
      if (k === 'tab') this.focus = (this.focus + 1) % this.counters.length;
      if (k === '+') this.counters[this.focus]!.n++;
      if (k === '-') this.counters[this.focus]!.n--;
      if (k === 'r') this.counters[this.focus]!.n = 0;
    } else if (msg instanceof MouseReleaseMsg && msg.button === MouseButton.Left) {
      this.zonesSeen = [];
      return zone.anyInBoundsAndUpdate(this, msg); // sends MsgZoneInBounds back to update()
    } else if (msg instanceof zone.MsgZoneInBounds) {
      this.zonesSeen.push(msg.zone.id);
      this.counters.forEach((c, i) => { if (c.hit(msg)) { this.focus = i; } });
    }
    return [this, null];
  }

  view(): View {
    if (!this.ready) { const v = new View(''); v.altScreen = true; return v; }
    const row = joinHorizontal(Top, ...this.counters.flatMap((c, i) => [i ? '  ' : '', c.view(i === this.focus)]));
    const seen = this.zonesSeen.length ? this.zonesSeen.join('  ') : 'click inside a panel';
    const page = place(this.w, this.h - 4, Center, Center, row) + '\n' +
      place(this.w, 1, Center, Top, S('last click hit: ' + seen, { fg: C.subtext })) + '\n\n' +
      place(this.w, 1, Center, Top, S('tab focus · +/- change · r reset · q quit', { fg: C.overlay }));
    let out = zone.scan(page);
    if (this.demo) out = this.demo.overlay(out);
    const v = new View(out);
    v.altScreen = true;
    v.mouseMode = MouseMode.CellMotion;
    return v;
  }
}

const model = new App();
const program = NewProgram(model);
if (DEMO) {
  const [a, b, c] = model.counters.map((x) => x.id) as [string, string, string];
  model.demo = new Demo(zone.DefaultManager!, [
    { sleep: 600 }, { click: a + 'inc' }, { click: a + 'inc' }, { sleep: 400 }, { click: a + 'inc' }, { sleep: 900 },
    { click: b + 'dec' }, { click: b + 'dec' }, { sleep: 900 }, { click: c + 'panel' }, { sleep: 800 },
    { click: c + 'inc' }, { sleep: 700 }, { click: a + 'reset' }, { sleep: 1000 }, { quit: true },
  ]);
}
const done = program.run();
void model.demo?.run(program);
await done;
if (model.demo?.missed.length) console.error('demo: zones not found:', model.demo.missed.join(', '));
process.exit(0);
