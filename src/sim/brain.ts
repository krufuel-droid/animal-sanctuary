import type { TraitId } from '../save/schema';
import { TUNING } from './tuning';
import {
  NEED_IDS,
  curveAt,
  deficitOf,
  type Needs,
  type NeedId,
} from './needs';
import { affinityFor } from './traits-ai';
import type { AdvertiserInstance, Category } from './advertisers';

// The brain (UTILITY-AI-DEEP-DIVE §3): eligibility gates, then the §3.1
// additive-over-needs score with multiplicative context, then selection by
// top-3 weighted roulette ∝ score² (§3.3). Pure functions — the headless
// harness and the worked-example tests drive these directly.

export interface BrainResident {
  instanceId: string;
  traitId: TraitId | null;
  /** Resolved §4.3 weights (table × individual factors). */
  weights: Needs;
  needs: Needs;
  x: number;
  y: number;
}

export interface ScoreEnv {
  now: number;
  yardDiagonal: number;
  /** The incumbent action's instance key (momentum), or null. */
  currentInstanceKey: string | null;
  /** Category → sim-time when its post-action cooldown ends. */
  cooldownUntil: Partial<Record<Category, number>>;
  /** Post-care soft factor (§3.5 rule 3): category + expiry. */
  postCare: { category: Category; until: number } | null;
  /** Reservations (travel commitments) — own entries are ignored. */
  reservations: { instanceKey: string; by: string }[];
  /** Animals currently using an advertiser — own entries are ignored. */
  actingUsers: { instanceKey: string; by: string }[];
  /** Yard-wide advertiser cooldowns (treat jar in the full catalogue). */
  globalCooldownUntil: Record<string, number>;
}

export interface ScoredCandidate {
  instance: AdvertiserInstance;
  score: number;
  needScore: number;
  eligible: boolean;
}

/** Each category's primary need — drives the cooldown relaxation (§3.4)
 * and the body-wins cooldown override (§4.2). */
export const CATEGORY_PRIMARY_NEED: Record<Category, NeedId> = {
  eat: 'tummy',
  rest: 'energy',
  groom: 'clean',
  play: 'fun',
  cuddle: 'affection',
  social: 'affection',
  explore: 'fun',
};

function othersAt(
  list: { instanceKey: string; by: string }[],
  key: string,
  selfId: string,
): number {
  let n = 0;
  for (const e of list) if (e.instanceKey === key && e.by !== selfId) n++;
  return n;
}

export function scoreAdvertisers(
  resident: BrainResident,
  instances: AdvertiserInstance[],
  env: ScoreEnv,
): ScoredCandidate[] {
  const out: ScoredCandidate[] = [];
  const energyDeficit = deficitOf(resident.needs, 'energy');

  for (const instance of instances) {
    const def = instance.def;

    // --- Eligibility (§3.2): the only vetoes in the system. Gates are
    // about physical possibility and player respect, never about forcing
    // "correct" behaviour.
    let eligible = true;
    const usedByOthers =
      othersAt(env.actingUsers, instance.key, resident.instanceId) +
      othersAt(env.reservations, instance.key, resident.instanceId);
    if (usedByOthers >= def.capacity) eligible = false;
    const gcUntil = env.globalCooldownUntil[def.id];
    if (gcUntil !== undefined && env.now < gcUntil) eligible = false;

    // --- needScore (§3.1): additive over needs, on EFFECTIVE gain — no
    // credit for overshoot. The body-wins failsafe (§4.2) lifts the weight
    // of any need at ≤10 satisfaction to at least 1.20.
    let needScore = 0;
    for (const n of NEED_IDS) {
      const gain = def.gains[n];
      if (!gain) continue;
      const effGain = Math.min(gain, 100 - resident.needs[n]);
      if (effGain <= 0) continue;
      let w = resident.weights[n];
      if (resident.needs[n] <= TUNING.bodyWinsSatisfaction) {
        w = Math.max(w, TUNING.bodyWinsMinWeight);
      }
      needScore += (effGain / TUNING.fullServing) * curveAt(n, deficitOf(resident.needs, n)) * w;
    }

    // --- Context factors.
    const dist = Math.hypot(instance.x - resident.x, instance.y - resident.y);
    const fDist = 1 - TUNING.distanceFalloff * (dist / env.yardDiagonal);

    let fCong = 1;
    if (
      def.capacity !== Infinity &&
      othersAt(env.reservations, instance.key, resident.instanceId) > 0 &&
      usedByOthers < def.capacity
    ) {
      fCong = TUNING.congestionSecondFactor;
    }

    let fState = 1;
    if (env.currentInstanceKey !== null && env.currentInstanceKey === instance.key) {
      fState *= TUNING.momentum;
    }
    const cdUntil = env.cooldownUntil[def.category];
    if (cdUntil !== undefined && env.now < cdUntil) {
      const primary = CATEGORY_PRIMARY_NEED[def.category];
      const critical =
        deficitOf(resident.needs, primary) >= TUNING.criticalDeficit ||
        resident.needs[primary] <= TUNING.bodyWinsSatisfaction;
      fState *= critical ? TUNING.cooldownCriticalFactor : TUNING.cooldownFactor;
    }
    if (env.postCare && env.now < env.postCare.until && env.postCare.category === def.category) {
      fState *= TUNING.postCareCategoryFactor;
    }

    let costFactor = 1;
    if (def.energyCost) {
      costFactor = Math.min(
        1,
        Math.max(0.6, 1 - (def.energyCost / 40) * energyDeficit),
      );
    }

    const score =
      (needScore + TUNING.aliveBaseline) *
      affinityFor(resident.traitId, def) *
      fDist *
      fCong *
      fState *
      costFactor;

    out.push({ instance, score, needScore, eligible });
  }
  return out;
}

/**
 * Selection (§3.3): sort descending, take the top 3 eligible, pick with
 * probability ∝ score². Nothing outside the top 3 can happen; the
 * favourite is favoured; the third still happens often enough to be a
 * personality a player can spot.
 */
export function pickChoice(
  candidates: ScoredCandidate[],
  rng: () => number,
): ScoredCandidate | null {
  const eligible = candidates
    .filter((c) => c.eligible)
    .sort((a, b) => b.score - a.score)
    .slice(0, TUNING.topN);
  if (eligible.length === 0) return null;
  let total = 0;
  for (const c of eligible) total += c.score * c.score;
  if (!(total > 0)) return eligible[0];
  let roll = rng() * total;
  for (const c of eligible) {
    roll -= c.score * c.score;
    if (roll <= 0) return c;
  }
  return eligible[eligible.length - 1];
}
