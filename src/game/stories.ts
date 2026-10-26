import type { Adopter } from './adopters';
import { CARE_ACTIONS, type CareActionId } from './care';
import { SPECIES } from './roster';
import { TRAITS } from './traits';
import type { SpeciesId, TraitId } from '../save/schema';

// The adoption-story generator (PHASE0-DEEP-DIVE §B.5): 3 templates per
// position, anti-repeat rule C4, Perfect-Match sparkle sentence, frozen
// verbatim onto the album entry at the moment of adoption. Stories never
// pay coins and are never regenerated.

export interface StoryAnimal {
  name: string;
  species: SpeciesId;
  traitId: TraitId;
  favoriteCareAction: CareActionId;
}

export interface TemplateIds {
  opening: string;
  middle: string;
  closing: string;
}

export interface GeneratedStory {
  story: string;
  summary: string;
  templateIds: TemplateIds;
}

interface Slots {
  Name: string;
  species: string;
  trait: string;
  traitBeat: string;
  Adopter: string;
  home: string;
  affinityDetail: string;
  favActivity: string;
  signature: string;
}

const fill = (template: string, slots: Slots) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) =>
    key in slots ? slots[key as keyof Slots] : `{${key}}`,
  );

const OPENINGS: Record<string, string> = {
  O1: '{Name} the {species} packed a tiny bag and waved goodbye to the sanctuary.',
  O2: 'When {Name} the {species} was ready, {Adopter} came to the door with a big smile.',
  O3: 'It was a happy, sunny kind of day when {Name} the {species} went home with {Adopter}.',
};

const MIDDLES: Record<string, string> = {
  M1: "{Adopter}'s home has {affinityDetail} — just right for a {trait} {species} {traitBeat}.",
  M2: '{Name} loves {favActivity} most of all, and at {home}, there is always time for {favActivity}.',
  M3: 'A {trait} {species} needs a special kind of home, and {home} is exactly that kind of home.',
  M4: '{Name} {traitBeat}, and {Adopter} loved that about {Name} right away.',
};

const SPARKLE =
  'Everyone at the sanctuary said the same thing: this was a perfect match. 💛';

const CLOSINGS: Record<string, string> = {
  C1: 'Now {Name} is home, happy and loved, every single day.',
  C2: 'And that is how {Name} found a forever home with {Adopter}.',
  C3: '{signature}',
};

function pickTemplateId(
  pool: string[],
  lastId: string | null,
  rng: () => number,
): string {
  const draw = () =>
    pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
  let id = draw();
  // C4: re-pick once if this position repeats the previous adoption's pick.
  if (lastId !== null && id === lastId && pool.length > 1) id = draw();
  return id;
}

export function generateStory(
  animal: StoryAnimal,
  adopter: Adopter,
  opts: {
    badge: boolean;
    /** True if any affinity component scored > 0 for the chosen adopter —
     * unlocks M1–M3; M4 is always available (§B.5.3). */
    hasAffinity: boolean;
    lastTemplateIds: TemplateIds | null;
    rng?: () => number;
  },
): GeneratedStory {
  const rng = opts.rng ?? Math.random;
  const trait = TRAITS[animal.traitId];
  const slots: Slots = {
    Name: animal.name,
    species: SPECIES[animal.species].label,
    trait: trait.name.toLowerCase(),
    traitBeat: trait.storyBeat,
    Adopter: adopter.shortName,
    home: adopter.homeShort,
    affinityDetail: adopter.affinityDetail.replaceAll('{Name}', animal.name),
    favActivity: CARE_ACTIONS[animal.favoriteCareAction].activityPhrase,
    signature: adopter.signature.replaceAll('{Name}', animal.name),
  };

  const openingId = pickTemplateId(
    Object.keys(OPENINGS),
    opts.lastTemplateIds?.opening ?? null,
    rng,
  );
  const middlePool = opts.hasAffinity
    ? Object.keys(MIDDLES)
    : ['M4'];
  const middleId = pickTemplateId(
    middlePool,
    opts.lastTemplateIds?.middle ?? null,
    rng,
  );
  const closingId = pickTemplateId(
    Object.keys(CLOSINGS),
    opts.lastTemplateIds?.closing ?? null,
    rng,
  );

  const sentences = [
    fill(OPENINGS[openingId], slots),
    fill(MIDDLES[middleId], slots),
    ...(opts.badge ? [SPARKLE] : []),
    fill(CLOSINGS[closingId], slots),
  ];
  return {
    story: sentences.join(' '),
    summary: `${animal.name} lives with ${adopter.shortName} at ${adopter.homeShort} now.`,
    templateIds: { opening: openingId, middle: middleId, closing: closingId },
  };
}
