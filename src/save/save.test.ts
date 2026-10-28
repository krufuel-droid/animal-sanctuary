import { describe, expect, it } from 'vitest';
import { fnv1a } from './rng';
import { migrateSave, type MigrationDeps } from './migrate';
import { aiSeedFor, deriveAiProfile } from '../sim/traits-ai';
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
  it('preserves every player-visible fact and stamps v6', () => {
    const state = migratedV1();
    expect(state.version).toBe(6);
    expect(state.coins).toBe(137);
    expect(state.ownedItems).toEqual(['bow', 'scarf']);
    expect(state.adoptedCount).toBe(2);
    expect(state.rotationIndex).toBe(3);
    expect(state.phase).toBe('caring');
    expect(state.album).toHaveLength(2);
    // Stories are frozen text — byte-identical after migration.
    expect(state.album[0].story).toBe(V1_SAVE.album[0].story);
    expect(state.album[1].story).toBe(V1_SAVE.album[1].story);
    expect(state.residents[0].name).toBe('Clover');
    expect(state.residents[0].hearts).toBe(5);
    expect(state.residents[0].outfit).toBe('bow');
  });

  it('gives the mid-bond rescue its species-typical trait, deterministically', () => {
    const state = migratedV1();
    expect(state.residents[0].traitId).toBe('shy'); // bunny typical (§B4)
    expect(state.residents[0].traitSource).toBe('migration-default');
    expect(state.residents[0].traitSeed).toBe(fnv1a('migration:bunny:Clover'));
    expect(state.residents[0].favBonusCount).toBe(0);
    expect(state.residents[0].favBonusLastDate).toBeNull();
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
  it('writes the whole v6 document and reads it back equal', () => {
    const storage = new FakeStorage();
    const state = migratedV1();
    saveSave(storage, state);
    const raw = storage.getItem(SAVE_KEY);
    expect(raw).not.toBeNull();
    // The fields the artifact's zod wall would have stripped if forgotten:
    expect(raw).toContain('"traitId"');
    expect(raw).toContain('"rngSeed"');
    expect(raw).toContain('"pendingAdoption"');
    expect(raw).toContain('"needs"');
    expect(raw).toContain('"aiProfile"');
    expect(raw).toContain('"lastSeenAt"');
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
      residentInstanceId: state.residents[0].instanceId,
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

describe('H10 — v4 → v5 migration (UTILITY-AI-DEEP-DIVE §7.3/§8)', () => {
  // A faithful v4 save: the current migration output with the v5 fields
  // stripped back off and the version restamped — plus the SND-1 audio
  // prefs and a frozen mid-choice adoption, the two easiest things to lose.
  function v4Fixture() {
    const v6 = migratedV1();
    const raw = structuredClone(v6) as unknown as Record<string, unknown>;
    raw.version = 4;
    delete raw.lastSeenAt;
    // v4 predates the residents list: residents[0] was the `current` record.
    const cur = (raw.residents as Record<string, unknown>[])[0];
    raw.current = cur;
    delete raw.residents;
    delete cur.needs;
    delete cur.aiProfile;
    delete cur.aiProfileSource;
    raw.settings = { audio: { muted: true, volume: 0.5, ambience: false } };
    raw.phase = 'celebration';
    raw.pendingAdoption = {
      animalSnapshot: {
        name: 'Clover',
        species: 'bunny',
        traitId: 'shy',
        favoriteCareAction: 'feed',
        outfit: 'bow',
      },
      offerIds: ['finn', 'marco', 'luna'],
      pickId: 'finn',
    };
    return raw;
  }

  it('keeps every pre-existing field byte-identical at the value level', () => {
    const raw = v4Fixture();
    const result = migrateSave(structuredClone(raw), makeDeps());
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    const s = result.state;
    expect(s.version).toBe(6);
    expect(s.coins).toBe(raw.coins);
    expect(s.ownedItems).toEqual(raw.ownedItems);
    expect(s.adoptedCount).toBe(raw.adoptedCount);
    expect(s.rotationIndex).toBe(raw.rotationIndex);
    expect(s.phase).toBe('celebration');
    // v6 names WHICH resident the celebration belongs to; for a pre-v6
    // save that is the (only) rescue — everything else stays identical.
    expect(s.pendingAdoption).toEqual({
      ...(raw.pendingAdoption as Record<string, unknown>),
      residentInstanceId: s.residents[0].instanceId,
    });
    expect(s.settings).toEqual(raw.settings);
    expect(s.album).toEqual(raw.album);
    const before = raw.current as Record<string, unknown>;
    for (const k of [
      'species', 'name', 'hearts', 'outfit', 'instanceId', 'traitId',
      'traitSeed', 'traitSource', 'favBonusCount', 'favBonusLastDate',
    ]) {
      expect(s.residents[0][k as keyof typeof s.residents[0]]).toEqual(before[k]);
    }
    expect(s.rngSeed).toBe(raw.rngSeed);
    expect(s.arrivalIndex).toBe(raw.arrivalIndex);
    expect(s.adopterCooldowns).toEqual(raw.adopterCooldowns);
    expect(s.lastOfferIds).toEqual(raw.lastOfferIds);
    expect(s.lastStoryTemplateIds).toEqual(raw.lastStoryTemplateIds);
    expect(s.lastSeenAt).toBeNull();
  });

  it('generates needs + aiProfile via the AI stream, deterministically', () => {
    const result = migrateSave(v4Fixture(), makeDeps());
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    const s = result.state;
    const expected = deriveAiProfile(s.rngSeed, s.arrivalIndex, 'shy');
    expect(s.residents[0].aiProfile).toEqual({
      weights: expected.weights,
      metabolism: expected.metabolism,
      aiSeed: aiSeedFor(s.rngSeed, s.arrivalIndex),
    });
    expect(s.residents[0].aiProfileSource).toBe('migration');
    expect(s.residents[0].needs).toEqual(expected.arrivalNeeds);
    for (const v of Object.values(s.residents[0].needs!)) {
      expect(v).toBeGreaterThanOrEqual(55);
      expect(v).toBeLessThanOrEqual(90);
    }
  });

  it('gives album entries NO needs and NO aiProfile (§7.3)', () => {
    const result = migrateSave(v4Fixture(), makeDeps());
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    for (const entry of result.state.album) {
      expect(entry).not.toHaveProperty('needs');
      expect(entry).not.toHaveProperty('aiProfile');
    }
  });

  it('is a no-op the second time (stored profile is never re-derived)', () => {
    const once = migrateSave(v4Fixture(), makeDeps());
    expect(once.status).toBe('ok');
    if (once.status !== 'ok') return;
    const twice = migrateSave(structuredClone(once.state), makeDeps());
    expect(twice.status).toBe('ok');
    if (twice.status === 'ok') expect(twice.state).toEqual(once.state);
  });
});

describe('H10 — v5 → v6 migration (multi-resident yard; step 2B)', () => {
  // A faithful v5 save, modelled on a real mid-game one: the current
  // migration output folded back to the v5 shape — mid-hearts rescue with
  // needs + aiProfile, one album entry, coins, outfits owned, the SND-1
  // audio prefs, and a frozen mid-choice adoption (which in v5 did NOT
  // name its resident yet).
  function v5Fixture() {
    const v6 = migratedV1();
    const raw = structuredClone(v6) as unknown as Record<string, unknown>;
    raw.version = 5;
    raw.settings = { audio: { muted: true, volume: 0.5, ambience: false } };
    raw.phase = 'celebration';
    raw.pendingAdoption = {
      animalSnapshot: {
        name: 'Clover',
        species: 'bunny',
        traitId: 'shy',
        favoriteCareAction: 'feed',
        outfit: 'bow',
      },
      offerIds: ['finn', 'marco', 'luna'],
      pickId: 'finn',
    };
    const cur = (raw.residents as Record<string, unknown>[])[0];
    raw.current = cur;
    delete raw.residents;
    return raw;
  }

  it('residents[0] IS the v5 current rescue — every field value-identical', () => {
    const raw = v5Fixture();
    const before = raw.current as Record<string, unknown>;
    const result = migrateSave(structuredClone(raw), makeDeps());
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    const s = result.state;
    expect(s.version).toBe(6);
    expect(s.residents).toHaveLength(1);
    // needs and aiProfile included: the stored AI life is carried, never
    // re-derived, exactly like every other field.
    expect(s.residents[0]).toEqual(before);
    // Root fields carried exactly.
    expect(s.coins).toBe(raw.coins);
    expect(s.ownedItems).toEqual(raw.ownedItems);
    expect(s.adoptedCount).toBe(raw.adoptedCount);
    expect(s.rotationIndex).toBe(raw.rotationIndex);
    expect(s.arrivalIndex).toBe(raw.arrivalIndex);
    expect(s.rngSeed).toBe(raw.rngSeed);
    expect(s.phase).toBe('celebration');
    expect(s.settings).toEqual(raw.settings);
    expect(s.album).toEqual(raw.album);
    expect(s.adopterCooldowns).toEqual(raw.adopterCooldowns);
    expect(s.lastOfferIds).toEqual(raw.lastOfferIds);
    expect(s.lastStoryTemplateIds).toEqual(raw.lastStoryTemplateIds);
    expect(s.lastSeenAt).toEqual(raw.lastSeenAt);
  });

  it('names the pending adoption’s resident — the v5 current rescue', () => {
    const result = migrateSave(v5Fixture(), makeDeps());
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    const before = v5Fixture().pendingAdoption as Record<string, unknown>;
    expect(result.state.pendingAdoption).toEqual({
      ...before,
      residentInstanceId: result.state.residents[0].instanceId,
    });
  });

  it('gives album entries NO needs and NO aiProfile (§7.3)', () => {
    const result = migrateSave(v5Fixture(), makeDeps());
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    for (const entry of result.state.album) {
      expect(entry).not.toHaveProperty('needs');
      expect(entry).not.toHaveProperty('aiProfile');
    }
  });

  it('is a no-op the second time', () => {
    const once = migrateSave(v5Fixture(), makeDeps());
    expect(once.status).toBe('ok');
    if (once.status !== 'ok') return;
    const twice = migrateSave(structuredClone(once.state), makeDeps());
    expect(twice.status).toBe('ok');
    if (twice.status === 'ok') expect(twice.state).toEqual(once.state);
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
