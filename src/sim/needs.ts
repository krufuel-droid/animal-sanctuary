import { TUNING } from './tuning';

// The five needs (UTILITY-AI-DEEP-DIVE §1.1). Stored 0–100 as SATISFACTION
// (100 = content); the math consumes deficit d = 1 − value/100.
// Naming discipline (§1.1): the Love need's key is `affection` — the
// adoption meter stays `hearts`, and the two never share a name in code.

export const NEED_IDS = ['tummy', 'energy', 'clean', 'fun', 'affection'] as const;
export type NeedId = (typeof NEED_IDS)[number];
export type Needs = Record<NeedId, number>;

/** Thought-bubble icons per need (§1.1) — the only way needs are ever shown. */
export const NEED_ICONS: Record<NeedId, string> = {
  tummy: '🍖',
  energy: '💤',
  clean: '🫧',
  fun: '🎾',
  affection: '❤️',
};

export function clampNeed(v: number): number {
  return v < 0 ? 0 : v > 100 ? 100 : v;
}

export function clampNeeds(needs: Needs): Needs {
  return {
    tummy: clampNeed(needs.tummy),
    energy: clampNeed(needs.energy),
    clean: clampNeed(needs.clean),
    fun: clampNeed(needs.fun),
    affection: clampNeed(needs.affection),
  };
}

/** Response curve (§2.3): a 5-point piecewise-linear LUT over deficit. */
export function curveAt(need: NeedId, deficit: number): number {
  const lut = TUNING.curves[need];
  const d = deficit < 0 ? 0 : deficit > 1 ? 1 : deficit;
  const pos = d * 4;
  const i = Math.min(3, Math.floor(pos));
  const frac = pos - i;
  return lut[i] + (lut[i + 1] - lut[i]) * frac;
}

export function deficitOf(needs: Needs, need: NeedId): number {
  return 1 - needs[need] / 100;
}

/**
 * Absence catch-up (§1.3) — the cozy rule made arithmetic. Needs decay only
 * while the sim runs; on load after real time away, apply the elapsed time
 * at 0.1× rate, cap the total drop per need at 20, then floor every need at
 * 35. A player returning after a month finds animals who are ready for
 * company, never animals who suffered in their absence.
 */
export function absenceCatchUp(needs: Needs, elapsedRealSeconds: number): Needs {
  const out = { ...needs };
  if (!(elapsedRealSeconds > 0)) return clampNeeds(out);
  const days = elapsedRealSeconds / TUNING.dayLengthSec;
  for (const n of NEED_IDS) {
    const drop = Math.min(
      TUNING.absenceMaxDrop,
      TUNING.decayPerDay[n] * days * TUNING.absenceCatchupRate,
    );
    out[n] = Math.max(TUNING.absenceFloor, out[n] - drop);
  }
  return clampNeeds(out);
}

/** The lowest need, if it is below the thought-bubble threshold (§1.2). */
export function thoughtNeedOf(needs: Needs): NeedId | null {
  let lowest: NeedId | null = null;
  let lowestValue = Infinity;
  for (const n of NEED_IDS) {
    if (needs[n] < lowestValue) {
      lowestValue = needs[n];
      lowest = n;
    }
  }
  return lowest !== null && lowestValue < TUNING.thoughtBubbleThreshold ? lowest : null;
}

// --- Player care (§1.4): direct, immediate refills. A tap is worth about
// ⅔ of the animal doing it itself — the need refill is the bonus; the tap's
// point is hearts toward adoption, which lives in the game layer as before.

export const CARE_INTENT_IDS = ['feed', 'pet', 'clean', 'play', 'treat'] as const;
export type CareIntentId = (typeof CARE_INTENT_IDS)[number];

export const PLAYER_CARE_REFILLS: Record<CareIntentId, Partial<Record<NeedId, number>>> = {
  feed: { tummy: 30 },
  pet: { affection: 25 },
  clean: { clean: 30 },
  play: { fun: 30 },
  treat: { tummy: 14, fun: 12 },
};

/** Care verb → autonomy category (§4.2's verb mapping, §3.5 rule 3). */
export const CARE_CATEGORY = {
  feed: 'eat',
  pet: 'cuddle',
  clean: 'groom',
  play: 'play',
  treat: 'eat',
} as const;
