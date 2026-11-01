import type { Cmd, Model, MouseMsg } from '@oakoliver/bubbletea';
import { Manager, New } from './manager.js';
import type { ZoneInfo } from './zoneinfo.js';

/** The app-wide manager. It is undefined until `NewGlobal()` is called. */
export let DefaultManager: Manager | undefined;

function manager(): Manager {
  if (!DefaultManager) throw new Error('manager not initialized');
  return DefaultManager;
}

/**
 * Creates the app-wide manager so you do not have to hand a manager to every
 * component. Calling it again does nothing. If you write a library, accept a
 * `Manager` from the user instead of relying on the global one.
 */
export function NewGlobal(): void {
  if (DefaultManager) return;
  DefaultManager = New();
}

/** Stops the global manager. */
export function Close(): void {
  manager().close();
}

/** Enables or disables the global manager; see `Manager.setEnabled`. */
export function SetEnabled(v: boolean): void {
  manager().setEnabled(v);
}

/** Reports whether the global manager is enabled. */
export function Enabled(): boolean {
  return manager().enabled();
}

/** Returns a unique ID prefix; see `Manager.newPrefix`. */
export function NewPrefix(): string {
  return manager().newPrefix();
}

/** Wraps `v` in zone markers; see `Manager.mark`. */
export function Mark(id: string, v: string): string {
  return manager().mark(id, v);
}

/** Forgets the stored zone for `id`. */
export function Clear(id: string): void {
  manager().clear(id);
}

/** Returns the zone for `id`, or a zero zone if it is not known; see `Manager.get`. */
export function Get(id: string): ZoneInfo {
  return manager().get(id);
}

/** Strips markers from a view and records the zones; see `Manager.scan`. */
export function Scan(v: string): string {
  return manager().scan(v);
}

/** Sends a `MsgZoneInBounds` for every zone under the mouse; see `Manager.anyInBounds`. */
export function AnyInBounds(model: Model, mouse: MouseMsg): void {
  manager().anyInBounds(model, mouse);
}

/** Like `AnyInBounds`, carrying the updated model and batched commands through. */
export function AnyInBoundsAndUpdate(model: Model, mouse: MouseMsg): [Model, Cmd] {
  return manager().anyInBoundsAndUpdate(model, mouse);
}

// camelCase aliases for the same functions.
export {
  NewGlobal as newGlobal,
  Close as close,
  SetEnabled as setEnabled,
  Enabled as enabled,
  NewPrefix as newPrefix,
  Mark as mark,
  Clear as clear,
  Get as get,
  Scan as scan,
  AnyInBounds as anyInBounds,
  AnyInBoundsAndUpdate as anyInBoundsAndUpdate,
};
