// Animal Sanctuary sound engine + synthesized recipes.
// Spec of record: ~/workspace/animal-sanctuary-research/SOUND-DESIGN-DEEP-DIVE.md
// Stage SND-1: engine, buses, unlock, core care/UI/celebration set. All synth
// except ONE admitted recorded file: vocal-purr.mp3 (§6.3 — the synth purr
// failed Amanda's ear-check, "motor noises," 2026-10-26; see public/audio/
// CREDITS.md). No speech synthesis anywhere, ever (household rule).
//
// Gain table (§5.2 — load-bearing once Amanda's ear-check approves Stage 1):
//   UI 0.50 · Animal 0.80 · Ambient 0.35 · Celebration 0.70 · master = prefs.volume
// Safety: compressor ceiling (thr −12 dB, ratio 12) — a backstop, not a shaper.
// Every envelope attack ≥ 4 ms (≥ 10 ms on Celebration) — no startle, ever.

import { mulberry32 } from '../save/rng';
import type { AudioPrefs } from '../save/schema';
import { DEFAULT_AUDIO_PREFS } from '../save/schema';

export const BUS_GAIN = { ui: 0.5, animal: 0.8, amb: 0.35, celeb: 0.7 } as const;
type BusName = keyof typeof BUS_GAIN;

export interface PlayOpts {
  species?: string;
  traitId?: string | null;
  favourite?: boolean;
  gain?: number; // linear multiplier on top of the recipe level (visits: 0.79 ≈ −2 dB)
  noteIndex?: number; // heart ladder 0..7
  homeRoot?: number; // Hz, visit greetings
  perfect?: boolean;
  delay?: number; // seconds from now
}

interface Recipe {
  bus: BusName;
  minGap?: number; // seconds, per-id throttle (§5.4.3)
  dur: number; // approx seconds (voice-cap bookkeeping)
  fn: (rc: RecipeCtx, out: GainNode, opts: PlayOpts) => void;
}

interface RecipeCtx {
  ctx: BaseAudioContext;
  t: number; // absolute start time on ctx's clock
  rng: () => number;
}

// ---------------------------------------------------------------------------
// Shared noise buffer (one per context) — every noise sound is buffer → filter
// → envelope (§6.2). Never an oscillator pretending to be noise.
const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();
function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let b = noiseBuffers.get(ctx);
  if (!b) {
    const len = Math.floor(ctx.sampleRate * 2);
    b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, b);
  }
  return b;
}

// ---------------------------------------------------------------------------
// Recorded purr (§6.3 admitted file #1 — public/audio/vocal-purr.mp3, public
// domain, logged in public/audio/CREDITS.md). Fetched + decoded ONCE, kicked
// off when this module loads (decode via a throwaway OfflineAudioContext —
// no user gesture needed), so the real cat is already in memory before the
// first tap of the session; decoding early also removes the first-Pet race
// where the unlock tap's own Pet would otherwise beat the download and fall
// back to the synth motor. A decoded AudioBuffer is context-independent, so
// the one buffer serves every context. Until it lands (offline renders, any
// fetch failure) the synth recipe below remains the fallback.
const purrState: { buf: AudioBuffer | null; started: boolean } = { buf: null, started: false };
function ensurePurr(): void {
  if (purrState.started) return;
  purrState.started = true;
  void (async () => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}audio/vocal-purr.mp3`);
      if (!res.ok) return;
      const raw = await res.arrayBuffer();
      const decoder = new OfflineAudioContext(1, 1, 44100);
      purrState.buf = await decoder.decodeAudioData(raw);
    } catch {
      /* no file, no problem — synth fallback covers it */
    }
  })();
}
ensurePurr();

/** Play the recorded purr: random offset into the seamless loop each time
 * (variation by position), breath-shaped envelope. Hedgehog churr = the
 * same cat slowed to ×0.75, shorter and quieter (the §6.2.9 variant ratios). */
function recordedPurr(rc: RecipeCtx, out: AudioNode, buf: AudioBuffer, gainScale: number, tOff: number, durScale: number, hedgehog: boolean): void {
  const t = rc.t + tOff;
  const dur = (1.8 + rc.rng() * 0.8) * durScale;
  const src = rc.ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.playbackRate.value = (hedgehog ? 0.75 : 1) * (1 + (rc.rng() * 2 - 1) * 0.02);
  const f = rc.ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 900; // warmth + smooths the loop seam
  const g = rc.ctx.createGain();
  const peak = 0.45 * gainScale * (hedgehog ? 0.7 : 1);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.3);
  g.gain.setValueAtTime(peak, t + Math.max(0.31, dur - 0.35));
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  src.connect(f);
  f.connect(g);
  g.connect(out);
  src.start(t, rc.rng() * buf.duration);
  src.stop(t + dur + 0.05);
}

function noiseSrc(rc: RecipeCtx): AudioBufferSourceNode {
  const s = rc.ctx.createBufferSource();
  s.buffer = noiseBuffer(rc.ctx);
  s.loop = true;
  return s;
}

function tone(
  rc: RecipeCtx,
  out: AudioNode,
  o: {
    type?: OscillatorType;
    f0: number;
    f1?: number;
    tOff?: number; // start offset from rc.t
    dur: number;
    gain: number;
    attack?: number;
    lp?: number; // optional lowpass cutoff
    curve?: 'exp' | 'lin';
  },
): void {
  const t = rc.t + (o.tOff ?? 0);
  const osc = rc.ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.f0, t);
  if (o.f1 !== undefined) {
    if (o.curve === 'lin') osc.frequency.linearRampToValueAtTime(o.f1, t + o.dur);
    else osc.frequency.exponentialRampToValueAtTime(Math.max(o.f1, 1), t + o.dur);
  }
  let head: AudioNode = osc;
  if (o.lp) {
    const f = rc.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.lp;
    osc.connect(f);
    head = f;
  }
  const g = rc.ctx.createGain();
  const atk = Math.max(o.attack ?? 0.005, 0.004);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(o.gain, t + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  head.connect(g);
  g.connect(out);
  osc.start(t);
  osc.stop(t + o.dur + 0.05);
}

function noiseHit(
  rc: RecipeCtx,
  out: AudioNode,
  o: {
    type?: BiquadFilterType;
    f0: number;
    f1?: number;
    Q?: number;
    tOff?: number;
    dur: number;
    gain: number;
    attack?: number;
  },
): void {
  const t = rc.t + (o.tOff ?? 0);
  const src = noiseSrc(rc);
  const f = rc.ctx.createBiquadFilter();
  f.type = o.type ?? 'bandpass';
  f.Q.value = o.Q ?? 1;
  f.frequency.setValueAtTime(o.f0, t);
  if (o.f1 !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(o.f1, 10), t + o.dur);
  const g = rc.ctx.createGain();
  const atk = Math.max(o.attack ?? 0.005, 0.004);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(o.gain, t + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  src.connect(f);
  f.connect(g);
  g.connect(out);
  src.start(t, rc.rng() * 1.5);
  src.stop(t + o.dur + 0.05);
}

/** voice.musicBox (§6.2) — the game's signature timbre. */
function musicBox(rc: RecipeCtx, out: AudioNode, freq: number, vel: number, tOff = 0): void {
  const partials: Array<[number, number, number]> = [
    [1, 1, 1.1],
    [3.98, 0.35, 1.1 / 2],
    [9.24, 0.1, 1.1 / 3],
  ];
  for (const [mult, g0, tau] of partials) {
    const t = rc.t + tOff;
    const osc = rc.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq * mult;
    const g = rc.ctx.createGain();
    g.gain.setValueAtTime(vel * g0, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + tau * 3);
    osc.connect(g);
    g.connect(out);
    osc.start(t);
    osc.stop(t + tau * 3 + 0.05);
  }
  // tine pluck tick
  noiseHit(rc, out, { type: 'highpass', f0: 4000, tOff, dur: 0.012, gain: 0.02 * (vel / 0.12) });
}

/** voice.pad (§6.2) — two detuned triangles per note through an 800 Hz lowpass. */
function pad(rc: RecipeCtx, out: AudioNode, freqs: number[], gainScale = 1, tOff = 0): void {
  const t = rc.t + tOff;
  const f = rc.ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 800;
  const g = rc.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.1 * gainScale, t + 0.4);
  g.gain.setValueAtTime(0.1 * gainScale, t + 0.9);
  g.gain.linearRampToValueAtTime(0.0001, t + 0.9 + 1.6);
  f.connect(g);
  g.connect(out);
  for (const fr of freqs) {
    for (const det of [-4, 4]) {
      const osc = rc.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = fr;
      osc.detune.value = det;
      osc.connect(f);
      osc.start(t);
      osc.stop(t + 2.6);
    }
  }
}

// ---------------------------------------------------------------------------
// Species voiceprints (§2.2) — one recipe family, parameterized.
// Contented = Pet reaction · Happy = Treat/greeting/celebration vocal.
type VocalKind = 'contented' | 'happy' | 'greeting';
function vocal(rc: RecipeCtx, out: AudioNode, species: string, kind: VocalKind, gainScale = 1, tOff = 0): void {
  const r = rc.rng;
  const j = (amt: number) => 1 + (r() * 2 - 1) * amt; // jitter multiplier
  const at = (o: Parameters<typeof tone>[2]) => tone(rc, out, { ...o, tOff: (o.tOff ?? 0) + tOff, gain: o.gain * gainScale });
  switch (species) {
    case 'cat':
      if (kind === 'contented') return purr(rc, out, gainScale, tOff, 25, 300, 1);
      // mrrp — trill-chirp 520→880→640 with 28 Hz AM tail (§6.2.10)
      {
        const t = rc.t + tOff;
        const osc = rc.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(520 * j(0.02), t);
        osc.frequency.exponentialRampToValueAtTime(880, t + 0.09);
        osc.frequency.exponentialRampToValueAtTime(640, t + 0.3);
        const g = rc.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.14 * gainScale, t + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
        // trill on the tail: AM gain node between osc gain and out
        const trill = rc.ctx.createGain();
        trill.gain.value = 1;
        const lfo = rc.ctx.createOscillator();
        lfo.frequency.value = 28;
        const lfoG = rc.ctx.createGain();
        lfoG.gain.setValueAtTime(0, t);
        lfoG.gain.linearRampToValueAtTime(0.4, t + 0.2);
        lfo.connect(lfoG);
        lfoG.connect(trill.gain);
        osc.connect(g);
        g.connect(trill);
        trill.connect(out);
        osc.start(t);
        osc.stop(t + 0.4);
        lfo.start(t);
        lfo.stop(t + 0.4);
      }
      return;
    case 'dog': {
      // wuff — never a full bark (§6.2.11)
      const happy = kind !== 'contented';
      const mult = happy ? 1.15 : 1;
      at({ type: 'sine', f0: 420 * mult * j(0.02), f1: 180 * mult, dur: 0.12, gain: 0.16, attack: 0.005, lp: 900 });
      noiseHit(rc, out, { type: 'lowpass', f0: 900, tOff, dur: 0.06, gain: 0.08 * gainScale });
      if (kind === 'greeting') {
        at({ type: 'sine', f0: 420 * 1.12 * mult, f1: 200 * mult, tOff: 0.16, dur: 0.12, gain: 0.16 * 0.63, attack: 0.005, lp: 900 });
      }
      return;
    }
    case 'fox': {
      // yip — two quick chirps (§6.2.12); contented = one softer chirp
      const chirp = (off: number, g: number) => {
        at({ type: 'sine', f0: 950 * j(0.02), f1: 1450, tOff: off, dur: 0.04, gain: g, curve: 'lin' });
        at({ type: 'sine', f0: 1450, f1: 1100, tOff: off + 0.04, dur: 0.03, gain: g, curve: 'lin' });
      };
      chirp(0, 0.11);
      if (kind !== 'contented') chirp(0.13, 0.11 * 0.79);
      return;
    }
    case 'duck':
    case 'penguin': {
      // peep (§6.2.13) — sine, HF-capped, level-capped
      const base = species === 'duck' ? 2100 : 1900;
      const lpOut = rc.ctx.createBiquadFilter();
      lpOut.type = 'lowpass';
      lpOut.frequency.value = 4500;
      lpOut.connect(out);
      const peep = (off: number, g: number) =>
        tone(rc, lpOut, { type: 'sine', f0: base * j(0.02), f1: base * 0.85, tOff: off + tOff, dur: 0.09, gain: g * gainScale });
      peep(0, 0.1);
      if (kind === 'greeting') peep(0.13, 0.1 * 0.79);
      if (species === 'penguin' && kind === 'happy') {
        noiseHit(rc, out, { type: 'bandpass', f0: 300, Q: 1, tOff, dur: 0.03, gain: 0.04 * gainScale });
      }
      return;
    }
    case 'bunny':
    case 'hedgehog': {
      if (species === 'hedgehog' && kind === 'contented') return purr(rc, out, gainScale, tOff, 18, 240, 0.7);
      // squeak (§6.2.14) — deliberately the quietest vocal
      at({ type: 'sine', f0: 1400 * j(0.02), f1: 1800, dur: 0.06, gain: 0.07, curve: 'lin' });
      return;
    }
    case 'panda': {
      if (kind === 'greeting') {
        // bleat (§6.2.15 variant)
        const t = rc.t + tOff;
        const osc = rc.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220 * j(0.02), t);
        osc.frequency.exponentialRampToValueAtTime(180, t + 0.3);
        const vib = rc.ctx.createOscillator();
        vib.frequency.value = 12;
        const vibG = rc.ctx.createGain();
        vibG.gain.value = 6;
        vib.connect(vibG);
        vibG.connect(osc.frequency);
        const f = rc.ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 600;
        const g = rc.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.09 * gainScale, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
        osc.connect(f);
        f.connect(g);
        g.connect(out);
        osc.start(t);
        osc.stop(t + 0.38);
        vib.start(t);
        vib.stop(t + 0.38);
        return;
      }
      // huff (§6.2.15)
      noiseHit(rc, out, { type: 'lowpass', f0: 400, tOff, dur: 0.4, gain: 0.12 * gainScale, attack: 0.06 });
      at({ type: 'sine', f0: 160, dur: 0.4, gain: 0.06, attack: 0.06 });
      return;
    }
    case 'turtle': {
      // shell-tap knock — turtle's voice is a woodblock at −8 dB (§2.2)
      at({ type: 'sine', f0: 800 * j(0.02), f1: 500, dur: 0.08, gain: 0.13 * 0.4, attack: 0.004 });
      return;
    }
    default:
      return;
  }
}

/** vocal.purr (§6.2.9) — SYNTH FALLBACK ONLY since 2026-10-27. AM flutter
 * percept, NOT a 25 Hz fundamental (iPad speakers can't reproduce it).
 * lfoHz 25 / lp 300 for cat; hedgehog churr variant 18 Hz / 240 / ×0.7
 * duration. Amanda's ear-check DID hear "tiny motor" (2026-10-26), so the
 * recorded-purr fallback (§6.3) now plays first — see ensurePurr above. */
function purr(rc: RecipeCtx, out: AudioNode, gainScale = 1, tOff = 0, lfoHz = 25, lpHz = 300, durScale = 1): void {
  // §6.3 fallback, admitted 2026-10-27: Amanda's ear-check heard the synth
  // below as a tiny motor, so a live context plays the REAL recorded purr
  // (public domain, CREDITS.md) whenever it has loaded. The synth remains
  // only as the pre-load / offline-render fallback. lfoHz < 20 marks the
  // hedgehog churr variant (18 Hz in the synth's terms).
  if (purrState.buf) return recordedPurr(rc, out, purrState.buf, gainScale, tOff, durScale, lfoHz < 20);
  ensurePurr();
  const t = rc.t + tOff;
  const dur = (1.6 + rc.rng() * 1.0) * durScale; // 1.6–2.6 s
  const f = rc.ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = lpHz;
  const flutter = rc.ctx.createGain();
  flutter.gain.value = 0.575; // 0.15 floor ± 0.425 depth (§6.2.9)
  const lfo = rc.ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.setValueAtTime(lfoHz - 2, t);
  lfo.frequency.linearRampToValueAtTime(lfoHz + 2, t + dur * 0.7); // breath glide
  const lfoG = rc.ctx.createGain();
  lfoG.gain.value = 0.425;
  lfo.connect(lfoG);
  lfoG.connect(flutter.gain);
  const swell = rc.ctx.createGain();
  swell.gain.setValueAtTime(0.0001, t);
  swell.gain.linearRampToValueAtTime(0.12 * gainScale, t + 0.3);
  swell.gain.linearRampToValueAtTime(0.15 * gainScale, t + dur * 0.55); // breath swell
  swell.gain.linearRampToValueAtTime(0.0001, t + dur);
  const saw = rc.ctx.createOscillator();
  saw.type = 'sawtooth';
  saw.frequency.value = 55;
  const sin = rc.ctx.createOscillator();
  sin.type = 'sine';
  sin.frequency.value = 110;
  saw.connect(f);
  sin.connect(f);
  f.connect(flutter);
  flutter.connect(swell);
  swell.connect(out);
  saw.start(t);
  saw.stop(t + dur + 0.05);
  sin.start(t);
  sin.stop(t + dur + 0.05);
  lfo.start(t);
  lfo.stop(t + dur + 0.05);
}

/** care.munch (§6.2.4) — gated noise chews, per-species pattern. */
function munch(rc: RecipeCtx, out: AudioNode, species: string, tOff = 0, chewScale = 1): void {
  const table: Record<string, { chews: number; gate: number; crunch?: boolean; gain: number }> = {
    dog: { chews: 3, gate: 1, gain: 0.14 },
    cat: { chews: 3, gate: 1, gain: 0.14 },
    panda: { chews: 4, gate: 1, crunch: true, gain: 0.14 },
    turtle: { chews: 2, gate: 1.8, gain: 0.14 },
    duck: { chews: 4, gate: 0.6, gain: 0.14 },
    hedgehog: { chews: 3, gate: 1, gain: 0.14 },
    bunny: { chews: 2, gate: 1, gain: 0.09 },
    fox: { chews: 3, gate: 1, gain: 0.14 },
    penguin: { chews: 3, gate: 1, gain: 0.14 },
  };
  const p = table[species] ?? table.dog;
  const chews = Math.max(1, Math.round(p.chews * chewScale));
  let t = tOff;
  for (let i = 0; i < chews; i++) {
    const on = 0.09 * p.gate * (1 + (rc.rng() * 0.3 - 0.15));
    noiseHit(rc, out, { type: 'lowpass', f0: 700, tOff: t, dur: on, gain: p.gain, attack: 0.008 });
    tone(rc, out, { type: 'sine', f0: 140, tOff: t, dur: on, gain: 0.03, attack: 0.008 });
    if (p.crunch) {
      noiseHit(rc, out, { type: 'highpass', f0: 2500, tOff: t + 0.02, dur: 0.015, gain: 0.04 });
      noiseHit(rc, out, { type: 'highpass', f0: 2500, tOff: t + on * 0.6, dur: 0.015, gain: 0.04 });
    }
    t += (0.09 + 0.06) * p.gate * (1 + (rc.rng() * 0.3 - 0.15));
  }
}

/** Favourite-action sparkle (§1.2 row 28): two music-box notes on top. */
function sparkle(rc: RecipeCtx, out: AudioNode): void {
  musicBox(rc, out, 783.99, 0.05, 0);
  musicBox(rc, out, 1046.5, 0.045, 0.07);
}

// ---------------------------------------------------------------------------
// Recipes (§6.2, numbered as in the dive)
// ---------------------------------------------------------------------------
const HEART_LADDER = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51];

export const RECIPES: Record<string, Recipe> = {
  // 1 — ui.tap
  'ui.tap': {
    bus: 'ui',
    minGap: 0.05,
    dur: 0.12,
    fn: (rc, out, o) => {
      const j = 1 + (rc.rng() * 2 - 1) * 0.03;
      tone(rc, out, { type: 'triangle', f0: 620 * j, f1: 520 * j, dur: 0.07, gain: 0.18 * (o.gain ?? 1), curve: 'lin' });
      noiseHit(rc, out, { type: 'lowpass', f0: 2000, dur: 0.008, gain: 0.05 });
    },
  },
  // 2 — ui.open / ui.close
  'ui.open': {
    bus: 'ui',
    minGap: 0.07,
    dur: 0.3,
    fn: (rc, out) => {
      noiseHit(rc, out, { type: 'bandpass', f0: 900, f1: 1800, Q: 1.2, dur: 0.18, gain: 0.12, attack: 0.01 });
      musicBox(rc, out, 659.25, 0.06, 0.02);
    },
  },
  'ui.close': {
    bus: 'ui',
    minGap: 0.07,
    dur: 0.3,
    fn: (rc, out) => {
      noiseHit(rc, out, { type: 'bandpass', f0: 1800, f1: 900, Q: 1.2, dur: 0.18, gain: 0.1, attack: 0.01 });
      musicBox(rc, out, 523.25, 0.05, 0.02);
    },
  },
  // 3 + 4 — care.feed (+ munch scheduled inside)
  'care.feed': {
    bus: 'animal',
    minGap: 0.06,
    dur: 0.9,
    fn: (rc, out, o) => {
      const ticks = 6;
      for (let i = 0; i < ticks; i++) {
        noiseHit(rc, out, { type: 'highpass', f0: 3000, tOff: i * (0.035 + rc.rng() * 0.02), dur: 0.012, gain: 0.06 });
      }
      tone(rc, out, { type: 'sine', f0: 1180, tOff: 0.3, dur: 0.09, gain: 0.1 });
      tone(rc, out, { type: 'sine', f0: 1560, tOff: 0.3, dur: 0.09, gain: 0.05 });
      munch(rc, out, o.species ?? 'dog', 0.45);
    },
  },
  // 5 — care.pet (+ species contented vocal; vocal thins under mashing, §5.4.3)
  'care.pet': {
    bus: 'animal',
    minGap: 0.06,
    dur: 1.2,
    fn: (rc, out, o) => {
      noiseHit(rc, out, { type: 'bandpass', f0: 400, f1: 700, Q: 1, dur: 0.35, gain: 0.1, attack: 0.03 });
      if (o.favourite) noiseHit(rc, out, { type: 'bandpass', f0: 400, f1: 700, Q: 1, tOff: 0.18, dur: 0.35, gain: 0.07, attack: 0.03 });
      if (shouldVocal()) vocal(rc, out, o.species ?? 'cat', 'contented', 1, 0.25);
      if (o.favourite) sparkle(rc, out);
    },
  },
  // 6 — care.clean (bubble pops + closing sparkle)
  'care.clean': {
    bus: 'animal',
    minGap: 0.06,
    dur: 0.9,
    fn: (rc, out, o) => {
      let n = 7 + Math.floor(rc.rng() * 5) - 2;
      if (o.species === 'duck') n += 2;
      let t = 0;
      for (let i = 0; i < n; i++) {
        const f0 = 300 + rc.rng() * 600;
        tone(rc, out, { type: 'sine', f0, f1: f0 * 1.8, tOff: t, dur: 0.06, gain: 0.09, curve: 'lin' });
        t += 0.03 + rc.rng() * 0.05;
      }
      musicBox(rc, out, 1318.51, 0.05, t + 0.1);
      musicBox(rc, out, 1567.98, 0.04, t + 0.1);
      if (o.favourite) sparkle(rc, out);
    },
  },
  // 7 — care.play (shuffle-bag bounce / squeak)
  'care.play': {
    bus: 'animal',
    minGap: 0.06,
    dur: 0.4,
    fn: (rc, out, o) => {
      const variant = nextFromBag('play', 2);
      if (variant === 0) {
        tone(rc, out, { type: 'sine', f0: 480, f1: 160, dur: 0.16, gain: 0.14 });
        tone(rc, out, { type: 'sine', f0: 90, tOff: 0.15, dur: 0.06, gain: 0.05 });
      } else {
        tone(rc, out, { type: 'sine', f0: 1250, f1: 1500, dur: 0.045, gain: 0.07, curve: 'lin' });
        tone(rc, out, { type: 'sine', f0: 1250, f1: 1500, tOff: 0.1, dur: 0.045, gain: 0.07, curve: 'lin' });
      }
      if (o.favourite) {
        if (shouldVocal()) vocal(rc, out, o.species ?? 'dog', 'happy', 0.5, 0.05);
        sparkle(rc, out);
      }
    },
  },
  // 8 — care.treat (crinkle + happy vocal + short munch)
  'care.treat': {
    bus: 'animal',
    minGap: 0.06,
    dur: 0.9,
    fn: (rc, out, o) => {
      const gains = [0.08, 0.11, 0.07];
      let t = 0;
      for (const g of gains) {
        noiseHit(rc, out, { type: 'highpass', f0: 2500, tOff: t, dur: 0.02, gain: g });
        t += 0.04 + rc.rng() * 0.03;
      }
      if (shouldVocal()) vocal(rc, out, o.species ?? 'dog', 'happy', 1, t + 0.02);
      munch(rc, out, o.species ?? 'dog', t + 0.3, 0.7);
      if (o.favourite) sparkle(rc, out);
    },
  },
  // 16 — heart.fill[n] (exact pitches — NO jitter, §5.4.5)
  'heart.fill': {
    bus: 'celeb',
    minGap: 0.05,
    dur: 1.4,
    fn: (rc, out, o) => {
      const idx = Math.min(7, Math.max(0, o.noteIndex ?? 0));
      const f = HEART_LADDER[idx];
      musicBox(rc, out, f, 0.12);
      tone(rc, out, { type: 'sine', f0: f / 2, dur: 0.5, gain: 0.05, attack: 0.01 });
      if (o.favourite) musicBox(rc, out, f * 2, 0.05, 0.02); // bonus-heart shimmer
    },
  },
  // 17 — coin.earn (throttled to the counter tick by minGap 0.4) + cascade
  'coin.earn': {
    bus: 'ui',
    minGap: 0.4,
    dur: 0.25,
    fn: (rc, out) => {
      const j = 1 + (rc.rng() * 2 - 1) * 0.02;
      tone(rc, out, { type: 'triangle', f0: 1175 * j, dur: 0.05, gain: 0.08, lp: 5000 });
      tone(rc, out, { type: 'triangle', f0: 1568 * j, tOff: 0.05, dur: 0.12, gain: 0.08, lp: 5000 });
    },
  },
  'coin.cascade': {
    bus: 'celeb',
    minGap: 0.3,
    dur: 1.2,
    fn: (rc, out) => {
      const notes = [880.0, 783.99, 659.25, 587.33, 523.25];
      notes.forEach((f, i) => musicBox(rc, out, f, 0.1 - i * 0.0125, i * 0.055));
    },
  },
  // 18 — shop.buy
  'shop.buy': {
    bus: 'ui',
    minGap: 0.07,
    dur: 0.4,
    fn: (rc, out) => {
      tone(rc, out, { type: 'sine', f0: 800, f1: 500, dur: 0.06, gain: 0.13 });
      noiseHit(rc, out, { type: 'lowpass', f0: 2000, dur: 0.01, gain: 0.06 });
      const j = 1 + (rc.rng() * 2 - 1) * 0.02;
      tone(rc, out, { type: 'triangle', f0: 1175 * j, tOff: 0.02, dur: 0.05, gain: 0.06, lp: 5000 });
      tone(rc, out, { type: 'triangle', f0: 1568 * j, tOff: 0.07, dur: 0.12, gain: 0.06, lp: 5000 });
    },
  },
  // 19 — shop.equip
  'shop.equip': {
    bus: 'animal',
    minGap: 0.07,
    dur: 0.6,
    fn: (rc, out, o) => {
      noiseHit(rc, out, { type: 'bandpass', f0: 500, f1: 750, Q: 1, dur: 0.22, gain: 0.1, attack: 0.02 });
      musicBox(rc, out, 783.99, 0.06, 0.08);
      musicBox(rc, out, 1046.5, 0.05, 0.16);
      vocal(rc, out, o.species ?? 'dog', 'happy', 0.4, 0.1);
    },
  },
  // 20 — shop.notyet (a warm shrug — there is no error sound in this game)
  'shop.notyet': {
    bus: 'ui',
    minGap: 0.15,
    dur: 0.35,
    fn: (rc, out) => {
      tone(rc, out, { type: 'triangle', f0: 392, dur: 0.14, gain: 0.09, attack: 0.01, curve: 'lin' });
      tone(rc, out, { type: 'triangle', f0: 330, tOff: 0.11, dur: 0.16, gain: 0.09, attack: 0.01, curve: 'lin' });
    },
  },
  // 21 — arrive
  arrive: {
    bus: 'celeb',
    minGap: 0.3,
    dur: 1.2,
    fn: (rc, out, o) => {
      noiseHit(rc, out, { type: 'bandpass', f0: 400, Q: 1, dur: 0.3, gain: 0.07, attack: 0.03 });
      musicBox(rc, out, 783.99, 0.1, 0);
      musicBox(rc, out, 1046.5, 0.1, 0.14);
      vocal(rc, out, o.species ?? 'dog', 'greeting', 1, 0.35);
    },
  },
  // 22 — celebrate.adoption (arpeggio + pad + sparkles + happy vocal; the +30
  // cascade is coin.cascade, fired at pick time). Perfect add-on is separate.
  'celebrate.adoption': {
    bus: 'celeb',
    minGap: 0.5,
    dur: 2.4,
    fn: (rc, out, o) => {
      const notes = [523.25, 659.25, 783.99, 880.0, 1046.5];
      notes.forEach((f, i) => musicBox(rc, out, f, 0.13, i * 0.11));
      pad(rc, out, [261.63, 392.0], 1, 0);
      for (const off of [0.5, 0.75, 1.0]) {
        const f0 = 1200 + rc.rng() * 600;
        tone(rc, out, { type: 'sine', f0, f1: f0 * 1.8, tOff: off, dur: 0.06, gain: 0.05, curve: 'lin' });
      }
      vocal(rc, out, o.species ?? 'dog', 'happy', 1, 0.3);
    },
  },
  'celebrate.perfect': {
    bus: 'celeb',
    minGap: 0.5,
    dur: 2.0,
    fn: (rc, out) => {
      musicBox(rc, out, 1318.51, 0.09, 0);
      for (const off of [0.1, 0.35, 0.6]) {
        const f0 = 1400 + rc.rng() * 600;
        tone(rc, out, { type: 'sine', f0, f1: f0 * 1.8, tOff: off, dur: 0.06, gain: 0.07, curve: 'lin' });
      }
      pad(rc, out, [329.63], 0.8, 0.65);
    },
  },
  // 23 — album.open (ui.open + the album motif: story place sounds like one)
  'album.open': {
    bus: 'ui',
    minGap: 0.1,
    dur: 0.8,
    fn: (rc, out) => {
      noiseHit(rc, out, { type: 'bandpass', f0: 900, f1: 1800, Q: 1.2, dur: 0.18, gain: 0.12, attack: 0.01 });
      musicBox(rc, out, 523.25, 0.09, 0.02);
      musicBox(rc, out, 783.99, 0.09, 0.18);
      musicBox(rc, out, 659.25, 0.09, 0.34);
    },
  },
  // 24 — visit.greet (greeting vocal + one soft pad note in the home's key)
  'visit.greet': {
    bus: 'animal',
    minGap: 0.1,
    dur: 1.6,
    fn: (rc, out, o) => {
      vocal(rc, out, o.species ?? 'dog', 'greeting', 1, 0);
      pad(rc, out, [o.homeRoot ?? 261.63], 0.7, 0.1);
    },
  },
};

// --- shuffle bags (§5.4.2) + vocal thinning (§5.4.3) -----------------------
const bags = new Map<string, number[]>();
function nextFromBag(key: string, size: number): number {
  let bag = bags.get(key);
  if (!bag || bag.length === 0) {
    bag = Array.from({ length: size }, (_, i) => i);
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    bags.set(key, bag);
  }
  return bag.pop()!;
}

let vocalWindow: number[] = [];
let vocalSkip = 0;
function shouldVocal(): boolean {
  const now = performance.now();
  vocalWindow = vocalWindow.filter((t) => now - t < 1200);
  vocalWindow.push(now);
  const rate = vocalWindow.length;
  const every = rate >= 7 ? 3 : rate >= 4 ? 2 : 1;
  if (every === 1) return true;
  vocalSkip += 1;
  return vocalSkip % every === 0;
}

// ---------------------------------------------------------------------------
// The engine (§3.4) — one context, master → compressor → destination.
// ---------------------------------------------------------------------------
class Engine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buses = new Map<BusName, GainNode>();
  private unlocked = false;
  private prefs: AudioPrefs = { ...DEFAULT_AUDIO_PREFS };
  private onPrefs: (p: AudioPrefs) => void = () => {};
  private lastPlay = new Map<string, number>();
  private voices = new Set<{ node: GainNode; started: number }>();
  private rng: () => number = mulberry32(0xa0d10);

  loadPrefs(p: AudioPrefs, seed?: number): void {
    this.prefs = { ...p };
    if (typeof seed === 'number') this.rng = mulberry32((seed ^ 0xa0d10) >>> 0);
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.prefs.muted ? 0 : this.prefs.volume, this.ctx.currentTime, 0.03);
    }
  }

  setOnPrefs(cb: (p: AudioPrefs) => void): void {
    this.onPrefs = cb;
  }

  getPrefs(): AudioPrefs {
    return { ...this.prefs };
  }

  private init(): void {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 24;
    comp.ratio.value = 12;
    comp.attack.value = 0.004;
    comp.release.value = 0.24;
    this.master = this.ctx.createGain();
    this.master.gain.value = this.prefs.muted ? 0 : this.prefs.volume;
    this.master.connect(comp);
    comp.connect(this.ctx.destination);
    (Object.keys(BUS_GAIN) as BusName[]).forEach((name) => {
      const node = this.ctx!.createGain();
      node.gain.value = BUS_GAIN[name];
      node.connect(this.master!);
      this.buses.set(name, node);
    });
    // The recorded purr (§6.3) starts loading at module load; this is just
    // a belt-and-braces re-kick in case that attempt was interrupted.
    ensurePurr();
  }

  /** Call from EVERY pointerdown (capture phase). Latches internally. Sets the
   * iOS audio session on the first tap or it may be ignored (§3.3.2). */
  unlock(): void {
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    if (nav.audioSession) {
      try {
        nav.audioSession.type = 'playback';
      } catch {
        /* older iOS — ignore */
      }
    }
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state !== 'running') void this.ctx.resume();
    if (!this.unlocked && this.ctx && this.master) {
      this.unlocked = true;
      // 1-frame silent buffer: the classic iOS warm-up (§3.4 silentPing)
      const b = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
      const s = this.ctx.createBufferSource();
      s.buffer = b;
      s.connect(this.master);
      s.start(0);
    }
  }

  isUnlocked(): boolean {
    return this.unlocked;
  }

  ctxState(): string {
    return this.ctx ? this.ctx.state : 'none';
  }

  play(id: string, opts: PlayOpts = {}): void {
    if (!this.unlocked || !this.ctx || !this.master || this.prefs.muted) return;
    const recipe = RECIPES[id];
    if (!recipe) return;
    const now = this.ctx.currentTime;
    if (now - (this.lastPlay.get(id) ?? -9) < (recipe.minGap ?? 0.07)) return;
    if (this.voices.size >= 8) {
      // steal the oldest voice (§3.4 voice cap)
      const oldest = [...this.voices].sort((a, b) => a.started - b.started)[0];
      if (oldest) {
        try {
          oldest.node.disconnect();
        } catch {
          /* already gone */
        }
        this.voices.delete(oldest);
      }
    }
    this.lastPlay.set(id, now);
    const bus = this.buses.get(recipe.bus);
    if (!bus) return;
    const out = this.ctx.createGain();
    out.gain.value = opts.gain ?? 1;
    out.connect(bus);
    const voice = { node: out, started: now };
    this.voices.add(voice);
    const rc: RecipeCtx = { ctx: this.ctx, t: now + 0.01 + (opts.delay ?? 0), rng: this.rng };
    try {
      recipe.fn(rc, out, opts);
    } catch {
      /* a recipe bug must never take the game down */
    }
    window.setTimeout(() => this.voices.delete(voice), (recipe.dur + (opts.delay ?? 0)) * 1000 + 300);
  }

  duck(busName: BusName, depthDb: number, attackS = 0.08, releaseS = 0.6): void {
    if (!this.ctx) return;
    const bus = this.buses.get(busName);
    if (!bus) return;
    const g = bus.gain;
    const t = this.ctx.currentTime;
    const base = BUS_GAIN[busName];
    const ducked = base * Math.pow(10, depthDb / 20);
    g.setTargetAtTime(ducked, t, attackS / 3);
    g.setTargetAtTime(base, t + attackS + 0.15, releaseS / 3);
  }

  setMuted(m: boolean): void {
    this.prefs = { ...this.prefs, muted: m };
    if (this.master && this.ctx) {
      // 30 ms ramp — fast, but click-free (§5.5.2)
      this.master.gain.setTargetAtTime(m ? 0 : this.prefs.volume, this.ctx.currentTime, 0.03);
    }
    this.onPrefs(this.getPrefs());
  }

  setVolume(v: number): void {
    this.prefs = { ...this.prefs, volume: Math.min(1, Math.max(0, v)) };
    if (this.master && this.ctx && !this.prefs.muted) {
      this.master.gain.setTargetAtTime(this.prefs.volume, this.ctx.currentTime, 0.03);
    }
    this.onPrefs(this.getPrefs());
  }

  /** QA/lab: render a recipe in an OfflineAudioContext and report stats (§7.2.1). */
  async renderStats(id: string, opts: PlayOpts = {}): Promise<{ peak: number; duration: number; headRms: number; tailRms: number } | null> {
    const recipe = RECIPES[id];
    if (!recipe) return null;
    const sr = 44100;
    const dur = recipe.dur + 0.4;
    const off = new OfflineAudioContext(1, Math.ceil(sr * dur), sr);
    const out = off.createGain();
    out.gain.value = BUS_GAIN[recipe.bus];
    out.connect(off.destination);
    const rc: RecipeCtx = { ctx: off, t: 0.05, rng: mulberry32(1234) };
    recipe.fn(rc, out, opts);
    const buf = await off.startRendering();
    const d = buf.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
    const rms = (from: number, to: number) => {
      let s = 0;
      let n = 0;
      for (let i = from; i < to && i < d.length; i++) {
        s += d[i] * d[i];
        n++;
      }
      return n ? Math.sqrt(s / n) : 0;
    };
    const head = Math.floor(sr * 0.005);
    return { peak, duration: dur, headRms: rms(0, head), tailRms: rms(d.length - head, d.length) };
  }
}

export const Snd = new Engine();
export const RECIPE_IDS = Object.keys(RECIPES);
