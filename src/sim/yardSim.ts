import { fnv1a, mulberry32 } from '../save/rng';
import type { TraitId } from '../save/schema';
import { TUNING } from './tuning';
import {
  NEED_IDS,
  PLAYER_CARE_REFILLS,
  CARE_CATEGORY,
  clampNeeds,
  deficitOf,
  thoughtNeedOf,
  type CareIntentId,
  type Needs,
  type NeedId,
} from './needs';
import {
  HOME_SPOT,
  WANDER_INSTANCE,
  YARD_DIAGONAL,
  YARD_LAYOUT,
  type AdvertiserDef,
  type AdvertiserInstance,
  type Category,
} from './advertisers';
import {
  pickChoice,
  scoreAdvertisers,
  type BrainResident,
  type ScoreEnv,
  type ScoredCandidate,
} from './brain';

// The yard sim (UTILITY-AI-DEEP-DIVE §7): a pure state module on a fixed
// 10 Hz timestep. The renderer subscribes via snapshot(); the DOM UI
// dispatches intents (applyCare). No Math.random, no wall clock anywhere
// below — all randomness flows from the per-instance yard stream, so the
// same save + same intent script produces a byte-identical event log (H1).

export type SimMode = 'idle' | 'travel' | 'acting' | 'withPlayer';

export interface SimEvent {
  t: number;
  type:
    | 'decide'
    | 'actionStarted'
    | 'actionArrived'
    | 'actionCompleted'
    | 'actionInterrupted'
    | 'careApplied';
  defId?: string;
  category?: Category;
  care?: CareIntentId;
  reason?: string;
}

interface ActiveAction {
  instanceKey: string;
  def: AdvertiserDef;
  phase: 'travel' | 'acting';
  anchorX: number;
  anchorY: number;
  fromX: number;
  fromY: number;
  travelStart: number;
  travelDur: number;
  endsAt: number;
  commitUntil: number;
  /** The score this action won its decision with. The hysteresis bar for
   * abandoning it is chosenScore × momentum (§3.4.2) — see rescoreBusy. */
  chosenScore: number;
  /** Set when a post-commitment re-score found no challenger able to
   * pass the hysteresis test: the action runs to completion (emergency
   * override aside). */
  locked: boolean;
}

export interface YardSimOptions {
  instanceId: string;
  traitId: TraitId | null;
  weights: Needs;
  metabolism: number;
  needs: Needs;
  rngSeed: number;
  arrivalIndex: number;
  startPos?: { x: number; y: number };
}

export interface SimSnapshot {
  instanceId: string;
  time: number;
  mode: SimMode;
  x: number;
  y: number;
  needs: Needs;
  action: { defId: string; category: Category; phase: 'travel' | 'acting' } | null;
  thought: NeedId | null;
  topScores: { id: string; score: number }[];
  decisionCount: number;
}

const EPS = 1e-9;
const TICK = 1 / TUNING.tickHz;

export class YardSim {
  readonly instanceId: string;
  readonly traitId: TraitId | null;
  readonly events: SimEvent[] = [];

  private readonly weights: Needs;
  private readonly metabolism: number;
  private readonly rng: () => number;
  private needs: Needs;
  private x: number;
  private y: number;
  private tickCount = 0;
  private accumulator = 0;
  private mode: SimMode = 'idle';
  private action: ActiveAction | null = null;
  private cooldownUntil: Partial<Record<Category, number>> = {};
  private globalCooldownUntil: Record<string, number> = {};
  private postCare: { category: Category; until: number } | null = null;
  private withPlayerUntil = 0;
  private reservations: { instanceKey: string; by: string }[] = [];
  private nextDecisionAt: number;
  private decisionCount = 0;
  private lastTop: { id: string; score: number }[] = [];
  private bands: Record<NeedId, number>;

  constructor(opts: YardSimOptions) {
    this.instanceId = opts.instanceId;
    this.traitId = opts.traitId;
    this.weights = { ...opts.weights };
    this.metabolism = opts.metabolism;
    this.needs = clampNeeds({ ...opts.needs });
    this.x = opts.startPos?.x ?? HOME_SPOT.x;
    this.y = opts.startPos?.y ?? HOME_SPOT.y;
    // One yard stream seeded from rngSeed (§7.2), distinct from both the
    // trait stream and the AI-profile stream.
    this.rng = mulberry32(fnv1a(`sanctuary-yard:${opts.rngSeed}:${opts.arrivalIndex}`));
    // Decision staggering (§3.5): spread thinkers across the interval.
    this.nextDecisionAt =
      (fnv1a(opts.instanceId) % TUNING.decisionStaggerTicks) * TICK;
    this.bands = this.currentBands();
  }

  get time(): number {
    return this.tickCount * TICK;
  }

  get currentMode(): SimMode {
    return this.mode;
  }

  getNeeds(): Needs {
    return { ...this.needs };
  }

  snapshot(): SimSnapshot {
    return {
      instanceId: this.instanceId,
      time: this.time,
      mode: this.mode,
      x: this.x,
      y: this.y,
      needs: { ...this.needs },
      action: this.action
        ? {
            defId: this.action.def.id,
            category: this.action.def.category,
            phase: this.action.phase,
          }
        : null,
      thought: thoughtNeedOf(this.needs),
      topScores: this.lastTop.map((s) => ({ ...s })),
      decisionCount: this.decisionCount,
    };
  }

  /**
   * Advance by dt real seconds, in fixed 0.1 sim-second ticks. At most 5
   * ticks per call (§7.2: a cozy game slows down rather than spiralling) —
   * callers that want to fast-forward (the harness, probes) call step in a
   * loop.
   */
  step(dt: number): void {
    if (!(dt > 0)) return;
    this.accumulator += dt;
    let n = 0;
    while (this.accumulator >= TICK - EPS && n < 5) {
      this.accumulator -= TICK;
      this.tickCount++;
      this.tick();
      n++;
    }
    if (n === 5) this.accumulator = 0; // drop the excess, never spiral
  }

  /**
   * A player care intent (§3.5): autonomy yields, gently. The current
   * action is interrupted (gains already banked stay banked), the refill
   * lands instantly, and the animal attends to the player for the grace
   * window before re-scoring from the new numbers.
   */
  applyCare(care: CareIntentId): void {
    if (this.action) this.endAction('player');
    const refills = PLAYER_CARE_REFILLS[care];
    for (const n of NEED_IDS) {
      const amt = refills[n];
      if (amt) this.needs[n] = Math.min(100, this.needs[n] + amt);
    }
    this.needs = clampNeeds(this.needs);
    this.mode = 'withPlayer';
    this.withPlayerUntil = this.time + TUNING.postCareGraceSec;
    this.postCare = {
      category: CARE_CATEGORY[care] as Category,
      until: this.time + TUNING.postCareCategorySec,
    };
    this.pushEvent({ type: 'careApplied', care });
  }

  // ------------------------------ internals ------------------------------

  private pushEvent(e: Omit<SimEvent, 't'>): void {
    this.events.push({ t: Math.round(this.time * 10) / 10, ...e });
    if (this.events.length > 600) this.events.splice(0, this.events.length - 600);
  }

  private currentBands(): Record<NeedId, number> {
    const b = {} as Record<NeedId, number>;
    for (const n of NEED_IDS) b[n] = Math.floor(this.needs[n] / 25);
    return b;
  }

  private resident(): BrainResident {
    return {
      instanceId: this.instanceId,
      traitId: this.traitId,
      weights: this.weights,
      needs: this.needs,
      x: this.x,
      y: this.y,
    };
  }

  private instances(): AdvertiserInstance[] {
    // The wander fallback advertises from wherever the resident is.
    return [...YARD_LAYOUT, { ...WANDER_INSTANCE, x: this.x, y: this.y }];
  }

  private scoreAll(): ScoredCandidate[] {
    const env: ScoreEnv = {
      now: this.time,
      yardDiagonal: YARD_DIAGONAL,
      currentInstanceKey: this.action?.instanceKey ?? null,
      cooldownUntil: this.cooldownUntil,
      postCare: this.postCare,
      reservations: this.reservations,
      actingUsers:
        this.action && this.action.phase === 'acting'
          ? [{ instanceKey: this.action.instanceKey, by: this.instanceId }]
          : [],
      globalCooldownUntil: this.globalCooldownUntil,
    };
    const scored = scoreAdvertisers(this.resident(), this.instances(), env);
    this.lastTop = scored
      .filter((c) => c.eligible)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((c) => ({ id: c.instance.def.id, score: Math.round(c.score * 1000) / 1000 }));
    return scored;
  }

  private tick(): void {
    const t = this.time;
    this.integrateDecay();
    this.progressAction();

    // Event-driven re-score (§3.5): a need crossing a 25-point band
    // downward makes an idle animal think again soon.
    const bands = this.currentBands();
    let bandDropped = false;
    for (const n of NEED_IDS) if (bands[n] < this.bands[n]) bandDropped = true;
    this.bands = bands;
    if (bandDropped && this.mode === 'idle') {
      this.nextDecisionAt = Math.min(this.nextDecisionAt, t + TICK);
    }

    if (this.mode === 'withPlayer' && t >= this.withPlayerUntil - EPS) {
      this.mode = 'idle';
      this.nextDecisionAt = t; // re-score from the new numbers, now
    }

    if (t >= this.nextDecisionAt - EPS) {
      this.nextDecisionAt = t + TUNING.decisionIntervalSec;
      if (this.mode === 'idle') this.decide();
      else if (this.mode === 'travel' || this.mode === 'acting') this.rescoreBusy();
    }
  }

  /** §1.3 decay, with its three-row context table and the §1.4
   * contentment buffer (a well-loved animal's Fun/Tummy decay ×0.9). */
  private integrateDecay(): void {
    const acting = this.mode === 'acting' ? this.action : null;
    const asleepAtBed = acting?.def.id === 'bed';
    const playing = acting?.def.category === 'play';
    const loved = this.needs.affection >= 75;
    for (const n of NEED_IDS) {
      let rate = TUNING.decayPerDay[n] / TUNING.dayLengthSec; // per sim-second
      if (asleepAtBed && (n === 'tummy' || n === 'fun' || n === 'affection')) rate *= 0.5;
      if (loved && (n === 'fun' || n === 'tummy')) rate *= 0.9;
      this.needs[n] -= rate * this.metabolism * TICK;
    }
    if (playing) this.needs.energy -= 0.1 * TICK; // §1.3: play is tiring
    this.needs = clampNeeds(this.needs);
  }

  private progressAction(): void {
    const a = this.action;
    if (!a) return;
    const t = this.time;
    if (a.phase === 'travel') {
      const p =
        a.travelDur <= 0 ? 1 : Math.min(1, (t - a.travelStart) / a.travelDur);
      this.x = a.fromX + (a.anchorX - a.fromX) * p;
      this.y = a.fromY + (a.anchorY - a.fromY) * p;
      if (p >= 1) {
        a.phase = 'acting';
        this.mode = 'acting';
        a.endsAt = t + a.def.durationSec;
        this.pushEvent({ type: 'actionArrived', defId: a.def.id, category: a.def.category });
      }
      return;
    }
    // Acting: gains BANK as rates (§3.5 rule 4) — an interruption at 40%
    // has genuinely delivered 40% of the gain. The energy cost banks as a
    // drain the same way (§5.2: it is the table's negative Energy).
    const frac = TICK / a.def.durationSec;
    for (const n of NEED_IDS) {
      const gain = a.def.gains[n];
      if (gain) this.needs[n] += gain * frac;
    }
    if (a.def.energyCost) this.needs.energy -= a.def.energyCost * frac;
    this.needs = clampNeeds(this.needs);
    if (t >= a.endsAt - EPS) this.completeAction();
  }

  private completeAction(): void {
    const a = this.action;
    if (!a) return;
    this.pushEvent({ type: 'actionCompleted', defId: a.def.id, category: a.def.category });
    this.cooldownUntil[a.def.category] = this.time + TUNING.categoryCooldownSec;
    if (a.def.globalCooldownSec) {
      this.globalCooldownUntil[a.def.id] = this.time + a.def.globalCooldownSec;
    }
    this.releaseReservation(a.instanceKey);
    this.action = null;
    this.mode = 'idle';
    this.nextDecisionAt = this.time + TICK;
  }

  private endAction(reason: string): void {
    const a = this.action;
    if (!a) return;
    this.pushEvent({
      type: 'actionInterrupted',
      defId: a.def.id,
      category: a.def.category,
      reason,
    });
    this.releaseReservation(a.instanceKey);
    this.action = null;
    this.mode = 'idle';
  }

  private releaseReservation(instanceKey: string): void {
    this.reservations = this.reservations.filter(
      (r) => !(r.instanceKey === instanceKey && r.by === this.instanceId),
    );
  }

  private decide(): void {
    const candidates = this.scoreAll();
    this.decisionCount++;
    const choice = pickChoice(candidates, this.rng);
    if (!choice) return;
    this.pushEvent({ type: 'decide', defId: choice.instance.def.id, category: choice.instance.def.category });
    this.startAction(choice.instance, choice.score);
  }

  /** Mid-action re-score (§3.4): commitment window, momentum hysteresis,
   * and the emergency override. Inside the commitment window nothing
   * switches except the override. Past it, a challenger must pass the
   * hysteresis test: beat the score the incumbent WON its decision with,
   * times the momentum factor (§3.4.2, "clearly better, not merely
   * better"). The bar uses the decision-time score, not a recomputation —
   * an action banks its own need as it runs, so its live score collapses
   * toward the end and any recompute-and-compare test abandons nearly
   * every action at the 40% mark (observed in the D2 probe: ~8 s action
   * lifetimes, zero completions — the §6.3 oscillation signature). With
   * the stored bar, actions run to completion unless something is
   * genuinely, clearly better — the H5 target (<5% aborted) and the
   * §4.5 story traces, where every action completes, both hold. The
   * top-3 roulette remains for fresh decisions from idle. */
  private rescoreBusy(): void {
    const a = this.action;
    if (!a) return;
    const candidates = this.scoreAll();
    this.decisionCount++;
    const incumbent = candidates.find((c) => c.instance.key === a.instanceKey);

    // Emergency override: a need at ≥0.90 deficit whose best action scores
    // more than 1.6× the incumbent's raw (momentum-free) score wins now.
    if (incumbent) {
      const incumbentRaw = incumbent.score / TUNING.momentum;
      for (const n of NEED_IDS) {
        if (deficitOf(this.needs, n) < TUNING.emergencyDeficit) continue;
        let best: ScoredCandidate | null = null;
        for (const c of candidates) {
          if (!c.eligible || !c.instance.def.gains[n]) continue;
          if (!best || c.score > best.score) best = c;
        }
        if (
          best &&
          best.instance.key !== a.instanceKey &&
          best.score > TUNING.emergencyOverrideRatio * incumbentRaw
        ) {
          this.endAction('override');
          this.startAction(best.instance, best.score);
          return;
        }
      }
    }

    if (this.time < a.commitUntil - EPS || a.locked) return;
    // Hysteresis test against the stored decision-time bar.
    let challenger: ScoredCandidate | null = null;
    for (const c of candidates) {
      if (!c.eligible || c.instance.key === a.instanceKey) continue;
      if (!challenger || c.score > challenger.score) challenger = c;
    }
    if (challenger && challenger.score > a.chosenScore * TUNING.momentum) {
      this.pushEvent({ type: 'decide', defId: challenger.instance.def.id, category: challenger.instance.def.category });
      this.endAction('rescore');
      this.startAction(challenger.instance, challenger.score);
      return;
    }
    a.locked = true; // incumbent holds: commit to completion
  }

  private startAction(instance: AdvertiserInstance, chosenScore: number): void {
    const def = instance.def;
    let ax = instance.x;
    let ay = instance.y;
    if (def.source === 'fallback') {
      // Wander & sniff: a nearby point, drawn from the yard stream.
      ax = Math.min(92, Math.max(8, this.x + (this.rng() * 2 - 1) * 22));
      ay = Math.min(92, Math.max(14, this.y + (this.rng() * 2 - 1) * 16));
    }
    const dist = Math.hypot(ax - this.x, ay - this.y);
    const travelDur = dist / TUNING.walkSpeedUnitsPerSec;
    this.action = {
      instanceKey: instance.key,
      def,
      phase: 'travel',
      anchorX: ax,
      anchorY: ay,
      fromX: this.x,
      fromY: this.y,
      travelStart: this.time,
      travelDur,
      endsAt: 0,
      commitUntil:
        this.time + travelDur + TUNING.minCommitFraction * def.durationSec,
      chosenScore,
      locked: false,
    };
    if (def.source !== 'fallback') {
      this.reservations.push({ instanceKey: instance.key, by: this.instanceId });
    }
    this.mode = 'travel';
    this.pushEvent({ type: 'actionStarted', defId: def.id, category: def.category });
    if (travelDur <= 0.001) {
      this.x = ax;
      this.y = ay;
      this.action.phase = 'acting';
      this.mode = 'acting';
      this.action.endsAt = this.time + def.durationSec;
      this.pushEvent({ type: 'actionArrived', defId: def.id, category: def.category });
    }
  }
}
