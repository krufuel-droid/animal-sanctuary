import type { SpeciesId, TraitId } from '../save/schema';

// The 12-adopter pool (PHASE0-DEEP-DIVE §B.2). Species/trait lists use code
// ids (audit C5); "Diva"/"Neat" in the spec table are Fancy/Tidy (errata).
// Every adopter is pre-vetted-kind; there is no wrong choice (§B.4.4).

export type AdopterTag =
  | 'quiet'
  | 'playful'
  | 'outdoorsy'
  | 'garden'
  | 'has-kids'
  | 'has-other-pets'
  | 'foodie-home'
  | 'cozy-indoor'
  | 'water'
  | 'night-owl';

export const TAG_LABELS: Record<AdopterTag, { icon: string; label: string }> = {
  quiet: { icon: '🤫', label: 'Quiet' },
  playful: { icon: '🎈', label: 'Playful' },
  outdoorsy: { icon: '🌳', label: 'Outdoorsy' },
  garden: { icon: '🌿', label: 'Garden' },
  'has-kids': { icon: '🧒', label: 'Kids to play with' },
  'has-other-pets': { icon: '🐾', label: 'Other pets' },
  'foodie-home': { icon: '🍞', label: 'Yummy home' },
  'cozy-indoor': { icon: '🛋️', label: 'Cozy indoors' },
  water: { icon: '🌊', label: 'Water nearby' },
  'night-owl': { icon: '🦉', label: 'Night owl' },
};

export interface MedallionSpec {
  skin: string;
  hair: string;
  hairStyle: 'bun' | 'cap' | 'bob' | 'short' | 'scarf' | 'bald' | 'spiky';
  /** One distinguishing prop, drawn as a small badge (§B.3). */
  prop: string;
}

export interface Adopter {
  id: string;
  /** Full display name for cards and the album medallion. */
  name: string;
  /** Name as used inside story sentences. */
  shortName: string;
  /** Card line: the home, kid-friendly (§B.2). */
  home: string;
  homeShort: string;
  homeTheme: string;
  /** Big accent emoji for the card's home illustration. */
  homeEmoji: string;
  tags: AdopterTag[];
  lovesSpecies: SpeciesId[];
  lovesTraits: TraitId[];
  /** {affinityDetail} story slot. */
  affinityDetail: string;
  /** Signature line template; {Name} is substituted at story time. */
  signature: string;
  medallion: MedallionSpec;
}

export const ADOPTERS: Adopter[] = [
  {
    id: 'maya', name: 'Maya the Gardener', shortName: 'Maya',
    home: 'A sunny cottage with a big flower garden', homeShort: 'the cottage with the big flower garden',
    homeTheme: 'garden', homeEmoji: '🌻',
    tags: ['garden', 'quiet', 'outdoorsy'],
    lovesSpecies: ['bunny', 'hedgehog', 'turtle'], lovesTraits: ['gentle', 'shy', 'curious'],
    affinityDetail: 'a soft patch of clover under the apple tree',
    signature: 'Maya saved the sunniest garden corner just for {Name}.',
    medallion: { skin: '#8d5524', hair: '#2b2118', hairStyle: 'bun', prop: '🌼' },
  },
  {
    id: 'ellis', name: 'Grandpa Ellis', shortName: 'Grandpa Ellis',
    home: 'A farmhouse with a porch and a rocking chair', homeShort: 'the farmhouse with the big porch',
    homeTheme: 'farm', homeEmoji: '🚜',
    tags: ['quiet', 'outdoorsy', 'cozy-indoor'],
    lovesSpecies: ['dog', 'turtle', 'panda'], lovesTraits: ['sleepy', 'gentle', 'brave'],
    affinityDetail: 'a cushion on the porch, right next to the rocking chair',
    signature: 'Grandpa Ellis says the porch is best with a friend on it.',
    medallion: { skin: '#f1c27d', hair: '#e8e3d9', hairStyle: 'cap', prop: '🧢' },
  },
  {
    id: 'park-family', name: 'The Park Family', shortName: 'The Park Family',
    home: 'A house with a big backyard and two kids to play with', homeShort: 'the house with the big backyard',
    homeTheme: 'backyard', homeEmoji: '⚽',
    tags: ['has-kids', 'playful', 'outdoorsy'],
    lovesSpecies: ['dog', 'duck', 'fox'], lovesTraits: ['playful', 'brave', 'mischievous'],
    affinityDetail: 'a backyard with a ball that is always ready',
    signature: 'The Park kids made a welcome sign before {Name} even arrived.',
    medallion: { skin: '#ffdbac', hair: '#5b3a1e', hairStyle: 'short', prop: '⚽' },
  },
  {
    id: 'sam', name: 'Sam the Baker', shortName: 'Sam',
    home: 'A cozy flat above a bakery — it smells like warm bread', homeShort: 'the cozy flat above the bakery',
    homeTheme: 'bakery', homeEmoji: '🍞',
    tags: ['foodie-home', 'cozy-indoor', 'quiet'],
    lovesSpecies: ['cat', 'panda', 'hedgehog'], lovesTraits: ['foodie', 'sleepy', 'gentle'],
    affinityDetail: 'a warm spot by the bakery window',
    signature: 'Sam always saves the first little roll of the day for {Name}.',
    medallion: { skin: '#e0ac69', hair: '#3a2a18', hairStyle: 'cap', prop: '👨‍🍳' },
  },
  {
    id: 'luna', name: 'Luna the Librarian', shortName: 'Luna',
    home: 'A quiet flat full of books and one perfect window seat', homeShort: 'the quiet flat full of books',
    homeTheme: 'library', homeEmoji: '📚',
    tags: ['quiet', 'cozy-indoor'],
    lovesSpecies: ['cat', 'bunny', 'penguin'], lovesTraits: ['shy', 'tidy', 'curious'],
    affinityDetail: 'the window seat, with a cushion and a whole shelf below it',
    signature: 'Luna read the first bedtime story out loud, beginning to end.',
    medallion: { skin: '#ffdbac', hair: '#7a4a21', hairStyle: 'bob', prop: '👓' },
  },
  {
    id: 'rosa', name: 'Rosa the Artist', shortName: 'Rosa',
    home: 'A colourful studio cottage with paintings everywhere', homeShort: 'the colourful studio cottage',
    homeTheme: 'studio', homeEmoji: '🎨',
    tags: ['playful', 'cozy-indoor'],
    lovesSpecies: ['cat', 'fox', 'duck'], lovesTraits: ['fancy', 'curious', 'mischievous'],
    affinityDetail: 'a sunny studio corner with a very fancy cushion',
    signature: "Rosa painted {Name}'s portrait on the very first day.",
    medallion: { skin: '#c68642', hair: '#1e1e1e', hairStyle: 'bob', prop: '🎨' },
  },
  {
    id: 'finn', name: 'Finn the Fisher', shortName: 'Finn',
    home: 'A little cabin right beside the lake', homeShort: 'the little cabin beside the lake',
    homeTheme: 'lake', homeEmoji: '🎣',
    tags: ['water', 'outdoorsy', 'quiet'],
    lovesSpecies: ['duck', 'penguin', 'turtle'], lovesTraits: ['brave', 'curious', 'playful'],
    affinityDetail: 'a dock where the water sparkles all morning',
    signature: 'Finn and {Name} watch the lake together every sunrise.',
    medallion: { skin: '#f1c27d', hair: '#b5522a', hairStyle: 'cap', prop: '🎣' },
  },
  {
    id: 'aisha', name: 'Aisha the Teacher', shortName: 'Aisha',
    home: 'A house near the park with a reading nook', homeShort: 'the house near the park',
    homeTheme: 'park', homeEmoji: '🌳',
    tags: ['has-kids', 'quiet', 'garden'],
    lovesSpecies: ['dog', 'bunny', 'panda'], lovesTraits: ['gentle', 'brave', 'curious'],
    affinityDetail: 'a reading nook piled with soft blankets',
    signature: "Aisha's class drew pictures to welcome {Name} home.",
    medallion: { skin: '#8d5524', hair: '#402a12', hairStyle: 'scarf', prop: '📖' },
  },
  {
    id: 'marco', name: 'Marco the Musician', shortName: 'Marco',
    home: 'A sunny flat with a balcony and music all day', homeShort: 'the sunny flat with the balcony',
    homeTheme: 'balcony', homeEmoji: '🎵',
    tags: ['playful', 'cozy-indoor'],
    lovesSpecies: ['dog', 'duck', 'fox'], lovesTraits: ['playful', 'fancy', 'mischievous'],
    affinityDetail: 'a balcony where the music plays and the sun shines',
    signature: 'Marco wrote a tiny song, and it is all about {Name}.',
    medallion: { skin: '#e0ac69', hair: '#241a10', hairStyle: 'spiky', prop: '🎧' },
  },
  {
    id: 'bea', name: 'Bea the Beekeeper', shortName: 'Bea',
    home: 'A meadow cottage with beehives and wildflowers', homeShort: 'the meadow cottage',
    homeTheme: 'meadow', homeEmoji: '🐝',
    tags: ['garden', 'outdoorsy', 'quiet'],
    lovesSpecies: ['bunny', 'hedgehog', 'panda'], lovesTraits: ['gentle', 'brave', 'tidy'],
    affinityDetail: 'a wildflower meadow that hums very softly',
    signature: 'Bea says the bees hum happiest now that {Name} is here.',
    medallion: { skin: '#ffdbac', hair: '#c46a1b', hairStyle: 'bun', prop: '👒' },
  },
  {
    id: 'kenji', name: 'Kenji the Stargazer', shortName: 'Kenji',
    home: 'A hilltop house with a telescope for the stars', homeShort: 'the hilltop house',
    homeTheme: 'hilltop', homeEmoji: '🔭',
    tags: ['night-owl', 'quiet', 'cozy-indoor'],
    lovesSpecies: ['penguin', 'cat', 'hedgehog'], lovesTraits: ['sleepy', 'curious', 'shy'],
    affinityDetail: 'a hilltop blanket for watching the stars',
    signature: 'Kenji found a star and named it after {Name}.',
    medallion: { skin: '#ffdbac', hair: '#1e1e1e', hairStyle: 'short', prop: '⭐' },
  },
  {
    id: 'ivy', name: 'Ivy the Vet Helper', shortName: 'Ivy',
    home: 'A busy happy house with two cats and a goldfish', homeShort: 'the busy happy house full of pets',
    homeTheme: 'pets-house', homeEmoji: '🐾',
    tags: ['has-other-pets', 'playful', 'foodie-home'],
    lovesSpecies: ['dog', 'cat', 'bunny'], lovesTraits: ['foodie', 'playful', 'gentle'],
    affinityDetail: "a house full of friends and a bowl with {Name}'s name on it",
    signature: "Ivy's cats saved {Name} the best spot on the rug.",
    medallion: { skin: '#c68642', hair: '#4a2c14', hairStyle: 'bob', prop: '🩺' },
  },
];

export const ADOPTERS_BY_ID: Record<string, Adopter> = Object.fromEntries(
  ADOPTERS.map((a) => [a.id, a]),
);

/**
 * Each home's pentatonic root (Hz) — SOUND-DESIGN-DEEP-DIVE §1.2 row 26:
 * a visit greeting plays one soft pad note in the home's key. Marco's balcony
 * is G and Luna's library is C, per the dive's examples.
 */
export const HOME_ROOTS: Record<string, number> = {
  maya: 329.63, // E4
  ellis: 196.0, // G3
  'park-family': 392.0, // G4
  sam: 293.66, // D4
  luna: 261.63, // C4
  rosa: 220.0, // A3
  finn: 196.0, // G3
  aisha: 293.66, // D4
  marco: 392.0, // G4
  bea: 440.0, // A4
  kenji: 329.63, // E4
  ivy: 261.63, // C4
};

export function homeRootOf(adopterId: string | null | undefined): number {
  if (!adopterId) return 261.63; // legacy "cozy" home = C
  return HOME_ROOTS[adopterId] ?? 261.63;
}

/** Same roots keyed by homeTheme — album entries store the theme, not the id. */
export const THEME_ROOTS: Record<string, number> = {
  garden: 329.63,
  farm: 196.0,
  backyard: 392.0,
  bakery: 293.66,
  library: 261.63,
  studio: 220.0,
  lake: 196.0,
  'pets-house': 293.66,
  balcony: 392.0,
  meadow: 440.0,
  hilltop: 329.63,
  park: 261.63,
  cozy: 261.63,
};

export function themeRootOf(homeTheme: string | null | undefined): number {
  if (!homeTheme) return 261.63;
  return THEME_ROOTS[homeTheme] ?? 261.63;
}
