// Deterministic RNG utilities — the same algorithms the Phase 0 specs pin down
// (PHASE0-DEEP-DIVE §B4): FNV-1a string hashing + mulberry32 streams.
// Seeded RNG is for reproducibility in QA, never a substitute for stored state.

/** FNV-1a 32-bit hash of a string, returned as an unsigned 32-bit integer. */
export function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** mulberry32 PRNG factory: same seed → same stream, on every device. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh uint32 master seed from a cryptographic source. */
export function newMasterSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0];
}
