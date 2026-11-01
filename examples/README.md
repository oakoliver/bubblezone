# Examples

Every program takes `--demo`, which replays a scripted mouse through the real zone hit-testing (see [Recordings](../README.md#recordings) in the main README). The scripted pointer is a yellow cell and the last row says `demo: scripted mouse`. Without it you use your own mouse; the terminal must report mouse events (most do).

## Small programs

```sh
bun examples/buttons.ts [--demo]   # mark, scan, get().inBounds(), pos(), hover
bun examples/list.ts [--demo]      # a Bubbles list with clickable rows (upstream's list-default)
bun examples/nested.ts [--demo]    # newPrefix() for child components, anyInBoundsAndUpdate()
```

## Larger programs

```sh
bun examples/files.ts [--demo]     # file manager: tabs, path, sidebar, sortable columns, menu, dialogs
bun examples/console.ts [--demo]   # service dashboard: cards with nested zones, log, chips, table
```

### Dependencies

They import this repository's source (`../src/index.ts`) and the sibling packages by name. `bun install` installs the siblings as dev dependencies. To type-check the examples: `bun run typecheck:examples`.

`_kit.ts` is shared by all of them and is not part of the package: the scripted mouse (`Demo`), `splice()` (lays a dialog over a page and keeps zone markers, which Lip Gloss's compositor does not), `dim()` and a few styling helpers.

## files.ts

A file manager on an invented, in-memory file system: nothing on disk is read, written or deleted, and "Open" opens nothing.

- **Zones:** tabs (Files, Recent, Trash), the hidden-files toggle, back/forward/up, each segment of the path, sidebar places, the three column headers, every row, the preview buttons (Open, Rename, Delete, Restore, Delete for good), context-menu items and dialog buttons.
- **Mouse:** click selects; double-click (two releases on one row within 500 ms) opens; right-click opens the context menu; the wheel scrolls the list; headers sort (click again to reverse); a click outside a menu or dialog closes it.
- **Keys:** `↑/↓` or `j/k` select, `pgup/pgdn`, `enter` open, `backspace` up, `tab` next view, `.` hidden files, `r` rename, `d` delete, `m` menu, `q` quit. In dialogs: `y`/`enter`, `n`/`esc`; while renaming, type, `backspace`, `enter`, `esc`.
- The layout is exact (panes are built with a small `frame()` helper, not Lip Gloss borders) and recomputed on every resize; under 90×24 it asks for a bigger terminal.

While a dialog or menu is open the page under it is drawn without zones, so the dialog is the only thing that takes clicks. `splice()` puts the dialog over the dimmed page.

## console.ts

A service dashboard on invented data: six services, two environments, a log that grows, a table of deploys. Restarting changes only this program's state.

- **Nested zones:** each card is a zone with replica `−`/`+`, Restart, Logs and the traffic toggle inside it. A click calls `zone.anyInBoundsAndUpdate()`; the program gets one `MsgZoneInBounds` per zone, in alphabetical order of ID (`card:…` first, then `dec:…`, `inc:…`), and handles them in `update()`.
- **Mouse:** click a card to select it; the wheel over the log scrolls it (the view stays put while new lines arrive); chips filter the log; on Deploys, headers sort and rows expand.
- **Keys:** arrows move the card selection, `enter` restart, `+`/`-` replicas, `space` traffic, `pgup/pgdn` log, `tab` next view, `e` environment, `q` quit.
- Under 100×28 it asks for a bigger terminal.

## Recording

From the repository root, with [VHS](https://github.com/charmbracelet/vhs): `vhs assets/tapes/files.tape`. Each tape starts the example with `--demo` and waits for the script to end. The `console.gif` was recorded at 12 frames per second and then squeezed with ffmpeg's palette tools to stay under about 1.2 MB:

```sh
ffmpeg -i assets/console.gif -vf "split[a][b];[a]palettegen=stats_mode=diff:max_colors=64[p];[b][p]paletteuse=dither=none:diff_mode=rectangle" out.gif
```
