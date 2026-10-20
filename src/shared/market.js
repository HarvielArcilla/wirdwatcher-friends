// The Word Exchange: a stock market of words that every copy of wirdwatcher
// agrees on without talking to anyone. A word's price is a pure function of
// the word and the time (UTC), so the same minute shows the same price on
// every computer, and any moment, past or present, can be worked out
// directly (charts are as cheap a year back as a minute back).
//
//   log price = log(listing price)
//             + growth × years since the market opened   (long term, up)
//             + the word's own waves                    (hours to months)
//             + its sector's waves                      (words of a topic move together)
//             + news                                    (seeded jumps that fade)
//
// The waves are bounded, so a price can never reach 0, and the growth
// always wins in the end. Obscure words (one meaning, few synonyms) swing
// hardest; everyday words with many meanings are the blue chips.
//
// THIS IS MARKET v1. Changing any number here rewrites every price ever
// shown, so don't: add a v2 instead.

export const MARKET_VERSION = 1
export const MARKET_OPEN = Date.UTC(2026, 0, 1) // prices start here
export const QUOTE_MS = 60000 // a price holds for a minute
export const SPREAD = 0.005 // buy 0.5% over, sell 0.5% under: 1% round trip
const YEAR_MS = 365.25 * 24 * 3600e3
const HOUR = 3600e3

// Sectors: the topic playlists, plus one for everything else.
export const SECTORS = [
  { id: 'animals', name: 'Animals', emoji: '🦊' },
  { id: 'food', name: 'Food & drink', emoji: '🍜' },
  { id: 'plants', name: 'Plants', emoji: '🌿' },
  { id: 'body', name: 'Body', emoji: '🫀' },
  { id: 'feelings', name: 'Feelings', emoji: '💭' },
  { id: 'nature', name: 'Weather & nature', emoji: '⛈️' },
  { id: 'people', name: 'People', emoji: '🧑‍🤝‍🧑' },
  { id: 'things', name: 'Things', emoji: '🧰' },
  { id: 'places', name: 'Places', emoji: '🗺️' },
  { id: 'motion', name: 'On the move', emoji: '🏃' },
  { id: 'talk', name: 'Talking', emoji: '🗣️' },
  { id: 'mind', name: 'Thinking', emoji: '🧠' },
  { id: 'describing', name: 'Describing words', emoji: '✨' },
  { id: 'adverbs', name: 'Adverbs', emoji: '💨' },
  { id: 'misc', name: 'Miscellany', emoji: '🎩' }
]
export const sectorOf = (id) => SECTORS.find((s) => s.id === id) || SECTORS[SECTORS.length - 1]

// --- deterministic randomness -------------------------------------------------------
// 32-bit integer hashing only (Math.imul and shifts), identical everywhere.

export function hash32 (str, seed = 0x9e3779b9) {
  let h = seed ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 0x5bd1e995)
    h ^= h >>> 15
  }
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}
const mix = (a, b) => {
  let h = Math.imul(a ^ Math.imul(b, 0x9e3779b1), 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}
const unit = (h) => h / 4294967296 // [0, 1)
const signed = (h) => unit(h) * 2 - 1 // [-1, 1)

// Smooth value noise in [-1, 1]: random values at whole steps, eased between.
function wave (seed, x) {
  const i = Math.floor(x)
  const f = x - i
  const u = f * f * (3 - 2 * f)
  const a = signed(mix(seed, i | 0))
  const b = signed(mix(seed, (i + 1) | 0))
  return a + (b - a) * u
}

// --- what a word is like on the market ----------------------------------------------
// facts: { sector, senses, synonyms } from the word list.

export function profile (word, facts = {}) {
  const h = hash32(`v1|${word}`)
  const senses = Math.max(1, facts.senses || 1)
  const syns = Math.max(0, facts.synonyms || 0)
  // How well known a word is: more meanings and synonyms, more known.
  const fame = Math.log(1 + senses) + 0.5 * Math.log(1 + syns)
  const vol = Math.min(0.85, Math.max(0.12, 0.9 - 0.28 * fame)) // how hard it swings
  const list = 5 + 495 * unit(mix(h, 1)) ** 2 // listing price, 5 to 500 (most are cheap)
  const growth = 0.55 + 0.35 * unit(mix(h, 2)) // log growth a year: about 1.7× to 2.5×
  const sector = SECTORS.some((s) => s.id === facts.sector) ? facts.sector : 'misc'
  return { word, h, vol, list, growth, sector, fame }
}

// The waves: [period in hours, weight]. Weights sum to about 1.
const WAVES = [[1, 0.06], [6, 0.12], [24, 0.22], [24 * 7, 0.3], [24 * 30, 0.3]]
const SECTOR_WAVES = [[24, 0.15], [24 * 7, 0.25], [24 * 45, 0.3]]

// News: on some days a word jumps (or slumps) and then drifts back over a
// few days. Only the last fortnight of news still matters.
const NEWS_CHANCE = 0.025 // per word per day
const NEWS_DAYS = 14

function newsAt (p, t) {
  const day = Math.floor((t - MARKET_OPEN) / (24 * HOUR))
  let total = 0
  const events = []
  for (let d = day - NEWS_DAYS; d <= day; d++) {
    const r = mix(p.h, 7777 + d)
    if (unit(r) >= NEWS_CHANCE) continue
    const start = MARKET_OPEN + d * 24 * HOUR + unit(mix(r, 1)) * 24 * HOUR
    if (t < start) continue
    const size = (0.25 + 0.75 * unit(mix(r, 2))) * (unit(mix(r, 3)) < 0.62 ? 1 : -1) * (0.5 + p.vol)
    const ageH = (t - start) / HOUR
    const rise = Math.min(1, ageH / 2) // over two hours
    const fade = Math.exp(-ageH / (24 * (1.5 + 3 * unit(mix(r, 4))))) // over a few days
    total += size * rise * fade
    events.push({ at: start, size })
  }
  return { total, events }
}

// log price at time t (ms, UTC).
function logPrice (p, t) {
  const hours = (t - MARKET_OPEN) / HOUR
  let x = Math.log(p.list) + p.growth * ((t - MARKET_OPEN) / YEAR_MS)
  let own = 0
  WAVES.forEach(([period, w], k) => { own += w * wave(mix(p.h, 100 + k), hours / period) })
  const sh = hash32(`sector|${p.sector}`)
  let sector = 0
  SECTOR_WAVES.forEach(([period, w], k) => { sector += w * wave(mix(sh, 200 + k), hours / period) })
  x += p.vol * (1.1 * own + 0.7 * sector) + newsAt(p, t).total
  return x
}

// The price for the minute containing t, to the hundredth of a coin.
export const quoteTime = (t) => Math.floor(t / QUOTE_MS) * QUOTE_MS
export function priceAt (p, t) {
  const q = quoteTime(Math.max(MARKET_OPEN, t))
  return Math.max(0.01, Math.round(Math.exp(logPrice(p, q)) * 100) / 100)
}
export const buyPrice = (price) => Math.round(price * (1 + SPREAD) * 100) / 100
export const sellPrice = (price) => Math.round(price * (1 - SPREAD) * 100) / 100

// Prices over a span: n points from `from` to `to`.
export function series (p, from, to, n = 120) {
  const out = []
  const step = (to - from) / Math.max(1, n - 1)
  for (let i = 0; i < n; i++) { const t = from + step * i; out.push([quoteTime(t), priceAt(p, t)]) }
  return out
}

// The day's headline for a word, if it has news in the last day.
export function headline (p, t) {
  const { events } = newsAt(p, t)
  const recent = events.filter((e) => t - e.at < 24 * HOUR).sort((a, b) => Math.abs(b.size) - Math.abs(a.size))[0]
  if (!recent) return null
  const up = recent.size > 0
  const pct = Math.round((Math.exp(Math.abs(recent.size)) - 1) * 100)
  return { at: recent.at, up, pct, size: recent.size }
}

// The sector itself as an index: its waves plus the average growth, from 100.
export function sectorIndex (sectorId, t) {
  const hours = (t - MARKET_OPEN) / HOUR
  const sh = hash32(`sector|${sectorId}`)
  let s = 0
  SECTOR_WAVES.forEach(([period, w], k) => { s += w * wave(mix(sh, 200 + k), hours / period) })
  return Math.round(100 * Math.exp(0.72 * ((t - MARKET_OPEN) / YEAR_MS) + 0.45 * 0.7 * s) * 100) / 100
}
