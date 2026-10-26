import type { SpeciesId } from '../save/schema';

// Species display data. Ids are save-data (audit C5); labels are display.
// Default names are the ones the family met in Phase 0 play where known
// (Biscuit, Miso, Clover, Rusty, Bao, Pickle, Pip); turtle and hedgehog
// defaults are repo-build re-creations — every rescue can be renamed.

export interface Species {
  id: SpeciesId;
  /** Display form used in stories: "duckling", "fox kit", "penguin chick". */
  label: string;
  /** Plural for adopter hints: "Loves ducklings!" */
  plural: string;
  defaultName: string;
}

export const SPECIES: Record<SpeciesId, Species> = {
  dog: { id: 'dog', label: 'dog', plural: 'dogs', defaultName: 'Biscuit' },
  cat: { id: 'cat', label: 'cat', plural: 'cats', defaultName: 'Miso' },
  bunny: { id: 'bunny', label: 'bunny', plural: 'bunnies', defaultName: 'Clover' },
  fox: { id: 'fox', label: 'fox kit', plural: 'fox kits', defaultName: 'Rusty' },
  panda: { id: 'panda', label: 'panda', plural: 'pandas', defaultName: 'Bao' },
  duck: { id: 'duck', label: 'duckling', plural: 'ducklings', defaultName: 'Pickle' },
  turtle: { id: 'turtle', label: 'turtle', plural: 'turtles', defaultName: 'Shelly' },
  hedgehog: { id: 'hedgehog', label: 'hedgehog', plural: 'hedgehogs', defaultName: 'Hazel' },
  penguin: { id: 'penguin', label: 'penguin chick', plural: 'penguin chicks', defaultName: 'Pip' },
};

/** The fixed arrival cycle (audit F9): rotationIndex 0–8 wraps this order. */
export const ROSTER_ORDER: SpeciesId[] = [
  'dog',
  'cat',
  'bunny',
  'fox',
  'panda',
  'duck',
  'turtle',
  'hedgehog',
  'penguin',
];
