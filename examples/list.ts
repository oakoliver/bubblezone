/**
 * List: a Bubbles list whose rows are clickable. This is the port of upstream's
 * `list-default` example. A small delegate wraps the default one and marks each row
 * as a zone; the mouse handler asks the zone of every visible item.
 *
 * One detail worth reading: a row is two lines (title, description), and a zone is a
 * box from where the mark starts to where it ends. If the lines have different
 * widths the box gets narrower than the row, so the delegate pads the row to the
 * full list width before marking it.
 *
 * Usage:  bun examples/list.ts [--demo]
 * Keys:   ↑/↓ move · / filter · q quit.  Mouse: click a row, wheel scrolls.
 */
import { NewProgram, View, Quit, MouseMode, MouseReleaseMsg, MouseWheelMsg, MouseButton, KeyPressMsg } from '@oakoliver/bubbletea';
import type { Cmd, Model, Msg } from '@oakoliver/bubbletea';
import { newList, newListDefaultDelegate } from '@oakoliver/bubbles';
import type { ListItem, ListItemDelegate, ListModel } from '@oakoliver/bubbles';
import { stringWidth } from '@oakoliver/lipgloss';
import * as zone from '../src/index.ts';
import { Demo, flags, C, S } from './_kit.ts';

zone.NewGlobal();
const { demo: DEMO } = flags('list');

class Item implements ListItem {
  constructor(readonly id: string, readonly name: string, readonly desc: string) {}
  title() { return this.name; }
  description() { return this.desc; }
  filterValue() { return this.name; }
}

const ITEMS = [
  ['Raspberry Pi', 'I have ’em all over my house'], ['Nutella', 'It\'s good on toast'],
  ['Bitter melon', 'It cools you down'], ['Nice socks', 'And by that I mean socks without holes'],
  ['Eight hours of sleep', 'I had this once'], ['Cats', 'Usually'], ['Plantasia, the album', 'My plants love it too'],
  ['Pour over coffee', 'It takes forever to make though'], ['VR', 'Virtual reality...what is there to say?'],
  ['Noguchi Lamps', 'Such pleasing organic forms'], ['Linux', 'Pretty much the best OS'],
  ['Business school', 'Just kidding'], ['Pottery', 'Wet clay is a great feeling'],
  ['Shampoo', 'Nothing like clean hair'], ['Table tennis', 'It’s surprisingly exhausting'],
  ['Milk crates', 'Great for packing in your extra stuff'], ['Afternoon tea', 'Especially the tea sandwich part'],
  ['Stickers', 'The thicker the vinyl the better'], ['20° Weather', 'Celsius, not Fahrenheit'],
  ['Warm light', 'Like around 2700 Kelvin'], ['The vernal equinox', 'The autumnal equinox is pretty good too'],
  ['Gaffer’s tape', 'Basically sticky fabric'], ['Terrycloth', 'In other words, towel fabric'],
].map(([n, d], i) => new Item(`item-${i}`, n!, d!));

/** Wraps the default delegate: pads every row to the list width, then marks it. */
class ClickableDelegate implements ListItemDelegate {
  inner = newListDefaultDelegate();
  height() { return this.inner.height(); }
  spacing() { return this.inner.spacing(); }
  update(msg: Msg, m: ListModel) { return this.inner.update(msg, m); }
  render(m: ListModel, index: number, item: ListItem): string {
    const rows = this.inner.render(m, index, item).split('\n');
    const w = Math.max(...rows.map(stringWidth));
    const padded = rows.map((r) => r + ' '.repeat(w - stringWidth(r)));
    return zone.mark((item as Item).id, padded.join('\n'));
  }
}

class Page implements Model {
  list: ListModel = newList(ITEMS, new ClickableDelegate(), 60, 20);
  ready = false;
  last = 'nothing clicked yet';
  demo: Demo | null = null;

  constructor() {
    this.list.title = 'Things I like';
    this.list.styles.title = this.list.styles.title.background(C.mauve).foreground(C.crust);
  }
  init(): Cmd { return null; }

  update(msg: Msg): [Model, Cmd] {
    if (msg._tag === 'WindowSizeMsg') {
      this.list.setSize(Math.min(msg.width - 4, 80), msg.height - 4);
      this.ready = true;
      return [this, null];
    }
    if (msg instanceof KeyPressMsg && !this.list.settingFilter() && ['q', 'ctrl+c'].includes(msg.toString())) return [this, Quit];
    if (msg instanceof MouseWheelMsg) {
      if (msg.button === MouseButton.WheelUp) this.list.cursorUp();
      else if (msg.button === MouseButton.WheelDown) this.list.cursorDown();
      return [this, null];
    }
    if (msg instanceof MouseReleaseMsg && msg.button === MouseButton.Left) {
      this.list.visibleItems().forEach((it, i) => {
        const z = zone.get((it as Item).id);
        if (z.inBounds(msg)) { this.list.select(i); this.last = `clicked "${(it as Item).name}" (row ${z.pos(msg)[1] + 1} of its zone)`; }
      });
      return [this, null];
    }
    const [list, cmd] = this.list.update(msg);
    this.list = list;
    return [this, cmd];
  }

  view(): View {
    if (!this.ready) { const v = new View(''); v.altScreen = true; return v; }
    let out = zone.scan(' \n' + this.list.view().split('\n').map((l) => '  ' + l).join('\n') + '\n  ' + S(this.last, { fg: C.subtext }) + '\n');
    if (this.demo) out = this.demo.overlay(out);
    const v = new View(out);
    v.altScreen = true;
    v.mouseMode = MouseMode.CellMotion;
    return v;
  }
}

const model = new Page();
const program = NewProgram(model);
if (DEMO) {
  model.demo = new Demo(zone.DefaultManager!, [
    { sleep: 600 }, { click: 'item-2' }, { sleep: 900 }, { click: 'item-4' }, { sleep: 900 },
    { wheel: 'item-4', dir: 'down', n: 8 }, { sleep: 700 }, { click: 'item-14' }, { sleep: 1000 },
    { wheel: 'item-14', dir: 'up', n: 12 }, { sleep: 500 }, { click: 'item-1' }, { sleep: 1000 }, { quit: true },
  ]);
}
const done = program.run();
void model.demo?.run(program);
await done;
if (model.demo?.missed.length) console.error('demo: zones not found:', model.demo.missed.join(', '));
process.exit(0);
