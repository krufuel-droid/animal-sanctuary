import { z } from 'zod';

// The v4 save contract for the Animal Sanctuary repo build.
// Shape provenance: CODE-AUDIT.md (F1/F2/C4/C6 — the real artifact schema) and
// PHASE0-DEEP-DIVE.md §B5/§B6 (the fields each Phase 0 stage added).
// v5 = v4 byte-for-byte (PHASE1-DEEP-DIVE §3 ruling): this schema IS the
// artifact's v4 shape, so the cutover transfer is a plain import.
//
// Fencing rules carried over from the audit, binding forever:
//  - additive-only: never rename, never re-type, never make a field required
//    in a way an older save could fail;
//  - unknown keys are stripped on parse (zod default), never preserved;
//  - a save that fails validation is NEVER overwritten by the loader.

export const CURRENT_SAVE_VERSION = 4;

export const SPECIES_IDS = [
  'dog',
  'cat',
  'bunny',
  'fox',
  'panda',
  'duck',
  'turtle',
  'hedgehog',
  'penguin',
] as const;
export type SpeciesId = (typeof SPECIES_IDS)[number];

export const TRAIT_IDS = [
  'shy',
  'brave',
  'sleepy',
  'playful',
  'foodie',
  'fancy',
  'gentle',
  'mischievous',
  'curious',
  'tidy',
  'wild',
  'cuddly',
] as const;
export type TraitId = (typeof TRAIT_IDS)[number];

/** Species-typical trait (PHASE0-DEEP-DIVE §B4) — used ONLY by migration,
 * for a rescue the player is already mid-bond with. Never re-rolled. */
export const SPECIES_TYPICAL_TRAIT: Record<SpeciesId, TraitId> = {
  dog: 'playful',
  cat: 'curious',
  bunny: 'shy',
  fox: 'mischievous',
  panda: 'sleepy',
  duck: 'wild',
  turtle: 'gentle',
  hedgehog: 'brave',
  penguin: 'fancy',
};

export const traitSourceSchema = z.enum([
  'rolled',
  'species-pool',
  'migration-default',
  'roster-fixed',
]);
export type TraitSource = z.infer<typeof traitSourceSchema>;

export const rescueSchema = z.object({
  species: z.string(),
  name: z.string(),
  hearts: z.number().int().min(0).max(8),
  outfit: z.string().nullable(),
  // Phase 0 stage 2a additions (stored outcomes, never re-derived):
  instanceId: z.string(),
  traitId: z.string().nullable(),
  traitSeed: z.number().int().min(0).max(4294967295),
  traitSource: traitSourceSchema,
  favBonusCount: z.number().int().min(0).max(2),
  favBonusLastDate: z.string().nullable(),
});
export type Rescue = z.infer<typeof rescueSchema>;

export const albumEntrySchema = z.object({
  // v1 fields — `outfit`, never `outfitId` (audit C4):
  id: z.string(),
  name: z.string(),
  species: z.string(),
  outfit: z.string().nullable(),
  story: z.string(),
  // Stage 2a snapshot fields:
  instanceId: z.string(),
  traitId: z.string().nullable(),
  // Stage 3a/3b snapshot fields (legacy entries carry the §B.6.4 fallbacks):
  favoriteCareAction: z.string().nullable(),
  adopterId: z.string().nullable(),
  adopterName: z.string(),
  adopterHome: z.string(),
  adopterHomeShort: z.string(),
  homeTheme: z.string(),
  matchBadge: z.boolean(),
  matchScore: z.number().nullable(),
  storySummary: z.string(),
});
export type AlbumEntry = z.infer<typeof albumEntrySchema>;

export const pendingAdoptionSchema = z.object({
  animalSnapshot: z.object({
    name: z.string(),
    species: z.string(),
    traitId: z.string().nullable(),
    favoriteCareAction: z.string().nullable(),
    outfit: z.string().nullable(),
  }),
  offerIds: z.array(z.string()),
  pickId: z.string(),
});
export type PendingAdoption = z.infer<typeof pendingAdoptionSchema>;

// Sound prefs (SOUND-DESIGN-DEEP-DIVE §8.3) — additive + optional; every field
// optional in the schema, defaults merged at load (audioPrefsOf). Fresh Start
// never resets these: they are parent/device settings, not sanctuary state.
export const audioSettingsSchema = z.object({
  v: z.number().int().optional(),
  muted: z.boolean().optional(),
  volume: z.number().min(0).max(1).optional(),
  ambience: z.boolean().optional(),
  music: z.boolean().optional(),
  calm: z.boolean().optional(),
});
export type AudioSettings = z.infer<typeof audioSettingsSchema>;

export interface AudioPrefs {
  v: 1;
  muted: boolean;
  volume: number;
  ambience: boolean;
  music: boolean;
  calm: boolean;
}

export const DEFAULT_AUDIO_PREFS: AudioPrefs = {
  v: 1,
  muted: false,
  volume: 0.9,
  ambience: true,
  music: true,
  calm: false,
};

export function audioPrefsOf(state: { settings?: { audio?: AudioSettings } | undefined } | null | undefined): AudioPrefs {
  const a = state?.settings?.audio;
  if (!a) return { ...DEFAULT_AUDIO_PREFS };
  return {
    v: 1,
    muted: a.muted ?? DEFAULT_AUDIO_PREFS.muted,
    volume: typeof a.volume === 'number' ? Math.min(1, Math.max(0, a.volume)) : DEFAULT_AUDIO_PREFS.volume,
    ambience: a.ambience ?? DEFAULT_AUDIO_PREFS.ambience,
    music: a.music ?? DEFAULT_AUDIO_PREFS.music,
    calm: a.calm ?? DEFAULT_AUDIO_PREFS.calm,
  };
}

export const gameStateSchema = z.object({
  version: z.number().int(),
  settings: z.object({ audio: audioSettingsSchema.optional() }).optional(),
  // v1 root:
  coins: z.number().int().min(0),
  ownedItems: z.array(z.string()),
  adoptedCount: z.number().int().min(0),
  rotationIndex: z.number().int().min(0),
  phase: z.enum(['caring', 'celebration']),
  current: rescueSchema,
  album: z.array(albumEntrySchema),
  // Stage 2a root:
  rngSeed: z.number().int().min(0).max(4294967295),
  arrivalIndex: z.number().int().min(0),
  // Stage 3a/3b root:
  pendingAdoption: pendingAdoptionSchema.nullable(),
  adopterCooldowns: z.record(z.string(), z.number().int().min(0)),
  lastOfferIds: z.array(z.string()),
  lastStoryTemplateIds: z
    .object({
      opening: z.string(),
      middle: z.string(),
      closing: z.string(),
    })
    .nullable(),
});
export type GameState = z.infer<typeof gameStateSchema>;
