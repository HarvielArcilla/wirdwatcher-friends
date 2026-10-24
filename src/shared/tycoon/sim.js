// Wird Tycoon: a dictionary publisher from a garage in 1985 to 2030.
//
// Each week: staff are paid and rent is due; whoever's working on the
// current book adds scholarship and charm (and the odd typo) to it,
// guided by how you've split their time between the three parts of each
// stage; books on sale sell a little less than the week before; and now
// and then something happens. A book's reviews come from how well it fits
// together (subject, format, medium), how you split the work, its balance
// of scholarship and charm, its typos, and how much better it is than what
// readers have come to expect, which rises with the years and with your
// own best work.
//
// Pure and seeded: plain JSON in, plain JSON out. One step is one week.

import { Rng } from '../wirdlike/rng.js'
import {
  START_YEAR, END_YEAR, WEEKS, START_CASH, STAGES, AREAS, FORMATS, FORMAT, SUBJECTS, SUBJECT, MEDIA, MEDIUM, SIZES, SIZE, OFFICES,
  FEATURES, FEATURE, ROLES, FIRST, LAST, GIGS, REVIEWERS, REVIEW_LINES, FIT, subjectFit, mediumFit, marketSize, mediumOpen, featureFits
} from './content.js'

export const END_WEEK = (END_YEAR - START_YEAR + 1) * WEEKS
const BROKE_WEEKS = 12

export const yearOf = (week) => START_YEAR + Math.floor(week / WEEKS)
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const dateText = (week) => `${MONTHS[Math.min(11, Math.floor(((week % WEEKS) / WEEKS) * 12))]} ${yearOf(week)}`
const era = (year) => 1 + (year - START_YEAR) * 0.035

// --- a new company ------------------------------------------------------------------------
export function newCompany ({ name = 'Wird & Co.', founder = 'You', words = [], seed = 'tycoon' } = {}) {
  const g = {
    v: 1, name: String(name).slice(0, 32) || 'Wird & Co.', rng: new Rng(String(seed)).s, week: 0,
    cash: START_CASH, fans: 0, rp: 2, office: 0, negWeeks: 0, revenue: 0,
    staff: [{ id: 1, name: founder, role: 'founder', s: 1, c: 1, salary: 0, xp: 0, founder: true }],
    nextId: 2, candidates: [], gigs: [], gig: null, project: null, books: [], nextBook: 1,
    known: {
      subjects: SUBJECTS.filter((x) => !x.research).map((x) => x.id),
      formats: FORMATS.filter((x) => !x.research).map((x) => x.id),
      features: [], fits: {}, mfits: {}, hints: {}
    },
    best: {}, last: null, trend: null, news: [], seenMedia: ['paperback', 'hardcover'],
    words: words.filter((w) => /^[a-z]{3,}$/i.test(w)).slice(0, 80),
    over: null, stats: { books: 0, bestScore: 0, tens: 0, cashPeak: START_CASH, media: {}, bestseller: 0 }
  }
  refreshGigs(g, new Rng(g.rng ^ 77))
  say(g, `${g.name} opens for business in a garage. You have a typewriter and $${(START_CASH / 1000).toFixed(0)}k.`, 'start')
  return g
}

function say (g, text, kind = 'info') {
  g.news.push({ week: g.week, text, kind })
  if (g.news.length > 40) g.news.shift()
}

export const year = (g) => yearOf(g.week)
const R = (g) => new Rng(g.rng)

// --- staff --------------------------------------------------------------------------------
export function refreshCandidates (g, rng = R(g)) {
  const e = era(year(g))
  g.candidates = Array.from({ length: 3 }, () => {
    const role = rng.pick(ROLES)
    const q = rng.range(0.85, 1.35) * e
    const s = Math.round(role.s * q * 100) / 100
    const c = Math.round(role.c * q * 100) / 100
    return { name: `${rng.pick(FIRST)} ${rng.pick(LAST)}`, role: role.id, s, c, salary: Math.round((s + c) * 520 * e / 50) * 50 }
  })
  g.rng = rng.s
}

export function hire (g, i) {
  const c = g.candidates[i]
  if (!c) throw new Error('Nobody to hire there.')
  if (g.staff.length >= OFFICES[g.office].staff) throw new Error(g.office === 0 ? 'There’s only room for you in the garage.' : 'No more desks. Move somewhere bigger.')
  const fee = c.salary * 4
  if (g.cash < fee) throw new Error('You can’t afford their signing fee.')
  g.cash -= fee
  g.staff.push({ id: g.nextId++, ...c, xp: 0 })
  g.candidates.splice(i, 1)
  say(g, `${c.name} joins as ${ROLES.find((r) => r.id === c.role).name.toLowerCase()}.`, 'staff')
}

export function fire (g, id) {
  const p = g.staff.find((x) => x.id === id)
  if (!p || p.founder) throw new Error('You can’t let yourself go.')
  g.staff = g.staff.filter((x) => x !== p)
  g.cash -= p.salary * 2
  say(g, `${p.name} leaves with two weeks’ pay.`, 'staff')
}

export const hireFee = (c) => c.salary * 4
export const skill = (p) => 1 + Math.min(1.2, p.xp / 160)

// --- offices and research -----------------------------------------------------------------
export function moveOffice (g) {
  const next = OFFICES[g.office + 1]
  if (!next) throw new Error('There’s nowhere bigger.')
  if (g.project) throw new Error('Finish the book you’re on first.')
  if (g.cash < next.cost) throw new Error('You can’t afford it yet.')
  g.cash -= next.cost
  g.office++
  say(g, `${g.name} moves into ${next.name.replace(/^A /, 'a ').replace(/^The /, 'the ')}.`, 'office')
  if (!g.candidates.length) refreshCandidates(g)
}

export function researchList (g) {
  const y = year(g)
  return [
    ...SUBJECTS.filter((x) => x.research && !g.known.subjects.includes(x.id) && y >= x.from).map((x) => ({ kind: 'subject', id: x.id, name: x.name, rp: x.research, blurb: x.blurb })),
    ...FORMATS.filter((x) => x.research && !g.known.formats.includes(x.id)).map((x) => ({ kind: 'format', id: x.id, name: x.name, rp: x.research, blurb: x.blurb })),
    ...FEATURES.filter((x) => !g.known.features.includes(x.id) && y >= (x.from || 0) - 1).map((x) => ({ kind: 'feature', id: x.id, name: x.name, rp: x.research, blurb: x.blurb }))
  ]
}

export function research (g, kind, id) {
  const item = researchList(g).find((x) => x.kind === kind && x.id === id)
  if (!item) throw new Error('Nothing to research there.')
  if (g.rp < item.rp) throw new Error('Not enough research points.')
  g.rp -= item.rp
  g.known[kind === 'subject' ? 'subjects' : kind === 'format' ? 'formats' : 'features'].push(id)
  say(g, `Research done: ${item.name}.`, 'research')
}

// --- freelance ----------------------------------------------------------------------------
function refreshGigs (g, rng) {
  const e = era(year(g))
  g.gigs = rng.shuffle(GIGS.slice()).slice(0, 3).map((x) => ({ ...x, pay: Math.round(x.pay * e * rng.range(0.85, 1.2) / 100) * 100 }))
  g.rng = rng.s
}

export function takeGig (g, i) {
  if (g.project || g.gig) throw new Error('You’re busy.')
  const x = g.gigs[i]
  if (!x) throw new Error('No such job.')
  g.gig = { ...x, left: x.weeks }
  g.gigs.splice(i, 1)
}

// --- books --------------------------------------------------------------------------------
export function bookCost (g, { size, medium, features = [] }) {
  const sz = SIZE[size]
  const base = sz.cost * era(year(g))
  return Math.round(base + MEDIUM[medium].licence + features.reduce((a, f) => a + base * FEATURE[f].cost, 0))
}

export function canMake (g, { subject, format, medium, size, features = [] }) {
  const y = year(g)
  if (!g.known.subjects.includes(subject)) return 'Research that subject first.'
  if (!g.known.formats.includes(format)) return 'Research that format first.'
  if (!MEDIUM[medium] || !mediumOpen(medium, y)) return 'That isn’t available this year.'
  if (!SIZE[size]) return 'Pick a size.'
  if (SIZE[size].office > g.office) return `${SIZE[size].name}s need ${OFFICES[SIZE[size].office].name.replace(/^A /, 'a ')}.`
  for (const f of features) if (!g.known.features.includes(f) || !featureFits(f, medium, y)) return 'One of those features doesn’t fit.'
  return null
}

export function startBook (g, opts) {
  if (g.project) throw new Error('You’re already working on a book.')
  if (g.gig) throw new Error('Finish your freelance job first.')
  const why = canMake(g, opts)
  if (why) throw new Error(why)
  const cost = bookCost(g, opts)
  if (g.cash < cost) throw new Error('You can’t afford to make that.')
  g.cash -= cost
  const sz = SIZE[opts.size]
  const title = String(opts.title || '').trim().slice(0, 60) || `The ${SUBJECT[opts.subject].name} ${FORMAT[opts.format].name}`
  g.project = {
    title, subject: opts.subject, format: opts.format, medium: opts.medium, size: opts.size, features: (opts.features || []).slice(),
    cost, stage: 0, inStage: 0, stageWeeks: Math.max(2, Math.round(sz.weeks / 3)), alloc: [null, null, null],
    s: 0, c: 0, typos: 0, extra: 0, waiting: 'alloc', started: g.week
  }
  return g.project
}

// What you set at the start of each stage: three shares (they're scaled to add up).
export function setAlloc (g, shares) {
  const p = g.project
  if (!p || p.waiting !== 'alloc') throw new Error('Not now.')
  const a = shares.slice(0, 3).map((x) => Math.max(0, Number(x) || 0))
  const t = a.reduce((x, y) => x + y, 0) || 1
  p.alloc[p.stage] = a.map((x) => x / t)
  p.waiting = null
}

export function idealAlloc (format, stage) {
  const w = STAGES[stage].areas.map((a) => FORMAT[format].w[a])
  const t = w.reduce((x, y) => x + y, 0)
  return w.map((x) => x / t)
}

// After the last stage: another week of proofreading, or out it goes.
export function proofread (g) {
  const p = g.project
  if (!p || p.waiting !== 'release') throw new Error('Not now.')
  p.waiting = 'proofing'
}

// --- one week -----------------------------------------------------------------------------
export function step (g) {
  if (g.over) return []
  const rng = R(g)
  const events = []
  const before = year(g)
  g.week++
  const y = year(g)

  // Wages and rent.
  const wages = g.staff.reduce((a, p) => a + p.salary, 0) + OFFICES[g.office].rent
  g.cash -= wages

  // The book in progress.
  const p = g.project
  if (p && (p.waiting === null || p.waiting === 'proofing')) {
    const stage = STAGES[p.stage]
    const alloc = p.waiting === 'proofing' ? [0, 1, 0] : p.alloc[p.stage]
    for (const person of g.staff) {
      const k = skill(person) * rng.range(0.8, 1.2)
      let s = 0; let c = 0
      stage.areas.forEach((area, i) => { s += alloc[i] * AREAS[area].s * person.s * k; c += alloc[i] * (1 - AREAS[area].s) * person.c * k })
      if (p.waiting === 'proofing') { s *= 0.3; c *= 0.3 }
      p.s += s
      p.c += c
      person.xp++
      let typo = 0
      if (p.stage < 2) {
        const t = (0.35 + (p.features.includes('neural') ? 1.2 : 0)) * rng.range(0.4, 1.6)
        p.typos += t
        typo = t
      } else {
        const fix = Math.min(p.typos, (0.4 + alloc[1] * 2.2) * (person.role === 'editor' ? 1.6 : 1) * rng.range(0.7, 1.3))
        p.typos -= fix
        typo = -fix
      }
      events.push({ kind: 'work', who: person.id, s, c, typo })
    }
    g.rp += 0.12 * g.staff.length
    if (p.waiting === 'proofing') p.waiting = 'release'
    else if (++p.inStage >= p.stageWeeks) {
      if (p.stage < 2) { p.stage++; p.inStage = 0; p.waiting = 'alloc'; events.push({ kind: 'stage', stage: p.stage }) } else { p.waiting = 'release'; events.push({ kind: 'done' }) }
    }
  }

  // Freelance work.
  if (g.gig && --g.gig.left <= 0) {
    g.cash += g.gig.pay
    g.rp += g.gig.rp
    for (const person of g.staff) person.xp += g.gig.weeks * 0.5
    say(g, `Freelance job done: ${g.gig.name.toLowerCase()}. +$${g.gig.pay.toLocaleString()}.`, 'gig')
    events.push({ kind: 'gig', pay: g.gig.pay })
    g.gig = null
    refreshGigs(g, rng)
  }

  // Sales.
  for (const b of g.books) {
    if (!b.left) continue
    const units = Math.round(b.left * 0.17)
    if (units < 30) { b.sold += b.left; b.revenue += b.left * b.price; g.cash += b.left * b.price; b.left = 0; continue }
    b.left -= units
    b.sold += units
    const money = units * b.price
    b.revenue += money
    g.cash += money
    g.revenue += money
    if (b.sold > g.stats.bestseller) g.stats.bestseller = b.sold
  }

  // Now and then.
  if (y !== before) {
    for (const md of MEDIA) {
      if (md.from === y && !g.seenMedia.includes(md.id)) { g.seenMedia.push(md.id); say(g, `New: ${md.name}. ${md.blurb}${md.licence ? ` Licence: $${md.licence.toLocaleString()} a book.` : ''}`, 'media'); events.push({ kind: 'media', id: md.id }) }
      if (md.to === y - 1) say(g, `${md.name}s are finished. Nobody makes them any more.`, 'media')
    }
    for (const sb of SUBJECTS) if (sb.from === y && sb.research) say(g, `People are starting to talk about ${sb.name.toLowerCase()}. It’s ready to research.`, 'research')
  }
  if (g.week % 26 === 0) refreshCandidates(g, rng)
  if (g.week % 20 === 0 && !g.gig) refreshGigs(g, rng)
  if (!g.trend && rng.chance(1 / 45)) {
    const sb = rng.pick(SUBJECTS.filter((x) => x.from <= y))
    g.trend = { subject: sb.id, until: g.week + rng.int(30) + 30 }
    say(g, `${sb.name} is in fashion: books about it sell better for a while.`, 'trend')
  } else if (g.trend && g.week >= g.trend.until) {
    say(g, `${SUBJECT[g.trend.subject].name} is out of fashion again.`, 'trend')
    g.trend = null
  }

  g.stats.cashPeak = Math.max(g.stats.cashPeak, g.cash)
  if (g.cash < 0) {
    g.negWeeks++
    if (g.negWeeks === 1) say(g, 'You’re in the red. Twelve weeks to turn it around, or the bank takes the typewriter.', 'warn')
    if (g.negWeeks >= BROKE_WEEKS) end(g, 'broke')
  } else g.negWeeks = 0
  if (!g.over && g.week >= END_WEEK) end(g, 'retired')
  g.rng = rng.s
  if (g.over) events.push({ kind: 'over', why: g.over.why })
  return events
}

function end (g, why) {
  g.over = { why, week: g.week, cash: g.cash, books: g.books.length }
  say(g, why === 'retired' ? `It’s ${END_YEAR + 1}. ${g.name} closes its books for the last time, proudly.` : `${g.name} has gone bust.`, why === 'retired' ? 'win' : 'lose')
}

// --- publishing ---------------------------------------------------------------------------
export function bookPoints (g, p = g.project) {
  const add = { s: 0, c: 0 }
  for (const f of p.features) { add.s += FEATURE[f].add.s || 0; add.c += FEATURE[f].add.c || 0 }
  return { s: p.s * (1 + add.s), c: p.c * (1 + add.c) }
}

export function expected (g, size) {
  const sz = SIZE[size]
  return Math.max(sz.weeks * sz.team * era(year(g)) * 0.95, (g.best[size] || 0) * 0.92)
}

// How it'll be received: the parts, and the score out of 10.
export function appraise (g, p = g.project) {
  const y = year(g)
  const pts = bookPoints(g, p)
  const total = pts.s + pts.c
  const q = total / expected(g, p.size)
  const quality = 0.55 + 0.45 * Math.min(1.25, q)
  const sf = subjectFit(p.subject, p.format)
  const mf = mediumFit(p.medium, p.format)
  const fit = FIT[sf] * Math.pow(FIT[mf], 0.7)
  let miss = 0
  for (let i = 0; i < 3; i++) {
    const ideal = idealAlloc(p.format, i)
    miss += p.alloc[i] ? p.alloc[i].reduce((a, x, j) => a + Math.abs(x - ideal[j]), 0) / 2 : 1
  }
  const split = 1 - 0.5 * (miss / 3)
  const ratio = total > 0 ? pts.s / total : 0.5
  const balance = Math.max(0.55, 1 - Math.abs(ratio - FORMAT[p.format].ratio) * 1.3)
  const typoShare = p.typos / Math.max(1, total * 0.06 + 4)
  const typos = 1 - Math.min(0.45, typoShare * 0.5)
  const repeat = g.last && g.last.subject === p.subject && g.last.format === p.format ? 0.82 : g.last && g.last.subject === p.subject ? 0.95 : 1
  const trend = g.trend?.subject === p.subject ? 1.08 : 1
  let missing = 1
  for (const f of FEATURES) if (f.expected && y >= f.expected && featureFits(f.id, p.medium, y) && !p.features.includes(f.id)) missing *= 0.92
  const raw = quality * fit * split * balance * typos * repeat * trend * missing
  return { q, quality, fit, sf, mf, split, ratio, balance, typos, repeat, trend, missing, raw, score: Math.max(1, Math.min(10, raw * 10.4 - 0.4)) }
}

export function publish (g) {
  const p = g.project
  if (!p || p.waiting !== 'release') throw new Error('It isn’t ready.')
  const rng = R(g)
  const y = year(g)
  const a = appraise(g, p)
  const score = Math.max(1, Math.min(10, a.score + rng.range(-0.35, 0.35)))
  const word = () => (g.words.length ? rng.pick(g.words) : 'aardvark')
  const reviews = REVIEWERS.map((by) => {
    const n = Math.max(1, Math.min(10, Math.round(score + rng.range(-1.1, 1.1))))
    const line = rng.pick(REVIEW_LINES[n]).replace('{s}', SUBJECT[p.subject].name.toLowerCase()).replace('{f}', FORMAT[p.format].name.toLowerCase()).replaceAll('{w}', word()).replace('{t}', p.title)
    return { by, score: n, line }
  })
  const avg = reviews.reduce((x, r) => x + r.score, 0) / reviews.length
  // Sales: readers on that medium this year, how good it is, how many fans
  // you have, and the buzz at launch.
  const sz = SIZE[p.size]
  const hype = 1 + (p.alloc[2]?.[2] || 0) * 0.35 + p.features.reduce((x, f) => x + (FEATURE[f].hype || 0), 0)
  const fanBoost = 1 + Math.log10(1 + g.fans / 2000) * 0.4
  const appeal = Math.pow(avg / 10, 3) * hype * fanBoost * (g.trend?.subject === p.subject ? 1.25 : 1)
  const units = Math.round(marketSize(p.medium, y) * 1e6 * 0.0028 * appeal * [1, 0.85, 0.6, 0.45][SIZES.indexOf(sz)] * rng.range(0.85, 1.15))
  const price = Math.round(MEDIUM[p.medium].price * sz.price * Math.pow(era(y), 0.6) * 100) / 100
  const book = {
    id: g.nextBook++, title: p.title, subject: p.subject, format: p.format, medium: p.medium, size: p.size, features: p.features,
    week: g.week, score: Math.round(avg * 10) / 10, reviews, units, left: units, sold: 0, price, revenue: 0, cost: p.cost, s: Math.round(p.s), c: Math.round(p.c), typos: Math.round(p.typos)
  }
  g.books.unshift(book)
  if (g.books.length > 60) g.books.length = 60
  g.fans = Math.max(0, Math.round(g.fans + units * 0.12 * ((avg - 5) / 5)))
  g.rp += 1 + avg / 3
  g.best[p.size] = Math.max(g.best[p.size] || 0, bookPoints(g, p).s + bookPoints(g, p).c)
  g.last = { subject: p.subject, format: p.format }
  // What you learn: how the pairs fit, and one thing about the format.
  g.known.fits[`${p.subject}|${p.format}`] = a.sf
  g.known.mfits[`${p.medium}|${p.format}`] = a.mf
  const hints = (g.known.hints[p.format] ||= {})
  const unknown = Object.keys(AREAS).filter((ar) => !hints[ar])
  if (unknown.length) {
    const w = FORMAT[p.format].w
    const pickA = unknown.sort((x, y2) => Math.abs(w[y2] - 0.5) - Math.abs(w[x] - 0.5))[0]
    hints[pickA] = w[pickA] >= 0.7 ? 'high' : w[pickA] <= 0.3 ? 'low' : 'mid'
  }
  g.stats.books++
  g.stats.bestScore = Math.max(g.stats.bestScore, book.score)
  if (book.score >= 9.95) g.stats.tens++
  g.stats.media[p.medium] = true
  g.project = null
  g.rng = rng.s
  say(g, `“${book.title}” is out: ${book.score.toFixed(1)} from the critics.`, book.score >= 8 ? 'good' : book.score < 5 ? 'bad' : 'info')
  return { book, appraisal: a }
}

export function abandonBook (g) {
  if (!g.project) return
  say(g, `You shelve “${g.project.title}”. The money’s gone.`, 'bad')
  g.project = null
}

// --- reading ------------------------------------------------------------------------------
export const openMedia = (g) => MEDIA.filter((m) => mediumOpen(m.id, year(g)))
export const knownFit = (g, subject, format) => g.known.fits[`${subject}|${format}`] || null
export const knownMFit = (g, medium, format) => g.known.mfits[`${medium}|${format}`] || null
export const weeklyCosts = (g) => g.staff.reduce((a, p) => a + p.salary, 0) + OFFICES[g.office].rent

export function serialize (g) { return JSON.parse(JSON.stringify(g)) }
export function restore (data) {
  if (!data || data.v !== 1 || !Array.isArray(data.staff) || !data.known) return null
  return data
}

export { STAGES, AREAS, FORMATS, SUBJECTS, MEDIA, SIZES, OFFICES, FEATURES, ROLES }
