import type { NeedId } from './needs';

// The one config object (UTILITY-AI-DEEP-DIVE §6.4): every constant the
// autonomy engine uses lives here, with the dive's exact values. Tuning rule
// (§6.4): change ONE knob at a time, in ladder order — eligibility →
// congestion/capacity → cooldowns & momentum → affinities → need weights →
// curve points → decay rates — re-running the same seed battery each time.
//
// Step-1 additions beyond §6.4's list (flagged in the build report):
//  - dayLengthSec: §1.3 specifies decay "per day" over a 360-sim-second day;
//    the §6.4 object omits the day length itself, so it lives here.
//  - thoughtBubbleThreshold: §1.2 shows a thought icon when a need is low
//    without pinning the number; 35 matches the absence floor (§1.3).
//  - walkSpeedUnitsPerSec: yard units (0–100 square) per sim-second; the
//    dive never names a travel speed.

export const TUNING = {
  tickHz: 10,
  decisionIntervalSec: 2.0,
  decisionStaggerTicks: 20,
  topN: 3,
  rouletteExponent: 2,
  aliveBaseline: 0.02,
  momentum: 1.25,
  emergencyOverrideRatio: 1.6,
  emergencyDeficit: 0.9,
  minCommitFraction: 0.4,
  categoryCooldownSec: 25,
  cooldownFactor: 0.55,
  cooldownCriticalFactor: 0.85,
  criticalDeficit: 0.85,
  postCareGraceSec: 4,
  postCareCategoryFactor: 0.5,
  // Step 2 raised this 10 → 60: §8's H7 player-respect assertion measures
  // a 60 s no-same-category window after care, and step 1's probe caught a
  // Foodie re-picking the bowl at +18.9 s — legal under §3.5's 10 s prose,
  // a violation of H7's 60 s. The 60 s window is the one §6.2's metrics
  // table also uses, so the knob now matches the assertion that guards it.
  postCareCategorySec: 60,
  distanceFalloff: 0.35,
  congestionSecondFactor: 0.67,
  bodyWinsSatisfaction: 10,
  bodyWinsMinWeight: 1.2,
  absenceCatchupRate: 0.1,
  absenceMaxDrop: 20,
  absenceFloor: 35,
  fullServing: 50,
  decayPerDay: {
    tummy: 60,
    energy: 72,
    clean: 30,
    fun: 54,
    affection: 48,
  } as Record<NeedId, number>,
  // §2.3: the five 5-point LUTs, pull at deficit [0, .25, .50, .75, 1].
  curves: {
    tummy: [0.0, 0.05, 0.33, 0.84, 1.0], // late-rise (logistic-like)
    energy: [0.0, 0.03, 0.25, 0.8, 1.0], // latest-rise
    clean: [0.02, 0.18, 0.45, 0.75, 1.0], // steady-rise
    fun: [0.16, 0.55, 0.73, 0.88, 1.0], // eager concave
    affection: [0.12, 0.48, 0.68, 0.85, 1.0], // eager concave
  } as Record<NeedId, readonly number[]>,
  dayLengthSec: 360,
  thoughtBubbleThreshold: 35,
  walkSpeedUnitsPerSec: 30,
} as const;
