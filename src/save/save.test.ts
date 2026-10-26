import { describe, expect, it } from 'vitest';
import { fnv1a } from './rng';
import { migrateSave, type MigrationDeps } from './migrate';
import { audioPrefsOf, DEFAULT_AUDIO_PREFS } from './schema';
import {
  SAVE_KEY,
  clearSave,
  loadSave,
  parseImport,
  saveSave,
  serializeExport,
  type StorageLike,
} from './storage';

// The audit's A1–A3 drills (CODE-AUDIT.md), promoted to permanent tests
// (PHASE1-DEEP-DIVE §4.5/§7). Every future schema change must keep these green.

function makeDeps(): MigrationDeps {
  let n = 0;
  return {
    newSeed: () => 123456789,
    newId: () => `test-id-${++n}`,
  };
}

class FakeStorage implements StorageLike {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

// A v1 (pre-Phase-0) save, built strictly from the pre-edit schema shape —
// per fixtures/legacy-save-capture-2026-10-26.md, no real legacy blob exists,
// so this fixture IS the legacy format: coins > 0, adoptedCount ≥ 1, album
// entries in the old 5-field shape, a mid-bond current rescue — plus junk
// unknown keys, which parsing must strip.
const V1_SAVE = {
  coins: 137,
  ownedItems: ['bow', 'scarf'],
  adoptedCount: 2,
  rotationIndex: 3,
  phase: 'caring',
  legacyJunk: { should: 'be stripped' },
  current: {
    species: 'bunny',
    name: 'Clover',
    hearts: 5,
    outfit: 'bow',
  },
  album: [
    {
      id: 'adopted-1729000000001',
      name: 'Biscuit',
      species: 'dog',
      outfit: null,
      story:
        'Biscuit found a sunny porch and a person who saves the best chair for him.',
      junkField: 42,
    },
    {
      id: 'adopted-1729000000002',
      name: 'Miso',
      species: 'cat',
      outfit: 'scarf',
      story: 'Miso chose the quiet studio with the big windows.',
    },
  ],
};

function migratedV1() {
  const result = migrateSave(structuredClone(V1_SAVE), makeDeps());
  if (result.status !== 'ok') throw new Error('fixture failed to migrate');
  return result.state;
}

describe('A1 — the wipe drill: a v1 save migrates intact', () => {
  it('preserves every player-visible fact and stamps v4', () => {
    const state = migratedV1();
    expect(state.version).toBe(4);
    expect(state.coins).toBe(137);
    expect(state.ownedItems).toEqual(['bow', 'scarf']);
    expect(state.adoptedCount).toBe(2);
    expect(state.rotationIndex).toBe(3);
    expect(state.phase).toBe('caring');
    expect(state.album).toHaveLength(2);
    // Stories are frozen text — byte-identical after migration.
    expect(state.album[0].story).toBe(V1_SAVE.album[0].story);
    expect(state.album[1].story).toBe(V1_SAVE.album[1].story);
    expect(state.current.name).toBe('Clover');
    expect(state.current.hearts).toBe(5);
    expect(state.current.outfit).toBe('bow');
  });

  it('gives the mid-bond rescue its species-typical trait, deterministically', () => {
    const state = migratedV1();
    expect(state.current.traitId).toBe('shy'); // bunny typical (§B4)
    expect(state.current.traitSource).toBe('migration-default');
    expect(state.current.traitSeed).toBe(fnv1a('migration:bunny:Clover'));
    expect(state.current.favBonusCount).toBe(0);
    expect(state.current.favBonusLastDate).toBeNull();
    expect(state.rngSeed).toBe(123456789);
    expect(state.arrivalIndex).toBe(2); // = adoptedCount (audit F9)
  });

  it('gives legacy album entries traitId: null and the §B.6.4 fallbacks', () => {
    const state = migratedV1();
    for (const entry of state.album) {
      expect(entry.traitId).toBeNull();
      expect(entry.adopterId).toBeNull();
      expect(entry.adopterName).toBe('A Loving Family');
      expect(entry.adopterHome).toBe('A cozy forever home');
      expect(entry.adopterHomeShort).toBe('a cozy forever home');
      expect(entry.homeTheme).toBe('cozy');
      expect(entry.matchBadge).toBe(false);
      expect(entry.matchScore).toBeNull();
      expect(entry.favoriteCareAction).toBeNull();
      expect(typeof entry.instanceId).toBe('string');
    }
    expect(state.album[0].storySummary).toBe(
      'Biscuit lives in a cozy forever home now.',
    );
  });

  it('strips unknown keys instead of preserving them', () => {
    const state = migratedV1() as unknown as Record<string, unknown>;
    expect(state.legacyJunk).toBeUndefined();
    const entry = state.album as unknown as Record<string, unknown>[];
    expect(entry[0].junkField).toBeUndefined();
  });

  it('is idempotent: migrating a migrated save changes nothing', () => {
    const once = migratedV1();
    const twice = migrateSave(structuredClone(once), makeDeps());
    expect(twice.status).toBe('ok');
    if (twice.status === 'ok') expect(twice.state).toEqual(once);
  });
});

describe('A2 — round-trip: new fields actually persist (the strip test)', () => {
  it('writes the whole v4 document and reads it back equal', () => {
    const storage = new FakeStorage();
    const state = migratedV1();
    saveSave(storage, state);
    const raw = storage.getItem(SAVE_KEY);
    expect(raw).not.toBeNull();
    // The fields the artifact's zod wall would have stripped if forgotten:
    expect(raw).toContain('"traitId"');
    expect(raw).toContain('"rngSeed"');
    expect(raw).toContain('"pendingAdoption"');
    const loaded = loadSave(storage, makeDeps());
    expect(loaded.status).toBe('ok');
    if (loaded.status === 'ok') expect(loaded.state).toEqual(state);
  });

  it('survives export → import byte-stable at the value level', () => {
    const state = migratedV1();
    const imported = parseImport(serializeExport(state), makeDeps());
    expect(imported.status).toBe('ok');
    if (imported.status === 'ok') expect(imported.state).toEqual(state);
  });
});

describe('A3 — corrupt saves are reported, never overwritten', () => {
  it('leaves unparseable bytes exactly as found', () => {
    const storage = new FakeStorage();
    storage.setItem(SAVE_KEY, 'not json{{{');
    expect(loadSave(storage).status).toBe('corrupt');
    expect(storage.getItem(SAVE_KEY)).toBe('not json{{{');
  });

  it('leaves a wrong-shaped save exactly as found', () => {
    const storage = new FakeStorage();
    const blob = JSON.stringify({ coins: 'lots', album: [] });
    storage.setItem(SAVE_KEY, blob);
    expect(loadSave(storage).status).toBe('corrupt');
    expect(storage.getItem(SAVE_KEY)).toBe(blob);
  });

  it('reports a future-version save without touching it', () => {
    const storage = new FakeStorage();
    const blob = JSON.stringify({ ...structuredClone(V1_SAVE), version: 99 });
    storage.setItem(SAVE_KEY, blob);
    const result = loadSave(storage);
    expect(result.status).toBe('future');
    expect(storage.getItem(SAVE_KEY)).toBe(blob);
  });

  it('distinguishes empty from corrupt, and clearSave empties', () => {
    const storage = new FakeStorage();
    expect(loadSave(storage).status).toBe('empty');
    saveSave(storage, migratedV1());
    expect(loadSave(storage).status).toBe('ok');
    clearSave(storage);
    expect(loadSave(storage).status).toBe('empty');
  });
});

describe('A4 — a frozen mid-choice adoption survives the move', () => {
  it('keeps pendingAdoption identical through save → load', () => {
    const state = migratedV1();
    state.phase = 'celebration';
    state.pendingAdoption = {
      animalSnapshot: {
        name: 'Pip',
        species: 'duck',
        traitId: 'wild',
        favoriteCareAction: 'play',
        outfit: null,
      },
      offerIds: ['finn', 'marco', 'luna'],
      pickId: 'finn',
    };
    const storage = new FakeStorage();
    saveSave(storage, state);
    const loaded = loadSave(storage, makeDeps());
    expect(loaded.status).toBe('ok');
    if (loaded.status === 'ok') {
      expect(loaded.state.pendingAdoption).toEqual(state.pendingAdoption);
    }
  });

  it('rejects garbage imports without throwing', () => {
    expect(parseImport('}{').status).toBe('invalid');
    expect(parseImport('{"coins":"lots"}').status).toBe('invalid');
  });
});

describe('audio settings (§8.3 — additive, defaults merged)', () => {
  it('a save carrying settings.audio keeps it through migration; prefs merge over defaults', () => {
    const raw = structuredClone(V1_SAVE) as Record<string, unknown>;
    raw.settings = { audio: { muted: true, volume: 0.5 } };
    const result = migrateSave(raw, makeDeps());
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(audioPrefsOf(result.state)).toEqual({
      v: 1, muted: true, volume: 0.5, ambience: true, music: true, calm: false,
    });
    const store = new FakeStorage();
    saveSave(store, result.state);
    const back = loadSave(store);
    expect(back.status).toBe('ok');
    if (back.status === 'ok') expect(audioPrefsOf(back.state).muted).toBe(true);
  });

  it('a save without settings yields the defaults (volume 0.9, unmuted)', () => {
    expect(audioPrefsOf(null)).toEqual(DEFAULT_AUDIO_PREFS);
    expect(audioPrefsOf(migratedV1())).toEqual(DEFAULT_AUDIO_PREFS);
  });
});
