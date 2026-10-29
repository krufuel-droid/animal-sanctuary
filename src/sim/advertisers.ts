import type { NeedId } from './needs';

// Yard objects as advertisers (UTILITY-AI-DEEP-DIVE §5): everything in the
// yard is a data record; the scorer iterates defs × instances and knows
// nothing object-specific.
//
// STEP 2 (part A): the FULL §5.1 catalogue is here — every object def with
// its table gains/duration/capacity, plus the wander & sniff fallback.
// STEP 2C adds the last §5.1 row: friend nuzzle, the one DYNAMIC
// advertiser (§5.2) — it has no yard placement; each resident's brain
// generates one instance per eligible partner at score time, anchored at
// the partner's live position (see nuzzleInstance below).

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
  // --- eat (§5.1) ---
  'food-bowl': {
    id: 'food-bowl', category: 'eat', source: 'object',
    gains: { tummy: 45, affection: 4 }, durationSec: 12, capacity: 2,
  },
  'water-bowl': {
    id: 'water-bowl', category: 'eat', source: 'object',
    gains: { tummy: 10 }, durationSec: 4, capacity: 3,
  },
  'treat-jar': {
    id: 'treat-jar', category: 'eat', source: 'object',
    gains: { tummy: 16, fun: 12 }, durationSec: 5, capacity: 1,
    // The jar "refills": a yard-wide pause after each use, never a
    // resource that can run out (§5.1). Eligibility gate: brain §3.2.
    globalCooldownSec: 45, treatFlag: true,
  },
  // --- rest (§5.1) ---
  bed: {
    id: 'bed', category: 'rest', source: 'object',
    gains: { energy: 55 }, durationSec: 20, capacity: 1, // 1 per bed; the yard ships 2
  },
  'cushion-pile': {
    id: 'cushion-pile', category: 'rest', source: 'object',
    gains: { energy: 30 }, durationSec: 12, capacity: 3,
  },
  'sunny-spot': {
    id: 'sunny-spot', category: 'rest', source: 'object',
    gains: { energy: 18, affection: 10 }, durationSec: 15, capacity: 2,
  },
  'shade-tree': {
    id: 'shade-tree', category: 'rest', source: 'object',
    gains: { energy: 14, fun: 8 }, durationSec: 12, capacity: 3,
  },
  // --- play (§5.1) ---
  'toy-box': {
    id: 'toy-box', category: 'play', source: 'object',
    gains: { fun: 40 }, energyCost: 6, durationSec: 14, capacity: 2,
  },
  'ball-patch': {
    id: 'ball-patch', category: 'play', source: 'object',
    gains: { fun: 30 }, energyCost: 5, durationSec: 10, capacity: 1,
  },
  'scratch-post': {
    id: 'scratch-post', category: 'play', source: 'object',
    gains: { fun: 22, clean: 10 }, durationSec: 8, capacity: 1,
  },
  // --- groom (§5.1) ---
  'bath-tub': {
    id: 'bath-tub', category: 'groom', source: 'object',
    gains: { clean: 55 }, durationSec: 14, capacity: 1,
  },
  'grooming-station': {
    id: 'grooming-station', category: 'groom', source: 'object',
    gains: { clean: 32, affection: 10 }, durationSec: 10, capacity: 1,
  },
  // --- cuddle (§5.1) ---
  'cuddle-rug': {
    id: 'cuddle-rug', category: 'cuddle', source: 'object',
    gains: { affection: 35, energy: 12 }, durationSec: 14, capacity: 3,
  },
  // --- social (§5.1): the dynamic advertiser. One instance is generated
  // per eligible partner at score time (§5.2); capacity 1 PAIR — the
  // instance key names the partner (nuzzleInstanceKey), so a reservation
  // by one initiator makes the same partner ineligible for everyone else.
  // The partner receives HALF these gains (nuzzlePartnerGains below).
  'friend-nuzzle': {
    id: 'friend-nuzzle', category: 'social', source: 'resident',
    gains: { affection: 25, fun: 16 }, durationSec: 8, capacity: 1,
  },
  // --- the fallback (§5.1): always eligible, exempt from congestion ---
  wander: {
    id: 'wander', category: 'explore', source: 'fallback',
    gains: { fun: 10, affection: 4 }, durationSec: 6, capacity: Infinity,
  },
};

export interface AdvertiserInstance {
  /** Unique per placed instance (two food bowls and two beds ship). */
  key: string;
  def: AdvertiserDef;
  /** Yard anchor in 0–100 yard units (x right, y down). */
  x: number;
  y: number;
}

/**
 * The yard layout (step 2). Placement is data (§5.2), arranged in three
 * rows so the yard reads at a glance — back row against the fence, play
 * things at the front, like-zoned things together-ish:
 *
 *   back (y≈32–40):  bath · grooming station · shade tree · bed 2 · rug
 *   mid  (y≈57–63):  treat jar · food bowl 2 · scratch post · sunny · cushions
 *   front(y≈79–88):  food bowl 1 · water bowl · toy box · ball patch · bed 1
 *
 * Step 1's five anchors are unchanged (bath 16,38 · rug 83,38 · bowl 1
 * 17,79 · toy box 50,87 · bed 1 83,80). The second food bowl sits up-left
 * in the mid row, ~18 units from bowl 1 — "placed apart" per §5.1, so a
 * full bowl leaves a genuinely different alternative; the second bed is in
 * the back row, capacity 1 per bed as §5.1 specifies. Every pair of
 * anchors is ≥15 units apart (asserted in the unit tests). The wander
 * fallback has no fixed anchor — the sim picks a nearby point per use —
 * so its instance carries the resident's position at score time.
 * Array order is paint order: back row first, front row last.
 */
export const YARD_LAYOUT: AdvertiserInstance[] = [
  // back row
  { key: 'bath-tub', def: ADVERTISERS['bath-tub'], x: 16, y: 38 },
  { key: 'grooming-station', def: ADVERTISERS['grooming-station'], x: 31, y: 35 },
  { key: 'shade-tree', def: ADVERTISERS['shade-tree'], x: 48, y: 32 },
  { key: 'bed-2', def: ADVERTISERS.bed, x: 66, y: 34 },
  { key: 'cuddle-rug', def: ADVERTISERS['cuddle-rug'], x: 83, y: 38 },
  // middle row
  { key: 'treat-jar', def: ADVERTISERS['treat-jar'], x: 8, y: 60 },
  { key: 'food-bowl-2', def: ADVERTISERS['food-bowl'], x: 25, y: 63 },
  { key: 'scratch-post', def: ADVERTISERS['scratch-post'], x: 42, y: 61 },
  { key: 'sunny-spot', def: ADVERTISERS['sunny-spot'], x: 64, y: 57 },
  { key: 'cushion-pile', def: ADVERTISERS['cushion-pile'], x: 82, y: 61 },
  // front row
  { key: 'food-bowl-1', def: ADVERTISERS['food-bowl'], x: 17, y: 79 },
  { key: 'water-bowl', def: ADVERTISERS['water-bowl'], x: 31, y: 88 },
  { key: 'toy-box', def: ADVERTISERS['toy-box'], x: 50, y: 87 },
  { key: 'ball-patch', def: ADVERTISERS['ball-patch'], x: 65, y: 84 },
  { key: 'bed-1', def: ADVERTISERS.bed, x: 83, y: 80 },
];

export const WANDER_INSTANCE: AdvertiserInstance = {
  key: 'wander',
  def: ADVERTISERS.wander,
  x: 50,
  y: 55,
};

/** The resident's home/idle spot, centre yard. */
export const HOME_SPOT = { x: 50, y: 55 };

// --- Friend nuzzle (§5.1/§5.2): the generated instances ----------------

/** Instance keys for nuzzle candidates name the TARGET partner, so two
 * initiators courting the same resident produce the same key and the
 * capacity-1 gate + reservation machinery serialize them. */
export const NUZZLE_KEY_PREFIX = 'nuzzle-with:';

export function nuzzleInstanceKey(partnerId: string): string {
  return `${NUZZLE_KEY_PREFIX}${partnerId}`;
}

export function nuzzlePartnerIdOf(instanceKey: string): string | null {
  return instanceKey.startsWith(NUZZLE_KEY_PREFIX)
    ? instanceKey.slice(NUZZLE_KEY_PREFIX.length)
    : null;
}

/** One nuzzle candidate, anchored at the partner's live position. */
export function nuzzleInstance(
  partnerId: string,
  x: number,
  y: number,
): AdvertiserInstance {
  return {
    key: nuzzleInstanceKey(partnerId),
    def: ADVERTISERS['friend-nuzzle'],
    x,
    y,
  };
}

/** The partner's share (§1.4/§5.1: "partner gains half"), derived from
 * the def so the two can never drift apart: Love +12.5, Fun +8. */
export function nuzzlePartnerGains(): Partial<Record<NeedId, number>> {
  const out: Partial<Record<NeedId, number>> = {};
  for (const [n, g] of Object.entries(ADVERTISERS['friend-nuzzle'].gains)) {
    out[n as NeedId] = (g as number) / 2;
  }
  return out;
}

/** Yard diagonal for the distance factor (§3.1): the yard is 100×100. */
export const YARD_DIAGONAL = Math.hypot(100, 100);
