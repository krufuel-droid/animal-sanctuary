import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type { SpeciesId, TraitId } from '../save/schema';
import { TAG_LABELS, type Adopter } from './adopters';
import { AnimalSvg, type SleepState } from './animals';
import { CARE_ACTIONS, type CareActionId } from './care';
import { useIdle } from './idle';
import { TRAITS } from './traits';

// Shared visual pieces: the stage (animal + bubble + floats + reactions),
// adopter medallions and cards, home scenes, trait chips.

/* ---------------- Trait chip ---------------- */

export function TraitChip({
  traitId,
  size = 'md',
}: {
  traitId: TraitId | string | null;
  size?: 'md' | 'sm';
}) {
  if (!traitId || !(traitId in TRAITS)) return null;
  const trait = TRAITS[traitId as TraitId];
  const loves = CARE_ACTIONS[trait.loves];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-200 font-semibold text-amber-900 ${
        size === 'md' ? 'px-2.5 py-1 text-sm' : 'px-2 py-0.5 text-xs'
      }`}
    >
      <span aria-hidden>{trait.icon}</span> {trait.name}
      <span className="text-amber-700 font-normal">
        · Loves: <span aria-hidden>{loves.icon}</span>
      </span>
    </span>
  );
}

/* ---------------- Medallion (§B.3: face = data, not new drawings) -------- */

export function Medallion({ adopter, size = 52 }: { adopter: Adopter; size?: number }) {
  const m = adopter.medallion;
  return (
    <svg width={size} height={size} viewBox="0 0 52 52" role="img" aria-label={adopter.name} className="shrink-0">
      <circle cx={26} cy={26} r={25} fill="#fdf3e0" />
      <circle cx={26} cy={28} r={16.5} fill={m.skin} />
      {m.hairStyle === 'bun' && <circle cx={26} cy={9.5} r={6} fill={m.hair} />}
      {m.hairStyle === 'scarf' ? (
        <path d="M 9 27 A 17 17 0 0 1 43 27 L 43 20 A 17 13 0 0 0 9 20 Z" fill="#7fb069" />
      ) : m.hairStyle === 'cap' ? (
        <>
          <path d="M 10 24 A 16 13 0 0 1 42 24 Z" fill="#c9553e" />
          <rect x={6} y={22.6} width={40} height={3.6} rx={1.8} fill="#a33f2c" />
        </>
      ) : (
        <path
          d={
            m.hairStyle === 'bob'
              ? 'M 9.5 30 A 16.5 16.5 0 0 1 42.5 30 L 42.5 36 A 4 4 0 0 1 36 33 L 36 22 A 10 8 0 0 0 16 22 L 16 33 A 4 4 0 0 1 9.5 36 Z'
              : m.hairStyle === 'spiky'
                ? 'M 11 24 L 14 12 L 19 19 L 23 10 L 27 18 L 32 11 L 35 19 L 40 14 L 41 24 A 15 10 0 0 0 11 24 Z'
                : 'M 10.5 25 A 15.5 13 0 0 1 41.5 25 A 15.5 9 0 0 0 10.5 25 Z'
          }
          fill={m.hair}
        />
      )}
      <circle cx={20.5} cy={28} r={1.9} fill="#33302e" />
      <circle cx={31.5} cy={28} r={1.9} fill="#33302e" />
      <path d="M 21.5 34.5 Q 26 38 30.5 34.5" stroke="#33302e" strokeWidth={1.9} fill="none" strokeLinecap="round" />
      <circle cx={15.8} cy={33} r={2.9} fill="#f5a8a0" opacity={0.6} />
      <circle cx={36.2} cy={33} r={2.9} fill="#f5a8a0" opacity={0.6} />
      <text x={41} y={47} fontSize={12} aria-hidden>
        {m.prop}
      </text>
    </svg>
  );
}

/* ---------------- Home scenes (§B.3 themes) ---------------- */

export const HOME_THEMES: Record<string, { sky: string; props: string[]; label: string }> = {
  garden: { sky: 'from-sky-200 to-green-100', props: ['🌻', '🦋', '🌷'], label: 'garden' },
  farm: { sky: 'from-amber-100 to-orange-50', props: ['🚜', '🌾', '🏠'], label: 'farm' },
  backyard: { sky: 'from-sky-200 to-lime-100', props: ['⚽', '🌳', '🧺'], label: 'backyard' },
  bakery: { sky: 'from-orange-100 to-amber-50', props: ['🍞', '🥐', '☕'], label: 'bakery' },
  library: { sky: 'from-stone-200 to-amber-50', props: ['📚', '🛋️', '🪟'], label: 'library' },
  studio: { sky: 'from-rose-100 to-amber-50', props: ['🎨', '🖼️', '✏️'], label: 'studio' },
  lake: { sky: 'from-sky-300 to-cyan-100', props: ['🎣', '🌊', '🛶'], label: 'lake' },
  park: { sky: 'from-green-100 to-sky-100', props: ['🌳', '📖', '🧺'], label: 'park' },
  balcony: { sky: 'from-amber-100 to-rose-100', props: ['🎵', '🎶', '🌤️'], label: 'balcony' },
  meadow: { sky: 'from-lime-100 to-yellow-50', props: ['🐝', '🌼', '🍯'], label: 'meadow' },
  hilltop: { sky: 'from-indigo-400 to-indigo-200', props: ['🔭', '⭐', '🌙'], label: 'hilltop' },
  'pets-house': { sky: 'from-teal-100 to-amber-50', props: ['🐾', '🐱', '🐠'], label: 'happy house' },
  cozy: { sky: 'from-amber-100 to-rose-50', props: ['🏠', '💛', '🛋️'], label: 'cozy home' },
};

export function HomeScene({ theme, big }: { theme: string; big?: boolean }) {
  const t = HOME_THEMES[theme] ?? HOME_THEMES.cozy;
  return (
    <div
      className={`relative overflow-hidden rounded-xl bg-gradient-to-b ${t.sky} ${big ? 'h-28' : 'h-20'}`}
      aria-hidden
    >
      <span className={`absolute left-3 bottom-1 ${big ? 'text-5xl' : 'text-4xl'}`}>{t.props[0]}</span>
      <span className={`absolute right-4 top-1.5 ${big ? 'text-3xl' : 'text-2xl'}`}>{t.props[1]}</span>
      <span className={`absolute right-10 bottom-1 ${big ? 'text-3xl' : 'text-2xl'}`}>{t.props[2]}</span>
      <svg className="absolute left-1/2 -translate-x-1/2 bottom-0" width={big ? 92 : 68} height={big ? 62 : 46} viewBox="0 0 92 62">
        <path d="M 8 30 L 46 6 L 84 30 Z" fill="#b5654a" />
        <rect x={16} y={29} width={60} height={31} rx={2} fill="#fdf6e9" />
        <rect x={39} y={40} width={14} height={20} rx={2} fill="#8a5a3a" />
        <rect x={22} y={36} width={11} height={10} rx={1.5} fill="#a7c7e7" />
        <rect x={59} y={36} width={11} height={10} rx={1.5} fill="#a7c7e7" />
      </svg>
    </div>
  );
}

/* ---------------- Adopter card (§B.7 layout) ---------------- */

export function AdopterCard({
  adopter,
  isPick,
  hint,
  onPick,
}: {
  adopter: Adopter;
  isPick: boolean;
  hint: string | null;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="relative text-left w-full rounded-2xl bg-white border-2 border-amber-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition p-3 animate-pop-in"
    >
      {isPick && (
        <span className="absolute -top-3 left-3 z-10 rounded-full bg-amber-400 text-amber-950 text-xs font-bold px-2.5 py-1 shadow">
          ✨ Sanctuary's Pick
        </span>
      )}
      <HomeScene theme={adopter.homeTheme} />
      <span className="flex items-center gap-2.5 mt-2.5">
        <Medallion adopter={adopter} />
        <span>
          <span className="block font-bold text-lg leading-tight">{adopter.name}</span>
          <span className="block text-sm text-stone-600 leading-snug">{adopter.home}</span>
        </span>
      </span>
      <span className="flex flex-wrap gap-1.5 mt-2.5">
        {adopter.tags.map((tag) => (
          <span key={tag} className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-700">
            {TAG_LABELS[tag].icon} {TAG_LABELS[tag].label}
          </span>
        ))}
      </span>
      {hint && <span className="block mt-2 text-sm font-semibold text-amber-700">{hint}</span>}
    </button>
  );
}

/* ---------------- The stage ---------------- */

export interface StageHandle {
  say: (line: string) => void;
  floatEmojis: (emojis: string[]) => void;
  react: (action: CareActionId) => void;
  wake: () => void;
}

interface Floaty {
  id: number;
  emoji: string;
  x: number;
}

let floatSeq = 1;

export const AnimalStage = forwardRef<
  StageHandle,
  {
    species: SpeciesId;
    outfit?: string | null;
    instanceId: string;
    traitId: TraitId | string | null;
    idle: boolean;
    initialLine?: string | null;
    /** Phase 2: the yard sim's sleep pose, when it is driving this stage. */
    sleepOverride?: SleepState | null;
    /** Yard placement: flip the speech bubble under the animal when it is
     *  near the yard's top edge (an above-bubble would clip off-screen),
     *  and anchor it to a side when the animal hugs a yard edge, so the
     *  words never cover the animal or spill out of the yard. */
    bubbleBelow?: boolean;
    bubbleAnchor?: 'center' | 'left' | 'right';
  }
>(function AnimalStage({ species, outfit, instanceId, traitId, idle, initialLine, sleepOverride, bubbleBelow, bubbleAnchor }, ref) {
  const svgRef = useRef<HTMLDivElement | null>(null);
  const idleCtl = useIdle(svgRef, {
    species,
    instanceId,
    traitId: traitId && traitId in TRAITS ? (traitId as TraitId) : null,
    enabled: idle,
    sleepOverride: sleepOverride ?? null,
  });
  const [bubble, setBubble] = useState<{ text: string; key: number } | null>(
    initialLine ? { text: initialLine, key: 0 } : null,
  );
  const [floats, setFloats] = useState<Floaty[]>([]);
  const bubbleTimer = useRef<number | undefined>(undefined);
  const greetingTimer = useRef<number | undefined>(undefined);
  const bubbleSeq = useRef(0);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const bounceRef = useRef<HTMLDivElement | null>(null);

  // Pop-in replayed via WAAPI on each new line (no key remounts anywhere in
  // this component — simultaneous key changes on siblings made React drop a
  // DOM removal and ghost the previous bubble; found at the P1.3 parity gate).
  useEffect(() => {
    if (bubble && bubbleRef.current) {
      try {
        bubbleRef.current.animate(
          [
            { transform: 'scale(0.7)', opacity: 0 },
            { transform: 'scale(1.05)', opacity: 1, offset: 0.6 },
            { transform: 'scale(1)', opacity: 1 },
          ],
          { duration: 180, easing: 'ease-out' },
        );
      } catch { /* animation is decoration */ }
    }
  }, [bubble]);

  // The trait line is a GREETING, not a permanent sign: it shows when the
  // animal arrives, then fades. In the multi-resident yard, four standing
  // trait bubbles at once walled the animals in words (Amanda, Oct 29:
  // "The words are covering the animals"). After the greeting, bubbles
  // appear only when the animal actually says something, via say().
  useEffect(() => {
    if (!initialLine) return;
    greetingTimer.current = window.setTimeout(() => {
      setBubble((b) => (b && b.key === 0 ? null : b));
    }, 4500);
    return () => window.clearTimeout(greetingTimer.current);
    // Mount-only: the greeting belongs to this animal's arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(ref, () => ({
    say: (line: string) => {
      window.clearTimeout(bubbleTimer.current);
      window.clearTimeout(greetingTimer.current);
      bubbleSeq.current += 1;
      setBubble({ text: line, key: bubbleSeq.current });
      bubbleTimer.current = window.setTimeout(() => setBubble(null), 3600);
    },
    floatEmojis: (emojis: string[]) => {
      const fresh = emojis.map((emoji, i) => ({
        id: floatSeq++,
        emoji,
        x: 38 + i * 12 + Math.random() * 6,
      }));
      setFloats((f) => [...f.slice(-5), ...fresh]);
      window.setTimeout(() => {
        setFloats((f) => f.filter((x) => !fresh.includes(x)));
      }, 1100);
    },
    react: (action: CareActionId) => {
      idleCtl.react(action);
      try {
        bounceRef.current?.animate(
          [
            { transform: 'translateY(0) scale(1, 1)' },
            { transform: 'translateY(-10px) scale(0.97, 1.04)', offset: 0.35 },
            { transform: 'translateY(0) scale(1.02, 0.97)', offset: 0.65 },
            { transform: 'translateY(0) scale(1, 1)' },
          ],
          { duration: 450, easing: 'ease-out' },
        );
      } catch { /* animation is decoration */ }
    },
    wake: () => idleCtl.wake(),
  }));

  return (
    <div className="relative">
      {bubble && (
        <div
          ref={bubbleRef}
          className={`absolute z-20 w-max max-w-[150%] pointer-events-none rounded-2xl bg-white border border-amber-200 shadow px-3.5 py-2 text-[15px] font-medium text-center ${
            bubbleBelow ? 'top-[calc(100%-2px)]' : 'bottom-[calc(100%-2px)]'
          } ${
            bubbleAnchor === 'left'
              ? 'left-0'
              : bubbleAnchor === 'right'
                ? 'right-0'
                : 'left-1/2 -translate-x-1/2'
          }`}
          role="status"
        >
          {bubble.text}
          <span
            className={`absolute w-3.5 h-3.5 bg-white border-amber-200 rotate-45 ${
              bubbleBelow ? '-top-[7px] border-t border-l' : '-bottom-[7px] border-b border-r'
            } ${
              bubbleAnchor === 'left'
                ? 'left-[30%]'
                : bubbleAnchor === 'right'
                  ? 'left-[70%]'
                  : 'left-1/2 -translate-x-1/2'
            }`}
          />
        </div>
      )}
      <div ref={bounceRef}>
        <div ref={svgRef}>
          <AnimalSvg
            species={species}
            outfit={outfit}
            idle={idle}
            sleep={idle ? idleCtl.sleep : ('awake' as SleepState)}
            idleVars={idleCtl.vars}
            className="w-full h-auto"
            title={species}
          />
        </div>
      </div>
      {floats.map((f) => (
        <span
          key={f.id}
          className="absolute top-10 text-2xl pointer-events-none animate-float-up"
          style={{ left: `${f.x}%` }}
          aria-hidden
        >
          {f.emoji}
        </span>
      ))}
    </div>
  );
});
