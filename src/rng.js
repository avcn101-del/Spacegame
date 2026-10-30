// Seeded random (mulberry32). The only random source in the sim.
export function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    // weighted pick: items with .weight
    weighted: (items) => {
      let total = 0;
      for (const it of items) total += it.weight;
      let r = next() * total;
      for (const it of items) { r -= it.weight; if (r <= 0) return it; }
      return items[items.length - 1];
    },
  };
}
