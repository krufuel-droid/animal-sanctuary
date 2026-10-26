import { describe, expect, it } from 'vitest';
import { ADOPTERS_BY_ID } from './adopters';
import {
  applyAdoptionCooldowns,
  generateOffer,
  isPerfectMatch,
  scoreAdopter,
} from './matching';
import { generateStory } from './stories';
import { mulberry32 } from '../save/rng';

// Parity anchors: the spec's own worked examples (PHASE0-DEEP-DIVE §B.4.2
// and §B.5.3). If these ever fail, the port has drifted from the blueprint.

const PIP = {
  name: 'Pip',
  species: 'duck' as const,
  traitId: 'playful' as const,
  favoriteCareAction: 'play' as const,
};

function sequenceRng(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

describe('§B.4.2 worked example — Pip the playful duckling', () => {
  // The §B.4.2 prose says "Marco (no species…) = 3", but the §B.2 pool table
  // lists duckling among Marco's loved species — and the shipped Phase 0
  // build's verified trio for this exact profile was "three 6s" (Finn, Park
  // Family, Marco). The table is what shipped; the prose line is stale.
  it('scores Finn 6, Marco 6, Luna 0 (pool table, as shipped)', () => {
    expect(scoreAdopter(PIP, ADOPTERS_BY_ID['finn']).total).toBe(6);
    expect(scoreAdopter(PIP, ADOPTERS_BY_ID['marco']).total).toBe(6);
    expect(scoreAdopter(PIP, ADOPTERS_BY_ID['luna']).total).toBe(0);
  });

  it('breaks the Finn score down as species 3 + trait 2 + care 1', () => {
    expect(scoreAdopter(PIP, ADOPTERS_BY_ID['finn'])).toEqual({
      species: 3,
      trait: 2,
      care: 1,
      total: 6,
    });
  });
});

describe('§B.5.3 worked example — Pip goes home with Finn (badge)', () => {
  it('produces the spec story verbatim: O2 + M1 + S1 + C3', () => {
    // Draws: opening idx 1 (O2), middle idx 0 (M1), closing idx 2 (C3).
    const result = generateStory(PIP, ADOPTERS_BY_ID['finn'], {
      badge: true,
      hasAffinity: true,
      lastTemplateIds: null,
      rng: sequenceRng([0.5, 0.0, 0.99]),
    });
    expect(result.story).toBe(
      'When Pip the duckling was ready, Finn came to the door with a big smile. ' +
        'Finn\'s home has a dock where the water sparkles all morning — just right for a playful duckling who splashes in every puddle. ' +
        'Everyone at the sanctuary said the same thing: this was a perfect match. 💛 ' +
        'Finn and Pip watch the lake together every sunrise.',
    );
    expect(result.summary).toBe(
      'Pip lives with Finn at the little cabin beside the lake now.',
    );
    expect(result.templateIds).toEqual({
      opening: 'O2',
      middle: 'M1',
      closing: 'C3',
    });
  });
});

describe('§B.5.3 counter-example — Pip goes home with Luna (score 0)', () => {
  it('is just as warm: O1 + M4 + C1, no sparkle, no apology', () => {
    const result = generateStory(PIP, ADOPTERS_BY_ID['luna'], {
      badge: false,
      hasAffinity: false,
      lastTemplateIds: null,
      rng: sequenceRng([0.0, 0.0, 0.0]),
    });
    // Note: the spec's prose counter-example drops the "who" from the beat;
    // the normative template (M4: "{Name} {traitBeat}") and §B.5.5's
    // grammar check keep it. Template wins.
    expect(result.story).toBe(
      'Pip the duckling packed a tiny bag and waved goodbye to the sanctuary. ' +
        'Pip who splashes in every puddle, and Luna loved that about Pip right away. ' +
        'Now Pip is home, happy and loved, every single day.',
    );
  });

  it('never unlocks M1–M3 without affinity', () => {
    for (const draw of [0.0, 0.25, 0.5, 0.75, 0.99]) {
      const result = generateStory(PIP, ADOPTERS_BY_ID['luna'], {
        badge: false,
        hasAffinity: false,
        lastTemplateIds: null,
        rng: sequenceRng([0.0, draw, 0.0]),
      });
      expect(result.templateIds.middle).toBe('M4');
    }
  });
});

describe('offer generation (§B.4.3/§B.4.6)', () => {
  it('always includes a top scorer as the Pick and exactly 3 cards', () => {
    const offer = generateOffer(PIP, {}, [], sequenceRng([0.1, 0.2, 0.3, 0.4, 0.5]));
    expect(offer.offerIds).toHaveLength(3);
    expect(new Set(offer.offerIds).size).toBe(3);
    // Three adopters tie at 6 for Pip; the Pick is one of them (O2 + random
    // tie-break), and the second card is another 6.
    expect(['finn', 'park-family', 'marco']).toContain(offer.pickId);
    expect(offer.scores[offer.pickId]).toBe(6);
    const sixes = Object.values(offer.scores).filter((s) => s === 6);
    expect(sixes.length).toBeGreaterThanOrEqual(2);
  });

  it('honours the adopted cooldown (C1) and releases it after 3 adoptions', () => {
    const offer = generateOffer(PIP, { finn: 3 }, [], sequenceRng([0.1, 0.2, 0.3, 0.4, 0.5]));
    expect(offer.offerIds).not.toContain('finn');
  });

  it('badge: chosen at trio max and ≥ 5 earns it; a trio-max 4 does not', () => {
    expect(isPerfectMatch('rosa', { rosa: 5, luna: 4, bea: 1 })).toBe(true);
    expect(isPerfectMatch('sam', { sam: 4, ellis: 4, ivy: 2 })).toBe(false);
    expect(isPerfectMatch('luna', { rosa: 5, luna: 0, bea: 1 })).toBe(false);
  });

  it('C1: the adopted adopter sits out exactly the next 3 offers', () => {
    // Cooldowns tick down one per completed adoption, then expire (§B.4.6).
    let cd = applyAdoptionCooldowns({}, 'finn');
    expect(cd).toEqual({ finn: 3 });
    cd = applyAdoptionCooldowns(cd, 'luna');
    expect(cd).toEqual({ finn: 2, luna: 3 });
    cd = applyAdoptionCooldowns(cd, 'sam');
    expect(cd).toEqual({ finn: 1, luna: 2, sam: 3 });
    cd = applyAdoptionCooldowns(cd, 'rosa');
    expect(cd).toEqual({ luna: 1, sam: 2, rosa: 3 }); // finn expired
    // And while on cooldown, finn is never offered (real rng, many draws):
    for (let seed = 1; seed <= 40; seed++) {
      const offer = generateOffer(PIP, { finn: 3 }, [], mulberry32(seed));
      expect(offer.offerIds).not.toContain('finn');
    }
  });

  it('C3: back-to-back offers never repeat the identical trio', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const rng = mulberry32(seed * 7919);
      const first = generateOffer(PIP, {}, [], rng);
      const second = generateOffer(PIP, {}, first.offerIds, rng);
      const sameSet =
        second.offerIds.length === first.offerIds.length &&
        second.offerIds.every((id) => first.offerIds.includes(id));
      expect(sameSet).toBe(false);
    }
  });

  it('O1 valve: even with 10 adopters on cooldown, an offer of 3 exists', () => {
    const cooldowns: Record<string, number> = {};
    for (const a of Object.values(ADOPTERS_BY_ID).slice(0, 10)) cooldowns[a.id] = 2;
    const offer = generateOffer(PIP, cooldowns, [], mulberry32(42));
    expect(offer.offerIds).toHaveLength(3);
    expect(new Set(offer.offerIds).size).toBe(3);
  });

  it('C4: a repeated template position is re-picked', () => {
    const result = generateStory(PIP, ADOPTERS_BY_ID['finn'], {
      badge: false,
      hasAffinity: true,
      lastTemplateIds: { opening: 'O1', middle: 'M4', closing: 'C2' },
      // First opening draw lands on O1 (repeat) → re-pick draws O3.
      rng: sequenceRng([0.0, 0.99, 0.0, 0.0]),
    });
    expect(result.templateIds.opening).toBe('O3');
  });
});
