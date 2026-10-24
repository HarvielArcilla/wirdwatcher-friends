// Catchword: spread a word you coined until the whole world has absorbed it.
//
// Everyone in a region is one of:
//   unaware    never heard it
//   speakers   saying it, and passing it on
//   absorbed   it's just a word to them now: in their dictionary for good,
//              and they no longer pass it on (the "dead", in plague terms)
//
// You win when the world has absorbed it. You lose if nobody is left saying
// it while someone still hasn't heard it, so absorbing people too fast burns
// the word out before it's travelled. The Purists notice a notorious word and
// work on a style ruling; once it passes, speakers drop it unless it has
// staying power (the absorbed are safe). Notoriety brings more buzz, which
// pays for evolving, and brings the Purists sooner: that's the trade.
//
// Pure and seeded: the same seed and the same choices play the same, and a
// game saves as plain JSON. One step is one day.

import { Rng } from '../wirdlike/rng.js'
import { REGIONS, REGION } from './regions.js'
import { TRAIT, totalFx, traitCost, canEvolve, canDevolve, DEVOLVE_COST } from './traits.js'

export const DIFFICULTIES = {
  casual: { name: 'Casual', blurb: 'The Purists are slow and people are curious.', spread: 1.25, purist: 0.65, buzz: 8, pay: 0.6 },
  normal: { name: 'Normal', blurb: 'A fair fight with the dictionary.', spread: 1, purist: 1.45, buzz: 5, pay: 1 },
  brutal: { name: 'Brutal', blurb: 'Everyone’s heard it all before, and the Purists never sleep.', spread: 0.85, purist: 2.1, buzz: 3, pay: 1.8 }
}

const BASE_CATCH = 0.24
const BASE_ABSORB = 0.0006
const SEED_PEOPLE = 0.002 // millions: the first two thousand
const TRIP_DAYS = { air: 5, sea: 12 }
const BUBBLE_DAYS = 14
export const MAX_DAYS = 1500
const WORLD = REGIONS.reduce((a, r) => a + r.pop, 0)

// --- coining a word -----------------------------------------------------------------------
// A blend of two words you've rated: the first syllable or so of one and
// the last of the other ("pastry" + "disinfectant" → "pastant").
const V = /[aeiouy]/
export function blend (a, b) {
  a = String(a).toLowerCase().replace(/[^a-z]/g, '')
  b = String(b).toLowerCase().replace(/[^a-z]/g, '')
  if (!a || !b) return a || b
  // Head: up to the end of a's first vowel sound, plus one consonant.
  let i = 0
  while (i < a.length && !V.test(a[i])) i++
  while (i < a.length && V.test(a[i])) i++
  if (i < a.length) i++
  const head = a.slice(0, Math.max(2, Math.min(i, 5)))
  // Tail: b's last vowel sound (not a silent final e), with the consonant
  // (or pair, like "tr" or "sh") before it and whatever follows.
  let j = b.length - 1
  if (b[j] === 'e' && j > 1 && !V.test(b[j - 1])) j -= 2
  while (j > 0 && !V.test(b[j])) j--
  while (j > 0 && V.test(b[j - 1])) j--
  if (j > 0 && !V.test(b[j - 1])) j--
  if (j > 0 && /[rlh]/.test(b[j]) && !V.test(b[j - 1])) j--
  let tail = b.slice(j)
  if (tail.length < 3 && j > 0) tail = b.slice(Math.max(0, j - 2))
  // Don't pile up consonants where they meet.
  let h = head
  if (!V.test(h[h.length - 1]) && tail.length > 1 && !V.test(tail[0]) && !V.test(tail[1]) && h.length > 2) h = h.slice(0, -1)
  if (h[h.length - 1] === tail[0]) tail = tail.slice(1)
  return (h + tail).replace(/(.)\1\1+/g, '$1$1').slice(0, 14)
}

export function cleanWord (w) { return String(w || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 14) }
export const validWord = (w) => /^[a-z]{3,14}$/.test(w)

// How catchy a word is, from its shape: shorter is catchier, and words
// that are easy to say (alternating vowels and consonants) a little more.
export function wordCatch (w) {
  w = cleanWord(w)
  const short = Math.max(0, 9 - w.length) * 0.006
  let flips = 0
  for (let i = 1; i < w.length; i++) if (/[aeiouy]/.test(w[i]) !== /[aeiouy]/.test(w[i - 1])) flips++
  const easy = w.length > 1 ? (flips / (w.length - 1)) * 0.02 : 0
  return Math.round((short + easy) * 1000) / 1000
}

// --- a new game ---------------------------------------------------------------------------
export function newGame ({ word, start, difficulty = 'normal', seed = 'catchword', bonus = 0, from = [] }) {
  const diff = DIFFICULTIES[difficulty] ? difficulty : 'normal'
  if (!REGION[start]) throw new Error('Pick where it starts.')
  const g = {
    v: 1, word: cleanWord(word), start, difficulty: diff, rng: new Rng(String(seed)).s,
    day: 0, buzz: DIFFICULTIES[diff].buzz, traits: [], catchBonus: wordCatch(word) + bonus,
    regions: Object.fromEntries(REGIONS.map((r) => [r.id, { u: r.pop, s: 0, a: 0, seen: false, airOpen: true, seaOpen: true, firstAbsorbed: false }])),
    attention: 0, research: 0, purists: false, ruled: false, puristStage: 0,
    trips: [], bubbles: [], nextBubble: 1, news: [], milestones: {},
    over: null, stats: { evolved: 0, devolved: 0, popped: 0, regions: 0, peakResearch: 0, ruledDay: null },
    from: (Array.isArray(from) ? from : []).slice(0, 2).map(String), hist: [[0, 0, 0, 0]]
  }
  seedRegion(g, start, SEED_PEOPLE)
  say(g, `Someone in ${REGION[start].name} says “${g.word}” for the first time.`, 'start')
  return g
}

function seedRegion (g, id, people) {
  const z = g.regions[id]
  const n = Math.min(z.u, people)
  z.u -= n
  z.s += n
  if (!z.seen) {
    z.seen = true
    g.stats.regions++
    if (id !== g.start) {
      addBubble(g, id, 'new', 2)
      say(g, `“${g.word}” reaches ${REGION[id].name}.`, 'spread')
    }
  }
}

function say (g, text, kind = 'info') {
  g.news.push({ day: g.day, text, kind })
  if (g.news.length > 40) g.news.shift()
}

function addBubble (g, region, kind, value) {
  const r = new Rng(g.rng ^ (g.nextBubble * 2654435761))
  g.bubbles.push({ id: g.nextBubble++, region, kind, value, day: g.day, dx: r.range(-1, 1), dy: r.range(-1, 1) })
}

// --- totals -------------------------------------------------------------------------------
export function totals (g) {
  let u = 0; let s = 0; let a = 0
  for (const z of Object.values(g.regions)) { u += z.u; s += z.s; a += z.a }
  return { u, s, a, world: WORLD }
}

export function notoriety (g) {
  const fx = totalFx(g.traits)
  return Math.max(0, fx.noto + Math.min(6, g.day / 70))
}

// --- one day ------------------------------------------------------------------------------
export function step (g) {
  if (g.over) return []
  const rng = new Rng(g.rng)
  const fx = totalFx(g.traits)
  const D = DIFFICULTIES[g.difficulty]
  const noto = notoriety(g)
  const events = []
  g.day++
  const catchRate = (BASE_CATCH + g.catchBonus + fx.catch) * D.spread * (1 + noto * 0.012)
  const absorbRate = BASE_ABSORB + fx.absorb
  const formalResist = Math.min(1, fx.formal)
  const youngCut = g.puristStage >= 3 ? 0.5 : 1

  // Inside each region.
  for (const r of REGIONS) {
    const z = g.regions[r.id]
    if (z.s <= 0) continue
    const fit = Math.max(0.15, 0.35 + fx.net * r.net + fx.young * r.young * youngCut + fx.offline * (1 - r.net) + fx.old * (1 - r.young) + 0.3 * r.net + 0.25 * r.young)
    const formal = Math.max(0.12, 1 - r.formal * 0.75 * (1 - formalResist))
    let beta = catchRate * fit * formal
    if (g.ruled) beta *= 0.06
    const pop = z.u + z.s + z.a
    const caught = Math.min(z.u, beta * z.s * (z.u / pop))
    // The more of a region has absorbed it, the faster the rest stop noticing it's new.
    const absorbed = Math.min(z.s, z.s * absorbRate * (1 + 4 * (z.a / pop)) * (z.u < pop * 0.02 ? 2 : 1))
    // After a ruling speakers drop it, faster as the ruling sinks in.
    const dropped = g.ruled ? Math.min(z.s, z.s * 0.07 * (1 - 0.7 * Math.min(1, fx.resist)) * (1 + (g.day - g.stats.ruledDay) / 120)) : 0
    z.u += -caught + dropped
    z.s += caught - absorbed - dropped
    z.a += absorbed
    // The last few holdouts tip over; a handful of speakers either do or don't.
    if (z.u > 0 && z.u < pop * 0.00002 && z.s > z.u) { z.s += z.u; z.u = 0 }
    if (z.s < 0.000001) { if (z.u <= 0) z.a += z.s; else z.u += z.s; z.s = 0 }
    if (z.u <= 0 && z.s < pop * 0.00001) { z.a += z.s; z.s = 0 }
    if (!z.firstAbsorbed && z.a > pop * 0.01) {
      z.firstAbsorbed = true
      addBubble(g, r.id, 'absorb', 2)
      say(g, `People in ${r.name} stop noticing “${g.word}” is new.`, 'absorb')
    }
    // Buzz: talk about it, more for a louder word.
    const share = z.s / pop
    if (rng.chance(Math.min(0.6, 0.03 + 0.06 * Math.sqrt(share)) * (1 + noto * 0.05))) addBubble(g, r.id, 'buzz', noto >= 10 ? 2 : 1)
  }

  // Between regions: by land, on flights and on ships.
  const langOdds = (from, to) => (REGION[from].lang === REGION[to].lang ? 1 : Math.min(1, 0.3 + fx.lang))
  for (const r of REGIONS) {
    const z = g.regions[r.id]
    if (z.s <= 0) continue
    const share = z.s / (z.u + z.s + z.a)
    for (const n of r.land) {
      const y = g.regions[n]
      if (y.s > 0 || y.u <= 0) continue
      if (rng.chance(Math.min(0.5, (0.8 + fx.land) * Math.sqrt(share) * 0.06 * langOdds(r.id, n) * D.spread))) seedRegion(g, n, SEED_PEOPLE * 0.5)
    }
    for (const mode of ['air', 'sea']) {
      if (mode === 'air' ? !r.air : !r.port) continue
      const shut = (mode === 'air' ? z.airOpen : z.seaOpen) ? 1 : 0.2
      const p = shut * (0.02 + (mode === 'air' ? fx.air : fx.sea) * 0.025) * Math.min(1, share * 8 + 0.2)
      if (!rng.chance(p)) continue
      const dests = REGIONS.filter((d) => d.id !== r.id && (mode === 'air' ? d.air : d.port))
      const to = rng.weighted(dests.map((d) => [d.id, Math.pow(d.pop, 0.3)]))
      g.trips.push({ mode, from: r.id, to, day: g.day, arrive: g.day + TRIP_DAYS[mode] })
    }
  }
  for (const trip of g.trips.filter((x) => x.arrive <= g.day)) {
    const y = g.regions[trip.to]
    // A closed border lets the odd traveller through.
    const open = (trip.mode === 'air' ? y.airOpen : y.seaOpen) ? 1 : 0.12
    if (y.s <= 0 && y.u > 0 && rng.chance(open * langOdds(trip.from, trip.to) * D.spread * 0.8)) {
      seedRegion(g, trip.to, SEED_PEOPLE)
      events.push({ kind: 'landed', mode: trip.mode, to: trip.to })
    }
  }
  g.trips = g.trips.filter((x) => x.arrive > g.day)

  // The Purists.
  const now = totals(g)
  g.attention += noto * (now.s / WORLD) * 4 + (noto > 6 ? 0.02 : 0) + (now.s / WORLD > 0.05 ? 0.03 : 0)
  if (!g.purists && g.attention >= 10) {
    g.purists = true
    say(g, `The Purists have noticed “${g.word}”. They’re drafting a style ruling.`, 'purist')
    events.push({ kind: 'purists' })
  }
  if (g.purists && !g.ruled) {
    let fund = 0
    for (const r of REGIONS) { const z = g.regions[r.id]; fund += ((z.u + 0.4 * z.s) / WORLD) * r.wealth * (0.5 + r.formal) }
    const rate = D.purist * (0.06 + noto * 0.012) * fund * 9 * Math.max(0.1, 1 - Math.min(0.9, fx.purist))
    g.research = Math.min(100, g.research + rate)
    g.stats.peakResearch = Math.max(g.stats.peakResearch, g.research)
    if (rng.chance(0.04 + rate * 0.08)) { const pick = rng.pick(REGIONS.filter((r) => r.wealth > 0.6)); addBubble(g, pick.id, 'purist', 1) }
    puristSteps(g, events)
    if (g.research >= 100) {
      g.ruled = true
      g.stats.ruledDay = g.day
      say(g, `The style ruling is out: “${g.word}” is not a word. Speakers start dropping it.`, 'purist')
      events.push({ kind: 'ruled' })
    }
  }

  // Milestones of absorption pay a little buzz.
  const pct = Math.floor((now.a / WORLD) * 10)
  for (let m = 1; m <= pct && m < 10; m++) {
    if (g.milestones[m]) continue
    g.milestones[m] = true
    g.buzz += 2
    say(g, `${m * 10}% of the world has absorbed “${g.word}”.`, 'absorb')
  }

  // A line of history every few days: speakers, absorbed, the Purists, regions.
  if (g.day % 4 === 0) {
    g.hist = g.hist || []
    g.hist.push([g.day, Math.round((now.s / WORLD) * 1000) / 1000, Math.round((now.a / WORLD) * 1000) / 1000, Math.round(g.research)])
    if (g.hist.length > 500) g.hist = g.hist.filter((_, i) => i % 2 === 0)
  }
  // Old bubbles fade.
  g.bubbles = g.bubbles.filter((b) => g.day - b.day < BUBBLE_DAYS)
  g.rng = rng.s

  // The end.
  if (now.s <= 0 && now.u > 0) end(g, false, now.a > 0 ? 'Nobody is saying it any more.' : 'It never caught on.')
  else if (now.s <= 0 && now.u <= 0) end(g, true, 'The whole world has absorbed it.')
  else if (now.u <= 0 && now.s < WORLD * 0.00001) end(g, true, 'The whole world has absorbed it.')
  else if (g.day >= MAX_DAYS) end(g, false, 'The world moved on to newer words.')
  if (g.over) events.push({ kind: 'over', won: g.over.won })
  return events
}

function puristSteps (g, events) {
  const stages = [
    [25, 'Formal countries keep it off the air: hardly any flights carry it there now.', (r, z) => { if (r.formal >= 0.7) z.airOpen = false }],
    [50, 'Ports in formal countries turn it away: hardly any ships carry it there now.', (r, z) => { if (r.formal >= 0.55) z.seaOpen = false }],
    [75, 'Schools ban it in class. Young people pass it on less.', () => {}]
  ]
  for (let i = g.puristStage; i < stages.length; i++) {
    const [at, text, fn] = stages[i]
    if (g.research < at) break
    for (const r of REGIONS) fn(r, g.regions[r.id])
    g.puristStage = i + 1
    say(g, text, 'purist')
    events.push({ kind: 'purist-stage', stage: i + 1 })
  }
}

function end (g, won, why) {
  const tot = totals(g)
  g.hist = g.hist || []
  g.hist.push([g.day, Math.round((tot.s / WORLD) * 1000) / 1000, Math.round((tot.a / WORLD) * 1000) / 1000, Math.round(g.research)])
  g.over = { won, why, day: g.day, absorbed: tot.a / WORLD, ruled: g.ruled, research: Math.round(g.research) }
  say(g, won ? `“${g.word}” is in every dictionary on Earth.` : `“${g.word}” has died out. ${why}`, won ? 'win' : 'lose')
}

// --- your choices -------------------------------------------------------------------------
export function evolve (g, id) {
  if (g.over) throw new Error('This game is over.')
  if (!TRAIT[id]) throw new Error('No such trait.')
  if (!canEvolve(id, g.traits)) throw new Error('Evolve what it needs first.')
  const cost = traitCost(id, g.traits)
  if (g.buzz < cost) throw new Error('Not enough buzz.')
  g.buzz -= cost
  g.traits.push(id)
  g.stats.evolved++
  return cost
}

export function devolve (g, id) {
  if (g.over) throw new Error('This game is over.')
  if (!canDevolve(id, g.traits)) throw new Error('Something else relies on that.')
  if (g.buzz < DEVOLVE_COST) throw new Error('Not enough buzz.')
  g.buzz -= DEVOLVE_COST
  g.traits = g.traits.filter((x) => x !== id)
  g.stats.devolved++
}

// Popping a bubble: buzz, or setting the Purists back.
export function pop (g, id) {
  const b = g.bubbles.find((x) => x.id === id)
  if (!b) return null
  g.bubbles = g.bubbles.filter((x) => x.id !== id)
  g.stats.popped++
  if (b.kind === 'purist') { g.research = Math.max(0, g.research - 1.2); return { ...b, value: 0 } }
  g.buzz += b.value
  return b
}

export function popAll (g, half = true) {
  let got = 0
  for (const b of g.bubbles.slice()) {
    if (b.kind === 'purist') continue
    const v = half ? Math.max(1, b.value - 1) : b.value
    g.buzz += v
    got += v
    g.stats.popped++
    g.bubbles = g.bubbles.filter((x) => x !== b)
  }
  return got
}

// --- reading the game ---------------------------------------------------------------------
export function regionView (g, id) {
  const r = REGION[id]
  const z = g.regions[id]
  const pop = z.u + z.s + z.a
  return { ...r, unaware: z.u, speakers: z.s, absorbed: z.a, share: z.s / pop, absorbedShare: z.a / pop, seen: z.seen, airOpen: z.airOpen, seaOpen: z.seaOpen }
}

export function serialize (g) { return JSON.parse(JSON.stringify(g)) }

export function restore (data) {
  if (!data || data.v !== 1 || !data.regions || !REGION[data.start]) return null
  for (const r of REGIONS) if (!data.regions[r.id]) return null
  data.traits = (data.traits || []).filter((x) => TRAIT[x])
  return data
}

export { WORLD }
