# Changelog

## 1.0.0

First release. Port of [lrstanley/bubblezone](https://github.com/lrstanley/bubblezone) at commit `d3a8f5f` (master, eight commits after the `v2.0.0` tag; the Go sources are unchanged since `v2.0.0`), the version that targets Bubble Tea v2, for `@oakoliver/bubbletea` 1.2.1 (Bubble Tea v2.0.10 parity).

- Zone manager: `New`, `NewGlobal`, `mark`, `scan`, `get`, `clear`, `close`, `setEnabled`, `enabled`, `newPrefix`.
- `ZoneInfo`: `startX/startY/endX/endY`, `isZero`, `inBounds`, `pos`.
- `MsgZoneInBounds`, `anyInBounds`, `anyInBoundsAndUpdate`.
- Both a manager object and global functions, in PascalCase (`Mark`, like Go) and camelCase (`mark`).
- Tests ported from upstream's `manager_test.go`, `zoneinfo_test.go` and `messages_test.go` to `bun test`.
