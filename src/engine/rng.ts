/**
 * Seeded PRNG (sfc32) with a plain-array state so it can be cloned into a
 * Web Worker and back. Period ~2^128, plenty for billions of shuffles.
 */
export type RngState = [number, number, number, number];

export function seedRng(seed: number): RngState {
  // splitmix32 to spread a single seed over the 128-bit state
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
  const st: RngState = [next(), next(), next(), 1];
  for (let i = 0; i < 12; i++) nextU32(st);
  return st;
}

export function nextU32(st: RngState): number {
  let [a, b, c, d] = st;
  const t = (((a + b) | 0) + d) | 0;
  d = (d + 1) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  c = (c + t) | 0;
  st[0] = a;
  st[1] = b;
  st[2] = c;
  st[3] = d;
  return t >>> 0;
}

export function nextFloat(st: RngState): number {
  return nextU32(st) / 4294967296;
}

/** Uniform integer in [0, n). */
export function nextInt(st: RngState, n: number): number {
  return Math.floor(nextFloat(st) * n);
}

export function randomSeed(): number {
  return (Math.random() * 4294967296) >>> 0;
}
