import { ADOPTERS, type Adopter } from './adopters';
import { SPECIES } from './roster';
import { TRAITS } from './traits';
import type { CareActionId } from './care';
import type { SpeciesId, TraitId } from '../save/schema';

// Match logic (PHASE0-DEEP-DIVE §B.4). INVARIANT (§B.4.4): the score may be
// read ONLY by (a) offer ordering, (b) the Perfect Match badge, (c) story
// template selection. It never gates adoption, coins, hearts, or happiness.

export interface AnimalProfile {
  species: SpeciesId;
  traitId: TraitId;
  favoriteCareAction: CareActionId;
}

export interface ScoreBreakdown {
  species: 0 | 3;
  trait: 0 | 2;
  care: 0 | 1;
  total: number;
}

export function scoreAdopter(
  animal: AnimalProfile,
  adopter: Adopter,
): ScoreBreakdown {
  const species = adopter.lovesSpecies.includes(animal.species) ? 3 : 0;
  const trait = adopter.lovesTraits.includes(animal.traitId) ? 2 : 0;
  let care: 0 | 1 = 0;
  switch (animal.favoriteCareAction) {
    case 'feed':
    case 'treat':
      care = adopter.tags.includes('foodie-home') ? 1 : 0;
      break;
    case 'pet':
      care = adopter.tags.includes('cozy-indoor') ? 1 : 0;
      break;
    case 'play':
      care =
        adopter.tags.includes('playful') || adopter.tags.includes('outdoorsy')
          ? 1
          : 0;
      break;
    case 'clean':
      care =
        adopter.lovesTraits.includes('tidy') || adopter.tags.includes('quiet')
          ? 1
          : 0;
      break;
  }
  return {
    species: species as 0 | 3,
    trait: trait as 0 | 2,
    care,
    total: species + trait + care,
  };
}

const CARE_HINTS: Record<CareActionId, string> = {
  feed: '💛 Loves snack time!',
  pet: '💛 Loves cuddle time!',
  clean: '💛 Loves bath time!',
  play: '💛 Loves playtime!',
  treat: '💛 Loves treat time!',
};

/** The one plain-language hint a card may show (§B.4.5): the highest-value
 * true component, phrased as a fact about the adopter. Null = no hint. */
export function hintFor(animal: AnimalProfile, adopter: Adopter): string | null {
  const score = scoreAdopter(animal, adopter);
  if (score.species > 0) return `💛 Loves ${SPECIES[animal.species].plural}!`;
  if (score.trait > 0)
    return `💛 Loves ${TRAITS[animal.traitId].name.toLowerCase()} friends!`;
  if (score.care > 0) return CARE_HINTS[animal.favoriteCareAction];
  return null;
}

/** Perfect Match (§B.4.4): the CHOSEN adopter's raw score is the trio's
 * maximum AND ≥ 5. Decoration only — same +30 coins either way. */
export function isPerfectMatch(
  chosenId: string,
  trioScores: Record<string, number>,
): boolean {
  const chosen = trioScores[chosenId];
  if (chosen === undefined || chosen < 5) return false;
  return chosen >= Math.max(...Object.values(trioScores));
}

export interface Offer {
  /** Display order (shuffled, §B.4.3 O5). */
  offerIds: string[];
  /** The Sanctuary's Pick — carries the ribbon (§B.4.3 O2). */
  pickId: string;
  /** Raw scores of the offered trio (badge + story use only). */
  scores: Record<string, number>;
}

function pickRandom<T>(items: T[], rng: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

function argmaxRandom(
  ids: string[],
  value: (id: string) => number,
  rng: () => number,
): string {
  const best = Math.max(...ids.map(value));
  return pickRandom(
    ids.filter((id) => value(id) === best),
    rng,
  );
}

/**
 * Offer generation, §B.4.3 O1–O6 + §B.4.6 C1–C3, run once at the 8th heart
 * and frozen into pendingAdoption.
 */
export function generateOffer(
  animal: AnimalProfile,
  cooldowns: Record<string, number>,
  lastOfferIds: string[],
  rng: () => number = Math.random,
): Offer {
  // O1: cooldown filter, releasing oldest-first until 3 are available.
  const onCooldown = ADOPTERS.filter((a) => (cooldowns[a.id] ?? 0) > 0).sort(
    (x, y) => (cooldowns[x.id] ?? 0) - (cooldowns[y.id] ?? 0),
  );
  const released = new Set<string>();
  let available = ADOPTERS.filter((a) => (cooldowns[a.id] ?? 0) <= 0);
  for (const a of onCooldown) {
    if (available.length >= 3) break;
    released.add(a.id);
    available.push(a);
  }

  const raw = new Map(available.map((a) => [a.id, scoreAdopter(animal, a).total]));
  // C2: the previous trio's unchosen members rank −2 for this offer only.
  // (The previously chosen adopter is on hard cooldown; if the O1 valve
  // released them, they simply rank without the penalty.)
  const adjusted = (id: string) =>
    (raw.get(id) ?? 0) -
    (lastOfferIds.includes(id) && !released.has(id) && (cooldowns[id] ?? 0) <= 0
      ? 2
      : 0);

  const ids = available.map((a) => a.id);
  // O2: the Pick is the highest adjusted scorer; O3: second card next.
  const pickId = argmaxRandom(ids, adjusted, rng);
  const rest = ids.filter((id) => id !== pickId);
  const secondId = argmaxRandom(rest, adjusted, rng);
  // O4: wild card — random from the rest, weighted toward raw scores 2–4.
  const wildPool = rest.filter((id) => id !== secondId);
  const weights = wildPool.map((id) => {
    const s = raw.get(id) ?? 0;
    return s >= 2 && s <= 4 ? 2 : 1;
  });
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let roll = rng() * totalWeight;
  let wildId = wildPool[wildPool.length - 1];
  for (let i = 0; i < wildPool.length; i++) {
    roll -= weights[i];
    if (roll <= 0) {
      wildId = wildPool[i];
      break;
    }
  }
  // C3: never the identical trio twice in a row.
  const trio = [pickId, secondId, wildId];
  if (
    lastOfferIds.length === 3 &&
    trio.every((id) => lastOfferIds.includes(id))
  ) {
    const alternatives = ids.filter((id) => !trio.includes(id));
    if (alternatives.length > 0) wildId = pickRandom(alternatives, rng);
  }

  // O5: shuffled display order; the ribbon travels with the Pick.
  const offerIds = [pickId, secondId, wildId];
  for (let i = offerIds.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [offerIds[i], offerIds[j]] = [offerIds[j], offerIds[i]];
  }
  return {
    offerIds,
    pickId,
    scores: Object.fromEntries(
      [pickId, secondId, wildId].map((id) => [id, raw.get(id) ?? 0]),
    ),
  };
}

/** On a completed adoption (§B.4.6 C1/C5): every cooldown ticks down by one
 * adoption, then the adopter who just adopted sits out the next 3. */
export function applyAdoptionCooldowns(
  cooldowns: Record<string, number>,
  chosenId: string,
): Record<string, number> {
  const next: Record<string, number> = {};
  for (const [id, remaining] of Object.entries(cooldowns)) {
    if (remaining > 1) next[id] = remaining - 1;
  }
  next[chosenId] = 3;
  return next;
}
