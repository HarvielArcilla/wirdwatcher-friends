// The Leximon: words you catch, raise and duel with. The rules, shared by the
// app and (for friends' teams and duels) every other copy.
//
// What a word is never matters: "the" can become as mighty as "serendipity".
//   - Rarity comes from how YOU feel about it: the score you gave it. Only
//     the very ends of the scale can be Beloved (4.8 and up) or Nemesis
//     (0.2 and down), and so on inward for the other tiers. Crowding a band
//     makes its tier harder to get, so a careful, varied rater does best
//     and rating everything 5.0 or 0.0 gets almost nothing (see
//     rarityFor). It's fixed when you catch the word.
//   - Everything else is growth. Your team of three gains XP every time you
//     rate a new word, the score never matters. Coins can only help a
//     little: training is capped at a few hours a day per word however rich
//     you are, and a focus boost tops out at 1.5×.
//   - Tiers change how a word looks and multiply its power. Every 25 levels
//     a word must ascend (coins) to level on, so coins are the gate and
//     ratings are the engine.

export const RARITIES = [
  { id: 0, name: 'Common', love: 'Common', hate: 'Common', mult: 1 },
  { id: 1, name: 'Uncommon', love: 'Fond', hate: 'Disliked', mult: 1.15 },
  { id: 2, name: 'Rare', love: 'Adored', hate: 'Loathed', mult: 1.35 },
  { id: 3, name: 'Epic', love: 'Cherished', hate: 'Despised', mult: 1.6 },
  { id: 4, name: 'Legendary', love: 'Beloved', hate: 'Nemesis', mult: 2 }
]
export const rarityName = (r) => (r.side === 'love' ? RARITIES[r.tier].love : r.side === 'hate' ? RARITIES[r.tier].hate : RARITIES[r.tier].name)

export const MIN_RATINGS_FOR_RARITY = 20 // before that, everything's Common
export const RARITY_WINDOW = 300 // rarity looks at your latest ratings, so habits can change

// Rarity comes from the score you gave the word. Each tier has a band at
// each end of the scale (they don't overlap), and a share of your ratings
// it expects to see there: about what someone who uses the whole scale has.
//   [tier, love from, love to, hate from, hate to, target share, steepness]
export const RARITY_BANDS = [
  [4, 4.8, 5, 0, 0.2, 0.06, 2],
  [3, 4.4, 4.7, 0.3, 0.6, 0.08, 2],
  [2, 4.0, 4.3, 0.7, 1.0, 0.08, 1],
  [1, 3.4, 3.9, 1.1, 1.6, 0.12, 1]
]

// A word gets one try at its band's tier. Its chance is the band's target
// over the share of your ratings that are in that band (capped at 1), so
// if you keep a band for the words that really belong there, every one of
// them gets it; if you pile ratings into it, each gets less. At the very
// ends the chance falls off with the square, so rating everything 5.0 (or
// 0.0) makes Beloved (or Nemesis) rare, but never impossible. A word that
// misses its try is Common. `roll` is the word's own number in [0, 1) (see
// rarityRoll), so the same word always rolls the same.
export function rarityFor (r, all, roll = 0) {
  const n = all.length
  if (n < MIN_RATINGS_FOR_RARITY) return { tier: 0, side: null, chance: 0 }
  for (const [tier, la, lb, ha, hb, target, k] of RARITY_BANDS) {
    const love = r >= la - 1e-9 && r <= lb + 1e-9
    const hate = r >= ha - 1e-9 && r <= hb + 1e-9
    if (!love && !hate) continue
    const inBand = all.filter((x) => (love ? x >= la - 1e-9 && x <= lb + 1e-9 : x >= ha - 1e-9 && x <= hb + 1e-9)).length
    const share = Math.max(inBand, 1) / n
    const chance = Math.min(1, (target / share) ** k)
    return roll < chance ? { tier, side: love ? 'love' : 'hate', chance: Math.round(chance * 1000) / 1000 } : { tier: 0, side: null, chance: Math.round(chance * 1000) / 1000 }
  }
  return { tier: 0, side: null, chance: 0 }
}

// A word's own number for its rarity roll: the same every time for the
// same player and word, so nothing is gained by trying again.
export function rarityRoll (word, salt = '') {
  let h = 2166136261
  const s = `rarity|${salt}|${word}`
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15
  return (h >>> 0) / 4294967296
}

// Stances: chosen by you, not the word. Charm beats Spite, Spite beats
// Guard, Guard beats Charm.
export const STANCES = [
  { id: 'charm', name: 'Charm', emoji: '💗', beats: 'spite' },
  { id: 'spite', name: 'Spite', emoji: '🗡️', beats: 'guard' },
  { id: 'guard', name: 'Guard', emoji: '🛡️', beats: 'charm' }
]
export const stanceFor = (side) => (side === 'love' ? 'charm' : side === 'hate' ? 'spite' : 'guard')
export const stanceEdge = (a, b) => (STANCES.find((s) => s.id === a)?.beats === b ? 1.25 : STANCES.find((s) => s.id === b)?.beats === a ? 0.8 : 1)

// Growth.
export const RATING_XP = 10 // each team word, for each new word you rate
export const LOBBY_XP = 10 // each team word, for each lobby round
export const LEVELS_PER_TIER = 25
export const xpToNext = (level) => Math.round(15 + 2 * level ** 1.5)
export const levelCap = (tier) => LEVELS_PER_TIER * tier
export const ascendCost = (tier) => Math.round(2e4 * 30 ** (tier - 1)) // to go from tier to tier + 1

export function power (card) {
  const rar = RARITIES[card.rarity?.tier || 0].mult
  return 10 * rar * 2 ** ((card.tier || 1) - 1) * 1.09 ** ((card.level || 1) - 1)
}

// Training: XP over time for coins, capped per word per (UTC) day.
export const TRAIN_XP_PER_HOUR = 35 // a full day's training ≈ 20 ratings
export const TRAIN_MAX_HOURS = 6
export const TRAIN_SLOTS = 3
export const trainCostPerHour = (level) => Math.round(40 * 1.05 ** level)

// Focus: speeds up what rating gives the team, for an hour. Never above 1.5×.
// It costs some minutes of what the wirdhouse makes, so it's a choice at
// any size.
export const FOCUS = [
  { id: 'focus-1', mult: 1.25, mins: 60, cost: (cps) => Math.round(Math.max(300, cps * 600)) },
  { id: 'focus-2', mult: 1.5, mins: 60, cost: (cps) => Math.round(Math.max(1500, cps * 3000)) }
]

// The team's help to the wirdhouse: a little for every order of magnitude
// of each equipped word's power.
export const leximonBonus = (team) => team.reduce((a, c) => a + Math.max(0, Math.log10(power(c))) * 0.005, 0)

// Encounters: a wild word every 6 to 12 new ratings.
export const nextEncounterIn = (rand) => 6 + Math.floor(rand * 7)

// --- duels ---------------------------------------------------------------------------
// Three bouts, word against word in team order. Each side's strength is the
// size of its power (its order of magnitude, so a big lead matters but isn't
// everything), the stance edge, and a little luck from a seed both sides
// can compute.

export const DUELS_PER_DAY = 5
export const DUEL_XP = { win: 30, loss: 10 }

export function seededRandom (seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function duel (mine, theirs, seed) {
  const rand = seededRandom(seed)
  const bouts = []
  let wins = 0
  let losses = 0
  for (let i = 0; i < 3; i++) {
    const a = mine[i]
    const b = theirs[i]
    if (!a && !b) continue
    if (!b) { bouts.push({ a, b: null, win: true, sa: 1, sb: 0 }); wins++; continue }
    if (!a) { bouts.push({ a: null, b, win: false, sa: 0, sb: 1 }); losses++; continue }
    const sa = (1 + Math.log10(power(a))) * stanceEdge(a.stance, b.stance) * (0.85 + 0.3 * rand())
    const sb = (1 + Math.log10(power(b))) * stanceEdge(b.stance, a.stance) * (0.85 + 0.3 * rand())
    const win = sa >= sb
    if (win) wins++
    else losses++
    bouts.push({ a, b, win, sa: Math.round(sa * 100) / 100, sb: Math.round(sb * 100) / 100 })
  }
  return { bouts, wins, losses, won: wins > losses }
}

// A team as friends see it (and the shape accepted from a friend).
export function cleanCard (c) {
  if (!c || typeof c !== 'object' || typeof c.word !== 'string' || c.word.length > 60) return null
  const tier = Math.max(1, Math.min(1000, Math.floor(Number(c.tier) || 1)))
  const level = Math.max(1, Math.min(levelCap(tier), Math.floor(Number(c.level) || 1)))
  const rt = Math.max(0, Math.min(4, Math.floor(Number(c.rarity?.tier) || 0)))
  const side = c.rarity?.side === 'love' || c.rarity?.side === 'hate' ? c.rarity.side : null
  const stance = STANCES.some((s) => s.id === c.stance) ? c.stance : 'guard'
  return { word: c.word, tier, level, rarity: { tier: rt, side: rt ? side : null }, stance }
}
export const cleanTeam = (team) => (Array.isArray(team) ? team.slice(0, 3).map(cleanCard).filter(Boolean) : [])
