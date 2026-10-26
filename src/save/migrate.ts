import { fnv1a, newMasterSeed } from './rng';
import {
  CURRENT_SAVE_VERSION,
  SPECIES_TYPICAL_TRAIT,
  TRAIT_IDS,
  gameStateSchema,
  type GameState,
  type SpeciesId,
  type TraitId,
} from './schema';

// Client-side migration chain, v1 → v4 (PHASE1-DEEP-DIVE §4.1: the artifact's
// chain moves as-is; PHASE0-DEEP-DIVE §B5/§B.6.4/§B.6.5: the step rules).
//
// Laws, from CODE-AUDIT.md F1 and the specs:
//  - Migration runs fully in memory and is written back only on success.
//  - A blob that cannot be migrated is reported, NEVER overwritten.
//  - A save from a NEWER version is reported, never destructively rewritten.
//  - Album entries are history: migration may add fallback fields to legacy
//    entries but never rewrites story text, names, or outcomes.
//  - Migration is idempotent: migrating a current save is a no-op.

export interface MigrationDeps {
  /** Master-seed source (injectable for deterministic tests). */
  newSeed: () => number;
  /** Instance-id source (injectable for deterministic tests). */
  newId: () => string;
}

const defaultDeps: MigrationDeps = {
  newSeed: newMasterSeed,
  newId: () =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `id-${Date.now()}-${Math.floor(Math.random() * 1e9)}`,
};

export type MigrationResult =
  | { status: 'ok'; state: GameState; fromVersion: number }
  | { status: 'invalid' }
  | { status: 'future'; version: number };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

function normalizeTraitId(v: unknown): TraitId | null {
  if (typeof v !== 'string') return null;
  const lower = v.toLowerCase();
  return (TRAIT_IDS as readonly string[]).includes(lower)
    ? (lower as TraitId)
    : null;
}

function typicalTraitFor(species: unknown): TraitId {
  if (
    typeof species === 'string' &&
    species in SPECIES_TYPICAL_TRAIT
  ) {
    return SPECIES_TYPICAL_TRAIT[species as SpeciesId];
  }
  return 'gentle';
}

/** Legacy album fallback copy (PHASE0-DEEP-DIVE §B.6.4) — true of every
 * pre-feature adoption; never a retro-assigned real adopter. */
const LEGACY_ADOPTER = {
  adopterId: null,
  adopterName: 'A Loving Family',
  adopterHome: 'A cozy forever home',
  adopterHomeShort: 'a cozy forever home',
  homeTheme: 'cozy',
  matchBadge: false,
  matchScore: null,
} as const;

export function migrateSave(
  raw: unknown,
  deps: MigrationDeps = defaultDeps,
): MigrationResult {
  if (!isRecord(raw)) return { status: 'invalid' };

  const fromVersion = isInt(raw.version) ? raw.version : 1;
  if (fromVersion > CURRENT_SAVE_VERSION) {
    return { status: 'future', version: fromVersion };
  }

  // --- Core v1 fields: present-but-wrong-typed is a corrupt blob, not a
  // defaultable gap. Missing fields take defaults (spec: merge-with-defaults).
  const coins = raw.coins === undefined ? 0 : raw.coins;
  const adoptedCount =
    raw.adoptedCount === undefined ? 0 : raw.adoptedCount;
  const rotationIndex =
    raw.rotationIndex === undefined ? 0 : raw.rotationIndex;
  if (!isInt(coins) || coins < 0) return { status: 'invalid' };
  if (!isInt(adoptedCount) || adoptedCount < 0) return { status: 'invalid' };
  if (!isInt(rotationIndex) || rotationIndex < 0) return { status: 'invalid' };
  if (raw.phase !== undefined && raw.phase !== 'caring' && raw.phase !== 'celebration') {
    return { status: 'invalid' };
  }
  if (!isRecord(raw.current)) return { status: 'invalid' };
  if (!Array.isArray(raw.album)) return { status: 'invalid' };

  const cur = raw.current;
  if (typeof cur.species !== 'string' || typeof cur.name !== 'string') {
    return { status: 'invalid' };
  }
  if (!isInt(cur.hearts) || cur.hearts < 0 || cur.hearts > 8) {
    return { status: 'invalid' };
  }

  // --- v1 → v2 (stage 2a): personality data core.
  const arrivalIndex = isInt(raw.arrivalIndex)
    ? raw.arrivalIndex
    : adoptedCount;
  const rngSeed = isInt(raw.rngSeed) ? raw.rngSeed : deps.newSeed();

  const currentTrait = normalizeTraitId(cur.traitId);
  const current = {
    species: cur.species,
    name: cur.name,
    hearts: cur.hearts,
    outfit: typeof cur.outfit === 'string' ? cur.outfit : null,
    instanceId:
      typeof cur.instanceId === 'string' ? cur.instanceId : deps.newId(),
    // A mid-bond rescue keeps the trait it already has; only a missing or
    // unrecognised one takes the species-typical migration default.
    traitId: currentTrait ?? typicalTraitFor(cur.species),
    traitSeed: isInt(cur.traitSeed)
      ? cur.traitSeed
      : fnv1a(`migration:${cur.species}:${cur.name}`),
    traitSource:
      typeof cur.traitSource === 'string' && currentTrait !== null
        ? cur.traitSource
        : 'migration-default',
    favBonusCount: isInt(cur.favBonusCount) ? cur.favBonusCount : 0,
    favBonusLastDate:
      typeof cur.favBonusLastDate === 'string' ? cur.favBonusLastDate : null,
  };

  // --- Album: v1 → v2 (trait snapshot) and → v3/v4 (adopter fallbacks).
  const album: unknown[] = [];
  for (const entry of raw.album) {
    if (!isRecord(entry)) return { status: 'invalid' };
    if (
      typeof entry.id !== 'string' ||
      typeof entry.name !== 'string' ||
      typeof entry.species !== 'string' ||
      typeof entry.story !== 'string'
    ) {
      return { status: 'invalid' };
    }
    album.push({
      id: entry.id,
      name: entry.name,
      species: entry.species,
      outfit: typeof entry.outfit === 'string' ? entry.outfit : null,
      story: entry.story, // frozen text — never rewritten, byte for byte
      instanceId:
        typeof entry.instanceId === 'string' ? entry.instanceId : deps.newId(),
      // Legacy entries get traitId: null — no guessed trait, no chip, ever.
      traitId:
        entry.traitId === undefined ? null : normalizeTraitId(entry.traitId),
      favoriteCareAction:
        typeof entry.favoriteCareAction === 'string'
          ? entry.favoriteCareAction
          : null,
      adopterId:
        entry.adopterId === undefined
          ? LEGACY_ADOPTER.adopterId
          : typeof entry.adopterId === 'string'
            ? entry.adopterId
            : null,
      adopterName:
        typeof entry.adopterName === 'string'
          ? entry.adopterName
          : LEGACY_ADOPTER.adopterName,
      adopterHome:
        typeof entry.adopterHome === 'string'
          ? entry.adopterHome
          : LEGACY_ADOPTER.adopterHome,
      adopterHomeShort:
        typeof entry.adopterHomeShort === 'string'
          ? entry.adopterHomeShort
          : LEGACY_ADOPTER.adopterHomeShort,
      homeTheme:
        typeof entry.homeTheme === 'string'
          ? entry.homeTheme
          : LEGACY_ADOPTER.homeTheme,
      matchBadge:
        typeof entry.matchBadge === 'boolean'
          ? entry.matchBadge
          : LEGACY_ADOPTER.matchBadge,
      matchScore:
        entry.matchScore === undefined
          ? LEGACY_ADOPTER.matchScore
          : typeof entry.matchScore === 'number'
            ? entry.matchScore
            : null,
      storySummary:
        typeof entry.storySummary === 'string'
          ? entry.storySummary
          : `${entry.name} lives in a cozy forever home now.`,
    });
  }

  // --- v3 → v4 (stage 3b): matching state at the root.
  const candidate = {
    version: CURRENT_SAVE_VERSION,
    coins,
    ownedItems: Array.isArray(raw.ownedItems)
      ? raw.ownedItems.filter((i): i is string => typeof i === 'string')
      : [],
    adoptedCount,
    rotationIndex,
    phase: raw.phase === 'celebration' ? 'celebration' : 'caring',
    current,
    album,
    rngSeed,
    arrivalIndex,
    pendingAdoption: isRecord(raw.pendingAdoption)
      ? raw.pendingAdoption
      : null,
    adopterCooldowns: isRecord(raw.adopterCooldowns)
      ? raw.adopterCooldowns
      : {},
    lastOfferIds: Array.isArray(raw.lastOfferIds)
      ? raw.lastOfferIds.filter((i): i is string => typeof i === 'string')
      : [],
    lastStoryTemplateIds: isRecord(raw.lastStoryTemplateIds)
      ? raw.lastStoryTemplateIds
      : null,
    // Sound prefs ride through every migration untouched (§8.3): they are
    // parent/device settings, and the field-by-field rebuild above must
    // never drop them. The schema validates the shape; audioPrefsOf merges
    // defaults at read time.
    ...(isRecord(raw.settings) ? { settings: raw.settings } : {}),
  };

  // Final gate: the migrated shape must satisfy the v4 contract. If it does
  // not, the blob is corrupt — report it, write nothing.
  const parsed = gameStateSchema.safeParse(candidate);
  if (!parsed.success) return { status: 'invalid' };
  return { status: 'ok', state: parsed.data, fromVersion };
}
