// Vice Bay — a tiny seeded random source.
// The city layout, traffic colours and screenshot scenes all come from one
// seed, so the same seed always builds the same Vice Bay.

export function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rngInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

export function rngRange(rng, min, max) {
  return min + rng() * (max - min);
}

export function rngPick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

export function rngChance(rng, p) {
  return rng() < p;
}
