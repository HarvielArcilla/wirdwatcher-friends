// Penguin Cross: a penguin hops across a chain of iceberg islands.
//
// The chain is a hidden word: one island per letter, carved into its ice,
// and each island the penguin lands on safely shows its letter. Every safe
// hop multiplies what you'd get back; cash out whenever you like, or keep
// going. An island that crumbles underfoot ends the run and the stake is
// gone. Reach the far shore and the word is spelled out: the full
// multiplier, paid automatically.
//
// The odds are on your side: an island holds with chance p, and after k safe
// hops the multiplier is (PC_EDGE/p)^k, so cashing out after k islands pays
// back PC_EDGE^k of the stake on average (2% more per island). Reaching the
// far shore adds PC_SHORE on top. The rounding (down, to the coin and to
// 0.01×) keeps a hair.

export const PC_LEVELS = {
  easy: { name: 'Pack ice', safe: 0.9 },
  medium: { name: 'Thin ice', safe: 0.78 },
  hard: { name: 'Spring melt', safe: 0.6 }
}
export const PC_MIN_STAKE = 1

export const PC_EDGE = 1.02
export const PC_SHORE = 1.25

// After k safe hops (shore: all the way across): what the stake is multiplied by.
export const pcMult = (level, k, shore = false) => Math.floor(100 * Math.pow(PC_EDGE / PC_LEVELS[level].safe, k) * (shore ? PC_SHORE : 1) + 1e-9) / 100

// What cashing out after k islands pays.
export const pcPayout = (stake, level, k, shore = false) => Math.floor(stake * pcMult(level, k, shore))

// Which island crumbles first (an index), or null if they all hold. Each
// island is decided by a uniform number in [0, 1).
export function pcFirstCrack (level, lanes, rand) {
  const p = PC_LEVELS[level].safe
  for (let i = 0; i < lanes; i++) if (rand() >= p) return i
  return null
}
