/**
 * Files: a mouse-driven file manager on an invented, in-memory file system (nothing
 * on disk is read, written or deleted). Tabs, toolbar buttons, a clickable path,
 * sidebar places, sortable column headers, list rows, preview buttons, a context
 * menu and dialogs are all zones, in a layout of bordered panes joined side by side
 * with wrapped, styled text inside.
 *
 * Usage:  bun examples/files.ts [--demo]
 * Keys:   ↑/↓ select · enter open · backspace up · tab next view · . hidden files
 *         r rename · d delete · m context menu · q quit
 * Mouse:  click anything; double-click a row to open it; right-click a row for its
 *         menu; wheel scrolls the list; click a column header to sort.
 * --demo: replays a scripted mouse (see _kit.ts); the yellow cell is the pointer.
 */
import { NewProgram, View, Quit, MouseMode, MouseButton, MouseMotionMsg, MouseReleaseMsg, MouseWheelMsg, KeyPressMsg, Tick } from '@oakoliver/bubbletea';
import type { Cmd, Model, Msg, MouseMsg } from '@oakoliver/bubbletea';
import { newStyle, joinHorizontal, stringWidth, Left } from '@oakoliver/lipgloss';
import * as zone from '../src/index.ts';
import { Demo, flags, splice, dim, S, cell, C } from './_kit.ts';
import type { Step } from './_kit.ts';

zone.NewGlobal();
const { demo: DEMO } = flags('files');

// ── an invented file system ────────────────────────────────────────────────
interface Node {
  name: string;
  kind: 'dir' | 'file';
  size: number; // bytes; for a folder, the sum of its children
  mtime: number;
  note: string;
  hidden: boolean;
  children?: Node[];
  path: string; // "Projects/bubblezone/README.md"
}

const NOW = Date.UTC(2026, 10, 1, 14, 0);
const ago = (hours: number) => NOW - hours * 3600_000;
type Spec = [name: string, size: number, hoursAgo: number, note?: string] | [name: string, children: Spec[], hoursAgo: number, note?: string];

function build(spec: Spec, parent: string): Node {
  const [name, body, h, note] = spec as [string, number | Spec[], number, string?];
  const path = parent ? `${parent}/${name}` : name;
  const hidden = name.startsWith('.');
  if (Array.isArray(body)) {
    const children = body.map((s) => build(s, path));
    return { name, kind: 'dir', size: children.reduce((a, c) => a + c.size, 0), mtime: ago(h), note: note ?? 'A folder.', hidden, children, path };
  }
  return { name, kind: 'file', size: body, mtime: ago(h), note: note ?? 'A plain file.', hidden, path };
}

const ROOT: Node = build(['Home', [
  ['Documents', [
    ['Reports', [
      ['q3-summary.pdf', 482_000, 30, 'Quarterly summary: revenue, churn and the three experiments that moved them. Draft 4.'],
      ['q2-summary.pdf', 455_000, 2300],
      ['churn-analysis.xlsx', 96_400, 120, 'Cohort table with a pivot per plan. The second sheet holds the raw export.'],
      ['board-deck.key', 8_420_000, 400, 'Slides for the October board meeting, speaker notes included.'],
    ], 30],
    ['Taxes', [['2025-return.pdf', 1_240_000, 3000], ['receipts.zip', 18_900_000, 3100]], 3000],
    ['Notes', [
      ['ideas.md', 3_200, 5, 'Loose ideas: a mouse-driven file manager, a kanban with drag, a log viewer.'],
      ['reading-list.md', 1_800, 90],
      ['meeting-2026-10-28.md', 2_650, 80, 'Action items from the planning meeting. Three owners, two dates.'],
    ], 5],
    ['cv.pdf', 212_000, 1500, 'Curriculum vitae, two pages.'],
    ['todo.txt', 640, 3, 'Things to do this week. Mostly renaming things.'],
  ], 3],
  ['Projects', [
    ['bubblezone', [
      ['src', [['manager.ts', 6_100, 26], ['scanner.ts', 1_900, 26], ['zoneinfo.ts', 2_700, 26], ['index.ts', 700, 26]], 26],
      ['tests', [['manager.test.ts', 9_800, 26], ['zoneinfo.test.ts', 4_100, 26]], 26],
      ['examples', [['buttons.ts', 3_400, 20], ['files.ts', 27_000, 2]], 2],
      ['README.md', 14_500, 20, 'Readme with a GIF at the top and a gallery of larger examples.'],
      ['package.json', 1_650, 26, 'Package manifest: ESM and CJS builds, bun test.'],
      ['CHANGELOG.md', 900, 26],
      ['LICENSE', 1_100, 900, 'MIT licence.'],
    ], 2],
    ['tui-demo', [['main.ts', 4_800, 200], ['theme.ts', 2_200, 200], ['notes.txt', 480, 190]], 190],
    ['website', [['index.html', 6_300, 700], ['style.css', 11_900, 700], ['logo.svg', 3_100, 1200]], 700],
    ['scratch.ts', 1_200, 48, 'A scratch file. Safe to delete.'],
    ['Makefile', 800, 3500],
  ], 2],
  ['Downloads', [
    ['installer.dmg', 96_000_000, 52, 'A disk image for an installer. 96 MB.'],
    ['invoice-1042.pdf', 73_000, 6, 'Invoice 1042, due in 14 days.'],
    ['photos-2026-10.zip', 212_000_000, 70],
    ['talk-slides.pdf', 5_100_000, 260],
    ['archive.tar.gz', 38_400_000, 500],
    ['setup.exe', 4_200_000, 1500],
  ], 6],
  ['Pictures', [
    ['IMG_0412.jpg', 3_400_000, 100], ['IMG_0413.jpg', 3_100_000, 100], ['IMG_0414.jpg', 3_800_000, 100],
    ['sunset.png', 1_950_000, 800, 'Sunset over the harbour, edited.'], ['banner.psd', 22_000_000, 1000],
  ], 70],
  ['.config', [['settings.json', 1_900, 300, 'Hidden application settings.'], ['keys.conf', 700, 300]], 300, 'A hidden folder with settings.'],
  ['.bashrc', 2_400, 1200, 'Shell start-up file. Hidden.'],
  ['notes.txt', 1_050, 4, 'A text file.'],
], 3, 'Your home folder.'], '');

const PLACES = ['Home', 'Documents', 'Projects', 'Downloads', 'Pictures'];
const EXT_COLOR: Record<string, string> = {
  pdf: C.red, xlsx: C.green, key: C.peach, md: C.teal, txt: C.subtext, ts: C.blue, json: C.yellow, zip: C.mauve, gz: C.mauve,
  dmg: C.mauve, jpg: C.pink, png: C.pink, psd: C.pink, html: C.peach, css: C.sapphire, svg: C.pink, exe: C.red,
};
const extOf = (n: Node) => n.name.includes('.') ? n.name.slice(n.name.lastIndexOf('.') + 1).toLowerCase() : '';
const colorOf = (n: Node) => (n.kind === 'dir' ? C.blue : EXT_COLOR[extOf(n)] ?? C.overlay);

function human(n: number): string {
  if (n < 1000) return `${n} B`;
  const u = ['KB', 'MB', 'GB'];
  let v = n / 1000, i = 0;
  while (v >= 1000 && i < u.length - 1) { v /= 1000; i++; }
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${u[i]}`;
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function when(t: number): string {
  const d = new Date(t);
  const hours = (NOW - t) / 3600_000;
  if (hours < 24) return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} today`;
  return `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, ' ')} ${d.getUTCFullYear()}`;
}

function find(path: string[]): Node {
  let n = ROOT;
  for (const p of path) n = n.children!.find((c) => c.name === p)!;
  return n;
}
const allFiles = (n: Node): Node[] => (n.kind === 'file' ? [n] : n.children!.flatMap(allFiles));

// ── model ──────────────────────────────────────────────────────────────────
type Tab = 'files' | 'recent' | 'trash';
type SortKey = 'name' | 'size' | 'date';
type Overlay = null | { kind: 'menu'; x: number; y: number; target: Node } | { kind: 'delete'; target: Node } | { kind: 'rename'; target: Node; text: string };
interface Entry { node: Node; where: string }

const TABS: Array<[Tab, string]> = [['files', 'Files'], ['recent', 'Recent'], ['trash', 'Trash']];
const MIN_W = 90, MIN_H = 24;
const SIDE_W = 20, PREVIEW_W = 32;

class Files implements Model {
  w = 110; h = 32; ready = false;
  tab: Tab = 'files';
  cwd: string[] = [];
  back: string[][] = []; fwd: string[][] = [];
  sortKey: SortKey = 'name'; sortAsc = true;
  showHidden = false;
  sel: string | null = null; // path of the selected node
  scroll = 0;
  hover = '';
  overlay: Overlay = null;
  trash: Entry[] = [];
  toast: { text: string; n: number } | null = null;
  lastRelease = { id: '', at: 0 };
  demo: Demo | null = null;
  removed = new Set<string>(); // paths moved to the trash
  renamed = new Map<string, string>(); // path -> new name

  init(): Cmd { return null; }

  // ── data ────────────────────────────────────────────────────────────────
  nameOf(n: Node): string { return this.renamed.get(n.path) ?? n.name; }

  entries(): Entry[] {
    if (this.tab === 'trash') return this.trash;
    if (this.tab === 'recent') {
      return allFiles(ROOT).filter((n) => !this.removed.has(n.path) && (this.showHidden || !n.path.split('/').some((p) => p.startsWith('.'))))
        .sort((a, b) => b.mtime - a.mtime).slice(0, 40).map((node) => ({ node, where: node.path.split('/').slice(0, -1).join('/') }));
    }
    const dir = find(this.cwd);
    const list = dir.children!.filter((c) => !this.removed.has(c.path) && (this.showHidden || !c.hidden));
    const dirSign = this.sortAsc ? 1 : -1;
    list.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
      const k = this.sortKey === 'name' ? this.nameOf(a).localeCompare(this.nameOf(b)) : this.sortKey === 'size' ? a.size - b.size : a.mtime - b.mtime;
      return k * dirSign;
    });
    return list.map((node) => ({ node, where: '' }));
  }

  get listRows(): number { return Math.max(3, this.h - 4 - 3); } // body minus frame (2) and header row (1)
  selected(): Entry | null { return this.entries().find((e) => e.node.path === this.sel) ?? null; }

  say(text: string): Cmd { this.toast = { text, n: (this.toast?.n ?? 0) + 1 }; const n = this.toast.n; return Tick(2600, () => ({ _tag: 'ClearToast', n })); }

  go(path: string[], push = true): void {
    if (push) { this.back.push(this.cwd); this.fwd = []; }
    this.cwd = path; this.sel = null; this.scroll = 0; this.tab = 'files';
  }

  move(delta: number): void {
    const es = this.entries();
    if (!es.length) return;
    let i = es.findIndex((e) => e.node.path === this.sel);
    i = Math.min(es.length - 1, Math.max(0, i < 0 ? 0 : i + delta));
    this.sel = es[i]!.node.path;
    if (i < this.scroll) this.scroll = i;
    if (i >= this.scroll + this.listRows) this.scroll = i - this.listRows + 1;
  }

  open(e: Entry): Cmd {
    if (e.node.kind === 'dir') {
      this.go(e.node.path.split('/').slice(1));
      return null;
    }
    if (this.tab !== 'files') { // jump to the folder that holds it
      this.go(e.node.path.split('/').slice(1, -1));
      this.sel = e.node.path;
      return null;
    }
    return this.say(`opened ${this.nameOf(e.node)} (nothing really opens in this demo)`);
  }

  trashIt(n: Node): Cmd {
    this.removed.add(n.path);
    this.trash.unshift({ node: n, where: n.path.split('/').slice(0, -1).join('/') });
    this.sel = null;
    return this.say(`moved ${this.nameOf(n)} to the trash`);
  }

  // ── update ──────────────────────────────────────────────────────────────
  update(msg: Msg): [Model, Cmd] {
    if (msg?._tag === 'WindowSizeMsg') { this.w = msg.width; this.h = msg.height; this.ready = true; return [this, null]; }
    if (msg?._tag === 'ClearToast') { if (this.toast?.n === msg.n) this.toast = null; return [this, null]; }
    if (msg instanceof KeyPressMsg) return this.onKey(msg);
    if (msg instanceof MouseMotionMsg) { this.hover = this.zoneAt(msg); return [this, null]; }
    if (msg instanceof MouseWheelMsg) {
      if (this.overlay) return [this, null];
      const n = this.entries().length;
      const max = Math.max(0, n - this.listRows);
      if (msg.button === MouseButton.WheelDown) this.scroll = Math.min(max, this.scroll + 3);
      else if (msg.button === MouseButton.WheelUp) this.scroll = Math.max(0, this.scroll - 3);
      return [this, null];
    }
    if (msg instanceof MouseReleaseMsg) {
      if (msg.button === MouseButton.Left) return [this, this.onClick(msg)];
      if (msg.button === MouseButton.Right && !this.overlay) {
        const e = this.rowAt(msg);
        if (e) { this.sel = e.node.path; this.overlay = { kind: 'menu', x: msg.x, y: msg.y, target: e.node }; }
      }
    }
    return [this, null];
  }

  onKey(msg: KeyPressMsg): [Model, Cmd] {
    const k = msg.toString();
    const o = this.overlay;
    if (o?.kind === 'rename') {
      if (k === 'esc') this.overlay = null;
      else if (k === 'enter') return [this, this.doRename(o)];
      else if (k === 'backspace') o.text = o.text.slice(0, -1);
      else if (msg.text && o.text.length < 40) o.text += msg.text;
      return [this, null];
    }
    if (o) {
      if (k === 'esc' || k === 'n') this.overlay = null;
      else if (o.kind === 'delete' && (k === 'y' || k === 'enter')) { this.overlay = null; return [this, this.trashIt(o.target)]; }
      return [this, null];
    }
    const sel = this.selected();
    switch (k) {
      case 'q': case 'ctrl+c': return [this, Quit];
      case 'up': case 'k': this.move(-1); break;
      case 'down': case 'j': this.move(1); break;
      case 'pgup': this.move(-this.listRows); break;
      case 'pgdown': this.move(this.listRows); break;
      case 'enter': if (sel) return [this, this.open(sel)]; break;
      case 'backspace': if (this.tab === 'files' && this.cwd.length) this.go(this.cwd.slice(0, -1)); break;
      case 'tab': this.tab = TABS[(TABS.findIndex(([t]) => t === this.tab) + 1) % TABS.length]![0]; this.sel = null; this.scroll = 0; break;
      case '.': this.showHidden = !this.showHidden; break;
      case 'r': if (sel && this.tab === 'files') this.overlay = { kind: 'rename', target: sel.node, text: this.nameOf(sel.node) }; break;
      case 'd': if (sel && this.tab === 'files') this.overlay = { kind: 'delete', target: sel.node }; break;
      case 'm': if (sel) this.overlay = { kind: 'menu', x: 40, y: 8, target: sel.node }; break;
    }
    return [this, null];
  }

  doRename(o: { target: Node; text: string }): Cmd {
    const name = o.text.trim();
    this.overlay = null;
    if (!name || name.includes('/')) return this.say('that name is not allowed');
    this.renamed.set(o.target.path, name);
    return this.say(`renamed to ${name}`);
  }

  /** Which zone is under the pointer? (for hover) */
  zoneAt(msg: MouseMsg): string {
    const ids = this.clickables();
    return ids.find((id) => zone.get(id).inBounds(msg)) ?? '';
  }

  clickables(): string[] {
    if (this.overlay?.kind === 'menu') return ['menu:open', 'menu:rename', 'menu:copy', 'menu:delete'];
    if (this.overlay) return ['dlg:ok', 'dlg:cancel'];
    const ids = ['btn:back', 'btn:fwd', 'btn:up', 'hidden', ...TABS.map(([t]) => `tab:${t}`), ...PLACES.map((p) => `place:${p}`),
      'sort:name', 'sort:size', 'sort:date', 'btn:open', 'btn:rename', 'btn:delete', 'btn:restore', 'btn:purge'];
    this.cwd.forEach((_, i) => ids.push(`crumb:${i}`)); ids.push('crumb:root');
    for (const e of this.entries().slice(this.scroll, this.scroll + this.listRows)) ids.push(`row:${e.node.path}`);
    return ids;
  }

  rowAt(msg: MouseMsg): Entry | null {
    for (const e of this.entries().slice(this.scroll, this.scroll + this.listRows)) {
      if (zone.get(`row:${e.node.path}`).inBounds(msg)) return e;
    }
    return null;
  }

  onClick(msg: MouseMsg): Cmd {
    const hit = (id: string) => zone.get(id).inBounds(msg);
    const o = this.overlay;
    if (o?.kind === 'menu') {
      const t = o.target;
      this.overlay = null;
      if (hit('menu:open')) return this.open({ node: t, where: '' });
      if (hit('menu:rename')) { if (this.tab === 'files') this.overlay = { kind: 'rename', target: t, text: this.nameOf(t) }; return null; }
      if (hit('menu:copy')) return this.say(`copied ${t.path} to the clipboard (not really)`);
      if (hit('menu:delete')) { if (this.tab === 'files') this.overlay = { kind: 'delete', target: t }; return null; }
      return null; // a click outside closes the menu
    }
    if (o?.kind === 'delete') {
      if (hit('dlg:ok')) { this.overlay = null; return this.trashIt(o.target); }
      if (hit('dlg:cancel')) this.overlay = null;
      return null;
    }
    if (o?.kind === 'rename') {
      if (hit('dlg:ok')) return this.doRename(o);
      if (hit('dlg:cancel')) this.overlay = null;
      return null;
    }

    for (const [t] of TABS) if (hit(`tab:${t}`)) { this.tab = t; this.sel = null; this.scroll = 0; return null; }
    if (hit('hidden')) { this.showHidden = !this.showHidden; return null; }
    if (hit('btn:back') && this.back.length) { this.fwd.push(this.cwd); this.go(this.back.pop()!, false); return null; }
    if (hit('btn:fwd') && this.fwd.length) { this.back.push(this.cwd); this.go(this.fwd.pop()!, false); return null; }
    if (hit('btn:up') && this.cwd.length) { this.go(this.cwd.slice(0, -1)); return null; }
    if (hit('crumb:root')) { this.go([]); return null; }
    for (let i = 0; i < this.cwd.length; i++) if (hit(`crumb:${i}`)) { this.go(this.cwd.slice(0, i + 1)); return null; }
    for (const p of PLACES) if (hit(`place:${p}`)) { this.go(p === 'Home' ? [] : [p]); return null; }
    for (const k of ['name', 'size', 'date'] as const) {
      if (hit(`sort:${k}`)) {
        if (this.sortKey === k) this.sortAsc = !this.sortAsc; else { this.sortKey = k; this.sortAsc = true; }
        return null;
      }
    }
    const sel = this.selected();
    if (sel) {
      if (hit('btn:open') && this.tab !== 'trash') return this.open(sel);
      if (hit('btn:rename') && this.tab === 'files') { this.overlay = { kind: 'rename', target: sel.node, text: this.nameOf(sel.node) }; return null; }
      if (hit('btn:delete') && this.tab === 'files') { this.overlay = { kind: 'delete', target: sel.node }; return null; }
      if (hit('btn:restore') && this.tab === 'trash') {
        this.removed.delete(sel.node.path);
        this.trash = this.trash.filter((e) => e !== sel);
        this.sel = null;
        return this.say(`restored ${this.nameOf(sel.node)}`);
      }
      if (hit('btn:purge') && this.tab === 'trash') {
        this.trash = this.trash.filter((e) => e !== sel);
        this.sel = null;
        return this.say(`deleted ${this.nameOf(sel.node)} for good`);
      }
    }
    const row = this.rowAt(msg);
    if (row) {
      const id = row.node.path;
      const now = Date.now();
      const double = this.lastRelease.id === id && now - this.lastRelease.at < 500;
      this.lastRelease = { id, at: now };
      this.sel = id;
      if (double) { this.lastRelease = { id: '', at: 0 }; return this.open(row); }
    }
    return null;
  }

  // ── view ────────────────────────────────────────────────────────────────
  /** Marks a zone, except while a dialog or menu is open: the dimmed page under it must not take clicks. */
  mk(id: string, text: string): string { return this.overlay ? text : zone.mark(id, text); }

  button(id: string, label: string, color: string, enabled = true): string {
    const hot = this.hover === id && enabled;
    return this.mk(id, S(` ${label} `, enabled ? { fg: C.crust, bg: hot ? C.text : color, b: true } : { fg: C.overlay, bg: C.surface0 }));
  }

  frame(title: string, rows: string[], w: number, h: number, color: string): string[] {
    const b = (t: string) => S(t, { fg: color });
    const t = title ? ' ' + S(title, { fg: color, b: true }) + ' ' : '';
    const top = b('╭─') + t + b('─'.repeat(Math.max(0, w - 3 - stringWidth(t))) + '╮');
    const out = [top];
    for (let i = 0; i < h - 2; i++) out.push(b('│') + cell(rows[i] ?? '', w - 2) + b('│'));
    out.push(b('╰' + '─'.repeat(w - 2) + '╯'));
    return out;
  }

  titleBar(): string {
    const tabs = TABS.map(([t, label]) => {
      const active = this.tab === t;
      const hot = this.hover === `tab:${t}`;
      const count = t === 'trash' && this.trash.length ? ` ${this.trash.length}` : '';
      return this.mk(`tab:${t}`, S(` ${label}${count} `, active ? { fg: C.crust, bg: C.mauve, b: true } : { fg: hot ? C.text : C.subtext, bg: hot ? C.surface1 : C.surface0 }));
    }).join(' ');
    const hid = this.mk('hidden', S(this.showHidden ? ' [x] hidden files ' : ' [ ] hidden files ', { fg: this.hover === 'hidden' ? C.text : C.subtext, bg: this.hover === 'hidden' ? C.surface1 : undefined }));
    const left = S(' ▣ files ', { fg: C.crust, bg: C.lavender, b: true }) + '  ' + tabs;
    return cell(left + ' '.repeat(Math.max(1, this.w - stringWidth(left) - stringWidth(hid))) + hid, this.w);
  }

  toolbar(): string {
    const nav = [
      this.button('btn:back', '‹', C.blue, this.tab === 'files' && this.back.length > 0),
      this.button('btn:fwd', '›', C.blue, this.tab === 'files' && this.fwd.length > 0),
      this.button('btn:up', '↑', C.blue, this.tab === 'files' && this.cwd.length > 0),
    ].join(' ');
    let crumbs: string;
    if (this.tab !== 'files') crumbs = S(this.tab === 'recent' ? 'most recently changed files' : 'items you deleted', { fg: C.overlay, i: true });
    else {
      const parts = [this.mk('crumb:root', S('Home', { fg: this.hover === 'crumb:root' ? C.text : C.blue, b: true, u: this.hover === 'crumb:root' }))];
      this.cwd.forEach((p, i) => {
        const id = `crumb:${i}`;
        const last = i === this.cwd.length - 1;
        parts.push(this.mk(id, S(p, { fg: last ? C.text : this.hover === id ? C.text : C.blue, b: true, u: this.hover === id && !last })));
      });
      crumbs = parts.join(S(' › ', { fg: C.overlay }));
    }
    return cell(' ' + nav + '  ' + crumbs, this.w);
  }

  sidebar(h: number): string[] {
    const rows = [S(' PLACES', { fg: C.overlay, b: true }), ''];
    const here = this.tab === 'files' ? (this.cwd[0] ?? 'Home') : '';
    const atRoot = this.cwd.length === 0;
    for (const p of PLACES) {
      const id = `place:${p}`;
      const active = this.tab === 'files' && (p === 'Home' ? atRoot : here === p && true);
      const hot = this.hover === id;
      rows.push(this.mk(id, cell(S(` ▸ ${p}`, { fg: active ? C.crust : hot ? C.text : C.subtext, bg: active ? C.lavender : hot ? C.surface1 : undefined, b: active }), SIDE_W - 2)));
    }
    rows.push('', S(' SIZE', { fg: C.overlay, b: true }), S(` ${human(ROOT.size)} in Home`, { fg: C.subtext }));
    return rows.slice(0, h - 2);
  }

  listPane(w: number, h: number): string[] {
    const es = this.entries();
    const sizeW = 9, dateW = 13;
    const nameW = w - 2 - sizeW - dateW - 3;
    const arrow = (k: SortKey) => (this.sortKey === k && this.tab === 'files' ? (this.sortAsc ? ' ▲' : ' ▼') : '');
    const head = (id: string, label: string, width: number, right = false) => {
      const hot = this.hover === id;
      const text = cell(label + arrow(id.slice(5) as SortKey), width);
      const t = right ? ' '.repeat(Math.max(0, width - stringWidth(label + arrow(id.slice(5) as SortKey)))) + label + arrow(id.slice(5) as SortKey) : text;
      return this.mk(id, S(t, { fg: hot ? C.text : C.lavender, b: true, bg: hot ? C.surface1 : undefined }));
    };
    const rows = [' ' + head('sort:name', 'Name', nameW) + ' ' + head('sort:size', 'Size', sizeW, true) + ' ' + head('sort:date', 'Modified', dateW)];
    const view = es.slice(this.scroll, this.scroll + this.listRows);
    for (const e of view) {
      const n = e.node;
      const id = `row:${n.path}`;
      const selected = n.path === this.sel;
      const hot = this.hover === id;
      const bg = selected ? C.surface2 : hot ? C.surface0 : undefined;
      const name = this.nameOf(n);
      const icon = n.kind === 'dir' ? '▶' : '■';
      const label = this.tab === 'files' ? name : name + S('  ' + e.where, { fg: C.overlay });
      const sizeText = n.kind === 'dir' ? '' : human(n.size);
      const line =
        S(' ' + icon + ' ', { fg: colorOf(n), bg }) + cell(S(label, { fg: n.kind === 'dir' ? C.blue : C.text, b: n.kind === 'dir' || selected, bg }), nameW - 3) +
        S(' ', { bg }) + S(sizeText.padStart(sizeW), { fg: C.subtext, bg }) + S(' ', { bg }) + S(cell(when(n.mtime), dateW), { fg: C.subtext, bg });
      rows.push(this.mk(id, line));
    }
    if (!es.length) rows.push('', S(this.tab === 'trash' ? '   The trash is empty.' : '   Nothing here.', { fg: C.overlay, i: true }));
    if (es.length > this.listRows) {
      // a one-column scroll bar on the right edge
      const track = this.listRows;
      const thumb = Math.max(1, Math.round((track * track) / es.length));
      const top = Math.round(((track - thumb) * this.scroll) / Math.max(1, es.length - this.listRows));
      for (let i = 0; i < track; i++) rows[i + 1] = cell(rows[i + 1] ?? '', w - 3) + S(i >= top && i < top + thumb ? '█' : '│', { fg: i >= top && i < top + thumb ? C.surface2 : C.surface0 });
    }
    return rows;
  }

  previewPane(w: number): string[] {
    const e = this.selected();
    const inner = w - 4;
    if (!e) return ['', ...newStyle().width(inner).render(S('Select something to see its details here. Click a row, or press ↓.', { fg: C.overlay, i: true })).split('\n').map((l) => '  ' + l)];
    const n = e.node;
    const kv = (k: string, v: string) => S(k.padEnd(9), { fg: C.overlay }) + S(v, { fg: C.text });
    const rows = [
      '',
      '  ' + S(n.kind === 'dir' ? '▶' : '■', { fg: colorOf(n), b: true }) + ' ' + S(this.nameOf(n), { fg: C.text, b: true }),
      '',
      '  ' + kv('Kind', n.kind === 'dir' ? 'Folder' : (extOf(n) ? extOf(n).toUpperCase() + ' file' : 'File')),
      '  ' + kv('Size', human(n.size) + (n.kind === 'dir' ? ` · ${allFiles(n).length} files` : '')),
      '  ' + kv('Modified', when(n.mtime)),
      '  ' + kv('Where', (() => { const p = '/' + n.path.split('/').slice(0, -1).join('/'); return p.length > 20 ? '…' + p.slice(-19) : p; })()),
      '',
      ...newStyle().width(inner).render(S(n.note, { fg: C.subtext })).split('\n').map((l) => '  ' + l),
      '',
    ];
    const btns = this.tab === 'trash'
      ? [this.button('btn:restore', 'Restore', C.green), this.button('btn:purge', 'Delete for good', C.red)]
      : [this.button('btn:open', n.kind === 'dir' && this.tab === 'files' ? 'Open' : this.tab === 'recent' ? 'Show' : 'Open', C.blue),
         this.button('btn:rename', 'Rename', C.yellow, this.tab === 'files'), this.button('btn:delete', 'Delete', C.red, this.tab === 'files')];
    rows.push('  ' + btns.join(' '));
    return rows;
  }

  statusLine(): string {
    const es = this.entries();
    const sel = this.selected();
    const left = this.toast ? S(' ' + this.toast.text, { fg: C.green }) : S(` ${es.length} item${es.length === 1 ? '' : 's'}` + (sel ? ` · ${this.nameOf(sel.node)} selected (${human(sel.node.size)})` : ''), { fg: C.subtext });
    return cell(left, this.w);
  }

  helpLine(): string {
    const items: Array<[string, string]> = this.overlay?.kind === 'rename'
      ? [['type', 'new name'], ['enter', 'rename'], ['esc', 'cancel']]
      : this.overlay ? [['y/enter', 'yes'], ['n/esc', 'cancel']]
      : [['↑/↓', 'select'], ['enter', 'open'], ['⌫', 'up'], ['tab', 'view'], ['.', 'hidden'], ['r', 'rename'], ['d', 'delete'], ['m', 'menu'], ['q', 'quit']];
    const text = items.map(([k, d]) => S(k, { fg: C.text, b: true }) + ' ' + S(d, { fg: C.overlay })).join(S(' • ', { fg: C.surface2 }));
    return cell(cell(' ' + text, this.w - (this.demo ? 24 : 0)), this.w);
  }

  dialog(): { lines: string[]; x: number; y: number } | null {
    const o = this.overlay;
    if (!o || o.kind === 'menu') return null;
    const w = 46;
    const mk = (id: string, label: string, color: string) => zone.mark(id, S(` ${label} `, { fg: C.crust, bg: this.hover === id ? C.text : color, b: true }));
    let rows: string[];
    if (o.kind === 'delete') {
      rows = ['', '  ' + S(`Move "${this.nameOf(o.target)}" to the trash?`, { fg: C.text, b: true }), '  ' + S(o.target.kind === 'dir' ? 'The folder and everything in it. You can restore it later.' : 'You can restore it from the Trash tab.', { fg: C.overlay }), '',
        '  ' + mk('dlg:ok', 'Move to trash', C.red) + '  ' + mk('dlg:cancel', 'Cancel', C.surface2), ''];
    } else {
      rows = ['', '  ' + S(`Rename "${this.nameOf(o.target)}"`, { fg: C.text, b: true }), '',
        '  ' + S('› ', { fg: C.pink, b: true }) + S(o.text, { fg: C.text }) + S('▏', { fg: C.pink }), '',
        '  ' + mk('dlg:ok', 'Rename', C.green) + '  ' + mk('dlg:cancel', 'Cancel', C.surface2), ''];
    }
    const title = o.kind === 'delete' ? 'Delete' : 'Rename';
    const lines = this.frame(title, rows, w, rows.length + 2, o.kind === 'delete' ? C.red : C.yellow);
    return { lines, x: Math.floor((this.w - w) / 2), y: Math.floor((this.h - lines.length) / 2) };
  }

  menu(): { lines: string[]; x: number; y: number } | null {
    const o = this.overlay;
    if (!o || o.kind !== 'menu') return null;
    const items: Array<[string, string, boolean]> = [
      ['menu:open', o.target.kind === 'dir' ? 'Open folder' : this.tab === 'files' ? 'Open' : 'Show in folder', true],
      ['menu:rename', 'Rename…', this.tab === 'files'],
      ['menu:copy', 'Copy path', true],
      ['menu:delete', 'Move to trash…', this.tab === 'files'],
    ];
    const w = 20;
    const rows = items.map(([id, label, on]) => zone.mark(id, S(cell(' ' + label, w - 2), on ? { fg: this.hover === id ? C.crust : C.text, bg: this.hover === id ? C.lavender : C.surface0 } : { fg: C.overlay, bg: C.surface0 })));
    const lines = this.frame('', rows, w, rows.length + 2, C.lavender);
    return { lines, x: Math.min(o.x, this.w - w), y: Math.min(o.y, this.h - lines.length) };
  }

  view(): View {
    const v = new View('');
    v.altScreen = true;
    v.mouseMode = MouseMode.AllMotion;
    v.windowTitle = 'Files';
    if (!this.ready) return v;
    if (this.w < MIN_W || this.h < MIN_H) {
      v.content = `Terminal too small: files needs ${MIN_W}×${MIN_H}, this is ${this.w}×${this.h}. Resize the window or press q.`;
      return v;
    }
    const bodyH = this.h - 4; // title, toolbar, status, help
    const listW = this.w - SIDE_W - PREVIEW_W;
    const side = this.frame('', this.sidebar(bodyH), SIDE_W, bodyH, C.surface2);
    const title = this.tab === 'files' ? find(this.cwd).name : this.tab === 'recent' ? 'Recent' : 'Trash';
    const list = this.frame(title, this.listPane(listW, bodyH), listW, bodyH, C.lavender);
    const prev = this.frame('Details', this.previewPane(PREVIEW_W), PREVIEW_W, bodyH, C.surface2);
    const body = joinHorizontal(Left, side.join('\n'), list.join('\n'), prev.join('\n'));
    let frame = [this.titleBar(), this.toolbar(), body, this.statusLine(), this.helpLine()].join('\n');

    const layer = this.dialog() ?? this.menu();
    if (layer) frame = splice(dim(frame), layer.lines.join('\n'), layer.x, layer.y);
    let out = zone.scan(frame);
    if (this.demo) out = this.demo.overlay(out);
    v.content = out;
    return v;
  }
}

// ── start ──────────────────────────────────────────────────────────────────
const model = new Files();
const program = NewProgram(model);
if (DEMO) {
  const steps: Step[] = [
    { sleep: 800 }, { click: 'place:Projects' }, { sleep: 600 },
    { click: 'row:Home/Projects/bubblezone' }, { sleep: 700 },
    { click: 'row:Home/Projects/bubblezone', double: true }, { sleep: 900 },
    { click: 'row:Home/Projects/bubblezone/README.md' }, { sleep: 900 },
    { click: 'sort:size' }, { sleep: 500 }, { click: 'sort:size' }, { sleep: 800 },
    { click: 'crumb:0' }, { sleep: 700 },
    { click: 'tab:recent' }, { sleep: 900 }, { click: 'row:Home/Documents/Reports/q3-summary.pdf' }, { sleep: 900 },
    { click: 'tab:files' }, { sleep: 400 }, { click: 'place:Downloads' }, { sleep: 700 },
    { wheel: 'row:Home/Downloads/installer.dmg', dir: 'down', n: 2 }, { sleep: 500 },
    { click: 'row:Home/Downloads/invoice-1042.pdf', button: 'right' }, { sleep: 900 },
    { click: 'menu:rename' }, { sleep: 600 },
    { type: ' (paid)' }, { sleep: 500 }, { click: 'dlg:ok' }, { sleep: 1100 },
    { click: 'row:Home/Downloads/setup.exe', button: 'right' }, { sleep: 800 },
    { click: 'menu:delete' }, { sleep: 800 }, { click: 'dlg:ok' }, { sleep: 1000 },
    { click: 'tab:trash' }, { sleep: 700 }, { click: 'row:Home/Downloads/setup.exe' }, { sleep: 600 },
    { click: 'btn:restore' }, { sleep: 1200 }, { click: 'tab:files' }, { sleep: 500 }, { click: 'place:Home' }, { sleep: 600 },
    { click: 'hidden' }, { sleep: 1500 },
    { quit: true },
  ];
  model.demo = new Demo(zone.DefaultManager!, steps);
}
const done = program.run();
void model.demo?.run(program);
await done;
if (model.demo?.missed.length) console.error('demo: zones not found:', model.demo.missed.join(', '));
process.exit(0);
