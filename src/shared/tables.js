// Word games of chance, shared by the Casino (you against the house) and
// lobby tables (friends betting on the same spins and hands). Roulette and
// the wheel keep a small house edge; Wordjack has none.
//
// Letter Roulette: 27 pockets, A to Z and a star. Bet on a letter, a
// colour, vowels or consonants, a half of the alphabet, or a whole word:
// a word bet wins if the ball lands on any of its letters, and pays more
// the fewer letters it has.
//
// Wordjack: letter tiles instead of cards, each worth its Scrabble points
// plus 3. A hand is worth its best word: the highest-scoring word some of
// its tiles spell. Tiles the word doesn't use stay in the hand, so every
// draw can push the best word over 21, and that's a bust. The dealer draws
// to 17. Ties push, a win pays 1 to 1 and a Wordjack (exactly 21) pays 3 to
// 2: played well it comes out even (measured over thousands of hands). No
// house edge; it's for fun.
//
// Wheel of Words: a word puzzle with a wheel. Spin for a value, call
// consonants, buy vowels, and solve the word to keep what you've banked.

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

// --- Wordjack ----------------------------------------------------------------------
// The Scrabble bag (no blanks): letter, how many, points.
const BAG = [['A', 9, 1], ['B', 2, 3], ['C', 2, 3], ['D', 4, 2], ['E', 12, 1], ['F', 2, 4], ['G', 3, 2], ['H', 2, 4], ['I', 9, 1], ['J', 1, 8], ['K', 1, 5], ['L', 4, 1], ['M', 2, 3], ['N', 6, 1], ['O', 8, 1], ['P', 2, 3], ['Q', 1, 10], ['R', 6, 1], ['S', 4, 1], ['T', 6, 1], ['U', 4, 1], ['V', 2, 4], ['W', 2, 4], ['X', 1, 8], ['Y', 2, 4], ['Z', 1, 10]]
// A tile is worth its Scrabble points plus 3 (E is 4, Q is 13), so every
// draw is a real step, like a card.
export const TILE_POINTS = Object.fromEntries(BAG.map(([l, , p]) => [l, p + 3]))
export const WJ_TARGET = 21
export const DEALER_STANDS = 17
export const MAX_TILES = 30 // a hand can't grow past this (it's bust long before)
export const WORD_MIN = 2
export function freshBag () { const out = []; for (const [l, n] of BAG) for (let i = 0; i < n; i++) out.push(l); return out }
export const tilePoints = (tiles) => tiles.reduce((a, l) => a + (TILE_POINTS[l] || 0), 0)

// The words Wordjack knows, best-scoring first, each with its letter counts.
// Built when first needed: lexicon(() => ['cat', 'quiz', ...]).
const A = 65
export function lexicon (getWords) {
  let entries = null
  return {
    get entries () {
      if (!entries) {
        entries = []
        for (const w of getWords()) {
          if (!/^[a-z]{2,15}$/.test(w)) continue
          const up = w.toUpperCase()
          const counts = new Uint8Array(26)
          for (const ch of up) counts[ch.charCodeAt(0) - A]++
          entries.push({ word: w, score: tilePoints([...up]), counts, len: w.length })
        }
        entries.sort((a, b) => b.score - a.score || b.len - a.len)
      }
      return entries
    }
  }
}

// A hand's best word: the highest-scoring word (by Scrabble points) that
// some of its tiles spell, in any order. { word, score, used } where used
// is which tiles it takes; { word: null, score: 0 } if none spell one.
const memos = new WeakMap()
export function bestWord (tiles, lex) {
  let memo = memos.get(lex)
  if (!memo) { memo = new Map(); memos.set(lex, memo) }
  const key = [...tiles].sort().join('')
  let found = memo.get(key)
  if (found === undefined) {
    found = { word: null, score: 0 }
    const have = new Uint8Array(26)
    let total = 0
    for (const l of tiles) { have[l.charCodeAt(0) - A]++; total += TILE_POINTS[l] || 0 }
    // Best first, so the first word the tiles can spell is the answer.
    for (const e of lex.entries) {
      if (e.score > total || e.len > tiles.length) continue
      let ok = true
      for (let i = 0; i < 26; i++) if (e.counts[i] > have[i]) { ok = false; break }
      if (ok) { found = { word: e.word, score: e.score }; break }
    }
    if (memo.size > 50000) memo.clear()
    memo.set(key, found)
  }
  // Which of these tiles the word takes.
  const used = []
  if (found.word) {
    const left = [...found.word.toUpperCase()]
    tiles.forEach((l, i) => { const j = left.indexOf(l); if (j >= 0) { left.splice(j, 1); used.push(i) } })
  }
  return { word: found.word, score: found.score, used }
}

// A hand's result against the dealer's: 'bust', 'win', 'push' or 'lose'.
export function wjResult (mine, dealer) {
  if (mine > WJ_TARGET) return 'bust'
  if (dealer > WJ_TARGET || mine > dealer) return 'win'
  return mine === dealer ? 'push' : 'lose'
}
// What a hand pays back in all: a win doubles the stake (a Wordjack, a
// winning word worth exactly 21, pays 3 to 2), a push returns it.
export function wjPayout (stake, result, score = 0) {
  if (result === 'win') return score === WJ_TARGET ? stake * 2.5 : stake * 2
  if (result === 'push') return stake
  return 0
}
// Is this hand finished growing? (Bust, 21, or full.)
export const handDone = (tiles, byLetters) => tiles.length >= MAX_TILES || bestWord(tiles, byLetters).score >= WJ_TARGET

// A hand from a bag and the moves made: two tiles, then one for each hit
// (or the double).
export function playHand (bag, moves, byLetters) {
  const b = [...bag]
  const hand = [b.pop(), b.pop()]
  for (const m of moves) {
    if (handDone(hand, byLetters)) break
    if (m === 'hit' || m === 'double') hand.push(b.pop())
    if (m === 'double' || m === 'stand') break
  }
  return hand
}
// The dealer draws until their best word is worth 17 or more.
export function dealerHand (bag, byLetters, start = null) {
  const b = [...bag]
  const hand = start ? [...start] : [b.pop(), b.pop()]
  while (bestWord(hand, byLetters).score < DEALER_STANDS && hand.length < MAX_TILES) hand.push(b.pop())
  return hand
}

// --- Wheel of Words -----------------------------------------------------------------
// A hidden word, shown as blanks, with a clue (what kind of word it is).
// Put in a stake, then:
//   Spin      the wheel lands on a value (a share of your stake) and you call
//             a consonant: each time it's in the word adds the value to your
//             bank. Not in the word is a miss. Bankrupt empties the bank;
//             Lose a Turn is a miss.
//   Vowel     buy one for a quarter of your stake, out of the bank.
//   Solve     type the word: right, and the bank is yours; wrong is a miss.
// Six misses and the word's gone, bank and all. Played well, it pays back
// about what goes in (measured over thousands of words).
export const WF_MISSES = 6
export const WF_VOWEL = 0.25
export const WF_SEGMENTS = [0.25, 0.15, 0.6, 0.2, 'bankrupt', 0.3, 0.25, 0.9, 0.2, 0.4, 'lose', 0.15, 0.5, 0.25, 1.25, 0.3, 'bankrupt', 0.4, 0.6]
export const WF_VOWELS = new Set([...'AEIOU'])
// The word as it stands: letters called so far shown, the rest blank.
export const wfPattern = (word, called) => [...word.toUpperCase()].map((l) => (called.includes(l) ? l : null))

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
