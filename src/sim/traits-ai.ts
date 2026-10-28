import { fnv1a, mulberry32 } from '../save/rng';
import type { TraitId } from '../save/schema';
import { TRAITS } from '../game/traits';
import { NEED_IDS, type Needs } from './needs';
import type { AdvertiserDef, Category } from './advertisers';

// Personality in the autonomy engine (UTILITY-AI-DEEP-DIVE §4): the Phase 0
// trait expressed as a need-weight vector plus a favourite-category
// affinity. Weights flavour the day; the curves (§2) do the heavy lifting.
// No weight is ever 0 — every animal cares about every need.

/** §4.1 — the 12×5 table (Tummy / Energy / Clean / Fun / Love), as data. */
export const TRAIT_NEED_WEIGHTS: Record<TraitId, Record<(typeof NEED_IDS)[number], number>> = {
  shy: { tummy: 1.15, energy: 1.0, clean: 0.9, fun: 0.75, affection: 1.1 },
  brave: { tummy: 1.0, energy: 0.95, clean: 0.9, fun: 1.3, affection: 1.0 },
  sleepy: { tummy: 0.95, energy: 1.4, clean: 0.85, fun: 0.8, affection: 1.15 },
  playful: { tummy: 1.0, energy: 0.9, clean: 0.8, fun: 1.4, affection: 1.05 },
  foodie: { tummy: 1.45, energy: 0.95, clean: 0.85, fun: 1.05, affection: 1.0 },
  fancy: { tummy: 0.95, energy: 0.9, clean: 1.45, fun: 1.05, affection: 1.1 },
  gentle: { tummy: 1.0, energy: 1.05, clean: 1.0, fun: 0.9, affection: 1.35 },
  mischievous: { tummy: 1.2, energy: 0.95, clean: 0.75, fun: 1.3, affection: 0.95 },
  curious: { tummy: 1.15, energy: 1.0, clean: 0.85, fun: 1.25, affection: 0.95 },
  tidy: { tummy: 0.95, energy: 0.95, clean: 1.5, fun: 0.9, affection: 1.0 },
  wild: { tummy: 1.05, energy: 0.8, clean: 0.7, fun: 1.45, affection: 0.95 },
  cuddly: { tummy: 1.0, energy: 1.1, clean: 0.95, fun: 0.95, affection: 1.5 },
};

/** Care verb → the autonomy category its affinity boosts (§4.2). Treat is
 * special: it boosts only treat-flagged advertisers, handled in
 * affinityFor via the trait's favourite verb. */
const VERB_CATEGORY: Record<string, Category> = {
  feed: 'eat',
  pet: 'cuddle',
  clean: 'groom',
  play: 'play',
  treat: 'eat',
};

/**
 * §4.2 category affinity A_aff: starts at 1.00; the favourite category gets
 * ×1.15 (for Treat traits, treat-flagged advertisers only); Curious gets
 * explore ×1.15; Shy gets social ×0.85; Wild/Mischievous get bath ×0.90.
 * Nothing goes below 0.85, ever — affinities express eagerness, never
 * aversion. Player-initiated care ignores affinities entirely.
 */
export function affinityFor(traitId: TraitId | null, def: AdvertiserDef): number {
  if (!traitId) return 1;
  let a = 1;
  const favVerb = TRAITS[traitId].loves;
  if (def.treatFlag) {
    if (favVerb === 'treat') a = 1.15;
  } else if (favVerb !== 'treat' && VERB_CATEGORY[favVerb] === def.category) {
    a = 1.15;
  }
  if (traitId === 'curious' && def.category === 'explore') a = Math.max(a, 1.15);
  if (traitId === 'shy' && def.category === 'social') a = 0.85;
  if ((traitId === 'wild' || traitId === 'mischievous') && def.id === 'bath-tub') a = 0.9;
  return a;
}

export interface AiProfileData {
  /** Resolved weights: §4.1 table × per-individual factors (§4.3). */
  weights: Needs;
  metabolism: number;
  aiSeed: number;
  /** Arrival needs drawn from the same stream (55–90 per need, §1.3). */
  arrivalNeeds: Needs;
}

/**
 * §4.3 — per-individual variation from a SEPARATE seeded stream:
 * instanceAiSeed = FNV-1a("sanctuary-ai:" + rngSeed + ":" + arrivalIndex).
 * The Phase 0 trait stream is never touched. Draws, in fixed order:
 * 5 weight factors (±8%), 1 metabolism (±6%), 5 arrival needs (55–90).
 * The resolved profile is STORED on the instance and never re-derived.
 */
export function aiSeedFor(rngSeed: number, arrivalIndex: number): number {
  return fnv1a(`sanctuary-ai:${rngSeed}:${arrivalIndex}`);
}

export function deriveAiProfile(
  rngSeed: number,
  arrivalIndex: number,
  traitId: TraitId,
): AiProfileData {
  const aiSeed = aiSeedFor(rngSeed, arrivalIndex);
  const rng = mulberry32(aiSeed);
  const table = TRAIT_NEED_WEIGHTS[traitId];
  const weights = {} as Needs;
  for (const n of NEED_IDS) {
    const factor = 0.92 + 0.16 * rng();
    weights[n] = table[n] * factor;
  }
  const metabolism = 0.94 + 0.12 * rng();
  const arrivalNeeds = {} as Needs;
  for (const n of NEED_IDS) {
    arrivalNeeds[n] = 55 + 35 * rng();
  }
  return { weights, metabolism, aiSeed, arrivalNeeds };
}
