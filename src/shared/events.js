// Politics and pop culture questions for the prediction market. Each one
// opens on a schedule, stays open for a few hours to a day, and settles
// when it closes. Like the games, everything comes from the question's
// number, so every computer sees the same questions, chances and results.
//
// Under each question is how support stands: it drifts in small steps
// (with the odd sudden swing) until the close, and the first answer wins
// if it ends above zero. The chance shown is the real chance from where it
// stands, given the time left.

const MIN = 60000
const HOUR = 60 * MIN
export const EVENT_STEP = 5 * MIN

function hashStr (s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
function rng (seed) {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
const normal = (r) => { let u = 0; let v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) }
function normCdf (x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x))
  const d = 0.3989423 * Math.exp(-x * x / 2)
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  return x > 0 ? 1 - p : p
}
const pick = (r, list) => list[Math.floor(r() * list.length)]
const pickTwo = (r, list) => { const a = pick(r, list); let b = pick(r, list); while (b === a) b = pick(r, list); return [a, b] }

export const EVENT_LEAGUES = {
  vote: { id: 'vote', name: 'Politics', short: 'Politics', sport: 'politics', emoji: '🗳️', every: 70 * MIN, offset: 7 * MIN, dur: [3, 24] },
  pop: { id: 'pop', name: 'Pop culture', short: 'Pop culture', sport: 'pop', emoji: '🎬', every: 45 * MIN, offset: 11 * MIN, dur: [2, 16] }
}
export const MAX_EVENT_HOURS = 24
export const EVENT_EPOCH = Date.UTC(2026, 9, 1)

// People go by an initial and a word, like the players in the leagues.
const INITIAL = 'ABCDEFGHJKLMNOPRSTVW'
const LAST = ['Ledger', 'Quill', 'Vellum', 'Inkwell', 'Folio', 'Margin', 'Serif', 'Gloss', 'Parchment', 'Hyphen', 'Verbatim', 'Rubric', 'Colophon', 'Lantern', 'Thicket', 'Meadow', 'Harbor', 'Pebble', 'Juniper', 'Saffron', 'Thistle', 'Marble', 'Cobble', 'Willow', 'Bramble', 'Sparrow', 'Copper', 'Granite', 'Fable', 'Ember', 'Hollow', 'Ridge', 'Candor', 'Mettle', 'Verve', 'Ballast', 'Gable', 'Tinsel', 'Cinder', 'Orchard']
const CITY = ['Lexington', 'Port Syntax', 'New Grammaria', 'Glossary Heights', 'Old Etymon', 'Prosewood', 'Rhyme-on-Sea', 'Quillford', 'Inkbridge', 'Verbania City', 'Serif Falls', 'Margin Bay']
const PROVINCE = ['Verbania', 'the Northern Glossary', 'Syntaxia', 'the Lexicon Coast', 'Upper Prose', 'the Parchment Isles']
const PARTY = ['the Serif Party', 'the Sans Party', 'the Margin Party', 'the Ink Party', 'the Quill Party']
const MEASURE = ['a four-day week for librarians', 'free spell-check for every household', 'renaming Main Street to Semicolon Street', 'Oxford commas on all city signs', 'a public dictionary in every park', 'a late-night library bus', 'a statue of the letter Q in the town square', 'quiet hours on the waterfront']
const BILL = ['Plain Language', 'Open Margins', 'Fair Font', 'Library Hours', 'Quiet Streets', 'Small Press', 'Public Poetry']
const ACTION = ['build a new reading garden', 'extend the summer book fair by a week', 'ban leaf blowers before 9 a.m.', 'repaint the town hall in serif gold', 'add a second ferry to Rhyme-on-Sea', 'turn the old mill into a writers’ hall', 'plant a thousand trees along the river']
const BAND = ['DJ Diphthong', 'The Hyphens', 'Serif & the Sans', 'Kid Consonant', 'Echo', 'Velvet Syntax', 'Ampersand', 'The Run-Ons', 'Little Italic', 'Caps Lock', 'Paper Lanterns', 'The Footnotes', 'Glass Vowel', 'Moxie']
const SONG = ['Lowercase Love', 'Run-On Heart', 'Exclamation', 'Italic Summer', 'Say It Twice', 'Silent K', 'Punctuate Me', 'Between the Lines', 'Bold Type', 'Footnote']
const FILM = ['The Last Semicolon', 'Ink and Iron', 'A Quiet Vowel', 'Midnight in Glossary', 'The Apostrophe Affair', 'Thesaurus Rex', 'Margins', 'The Long Sentence', 'Dear Reader', 'Typeset']
const SHOW = ['Spelling Bee Island', 'The Great Word Bake Off', 'Rhyme Wars', 'Love Letters', 'Lexicon Idol']
const SERIES = ['Hyphen Street', 'Small Print', 'Ellipsis', 'Night Shift', 'Margin Notes']
const ALBUM = ['Upper Case', 'Proofs', 'Marginalia', 'First Draft', 'Annotated', 'Kerning']
const person = (r) => `${INITIAL[Math.floor(r() * INITIAL.length)]}. ${pick(r, LAST)}`
const twoPeople = (r) => { const a = person(r); let b = person(r); while (b.split(' ')[1] === a.split(' ')[1]) b = person(r); return [a, b] }
const artist = (r) => (r() < 0.5 ? pick(r, BAND) : person(r))
const twoArtists = (r) => { const a = artist(r); let b = artist(r); while (b === a) b = artist(r); return [a, b] }
const YES = ['Yes', 'No']
const ward = (r) => 1 + Math.floor(r() * 9)

const TEMPLATES = {
  vote: [
    (r) => { const [a, b] = twoPeople(r); return { q: `Who wins the race for mayor of ${pick(r, CITY)}?`, sides: [a, b], tag: 'Election' } },
    (r) => { const [a, b] = twoPeople(r); return { q: `Who wins the Senate seat for ${pick(r, PROVINCE)}?`, sides: [a, b], tag: 'Election' } },
    (r) => { const [a, b] = twoPeople(r); return { q: `Who wins the race for governor of ${pick(r, PROVINCE)}?`, sides: [a, b], tag: 'Election' } },
    (r) => { const [a, b] = twoPeople(r); return { q: 'Who wins the presidential election?', sides: [a, b], tag: 'Election' } },
    (r) => { const [a, b] = twoPeople(r); return { q: `Who wins ${pick(r, PARTY)} primary for governor of ${pick(r, PROVINCE)}?`, sides: [a, b], tag: 'Primary' } },
    (r) => { const [a, b] = twoPeople(r); return { q: `Who wins the ${pick(r, CITY)} council seat for Ward ${ward(r)}?`, sides: [a, b], tag: 'Election' } },
    (r) => { const [a, b] = twoPeople(r); return { q: `Who wins the ${pick(r, CITY)} school board race?`, sides: [a, b], tag: 'Election' } },
    (r) => { const [a, b] = twoPeople(r); return { q: `Who becomes the next leader of ${pick(r, PARTY)}?`, sides: [a, b], tag: 'Leadership' } },
    (r) => ({ q: `Will ${pick(r, PARTY)} hold ${pick(r, CITY)} in the by-election?`, sides: YES, tag: 'Election' }),
    (r) => ({ q: `Will ${pick(r, PARTY)} win a majority in the ${pick(r, PROVINCE)} assembly?`, sides: YES, tag: 'Election' }),
    (r) => ({ q: `Will Mayor ${person(r)} win re-election in ${pick(r, CITY)}?`, sides: YES, tag: 'Election' }),
    (r) => ({ q: `Will ${person(r)} win the ${pick(r, PROVINCE)} governor’s race by more than 5 points?`, sides: YES, tag: 'Election' }),
    (r) => ({ q: `Will turnout in the ${pick(r, CITY)} mayoral election top 60%?`, sides: YES, tag: 'Turnout' }),
    (r) => ({ q: `Will ${pick(r, CITY)} pass Measure ${'ABCDEFGHJK'[Math.floor(r() * 10)]}: ${pick(r, MEASURE)}?`, sides: YES, tag: 'Ballot measure' }),
    (r) => ({ q: `Will the ${pick(r, CITY)} council vote to ${pick(r, ACTION)}?`, sides: YES, tag: 'Council vote' }),
    (r) => ({ q: `Will Governor ${person(r)} sign the ${pick(r, BILL)} Act?`, sides: YES, tag: 'Legislation' }),
    (r) => ({ q: `Will the ${pick(r, PROVINCE)} assembly pass the budget before the deadline?`, sides: YES, tag: 'Legislation' }),
    (r) => ({ q: `Will ${pick(r, CITY)} recall Councillor ${person(r)}?`, sides: YES, tag: 'Recall' }),
    (r) => { const [a, b] = twoPeople(r); return { q: `Who wins the ${pick(r, PROVINCE)} governor’s debate, by the snap poll?`, sides: [a, b], tag: 'Debate' } },
    (r) => ({ q: `Will Mayor ${person(r)}’s approval be above 50% when the poll closes?`, sides: YES, tag: 'Polling' })
  ],
  pop: [
    (r) => { const [a, b] = pickTwo(r, FILM); return { q: 'Which film wins Best Picture at the Wordies?', sides: [a, b], tag: 'Awards' } },
    (r) => ({ q: `Will “${pick(r, SONG)}” by ${artist(r)} hit #1 on the Word Charts?`, sides: YES, tag: 'Music' }),
    (r) => ({ q: `Will “${pick(r, FILM)}” open above ${[40, 60, 80, 100][Math.floor(r() * 4)]} million coins at the box office?`, sides: YES, tag: 'Box office' }),
    (r) => { const [a, b] = twoPeople(r); return { q: `Who wins season ${2 + Math.floor(r() * 9)} of ${pick(r, SHOW)}?`, sides: [a, b], tag: 'TV' } },
    (r) => ({ q: `Will ${artist(r)}’s new album, “${pick(r, ALBUM)}”, go platinum in its first week?`, sides: YES, tag: 'Music' }),
    (r) => ({ q: `Will the “${pick(r, SERIES)}” finale break the record for viewers?`, sides: YES, tag: 'TV' }),
    (r) => { const [a, b] = twoArtists(r); return { q: `Will ${a} and ${b} announce a song together?`, sides: YES, tag: 'Music' } },
    (r) => { const [a, b] = twoArtists(r); return { q: 'Who takes Best New Artist at the Lyric Awards?', sides: [a, b], tag: 'Awards' } },
    (r) => { const [a, b] = twoPeople(r); return { q: 'Who wins Best Actor at the Wordies?', sides: [a, b], tag: 'Awards' } }
  ]
}

export const eventStart = (league, n) => EVENT_EPOCH + EVENT_LEAGUES[league].offset + n * EVENT_LEAGUES[league].every
export const eventNumberAt = (league, t) => Math.floor((t - EVENT_EPOCH - EVENT_LEAGUES[league].offset) / EVENT_LEAGUES[league].every)

// Each step's change in support: mostly small, now and then a big swing.
// Its variance is 1, so the chance from any point is Φ(support / √steps left).
const JUMP = 0.02
const JUMP_SIZE = 4
const SMALL = Math.sqrt((1 - JUMP * JUMP_SIZE ** 2) / (1 - JUMP))

const cache = new Map()
export function eventGame (league, n) {
  const id = `${league}-v2-${n}`
  if (cache.has(id)) return cache.get(id)
  const L = EVENT_LEAGUES[league]
  const r = rng(hashStr(`event|v1|${id}`))
  // The kinds of question come round in a shuffled cycle, so the same kind
  // doesn't open twice in a row.
  const list = TEMPLATES[league]
  const cycle = Math.floor(n / list.length)
  const order = list.map((_, i) => i).sort((a, b) => hashStr(`cycle|${league}|${cycle}|${a}`) - hashStr(`cycle|${league}|${cycle}|${b}`))
  const t = list[order[n % list.length]](r)
  const hours = L.dur[0] + r() * (L.dur[1] - L.dur[0])
  const steps = Math.max(12, Math.round((hours * HOUR) / EVENT_STEP))
  const start = eventStart(league, n)
  const path = new Float64Array(steps + 1)
  path[0] = normal(r) * Math.sqrt(steps) * 0.75 // how it leans when it opens
  for (let k = 1; k <= steps; k++) path[k] = path[k - 1] + (r() < JUMP ? (r() < 0.5 ? -1 : 1) * JUMP_SIZE : normal(r) * SMALL)
  const g = { league, n, id, event: true, question: t.q, tag: t.tag, sideNames: { home: t.sides[0], away: t.sides[1] }, yesNo: t.sides === YES, start, end: start + steps * EVENT_STEP, steps, path, winner: path[steps] > 0 ? 'home' : 'away' }
  if (cache.size > 600) cache.clear()
  cache.set(id, g)
  return g
}

// The step reached at time t (the chance moves once a step).
export const eventStepAt = (g, t) => Math.max(0, Math.min(g.steps, Math.floor((t - g.start) / EVENT_STEP)))
export function eventChance (g, t) {
  if (t >= g.end) return g.winner === 'home' ? 1 : 0
  const k = eventStepAt(g, t)
  const p = normCdf(g.path[k] / Math.sqrt(g.steps - k))
  return Math.min(0.995, Math.max(0.005, p))
}

// Open questions, the next to open, and the latest to close.
export function eventSlate (league, t, { next = 4, past = 8 } = {}) {
  const n = eventNumberAt(league, t)
  const L = EVENT_LEAGUES[league]
  const back = Math.ceil((MAX_EVENT_HOURS * HOUR) / L.every) + 1
  const out = { live: [], upcoming: [], recent: [] }
  for (let k = Math.max(0, n - back); k <= n; k++) {
    const g = eventGame(league, k)
    if (g.start <= t && t < g.end) out.live.push(k); else if (t >= g.end) out.recent.push(k)
  }
  for (let k = n + 1; out.upcoming.length < next; k++) if (k >= 0) out.upcoming.push(k)
  out.live.sort((a, b) => eventGame(league, a).end - eventGame(league, b).end)
  out.recent = out.recent.sort((a, b) => eventGame(league, b).end - eventGame(league, a).end).slice(0, past)
  return out
}
