import { migrateSave, type MigrationDeps, type MigrationResult } from './migrate';
import { gameStateSchema, type GameState } from './schema';

// localStorage transport (PHASE1-DEEP-DIVE §4.1–4.4). The save module sits
// behind this small interface so a future storage swap is a one-file change.
//
// The loader NEVER writes. In particular it never writes after a failed
// parse — that is the artifact's wipe hazard (CODE-AUDIT F1) designed out:
// a corrupt or future-version save is reported to the caller with the stored
// bytes left exactly as found, and only an explicit, confirmed import or a
// user-chosen Fresh Start may replace them.

export const SAVE_KEY = 'animal-sanctuary-save-v1';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type LoadResult =
  | { status: 'empty' }
  | { status: 'ok'; state: GameState; migratedFrom: number }
  | { status: 'corrupt' }
  | { status: 'future'; version: number };

export function loadSave(
  storage: StorageLike,
  deps?: MigrationDeps,
): LoadResult {
  const text = storage.getItem(SAVE_KEY);
  if (text === null) return { status: 'empty' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { status: 'corrupt' };
  }
  const result = migrateSave(raw, deps);
  switch (result.status) {
    case 'ok':
      return { status: 'ok', state: result.state, migratedFrom: result.fromVersion };
    case 'future':
      return { status: 'future', version: result.version };
    default:
      return { status: 'corrupt' };
  }
}

/** Validate, then write the whole document. Throws on an invalid state —
 * that is a programmer error, and it must be loud, never a silent bad save. */
export function saveSave(storage: StorageLike, state: GameState): void {
  const parsed = gameStateSchema.parse(state);
  storage.setItem(SAVE_KEY, JSON.stringify(parsed));
}

export function clearSave(storage: StorageLike): void {
  storage.removeItem(SAVE_KEY);
}

// --- Layer 3 of the safety net: export / import (PHASE1-DEEP-DIVE §4.4).

export function serializeExport(state: GameState): string {
  return JSON.stringify(gameStateSchema.parse(state), null, 2);
}

/** Validate + migrate an imported backup. Pure: touches no storage. The
 * caller replaces the live save only after the user confirms. */
export function parseImport(
  text: string,
  deps?: MigrationDeps,
): MigrationResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { status: 'invalid' };
  }
  return migrateSave(raw, deps);
}

// --- Layer 2: persistent-storage request (best-effort, no UI).

export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (
      typeof navigator !== 'undefined' &&
      navigator.storage &&
      typeof navigator.storage.persist === 'function'
    ) {
      return await navigator.storage.persist();
    }
  } catch {
    // Layer 2 is a bonus, never a failure path.
  }
  return false;
}
