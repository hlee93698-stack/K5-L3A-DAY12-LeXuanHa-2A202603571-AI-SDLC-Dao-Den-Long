// mulberry32: small, fast, deterministic PRNG. Same seed -> same sequence on every platform.
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Map any integer string/number (including negative or > 2^32) to a uint32 seed. */
export function seedToUint32(seed: string | number): number {
  const big = BigInt(typeof seed === 'number' ? Math.trunc(seed) : seed.trim());
  return Number(BigInt.asUintN(32, big));
}
