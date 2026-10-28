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
      {defId === 'water-bowl' && (
        <>
          <ellipse cx={50} cy={62} rx={26} ry={4} fill="#000" opacity={0.08} />
          <path d="M 28 42 Q 31 60 50 60 Q 69 60 72 42 Z" fill="#5b93c4" />
          <path d="M 28 42 Q 31 60 50 60 Q 69 60 72 42 Z" fill="#000" opacity={0.05} />
          <ellipse cx={50} cy={42} rx={22} ry={5.5} fill="#487ca9" />
          <ellipse cx={50} cy={41} rx={18} ry={4.2} fill="#a7c7e7" />
          <ellipse cx={43} cy={40.4} rx={6} ry={1.6} fill="#c3d9ef" />
        </>
      )}
      {defId === 'treat-jar' && (
        <>
          <ellipse cx={50} cy={62} rx={24} ry={4} fill="#000" opacity={0.08} />
          <rect x={33} y={18} width={34} height={42} rx={9} fill="#dceefb" opacity={0.75} />
          <rect x={33} y={18} width={34} height={42} rx={9} fill="none" stroke="#b9d2e8" strokeWidth={2} />
          <circle cx={43} cy={48} r={5} fill="#d9a45b" />
          <circle cx={55} cy={52} r={5.4} fill="#c98f3d" />
          <circle cx={47} cy={40} r={4.4} fill="#e3b96e" />
          <circle cx={58} cy={43} r={4} fill="#d9a45b" />
          <rect x={30} y={10} width={40} height={10} rx={5} fill="#c9553e" />
          <rect x={30} y={10} width={40} height={5} rx={2.5} fill="#d96c55" />
        </>
      )}
      {defId === 'cushion-pile' && (
        <>
          <ellipse cx={50} cy={63} rx={37} ry={5} fill="#000" opacity={0.08} />
          <rect x={14} y={42} width={72} height={20} rx={10} fill="#5fae9d" />
          <rect x={14} y={42} width={72} height={10} rx={5} fill="#74bfae" />
          <rect x={24} y={27} width={56} height={19} rx={9.5} fill="#f2a65a" />
          <rect x={24} y={27} width={56} height={9} rx={4.5} fill="#f7bc7d" />
          <rect x={36} y={13} width={32} height={17} rx={8.5} fill="#fdf6e9" />
          <rect x={36} y={13} width={32} height={17} rx={8.5} fill="none" stroke="#e8dcc4" strokeWidth={2} />
        </>
      )}
      {defId === 'sunny-spot' && (
        <>
          <ellipse cx={50} cy={46} rx={45} ry={19} fill="#f7d774" opacity={0.4} />
          <ellipse cx={50} cy={46} rx={35} ry={14.5} fill="#f9e08a" opacity={0.55} />
          <ellipse cx={50} cy={46} rx={24} ry={9.5} fill="#fcecae" opacity={0.7} />
          <path d="M 26 22 l 2.5 5 l -2.5 5 l -2.5 -5 Z" fill="#f7d774" />
          <path d="M 72 16 l 2 4 l -2 4 l -2 -4 Z" fill="#f7d774" />
          <path d="M 82 30 l 1.8 3.6 l -1.8 3.6 l -1.8 -3.6 Z" fill="#f9e08a" />
        </>
      )}
      {defId === 'shade-tree' && (
        <>
          <ellipse cx={50} cy={63} rx={40} ry={5.5} fill="#3d7a44" opacity={0.25} />
          <path d="M 45 62 L 47 34 Q 50 30 53 34 L 55 62 Z" fill="#8a5a3a" />
          <path d="M 48 44 Q 40 40 35 33" stroke="#8a5a3a" strokeWidth={4.5} fill="none" strokeLinecap="round" />
          <circle cx={32} cy={26} r={15} fill="#5da463" />
          <circle cx={52} cy={18} r={18} fill="#6cb573" />
          <circle cx={70} cy={27} r={14} fill="#5da463" />
          <circle cx={45} cy={29} r={12} fill="#7cc184" />
          <circle cx={40} cy={20} r={3} fill="#e0568a" />
          <circle cx={60} cy={26} r={3} fill="#e0568a" />
          <circle cx={52} cy={12} r={2.6} fill="#e0568a" />
        </>
      )}
      {defId === 'ball-patch' && (
        <>
          <ellipse cx={50} cy={48} rx={44} ry={17} fill="#8fce7e" />
          <ellipse cx={50} cy={48} rx={34} ry={12.5} fill="#a5d996" />
          <circle cx={34} cy={44} r={8} fill="#7bc47f" />
          <path d="M 27 39 A 8 8 0 0 1 40 41" stroke="#fff" strokeWidth={2.6} fill="none" strokeLinecap="round" />
          <circle cx={56} cy={50} r={6.4} fill="#e8e34d" />
          <path d="M 51 46 Q 56 50 61 54" stroke="#fff" strokeWidth={2.2} fill="none" strokeLinecap="round" />
          <circle cx={70} cy={42} r={5.2} fill="#e0568a" />
          <circle cx={44} cy={54} r={4.2} fill="#5b93c4" />
        </>
      )}
      {defId === 'scratch-post' && (
        <>
          <ellipse cx={50} cy={62} rx={28} ry={4.5} fill="#000" opacity={0.08} />
          <rect x={24} y={56} width={52} height={8} rx={4} fill="#8a5a3a" />
          <rect x={42} y={16} width={16} height={42} rx={5} fill="#d9b98a" />
          <path d="M 42 24 h 16 M 42 32 h 16 M 42 40 h 16 M 42 48 h 16" stroke="#bfa06c" strokeWidth={2.6} />
          <rect x={34} y={8} width={32} height={10} rx={5} fill="#b57e46" />
          <path d="M 62 18 q 6 8 2 15" stroke="#c9553e" strokeWidth={2.2} fill="none" strokeLinecap="round" />
          <circle cx={64} cy={36} r={3.4} fill="#f2a65a" />
        </>
      )}
      {defId === 'grooming-station' && (
        <>
          <ellipse cx={50} cy={63} rx={34} ry={5} fill="#000" opacity={0.08} />
          <rect x={22} y={34} width={56} height={8} rx={4} fill="#b57e46" />
          <rect x={27} y={42} width={6} height={19} fill="#8a5a3a" />
          <rect x={67} y={42} width={6} height={19} fill="#8a5a3a" />
          <rect x={31} y={20} width={7} height={15} rx={3.5} transform="rotate(-18 34 27)" fill="#7a9cc6" />
          <rect x={26} y={12} width={13} height={10} rx={3} transform="rotate(-18 32 17)" fill="#5b93c4" />
          <path d="M 29 14 l 1.5 4 M 33 13.4 l 1.5 4 M 37 12.8 l 1.5 4" stroke="#dceefb" strokeWidth={1.8} strokeLinecap="round" />
          <rect x={56} y={16} width={10} height={18} rx={4} fill="#f2a7c3" />
          <rect x={58.5} y={10} width={5} height={7} rx={2} fill="#e0568a" />
          <path
            d="M 47 30 C 44.5 27 41 28.6 41 25.6 C 41 23.2 44.6 22.6 47 25.6 C 49.4 22.6 53 23.2 53 25.6 C 53 28.6 49.5 27 47 30 Z"
            fill="#e0568a"
            opacity={0.8}
          />
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
