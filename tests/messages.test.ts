import { beforeAll, describe, expect, test } from 'bun:test';
import { Batch, MouseButton, MouseMotionMsg, View } from '@oakoliver/bubbletea';
import type { Cmd, Model, Msg } from '@oakoliver/bubbletea';
import * as zone from '../src/index.ts';

beforeAll(() => zone.NewGlobal());

const motion = (x: number, y: number) => new MouseMotionMsg({ x, y, button: MouseButton.None, mod: 0 });
const content = () => zone.Scan('test\nfoo\naaa ' + zone.Mark('foo', 'bar\ntest123456789') + ' aaa\nbaz');

/** Mutable model, like upstream's testModel. */
class Mutable implements Model {
  received: Msg[] = [];
  init(): Cmd {
    return null;
  }
  update(msg: Msg): [Model, Cmd] {
    if (msg instanceof MouseMotionMsg) zone.AnyInBounds(this, msg);
    else if (msg instanceof zone.MsgZoneInBounds) this.received.push(msg);
    return [this, null];
  }
  view(): View {
    return new View(content());
  }
}

/** Immutable model returning a new value from update, like upstream's testModelValue. */
class Immutable implements Model {
  constructor(public received: Msg[] = []) {}
  init(): Cmd {
    return null;
  }
  update(msg: Msg): [Model, Cmd] {
    if (msg instanceof MouseMotionMsg) return zone.AnyInBoundsAndUpdate(this, msg);
    if (msg instanceof zone.MsgZoneInBounds) {
      return [new Immutable([...this.received, msg]), () => 'tick'];
    }
    return [this, null];
  }
  view(): View {
    return new View(content());
  }
}

describe('AnyInBounds', () => {
  test('sends MsgZoneInBounds to the model', () => {
    const m = new Mutable();
    m.view();
    const xy = zone.Get('foo');
    expect(xy.isZero()).toBe(false);
    m.update(motion(4, 2));
    expect(m.received.length).toBe(1);
    const msg = m.received[0] as zone.MsgZoneInBounds;
    expect(msg._tag).toBe('MsgZoneInBounds');
    expect(msg.zone.id).toBe('foo');
    expect(msg.zone).toBe(xy);
    expect(msg.event).toBeInstanceOf(MouseMotionMsg);
  });

  test('sends nothing outside every zone', () => {
    const m = new Mutable();
    m.view();
    m.update(motion(0, 0));
    expect(m.received.length).toBe(0);
  });

  test('one message per zone, in alphabetical order of id', () => {
    const zm = zone.New();
    const ids: string[] = [];
    const model: Model = {
      init: () => null,
      update(msg) {
        if (msg instanceof zone.MsgZoneInBounds) ids.push(msg.zone.id);
        return [model, null];
      },
      view: () => '',
    };
    // Nested zones that overlap the same cells: "z" wraps "m" wraps "a".
    zm.scan(zm.mark('z', zm.mark('m', zm.mark('a', 'text'))));
    zm.anyInBounds(model, motion(1, 0));
    expect(ids).toEqual(['a', 'm', 'z']);
  });
});

describe('AnyInBoundsAndUpdate', () => {
  test('carries the model through and batches the commands', async () => {
    const m0 = new Immutable();
    m0.view();
    const [m1, cmd] = m0.update(motion(4, 2));
    expect((m1 as Immutable).received.length).toBe(1);
    expect(typeof cmd).toBe('function'); // one zone: a single command, not a batch
  });

  test('several zones produce a batch', () => {
    const zm = zone.New();
    zm.scan(zm.mark('z', zm.mark('m', 'text')));
    let n = 0;
    const model: Model = {
      init: () => null,
      update: () => [model, () => ++n],
      view: () => '',
    };
    const [, cmd] = zm.anyInBoundsAndUpdate(model, motion(0, 0));
    const batched = Batch(() => 1, () => 2);
    expect(cmd).not.toBeNull();
    expect((cmd as () => Msg)().constructor.name).toBe((batched as () => Msg)().constructor.name);
  });

  test('no zones under the mouse gives a null command', () => {
    const zm = zone.New();
    zm.scan(zm.mark('z', 'text'));
    const model: Model = { init: () => null, update: () => [model, () => 1], view: () => '' };
    const [m, cmd] = zm.anyInBoundsAndUpdate(model, motion(50, 50));
    expect(m).toBe(model);
    expect(cmd).toBeNull();
  });
});
