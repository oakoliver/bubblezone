import { describe, expect, test } from 'bun:test';
import { MouseButton, MouseClickMsg, MouseReleaseMsg, View } from '@oakoliver/bubbletea';
import type { Cmd, Model, Msg } from '@oakoliver/bubbletea';
import { joinHorizontal, newStyle, Top } from '@oakoliver/lipgloss';
import * as zone from '../src/index.ts';

// The Quick Start from the README, run as written (with a model class around it).
zone.NewGlobal();

class App implements Model {
  active = '';
  init(): Cmd { return null; }
  update(msg: Msg): [Model, Cmd] {
    if (msg instanceof MouseReleaseMsg && msg.button === MouseButton.Left) {
      if (zone.get('confirm').inBounds(msg)) this.active = 'confirm';
      else if (zone.get('cancel').inBounds(msg)) this.active = 'cancel';
    }
    return [this, null];
  }
  view(): View {
    const button = (s: string) => newStyle().padding(0, 3).render(s);
    const buttons = joinHorizontal(Top, zone.mark('confirm', button('OK')), ' ', zone.mark('cancel', button('Cancel')));
    return new View(zone.scan(newStyle().margin(1, 2).render(buttons)));
  }
}

describe('README quick start', () => {
  test('click on each button', () => {
    const app = new App();
    app.view();
    const ok = zone.get('confirm');
    const cancel = zone.get('cancel');
    expect([ok.startX, ok.startY, ok.endX, ok.endY]).toEqual([2, 1, 9, 1]);
    expect([cancel.startX, cancel.startY, cancel.endX, cancel.endY]).toEqual([11, 1, 22, 1]);
    app.update(new MouseReleaseMsg({ x: 5, y: 1, button: MouseButton.Left, mod: 0 }));
    expect(app.active).toBe('confirm');
    app.update(new MouseReleaseMsg({ x: 15, y: 1, button: MouseButton.Left, mod: 0 }));
    expect(app.active).toBe('cancel');
    app.update(new MouseClickMsg({ x: 5, y: 1, button: MouseButton.Left, mod: 0 })); // press is ignored
    expect(app.active).toBe('cancel');
  });
});
