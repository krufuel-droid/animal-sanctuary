import { fnv1a, newMasterSeed } from './rng';
import {
  CURRENT_SAVE_VERSION,
  SPECIES_TYPICAL_TRAIT,
  TRAIT_IDS,
  gameStateSchema,
  type GameState,
  type Rescue,
  type SavedAiProfile,
  type SavedNeeds,
  type SpeciesId,
  type TraitId,
} from './schema';
import { deriveAiProfile } from '../sim/traits-ai';
import { NEED_IDS } from '../sim/needs';

// Client-side migration chain, v1 → v6 (PHASE1-DEEP-DIVE §4.1: the artifact's
// chain moves as-is; PHASE0-DEEP-DIVE §B5/§B.6.4/§B.6.5: the step rules;
// UTILITY-AI-DEEP-DIVE §7.3: the v4 → v5 autonomy step; Phase 2 step 2B:
// the v5 → v6 residents step — the old current rescue becomes
// residents[0], value-identical, and a frozen pendingAdoption learns
// which resident it belongs to).
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

/** A stored needs record is kept as-is (finite values clamped into range);
 * anything malformed is regenerated from the AI stream instead. */
function keptNeeds(v: unknown): SavedNeeds | null {
  if (!isRecord(v)) return null;
  const out = {} as SavedNeeds;
  for (const n of NEED_IDS) {
    const val = v[n];
    if (typeof val !== 'number' || !Number.isFinite(val)) return null;
    out[n] = Math.min(100, Math.max(0, val));
  }
  return out;
}

/** A stored aiProfile is a resolved outcome (§4.3): kept verbatim when
 * well-formed, never re-derived. */
function keptAiProfile(v: unknown): SavedAiProfile | null {
  if (!isRecord(v) || !isRecord(v.weights)) return null;
  const weights = {} as SavedAiProfile['weights'];
  for (const n of NEED_IDS) {
    const val = v.weights[n];
    if (typeof val !== 'number' || !Number.isFinite(val)) return null;
    weights[n] = val;
  }
  if (typeof v.metabolism !== 'number' || !Number.isFinite(v.metabolism)) {
    return null;
  }
  if (!isInt(v.aiSeed) || v.aiSeed < 0 || v.aiSeed > 4294967295) return null;
  return { weights, metabolism: v.metabolism, aiSeed: v.aiSeed };
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
  if (!Array.isArray(raw.album)) return { status: 'invalid' };

  // --- v5 → v6 (Phase 2 step 2B): the residents list. A v6 save carries
  // `residents`; every older save carries the single `current` rescue,
  // which becomes residents[0]. Each record passes the same basic shape
  // checks the single rescue always did — a bad record is a corrupt blob.
  const residentRecords: Record<string, unknown>[] = [];
  if (Array.isArray(raw.residents) && raw.residents.length > 0) {
    for (const rec of raw.residents) {
      if (!isRecord(rec)) return { status: 'invalid' };
      residentRecords.push(rec);
    }
  } else if (isRecord(raw.current)) {
    residentRecords.push(raw.current);
  } else {
    return { status: 'invalid' };
  }
  for (const rec of residentRecords) {
    if (typeof rec.species !== 'string' || typeof rec.name !== 'string') {
      return { status: 'invalid' };
    }
    if (!isInt(rec.hearts) || rec.hearts < 0 || rec.hearts > 8) {
      return { status: 'invalid' };
    }
  }

  // --- v1 → v2 (stage 2a): personality data core.
  const arrivalIndex = isInt(raw.arrivalIndex)
    ? raw.arrivalIndex
    : adoptedCount;
  const rngSeed = isInt(raw.rngSeed) ? raw.rngSeed : deps.newSeed();

  /** A resident's own arrival number, for its AI stream (§4.3 keys the
   * stream on rngSeed + arrivalIndex). Residents minted by the game are
   * `arr-<n>`; the primary resident of an older save IS the root counter. */
  const arrivalIndexFor = (
    rec: Record<string, unknown>,
    position: number,
  ): number => {
    if (typeof rec.instanceId === 'string') {
      const m = /^arr-(\d+)$/.exec(rec.instanceId);
      if (m) return Number(m[1]);
    }
    return position === 0 ? arrivalIndex : arrivalIndex + position;
  };

  /** Normalize one rescue record — the v1→v5 per-rescue steps, unchanged:
   * a mid-bond rescue keeps the trait it already has (only a missing or
   * unrecognised one takes the species-typical migration default), and
   * v4 → v5 autonomy state is generated via the rescue's OWN AI stream
   * when missing or malformed — well-formed stored values are kept
   * verbatim, never re-derived. Album entries get none of this (§7.3). */
  const normalizeResident = (
    cur: Record<string, unknown>,
    position: number,
  ): Rescue => {
    const currentTrait = normalizeTraitId(cur.traitId);
    const resolvedTraitId: TraitId =
      currentTrait ?? typicalTraitFor(cur.species);
    const keptProfile = keptAiProfile(cur.aiProfile);
    const keptNeedsValue = keptNeeds(cur.needs);
    const derived =
      keptProfile && keptNeedsValue
        ? null
        : deriveAiProfile(
            rngSeed,
            arrivalIndexFor(cur, position),
            resolvedTraitId,
          );
    const aiProfile: SavedAiProfile = keptProfile ?? {
      weights: derived!.weights,
      metabolism: derived!.metabolism,
      aiSeed: derived!.aiSeed,
    };
    const rescueNeeds: SavedNeeds = keptNeedsValue ?? derived!.arrivalNeeds;
    return {
      species: cur.species as string,
      name: cur.name as string,
      hearts: cur.hearts as number,
      outfit: typeof cur.outfit === 'string' ? cur.outfit : null,
      instanceId:
        typeof cur.instanceId === 'string' ? cur.instanceId : deps.newId(),
      traitId: resolvedTraitId,
      traitSeed: isInt(cur.traitSeed)
        ? cur.traitSeed
        : fnv1a(`migration:${cur.species}:${cur.name}`),
      traitSource:
        typeof cur.traitSource === 'string' && currentTrait !== null
          ? (cur.traitSource as Rescue['traitSource'])
          : 'migration-default',
      favBonusCount: isInt(cur.favBonusCount) ? cur.favBonusCount : 0,
      favBonusLastDate:
        typeof cur.favBonusLastDate === 'string' ? cur.favBonusLastDate : null,
      needs: rescueNeeds,
      aiProfile,
      aiProfileSource:
        keptProfile && typeof cur.aiProfileSource === 'string'
          ? (cur.aiProfileSource as Rescue['aiProfileSource'])
          : keptProfile
            ? 'rolled'
            : 'migration',
    };
  };

  const residents = residentRecords.map((rec, i) => normalizeResident(rec, i));

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

  // --- v5 → v6: a frozen offer learns its resident. An older save's
  // pending adoption is necessarily about its single rescue —
  // residents[0]; a v6 blob's stored reference is kept as-is.
  const pendingAdoption = isRecord(raw.pendingAdoption)
    ? {
        ...raw.pendingAdoption,
        residentInstanceId:
          typeof raw.pendingAdoption.residentInstanceId === 'string'
            ? raw.pendingAdoption.residentInstanceId
            : residents[0].instanceId,
      }
    : null;

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
    residents,
    album,
    rngSeed,
    arrivalIndex,
    pendingAdoption,
    adopterCooldowns: isRecord(raw.adopterCooldowns)
      ? raw.adopterCooldowns
      : {},
    lastOfferIds: Array.isArray(raw.lastOfferIds)
      ? raw.lastOfferIds.filter((i): i is string => typeof i === 'string')
      : [],
    lastStoryTemplateIds: isRecord(raw.lastStoryTemplateIds)
      ? raw.lastStoryTemplateIds
      : null,
    // v5 root: carried when present; absent (pre-v5) saves get null, which
    // the loader reads as "never seen by the autonomy engine" — no
    // absence catch-up is applied to them.
    lastSeenAt: typeof raw.lastSeenAt === 'number' ? raw.lastSeenAt : null,
    // Sound prefs ride through every migration untouched (§8.3): they are
    // parent/device settings, and the field-by-field rebuild above must
    // never drop them. The schema validates the shape; audioPrefsOf merges
    // defaults at read time.
    ...(isRecord(raw.settings) ? { settings: raw.settings } : {}),
  };

  // Final gate: the migrated shape must satisfy the current contract. If it does
  // not, the blob is corrupt — report it, write nothing.
  const parsed = gameStateSchema.safeParse(candidate);
  if (!parsed.success) return { status: 'invalid' };
  return { status: 'ok', state: parsed.data, fromVersion };
}
