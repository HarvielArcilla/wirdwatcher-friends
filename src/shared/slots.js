// Wird Slots: five reels of letters, weighted like English. Spell a word and
// it pays: the longest real word anywhere in the five, read left to right.
// A full five-letter word is the jackpot.
//
// The paytable is set so the machine pays back about 95% of what goes in
// (test/casino.test.js works it out exactly over every possible spin), so
// it slowly wins, like a real one. Winnings never count toward ink.

// How often each letter turns up on a reel, out of 10,000.
export const LETTER_WEIGHTS = { e: 1200, t: 910, a: 820, o: 750, i: 700, n: 670, s: 630, h: 610, r: 600, d: 430, l: 400, c: 280, u: 280, m: 240, w: 240, f: 220, g: 200, y: 200, p: 190, b: 150, v: 100, k: 80, j: 15, x: 15, q: 10, z: 7 }
export const LETTERS = Object.keys(LETTER_WEIGHTS)
export const WEIGHT_TOTAL = LETTERS.reduce((a, k) => a + LETTER_WEIGHTS[k], 0)
export const PAYS = { 3: 1.5, 4: 6, 5: 155 }

// The letter for a number from 0 to WEIGHT_TOTAL - 1.
export function letterAt (n) {
  for (const k of LETTERS) { n -= LETTER_WEIGHTS[k]; if (n < 0) return k }
  return 'e'
}

// What five letters pay: the longest word in them (the leftmost of ties).
export function evaluate (reels, isWord) {
  const s = reels.join('')
  if (isWord(s)) return { len: 5, word: s, at: 0, mult: PAYS[5] }
  for (const len of [4, 3]) {
    for (let at = 0; at + len <= 5; at++) {
      const w = s.slice(at, at + len)
      if (isWord(w)) return { len, word: w, at, mult: PAYS[len] }
    }
  }
  return { len: 0, word: null, at: -1, mult: 0 }
}

// The words the machine knows: plain letters, three to five of them.
export const slotWord = (w) => /^[a-z]{3,5}$/.test(w)
