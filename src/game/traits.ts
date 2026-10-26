import { fnv1a, mulberry32 } from '../save/rng';
import type { SpeciesId, TraitId } from '../save/schema';
import type { CareActionId } from './care';

// The canonical 12 traits (PHASE0-DEEP-DIVE §B2, with the errata renames
// applied: Diva → Fancy, Neat → Tidy). Lines are the spec's own words.

export interface Trait {
  id: TraitId;
  name: string;
  icon: string;
  /** Arrival-card line, also the animal's first bubble (§B3.1 rule 3). */
  kidLine: string;
  loves: CareActionId;
  /** The trait's voice at its happiest — alternate, never twice in a row. */
  favLines: [string, string];
  /** One contrasting line for a named non-favourite action (§B3.1 rule 2). */
  otherLine: { action: CareActionId; text: string };
  /** {traitBeat} story fragment (§B.5.5). */
  storyBeat: string;
}

export const TRAITS: Record<TraitId, Trait> = {
  shy: {
    id: 'shy', name: 'Shy', icon: '🙈', kidLine: 'Loves quiet hellos.', loves: 'feed',
    favLines: ['…thank you. I ate it from your hand!', 'A tiny snack, just for me?'],
    otherLine: { action: 'play', text: "Um… I'll watch first. Then I'll try." },
    storyBeat: 'who peeks out slowly, then smiles',
  },
  brave: {
    id: 'brave', name: 'Brave', icon: '🛡️', kidLine: 'First to try new things!', loves: 'play',
    favLines: ['I went first! Did you see?', "Again! I'm not scared at all!"],
    otherLine: { action: 'clean', text: 'Brave in the bubbles too. Mostly.' },
    storyBeat: 'who is first to say hello to everything new',
  },
  sleepy: {
    id: 'sleepy', name: 'Sleepy', icon: '🌙', kidLine: 'Dreams all day long.', loves: 'pet',
    favLines: ['Mmm. Petting is better than dreams.', 'Five more minutes… and more pets.'],
    otherLine: { action: 'feed', text: "*yawn* …oh! Breakfast? I'm awake, I'm awake." },
    storyBeat: 'who can nap absolutely anywhere',
  },
  playful: {
    id: 'playful', name: 'Playful', icon: '🎾', kidLine: 'Always ready to play!', loves: 'play',
    favLines: ['YES! Best game! Best day!', 'Throw it, throw it, throw it!'],
    otherLine: { action: 'clean', text: 'Bath zoomies count as playing, right?' },
    storyBeat: 'who splashes in every puddle',
  },
  foodie: {
    id: 'foodie', name: 'Foodie', icon: '🍓', kidLine: 'Snacks are the best day ever.', loves: 'feed',
    favLines: ['Yum yum yum! My favourite sound!', 'Is that… a second helping?'],
    otherLine: { action: 'pet', text: "Pet my tummy? It's full of happy." },
    storyBeat: 'who never, ever misses snack time',
  },
  fancy: {
    id: 'fancy', name: 'Fancy', icon: '💎', kidLine: 'Loves to sparkle and shine.', loves: 'clean',
    favLines: ['Sparkly! Admire me, please.', 'Clean, shiny, and ready for photos!'],
    otherLine: { action: 'play', text: 'Careful — I just got beautiful!' },
    storyBeat: 'who loves to be admired, and deserves it',
  },
  gentle: {
    id: 'gentle', name: 'Gentle', icon: '🪶', kidLine: 'Soft as a feather.', loves: 'pet',
    favLines: ['Your hand is my favourite place.', 'Slow pets are the best pets.'],
    otherLine: { action: 'play', text: 'We can play the slow, soft way.' },
    storyBeat: 'who gives the softest cuddles',
  },
  mischievous: {
    id: 'mischievous', name: 'Mischievous', icon: '😜', kidLine: 'Has a giggly trick planned.', loves: 'treat',
    favLines: ['Hee hee! You found my hiding spot!', 'A treat? I was only *a little* sneaky.'],
    otherLine: { action: 'clean', text: "The bubbles can't catch me! …Okay, they did." },
    storyBeat: 'who hides socks and then looks innocent',
  },
  curious: {
    id: 'curious', name: 'Curious', icon: '🔍', kidLine: 'Wants to sniff everything new.', loves: 'treat',
    favLines: ["Ooh, what's THIS taste?", 'New snack! I must sniff it first.'],
    otherLine: { action: 'clean', text: 'What does the bubble smell like? Let me see!' },
    storyBeat: 'who has to look inside every box',
  },
  tidy: {
    id: 'tidy', name: 'Tidy', icon: '🧼', kidLine: 'Loves being squeaky clean.', loves: 'clean',
    favLines: ['Squeaky clean! Every bit of me!', 'Ahh. Tidy toes, tidy tail.'],
    otherLine: { action: 'feed', text: 'Crumb on my chin? Get it, get it!' },
    storyBeat: 'who keeps every blanket perfectly tidy',
  },
  wild: {
    id: 'wild', name: 'Wild', icon: '⚡', kidLine: 'Loves to zoom and splash!', loves: 'play',
    favLines: ["ZOOM! Can't catch me!", 'Splash, dash, and crash — then snacks!'],
    otherLine: { action: 'pet', text: 'Pets on the move! Zoom-pets!' },
    storyBeat: 'who zooms around the whole yard, then flops',
  },
  cuddly: {
    id: 'cuddly', name: 'Cuddly', icon: '🧸', kidLine: 'A champion snuggler.', loves: 'pet',
    favLines: ["Right there. That's the best spot.", 'More snuggles! I fit right here.'],
    otherLine: { action: 'feed', text: 'Snacks taste better in a cuddle.' },
    storyBeat: 'who falls asleep in the middle of every cuddle pile',
  },
};

/** Species pools, typical first (§B4): weights 0.40 / 0.20 / 0.20 / 0.20. */
export const SPECIES_POOLS: Record<SpeciesId, [TraitId, TraitId, TraitId, TraitId]> = {
  dog: ['playful', 'cuddly', 'mischievous', 'foodie'],
  cat: ['curious', 'sleepy', 'fancy', 'tidy'],
  bunny: ['shy', 'gentle', 'foodie', 'sleepy'],
  fox: ['mischievous', 'curious', 'brave', 'wild'],
  panda: ['sleepy', 'foodie', 'gentle', 'cuddly'],
  duck: ['wild', 'playful', 'brave', 'foodie'],
  turtle: ['gentle', 'sleepy', 'shy', 'tidy'],
  hedgehog: ['brave', 'shy', 'curious', 'cuddly'],
  penguin: ['fancy', 'cuddly', 'playful', 'brave'],
};

function pickFromPool(pool: readonly TraitId[], draw: number): TraitId {
  if (draw < 0.4) return pool[0];
  if (draw < 0.6) return pool[1];
  if (draw < 0.8) return pool[2];
  return pool[3];
}

/**
 * The arrival roll, exactly as §B4 specifies: seed =
 * FNV-1a("sanctuary:" + rngSeed + ":" + arrivalIndex), mulberry32 stream,
 * first draw picks; if it equals the previous rescue's trait, consume the
 * second draw and keep its result even if it repeats. The outcome is STORED
 * on the instance and never re-derived.
 */
export function rollTrait(
  species: SpeciesId,
  rngSeed: number,
  arrivalIndex: number,
  previousTraitId: TraitId | null,
): { traitId: TraitId; traitSeed: number } {
  const traitSeed = fnv1a(`sanctuary:${rngSeed}:${arrivalIndex}`);
  const rng = mulberry32(traitSeed);
  const pool = SPECIES_POOLS[species];
  let traitId = pickFromPool(pool, rng());
  if (previousTraitId !== null && traitId === previousTraitId) {
    traitId = pickFromPool(pool, rng());
  }
  return { traitId, traitSeed };
}
