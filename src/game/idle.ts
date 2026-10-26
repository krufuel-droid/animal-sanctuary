import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { fnv1a, mulberry32 } from '../save/rng';
import type { SpeciesId, TraitId } from '../save/schema';
import type { CareActionId } from './care';
import type { SleepState } from './animals';

// The idle engine (PHASE0-DEEP-DIVE Feature 1): one timeout-chain scheduler
// per mounted animal (§B.6.1), CSS loops for breath/sway/tail, WAAPI one-shots
// for everything else. Per-individual variation is derived deterministically
// from instanceId (§B.6.3) — runtime only, never saved. Sleep is a state, not
// a save field: a remount always starts awake.

interface IdleParams {
  tempo: number;
  breathDur: number;
  swayDur: number;
  blinkEvery: [number, number];
  blinkDur: number;
  earEvery: [number, number] | null;
  earRot: number;
  noseEvery: [number, number] | null;
  noseBurst: [number, number];
  sigEvery: [number, number];
  breakerEvery: [number, number];
  sleepOnset: [number, number];
  tailDur: number | null;
}

const PARAMS: Record<SpeciesId, IdleParams> = {
  dog: { tempo: 1.0, breathDur: 3.1, swayDur: 6.2, blinkEvery: [2.2, 5.5], blinkDur: 170, earEvery: [5, 11], earRot: 15, noseEvery: [7, 14], noseBurst: [2, 4], sigEvery: [12, 22], breakerEvery: [25, 45], sleepOnset: [75, 130], tailDur: 0.95 },
  cat: { tempo: 1.05, breathDur: 3.6, swayDur: 7.9, blinkEvery: [2.5, 6.0], blinkDur: 180, earEvery: [6, 13], earRot: 7, noseEvery: null, noseBurst: [2, 3], sigEvery: [7, 14], breakerEvery: [28, 50], sleepOnset: [70, 120], tailDur: 3.6 },
  bunny: { tempo: 0.9, breathDur: 2.2, swayDur: 4.4, blinkEvery: [2.0, 4.5], blinkDur: 160, earEvery: [6, 12], earRot: 17, noseEvery: [2.5, 6], noseBurst: [3, 6], sigEvery: [9, 17], breakerEvery: [24, 48], sleepOnset: [75, 140], tailDur: null },
  fox: { tempo: 0.9, breathDur: 2.4, swayDur: 5.2, blinkEvery: [2.0, 5.0], blinkDur: 160, earEvery: [4, 8], earRot: 16, noseEvery: [7, 14], noseBurst: [2, 3], sigEvery: [10, 18], breakerEvery: [26, 48], sleepOnset: [75, 140], tailDur: 3.2 },
  panda: { tempo: 1.45, breathDur: 5.0, swayDur: 11.0, blinkEvery: [3.5, 7.5], blinkDur: 240, earEvery: [11, 20], earRot: 5, noseEvery: null, noseBurst: [2, 3], sigEvery: [14, 24], breakerEvery: [35, 60], sleepOnset: [60, 100], tailDur: null },
  duck: { tempo: 0.85, breathDur: 2.1, swayDur: 4.2, blinkEvery: [2.0, 4.5], blinkDur: 150, earEvery: null, earRot: 0, noseEvery: null, noseBurst: [2, 3], sigEvery: [9, 18], breakerEvery: [24, 46], sleepOnset: [75, 140], tailDur: 1.1 },
  turtle: { tempo: 1.6, breathDur: 4.2, swayDur: 9.0, blinkEvery: [6, 11], blinkDur: 1250, earEvery: null, earRot: 0, noseEvery: null, noseBurst: [2, 3], sigEvery: [14, 24], breakerEvery: [30, 55], sleepOnset: [75, 140], tailDur: 6.0 },
  hedgehog: { tempo: 0.95, breathDur: 2.6, swayDur: 5.4, blinkEvery: [2.4, 5.5], blinkDur: 170, earEvery: [9, 16], earRot: 6, noseEvery: [3, 7], noseBurst: [3, 5], sigEvery: [10, 18], breakerEvery: [26, 48], sleepOnset: [75, 140], tailDur: null },
  penguin: { tempo: 1.0, breathDur: 2.8, swayDur: 2.1, blinkEvery: [2.2, 5.0], blinkDur: 160, earEvery: null, earRot: 0, noseEvery: null, noseBurst: [2, 3], sigEvery: [10, 19], breakerEvery: [26, 50], sleepOnset: [75, 140], tailDur: null },
};

export interface IdleProfile {
  tempo: number;
  breathMul: number;
  sleepiness: number;
  tiltSide: 1 | -1;
  earBias: number; // probability the LEFT ear wins a flick
}

/** §B.6.3: derive the individual from its instanceId — same animal, same
 * feel, on every load, with zero save fields. Trait flavour layers on top:
 * Sleepy dozes sooner (onset × 0.7); Curious sniffs/looks more; Wild breaks
 * sooner; Gentle runs slower. */
export function deriveProfile(instanceId: string, traitId: TraitId | null): IdleProfile {
  const rng = mulberry32(fnv1a(`idle:${instanceId}`));
  const profile: IdleProfile = {
    tempo: 0.85 + rng() * 0.33,
    breathMul: 0.9 + rng() * 0.22,
    sleepiness: 0.8 + rng() * 0.5,
    tiltSide: rng() < 0.7 ? 1 : -1,
    earBias: 0.35 + rng() * 0.3,
  };
  if (traitId === 'sleepy') profile.sleepiness *= 0.7;
  if (traitId === 'gentle') profile.tempo *= 1.1;
  return profile;
}

type Channel = 'blink' | 'ear' | 'head' | 'nose' | 'signature' | 'breaker' | 'dream';

export interface UseIdleOptions {
  species: SpeciesId;
  instanceId: string;
  traitId: TraitId | null;
  enabled: boolean;
}

export function useIdle(
  rootRef: RefObject<Element | null>,
  { species, instanceId, traitId, enabled }: UseIdleOptions,
) {
  const [sleep, setSleep] = useState<SleepState>('awake');
  const sleepRef = useRef<SleepState>('awake');
  const lastTapAt = useRef<number>(Date.now());
  const profileRef = useRef<IdleProfile>(deriveProfile(instanceId, traitId));
  profileRef.current = deriveProfile(instanceId, traitId);
  const params = PARAMS[species];

  const setSleepBoth = (s: SleepState) => {
    sleepRef.current = s;
    setSleep(s);
  };

  // The API the component uses: wake() on any pointer care, react() per tap.
  const apiRef = useRef<{ wake: () => void; react: (a: CareActionId) => void }>({
    wake: () => {},
    react: () => {},
  });

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !enabled) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const profile = profileRef.current;
    const p = PARAMS[species];
    const tempo = p.tempo * profile.tempo;
    const traitTempoMul = (ch: Channel): number => {
      if (traitId === 'curious' && (ch === 'nose' || ch === 'head')) return 0.75;
      if (traitId === 'wild' && ch === 'breaker') return 0.75;
      return 1;
    };
    const rng = mulberry32(fnv1a(`idle-run:${instanceId}`) ^ (Date.now() & 0xffff));
    const rand = (range: [number, number]) => range[0] + rng() * (range[1] - range[0]);

    const q = (sel: string) => root.querySelector<SVGGraphicsElement>(sel);
    const anims = new Set<Animation>();
    const animate = (
      el: SVGGraphicsElement | null,
      keyframes: Keyframe[],
      options: KeyframeAnimationOptions,
    ) => {
      if (!el || reduced) return null;
      try {
        const a = el.animate(keyframes, options);
        anims.add(a);
        a.finished.catch(() => {}).finally(() => anims.delete(a));
        return a;
      } catch {
        return null;
      }
    };

    const headBusyUntil = { t: 0 };
    const now = () => performance.now();

    const doBlink = (slow = false) => {
      const eyes = q('.a-eyes');
      const dur = slow ? 1150 : p.blinkDur;
      animate(eyes, [{ transform: 'scaleY(1)' }, { transform: 'scaleY(0.1)', offset: 0.45 }, { transform: 'scaleY(1)' }], { duration: dur, easing: 'ease-in-out' });
      if (!slow && rng() < 0.15) {
        animate(eyes, [{ transform: 'scaleY(1)' }, { transform: 'scaleY(0.1)', offset: 0.45 }, { transform: 'scaleY(1)' }], { duration: p.blinkDur, delay: p.blinkDur + 90, easing: 'ease-in-out' });
      }
    };
    const doEarFlick = (both = false, amp = 1) => {
      if (!p.earEvery) return;
      const rot = p.earRot * amp;
      const fire = (sel: string, sign: number) =>
        animate(q(sel), [
          { transform: 'rotate(0deg)' },
          { transform: `rotate(${sign * rot}deg)`, offset: 0.3 },
          { transform: 'rotate(0deg)' },
        ], { duration: 480, easing: 'ease-out' });
      if (both || rng() < 0.25) {
        fire('.a-ear-l', -1);
        fire('.a-ear-r', 1);
      } else if (rng() < profile.earBias) fire('.a-ear-l', -1);
      else fire('.a-ear-r', 1);
    };
    const doHeadTilt = (look = false) => {
      if (now() < headBusyUntil.t) return;
      const head = q('.a-head');
      const side = rng() < 0.7 ? profile.tiltSide : (-profile.tiltSide as 1 | -1);
      const hold = rand([900, 2000]);
      if (look) {
        animate(head, [
          { transform: 'translateX(0px) rotate(0deg)' },
          { transform: `translateX(${side * 4}px) rotate(${side * 3}deg)`, offset: 0.25 },
          { transform: `translateX(${side * 4}px) rotate(${side * 3}deg)`, offset: 0.75 },
          { transform: 'translateX(0px) rotate(0deg)' },
        ], { duration: hold + 700, easing: 'ease-in-out' });
      } else {
        const rot = species === 'penguin' ? 12.5 : species === 'turtle' ? 3 : 9.5;
        animate(head, [
          { transform: 'rotate(0deg)' },
          { transform: `rotate(${side * rot}deg)`, offset: 0.3 },
          { transform: `rotate(${side * rot}deg)`, offset: 0.78 },
          { transform: 'rotate(0deg)' },
        ], { duration: hold + 600, easing: 'ease-in-out' });
      }
      headBusyUntil.t = now() + hold + 800;
    };
    const doNoseBurst = () => {
      const nose = q('.a-nose');
      const bursts = Math.round(rand(p.noseBurst));
      if (nose) {
        for (let i = 0; i < bursts; i++) {
          animate(nose, [{ transform: 'scale(1)' }, { transform: 'scale(1.28)', offset: 0.5 }, { transform: 'scale(1)' }], { duration: 210, delay: i * 230, easing: 'ease-in-out' });
        }
      } else {
        // Dog/fox sniff: quick little head dips.
        const head = q('.a-head');
        for (let i = 0; i < bursts; i++) {
          animate(head, [{ transform: 'translateY(0px)' }, { transform: 'translateY(2.6px)', offset: 0.5 }, { transform: 'translateY(0px)' }], { duration: 220, delay: i * 240, easing: 'ease-in-out' });
        }
      }
    };
    const doSignature = () => {
      switch (species) {
        case 'cat':
          doBlink(true);
          break;
        case 'bunny':
          doNoseBurst();
          break;
        case 'dog':
          doNoseBurst();
          doHeadTilt();
          break;
        case 'fox':
          doEarFlick(true);
          break;
        case 'panda':
          animate(q('.a-pose'), [
            { transform: 'rotate(0deg)' },
            { transform: 'rotate(2.4deg)', offset: 0.5 },
            { transform: 'rotate(0deg)' },
          ], { duration: 2600, easing: 'ease-in-out' });
          break;
        case 'duck':
          animate(q('.a-body .a-sig'), [
            { transform: 'rotate(0deg)' },
            { transform: 'rotate(-24deg)', offset: 0.3 },
            { transform: 'rotate(8deg)', offset: 0.6 },
            { transform: 'rotate(0deg)' },
          ], { duration: 620, easing: 'ease-in-out' });
          break;
        case 'turtle':
          animate(q('.a-head'), [
            { transform: 'translateX(0px)' },
            { transform: 'translateX(7px)', offset: 0.45 },
            { transform: 'translateX(7px)', offset: 0.8 },
            { transform: 'translateX(0px)' },
          ], { duration: 2400, easing: 'ease-in-out' });
          break;
        case 'hedgehog':
          doNoseBurst();
          animate(q('.a-body .a-sig'), [
            { transform: 'translateX(0px)' },
            { transform: 'translateX(0.8px)', offset: 0.25 },
            { transform: 'translateX(-0.8px)', offset: 0.5 },
            { transform: 'translateX(0.6px)', offset: 0.75 },
            { transform: 'translateX(0px)' },
          ], { duration: 500, easing: 'ease-in-out' });
          break;
        case 'penguin': {
          const flap = (sel: string, sign: number) =>
            animate(q(sel), [
              { transform: 'rotate(0deg)' },
              { transform: `rotate(${sign * 20}deg)`, offset: 0.35 },
              { transform: `rotate(${sign * -6}deg)`, offset: 0.65 },
              { transform: 'rotate(0deg)' },
            ], { duration: 640, easing: 'ease-in-out' });
          flap('.a-sig-l', -1);
          flap('.a-sig-r', 1);
          break;
        }
      }
    };
    const doBreaker = () => {
      const pose = q('.a-pose');
      switch (species) {
        case 'dog':
          animate(q('.a-head'), [
            { transform: 'rotate(0deg)' },
            { transform: 'rotate(-7deg)', offset: 0.25 },
            { transform: 'rotate(6deg)', offset: 0.55 },
            { transform: 'rotate(-4deg)', offset: 0.8 },
            { transform: 'rotate(0deg)' },
          ], { duration: 700, easing: 'ease-in-out' });
          doEarFlick(true);
          break;
        case 'cat':
          animate(pose, [
            { transform: 'translateY(0px) scale(1, 1)' },
            { transform: 'translateY(5px) scale(1.03, 0.93)', offset: 0.4 },
            { transform: 'translateY(5px) scale(1.03, 0.93)', offset: 0.75 },
            { transform: 'translateY(0px) scale(1, 1)' },
          ], { duration: 1500, easing: 'ease-in-out' });
          break;
        case 'panda':
          animate(pose, [
            { transform: 'rotate(0deg)' },
            { transform: 'rotate(4.5deg)', offset: 0.45 },
            { transform: 'rotate(4.5deg)', offset: 0.7 },
            { transform: 'rotate(0deg)' },
          ], { duration: 2200, easing: 'ease-in-out' });
          break;
        case 'fox':
        case 'bunny':
          animate(pose, [
            { transform: 'translateY(0px)' },
            { transform: 'translateY(-9px)', offset: 0.4 },
            { transform: 'translateY(0px)', offset: 0.75 },
            { transform: 'translateY(-4px)', offset: 0.88 },
            { transform: 'translateY(0px)' },
          ], { duration: 800, easing: 'ease-out' });
          break;
        case 'duck':
          animate(q('.a-body .a-sig'), [
            { transform: 'rotate(0deg)' },
            { transform: 'rotate(-38deg)', offset: 0.4 },
            { transform: 'rotate(-38deg)', offset: 0.7 },
            { transform: 'rotate(0deg)' },
          ], { duration: 1100, easing: 'ease-in-out' });
          break;
        case 'turtle':
          animate(q('.a-head'), [
            { transform: 'scale(1)' },
            { transform: 'scale(0.3) translateX(-8px)', offset: 0.35 },
            { transform: 'scale(0.3) translateX(-8px)', offset: 0.75 },
            { transform: 'scale(1)' },
          ], { duration: 2600, easing: 'ease-in-out' });
          break;
        case 'hedgehog':
          animate(pose, [
            { transform: 'translateY(0px)' },
            { transform: 'translateY(-3px)', offset: 0.4 },
            { transform: 'translateY(-3px)', offset: 0.8 },
            { transform: 'translateY(0px)' },
          ], { duration: 1200, easing: 'ease-in-out' });
          doNoseBurst();
          break;
        case 'penguin':
          doSignature();
          doHeadTilt();
          break;
      }
      headBusyUntil.t = now() + 1600;
    };

    // --- the chain (§B.6.1): sleep until the next due channel, fire, re-roll.
    const channels: { name: Channel; nextAt: number; every: () => number }[] = [];
    const arm = (name: Channel, every: () => number, firstIn?: number) => {
      channels.push({ name, nextAt: now() + (firstIn ?? every()) * 1000, every });
    };
    const interval = (range: [number, number], ch: Channel) =>
      rand(range) * tempo * traitTempoMul(ch);
    arm('blink', () => interval(p.blinkEvery, 'blink'));
    if (p.earEvery) arm('ear', () => interval(p.earEvery!, 'ear'));
    arm('head', () => interval([9, 18], 'head'));
    if (p.noseEvery) arm('nose', () => interval(p.noseEvery!, 'nose'));
    arm('signature', () => interval(p.sigEvery, 'signature'));
    arm('breaker', () => interval(p.breakerEvery, 'breaker'), rand([18, 30]));
    arm('dream', () => rand([9, 17]), rand([9, 17]));

    let timer: number | undefined;
    let suspendedUntil = 0;
    const fire = (ch: Channel) => {
      const state = sleepRef.current;
      if (state === 'asleep') {
        if (ch === 'dream') {
          if (species === 'hedgehog') doSignature();
          else doEarFlick(false, 0.5);
        }
        return;
      }
      if (state === 'sleepy' && (ch === 'breaker' || ch === 'signature')) return;
      switch (ch) {
        case 'blink':
          doBlink(state === 'sleepy' || (species === 'cat' && rng() < 0.3));
          break;
        case 'ear': doEarFlick(); break;
        case 'head': doHeadTilt(rng() < 0.45); break;
        case 'nose': doNoseBurst(); break;
        case 'signature': doSignature(); break;
        case 'breaker': doBreaker(); break;
        default: break;
      }
    };
    const schedule = () => {
      window.clearTimeout(timer);
      const nextAt = Math.min(...channels.map((c) => c.nextAt));
      timer = window.setTimeout(() => {
        if (document.hidden) {
          // Hidden-tab time is discarded, never burst-fired (§B.6.1).
          for (const c of channels) c.nextAt = now() + c.every() * 1000;
        } else if (now() >= suspendedUntil) {
          for (const c of channels) {
            if (c.nextAt <= now() + 30) {
              fire(c.name);
              c.nextAt = now() + c.every() * 1000;
            }
          }
        }
        schedule();
      }, Math.max(40, nextAt - now()));
    };
    schedule();

    // Sleep state machine (§B.6.4): awake → sleepy → asleep on no taps.
    const onsetMs = rand(p.sleepOnset) * 1000 * profile.sleepiness;
    const sleepTimer = window.setInterval(() => {
      const idleFor = Date.now() - lastTapAt.current;
      if (sleepRef.current === 'awake' && idleFor >= onsetMs) setSleepBoth('sleepy');
      else if (sleepRef.current === 'sleepy' && idleFor >= onsetMs + 32000) setSleepBoth('asleep');
    }, 2000);

    apiRef.current = {
      wake: () => {
        lastTapAt.current = Date.now();
        if (sleepRef.current !== 'awake') setSleepBoth('awake');
      },
      react: (action: CareActionId) => {
        lastTapAt.current = Date.now();
        if (sleepRef.current !== 'awake') setSleepBoth('awake');
        suspendedUntil = now() + 900;
        for (const a of anims) {
          try { a.cancel(); } catch { /* already finished */ }
        }
        anims.clear();
        // Per-action body responses (Phase 0 step 6, §B.7): the tap lands in
        // full; idle resumes after, re-randomised by the chain.
        switch (action) {
          case 'feed': doNoseBurst(); break;
          case 'pet': doHeadTilt(); doEarFlick(); break;
          case 'clean': doEarFlick(true); animate(q('.a-head'), [
            { transform: 'rotate(0deg)' }, { transform: 'rotate(-6deg)', offset: 0.3 },
            { transform: 'rotate(5deg)', offset: 0.6 }, { transform: 'rotate(0deg)' },
          ], { duration: 520, easing: 'ease-in-out' }); break;
          case 'play': doSignature(); break;
          case 'treat': doNoseBurst(); doEarFlick(); break;
        }
      },
    };

    return () => {
      window.clearTimeout(timer);
      window.clearInterval(sleepTimer);
      for (const a of anims) {
        try { a.cancel(); } catch { /* noop */ }
      }
      anims.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootRef, enabled, species, instanceId]);

  const profile = profileRef.current;
  const breathDur = params.breathDur * profile.breathMul * (sleep === 'asleep' ? 1.4 : sleep === 'sleepy' ? 1.2 : 1);
  const vars = {
    '--breath-dur': `${breathDur.toFixed(2)}s`,
    '--sway-dur': `${(params.swayDur * profile.tempo).toFixed(2)}s`,
    '--tail-dur': params.tailDur ? `${(params.tailDur * profile.tempo).toFixed(2)}s` : undefined,
  } as CSSProperties;

  return {
    sleep,
    vars,
    wake: () => apiRef.current.wake(),
    react: (a: CareActionId) => apiRef.current.react(a),
  };
}
