// The Wird leagues: basketball and American football between made-up teams
// from real places, played by words. Every game is worked out from its
// number alone, so every copy of wirdwatcher sees the same plays at the
// same moments, live, without talking to anyone. The score is just the sum
// of the plays.
//
// Win chances, for the prediction market, come from the score and the time
// left: the lead plus what the better team should still gain, against how
// much can still change (which shrinks as the clock runs down), plus, in
// football, who has the ball and where. The spread constants are measured
// from thousands of simulated games (test/sports.test.js checks it).
//
// THIS IS SPORTS v1. Changing anything that feeds a game rewrites every
// game ever shown: add a v2 instead.

export const SPORTS_EPOCH = Date.UTC(2026, 9, 1) // game 0 of each league
const MIN = 60000
const SEC = 1000

// --- deterministic randomness --------------------------------------------------------
export function hashStr (s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
function rng (seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const pickOf = (r, list) => list[Math.floor(r() * list.length)]
const normal = (r) => { let u = 0; let v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) }
export const normCdf = (x) => {
  const z = Math.abs(x) / Math.SQRT2
  const t = 1 / (1 + 0.5 * z)
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))))
  return x >= 0 ? 1 - r / 2 : r / 2
}

// --- teams and players ------------------------------------------------------------------

const PLAYER_WORDS = ['Serendipity', 'Velvet', 'Gravy', 'Thunder', 'Meadow', 'Pickle', 'Zephyr', 'Lantern', 'Avalanche', 'Noodle', 'Whisper', 'Muffin', 'Kettle', 'Sparkle',
  'Quixote', 'Hullabaloo', 'Sludge', 'Lullaby', 'Moist', 'Giraffe', 'Banana', 'Tornado', 'Marigold', 'Fathom', 'Gossamer', 'Bramble', 'Cobalt', 'Juniper', 'Ember', 'Falcon',
  'Saffron', 'Tundra', 'Mosaic', 'Nimbus', 'Rhubarb', 'Tangent', 'Vortex', 'Walrus', 'Yonder', 'Zigzag', 'Apricot', 'Bastion', 'Caramel', 'Dandelion', 'Eclipse', 'Fjord',
  'Granite', 'Harbor', 'Indigo', 'Jubilee', 'Kumquat', 'Lagoon', 'Mango', 'Nectar', 'Oracle', 'Pebble', 'Quasar', 'Raven', 'Sequoia', 'Thistle', 'Umbra', 'Vellum',
  'Wombat', 'Xylophone', 'Yeti', 'Zenith', 'Anchor', 'Biscuit', 'Cinder', 'Dynamo', 'Echo', 'Flint', 'Glacier', 'Hazel', 'Ivory', 'Jackal', 'Kiwi', 'Lyric',
  'Mercury', 'Nova', 'Onyx', 'Paprika', 'Quill', 'Rocket', 'Sonnet', 'Truffle', 'Utopia', 'Verve', 'Wicket', 'Yarrow', 'Zinnia', 'Basil', 'Comet', 'Drizzle',
  'Fable', 'Gumbo', 'Hickory', 'Inkwell', 'Jigsaw', 'Kaleidoscope', 'Limerick', 'Monsoon', 'Nugget', 'Oatmeal', 'Pretzel', 'Quarry', 'Riddle', 'Scribble', 'Tapestry', 'Ukulele',
  'Vanilla', 'Waffle', 'Bonanza', 'Crescendo', 'Doodle', 'Enigma', 'Flapjack', 'Gizmo', 'Hubbub', 'Igloo', 'Jamboree', 'Kerfuffle', 'Labyrinth', 'Marmalade', 'Nebula', 'Obelisk',
  'Pinnacle', 'Rigmarole', 'Shenanigan', 'Tumbleweed', 'Vagabond', 'Whirlwind', 'Brouhaha', 'Cumulus', 'Dumpling', 'Effervescence', 'Flummox', 'Gobbledygook', 'Hoopla', 'Inkling', 'Jargon', 'Kudos']
const INITIALS = 'ABCDEFGHJKLMNPRSTW'

export const LEAGUES = {
  hoops: {
    id: 'hoops', name: 'Word Basketball League', short: 'WBL', sport: 'basketball', emoji: '🏀',
    teams: [
      ['LAL', 'Los Angeles', 'Lexicons'], ['BOS', 'Boston', 'Bylines'], ['CHI', 'Chicago', 'Syllables'], ['SEA', 'Seattle', 'Semicolons'],
      ['MIA', 'Miami', 'Metaphors'], ['DEN', 'Denver', 'Diphthongs'], ['AUS', 'Austin', 'Adverbs'], ['PHX', 'Phoenix', 'Phonemes'],
      ['POR', 'Portland', 'Palindromes'], ['ATL', 'Atlanta', 'Anagrams'], ['NYN', 'New York', 'Neologisms'], ['DET', 'Detroit', 'Dashes']
    ],
    every: 30 * MIN,
    offset: 0
  },
  gridiron: {
    id: 'gridiron', name: 'Word Football League', short: 'WFL', sport: 'football', emoji: '🏈',
    teams: [
      ['DAL', 'Dallas', 'Dictionaries'], ['GB', 'Green Bay', 'Glossaries'], ['KC', 'Kansas City', 'Consonants'], ['PHI', 'Philadelphia', 'Pronouns'],
      ['PIT', 'Pittsburgh', 'Prepositions'], ['NO', 'New Orleans', 'Nouns'], ['BAL', 'Baltimore', 'Ballads'], ['SF', 'San Francisco', 'Sonnets'],
      ['HOU', 'Houston', 'Hyphens'], ['MIN', 'Minnesota', 'Morphemes'], ['NSH', 'Nashville', 'Narrators'], ['LV', 'Las Vegas', 'Limericks']
    ],
    every: 60 * MIN,
    offset: 15 * MIN
  }
}

const teamCache = new Map()
// A team: its strength (points over an average team, per game) and its players.
export function team (league, code) {
  const key = `${league}|${code}`
  if (teamCache.has(key)) return teamCache.get(key)
  const L = LEAGUES[league]
  const row = L.teams.find((t) => t[0] === code)
  const r = rng(hashStr(`team|v1|${key}`))
  // Names unique across the league: each team draws from its own slice.
  const idx = L.teams.findIndex((t) => t[0] === code)
  const pool = PLAYER_WORDS.filter((_, i) => i % L.teams.length === idx)
  const names = [...pool].sort((a, b) => hashStr(`${key}|${a}`) - hashStr(`${key}|${b}`))
  const roles = L.sport === 'basketball' ? ['G', 'G', 'F', 'F', 'C', 'G', 'F', 'C'] : ['QB', 'RB', 'WR', 'WR', 'TE', 'K', 'LB', 'CB']
  const players = roles.map((pos, i) => ({ name: `${INITIALS[Math.floor(r() * INITIALS.length)]}. ${names[i % names.length]}`, pos, skill: 0.75 + r() * 0.5 }))
  const t = { code, city: row[1], name: row[2], full: `${row[1]} ${row[2]}`, strength: (r() - 0.5) * 2 * (L.sport === 'basketball' ? 7 : 6), players }
  teamCache.set(key, t)
  return t
}

// --- the schedule -------------------------------------------------------------------------

export const gameStart = (league, n) => SPORTS_EPOCH + LEAGUES[league].offset + n * LEAGUES[league].every
export const gameNumberAt = (league, t) => Math.floor((t - SPORTS_EPOCH - LEAGUES[league].offset) / LEAGUES[league].every)

function matchup (league, n) {
  const L = LEAGUES[league]
  const r = rng(hashStr(`match|v1|${league}|${n}`))
  const a = Math.floor(r() * L.teams.length)
  let b = Math.floor(r() * (L.teams.length - 1))
  if (b >= a) b++
  return { home: L.teams[a][0], away: L.teams[b][0] }
}

// --- basketball ----------------------------------------------------------------------------
//
// 4 quarters of 12 minutes, played at twice real speed (a quarter takes six
// real minutes), 30 seconds between quarters, two minutes at half time, and
// five-minute overtimes until someone leads.

const HOOPS_SPEED = 2
const SHOT2 = ['hits a pull-up jumper', 'finishes at the rim', 'banks in a floater', 'scores in the post', 'lays it in', 'hits from the elbow', 'throws down a dunk', 'drops in a hook shot', 'cuts and scores']
const SHOT3 = ['buries a three', 'hits a step-back three', 'drains it from the corner', 'pulls up from deep and hits', 'splashes a catch-and-shoot three', 'nails a three off the screen']
const MISS2 = ['misses a jumper', 'can’t finish at the rim', 'misses the floater', 'has the layup rim out', 'misses in the post']
const MISS3 = ['misses from three', 'airballs a three', 'misses from the corner', 'has the three rim out']
const TOS = ['loses it out of bounds', 'is stripped', 'throws it away', 'travels', 'steps out of bounds', 'is called for an offensive foul']

function simHoops (n) {
  const { home, away } = matchup('hoops', n)
  const H = team('hoops', home)
  const A = team('hoops', away)
  const r = rng(hashStr(`game|v1|hoops|${n}`))
  const start = gameStart('hoops', n)
  const form = { home: normal(r) * 2.5 + 1.5, away: normal(r) * 2.5 } // the night's form; home court is worth 1.5
  const edge = (side) => (side === 'home' ? H.strength + form.home - A.strength - form.away : A.strength + form.away - H.strength - form.home)
  const score = { home: 0, away: 0 }
  const plays = []
  let real = start
  let side = r() < 0.5 ? 'home' : 'away'
  const shooter = (T) => {
    const w = T.players.map((p, i) => p.skill * (i < 5 ? 1 : 0.35))
    let x = r() * w.reduce((a, b) => a + b, 0)
    for (let i = 0; i < w.length; i++) { x -= w[i]; if (x <= 0) return T.players[i] }
    return T.players[0]
  }
  const add = (q, clock, s, text, pts, kind, who) => {
    if (pts) score[s] += pts
    plays.push({ at: Math.round(real), q, clock: Math.max(0, Math.round(clock)), team: s, text, pts, kind, who: who || null, home: score.home, away: score.away })
  }
  const playPeriod = (q, length) => {
    let clock = length
    plays.push({ at: Math.round(real), q, clock, team: null, text: q === 1 ? 'Tip-off!' : q > 4 ? `Overtime ${q - 4} begins` : `Quarter ${q} begins`, pts: 0, kind: 'period', home: score.home, away: score.away })
    while (clock > 0) {
      const T = side === 'home' ? H : A
      const e = edge(side) / 450 // a percent or two either way
      let dur = 8 + r() * 14
      if (dur > clock) dur = clock
      clock -= dur
      real += (dur * SEC) / HOOPS_SPEED
      let alive = true
      let boards = 0
      while (alive) {
        const x = r()
        if (x < 0.13 - e * 0.5) { const p = shooter(T); add(q, clock, side, `${p.name} ${pickOf(r, TOS)}`, 0, 'turnover', p.name); alive = false } else if (x < 0.23) {
          const p = shooter(T)
          const made = (r() < 0.78 ? 1 : 0) + (r() < 0.78 ? 1 : 0)
          add(q, clock, side, `${p.name} is fouled: ${made} of 2 at the line`, made, 'ft', p.name)
          alive = false
        } else {
          const three = r() < 0.38
          const p = shooter(T)
          const hit = r() < (three ? 0.355 : 0.525) + e + (p.skill - 1) * 0.06
          if (hit) { add(q, clock, side, `${p.name} ${pickOf(r, three ? SHOT3 : SHOT2)}`, three ? 3 : 2, three ? 'three' : 'two', p.name); alive = false } else if (r() < 0.25 && boards < 2 && clock > 1) {
            boards++
            const reb = shooter(T)
            add(q, clock, side, `${p.name} ${pickOf(r, three ? MISS3 : MISS2)}; offensive rebound ${reb.name}`, 0, 'miss', p.name)
            const extra = Math.min(clock, 3 + r() * 5)
            clock -= extra
            real += (extra * SEC) / HOOPS_SPEED
          } else {
            const D = side === 'home' ? A : H
            add(q, clock, side, `${p.name} ${pickOf(r, three ? MISS3 : MISS2)}; ${shooter(D).name} rebounds`, 0, 'miss', p.name)
            alive = false
          }
        }
      }
      side = side === 'home' ? 'away' : 'home'
    }
    plays.push({ at: Math.round(real), q, clock: 0, team: null, text: q < 4 ? `End of quarter ${q}` : q === 4 ? 'End of regulation' : `End of overtime ${q - 4}`, pts: 0, kind: 'period-end', home: score.home, away: score.away })
  }
  for (let q = 1; q <= 4; q++) { playPeriod(q, 12 * 60); real += q === 2 ? 2 * MIN : 30 * SEC }
  let q = 5
  while (score.home === score.away) { playPeriod(q, 5 * 60); real += 30 * SEC; q++ }
  const end = plays[plays.length - 1].at
  plays.push({ at: end, q: q - 1, clock: 0, team: null, text: `Final: ${score.home > score.away ? H.full : A.full} win ${Math.max(score.home, score.away)}–${Math.min(score.home, score.away)}`, pts: 0, kind: 'final', home: score.home, away: score.away })
  return { league: 'hoops', n, id: `hoops-${n}`, start, end, home, away, plays, form, periods: 4, periodSecs: 12 * 60, final: { ...score } }
}

// --- football ------------------------------------------------------------------------------
//
// 4 quarters of 15 minutes at 1.5× real speed (ten real minutes a quarter),
// 30 seconds between quarters, three minutes at half time. A tie after four
// goes to a ten-minute overtime, first score wins; still tied, it's a tie.

const FOOT_SPEED = 1.5
const RUNS = ['runs up the middle', 'bounces it outside', 'cuts back', 'powers ahead', 'slips through the line', 'runs off tackle']
const CATCHES = ['catches it over the middle', 'hauls it in on the sideline', 'makes the grab', 'catches a quick slant', 'reels in a deep ball', 'snags it in traffic']

function simFoot (n) {
  const { home, away } = matchup('gridiron', n)
  const H = team('gridiron', home)
  const A = team('gridiron', away)
  const r = rng(hashStr(`game|v1|gridiron|${n}`))
  const start = gameStart('gridiron', n)
  const form = { home: normal(r) * 2 + 1.2, away: normal(r) * 2 }
  const edge = (s) => (s === 'home' ? H.strength + form.home - A.strength - form.away : A.strength + form.away - H.strength - form.home) / 10 // ~±1
  const score = { home: 0, away: 0 }
  const plays = []
  let real = start
  let pos = r() < 0.5 ? 'home' : 'away'
  let yl = 25
  let down = 1
  let togo = 10
  const other = (s) => (s === 'home' ? 'away' : 'home')
  const T = (s) => (s === 'home' ? H : A)
  const p = (s, i) => T(s).players[i]
  let ended = false
  const add = (q, clock, s, text, pts, kind, who) => {
    if (pts) score[s] += pts
    plays.push({ at: Math.round(real), q, clock: Math.max(0, Math.round(clock)), team: s, text, pts, kind, who: who || null, home: score.home, away: score.away, pos, yl, down, togo })
  }
  const kickoff = (q, clock, kicking) => {
    pos = other(kicking)
    const back = r() < 0.75 ? 25 : Math.max(8, Math.min(45, Math.round(22 + normal(r) * 8)))
    yl = back
    down = 1
    togo = 10
    add(q, clock, kicking, back === 25 ? `${p(kicking, 5).name} kicks off: touchback, ${T(pos).code} ball at their 25` : `${p(kicking, 5).name} kicks off, returned to the ${T(pos).code} ${back}`, 0, 'kick')
  }
  const playPeriod = (q, length, ot = false) => {
    let clock = length
    plays.push({ at: Math.round(real), q, clock, team: null, text: q === 1 ? 'Kickoff!' : ot ? 'Overtime' : `Quarter ${q} begins`, pts: 0, kind: 'period', home: score.home, away: score.away, pos, yl, down, togo })
    if (q === 1 || q === 3 || ot) kickoff(q, clock, q === 3 ? first : ot ? (r() < 0.5 ? 'home' : 'away') : other(first))
    while (clock > 0 && !ended) {
      const e = edge(pos)
      const use = (s) => { const d = Math.min(clock, s); clock -= d; real += (d * SEC) / FOOT_SPEED }
      // Fourth down: kick, punt or go for it.
      if (down === 4) {
        const fg = 100 - yl + 17
        if (fg <= 55 && !(togo <= 1 && yl >= 60 && r() < 0.35)) {
          const made = r() < Math.max(0.3, Math.min(0.99, 1.02 - (fg - 18) * 0.017 + e * 0.02))
          use(5)
          add(q, clock, pos, `${p(pos, 5).name} ${made ? 'makes' : 'misses'} a ${fg}-yard field goal`, made ? 3 : 0, made ? 'fg' : 'fg-miss', p(pos, 5).name)
          const kicker = pos
          if (made) kickoff(q, clock, kicker)
          else { pos = other(kicker); yl = Math.max(20, 100 - yl - 7); down = 1; togo = 10 }
          if (ot && made) ended = true
          continue
        }
        if (!(togo <= 2 && yl >= 40 && yl <= 70 && r() < 0.5)) {
          const net = Math.round(41 + normal(r) * 7)
          use(6)
          const land = yl + net
          const kicker = pos
          pos = other(kicker)
          yl = land >= 100 ? 20 : 100 - land
          down = 1
          togo = 10
          add(q, clock, kicker, `${p(kicker, 5).name} punts${land >= 100 ? ' into the end zone: touchback' : ` ${net} yards`}, ${T(pos).code} ball at their ${yl}`, 0, 'punt')
          continue
        }
      }
      const passing = r() < (down === 3 && togo > 4 ? 0.8 : 0.56)
      let gain = 0
      let text = ''
      let stop = true
      let turnover = false
      if (passing) {
        const qb = p(pos, 0)
        const x = r()
        if (x < 0.065 - e * 0.01) { gain = -Math.round(5 + r() * 5); text = `${qb.name} is sacked`; stop = false } else if (x < 0.09 - e * 0.012) { turnover = true; text = `${qb.name}’s pass is intercepted` } else if (x < 0.09 + 0.575 + e * 0.03) {
          const rec = p(pos, pickOf(r, [2, 2, 3, 3, 4, 1]))
          gain = Math.max(1, Math.round(5.5 + Math.abs(normal(r)) * 8.5 + (r() < 0.06 ? 20 + r() * 40 : 0) + e * 1.2))
          text = `${qb.name} to ${rec.name}: ${rec.name.split(' ')[1]} ${pickOf(r, CATCHES)}`
          stop = r() < 0.3
        } else { text = `${qb.name}’s pass falls incomplete`; gain = 0 }
      } else {
        const rb = p(pos, r() < 0.85 ? 1 : 0)
        if (r() < 0.012) { turnover = true; text = `${rb.name} fumbles, and the defense recovers` } else {
          gain = Math.round(3.3 + normal(r) * 4.2 + (r() < 0.025 ? 18 + r() * 45 : 0) + e * 0.7)
          text = `${rb.name} ${pickOf(r, RUNS)}`
          stop = false
        }
      }
      use(stop ? 6 + r() * 3 : 28 + r() * 12)
      if (turnover) {
        add(q, clock, pos, text, 0, 'turnover')
        pos = other(pos)
        yl = Math.max(5, Math.min(95, 100 - yl - Math.round(r() * 10)))
        down = 1
        togo = 10
        continue
      }
      const before = yl
      yl += gain
      if (yl >= 100) {
        add(q, clock, pos, `${text} for a touchdown! (${100 - before} yards)`, 6, 'td')
        const xp = r() < 0.94
        add(q, clock, pos, `${p(pos, 5).name} ${xp ? 'adds the extra point' : 'misses the extra point'}`, xp ? 1 : 0, 'xp')
        if (ot) { ended = true; break }
        kickoff(q, clock, pos)
        continue
      }
      if (yl <= 0) {
        add(q, clock, pos, `${text}: tackled in the end zone for a safety`, 0, 'safety')
        score[other(pos)] += 2
        plays[plays.length - 1].home = score.home
        plays[plays.length - 1].away = score.away
        if (ot) { ended = true; break }
        kickoff(q, clock, pos)
        continue
      }
      add(q, clock, pos, `${text}${gain ? ` for ${Math.abs(gain) === 1 ? 'a yard' : `${Math.abs(gain)} yards`}${gain < 0 ? ' lost' : ''}` : passing ? '' : ' for no gain'}`, 0, passing ? 'pass' : 'run')
      if (gain >= togo) { down = 1; togo = Math.min(10, 100 - yl) } else { down++; togo -= gain; if (down > 4) { pos = other(pos); yl = 100 - yl; down = 1; togo = 10; plays[plays.length - 1].text += ': turnover on downs' } }
    }
    plays.push({ at: Math.round(real), q, clock: 0, team: null, text: q < 4 ? `End of quarter ${q}` : q === 4 ? 'End of regulation' : 'End of overtime', pts: 0, kind: 'period-end', home: score.home, away: score.away, pos, yl, down, togo })
  }
  const first = r() < 0.5 ? 'home' : 'away'
  for (let q = 1; q <= 4; q++) { playPeriod(q, 15 * 60); real += q === 2 ? 3 * MIN : 30 * SEC }
  if (score.home === score.away) { playPeriod(5, 10 * 60, true); real += 0 }
  const end = plays[plays.length - 1].at
  const tie = score.home === score.away
  plays.push({ at: end, q: plays[plays.length - 1].q, clock: 0, team: null, text: tie ? `Final: a ${score.home}–${score.away} tie` : `Final: ${score.home > score.away ? H.full : A.full} win ${Math.max(score.home, score.away)}–${Math.min(score.home, score.away)}`, pts: 0, kind: 'final', home: score.home, away: score.away })
  return { league: 'gridiron', n, id: `gridiron-${n}`, start, end, home, away, plays, form, periods: 4, periodSecs: 15 * 60, final: { ...score } }
}

const gameCache = new Map()
export function game (league, n) {
  const key = `${league}-${n}`
  let g = gameCache.get(key)
  if (!g) {
    g = league === 'hoops' ? simHoops(n) : simFoot(n)
    if (gameCache.size > 400) gameCache.clear()
    gameCache.set(key, g)
  }
  return g
}
export const gameById = (id) => { const m = /^(hoops|gridiron)-(\d+)$/.exec(String(id)); return m ? game(m[1], Number(m[2])) : null }

// --- watching ----------------------------------------------------------------------------

// How far through the game we are at t: the plays so far and the state.
export function stateAt (g, t) {
  if (t < g.start) return { status: 'pre', home: 0, away: 0, plays: [], q: 0, clock: g.periodSecs, last: null }
  let i = 0
  // Plays are in time order: find the last one at or before t.
  let lo = 0
  let hi = g.plays.length - 1
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (g.plays[mid].at <= t) { i = mid + 1; lo = mid + 1 } else hi = mid - 1 }
  const so = g.plays.slice(0, i)
  const last = so[so.length - 1] || null
  const final = t >= g.end
  return { status: final ? 'final' : 'live', home: last?.home || 0, away: last?.away || 0, plays: so, q: last?.q || 1, clock: last?.clock ?? g.periodSecs, last }
}

// Game seconds left in regulation (0 in overtime), at a play.
function secsLeft (g, st) {
  if (st.status === 'pre') return g.periods * g.periodSecs
  if (st.q > g.periods) return 0
  return (g.periods - st.q) * g.periodSecs + st.clock
}

// Measured from 20,000 simulated games each (see test/sports.test.js).
export const SPREAD = { hoops: 16.2, gridiron: 16.2 } // the spread of the final margin, in points, from the opening tip
export const HOME_EDGE = { hoops: 1.64, gridiron: 2.42 }
export const EDGE_SCALE = { hoops: 1.14, gridiron: 1.91 } // points a strength point is worth over a game

// The chance the home team wins at time t, from the score and the clock
// (and, in football, the ball). Ties in football count half.
export function winChance (g, t, st = stateAt(g, t)) {
  if (st.status === 'final') return st.home > st.away ? 1 : st.home < st.away ? 0 : 0.5
  const H = team(g.league, g.home)
  const A = team(g.league, g.away)
  const full = g.periods * g.periodSecs
  const left = secsLeft(g, st)
  const frac = Math.max(0, left / full)
  const expected = (H.strength - A.strength) * EDGE_SCALE[g.league] + HOME_EDGE[g.league]
  let lead = st.home - st.away + expected * frac
  if (g.league === 'gridiron' && st.last?.pos && st.status === 'live') {
    // The ball is worth something: about the points a drive from there makes.
    const ep = -0.6 + 0.062 * (st.last.yl ?? 25)
    lead += st.last.pos === 'home' ? ep : -ep
  }
  // Overtime and the very end: whatever's on the board, plus a little.
  const spread = SPREAD[g.league] * Math.sqrt(Math.max(frac, 0.004)) + (st.q > g.periods ? 4 : 0)
  return Math.min(0.995, Math.max(0.005, normCdf(lead / spread)))
}

// What's on: games that are live, the next few, and recent finals.
export function slate (league, t, { next = 6, past = 6 } = {}) {
  const n = gameNumberAt(league, t)
  const out = { live: [], upcoming: [], recent: [] }
  for (let k = n - 3; k <= n + next; k++) {
    if (k < 0) continue
    const start = gameStart(league, k)
    if (start > t) { out.upcoming.push(k); continue }
    const g = game(league, k)
    if (t < g.end) out.live.push(k)
  }
  for (let k = n; k >= 0 && out.recent.length < past; k--) {
    if (gameStart(league, k) > t) continue
    const g = game(league, k)
    if (t >= g.end) out.recent.push(k)
  }
  out.upcoming = out.upcoming.slice(0, next)
  return out
}
