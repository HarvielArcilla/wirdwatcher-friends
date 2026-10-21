// The Wird leagues: basketball and American football between the league’s teams
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

import { EVENT_LEAGUES, eventGame, eventChance, eventSlate, eventStart } from './events.js'
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
      ['LAL', 'Los Angeles', 'Lexicons', '#7a3fc4', '#e8b23a'], ['BOS', 'Boston', 'Bylines', '#1f8a4c', '#c8a45c'], ['CHI', 'Chicago', 'Syllables', '#c8323c', '#2a2a2a'], ['SEA', 'Seattle', 'Semicolons', '#127a86', '#8acf3a'],
      ['MIA', 'Miami', 'Metaphors', '#e8507a', '#2ab0c8'], ['DEN', 'Denver', 'Diphthongs', '#2a5ab8', '#f0b43c'], ['AUS', 'Austin', 'Adverbs', '#e0782a', '#5a3a8a'], ['PHX', 'Phoenix', 'Phonemes', '#d8582a', '#6a3ab8'],
      ['POR', 'Portland', 'Palindromes', '#b8202e', '#3a3a3a'], ['ATL', 'Atlanta', 'Anagrams', '#d63a2a', '#c8b45a'], ['NYN', 'New York', 'Neologisms', '#2a6ad8', '#f07a2a'], ['DET', 'Detroit', 'Dashes', '#2a8ad8', '#9aa3b0']
    ],
    every: 29 * MIN,
    offset: 0
  },
  gridiron: {
    id: 'gridiron', name: 'Word Football League', short: 'WFL', sport: 'football', emoji: '🏈',
    teams: [
      ['DAL', 'Dallas', 'Dictionaries', '#2a4a8a', '#9aa3b0'], ['GB', 'Green Bay', 'Glossaries', '#2a6a3a', '#e8b42a'], ['KC', 'Kansas City', 'Consonants', '#d82a3a', '#f0c02a'], ['PHI', 'Philadelphia', 'Pronouns', '#0f6a6a', '#9aa3b0'],
      ['PIT', 'Pittsburgh', 'Prepositions', '#e8b82a', '#2a2a2a'], ['NO', 'New Orleans', 'Nouns', '#b89a5a', '#2a2a2a'], ['BAL', 'Baltimore', 'Ballads', '#4a2a8a', '#c8a42a'], ['SF', 'San Francisco', 'Sonnets', '#b82a2a', '#c8a45c'],
      ['HOU', 'Houston', 'Hyphens', '#1f3a6a', '#c8323c'], ['MIN', 'Minnesota', 'Morphemes', '#5a2a8a', '#f0c02a'], ['NSH', 'Nashville', 'Narrators', '#3a8ad8', '#c8323c'], ['LV', 'Las Vegas', 'Limericks', '#a8aeb8', '#c8323c']
    ],
    every: 36 * MIN,
    offset: 15 * MIN
  },
  pitch: {
    id: 'pitch', name: 'Word Football Club League', short: 'WFC', sport: 'soccer', emoji: '⚽',
    teams: [
      ['LON', 'London', 'Lexemes', '#c8323c', '#2a4a8a'], ['MAN', 'Manchester', 'Monosyllables', '#5ab0e8', '#2a2a2a'], ['MAD', 'Madrid', 'Modifiers', '#c9a44a', '#7a3fc4'], ['BAR', 'Barcelona', 'Barbarisms', '#a8204a', '#2a4ab8'],
      ['MIL', 'Milan', 'Malapropisms', '#c8202e', '#1f1f1f'], ['MUN', 'Munich', 'Mnemonics', '#d8202e', '#2a5ab8'], ['PAR', 'Paris', 'Paragraphs', '#1f3a7a', '#d8323c'], ['LIS', 'Lisbon', 'Lisps', '#1f8a4c', '#e8e2d0'],
      ['AMS', 'Amsterdam', 'Ampersands', '#e8402a', '#e8e2d0'], ['DUB', 'Dublin', 'Digraphs', '#2a9a5a', '#e8902a'], ['GLA', 'Glasgow', 'Glyphs', '#1f7a4a', '#e8e2d0'], ['TOR', 'Toronto', 'Tildes', '#c8202e', '#2a5ab8']
    ],
    every: 52 * MIN,
    offset: 5 * MIN
  },
  // Fighters: [code, hometown, name, color, second color, nickname].
  ring: {
    id: 'ring', name: 'Word Boxing Council', short: 'WBC', sport: 'boxing', emoji: '🥊',
    teams: [
      ['SER', 'Seattle', 'J. Serendipity', '#c8323c', '#2a4a8a', 'The Thesaurus'], ['GRV', 'Glasgow', 'M. Gravy', '#e8902a', '#2a2a2a', 'Silver Tongue'],
      ['THN', 'Houston', 'T. Thunder', '#7a3fc4', '#e8b42a', 'Hard Consonant'], ['VEL', 'Lagos', 'A. Velvet', '#a8204a', '#c9a44a', 'The Soft Sell'],
      ['ZEP', 'Manila', 'R. Zephyr', '#127a86', '#e8b42a', 'Breeze'], ['QUX', 'Mexico City', 'D. Quixote', '#1f8a4c', '#c8323c', 'Windmill'],
      ['HUL', 'Belfast', 'K. Hullabaloo', '#2a6ad8', '#e8902a', 'The Commotion'], ['MRG', 'Accra', 'S. Marigold', '#e8b82a', '#5a2a8a', 'Petals'],
      ['COB', 'Tokyo', 'N. Cobalt', '#2a4ab8', '#c8c8c8', 'Blue Note'], ['EMB', 'Philadelphia', 'L. Ember', '#d8582a', '#2a2a2a', 'Slow Burn'],
      ['FAL', 'Cardiff', 'P. Falcon', '#8a6a3a', '#e8b42a', 'Talons'], ['GRN', 'Johannesburg', 'B. Granite', '#7a7f88', '#c8323c', 'The Wall'],
      ['NIM', 'Havana', 'E. Nimbus', '#4a9ee8', '#2a2a2a', 'Cloud Nine'], ['RAV', 'Liverpool', 'O. Raven', '#5a5a8a', '#c8323c', 'Nevermore'],
      ['TUN', 'Almaty', 'V. Tundra', '#5ab0e8', '#1f3a7a', 'The Freeze'], ['SAF', 'Mumbai', 'I. Saffron', '#e8a03a', '#a8204a', 'Spice']
    ],
    every: 21 * MIN,
    offset: 2 * MIN
  },
  cage: {
    id: 'cage', name: 'Word Fighting Championship', short: 'WFC MMA', sport: 'mma', emoji: '🥋',
    teams: [
      ['WOM', 'Sydney', 'G. Wombat', '#8a6a3a', '#2a6a3a', 'The Burrow'], ['KRF', 'Dublin', 'C. Kerfuffle', '#2a9a5a', '#e8902a', 'Chaos Theory'],
      ['LAB', 'Rio de Janeiro', 'F. Labyrinth', '#e8b82a', '#1f8a4c', 'Maze Runner'], ['VOR', 'Moscow', 'Y. Vortex', '#c8202e', '#1f3a7a', 'The Drain'],
      ['GIZ', 'Albuquerque', 'H. Gizmo', '#7a3fc4', '#c8a42a', 'Gadget'], ['OBL', 'Cairo', 'A. Obelisk', '#c9a44a', '#2a4a8a', 'The Monument'],
      ['SHN', 'Las Vegas', 'T. Shenanigan', '#2ab0c8', '#e8507a', 'Mischief'], ['BRO', 'Stockholm', 'J. Brouhaha', '#2a6ad8', '#e8b82a', 'Uproar'],
      ['JAR', 'Denver', 'M. Jargon', '#d63a2a', '#9aa3b0', 'Fine Print'], ['TUM', 'Phoenix', 'R. Tumbleweed', '#c8783a', '#2a6ad8', 'Drifter'],
      ['FLX', 'Montreal', 'S. Flummox', '#3a8ad8', '#c8323c', 'The Puzzler'], ['WHI', 'Auckland', 'L. Whirlwind', '#1f7a4a', '#e8b82a', 'Gale Force'],
      ['DYN', 'Seoul', 'K. Dynamo', '#e8402a', '#5a5a8a', 'Live Wire'], ['RIG', 'Manchester', 'D. Rigmarole', '#5a2a8a', '#5ab0e8', 'The Runaround'],
      ['HUB', 'Chicago', 'P. Hubbub', '#b8202e', '#c9a44a', 'Racket'], ['VAG', 'Lisbon', 'N. Vagabond', '#0f6a6a', '#e8b82a', 'No Fixed Abode']
    ],
    every: 10 * MIN,
    offset: 4 * MIN
  },
  // Politics and pop culture (src/shared/events.js).
  ...EVENT_LEAGUES
}

// Two teams' colors for one game: the away team wears its second color if
// the two are too alike.
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
export function gameColors (home, away) {
  const [a, b] = [rgb(home.color), rgb(away.color)]
  const close = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 110
  return { home: home.color, away: close ? away.alt : away.color }
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
  const roles = L.sport === 'basketball' ? ['G', 'G', 'F', 'F', 'C', 'G', 'F', 'C'] : L.sport === 'soccer' ? ['FW', 'FW', 'MF', 'MF', 'MF', 'DF', 'DF', 'GK'] : ['QB', 'RB', 'WR', 'WR', 'TE', 'K', 'LB', 'CB']
  const players = roles.map((pos, i) => ({ name: `${INITIALS[Math.floor(r() * INITIALS.length)]}. ${names[i % names.length]}`, pos, skill: 0.75 + r() * 0.5 }))
  const fighter = L.sport === 'boxing' || L.sport === 'mma'
  const t = { code, city: row[1], name: row[2], full: fighter ? row[2] : `${row[1]} ${row[2]}`, nickname: row[5] || null, fighter, color: row[3], alt: row[4], strength: (r() - 0.5) * 2 * (L.sport === 'basketball' ? 7 : L.sport === 'soccer' ? 2.5 : fighter ? 3 : 6), players }
  teamCache.set(key, t)
  return t
}

// --- the schedule -------------------------------------------------------------------------

export const gameStart = (league, n) => EVENT_LEAGUES[league] ? eventStart(league, n) : SPORTS_EPOCH + LEAGUES[league].offset + n * LEAGUES[league].every
export const gameNumberAt = (league, t) => Math.floor((t - SPORTS_EPOCH - LEAGUES[league].offset) / LEAGUES[league].every)

// The schedule: a round-robin season, over and over. Each round is six
// games that between them use all twelve teams once, so games within a
// round never share a team, and each round is ordered so its first game
// avoids the two teams that just played: nobody plays two games in a row.
// Each season the teams are shuffled (from the season's number) and home
// and away swap halfway.
// (Twelve teams: rounds of six, a season of 66. Sixteen fighters: rounds of
// eight, a season of 120.)
const roundOf = (league) => LEAGUES[league].teams.length / 2
const seasonOf = (league) => (LEAGUES[league].teams.length - 1) * roundOf(league)
const seasons = new Map() // league -> [season][game] = [home, away] (indexes)

function circleRounds (order) {
  const n = order.length
  const fixed = order[0]
  const rest = order.slice(1)
  const rounds = []
  for (let k = 0; k < n - 1; k++) {
    const ring = [fixed, ...rest.slice(k), ...rest.slice(0, k)]
    const games = []
    for (let i = 0; i < n / 2; i++) games.push((k + i) % 2 ? [ring[i], ring[n - 1 - i]] : [ring[n - 1 - i], ring[i]])
    rounds.push(games)
  }
  return rounds
}

function seasonGames (league, c) {
  let list = seasons.get(league)
  if (!list) { list = []; seasons.set(league, list) }
  while (list.length <= c) {
    const k = list.length
    const L = LEAGUES[league]
    const r = rng(hashStr(`season|v1|${league}|${k}`))
    const order = L.teams.map((_, i) => i).sort((a, b) => hashStr(`s|${league}|${k}|${a}`) - hashStr(`s|${league}|${k}|${b}`))
    const rounds = circleRounds(order)
    const out = []
    let prev = k ? list[k - 1][seasonOf(league) - 1] : null
    for (const round of rounds) {
      // Shuffle the round, then lead with a game that shares no team with the last one.
      const games = [...round].sort(() => r() - 0.5)
      const first = games.findIndex((g) => !prev || (!g.includes(prev[0]) && !g.includes(prev[1])))
      const lead = games.splice(first, 1)[0]
      for (const g of [lead, ...games]) out.push(k % 2 ? [g[1], g[0]] : g)
      prev = out[out.length - 1]
    }
    list.push(out)
  }
  return list[c]
}

function matchup (league, n) {
  const L = LEAGUES[league]
  const [h, a] = seasonGames(league, Math.floor(n / seasonOf(league)))[n % seasonOf(league)]
  return { home: L.teams[h][0], away: L.teams[a][0] }
}

// --- basketball ----------------------------------------------------------------------------
//
// 4 quarters of 12 minutes, played at twice real speed (a quarter takes six
// real minutes), 30 seconds between quarters, two minutes at half time, and
// five-minute overtimes until someone leads.

// Every sport's clock runs at the same pace: two game seconds a real one.
export const GAME_SPEED = 2
const HOOPS_SPEED = GAME_SPEED
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
  return { league: 'hoops', n, id: gameId('hoops', n), start, end, home, away, plays, form, periods: 4, periodSecs: 12 * 60, final: { ...score } }
}

// --- football ------------------------------------------------------------------------------
//
// 4 quarters of 15 minutes at 1.5× real speed (ten real minutes a quarter),
// 30 seconds between quarters, three minutes at half time. A tie after four
// goes to a ten-minute overtime, first score wins; still tied, it's a tie.

const FOOT_SPEED = GAME_SPEED
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
      let who = null // who'd score if this goes in
      let passer = null
      if (passing) {
        const qb = p(pos, 0)
        const x = r()
        if (x < 0.065 - e * 0.01) { gain = -Math.round(5 + r() * 5); text = `${qb.name} is sacked`; stop = false } else if (x < 0.09 - e * 0.012) { turnover = true; text = `${qb.name}’s pass is intercepted` } else if (x < 0.09 + 0.575 + e * 0.03) {
          const rec = p(pos, pickOf(r, [2, 2, 3, 3, 4, 1]))
          gain = Math.max(1, Math.round(5.5 + Math.abs(normal(r)) * 8.5 + (r() < 0.06 ? 20 + r() * 40 : 0) + e * 1.2))
          text = `${qb.name} to ${rec.name}: ${rec.name.split(' ')[1]} ${pickOf(r, CATCHES)}`
          who = rec.name
          passer = qb.name
          stop = r() < 0.3
        } else { text = `${qb.name}’s pass falls incomplete`; gain = 0 }
      } else {
        const rb = p(pos, r() < 0.85 ? 1 : 0)
        if (r() < 0.012) { turnover = true; text = `${rb.name} fumbles, and the defense recovers` } else {
          gain = Math.round(3.3 + normal(r) * 4.2 + (r() < 0.025 ? 18 + r() * 45 : 0) + e * 0.7)
          text = `${rb.name} ${pickOf(r, RUNS)}`
          who = rb.name
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
        add(q, clock, pos, passer ? `TOUCHDOWN! ${passer} finds ${who} for a ${100 - before}-yard score` : `TOUCHDOWN! ${who} runs it in from ${100 - before} yards`, 6, passer ? 'td-pass' : 'td-rush', who)
        if (passer) plays[plays.length - 1].passer = passer
        const xp = r() < 0.94
        add(q, clock, pos, `${p(pos, 5).name} ${xp ? 'adds the extra point' : 'misses the extra point'}`, xp ? 1 : 0, 'xp', p(pos, 5).name)
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
    plays.push({ at: Math.round(real), q, clock: Math.max(0, Math.round(clock)), team: null, text: q < 4 ? `End of quarter ${q}` : q === 4 ? 'End of regulation' : 'End of overtime', pts: 0, kind: 'period-end', home: score.home, away: score.away, pos, yl, down, togo })
  }
  const first = r() < 0.5 ? 'home' : 'away'
  for (let q = 1; q <= 4; q++) { playPeriod(q, 15 * 60); real += q === 2 ? 3 * MIN : 30 * SEC }
  if (score.home === score.away) { playPeriod(5, 10 * 60, true); real += 0 }
  const end = plays[plays.length - 1].at
  const tie = score.home === score.away
  plays.push({ at: end, q: plays[plays.length - 1].q, clock: 0, team: null, text: tie ? `Final: a ${score.home}–${score.away} tie` : `Final: ${score.home > score.away ? H.full : A.full} win ${Math.max(score.home, score.away)}–${Math.min(score.home, score.away)}`, pts: 0, kind: 'final', home: score.home, away: score.away })
  return { league: 'gridiron', n, id: gameId('gridiron', n), start, end, home, away, plays, form, periods: 4, periodSecs: 15 * 60, final: { ...score } }
}


// --- soccer --------------------------------------------------------------------------------
//
// Two halves of 45 minutes at three times real speed (fifteen real minutes
// a half), two minutes at half time, and a few minutes of added time at the
// end of each half. Goals come at a steady rate set by the two teams (so the
// chances, worked out from the minutes left, are exact); everything else is
// the game around them: the ball moving up and down, chances, saves,
// corners, fouls and cards. The ball's position is x from 0 (the away
// team's goal, on the left) to 100 (the home team's goal).

export const SOCCER_SPEED = GAME_SPEED
const HALF = 45 * 60
const PASSES = ['plays it into midfield', 'switches the play', 'carries it forward', 'finds a teammate in space', 'plays a one-two', 'drives down the wing', 'threads a pass forward']
const BACK = ['recycles it to the back', 'plays it back to the keeper', 'keeps it in midfield', 'switches it across the back line', 'lays it off sideways']
const WINS = ['wins it back', 'intercepts a loose pass', 'nicks it off a toe', 'heads it clear', 'steps in and takes it', 'closes down and wins the ball']
const PASS_TO = [
  (a, b) => `${a} plays it to ${b}`, (a, b) => `${a} finds ${b} in space`, (a, b) => `${a} slides it through to ${b}`, (a, b) => `${a} swings it wide to ${b}`,
  (a, b) => `${a} and ${b} play a one-two`, (a, b) => `${a} lofts it over the top for ${b}`, (a, b) => `${a} squares it to ${b}`, (a, b) => `${a} lays it back to ${b}`
]
const SHOTS_SAVED = ['shoots, and the keeper saves', 'tests the keeper from distance', 'forces a diving save', 'heads it at the keeper']
const SHOTS_WIDE = ['shoots wide', 'curls it just over', 'drags a shot past the post', 'heads it over the bar', 'blazes it into the stands']
const GOALS = ['fires it into the bottom corner', 'heads it in', 'slots it past the keeper', 'curls it into the top corner', 'taps it in at the back post', 'smashes it in from the edge of the box', 'chips the keeper']

// Goals a team should score over a full match, against this opponent.
export function soccerRate (g, side) {
  const H = team('pitch', g.home)
  const A = team('pitch', g.away)
  const edge = side === 'home' ? H.strength - A.strength + 0.25 : A.strength - H.strength
  return 1.3 * Math.exp(0.16 * edge)
}

function simSoccer (n) {
  const { home, away } = matchup('pitch', n)
  const H = team('pitch', home)
  const A = team('pitch', away)
  const r = rng(hashStr(`game|v1|pitch|${n}`))
  const start = gameStart('pitch', n)
  const g0 = { home, away }
  const per = { home: soccerRate(g0, 'home') / (2 * HALF), away: soccerRate(g0, 'away') / (2 * HALF) }
  const score = { home: 0, away: 0 }
  const plays = []
  let real = start
  let x = 50
  let poss = r() < 0.5 ? 'home' : 'away'
  const T = (s) => (s === 'home' ? H : A)
  const other = (s) => (s === 'home' ? 'away' : 'home')
  const toward = (s) => (s === 'away' ? 1 : -1) // away attacks to the right, home to the left
  const attackingThird = (s, x0) => (s === 'away' ? x0 > 70 : x0 < 30)
  const player = (s, attack) => {
    const ps = T(s).players
    const w = ps.map((p) => (attack ? { FW: 4, MF: 2, DF: 0.6, GK: 0 }[p.pos] : { FW: 1, MF: 2, DF: 2, GK: 0.5 }[p.pos]) * p.skill)
    let v = r() * w.reduce((a, b) => a + b, 0)
    for (let i = 0; i < w.length; i++) { v -= w[i]; if (v <= 0) return ps[i] }
    return ps[0]
  }
  const add = (half, clock, side, text, pts, kind, who) => {
    if (pts) score[side] += pts
    plays.push({ at: Math.round(real), q: half, clock: Math.round(clock), team: side, text, pts, kind, who: who || null, home: score.home, away: score.away, pos: poss, x: Math.round(x), added: null })
  }
  const playHalf = (half) => {
    const from = (half - 1) * HALF
    const added = 60 * (1 + Math.floor(r() * (half === 1 ? 3 : 5))) // 1–3 minutes, then 1–5
    const to = from + HALF + added
    let clock = from
    x = 50
    poss = half === 1 ? poss : other(poss)
    plays.push({ at: Math.round(real), q: half, clock, team: poss, text: half === 1 ? 'Kick-off!' : 'The second half is under way', pts: 0, kind: 'period', home: score.home, away: score.away, pos: poss, x, added: null })
    let announced = false
    while (clock < to) {
      const dt = Math.min(to - clock, 25 + r() * 35)
      clock += dt
      real += (dt * SEC) / SOCCER_SPEED
      if (!announced && clock >= from + HALF) {
        announced = true
        plays.push({ at: Math.round(real), q: half, clock: Math.round(clock), team: null, text: `${added / 60} minute${added === 60 ? '' : 's'} added on`, pts: 0, kind: 'added', home: score.home, away: score.away, pos: poss, x: Math.round(x), added })
      }
      // Goals: a steady rate for each side.
      const gh = r() < per.home * dt
      const ga = r() < per.away * dt
      if (gh || ga) {
        const side = gh && ga ? (r() < 0.5 ? 'home' : 'away') : gh ? 'home' : 'away'
        poss = side
        x = side === 'away' ? 92 + r() * 6 : 2 + r() * 6
        const scorer = player(side, true)
        let assist = player(side, true)
        if (assist === scorer) assist = null
        add(half, clock, side, `GOAL! ${scorer.name} ${pickOf(r, GOALS)}${assist ? ` (assist: ${assist.name})` : ''}`, 1, 'goal', scorer.name)
        if (assist) plays[plays.length - 1].assist = assist.name
        x = 50
        poss = other(side)
        continue
      }
      // Everything else.
      const v = r()
      if (v < 0.18) {
        // The other side wins it back.
        poss = other(poss)
        x = Math.max(4, Math.min(96, x - toward(poss) * (5 + r() * 15)))
        const p = player(poss, false)
        add(half, clock, poss, `${p.name} ${pickOf(r, WINS)}`, 0, 'tackle')
      } else if (v < 0.58) {
        // Passing it about, mostly forward.
        x = Math.max(4, Math.min(96, x + toward(poss) * (6 + r() * 20)))
        const a = player(poss, false)
        let b = player(poss, r() < 0.5)
        if (b === a) b = T(poss).players[(T(poss).players.indexOf(a) + 1) % 7]
        add(half, clock, poss, pickOf(r, PASS_TO)(a.name, b.name), 0, 'pass')
      } else if (v < 0.7) {
        x = Math.max(4, Math.min(96, x - toward(poss) * (5 + r() * 12)))
        add(half, clock, poss, `${player(poss, false).name} ${pickOf(r, BACK)}`, 0, 'pass')
      } else if (v < 0.76) {
        x = Math.max(4, Math.min(96, x + toward(poss) * (10 + r() * 25)))
        add(half, clock, poss, `${player(poss, true).name} ${pickOf(r, PASSES)}`, 0, 'pass')
      } else if (v < 0.88) {
        // A chance that doesn't go in.
        x = poss === 'away' ? 78 + r() * 16 : 6 + r() * 16
        const p = player(poss, true)
        const k = r()
        if (k < 0.4) { add(half, clock, poss, `${p.name} ${pickOf(r, SHOTS_SAVED)}`, 0, 'save', p.name); if (r() < 0.35) add(half, clock, poss, `Corner to ${T(poss).name}`, 0, 'corner') } else if (k < 0.85) { add(half, clock, poss, `${p.name} ${pickOf(r, SHOTS_WIDE)}`, 0, 'wide', p.name); x = poss === 'away' ? 95 : 5; poss = other(poss) } else { add(half, clock, poss, `${p.name}’s shot is blocked`, 0, 'blocked', p.name) }
      } else if (v < 0.95) {
        const foul = player(other(poss), false)
        const card = r() < 0.22
        add(half, clock, other(poss), `Foul by ${foul.name}${card ? ': yellow card' : ''}. Free kick to ${T(poss).name}`, 0, card ? 'card' : 'foul', foul.name)
      } else if (v < 0.98) {
        const p = player(poss, true)
        add(half, clock, poss, `${p.name} is caught offside`, 0, 'offside', p.name)
        poss = other(poss)
      } else {
        add(half, clock, poss, `${T(poss).name} keep the ball and slow it down`, 0, 'pass')
      }
    }
    plays.push({ at: Math.round(real), q: half, clock: Math.round(clock), team: null, text: half === 1 ? 'Half time' : 'Full time', pts: 0, kind: half === 1 ? 'half-time' : 'period-end', home: score.home, away: score.away, pos: poss, x: 50, added })
  }
  playHalf(1)
  real += 2 * MIN
  playHalf(2)
  const end = plays[plays.length - 1].at
  const draw = score.home === score.away
  plays.push({ at: end, q: 2, clock: plays[plays.length - 1].clock, team: null, text: draw ? `Final: a ${score.home}–${score.away} draw` : `Final: ${score.home > score.away ? H.full : A.full} win ${Math.max(score.home, score.away)}–${Math.min(score.home, score.away)}`, pts: 0, kind: 'final', home: score.home, away: score.away })
  return { league: 'pitch', n, id: gameId('pitch', n), start, end, home, away, plays, periods: 2, periodSecs: HALF, countUp: true, final: { ...score } }
}

// --- boxing and MMA -------------------------------------------------------------------------
//
// A fight is rounds of exchanges between the red corner (home) and the blue
// corner (away). Every landed shot does damage; a knockdown or a submission
// can end it early, and otherwise three judges score each round 10–9 (10–8
// with a knockdown) and the cards decide it. Boxing: ten three-minute
// rounds at six times real speed. MMA: three five-minute rounds at three
// times, with takedowns, ground strikes and submissions.
//
// The same rules (fightStep) play out the real fight and, for the market,
// a few hundred possible futures from wherever the fight is, so the chances
// are the fight's own odds.

export const FIGHT = {
  ring: { sport: 'boxing', rounds: 10, roundSecs: 180, rest: 60, speed: GAME_SPEED },
  cage: { sport: 'mma', rounds: 3, roundSecs: 300, rest: 60, speed: GAME_SPEED }
}
const BOX_JAB = ['pops the jab', 'snaps out a stiff jab', 'paws with the jab and lands', 'doubles up on the jab']
const BOX_COMBO = ['lands a crisp one-two', 'digs a combination to the body', 'rattles off a three-punch combination', 'lands a jab and a straight right']
const BOX_POWER = ['lands a big right hand', 'rips a left hook', 'lands a clean uppercut', 'thuds a hook to the body', 'cracks an overhand right']
const BOX_MISS = ['swings and misses with a big right', 'loads up and misses', 'throws a hook that whistles past', 'misses with the jab']
const BOX_FLAVOR = ['They tie up and the referee breaks them', 'The crowd is on its feet', 'A feeling-out exchange in the center of the ring', 'The two trade at close range', 'Warned by the referee for holding']
const MMA_STAND = ['lands a heavy leg kick', 'lands a stiff jab', 'connects with a body kick', 'lands a straight left', 'throws a spinning back fist and lands', 'lands an elbow in the clinch', 'lands a teep to the body']
const MMA_MISS = ['misses with a head kick', 'swings wide', 'misses a spinning kick', 'is just short with the hook']
const MMA_SUBS = ['locks in a rear-naked choke', 'goes for an armbar', 'snaps on a guillotine', 'hunts for a triangle', 'goes for a heel hook', 'cinches a d’arce choke']
const MMA_GROUND = ['rains down ground and pound', 'lands elbows from the top', 'passes to side control', 'takes the back', 'lands short punches from full mount']
const MMA_FLAVOR = ['They circle the cage', 'Clinch against the fence', 'A wild exchange in the center', 'Both fighters reset']

const blankStats = () => ({ landed: 0, thrown: 0, kd: 0, td: 0, sub: 0, power: 0 })
export function fightStart () {
  return { round: 1, sec: 0, hp: { home: 100, away: 100 }, stam: { home: 100, away: 100 }, rd: { home: 0, away: 0 }, rkd: { home: 0, away: 0 }, ctrl: { home: 0, away: 0 }, top: null, cards: [[], [], []], won: { home: 0, away: 0 }, stats: { home: blankStats(), away: blankStats() }, over: null }
}
const cloneFight = (st) => JSON.parse(JSON.stringify(st))
const opp = (s) => (s === 'home' ? 'away' : 'home')

// One exchange: returns { dt, side, text, kind } or null. Changes st.
function fightStep (league, st, r, A, B) {
  const cfg = FIGHT[league]
  const edge = (A.strength - B.strength) * 0.035
  const tired = (s) => 0.85 + 0.15 * (st.stam[s] / 100)
  const pHome = Math.min(0.75, Math.max(0.25, 0.5 + edge * 0.8 + (st.hp.home - st.hp.away) * 0.002))
  const side = st.top || (r() < pHome ? 'home' : 'away')
  const other = opp(side)
  const me = side === 'home' ? A : B
  const sk = (side === 'home' ? 1 : -1) * edge // the attacker's edge
  const dt = (cfg.sport === 'boxing' ? 9 : 12) + r() * (cfg.sport === 'boxing' ? 9 : 14)
  const S = st.stats[side]
  const hit = (dmg) => { st.hp[other] = Math.max(0, st.hp[other] - dmg); st.rd[side] += dmg; S.landed++; S.thrown++ }
  st.stam[side] = Math.max(20, st.stam[side] - 1.2)
  let out = null
  if (cfg.sport === 'boxing') {
    const x = r()
    if (x < 0.12) out = { text: pickOf(r, BOX_FLAVOR), kind: 'flavor' }
    else if (x < 0.46) {
      if (r() < (0.45 + sk) * tired(side)) { hit(1 + r() * 1.5); out = { text: `${me.name} ${pickOf(r, BOX_JAB)}`, kind: 'jab' } } else { S.thrown++; out = { text: `${me.name} ${pickOf(r, BOX_MISS.slice(3))}`, kind: 'miss' } }
    } else if (x < 0.74) {
      if (r() < (0.33 + sk) * tired(side)) { hit(3 + r() * 3); out = { text: `${me.name} ${pickOf(r, BOX_COMBO)}`, kind: 'combo' } } else { S.thrown += 2; out = { text: `${me.name} ${pickOf(r, BOX_MISS)}`, kind: 'miss' } }
    } else {
      if (r() < (0.26 + sk) * tired(side)) {
        hit(6 + r() * 6)
        S.power++
        out = { text: `${me.name} ${pickOf(r, BOX_POWER)}`, kind: 'power' }
        if (r() < 0.06 + Math.max(0, 60 - st.hp[other]) / 380) {
          st.rkd[other]++
          S.kd++
          st.hp[other] = Math.max(0, st.hp[other] - 6)
          const down = other === 'home' ? A : B
          if (st.hp[other] < 16 || st.rkd[other] >= 3) {
            st.over = { winner: side, method: st.rkd[other] >= 3 ? 'TKO' : 'KO', round: st.round, sec: st.sec + dt }
            out = { text: `DOWN GOES ${down.name.split(' ')[1].toUpperCase()}! ${me.name} lands it and ${down.name} can’t beat the count. It’s over!`, kind: 'finish' }
          } else out = { text: `DOWN GOES ${down.name.split(' ')[1].toUpperCase()}! ${me.name} drops him. ${down.name} beats the count`, kind: 'kd' }
        }
      } else { S.thrown++; out = { text: `${me.name} ${pickOf(r, BOX_MISS)}`, kind: 'miss' } }
    }
    if (!st.over && st.hp[other] <= 0) { st.over = { winner: side, method: 'TKO', round: st.round, sec: st.sec + dt }; out = { text: `The referee steps in and waves it off: ${me.name} wins by TKO!`, kind: 'finish' } }
  } else {
    // MMA: on the feet, or someone on top.
    if (st.top) {
      st.ctrl[side] += dt
      const x = r()
      if (x < 0.22) { st.top = null; out = { text: `${(other === 'home' ? A : B).name} scrambles back to the feet`, kind: 'scramble' } } else if (x < 0.34) {
        S.sub++
        out = { text: `${me.name} ${pickOf(r, MMA_SUBS)}`, kind: 'sub' }
        if (r() < 0.2 + Math.max(0, 70 - st.hp[other]) / 260 + sk) { st.over = { winner: side, method: 'Submission', round: st.round, sec: st.sec + dt }; out = { text: `${me.name} ${pickOf(r, MMA_SUBS)}… and ${(other === 'home' ? A : B).name} TAPS! It’s over!`, kind: 'finish' } } else out.text += `, but ${(other === 'home' ? A : B).name} escapes`
      } else if (x < 0.4) { st.top = other; out = { text: `${(other === 'home' ? A : B).name} sweeps and ends up on top`, kind: 'sweep' } } else {
        hit(2 + r() * 4)
        out = { text: `${me.name} ${pickOf(r, MMA_GROUND)}`, kind: 'ground' }
        if (st.hp[other] < 12) { st.over = { winner: side, method: 'TKO', round: st.round, sec: st.sec + dt }; out = { text: `${me.name} keeps landing and the referee stops it: TKO!`, kind: 'finish' } }
      }
    } else {
      const x = r()
      if (x < 0.1) out = { text: pickOf(r, MMA_FLAVOR), kind: 'flavor' }
      else if (x < 0.24) {
        if (r() < 0.42 + sk) { st.top = side; S.td++; out = { text: `${me.name} shoots for a takedown and gets it`, kind: 'td' } } else out = { text: `${me.name} shoots for a takedown, stuffed`, kind: 'miss' }
      } else if (r() < (0.48 + sk) * tired(side)) {
        hit(2 + r() * 5)
        out = { text: `${me.name} ${pickOf(r, MMA_STAND)}`, kind: 'strike' }
        if (r() < 0.035 + Math.max(0, 55 - st.hp[other]) / 500) {
          S.kd++
          st.hp[other] = Math.max(0, st.hp[other] - 10)
          if (st.hp[other] < 30 || r() < 0.45) { st.over = { winner: side, method: 'KO', round: st.round, sec: st.sec + dt }; out = { text: `${me.name} CRACKS ${(other === 'home' ? A : B).name} and it’s all over: knockout!`, kind: 'finish' } } else { st.top = side; out = { text: `${me.name} drops ${(other === 'home' ? A : B).name} and pounces!`, kind: 'kd' } }
        }
      } else { S.thrown++; out = { text: `${me.name} ${pickOf(r, MMA_MISS)}`, kind: 'miss' } }
    }
  }
  return { dt, side, ...out }
}

// The judges' cards for the round just ended, and the rest between rounds.
function scoreRound (league, st, r) {
  const mma = FIGHT[league].sport === 'mma'
  const marks = []
  for (let j = 0; j < 3; j++) {
    const lean = (st.rd.home - st.rd.away) + (mma ? (st.ctrl.home - st.ctrl.away) / 30 : 0) + normal(r) * 3
    let h = lean >= 0 ? 10 : 9
    let a = lean >= 0 ? 9 : 10
    h -= st.rkd.home; a -= st.rkd.away
    h = Math.max(7, h); a = Math.max(7, a)
    st.cards[j].push([h, a])
    marks.push([h, a])
  }
  const homeWins = marks.filter(([h, a]) => h > a).length
  const awayWins = marks.filter(([h, a]) => a > h).length
  if (homeWins >= 2) st.won.home++; else if (awayWins >= 2) st.won.away++
  st.rd = { home: 0, away: 0 }
  st.rkd = { home: 0, away: 0 }
  st.ctrl = { home: 0, away: 0 }
  st.top = null
  for (const s of ['home', 'away']) { st.hp[s] = Math.min(100, st.hp[s] + 5); st.stam[s] = Math.min(100, st.stam[s] + 14) }
  return { marks, winner: homeWins >= 2 ? 'home' : awayWins >= 2 ? 'away' : null }
}

function decision (st) {
  const totals = st.cards.map((c) => c.reduce((acc, [h, a]) => [acc[0] + h, acc[1] + a], [0, 0]))
  const votes = totals.map(([h, a]) => (h > a ? 'home' : a > h ? 'away' : 'draw'))
  const n = (x) => votes.filter((v) => v === x).length
  let winner = 'draw'
  let method = 'Draw'
  if (n('home') === 3 || n('away') === 3) { winner = n('home') === 3 ? 'home' : 'away'; method = 'Unanimous decision' } else if (n('home') === 2 || n('away') === 2) {
    winner = n('home') === 2 ? 'home' : 'away'
    method = n('draw') === 1 ? 'Majority decision' : 'Split decision'
  } else if (n('draw') >= 2) method = n('draw') === 3 ? 'Draw' : 'Majority draw'
  else method = 'Split draw'
  return { winner, method, totals }
}

// Play from st to the end (st is changed). emit(play) for each exchange, if given.
function finishFight (league, st, r, A, B, emit = null) {
  const cfg = FIGHT[league]
  while (!st.over && st.round <= cfg.rounds) {
    while (!st.over && st.sec < cfg.roundSecs) {
      const e = fightStep(league, st, r, A, B)
      const dt = Math.min(e.dt, cfg.roundSecs - st.sec)
      st.sec += dt
      if (emit) emit({ ...e, dt })
    }
    if (st.over) break
    const sc = scoreRound(league, st, r)
    if (emit) emit({ kind: 'round-end', marks: sc.marks, winner: sc.winner, dt: 0 })
    st.round++
    st.sec = 0
  }
  if (!st.over) { const d = decision(st); st.over = { winner: d.winner, method: d.method, round: cfg.rounds, sec: cfg.roundSecs, totals: d.totals } }
  return st.over
}

function simFight (league, n) {
  const cfg = FIGHT[league]
  const { home, away } = matchup(league, n)
  const A = team(league, home)
  const B = team(league, away)
  const r = rng(hashStr(`game|v1|${league}|${n}`))
  const start = gameStart(league, n)
  const st = fightStart()
  const plays = []
  let real = start
  const snap = () => cloneFight(st)
  // The judges' cards stay secret until the end, so plays carry no score.
  const push = (p) => plays.push({ at: Math.round(real), q: st.round, clock: Math.max(0, Math.round(cfg.roundSecs - st.sec)), home: 0, away: 0, pts: 0, snap: snap(), ...p })
  push({ team: null, text: `${cfg.sport === 'boxing' ? 'Ten rounds' : 'Three rounds'}: ${A.name} (red) against ${B.name} (blue). Round 1!`, kind: 'period' })
  finishFight(league, st, r, A, B, (e) => {
    if (e.kind === 'round-end') {
      // The round is scored; what comes next is the next round from its bell.
      const next = cloneFight(st)
      next.round++
      next.sec = 0
      push({ team: null, text: `End of round ${st.round}. The judges mark their cards`, kind: 'period-end', clock: 0, snap: next })
      if (st.round < cfg.rounds) {
        real += (cfg.rest * SEC) / cfg.speed
        push({ team: null, text: `Round ${st.round + 1}!`, kind: 'period', q: st.round + 1, clock: cfg.roundSecs, snap: cloneFight(next) })
      }
      return
    }
    real += (e.dt * SEC) / cfg.speed
    push({ team: e.side, text: e.text, kind: e.kind })
  })
  const o = st.over
  const W = o.winner === 'home' ? A : o.winner === 'away' ? B : null
  const end = Math.round(real)
  const how = o.method === 'KO' || o.method === 'TKO' || o.method === 'Submission' ? `by ${o.method} in round ${o.round}` : `by ${o.method.toLowerCase()}${o.totals ? ` (${o.totals.map(([h, a]) => `${Math.max(h, a)}–${Math.min(h, a)}`).join(', ')})` : ''}`
  plays.push({ at: end, q: Math.min(o.round, cfg.rounds), clock: Math.max(0, Math.round(cfg.roundSecs - st.sec)), team: o.winner === 'draw' ? null : o.winner, text: W ? `Final: ${W.name} wins ${how}` : `Final: ${o.method.toLowerCase()}${o.totals ? ` (${o.totals.map(([h, a]) => `${h}–${a}`).join(', ')})` : ''}`, pts: 0, kind: 'final', home: 0, away: 0, snap: snap() })
  return { league, n, id: gameId(league, n), start, end, home, away, plays, periods: cfg.rounds, periodSecs: cfg.roundSecs, final: { home: 0, away: 0 }, rounds: { ...st.won }, winner: o.winner, method: o.method, fight: true }
}

// The chances from here: a few hundred futures under the fight's own rules.
const fightOdds = new Map()
const FUTURES = 160
function fightOutcomes (g, st) {
  if (st.status === 'final') return { home: g.winner === 'home' ? 1 : 0, away: g.winner === 'away' ? 1 : 0, draw: g.winner === 'draw' ? 1 : 0 }
  const k = st.plays.length
  const key = `${g.id}|${k}`
  if (fightOdds.has(key)) return fightOdds.get(key)
  const A = team(g.league, g.home)
  const B = team(g.league, g.away)
  const base = k ? st.last.snap : fightStart()
  const r = rng(hashStr(`mc|${key}`))
  const tally = { home: 0, away: 0, draw: 0 }
  for (let i = 0; i < FUTURES; i++) {
    const f = cloneFight(base)
    tally[finishFight(g.league, f, r, A, B).winner]++
  }
  const out = { home: (tally.home + 0.5) / (FUTURES + 1.5), away: (tally.away + 0.5) / (FUTURES + 1.5), draw: (tally.draw + 0.5) / (FUTURES + 1.5) }
  if (fightOdds.size > 5000) fightOdds.clear()
  fightOdds.set(key, out)
  return out
}

// Poisson, for goals still to come.
function poissonPmf (lam, k) {
  let p = Math.exp(-lam)
  for (let i = 1; i <= k; i++) p *= lam / i
  return p
}

export const gameId = (league, n) => `${league}-v2-${n}`
const gameCache = new Map()
export function game (league, n) {
  if (EVENT_LEAGUES[league]) return eventGame(league, n)
  const key = `${league}-${n}`
  let g = gameCache.get(key)
  if (!g) {
    g = league === 'hoops' ? simHoops(n) : league === 'pitch' ? simSoccer(n) : league === 'ring' || league === 'cage' ? simFight(league, n) : simFoot(n)
    if (gameCache.size > 400) gameCache.clear()
    gameCache.set(key, g)
  }
  return g
}
// Ids carry the schedule's version: games moved when every sport went to
// the same speed (v2), so a bet on an old id is for a game that's gone.
export const gameById = (id) => { const m = /^(hoops|gridiron|pitch|ring|cage|vote|pop)-v2-(\d+)$/.exec(String(id)); return m ? game(m[1], Number(m[2])) : null }

// --- watching ----------------------------------------------------------------------------

// How far through the game we are at t: the plays so far and the state.
export function stateAt (g, t) {
  if (g.event) return { status: t < g.start ? 'pre' : t >= g.end ? 'final' : 'live', home: 0, away: 0, plays: [], q: 0, clock: 0, last: null }
  if (t < g.start) return { status: 'pre', home: 0, away: 0, plays: [], q: 0, clock: g.countUp ? 0 : g.periodSecs, last: null }
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
// Soccer: the chance of each result, from the goals each side should still
// score in the time left (plus added time still expected).
export function soccerOutcomes (g, st) {
  if (st.status === 'final') return st.home > st.away ? { home: 1, draw: 0, away: 0 } : st.home < st.away ? { home: 0, draw: 0, away: 1 } : { home: 0, draw: 1, away: 0 }
  const half = st.status === 'pre' ? 1 : st.q
  const clock = st.status === 'pre' ? 0 : st.clock
  // Regulation left, plus what added time should still bring.
  const regLeft = Math.max(0, half * HALF - clock) + (half === 1 ? HALF : 0)
  const addedLeft = half === 1 ? 2 * 60 + 3 * 60 : (clock < 2 * HALF ? 3 * 60 : Math.max(20, 3 * 60 - (clock - 2 * HALF)))
  const left = (regLeft + (half === 1 ? 2 * 60 : 0) + addedLeft) / (2 * HALF)
  const lh = soccerRate(g, 'home') * left
  const la = soccerRate(g, 'away') * left
  const out = { home: 0, draw: 0, away: 0 }
  for (let a = 0; a <= 10; a++) {
    const pa = poissonPmf(lh, a)
    for (let b = 0; b <= 10; b++) {
      const p = pa * poissonPmf(la, b)
      const d = st.home + a - (st.away + b)
      if (d > 0) out.home += p; else if (d < 0) out.away += p; else out.draw += p
    }
  }
  const total = out.home + out.draw + out.away
  return { home: out.home / total, draw: out.draw / total, away: out.away / total }
}

// Each result's chance: { home, away } and, in soccer, draw.
export function outcomes (g, t, st = stateAt(g, t)) {
  if (g.event) { const p = eventChance(g, t); return { home: p, away: 1 - p } }
  if (g.league === 'pitch') return soccerOutcomes(g, st)
  if (g.fight) return fightOutcomes(g, st)
  const p = winChance(g, t, st)
  return { home: p, away: 1 - p }
}

// How the clock is running at t, for showing it live between plays: the
// game clock moves at `speed` game seconds a real second while running.
export function clockAt (g, st) {
  const k = st.last?.kind
  const running = st.status === 'live' && k !== 'period-end' && k !== 'half-time' && k !== 'final'
  const speed = g.league === 'hoops' ? HOOPS_SPEED : g.league === 'pitch' ? SOCCER_SPEED : g.fight ? FIGHT[g.league].speed : FOOT_SPEED
  return { running, at: st.last?.at || g.start, speed, countUp: Boolean(g.countUp), clock: st.clock }
}

export function winChance (g, t, st = stateAt(g, t)) {
  if (g.event) return eventChance(g, t)
  if (g.fight) { const o = fightOutcomes(g, st); return o.home + o.draw / 2 }
  if (g.league === 'pitch') { const o = soccerOutcomes(g, st); return o.home + o.draw / 2 }
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
  if (EVENT_LEAGUES[league]) return eventSlate(league, t)
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
