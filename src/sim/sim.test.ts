import { describe, expect, it } from 'vitest';
import { fnv1a } from '../save/rng';
import { TUNING } from './tuning';
import {
  absenceCatchUp,
  curveAt,
  type Needs,
} from './needs';
import {
  TRAIT_NEED_WEIGHTS,
  affinityFor,
  aiSeedFor,
  deriveAiProfile,
} from './traits-ai';
import { ADVERTISERS, type AdvertiserDef, type AdvertiserInstance } from './advertisers';
import { scoreAdvertisers, pickChoice, type ScoreEnv } from './brain';
import { YardSim } from './yardSim';

// UTILITY-AI-DEEP-DIVE verification, unit level: curve LUTs (§2.3), the
// §4.4 worked example, absence catch-up (§1.3), profile derivation (§4.3),
// determinism (H1), and banked-gain interruption (§3.5 rule 4).

const NEEDS_60: Needs = { tummy: 60, energy: 60, clean: 60, fun: 60, affection: 60 };

describe('response curves (§2.3) — the five LUTs, exactly', () => {
  it('hits every authored point', () => {
    for (const n of ['tummy', 'energy', 'clean', 'fun', 'affection'] as const) {
      const lut = TUNING.curves[n];
      [0, 0.25, 0.5, 0.75, 1].forEach((d, i) => {
        expect(curveAt(n, d)).toBeCloseTo(lut[i], 10);
      });
    }
  });

  it('interpolates linearly between points', () => {
    // Tummy at d=0.54: between .33 (d=.5) and .84 (d=.75) → .33 + .16×.51
    expect(curveAt('tummy', 0.54)).toBeCloseTo(0.4116, 4);
    // Fun at d=0.45: between .55 and .73 → .55 + .8×.18
    expect(curveAt('fun', 0.45)).toBeCloseTo(0.694, 4);
    // The two archetypes read as designed: Tummy nearly silent at 75%
    // satisfaction, Fun already voting.
    expect(curveAt('tummy', 0.25)).toBeCloseTo(0.05, 10);
    expect(curveAt('fun', 0.25)).toBeCloseTo(0.55, 10);
  });
});

describe('aiProfile derivation (§4.3) — separate stream, drawn once', () => {
  it('is deterministic and in range', () => {
    const a = deriveAiProfile(897955649, 2, 'fancy');
    const b = deriveAiProfile(897955649, 2, 'fancy');
    expect(a).toEqual(b);
    expect(a.aiSeed).toBe(aiSeedFor(897955649, 2));
    expect(a.aiSeed).toBe(fnv1a('sanctuary-ai:897955649:2'));
    expect(a.metabolism).toBeGreaterThanOrEqual(0.94);
    expect(a.metabolism).toBeLessThanOrEqual(1.06);
    const table = TRAIT_NEED_WEIGHTS.fancy;
    for (const n of ['tummy', 'energy', 'clean', 'fun', 'affection'] as const) {
      expect(a.weights[n]).toBeGreaterThanOrEqual(table[n] * 0.92 - 1e-9);
      expect(a.weights[n]).toBeLessThanOrEqual(table[n] * 1.08 + 1e-9);
      expect(a.arrivalNeeds[n]).toBeGreaterThanOrEqual(55);
      expect(a.arrivalNeeds[n]).toBeLessThanOrEqual(90);
    }
  });

  it('never touches the Phase 0 trait stream seed', () => {
    expect(aiSeedFor(123, 4)).not.toBe(fnv1a('sanctuary:123:4'));
  });
});

describe('affinities (§4.2)', () => {
  it('favourite category ×1.15; treat traits only on treat-flagged', () => {
    expect(affinityFor('foodie', ADVERTISERS['food-bowl'])).toBe(1.15);
    expect(affinityFor('sleepy', ADVERTISERS['cuddle-rug'])).toBe(1.15);
    expect(affinityFor('mischievous', ADVERTISERS['food-bowl'])).toBe(1);
    const jar: AdvertiserDef = {
      id: 'treat-jar', category: 'eat', source: 'object',
      gains: { tummy: 16, fun: 12 }, durationSec: 5, capacity: 1, treatFlag: true,
    };
    expect(affinityFor('mischievous', jar)).toBe(1.15);
    expect(affinityFor('curious', jar)).toBe(1.15);
    expect(affinityFor('foodie', jar)).toBe(1);
  });

  it('curious explore ×1.15; wild bath ×0.90; nothing below 0.85', () => {
    expect(affinityFor('curious', ADVERTISERS.wander)).toBe(1.15);
    expect(affinityFor('wild', ADVERTISERS['bath-tub'])).toBe(0.9);
    expect(affinityFor('gentle', ADVERTISERS['bath-tub'])).toBe(1);
  });
});

describe('absence catch-up (§1.3) — the cozy rule, arithmetically', () => {
  it('a 30-day gap drops no need by more than 20 and floors at 35', () => {
    const before: Needs = { tummy: 90, energy: 80, clean: 70, fun: 60, affection: 50 };
    const after = absenceCatchUp(before, 30 * 86400);
    for (const n of Object.keys(before) as (keyof Needs)[]) {
      expect(before[n] - after[n]).toBeLessThanOrEqual(20 + 1e-9);
      expect(after[n]).toBeGreaterThanOrEqual(35);
    }
    expect(after.tummy).toBe(70); // 90 − 20 (capped)
    expect(after.affection).toBe(35); // 50 − 20 = 30 → floored to 35
  });

  it('a short gap barely moves needs; no time away changes nothing', () => {
    const before: Needs = { ...NEEDS_60 };
    const after = absenceCatchUp(before, 30); // 30 real seconds
    expect(after.tummy).toBeCloseTo(60 - 60 * (30 / 360) * 0.1, 6);
    expect(absenceCatchUp(before, 0)).toEqual(before);
  });
});

// --- §4.4 worked example: one moment, two animals -------------------------

function envFor(overrides: Partial<ScoreEnv> = {}): ScoreEnv {
  return {
    now: 0,
    yardDiagonal: Math.hypot(100, 100),
    currentInstanceKey: null,
    cooldownUntil: {},
    postCare: null,
    reservations: [],
    actingUsers: [],
    globalCooldownUntil: {},
    ...overrides,
  };
}

function inst(def: AdvertiserDef, x: number, y: number): AdvertiserInstance {
  return { key: def.id, def, x, y };
}

describe('§4.4 worked example — Bao (Sleepy) vs Rusty (Wild)', () => {
  it("Bao's bed scores ≈1.16 and wins", () => {
    const resident = {
      instanceId: 'bao',
      traitId: 'sleepy' as const,
      weights: { ...TRAIT_NEED_WEIGHTS.sleepy },
      needs: { tummy: 46, energy: 22, clean: 70, fun: 55, affection: 60 },
      x: 50,
      y: 50,
    };
    // Anchors placed to reproduce the example's stated distance factors:
    // bed .90 (dist 40.4), rug .85 (60.6), bowl 1.0 (0), toy box .95 (20.2).
    const instances = [
      inst(ADVERTISERS.bed, 90.4, 50),
      inst(ADVERTISERS['cuddle-rug'], 110.6, 50),
      inst(ADVERTISERS['food-bowl'], 50, 50),
      inst(ADVERTISERS['toy-box'], 70.2, 50),
    ];
    const scored = scoreAdvertisers(resident, instances, envFor());
    const by = (id: string) => scored.find((c) => c.instance.def.id === id)!;
    expect(by('bed').score).toBeCloseTo(1.16, 1);
    expect(by('toy-box').score).toBeCloseTo(0.39, 1);
    const top = [...scored].sort((a, b) => b.score - a.score)[0];
    expect(top.instance.def.id).toBe('bed');
  });

  it("Rusty's toy box scores ≈1.04 and wins", () => {
    const resident = {
      instanceId: 'rusty',
      traitId: 'wild' as const,
      weights: { ...TRAIT_NEED_WEIGHTS.wild },
      needs: { tummy: 58, energy: 64, clean: 48, fun: 30, affection: 52 },
      x: 0,
      y: 0,
    };
    // §5.1's scratch post, as data (not in the step-1 yard): Fun +22,
    // Clean +10, 8 s, cap 1. Distance factors per the example: toy .95,
    // scratch .90, bowl .80, bed .80.
    const scratch: AdvertiserDef = {
      id: 'scratch-post', category: 'play', source: 'object',
      gains: { fun: 22, clean: 10 }, durationSec: 8, capacity: 1,
    };
    const instances = [
      inst(ADVERTISERS['toy-box'], 20.2, 0),
      inst(scratch, 40.4, 0),
      inst(ADVERTISERS['food-bowl'], 80.8, 0),
      inst(ADVERTISERS.bed, 0, 80.8),
    ];
    const scored = scoreAdvertisers(resident, instances, envFor());
    const by = (id: string) => scored.find((c) => c.instance.def.id === id)!;
    expect(by('toy-box').score).toBeCloseTo(1.04, 1);
    expect(by('scratch-post').score).toBeCloseTo(0.65, 1);
    const top = [...scored].sort((a, b) => b.score - a.score)[0];
    expect(top.instance.def.id).toBe('toy-box');
  });

  it('selection is top-3 roulette ∝ score² — the 4th can never happen', () => {
    const mk = (id: string, score: number) => ({
      instance: inst({ ...ADVERTISERS.wander, id }, 0, 0),
      score,
      needScore: score,
      eligible: true,
    });
    const cands = [mk('a', 0.82), mk('b', 0.61), mk('c', 0.44), mk('d', 0.2)];
    expect(pickChoice(cands, () => 0)?.instance.def.id).toBe('a');
    expect(pickChoice(cands, () => 0.5)?.instance.def.id).toBe('a');
    expect(pickChoice(cands, () => 0.9)?.instance.def.id).toBe('c');
    for (let r = 0; r < 1; r += 0.05) {
      expect(pickChoice(cands, () => r)?.instance.def.id).not.toBe('d');
    }
  });
});

// --- the sim itself --------------------------------------------------------

function makeSim(overrides: Partial<ConstructorParameters<typeof YardSim>[0]> = {}) {
  return new YardSim({
    instanceId: 'arr-3',
    traitId: 'playful',
    weights: { ...TRAIT_NEED_WEIGHTS.playful },
    metabolism: 1,
    needs: { ...NEEDS_60 },
    rngSeed: 424242,
    arrivalIndex: 3,
    ...overrides,
  });
}

describe('H1 — reproducibility: same seed + same intents → identical log', () => {
  it('two runs produce byte-identical event logs and needs', () => {
    const run = () => {
      const sim = makeSim();
      for (let i = 0; i < 6000; i++) {
        sim.step(0.1);
        if (i === 1000) sim.applyCare('feed');
        if (i === 2500) sim.applyCare('pet');
      }
      return sim;
    };
    const a = run();
    const b = run();
    expect(fnv1a(JSON.stringify(a.events))).toBe(fnv1a(JSON.stringify(b.events)));
    expect(a.getNeeds()).toEqual(b.getNeeds());
    expect(a.events.length).toBeGreaterThan(20); // the run actually lived
  });
});

describe('H2 — bounds over a long unattended run', () => {
  it('needs stay finite within [0, 100] for 3600 sim-seconds', () => {
    const sim = makeSim({
      traitId: 'wild',
      weights: { ...TRAIT_NEED_WEIGHTS.wild },
      needs: { tummy: 55, energy: 90, clean: 40, fun: 85, affection: 58 },
    });
    for (let i = 0; i < 36000; i++) {
      sim.step(0.1);
      if (i % 500 === 0) {
        for (const v of Object.values(sim.getNeeds())) {
          expect(Number.isFinite(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(100);
        }
      }
    }
    // The yard lived: it ate, rested and played without any player.
    const cats = new Set(
      sim.events.filter((e) => e.type === 'actionStarted').map((e) => e.category),
    );
    expect(cats.has('eat')).toBe(true);
    expect(cats.has('rest')).toBe(true);
    expect(cats.has('play')).toBe(true);
  });

  it('actions mostly run to completion (H5 thrash guard)', () => {
    const sim = makeSim({
      traitId: 'foodie',
      weights: { ...TRAIT_NEED_WEIGHTS.foodie },
      needs: { tummy: 35, energy: 80, clean: 75, fun: 70, affection: 70 },
    });
    for (let i = 0; i < 6000; i++) sim.step(0.1); // 600 sim-seconds
    const started = sim.events.filter((e) => e.type === 'actionStarted').length;
    const completed = sim.events.filter((e) => e.type === 'actionCompleted').length;
    const aborted = sim.events.filter((e) => e.type === 'actionInterrupted').length;
    expect(started).toBeGreaterThan(10);
    // §6.2's target is <5% aborted; the guard here is deliberately loose
    // (emergency overrides are legitimate aborts) but far below the ~90%
    // abort rate of a recompute-and-compare hysteresis failure.
    expect(aborted / started).toBeLessThan(0.25);
    expect(completed).toBeGreaterThan(started * 0.6);
  });
});

describe('§3.5 rule 4 — gains bank continuously; interruption wastes nothing', () => {
  it('a nap interrupted at ~40% keeps ~40% of its Energy', () => {
    const sim = makeSim({
      instanceId: 'arr-5',
      traitId: 'sleepy',
      weights: { ...TRAIT_NEED_WEIGHTS.sleepy },
      needs: { tummy: 80, energy: 20, clean: 80, fun: 80, affection: 80 },
      rngSeed: 777,
      arrivalIndex: 5,
    });
    // Step until the panda is actually asleep at the bed (the roulette may
    // legitimately send it to the rug first — wait for the real nap).
    let guard = 0;
    while (guard++ < 20000) {
      sim.step(0.1);
      const s = sim.snapshot();
      if (s.mode === 'acting' && s.action?.defId === 'bed') break;
    }
    const atBed = sim.snapshot();
    expect(atBed.mode).toBe('acting');
    expect(atBed.action?.defId).toBe('bed');
    const e0 = sim.getNeeds().energy;
    for (let i = 0; i < 80; i++) sim.step(0.1); // 8 s = 40% of the 20 s nap
    const aff0 = sim.getNeeds().affection;
    sim.applyCare('pet');
    const after = sim.getNeeds();
    // Banked ≈ 40% × 55 = 22, minus ~1.6 of decay over the 8 s.
    expect(after.energy - e0).toBeGreaterThan(15);
    expect(after.energy - e0).toBeLessThan(30);
    expect(sim.snapshot().mode).toBe('withPlayer');
    // The Pet refill (+25 affection) landed instantly with the interrupt.
    expect(after.affection).toBeCloseTo(Math.min(100, aff0 + 25), 4);
  });
});
