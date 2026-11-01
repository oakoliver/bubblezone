/**
 * Console: a service dashboard on invented data. Cards sit in a responsive grid; each
 * card is a zone with zones nested inside it (replica − and +, Restart, Logs, a traffic
 * toggle), so one click lands in several zones at once. The root calls
 * zone.anyInBoundsAndUpdate() and sorts the MsgZoneInBounds events out by their ID.
 * Also: tabs, radio chips, filter chips, a log that scrolls with the wheel, sortable
 * table headers, expandable rows with wrapped text, and confirmation dialogs.
 *
 * Usage:  bun examples/console.ts [--demo]
 * Keys:   ←/→/↑/↓ card · enter restart · +/- replicas · space traffic · l logs
 *         tab next view · e environment · q quit
 * Mouse:  click a card to select it and the buttons inside it; click the chips;
 *         wheel scrolls the log; on Deploys click a header to sort, a row to expand.
 * --demo: replays a scripted mouse (see _kit.ts); the yellow cell is the pointer.
 * Nothing here talks to a real service: restarting only changes this program's state.
 */
import { NewProgram, View, Quit, Tick, MouseMode, MouseButton, MouseMotionMsg, MouseReleaseMsg, MouseWheelMsg, KeyPressMsg } from '@oakoliver/bubbletea';
import type { Cmd, Model, Msg, MouseMsg } from '@oakoliver/bubbletea';
import { newStyle, joinHorizontal, stringWidth, Left } from '@oakoliver/lipgloss';
import * as zone from '../src/index.ts';
import { Demo, flags, splice, dim, S, cell, C } from './_kit.ts';
import type { Step } from './_kit.ts';

zone.NewGlobal();
const { demo: DEMO } = flags('console');

// ── invented data ──────────────────────────────────────────────────────────
type Health = 'healthy' | 'degraded' | 'restarting' | 'off';
interface Svc { name: string; region: string; version: [string, string]; replicas: number; health: Health; traffic: boolean; base: number; spark: number[]; logs: Log[] }
interface Log { t: number; level: 'info' | 'warn' | 'error'; text: string }

function rng(seed: number) {
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rand = rng(7);

const MESSAGES: Array<[Log['level'], string]> = [
  ['info', 'GET /v1/orders 200 in 38 ms'], ['info', 'GET /v1/users/me 200 in 12 ms'], ['info', 'cache hit ratio 0.93'],
  ['info', 'connection pool: 14 of 40 in use'], ['info', 'POST /v1/payments 201 in 121 ms'], ['warn', 'slow query: orders_by_day took 840 ms'],
  ['warn', 'retrying upstream call (attempt 2 of 3)'], ['info', 'config reloaded'], ['error', 'upstream timeout after 3000 ms: inventory'],
  ['warn', 'queue depth 412, above the soft limit of 400'], ['info', 'health check ok'], ['error', 'failed to publish event: broker unavailable'],
];

const mkSvc = (name: string, region: string, v: [string, string], replicas: number, health: Health, base: number): Svc => ({
  name, region, version: v, replicas, health, traffic: health !== 'off', base,
  spark: Array.from({ length: 16 }, () => base * (0.7 + rand() * 0.7)),
  logs: Array.from({ length: 40 }, (_, i) => { const [level, text] = MESSAGES[Math.floor(rand() * MESSAGES.length)]!; return { t: i - 40, level, text }; }),
});
const SERVICES: Svc[] = [
  mkSvc('api-gateway', 'eu-west', ['2.14.0', '2.15.0-rc1'], 4, 'healthy', 90),
  mkSvc('checkout', 'eu-west', ['5.2.1', '5.3.0'], 3, 'healthy', 140),
  mkSvc('inventory', 'us-east', ['1.9.4', '1.10.0'], 2, 'degraded', 310),
  mkSvc('search', 'eu-west', ['3.0.2', '3.0.2'], 3, 'healthy', 60),
  mkSvc('notifier', 'us-east', ['0.8.7', '0.9.0'], 1, 'healthy', 25),
  mkSvc('billing', 'eu-west', ['4.4.0', '4.4.1'], 2, 'off', 180),
];

interface Deploy { id: string; svc: string; version: string; by: string; ago: number; status: 'success' | 'failed' | 'running'; msg: string }
const DEPLOYS: Deploy[] = [
  { id: 'd-1042', svc: 'checkout', version: '5.3.0', by: 'ana', ago: 12, status: 'running', msg: 'Add retry with jitter to the payment client, and stop logging card tokens in debug builds.' },
  { id: 'd-1041', svc: 'api-gateway', version: '2.15.0-rc1', by: 'miguel', ago: 95, status: 'success', msg: 'Rate limits per API key instead of per IP.' },
  { id: 'd-1040', svc: 'inventory', version: '1.10.0', by: 'sofia', ago: 210, status: 'failed', msg: 'Switch the stock counter to the new store. Rolled back after the timeout rate climbed above one percent.' },
  { id: 'd-1039', svc: 'search', version: '3.0.2', by: 'ana', ago: 600, status: 'success', msg: 'Fix ranking when the query has a trailing space.' },
  { id: 'd-1038', svc: 'notifier', version: '0.9.0', by: 'joao', ago: 1500, status: 'success', msg: 'Batch push notifications every five seconds.' },
  { id: 'd-1037', svc: 'billing', version: '4.4.1', by: 'miguel', ago: 2900, status: 'success', msg: 'Round VAT per line, not per invoice, as the auditors asked.' },
  { id: 'd-1036', svc: 'checkout', version: '5.2.1', by: 'sofia', ago: 4300, status: 'success', msg: 'Hotfix for double-click on the pay button.' },
];

const HEALTH_COLOR: Record<Health, string> = { healthy: C.green, degraded: C.yellow, restarting: C.peach, off: C.overlay };
const LEVEL_COLOR = { info: C.subtext, warn: C.yellow, error: C.red } as const;
const SPARK = '▁▂▃▄▅▆▇█';
const spark = (v: number[]) => { const lo = Math.min(...v), hi = Math.max(...v); return v.map((x) => SPARK[Math.min(7, Math.floor(((x - lo) / Math.max(1e-9, hi - lo)) * 7.999))]).join(''); };
const ago = (m: number) => (m < 60 ? `${m} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : `${Math.floor(m / 1440)} d ago`);
const clock = (t: number) => { const s = 14 * 3600 + 2 * 60 + t * 3; return [Math.floor(s / 3600) % 24, Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, '0')).join(':'); };

// ── model ──────────────────────────────────────────────────────────────────
type Tab = 'services' | 'deploys';
type Dialog = null | { kind: 'restart'; name: string } | { kind: 'rollback'; id: string };
const TABS: Array<[Tab, string]> = [['services', 'Services'], ['deploys', 'Deploys']];
const ENVS = ['prod', 'staging'];
const MIN_W = 100, MIN_H = 28, CARD_H = 8;
type SortKey = 'svc' | 'version' | 'by' | 'ago' | 'status';

class Console implements Model {
  w = 110; h = 32; ready = false;
  tab: Tab = 'services';
  env = 0;
  sel = 0;
  hover = '';
  levels = { info: true, warn: true, error: true };
  logScroll = 0;
  dialog: Dialog = null;
  toast: { text: string; n: number } | null = null;
  tick = 0;
  sortKey: SortKey = 'ago'; sortAsc = true;
  open: string | null = null;
  rolledBack = new Set<string>();
  demo: Demo | null = null;
  svcs = SERVICES;

  init(): Cmd { return Tick(3000, () => ({ _tag: 'Pulse' })); }

  say(text: string): Cmd { const n = (this.toast?.n ?? 0) + 1; this.toast = { text, n }; return Tick(2600, () => ({ _tag: 'ClearToast', n })); }
  readonly cols = 3;
  get svc(): Svc { return this.svcs[this.sel]!; }
  version(s: Svc): string { return s.version[this.env]!; }

  update(msg: Msg): [Model, Cmd] {
    switch (msg?._tag) {
      case 'WindowSizeMsg': this.w = msg.width; this.h = msg.height; this.ready = true; return [this, null];
      case 'ClearToast': if (this.toast?.n === msg.n) this.toast = null; return [this, null];
      case 'Pulse': return [this, this.pulse()];
      case 'Restarted': { const s = this.svcs.find((x) => x.name === msg.name)!; s.health = s.traffic ? 'healthy' : 'off'; this.logTo(s, 'info', 'started, listening on :8080'); return [this, this.say(`${msg.name} is back`)]; }
    }
    if (msg instanceof KeyPressMsg) return this.onKey(msg);
    if (msg instanceof MouseMotionMsg) { this.hover = this.hoverId(msg); return [this, null]; }
    if (msg instanceof MouseWheelMsg) {
      if (this.tab === 'services' && !this.dialog && zone.get('logpane').inBounds(msg)) {
        this.logScroll = Math.max(0, this.logScroll + (msg.button === MouseButton.WheelUp ? 3 : msg.button === MouseButton.WheelDown ? -3 : 0));
      }
      return [this, null];
    }
    if (msg instanceof MouseReleaseMsg && msg.button === MouseButton.Left) return zone.anyInBoundsAndUpdate(this, msg);
    if (msg instanceof zone.MsgZoneInBounds) return [this, this.onZone(msg.zone.id)];
    return [this, null];
  }

  pulse(): Cmd {
    this.tick++;
    for (const s of this.svcs) {
      if (s.health === 'off') continue;
      const noise = s.health === 'degraded' ? 1.1 : 0.8;
      s.spark = [...s.spark.slice(1), s.base * (0.7 + rand() * 0.7 * noise)];
    }
    const s = this.svcs[Math.floor(rand() * this.svcs.length)]!;
    if (s.health !== 'off') { const [level, text] = MESSAGES[Math.floor(rand() * MESSAGES.length)]!; this.logTo(s, level, text); }
    return Tick(3000, () => ({ _tag: 'Pulse' }));
  }

  logTo(s: Svc, level: Log['level'], text: string): void {
    s.logs.push({ t: this.tick + s.logs.length - 40 + 40, level, text });
    if (s.logs.length > 200) s.logs.shift();
    if (s === this.svc && this.logScroll > 0) this.logScroll++; // keep what you are reading in place
  }

  hoverId(msg: MouseMsg): string {
    return this.zoneIds().find((id) => zone.get(id).inBounds(msg)) ?? '';
  }

  zoneIds(): string[] {
    if (this.dialog) return ['dlg:ok', 'dlg:cancel'];
    const ids = [...TABS.map(([t]) => `tab:${t}`), ...ENVS.map((e) => `env:${e}`)];
    if (this.tab === 'services') {
      for (const s of this.svcs) ids.push(`dec:${s.name}`, `inc:${s.name}`, `restart:${s.name}`, `logs:${s.name}`, `toggle:${s.name}`);
      ids.push('lvl:info', 'lvl:warn', 'lvl:error');
    } else {
      for (const k of ['svc', 'version', 'by', 'ago', 'status']) ids.push(`sort:${k}`);
      for (const d of DEPLOYS) ids.push(`rollback:${d.id}`, `deploy:${d.id}`);
    }
    return ids;
  }

  /** One zone is under the mouse. A click can land in several, in alphabetical order of ID. */
  onZone(id: string): Cmd {
    const [kind, arg = ''] = [id.slice(0, id.indexOf(':')), id.slice(id.indexOf(':') + 1)];
    if (this.dialog) {
      const d = this.dialog;
      if (kind !== 'dlg') return null;
      this.dialog = null;
      if (arg === 'cancel') return null;
      if (d.kind === 'restart') return this.restart(d.name);
      this.rolledBack.add(d.id);
      return this.say(`rolled back ${DEPLOYS.find((x) => x.id === d.id)!.svc} (not really)`);
    }
    const s = this.svcs.find((x) => x.name === arg);
    switch (kind) {
      case 'tab': this.tab = arg as Tab; break;
      case 'env': this.env = ENVS.indexOf(arg); break;
      case 'card': case 'dec': case 'inc': case 'restart': case 'logs': case 'toggle':
        if (!s) break;
        this.sel = this.svcs.indexOf(s);
        if (kind === 'card') break;
        if (kind === 'logs') { this.logScroll = 0; return this.say(`showing logs of ${s.name}`); }
        if (kind === 'dec') s.replicas = Math.max(1, s.replicas - 1);
        if (kind === 'inc') s.replicas = Math.min(9, s.replicas + 1);
        if (kind === 'restart') this.dialog = { kind: 'restart', name: s.name };
        if (kind === 'toggle') { s.traffic = !s.traffic; s.health = s.traffic ? 'healthy' : 'off'; return this.say(`${s.name}: traffic ${s.traffic ? 'on' : 'off'}`); }
        break;
      case 'lvl': this.levels[arg as 'info'] = !this.levels[arg as 'info']; break;
      case 'sort': if (this.sortKey === arg) this.sortAsc = !this.sortAsc; else { this.sortKey = arg as SortKey; this.sortAsc = true; } break;
      case 'deploy': this.open = this.open === arg ? null : arg; break;
      case 'rollback': this.dialog = { kind: 'rollback', id: arg }; break;
    }
    return null;
  }

  restart(name: string): Cmd {
    const s = this.svcs.find((x) => x.name === name)!;
    s.health = 'restarting';
    this.logTo(s, 'warn', 'received SIGTERM, draining connections');
    return Tick(2200, () => ({ _tag: 'Restarted', name }));
  }

  onKey(msg: KeyPressMsg): [Model, Cmd] {
    const k = msg.toString();
    if (this.dialog) {
      if (k === 'esc' || k === 'n') this.dialog = null;
      else if (k === 'y' || k === 'enter') return [this, this.onZone('dlg:ok')];
      return [this, null];
    }
    const n = this.svcs.length;
    switch (k) {
      case 'q': case 'ctrl+c': return [this, Quit];
      case 'tab': this.tab = this.tab === 'services' ? 'deploys' : 'services'; break;
      case 'e': this.env = (this.env + 1) % ENVS.length; break;
      case 'left': case 'h': this.sel = (this.sel + n - 1) % n; break;
      case 'right': case 'l': this.sel = (this.sel + 1) % n; break;
      case 'up': case 'k': this.sel = (this.sel + n - this.cols) % n; break;
      case 'down': case 'j': this.sel = (this.sel + this.cols) % n; break;
      case '+': return [this, this.onZone(`inc:${this.svc.name}`)];
      case '-': return [this, this.onZone(`dec:${this.svc.name}`)];
      case ' ': return [this, this.onZone(`toggle:${this.svc.name}`)];
      case 'enter': return [this, this.onZone(`restart:${this.svc.name}`)];
      case 'pgup': this.logScroll += 5; break;
      case 'pgdown': this.logScroll = Math.max(0, this.logScroll - 5); break;
    }
    return [this, null];
  }

  // ── view ────────────────────────────────────────────────────────────────
  mk(id: string, text: string): string { return this.dialog ? text : zone.mark(id, text); }
  chip(id: string, label: string, on: boolean, color: string): string {
    const hot = this.hover === id;
    return this.mk(id, S(` ${label} `, on ? { fg: C.crust, bg: hot ? C.text : color, b: true } : { fg: hot ? C.text : C.subtext, bg: hot ? C.surface1 : C.surface0 }));
  }
  btn(id: string, label: string, color: string, fg: string = C.crust): string {
    const hot = this.hover === id;
    return this.mk(id, S(` ${label} `, { fg: hot ? C.crust : fg, bg: hot ? C.text : color, b: true }));
  }

  box(rows: string[], w: number, h: number, color: string, title = ''): string[] {
    const b = (t: string) => S(t, { fg: color });
    const t = title ? ' ' + S(title, { fg: color, b: true }) + ' ' : '';
    const out = [b('╭─') + t + b('─'.repeat(Math.max(0, w - 3 - stringWidth(t))) + '╮')];
    for (let i = 0; i < h - 2; i++) out.push(b('│') + cell(rows[i] ?? '', w - 2) + b('│'));
    out.push(b('╰' + '─'.repeat(w - 2) + '╯'));
    return out;
  }

  titleBar(): string {
    const tabs = TABS.map(([t, label]) => {
      const hot = this.hover === `tab:${t}`;
      return this.mk(`tab:${t}`, S(` ${label} `, this.tab === t ? { fg: C.crust, bg: C.mauve, b: true } : { fg: hot ? C.text : C.subtext, bg: hot ? C.surface1 : C.surface0 }));
    }).join(' ');
    const envs = ENVS.map((e, i) => this.chip(`env:${e}`, e, this.env === i, i === 0 ? C.red : C.sapphire)).join(' ');
    const left = S(' ◆ console ', { fg: C.crust, bg: C.lavender, b: true }) + '  ' + tabs;
    const right = S('env ', { fg: C.overlay }) + envs + ' ';
    return cell(left + ' '.repeat(Math.max(1, this.w - stringWidth(left) - stringWidth(right))) + right, this.w);
  }

  card(s: Svc, w: number): string[] {
    const selected = this.svc === s;
    const iw = w - 4;
    const dot = S('●', { fg: HEALTH_COLOR[s.health] });
    const status = S(s.health, { fg: HEALTH_COLOR[s.health] });
    const head = ' ' + dot + ' ' + S(s.name, { fg: C.text, b: true });
    const line1 = head + ' '.repeat(Math.max(1, iw + 1 - stringWidth(head) - stringWidth(status))) + status;
    const p95 = s.health === 'off' ? '–' : `${Math.round(s.spark[s.spark.length - 1]!)} ms`;
    const rows = [
      line1,
      '  ' + S(`v${this.version(s)} · ${s.region}`, { fg: C.subtext }),
      '  ' + S(s.health === 'off' ? '▁'.repeat(16) : spark(s.spark), { fg: s.health === 'degraded' ? C.yellow : C.teal }) + S(` p95 ${p95}`, { fg: C.subtext }),
      '  ' + S('replicas ', { fg: C.overlay }) + this.btn(`dec:${s.name}`, '−', C.surface2, C.text) + S(` ${s.replicas} `, { fg: C.text, b: true }) + this.btn(`inc:${s.name}`, '+', C.surface2, C.text),
      '  ' + this.btn(`restart:${s.name}`, 'Restart', C.peach) + ' ' + this.btn(`logs:${s.name}`, 'Logs', C.blue),
      '  ' + this.mk(`toggle:${s.name}`, S(s.traffic ? ' ● ━ ' : ' ━ ○ ', { fg: C.crust, bg: s.traffic ? C.green : C.surface2, b: true })) + S(s.traffic ? ' traffic on' : ' traffic off', { fg: s.traffic ? C.text : C.overlay }),
    ];
    return this.box(rows, w, CARD_H, selected ? C.lavender : C.surface2);
  }

  servicesView(): string {
    const gap = 1;
    const cw = Math.floor((this.w - gap * 2) / 3);
    const cards = this.svcs.map((s) => {
      const lines = this.card(s, cw);
      return this.mk(`card:${s.name}`, lines.join('\n'));
    });
    const rows: string[] = [];
    for (let i = 0; i < cards.length; i += 3) rows.push(joinHorizontal(Left, ...cards.slice(i, i + 3).flatMap((c, j) => (j ? [' ', c] : [c]))));
    const healthy = this.svcs.filter((s) => s.health === 'healthy').length;
    const summary = cell(S(` ${this.svcs.length} services · ${healthy} healthy`, { fg: C.subtext }) + (this.svcs.some((s) => s.health === 'degraded') ? S(' · 1 degraded', { fg: C.yellow }) : '') + (this.toast ? S('   ' + this.toast.text, { fg: C.green }) : ''), this.w);

    const gridH = Math.ceil(this.svcs.length / 3) * CARD_H;
    const logH = this.h - 1 - 1 - gridH - 1; // title, summary, grid, help
    const s = this.svc;
    const visible = s.logs.filter((l) => this.levels[l.level]);
    const inner = logH - 3; // frame (2) and the chip row (1)
    const maxScroll = Math.max(0, visible.length - inner);
    this.logScroll = Math.min(this.logScroll, maxScroll);
    const end = visible.length - this.logScroll;
    const shown = visible.slice(Math.max(0, end - inner), end);
    const chips = ' ' + this.chip('lvl:info', 'info', this.levels.info, C.blue) + ' ' + this.chip('lvl:warn', 'warn', this.levels.warn, C.yellow) + ' ' + this.chip('lvl:error', 'error', this.levels.error, C.red)
      + S(this.logScroll ? `   ↑ ${this.logScroll} lines up · wheel down to follow` : '   following', { fg: C.overlay });
    const logRows = [chips, ...shown.map((l) => ' ' + S(clock(l.t), { fg: C.overlay }) + ' ' + S(l.level.toUpperCase().padEnd(5), { fg: LEVEL_COLOR[l.level], b: l.level !== 'info' }) + ' ' + S(l.text, { fg: l.level === 'info' ? C.subtext : C.text }))];
    const pane = this.box(logRows, this.w, logH, C.surface2, `logs · ${s.name}`);
    return [summary, rows.join('\n'), this.mk('logpane', pane.join('\n'))].join('\n');
  }

  deploysView(): string {
    const dir = this.sortAsc ? 1 : -1;
    const list = [...DEPLOYS].sort((a, b) => {
      const k = this.sortKey === 'svc' ? a.svc.localeCompare(b.svc) : this.sortKey === 'version' ? a.version.localeCompare(b.version) : this.sortKey === 'by' ? a.by.localeCompare(b.by) : this.sortKey === 'ago' ? a.ago - b.ago : a.status.localeCompare(b.status);
      return k * dir;
    });
    const colW = { svc: 16, version: 14, by: 10, ago: 12, status: 10 };
    const head = (k: SortKey, label: string) => {
      const id = `sort:${k}`;
      const arrow = this.sortKey === k ? (this.sortAsc ? ' ▲' : ' ▼') : '';
      return this.mk(id, S(cell(label + arrow, colW[k]), { fg: this.hover === id ? C.text : C.lavender, b: true, bg: this.hover === id ? C.surface1 : undefined }));
    };
    const rows = [' ' + ['svc', 'version', 'by', 'ago', 'status'].map((k, i) => head(k as SortKey, ['Service', 'Version', 'By', 'When', 'Status'][i]!)).join(' ')];
    const statusColor = { success: C.green, failed: C.red, running: C.peach } as const;
    for (const d of list) {
      const id = `deploy:${d.id}`;
      const isOpen = this.open === d.id;
      const bg = isOpen ? C.surface1 : this.hover === id ? C.surface0 : undefined;
      const status = this.rolledBack.has(d.id) ? 'rolled back' : d.status;
      rows.push(this.mk(id, cell(S(' ', { bg }) + [
        S(cell(d.svc, colW.svc), { fg: C.text, b: true, bg }), S(cell(d.version, colW.version), { fg: C.subtext, bg }), S(cell(d.by, colW.by), { fg: C.subtext, bg }),
        S(cell(ago(d.ago), colW.ago), { fg: C.subtext, bg }), S(cell('● ' + status, 12), { fg: this.rolledBack.has(d.id) ? C.overlay : statusColor[d.status], bg }),
      ].join(S(' ', { bg })) + S(isOpen ? ' ▾' : ' ▸', { fg: C.overlay, bg }), this.w - 4)));
      if (isOpen) {
        const text = newStyle().width(64).render(S(d.msg, { fg: C.subtext })).split('\n');
        rows.push(...text.map((l) => '     ' + l));
        rows.push('     ' + S(`${d.id} by ${d.by} · `, { fg: C.overlay }) + this.btn(`rollback:${d.id}`, 'Roll back', C.red) + '', '');
      }
    }
    const pane = this.box(rows, this.w, this.h - 3, C.surface2, 'deploys');
    const summary = cell(this.toast ? S(' ' + this.toast.text, { fg: C.green }) : S(' click a row to read the change, a header to sort', { fg: C.subtext }), this.w);
    return [summary, pane.join('\n')].join('\n');
  }

  dialogBox(): { lines: string[]; x: number; y: number } | null {
    const d = this.dialog;
    if (!d) return null;
    const mk = (id: string, label: string, color: string) => zone.mark(id, S(` ${label} `, { fg: C.crust, bg: this.hover === id ? C.text : color, b: true }));
    const w = 66;
    const rows = d.kind === 'restart'
      ? ['', '  ' + S(`Restart ${d.name}?`, { fg: C.text, b: true }), '  ' + S('Connections are drained first. It takes about two seconds here.', { fg: C.overlay }), '', '  ' + mk('dlg:ok', 'Restart', C.peach) + '  ' + mk('dlg:cancel', 'Cancel', C.surface2), '']
      : ['', '  ' + S(`Roll back ${DEPLOYS.find((x) => x.id === d.id)!.svc}?`, { fg: C.text, b: true }), '  ' + S('Deploys the previous version. Nothing really happens in this demo.', { fg: C.overlay }), '', '  ' + mk('dlg:ok', 'Roll back', C.red) + '  ' + mk('dlg:cancel', 'Cancel', C.surface2), ''];
    const lines = this.box(rows, w, rows.length + 2, d.kind === 'restart' ? C.peach : C.red, d.kind === 'restart' ? 'Restart' : 'Roll back');
    return { lines, x: Math.floor((this.w - w) / 2), y: Math.floor((this.h - lines.length) / 2) };
  }

  helpLine(): string {
    const items: Array<[string, string]> = this.dialog ? [['y/enter', 'confirm'], ['n/esc', 'cancel']]
      : this.tab === 'services' ? [['←↑↓→', 'card'], ['enter', 'restart'], ['+/-', 'replicas'], ['space', 'traffic'], ['pgup/dn', 'log'], ['tab', 'view'], ['e', 'env'], ['q', 'quit']]
      : [['tab', 'view'], ['e', 'env'], ['q', 'quit']];
    const room = this.w - (this.demo ? 24 : 0);
    const parts = items.map(([k, d]) => S(k, { fg: C.text, b: true }) + ' ' + S(d, { fg: C.overlay }));
    while (parts.length > 1 && 1 + stringWidth(parts.join(S(' • ', { fg: C.surface2 }))) > room) parts.pop(); // drop what does not fit
    return cell(cell(' ' + parts.join(S(' • ', { fg: C.surface2 })), room), this.w);
  }

  view(): View {
    const v = new View('');
    v.altScreen = true;
    v.mouseMode = MouseMode.AllMotion;
    v.windowTitle = 'Console';
    if (!this.ready) return v;
    if (this.w < MIN_W || this.h < MIN_H) { v.content = `Terminal too small: console needs ${MIN_W}×${MIN_H}, this is ${this.w}×${this.h}. Resize the window or press q.`; return v; }
    let frame = [this.titleBar(), this.tab === 'services' ? this.servicesView() : this.deploysView(), this.helpLine()].join('\n');
    const dlg = this.dialogBox();
    if (dlg) frame = splice(dim(frame), dlg.lines.join('\n'), dlg.x, dlg.y);
    let out = zone.scan(frame);
    if (this.demo) out = this.demo.overlay(out);
    v.content = out;
    return v;
  }
}

const model = new Console();
const program = NewProgram(model);
if (DEMO) {
  const steps: Step[] = [
    { sleep: 900 }, { click: 'card:inventory' }, { sleep: 900 },
    { click: 'inc:inventory' }, { sleep: 300 }, { click: 'inc:inventory' }, { sleep: 800 },
    { click: 'lvl:info' }, { sleep: 800 }, { wheel: 'logpane', dir: 'up', n: 3 }, { sleep: 800 }, { click: 'lvl:info' }, { sleep: 500 },
    { wheel: 'logpane', dir: 'down', n: 3 }, { sleep: 500 },
    { click: 'restart:inventory' }, { sleep: 800 }, { click: 'dlg:ok' }, { sleep: 2600 },
    { click: 'toggle:billing' }, { sleep: 1100 }, { click: 'env:staging' }, { sleep: 1000 },
    { click: 'tab:deploys' }, { sleep: 800 }, { click: 'sort:svc' }, { sleep: 800 },
    { click: 'deploy:d-1040' }, { sleep: 1300 }, { click: 'rollback:d-1040' }, { sleep: 900 }, { click: 'dlg:cancel' }, { sleep: 700 },
    { click: 'deploy:d-1042' }, { sleep: 1200 }, { click: 'tab:services' }, { sleep: 1000 },
    { quit: true },
  ];
  model.demo = new Demo(zone.DefaultManager!, steps);
}
const done = program.run();
void model.demo?.run(program);
await done;
if (model.demo?.missed.length) console.error('demo: zones not found:', model.demo.missed.join(', '));
process.exit(0);
