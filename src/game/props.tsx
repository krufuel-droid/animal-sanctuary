// Yard props for the Phase 2 advertisers (UTILITY-AI-DEEP-DIVE §5) —
// drawn in the same flat, round, cozy style as the animal art in
// animals.tsx: soft shapes, warm palette, no outlines heavier than the
// animals' own. Each prop is a 100×70 viewBox with its ground point at
// bottom-centre; the yard positions them by anchor (§5.2 anchor law).

export function YardProp({ defId }: { defId: string }) {
  return (
    <svg viewBox="0 0 100 70" className="w-full h-auto block" aria-hidden>
      {defId === 'food-bowl' && (
        <>
          <ellipse cx={50} cy={62} rx={34} ry={5} fill="#000" opacity={0.08} />
          <path d="M 22 38 Q 26 62 50 62 Q 74 62 78 38 Z" fill="#c9553e" />
          <path d="M 22 38 Q 26 62 50 62 Q 74 62 78 38 Z" fill="#000" opacity={0.06} />
          <ellipse cx={50} cy={38} rx={28} ry={7} fill="#a33f2c" />
          <ellipse cx={50} cy={36.5} rx={24} ry={5.5} fill="#8a5a3a" />
          <circle cx={40} cy={35} r={3.4} fill="#6f452a" />
          <circle cx={52} cy={37} r={3.4} fill="#6f452a" />
          <circle cx={61} cy={34.5} r={3.2} fill="#7d4f2e" />
          <circle cx={46} cy={33.5} r={3} fill="#7d4f2e" />
        </>
      )}
      {defId === 'bed' && (
        <>
          <ellipse cx={50} cy={63} rx={38} ry={5} fill="#000" opacity={0.08} />
          <rect x={10} y={34} width={80} height={26} rx={13} fill="#7a9cc6" />
          <rect x={10} y={34} width={80} height={13} rx={6.5} fill="#93b4d8" />
          <rect x={16} y={24} width={30} height={20} rx={9} fill="#fdf6e9" />
          <rect x={16} y={24} width={30} height={20} rx={9} fill="none" stroke="#e8dcc4" strokeWidth={2} />
          <path d="M 48 44 Q 66 36 88 46 L 88 56 Q 68 50 50 54 Z" fill="#f2a7c3" opacity={0.85} />
        </>
      )}
      {defId === 'toy-box' && (
        <>
          <ellipse cx={50} cy={63} rx={36} ry={5} fill="#000" opacity={0.08} />
          <circle cx={38} cy={22} r={11} fill="#e0568a" />
          <path d="M 29 15 A 11 11 0 0 1 44 13" stroke="#fff" strokeWidth={3.4} fill="none" strokeLinecap="round" />
          <rect x={58} y={12} width={7} height={18} rx={3.5} transform="rotate(24 61 21)" fill="#fdf6e9" />
          <circle cx={55} cy={11} r={4.6} fill="#fdf6e9" />
          <circle cx={66} cy={15} r={4.6} fill="#fdf6e9" />
          <path d="M 18 32 L 82 32 L 77 62 Q 50 67 23 62 Z" fill="#b57e46" />
          <path d="M 18 32 L 82 32 L 80 43 L 20 43 Z" fill="#a06a35" />
          <rect x={42} y={48} width={16} height={8} rx={4} fill="#8a5a3a" />
        </>
      )}
      {defId === 'bath-tub' && (
        <>
          <ellipse cx={50} cy={63} rx={38} ry={5} fill="#000" opacity={0.08} />
          <path d="M 14 30 L 86 30 Q 84 56 62 60 L 38 60 Q 16 56 14 30 Z" fill="#fdfefe" />
          <path d="M 14 30 L 86 30 Q 84 56 62 60 L 38 60 Q 16 56 14 30 Z" fill="none" stroke="#d7e3ea" strokeWidth={2} />
          <ellipse cx={50} cy={30} rx={36} ry={7} fill="#a7c7e7" />
          <ellipse cx={42} cy={28.5} rx={16} ry={4} fill="#c3d9ef" />
          <circle cx={30} cy={20} r={5} fill="#eaf4fc" />
          <circle cx={42} cy={14} r={3.6} fill="#eaf4fc" />
          <circle cx={66} cy={18} r={4.4} fill="#eaf4fc" />
          <circle cx={76} cy={24} r={3} fill="#eaf4fc" />
          <rect x={24} y={58} width={6} height={6} rx={2} fill="#b9c9d4" />
          <rect x={70} y={58} width={6} height={6} rx={2} fill="#b9c9d4" />
        </>
      )}
      {defId === 'cuddle-rug' && (
        <>
          <ellipse cx={50} cy={44} rx={44} ry={20} fill="#e0568a" opacity={0.35} />
          <ellipse cx={50} cy={44} rx={36} ry={15.5} fill="#f2a7c3" opacity={0.55} />
          <ellipse cx={50} cy={44} rx={27} ry={11} fill="#f7c8d8" />
          <path
            d="M 50 50 C 44 43 38 46 38 40 C 38 35 45 34 50 40 C 55 34 62 35 62 40 C 62 46 56 43 50 50 Z"
            fill="#e0568a"
            opacity={0.75}
          />
        </>
      )}
    </svg>
  );
}
