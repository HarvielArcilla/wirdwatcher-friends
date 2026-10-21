// Word games of chance, shared by the Casino (you against the house) and
// lobby tables (friends betting on the same spins and hands). Every game
// has a house edge, like a real one.
//
// Letter Roulette: 27 pockets, A to Z and a star. Bet on a letter, a
// colour, vowels or consonants, a half of the alphabet, or a whole word:
// a word bet wins if the ball lands on any of its letters, and pays more
// the fewer letters it has.
//
// Word Blackjack: letter tiles instead of cards, worth their Scrabble points
// plus one. Get closer to 21 than the dealer without going over. Tiles are
// small, so it's easy to creep close: the dealer draws to 20 and wins ties.
// If the tiles in a winning hand spell a word of four letters or more, the
// win pays double. With the best play that returns about 98% (measured over
// thousands of hands), close to real blackjack.
//
// Wheel of Words: a money wheel. Each segment is a word, and a word pays as
// many to one as it has letters. The two stars pay 40 to 1.

// --- Letter Roulette ----------------------------------------------------------------
export const POCKETS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '★']
export const STAR = 26
export const VOWELS = new Set([...'AEIOU'])
export const pocketColor = (i) => (i === STAR ? 'green' : i % 2 ? 'black' : 'red')
// Bet kinds: { kind, pick } → which pockets win, and what a win pays (to 1).
export function rouletteBet (kind, pick) {
  const all = POCKETS.slice(0, 26)
  switch (kind) {
    case 'letter': { const p = String(pick || '').toUpperCase(); if (!/^[A-Z★]$/.test(p)) return null; return { wins: [p], pays: 25 } }
    case 'red': return { wins: all.filter((_, i) => pocketColor(i) === 'red'), pays: 1 }
    case 'black': return { wins: all.filter((_, i) => pocketColor(i) === 'black'), pays: 1 }
    case 'vowel': return { wins: [...VOWELS], pays: 4.2 }
    case 'consonant': return { wins: all.filter((l) => !VOWELS.has(l)), pays: 0.25 }
    case 'low': return { wins: all.slice(0, 13), pays: 1 } // A–M
    case 'high': return { wins: all.slice(13), pays: 1 } // N–Z
    case 'word': {
      const letters = [...new Set(String(pick || '').toUpperCase().replace(/[^A-Z]/g, ''))]
      if (letters.length < 1 || letters.length > 13) return null
      // Fair odds would be 26 / letters - 1 to 1; the star keeps the edge.
      return { wins: letters, pays: Math.floor(((26 / letters.length) - 1) * 100) / 100 }
    }
    default: return null
  }
}
export const ROULETTE_KINDS = ['letter', 'word', 'red', 'black', 'vowel', 'consonant', 'low', 'high']
// What a bet pays back in all (stake included), on the pocket that came up.
export function roulettePayout (bet, pocket) {
  const b = rouletteBet(bet.kind, bet.pick)
  if (!b) return 0
  return b.wins.includes(POCKETS[pocket]) ? bet.amount * (1 + b.pays) : 0
}

// --- Word Blackjack ------------------------------------------------------------------
// The Scrabble bag (no blanks): letter, how many, points.
const BAG = [['A', 9, 1], ['B', 2, 3], ['C', 2, 3], ['D', 4, 2], ['E', 12, 1], ['F', 2, 4], ['G', 3, 2], ['H', 2, 4], ['I', 9, 1], ['J', 1, 8], ['K', 1, 5], ['L', 4, 1], ['M', 2, 3], ['N', 6, 1], ['O', 8, 1], ['P', 2, 3], ['Q', 1, 10], ['R', 6, 1], ['S', 4, 1], ['T', 6, 1], ['U', 4, 1], ['V', 2, 4], ['W', 2, 4], ['X', 1, 8], ['Y', 2, 4], ['Z', 1, 10]]
export const TILE_POINTS = Object.fromEntries(BAG.map(([l, , p]) => [l, p]))
export const tileValue = (l) => TILE_POINTS[l] + 1
export const BJ_TARGET = 21
export const DEALER_STANDS = 20
export const WORD_MIN = 4
export function freshBag () { const out = []; for (const [l, n] of BAG) for (let i = 0; i < n; i++) out.push(l); return out }
export const handTotal = (tiles) => tiles.reduce((a, l) => a + tileValue(l), 0)
// A hand's result against the dealer's: 'bust', 'win' or 'lose' (the
// dealer wins ties).
export function bjResult (mine, dealer) {
  const m = handTotal(mine); const d = handTotal(dealer)
  if (m > BJ_TARGET) return 'bust'
  if (d > BJ_TARGET || m > d) return 'win'
  return 'lose'
}
// What a hand pays back in all: a win pays 1 to 1, or 2 to 1 with a word.
export function bjPayout (stake, result, word) {
  if (result === 'win') return stake * (word ? 3 : 2)
  if (result === 'push') return stake
  return 0
}
// The longest word the tiles can spell (any of them, in any order), from a
// lookup by sorted letters. byLetters(sortedLower) → word or null.
export function wordInTiles (tiles, byLetters) {
  const n = tiles.length
  let best = null
  for (let mask = 1; mask < (1 << n); mask++) {
    let k = 0
    for (let i = 0; i < n; i++) if (mask & (1 << i)) k++
    if (k < WORD_MIN || (best && k <= best.length)) continue
    const key = tiles.filter((_, i) => mask & (1 << i)).map((l) => l.toLowerCase()).sort().join('')
    const w = byLetters(key)
    if (w) best = w
  }
  return best
}

// --- Wheel of Words ------------------------------------------------------------------
// [word, how many segments, pays to 1]. 54 segments in all.
export const WHEEL = [
  ['A', 24, 1],
  ['AN', 15, 2],
  ['WORDS', 7, 5],
  ['DICTIONARY', 4, 10],
  ['UNCHARACTERISTICALLY', 2, 20],
  ['★ WIRD', 1, 40],
  ['★ LEXICON', 1, 40]
]
export const WHEEL_IDS = WHEEL.map(([w]) => w)
// The segments in order round the wheel, spread out.
export const WHEEL_SEGMENTS = (() => {
  const counts = Object.fromEntries(WHEEL.map(([w, n]) => [w, n]))
  const out = []
  const order = ['A', 'AN', 'A', 'WORDS', 'A', 'AN', 'A', 'DICTIONARY', 'A', 'AN', 'A', 'WORDS', 'A', 'AN', 'UNCHARACTERISTICALLY', 'A', 'AN', 'A', 'WORDS', 'A', 'AN', 'A', 'DICTIONARY', 'A', 'AN', '★ WIRD', 'A', 'AN', 'A', 'WORDS', 'A', 'AN', 'A', 'DICTIONARY', 'A', 'AN', 'A', 'WORDS', 'A', 'AN', 'UNCHARACTERISTICALLY', 'A', 'AN', 'A', 'WORDS', 'A', 'AN', 'DICTIONARY', 'A', 'AN', 'WORDS', 'A', 'AN', '★ LEXICON']
  for (const w of order) if (counts[w] > 0) { out.push(w); counts[w]-- }
  for (const [w, n] of Object.entries(counts)) for (let i = 0; i < n; i++) out.push(w)
  return out
})()
export const wheelPays = (word) => WHEEL.find(([w]) => w === word)?.[2] ?? 0
export function wheelPayout (bet, segment) {
  return WHEEL_SEGMENTS[segment] === bet.pick ? bet.amount * (1 + wheelPays(bet.pick)) : 0
}

// --- one round, from shared randomness --------------------------------------------------
// A table's outcomes come from a seed (the lobby combines one from every
// player, so nobody can steer them). Turn bytes into a fair number below n.
export function pickFrom (seedHex, n, salt = '') {
  // Simple, unbiased enough for a game: 52 bits of a hash.
  let h1 = 0xdeadbeef; let h2 = 0x41c6ce57
  const s = `${seedHex}|${salt}`
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677) }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  const x = 4294967296 * (2097151 & h2) + (h1 >>> 0)
  return Math.floor((x / 9007199254740992) * n)
}
// A bag shuffled from a seed.
export function shuffledBag (seedHex) {
  const bag = freshBag()
  for (let i = bag.length - 1; i > 0; i--) { const j = pickFrom(seedHex, i + 1, `s${i}`); [bag[i], bag[j]] = [bag[j], bag[i]] }
  return bag
}
