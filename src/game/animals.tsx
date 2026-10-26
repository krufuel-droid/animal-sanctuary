import type { CSSProperties, ReactNode } from 'react';
import type { SpeciesId } from '../save/schema';

// Animal art + rig for the repo build (PHASE1-DEEP-DIVE D3: DOM/SVG port).
// Art is re-created for the repo in the game's flat, round, cozy style.
// Rig law (PHASE0-DEEP-DIVE §B.2 + CODE-AUDIT F4–F6):
//  - every animal: a-rig → a-tail, a-pose → a-body, a-head-pos → a-head;
//  - animated groups carry NO transform attributes (leaf geometry only),
//    so CSS/WAAPI transforms never clobber a positioning transform;
//  - head-worn outfits render INSIDE a-head; the scarf stays body-level;
//  - ground shadow + flowers live outside the rig and never move.

export const OUTFITS = [
  { id: 'bow', name: 'Pretty Bow', price: 10, icon: '🎀' },
  { id: 'crown', name: 'Flower Crown', price: 15, icon: '🌸' },
  { id: 'scarf', name: 'Cozy Scarf', price: 20, icon: '🧣' },
  { id: 'glasses', name: 'Star Glasses', price: 25, icon: '⭐' },
  { id: 'tophat', name: 'Tiny Top Hat', price: 30, icon: '🎩' },
] as const;
export type OutfitId = (typeof OUTFITS)[number]['id'];

export type SleepState = 'awake' | 'sleepy' | 'asleep';

interface ArtDef {
  headPos: [number, number];
  headR: number;
  /** Hat/crown/bow anchor in head-local coords. */
  hatAt: [number, number];
  /** Scarf anchor in rig coords (body-level). */
  scarfAt: [number, number];
  tail: ReactNode;
  body: ReactNode;
  head: ReactNode;
}

const EYES = (
  <>
    <g className="a-eyes-open">
      <circle cx={-12} cy={-3} r={4.6} fill="#33302e" />
      <circle cx={13} cy={-3} r={4.6} fill="#33302e" />
      <circle cx={-13.5} cy={-4.8} r={1.6} fill="#fff" />
      <circle cx={11.5} cy={-4.8} r={1.6} fill="#fff" />
    </g>
    <g className="a-eyes-closed">
      <path d="M -17 -3 Q -12 2 -7 -3" stroke="#33302e" strokeWidth={2.4} fill="none" strokeLinecap="round" />
      <path d="M 8 -3 Q 13 2 18 -3" stroke="#33302e" strokeWidth={2.4} fill="none" strokeLinecap="round" />
    </g>
    <circle cx={-21} cy={6} r={5.5} fill="#f5a8a0" opacity={0.55} />
    <circle cx={22} cy={6} r={5.5} fill="#f5a8a0" opacity={0.55} />
  </>
);

function outfitHead(id: OutfitId, hatAt: [number, number]) {
  const [x, y] = hatAt;
  switch (id) {
    case 'bow':
      return (
        <g className="a-outfit" transform={`translate(${x} ${y})`}>
          <path d="M 0 0 L -13 -8 Q -16 0 -13 8 Z" fill="#ef7fa8" />
          <path d="M 0 0 L 13 -8 Q 16 0 13 8 Z" fill="#ef7fa8" />
          <circle r={4} fill="#e0568a" />
        </g>
      );
    case 'crown':
      return (
        <g className="a-outfit" transform={`translate(${x} ${y})`}>
          <path d="M -20 2 Q 0 -10 20 2" stroke="#7fb069" strokeWidth={3.5} fill="none" strokeLinecap="round" />
          {[-15, -5, 5, 15].map((dx, i) => (
            <g key={dx} transform={`translate(${dx} ${i % 2 ? -6 : -3})`}>
              {[0, 72, 144, 216, 288].map((a) => (
                <circle key={a} cx={3.4 * Math.cos((a * Math.PI) / 180)} cy={3.4 * Math.sin((a * Math.PI) / 180)} r={2.6} fill={i % 2 ? '#f7c8d8' : '#f2a7c3'} />
              ))}
              <circle r={1.8} fill="#ffd166" />
            </g>
          ))}
        </g>
      );
    case 'tophat':
      return (
        <g className="a-outfit" transform={`translate(${x} ${y})`}>
          <ellipse cx={0} cy={6} rx={17} ry={4.5} fill="#2f5d5a" />
          <path d="M -10 6 L -8 -14 Q 0 -18 8 -14 L 10 6 Z" fill="#35706b" />
          <rect x={-9.4} y={-2} width={18.8} height={5} fill="#ffd166" />
        </g>
      );
    case 'glasses':
      return (
        <g className="a-outfit">
          {[-12.5, 13].map((cx) => (
            <path
              key={cx}
              d="M 0 -8 L 2.6 -2.8 L 7.6 -2.6 L 3.8 1.2 L 5.2 6.4 L 0 3.6 L -5.2 6.4 L -3.8 1.2 L -7.6 -2.6 L -2.6 -2.8 Z"
              fill="#ffd166" stroke="#e0a92e" strokeWidth={1}
              transform={`translate(${cx} -3) scale(1.15)`}
            />
          ))}
          <path d="M -5 -4 Q 0.5 -6 6 -4" stroke="#e0a92e" strokeWidth={2} fill="none" />
        </g>
      );
    default:
      return null;
  }
}

function outfitScarf(at: [number, number]) {
  const [x, y] = at;
  return (
    <g className="a-outfit-scarf" transform={`translate(${x} ${y})`}>
      <path d="M -24 0 Q 0 10 24 0 L 24 10 Q 0 20 -24 10 Z" fill="#e05656" />
      <path d="M 14 8 L 20 26 L 12 28 L 8 12 Z" fill="#c94444" />
      <path d="M -24 3 Q 0 13 24 3" stroke="#f2f0eb" strokeWidth={2.4} fill="none" strokeDasharray="4 5" />
    </g>
  );
}

const ART: Record<SpeciesId, ArtDef> = {
  dog: {
    headPos: [100, 72], headR: 33, hatAt: [6, -34], scarfAt: [100, 100],
    tail: <path d="M 60 122 Q 34 116 30 92 Q 44 88 52 100 Q 62 112 66 118 Z" fill="#c98d54" />,
    body: (
      <>
        <ellipse cx={100} cy={128} rx={47} ry={34} fill="#d9a066" />
        <ellipse cx={100} cy={140} rx={28} ry={20} fill="#f0d3ac" />
        <ellipse cx={72} cy={158} rx={12} ry={6} fill="#c98d54" />
        <ellipse cx={128} cy={158} rx={12} ry={6} fill="#c98d54" />
      </>
    ),
    head: (
      <>
        <g className="a-ear-l"><ellipse cx={-31} cy={-4} rx={11} ry={21} fill="#b57e46" /></g>
        <g className="a-ear-r"><ellipse cx={31} cy={-4} rx={11} ry={21} fill="#b57e46" /></g>
        <circle r={33} fill="#e2ac72" />
        <ellipse cx={8} cy={-12} rx={13} ry={10} fill="#c98d54" opacity={0.5} />
        <g className="a-eyes">{EYES}</g>
        <ellipse cx={0} cy={11} rx={15} ry={10.5} fill="#f6e3c2" />
        <ellipse cx={0} cy={7} rx={5.4} ry={4} fill="#33302e" />
        <path d="M 0 11 Q 0 15 -5 16 M 0 11 Q 0 15 5 16" stroke="#33302e" strokeWidth={1.8} fill="none" strokeLinecap="round" />
      </>
    ),
  },
  cat: {
    headPos: [100, 70], headR: 31, hatAt: [4, -32], scarfAt: [100, 97],
    tail: <path d="M 142 140 Q 176 138 174 104 Q 172 88 160 84 Q 156 98 162 112 Q 166 126 148 128 Z" fill="#8d99ae" />,
    body: (
      <>
        <ellipse cx={100} cy={128} rx={44} ry={33} fill="#9aa7bd" />
        <ellipse cx={100} cy={140} rx={26} ry={19} fill="#e8ecf3" />
        <ellipse cx={74} cy={157} rx={11} ry={5.6} fill="#8d99ae" />
        <ellipse cx={126} cy={157} rx={11} ry={5.6} fill="#8d99ae" />
      </>
    ),
    head: (
      <>
        <g className="a-ear-l"><path d="M -26 -16 L -22 -40 L -4 -28 Z" fill="#8d99ae" /><path d="M -22 -20 L -20 -33 L -10 -26 Z" fill="#f5a8a0" /></g>
        <g className="a-ear-r"><path d="M 26 -16 L 22 -40 L 4 -28 Z" fill="#8d99ae" /><path d="M 22 -20 L 20 -33 L 10 -26 Z" fill="#f5a8a0" /></g>
        <circle r={31} fill="#9aa7bd" />
        <g className="a-eyes">{EYES}</g>
        <path d="M -3 8 L 3 8 L 0 12 Z" fill="#e0568a" />
        <path d="M -24 10 L -34 8 M -24 14 L -33 15 M 24 10 L 34 8 M 24 14 L 33 15" stroke="#6d7789" strokeWidth={1.4} strokeLinecap="round" />
      </>
    ),
  },
  bunny: {
    headPos: [100, 68], headR: 29, hatAt: [16, -34], scarfAt: [100, 94],
    tail: <circle cx={57} cy={140} r={10} fill="#f2f0eb" />,
    body: (
      <>
        <ellipse cx={100} cy={130} rx={42} ry={31} fill="#e9e2d8" />
        <ellipse cx={100} cy={141} rx={24} ry={18} fill="#faf7f1" />
        <ellipse cx={76} cy={158} rx={13} ry={6} fill="#e9e2d8" />
        <ellipse cx={124} cy={158} rx={13} ry={6} fill="#e9e2d8" />
      </>
    ),
    head: (
      <>
        <g className="a-ear-l"><ellipse cx={-13} cy={-44} rx={8} ry={26} fill="#e9e2d8" /><ellipse cx={-13} cy={-44} rx={4} ry={17} fill="#f5a8a0" /></g>
        <g className="a-ear-r"><ellipse cx={13} cy={-44} rx={8} ry={26} fill="#e9e2d8" /><ellipse cx={13} cy={-44} rx={4} ry={17} fill="#f5a8a0" /></g>
        <circle r={29} fill="#efe8dd" />
        <g className="a-eyes">{EYES}</g>
        <g className="a-nose"><path d="M -3.4 7 L 3.4 7 L 0 11 Z" fill="#e0568a" /></g>
        <path d="M 0 11 L 0 14 M 0 14 L -4 17 M 0 14 L 4 17" stroke="#b09a86" strokeWidth={1.5} fill="none" strokeLinecap="round" />
        <rect x={-3} y={15} width={6} height={5} rx={1.4} fill="#fff" stroke="#d8cfc2" strokeWidth={0.8} />
      </>
    ),
  },
  fox: {
    headPos: [100, 72], headR: 32, hatAt: [4, -33], scarfAt: [100, 99],
    tail: <path d="M 138 148 Q 186 140 182 96 Q 180 74 164 70 Q 158 92 152 108 Q 144 130 128 136 Z" fill="#e07b39" />,
    body: (
      <>
        <ellipse cx={100} cy={129} rx={44} ry={33} fill="#e8863f" />
        <ellipse cx={100} cy={140} rx={25} ry={19} fill="#fbe9d4" />
        <ellipse cx={75} cy={158} rx={11} ry={5.6} fill="#c96a2e" />
        <ellipse cx={125} cy={158} rx={11} ry={5.6} fill="#c96a2e" />
      </>
    ),
    head: (
      <>
        <g className="a-ear-l"><path d="M -28 -14 L -30 -44 L -6 -30 Z" fill="#e8863f" /><path d="M -25 -19 L -26 -35 L -12 -27 Z" fill="#8a4b21" /></g>
        <g className="a-ear-r"><path d="M 28 -14 L 30 -44 L 6 -30 Z" fill="#e8863f" /><path d="M 25 -19 L 26 -35 L 12 -27 Z" fill="#8a4b21" /></g>
        <circle r={32} fill="#ee9046" />
        <path d="M -32 4 Q -16 26 0 27 Q 16 26 32 4 Q 20 34 -0 34 Q -20 34 -32 4 Z" fill="#fbe9d4" />
        <g className="a-eyes">{EYES}</g>
        <ellipse cx={0} cy={16} rx={5.6} ry={4.2} fill="#33302e" />
      </>
    ),
  },
  panda: {
    headPos: [100, 70], headR: 34, hatAt: [0, -36], scarfAt: [100, 99],
    tail: null,
    body: (
      <>
        <ellipse cx={100} cy={127} rx={50} ry={36} fill="#f4f1ea" />
        <ellipse cx={64} cy={112} rx={12} ry={17} fill="#3c3a38" />
        <ellipse cx={136} cy={112} rx={12} ry={17} fill="#3c3a38" />
        <ellipse cx={76} cy={159} rx={14} ry={7} fill="#3c3a38" />
        <ellipse cx={124} cy={159} rx={14} ry={7} fill="#3c3a38" />
      </>
    ),
    head: (
      <>
        <g className="a-ear-l"><circle cx={-27} cy={-24} r={11.5} fill="#3c3a38" /></g>
        <g className="a-ear-r"><circle cx={27} cy={-24} r={11.5} fill="#3c3a38" /></g>
        <circle r={34} fill="#faf7f1" />
        <ellipse cx={-13} cy={-3} rx={8.4} ry={10.4} fill="#3c3a38" transform="rotate(18 -13 -3)" />
        <ellipse cx={13} cy={-3} rx={8.4} ry={10.4} fill="#3c3a38" transform="rotate(-18 13 -3)" />
        <g className="a-eyes">
          <g className="a-eyes-open">
            <circle cx={-12.4} cy={-3.4} r={3.4} fill="#fff" />
            <circle cx={12.4} cy={-3.4} r={3.4} fill="#fff" />
            <circle cx={-12.4} cy={-3.2} r={1.7} fill="#33302e" />
            <circle cx={12.4} cy={-3.2} r={1.7} fill="#33302e" />
          </g>
          <g className="a-eyes-closed">
            <path d="M -17 -3 Q -12.4 2 -8 -3" stroke="#33302e" strokeWidth={2.2} fill="none" strokeLinecap="round" />
            <path d="M 8 -3 Q 12.4 2 17 -3" stroke="#33302e" strokeWidth={2.2} fill="none" strokeLinecap="round" />
          </g>
        </g>
        <ellipse cx={0} cy={9} rx={4.8} ry={3.4} fill="#33302e" />
        <path d="M 0 12 Q -2 16 -6 15 M 0 12 Q 2 16 6 15" stroke="#33302e" strokeWidth={1.7} fill="none" strokeLinecap="round" />
      </>
    ),
  },
  duck: {
    headPos: [100, 74], headR: 27, hatAt: [3, -29], scarfAt: [100, 97],
    tail: <path d="M 62 116 Q 44 108 46 94 Q 58 94 64 104 Z" fill="#f6cf4b" />,
    body: (
      <>
        <ellipse cx={100} cy={126} rx={45} ry={35} fill="#f9d95c" />
        <ellipse cx={100} cy={138} rx={27} ry={20} fill="#fdeec0" />
        <g className="a-sig"><path d="M 66 112 Q 50 122 58 138 Q 72 134 74 120 Z" fill="#f0c93e" /></g>
        <path d="M 84 162 L 96 162 M 104 162 L 116 162" stroke="#e8912d" strokeWidth={4} strokeLinecap="round" />
      </>
    ),
    head: (
      <>
        <circle r={27} fill="#f9d95c" />
        <g className="a-sig"><path d="M -3 -26 Q -6 -36 2 -38 Q 8 -32 4 -25 Z" fill="#f0c93e" /></g>
        <g className="a-eyes">{EYES}</g>
        <ellipse cx={0} cy={9} rx={12.4} ry={6.4} fill="#f39c2c" />
        <path d="M -12 9 Q 0 13 12 9" stroke="#d97f1e" strokeWidth={1.6} fill="none" />
      </>
    ),
  },
  turtle: {
    headPos: [152, 102], headR: 17, hatAt: [-2, -19], scarfAt: [126, 106],
    tail: <path d="M 34 138 L 20 144 L 36 148 Z" fill="#7fb069" />,
    body: (
      <>
        <ellipse cx={88} cy={158} rx={13} ry={6} fill="#7fb069" />
        <ellipse cx={128} cy={158} rx={13} ry={6} fill="#7fb069" />
        <path d="M 30 142 Q 30 96 92 96 Q 146 96 146 142 Q 88 154 30 142 Z" fill="#5d8f4e" />
        <path d="M 44 128 Q 50 106 88 104 Q 126 106 132 128 Q 88 138 44 128 Z" fill="#79a95f" />
        <path d="M 66 112 L 84 106 L 96 116 L 84 128 L 64 126 Z" fill="#8fbc74" opacity={0.8} />
        <path d="M 104 108 L 122 112 L 118 126 L 100 128 L 94 117 Z" fill="#8fbc74" opacity={0.7} />
      </>
    ),
    head: (
      <>
        <circle r={17} fill="#8fbc74" />
        <g className="a-eyes">
          <g className="a-eyes-open">
            <circle cx={4} cy={-3} r={3.6} fill="#33302e" />
            <circle cx={2.8} cy={-4.6} r={1.3} fill="#fff" />
          </g>
          <g className="a-eyes-closed">
            <path d="M 0 -3 Q 4 1 8 -3" stroke="#33302e" strokeWidth={2.1} fill="none" strokeLinecap="round" />
          </g>
          <circle cx={11} cy={4} r={4} fill="#f5a8a0" opacity={0.55} />
        </g>
        <path d="M 12 6 Q 15 8 12 10" stroke="#4e7038" strokeWidth={1.6} fill="none" strokeLinecap="round" />
      </>
    ),
  },
  hedgehog: {
    headPos: [100, 86], headR: 27, hatAt: [2, -30], scarfAt: [100, 108],
    tail: null,
    body: (
      <>
        <g className="a-sig">
          {[
            [58, 118], [66, 100], [80, 90], [96, 86], [112, 90], [126, 100], [134, 118], [130, 136], [62, 136],
          ].map(([cx, cy]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={13} fill="#8a6a4e" />
          ))}
        </g>
        <ellipse cx={96} cy={126} rx={36} ry={26} fill="#a37f5c" />
        <ellipse cx={74} cy={156} rx={9} ry={5} fill="#8a6a4e" />
        <ellipse cx={120} cy={156} rx={9} ry={5} fill="#8a6a4e" />
      </>
    ),
    head: (
      <>
        <g className="a-ear-l"><circle cx={-19} cy={-19} r={6.4} fill="#a37f5c" /><circle cx={-19} cy={-19} r={3} fill="#f5a8a0" /></g>
        <g className="a-ear-r"><circle cx={19} cy={-19} r={6.4} fill="#a37f5c" /><circle cx={19} cy={-19} r={3} fill="#f5a8a0" /></g>
        <circle r={27} fill="#e8c39a" />
        <g className="a-eyes">{EYES}</g>
        <g className="a-nose"><ellipse cx={0} cy={10} rx={4.6} ry={3.4} fill="#33302e" /></g>
        <path d="M 0 13 Q -1 16 -4 16 M 0 13 Q 1 16 4 16" stroke="#8a6a4e" strokeWidth={1.5} fill="none" strokeLinecap="round" />
      </>
    ),
  },
  penguin: {
    headPos: [100, 72], headR: 29, hatAt: [3, -31], scarfAt: [100, 98],
    tail: null,
    body: (
      <>
        <g className="a-sig-l"><path d="M 58 104 Q 40 118 46 140 Q 58 138 62 122 Z" fill="#3d5a73" /></g>
        <g className="a-sig-r"><path d="M 142 104 Q 160 118 154 140 Q 142 138 138 122 Z" fill="#3d5a73" /></g>
        <ellipse cx={100} cy={124} rx={42} ry={38} fill="#466a85" />
        <ellipse cx={100} cy={130} rx={27} ry={29} fill="#f4f7f9" />
        <path d="M 78 162 L 94 162 M 106 162 L 122 162" stroke="#f39c2c" strokeWidth={4.4} strokeLinecap="round" />
      </>
    ),
    head: (
      <>
        <circle r={29} fill="#466a85" />
        <path d="M -20 -8 Q 0 16 20 -8 Q 16 20 0 22 Q -16 20 -20 -8 Z" fill="#f4f7f9" />
        <g className="a-sig"><path d="M -2 -28 Q -4 -37 3 -39 Q 9 -34 5 -27 Z" fill="#ffd166" /></g>
        <g className="a-eyes">{EYES}</g>
        <path d="M -6 8 L 6 8 L 0 15 Z" fill="#f39c2c" />
      </>
    ),
  },
};

export interface AnimalSvgProps {
  species: SpeciesId;
  outfit?: string | null;
  /** Idle engine on (sanctuary + visit views; off for album thumbnails). */
  idle?: boolean;
  sleep?: SleepState;
  /** Per-animal CSS-var overrides (breath/sway durations) from the idle hook. */
  idleVars?: CSSProperties;
  className?: string;
  title?: string;
}

export function AnimalSvg({
  species,
  outfit,
  idle = false,
  sleep = 'awake',
  idleVars,
  className,
  title,
}: AnimalSvgProps) {
  const art = ART[species];
  const headOutfit =
    outfit && outfit !== 'scarf'
      ? outfitHead(outfit as OutfitId, art.hatAt)
      : null;
  return (
    <svg
      viewBox="0 0 200 190"
      className={`animal-svg ${idle ? 'idle-on' : ''} sleep-${sleep} ${className ?? ''}`}
      style={idleVars}
      role="img"
      aria-label={title ?? species}
      data-species={species}
    >
      <ellipse cx={100} cy={169} rx={62} ry={9} fill="#000" opacity={0.1} />
      <g className="a-ground-decor">
        <circle cx={30} cy={164} r={3} fill="#f2a7c3" />
        <circle cx={38} cy={167} r={2.4} fill="#ffd166" />
        <circle cx={168} cy={165} r={3} fill="#a7c7e7" />
        <circle cx={160} cy={168} r={2.2} fill="#f2a7c3" />
      </g>
      <g className="a-rig">
        <g className="a-tail">{art.tail}</g>
        <g className="a-pose">
          <g className="a-sway">
            <g className="a-body">
              {art.body}
              {outfit === 'scarf' ? outfitScarf(art.scarfAt) : null}
            </g>
            <g className="a-head-pos" transform={`translate(${art.headPos[0]} ${art.headPos[1]})`}>
              <g className="a-head">
                {art.head}
                {headOutfit}
              </g>
            </g>
          </g>
        </g>
      </g>
      {sleep === 'asleep' ? (
        <g className="a-zzz" aria-hidden>
          <text x={140} y={52} className="zzz z1">Z</text>
          <text x={152} y={38} className="zzz z2">Z</text>
          <text x={163} y={22} className="zzz z3">Z</text>
        </g>
      ) : null}
    </svg>
  );
}
