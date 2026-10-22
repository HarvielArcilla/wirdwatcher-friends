// Penguin Cross: a penguin crosses a busy road, one lane at a time.
//
// The road is a hidden word: one lane per letter, and each lane the penguin
// makes it across shows that lane's letter. Every safe hop multiplies what
// you'd get back; cash out whenever you like, or keep going. A car in a lane
// ends the run and the stake is gone. Make it across every lane and the word
// is spelled out: the full multiplier, paid automatically.
//
// No house edge: a lane is safe with chance p, and after k safe lanes the
// multiplier is (1/p)^k, so cashing out at any lane pays back the stake on
// average. Only the rounding (down, to the coin and to 0.01×) keeps a hair.

export const PC_LEVELS = {
  easy: { name: 'Quiet street', safe: 0.9 },
  medium: { name: 'Rush hour', safe: 0.78 },
  hard: { name: 'Highway', safe: 0.6 }
}
export const PC_MIN_STAKE = 1

// After k safe lanes: what the stake is multiplied by.
export const pcMult = (level, k) => Math.floor(100 * Math.pow(1 / PC_LEVELS[level].safe, k) + 1e-9) / 100

// What cashing out after k lanes pays.
export const pcPayout = (stake, level, k) => Math.floor(stake * pcMult(level, k))

// Where the first car is (a lane index), or null if the road is clear. Each
// lane is decided by a uniform number in [0, 1).
export function pcFirstCar (level, lanes, rand) {
  const p = PC_LEVELS[level].safe
  for (let i = 0; i < lanes; i++) if (rand() >= p) return i
  return null
}
