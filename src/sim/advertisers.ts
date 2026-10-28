import type { NeedId } from './needs';

// Yard objects as advertisers (UTILITY-AI-DEEP-DIVE §5): everything in the
// yard is a data record; the scorer iterates defs × instances and knows
// nothing object-specific.
//
// STEP-1 SUBSET ONLY: food bowl, bed, toy box, bath tub, cuddle rug, plus
// the wander & sniff fallback. The rest of the §5.1 catalogue (water bowl,
// treat jar, cushion pile, sunny spot, shade tree, ball patch, scratch
// post, grooming station, friend nuzzle) is deliberately NOT here yet.

export type Category =
  | 'eat'
  | 'rest'
  | 'play'
  | 'groom'
  | 'cuddle'
  | 'social'
  | 'explore';

export interface AdvertiserDef {
  id: string;
  category: Category;
  source: 'object' | 'resident' | 'fallback';
  /** Positive gains in points over the full duration (§1.4/§5.1). */
  gains: Partial<Record<NeedId, number>>;
  /** Play actions' energy cost (§5.2): scored via the cost factor and
   * banked as a drain — it is the table's negative Energy, folded here. */
  energyCost?: number;
  durationSec: number;
  capacity: number;
  globalCooldownSec?: number;
  treatFlag?: boolean;
}

export const ADVERTISERS: Record<string, AdvertiserDef> = {
  'food-bowl': {
    id: 'food-bowl', category: 'eat', source: 'object',
    gains: { tummy: 45, affection: 4 }, durationSec: 12, capacity: 2,
  },
  bed: {
    id: 'bed', category: 'rest', source: 'object',
    gains: { energy: 55 }, durationSec: 20, capacity: 1,
  },
  'toy-box': {
    id: 'toy-box', category: 'play', source: 'object',
    gains: { fun: 40 }, energyCost: 6, durationSec: 14, capacity: 2,
  },
  'bath-tub': {
    id: 'bath-tub', category: 'groom', source: 'object',
    gains: { clean: 55 }, durationSec: 14, capacity: 1,
  },
  'cuddle-rug': {
    id: 'cuddle-rug', category: 'cuddle', source: 'object',
    gains: { affection: 35, energy: 12 }, durationSec: 14, capacity: 3,
  },
  wander: {
    id: 'wander', category: 'explore', source: 'fallback',
    gains: { fun: 10, affection: 4 }, durationSec: 6, capacity: Infinity,
  },
};

export interface AdvertiserInstance {
  /** Unique per placed instance; step 1 places one instance per def. */
  key: string;
  def: AdvertiserDef;
  /** Yard anchor in 0–100 yard units (x right, y down). */
  x: number;
  y: number;
}

/**
 * The step-1 yard layout. Anchors spread so no two objects crowd: feeding
 * low-left, bath high-left, rug high-right, bed low-right, toys low-centre.
 * The top anchors sit at y=38 so the walking animal (and its speech
 * bubble) stay inside the yard section; bottom anchors leave room for the
 * animal's body below the ground point. The wander fallback has no fixed
 * anchor — the sim picks a nearby point per use — so its instance carries
 * the resident's position at score time.
 */
export const YARD_LAYOUT: AdvertiserInstance[] = [
  { key: 'food-bowl', def: ADVERTISERS['food-bowl'], x: 17, y: 79 },
  { key: 'bed', def: ADVERTISERS.bed, x: 83, y: 80 },
  { key: 'toy-box', def: ADVERTISERS['toy-box'], x: 50, y: 87 },
  { key: 'bath-tub', def: ADVERTISERS['bath-tub'], x: 16, y: 38 },
  { key: 'cuddle-rug', def: ADVERTISERS['cuddle-rug'], x: 83, y: 38 },
];

export const WANDER_INSTANCE: AdvertiserInstance = {
  key: 'wander',
  def: ADVERTISERS.wander,
  x: 50,
  y: 55,
};

/** The resident's home/idle spot, centre yard. */
export const HOME_SPOT = { x: 50, y: 55 };

/** Yard diagonal for the distance factor (§3.1): the yard is 100×100. */
export const YARD_DIAGONAL = Math.hypot(100, 100);
