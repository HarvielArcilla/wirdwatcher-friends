// Races for the prediction market: Formula 1 and horse racing. Like the
// games in src/shared/sports.js, every race is worked out from its number
// alone, so every copy of wirdwatcher sees the same race at the same moment,
// and the clock runs at twice real time like every other sport.
//
// Formula 1: 22 drivers in 11 teams, a grid from qualifying, then a race of
// laps. Each lap's time comes from the car, the driver, the tyre (compound
// and age, with a cliff when it's worn out), the fuel burning off, and a
// little luck; the odd mistake costs a second or three, and now and then a
// car retires. Every driver has to stop at least once and use two different
// compounds: a stop costs the time through the pit lane plus the stop itself
// (sometimes slow). Passing isn't free: a car that catches the one ahead has
// to be clearly faster to get by, or it sits behind.
//
// Horse racing: ten or so horses over a mile or so, each with its own speed,
// stamina and way of running (out in front, sitting just off the pace, or
// coming late). A race lasts about a minute.
//
// Chances, for the market, come from where the race stands: each runner's
// time so far plus what it should still take, with the spread of what can
// still happen, played out many times (the same way on every computer).
//
// THIS IS RACES v1. Changing anything that feeds a race rewrites it: add a
// v2 instead.

const MIN = 60000
export const RACE_SPEED = 2 // game seconds a real second, like every sport
export const RACES_EPOCH = Date.UTC(2026, 9, 1)

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
const pick = (r, list) => list[Math.floor(r() * list.length)]

export const RACE_LEAGUES = {
  f1: { id: 'f1', name: 'Word Formula One', short: 'F1', sport: 'f1', emoji: '🏎️', every: 50 * MIN, offset: 3 * MIN, race: true },
  derby: { id: 'derby', name: 'Word Racing Club', short: 'Racing', sport: 'horses', emoji: '🏇', every: 4 * MIN, offset: 1 * MIN, race: true }
}
export const raceStart = (league, n) => RACES_EPOCH + RACE_LEAGUES[league].offset + n * RACE_LEAGUES[league].every
export const raceNumberAt = (league, t) => Math.floor((t - RACES_EPOCH - RACE_LEAGUES[league].offset) / RACE_LEAGUES[league].every)

// --- Formula 1 -----------------------------------------------------------------------------

// The teams (constructors) and their drivers: [name, color, [driver, driver]].
export const CONSTRUCTORS = [
  ['Meridian', '#c8202e', ['C. Kestrel', 'L. Sable']],
  ['Vortex', '#2a5ab8', ['M. Torrent', 'S. Vesper']],
  ['Quasar', '#e8902a', ['L. Comet', 'O. Thorn']],
  ['Falcon', '#1f9a8a', ['F. Talon', 'A. Lark']],
  ['Cobalt', '#3a6ad8', ['P. Orbit', 'G. Cascade']],
  ['Zenith', '#d8d8e0', ['N. Sterling', 'E. Gust']],
  ['Ember', '#e85a3a', ['V. Blaze', 'K. Spark']],
  ['Glacier', '#5ab8e8', ['R. Drift', 'Y. Fennel']],
  ['Tempest', '#7a3fc4', ['D. Bolt', 'J. Pike']],
  ['Juniper', '#2a8a4a', ['H. Rook', 'T. Breaker']],
  ['Saffron', '#e8c03a', ['B. Rally', 'I. Dagger']]
]
export const DRIVERS = CONSTRUCTORS.flatMap(([team, color, ds], ti) => ds.map((name, k) => ({ id: ti * 2 + k, name, team, color, number: [3, 7, 11, 14, 16, 22, 23, 27, 31, 44, 55, 63, 4, 10, 18, 20, 24, 30, 33, 43, 77, 81][ti * 2 + k] })))
// Fixed over every race: each car's pace (seconds a lap off the fastest)
// and each driver's skill (a little either way).
const CAR_PACE = CONSTRUCTORS.map((c, i) => [0, 0.08, 0.16, 0.26, 0.34, 0.42, 0.5, 0.6, 0.7, 0.8, 0.9][(hashStr(`car|v1|${i}`) % 11 + i * 7) % 11])
const DRIVER_SKILL = DRIVERS.map((d) => ((hashStr(`driver|v1|${d.name}`) % 1000) / 1000 - 0.5) * 0.3)

const CIRCUITS = ['Quill', 'Lantern', 'Harbor', 'Meadow', 'Granite', 'Thicket', 'Marble', 'Orchard', 'Juniper', 'Willow', 'Parchment', 'Ridge', 'Cinder', 'Saffron', 'Sparrow', 'Thistle', 'Copper', 'Pebble', 'Hollow', 'Verbatim']
export const TYRES = {
  S: { name: 'Soft', delta: -0.75, deg: 0.085, cliff: 15 },
  M: { name: 'Medium', delta: 0, deg: 0.05, cliff: 26 },
  H: { name: 'Hard', delta: 0.45, deg: 0.03, cliff: 38 }
}
const CLIFF = 0.22 // seconds a lap more, for every lap past the cliff
const FUEL = 0.032 // seconds a lap faster, for every lap of fuel burned
export const F1_LAPS = 52
const RETIRE = 0.0022 // the chance a car retires on any lap
const LAP_SD = 0.22

// Strategies: [start compound, [stop lap, compound], ...]. Stop laps are
// shifted a few laps either way per driver.
const PLANS = [
  ['M', [26, 'H']],
  ['S', [17, 'H']],
  ['H', [32, 'M']],
  ['S', [15, 'M'], [34, 'S']],
  ['M', [20, 'H'], [40, 'S']],
  ['S', [16, 'H'], [38, 'M']]
]

const lapTime = (base, d, tyre, age, lap) => {
  const T = TYRES[tyre]
  return base + CAR_PACE[Math.floor(d / 2)] + DRIVER_SKILL[d] + T.delta + T.deg * age + Math.max(0, age - T.cliff) * CLIFF - FUEL * lap
}

function simF1 (n) {
  const id = `f1-v1-${n}`
  const r = rng(hashStr(`race|${id}`))
  const circuit = CIRCUITS[n % CIRCUITS.length]
  const base = 84 + r() * 12 // a lap, in seconds, on this circuit
  const pitLoss = 18 + r() * 6 // through the pit lane
  const start = raceStart('f1', n)
  // Qualifying: one quick lap each on softs.
  const quali = DRIVERS.map((d) => ({ d: d.id, t: lapTime(base, d.id, 'S', 0, F1_LAPS) - 0.2 + normal(r) * 0.18 }))
  quali.sort((a, b) => a.t - b.t)
  const grid = quali.map((q) => q.d)
  const cars = grid.map((d, gi) => {
    // Faster cars at the front tend to start on softs; the back on hards.
    const options = gi < 10 ? [0, 1, 3, 5, 0, 1] : [0, 2, 4, 0, 2, 1]
    const plan = PLANS[options[Math.floor(r() * options.length)]]
    const stops = plan.slice(1).map(([lap, tyre]) => ({ lap: Math.max(8, Math.min(F1_LAPS - 6, lap + Math.round(normal(r) * 2.5))), tyre }))
    return { d, grid: gi + 1, cum: gi * 0.22, tyre: plan[0], age: 0, stops, pits: 0, used: [plan[0]], out: false, outLap: null, best: Infinity, last: null, lapsDone: 0 }
  })
  const laps = [] // laps[k][d] = { cum, pos, last, tyre, age, pits, out }
  const events = []
  const snap = () => {
    const order = [...cars].sort((a, b) => (a.out - b.out) || (b.lapsDone - a.lapsDone) || a.cum - b.cum)
    const row = {}
    order.forEach((c, i) => { row[c.d] = { cum: c.cum, pos: i + 1, last: c.last, best: c.best, tyre: c.tyre, age: c.age, pits: c.pits, out: c.out, lapsDone: c.lapsDone, stopsLeft: c.stops.length, pitting: c.pitting || false } })
    laps.push(row)
  }
  snap()
  let fastest = null
  for (let lap = 1; lap <= F1_LAPS; lap++) {
    const order = cars.filter((c) => !c.out).sort((a, b) => a.cum - b.cum)
    let ahead = null
    for (const c of order) {
      c.pitting = false
      // Retirements, now and then.
      if (r() < RETIRE) {
        c.out = true
        c.outLap = lap
        events.push({ lap, kind: 'out', d: c.d, at: c.cum, text: `${DRIVERS[c.d].name} retires${r() < 0.5 ? ' with a mechanical problem' : ' after going off'}.` })
        continue
      }
      let t = lapTime(base, c.d, c.tyre, c.age, lap) + normal(r) * LAP_SD
      if (lap === 1) t += 4 + r() * 1.5
      if (r() < 0.012) { const lost = 0.8 + r() * 2.5; t += lost; events.push({ lap, kind: 'mistake', d: c.d, text: `${DRIVERS[c.d].name} runs wide and loses ${lost.toFixed(1)}s.` }) }
      const stop = c.stops[0]?.lap === lap ? c.stops.shift() : null
      // Out of tyres and no stop planned? A late one.
      let pit = stop
      if (!pit && c.age > TYRES[c.tyre].cliff + 8 && lap < F1_LAPS - 3) pit = { lap, tyre: c.tyre === 'H' ? 'M' : 'H' }
      // The mandatory stop, if a driver somehow hasn't made one.
      if (!pit && lap === F1_LAPS - 2 && c.used.length < 2) pit = { lap, tyre: c.tyre === 'S' ? 'M' : 'S' }
      if (pit) {
        const slow = r() < 0.04
        const stand = slow ? 5 + r() * 4 : 2.1 + Math.abs(normal(r)) * 0.4
        t += pitLoss + stand
        c.tyre = pit.tyre
        c.age = 0
        c.pits++
        if (!c.used.includes(pit.tyre)) c.used.push(pit.tyre)
        c.pitting = true
        events.push({ lap, kind: 'pit', d: c.d, stand: Math.round(stand * 10) / 10, tyre: pit.tyre, text: `${DRIVERS[c.d].name} pits for ${TYRES[pit.tyre].name.toLowerCase()}s: ${stand.toFixed(1)}s${slow ? ', a slow stop' : ''}.` })
      } else c.age++
      let cum = c.cum + t
      // Passing: catching the car ahead isn't enough to get by it.
      if (ahead && !c.pitting && !ahead.pittingNow && cum < ahead.newCum + 0.3) {
        const edge = ahead.lapT - t // how much faster this lap
        const chance = Math.max(0, Math.min(0.85, (edge - 0.35) / 1.1))
        if (cum < ahead.newCum && r() < chance) {
          if (laps[laps.length - 1][ahead.d]?.pos === 1 || ahead.pos1) events.push({ lap, kind: 'lead', d: c.d, text: `${DRIVERS[c.d].name} passes ${DRIVERS[ahead.d].name} for the lead!` })
        } else {
          cum = Math.max(cum, ahead.newCum + 0.25 + r() * 0.35)
        }
        t = cum - c.cum
      }
      c.newCum = cum
      c.lapT = t
      c.pittingNow = c.pitting
      c.last = t
      if (!c.pitting && t < c.best) c.best = t
      if (!c.pitting && lap > 1 && (!fastest || t < fastest.t)) fastest = { d: c.d, t, lap }
      ahead = cum > (ahead?.newCum ?? -1) ? c : ahead
    }
    for (const c of order) if (!c.out) { c.cum = c.newCum; c.lapsDone = lap }
    snap()
  }
  const finish = [...cars].filter((c) => !c.out).sort((a, b) => a.cum - b.cum)
  const winner = finish[0].d
  // The race ends when the winner crosses the line; everyone else finishes
  // the lap they're on.
  const endSecs = finish[0].cum
  const g = {
    league: 'f1',
    n,
    id: `f1-v2-${n}`,
    race: true,
    kind: 'f1',
    circuit,
    title: `${circuit} Grand Prix`,
    laps: F1_LAPS,
    base,
    pitLoss,
    start,
    end: start + (endSecs / RACE_SPEED) * 1000 + 20000,
    grid,
    lapsData: laps,
    events,
    fastest,
    winner: `r${winner}`,
    runners: DRIVERS.map((d) => ({ name: d.name, team: d.team, color: d.color, number: d.number })),
    order: finish.map((c) => c.d).concat(cars.filter((c) => c.out).sort((a, b) => b.outLap - a.outLap).map((c) => c.d))
  }
  g.chances = f1Chances(g)
  return g
}

// Where the race stands at game second s: each car's last finished lap.
export function f1At (g, s) {
  // Each car's laps are at its own times; find how many each has finished.
  const rows = g.runners.map((_, d) => {
    let k = 0
    while (k < g.laps && !g.lapsData[k + 1][d].out && g.lapsData[k + 1][d].cum <= s) k++
    const gone = g.lapsData.findIndex((row) => row[d].out)
    const out = gone > 0 && s >= g.lapsData[gone - 1][d].cum + 40
    const row = g.lapsData[k][d]
    return { d, lap: k, cum: row.cum, last: row.last, best: row.best, tyre: row.tyre, age: row.age, pits: row.pits, due: row.stopsLeft || 0, out, pitting: k > 0 && row.pitting && s - row.cum < 8 }
  })
  const leaderLap = Math.max(...rows.filter((x) => !x.out).map((x) => x.lap))
  // Order: laps done, then time; retired cars at the back.
  rows.sort((a, b) => (a.out - b.out) || (b.lap - a.lap) || a.cum - b.cum)
  const lead = rows[0]
  rows.forEach((x, i) => {
    x.pos = i + 1
    x.gap = i === 0 ? null : x.out ? null : x.lap < lead.lap ? `+${lead.lap - x.lap} lap${lead.lap - x.lap === 1 ? '' : 's'}` : g.lapsData[x.lap][x.d].cum - g.lapsData[x.lap][lead.d].cum
    const prev = rows[i - 1]
    x.interval = i === 0 || x.out || !prev || prev.out || prev.lap !== x.lap ? null : x.cum - prev.cum
  })
  return { leaderLap, rows }
}

// The chance of each driver winning, after each lap the leader finishes:
// every car's time so far, what it should still take (its pace, and the
// stops it still has to make), and how much that can still move, played
// out many times. chances[k] = per-driver chance after lap k.
const SAMPLES = 700
// Measured against thousands of races (test/races.test.js checks it).
const F1_VAR = 1.8
const F1_STOP_VAR = 6
const F1_SHARPEN = 1.3
const DERBY_SD = 0.07
const DERBY_NOISE = 0.14
function f1Chances (g) {
  const r = rng(hashStr(`f1chances|${g.id}`))
  const out = []
  for (let k = 0; k <= g.laps; k++) {
    const row = g.lapsData[k]
    const left = g.laps - k
    const runners = g.runners.map((_, d) => {
      const x = row[d]
      if (x.out) return null
      const pace = lapTime(g.base, d, 'M', 12, (g.laps + k) / 2)
      const stops = Math.max(x.stopsLeft || 0, k < g.laps - 2 && x.pits === 0 ? 1 : 0)
      const mean = x.cum + left * pace + stops * (g.pitLoss + 2.4) + (k === 0 ? 4.7 : 0)
      const sd = Math.sqrt(left * F1_VAR + stops * F1_STOP_VAR + 0.3 + (k === 0 ? 6 : 0))
      const alive = (1 - RETIRE) ** left
      return { d, mean, sd, alive }
    })
    const wins = new Float64Array(g.runners.length)
    for (let s = 0; s < SAMPLES; s++) {
      let best = Infinity
      let who = -1
      for (const x of runners) {
        if (!x || r() > x.alive) continue
        const t = x.mean + normal(r) * x.sd
        if (t < best) { best = t; who = x.d }
      }
      if (who >= 0) wins[who]++
    }
    // Track position counts for more than the times say (passing is hard),
    // so the sampled chances are sharpened a little (fitted to many races).
    const sharp = Array.from(wins, (w) => (w / SAMPLES) ** F1_SHARPEN)
    const total = sharp.reduce((a, b) => a + b, 0) || 1
    out.push(sharp.map((w) => w / total))
  }
  return out
}

// --- horse racing ------------------------------------------------------------------------

const ADJ = ['Swift', 'Quiet', 'Golden', 'Brave', 'Lucky', 'Silent', 'Crimson', 'Gentle', 'Wild', 'Noble', 'Velvet', 'Rapid', 'Bold', 'Clever', 'Merry', 'Restless', 'Silver', 'Stormy', 'Daring', 'Humble', 'Jolly', 'Mighty', 'Proud', 'Rustic', 'Sunny', 'Wistful', 'Zesty', 'Dapper', 'Fearless', 'Grand', 'Hasty', 'Lofty', 'Nimble', 'Plucky', 'Radiant', 'Sly', 'Tender', 'Witty', 'Breezy', 'Cosmic']
const NOUN = ['Comet', 'Lantern', 'Biscuit', 'Sonnet', 'Meadow', 'Pickle', 'Thunder', 'Willow', 'Arrow', 'Ember', 'Harbor', 'Mango', 'Riddle', 'Saffron', 'Tempest', 'Quill', 'Rocket', 'Sparrow', 'Truffle', 'Whisper', 'Banner', 'Clover', 'Dynamo', 'Falcon', 'Gambit', 'Horizon', 'Jester', 'Kettle', 'Legend', 'Marble', 'Nugget', 'Orchid', 'Pepper', 'Ranger', 'Spirit', 'Thistle', 'Voyage', 'Waltz', 'Zephyr', 'Cobbler']
const SILKS = ['#c8202e', '#2a5ab8', '#e8902a', '#1f9a8a', '#7a3fc4', '#e8c03a', '#2a8a4a', '#e8507a', '#3a3a48', '#5ab8e8', '#a8682a', '#d8d8e0']
export const STYLES = { front: 'Front-runner', stalk: 'Stalker', close: 'Closer' }
const COURSES = ['Thicket Park', 'Gable Downs', 'Marigold Meadows', 'Lantern Lane', 'Copper Fields', 'Willow Bend']
const DISTANCES = [1200, 1400, 1600, 1800, 2000]
const DT = 0.5 // simulation step, game seconds

// A horse's speed at a point in the race (frac 0 → 1), before luck.
function horsePace (h, frac) {
  const shape = h.style === 'front' ? 0.5 - frac * 0.75 : h.style === 'close' ? -0.45 + frac * 0.95 : 0.1 + Math.sin(frac * Math.PI) * 0.2
  const tire = frac > h.stamina ? (frac - h.stamina) * 2.2 : 0
  return 16.6 + h.ability * 0.09 + shape * 0.55 - tire
}

function simDerby (n) {
  const id = `derby-v1-${n}`
  const r = rng(hashStr(`race|${id}`))
  const field = 8 + Math.floor(r() * 5)
  const dist = pick(r, DISTANCES)
  const usedA = new Set()
  const usedN = new Set()
  const horses = []
  for (let i = 0; i < field; i++) {
    let a = pick(r, ADJ); while (usedA.has(a)) a = pick(r, ADJ)
    let b = pick(r, NOUN); while (usedN.has(b)) b = pick(r, NOUN)
    usedA.add(a); usedN.add(b)
    const style = pick(r, ['front', 'stalk', 'stalk', 'close'])
    horses.push({ name: `${a} ${b}`, color: SILKS[i % SILKS.length], number: i + 1, style, ability: normal(r), stamina: 0.72 + r() * 0.24 })
  }
  // Run it.
  const pos = horses.map(() => 0)
  const drift = horses.map(() => 0)
  const finish = horses.map(() => null)
  const track = [] // track[k] = distance covered by each horse at k seconds
  track.push(pos.slice())
  let t = 0
  while (finish.some((f) => f === null) && t < 400) {
    t += DT
    horses.forEach((h, i) => {
      if (finish[i] !== null) { pos[i] += 14 * DT; return }
      drift[i] = drift[i] * 0.94 + normal(r) * DERBY_NOISE
      const v = horsePace(h, pos[i] / dist) + drift[i]
      const before = pos[i]
      pos[i] += v * DT
      if (pos[i] >= dist) finish[i] = t - DT + ((dist - before) / (pos[i] - before)) * DT
    })
    if (Math.abs(t - Math.round(t)) < 1e-9) track.push(pos.map((p) => Math.min(p, dist + 40)))
  }
  const order = horses.map((_, i) => i).sort((a, b) => finish[a] - finish[b])
  const start = raceStart('derby', n)
  const g = {
    league: 'derby',
    n,
    id: `derby-v2-${n}`,
    race: true,
    kind: 'derby',
    title: `Race ${n % 9 + 1} at ${COURSES[n % COURSES.length]}`,
    course: COURSES[n % COURSES.length],
    dist,
    start,
    end: start + ((finish[order[order.length - 1]] + 3) / RACE_SPEED) * 1000,
    track,
    finish,
    order,
    winner: `r${order[0]}`,
    runners: horses.map((h) => ({ name: h.name, color: h.color, number: h.number, style: h.style, styleName: STYLES[h.style] })),
    horses
  }
  g.chances = derbyChances(g)
  return g
}

// Where everyone is at game second s (between whole seconds, in between).
export function derbyAt (g, s) {
  const k = Math.max(0, Math.min(g.track.length - 1, Math.floor(s)))
  const k2 = Math.min(g.track.length - 1, k + 1)
  const f = Math.max(0, Math.min(1, s - k))
  const dist = g.track[k].map((p, i) => p + (g.track[k2][i] - p) * f)
  const done = g.finish.map((x) => x !== null && x <= s)
  const ranks = dist.map((_, i) => i).sort((a, b) => (done[b] - done[a]) || (done[a] && done[b] ? g.finish[a] - g.finish[b] : dist[b] - dist[a]))
  return { dist, done, ranks }
}

// The chance of each horse winning, from each whole second of the race.
function derbyChances (g) {
  const r = rng(hashStr(`derbychances|${g.id}`))
  const out = []
  for (let k = 0; k < g.track.length; k++) {
    const left = g.track[k].map((p) => Math.max(0, g.dist - p))
    if (left.some((x) => x <= 0)) { out.push(g.runners.map((_, i) => (`r${i}` === g.winner ? 1 : 0))); break }
    const est = g.horses.map((h, i) => {
      // Average speed over what's left of the race.
      let v = 0
      const steps = 8
      for (let j = 0; j < steps; j++) v += horsePace(h, (g.track[k][i] + left[i] * (j + 0.5) / steps) / g.dist)
      v /= steps
      const time = left[i] / v
      return { time, sd: DERBY_SD * Math.sqrt(time) + 0.02 }
    })
    const wins = new Float64Array(g.runners.length)
    for (let s = 0; s < SAMPLES; s++) {
      let best = Infinity; let who = 0
      est.forEach((e, i) => { const t = e.time + normal(r) * e.sd; if (t < best) { best = t; who = i } })
      wins[who]++
    }
    out.push(Array.from(wins, (w) => w / SAMPLES))
  }
  return out
}

// --- the market's view ---------------------------------------------------------------------

const cache = new Map()
export function race (league, n) {
  const key = `${league}-${n}`
  let g = cache.get(key)
  if (!g) {
    g = league === 'f1' ? simF1(n) : simDerby(n)
    if (cache.size > 80) cache.clear()
    cache.set(key, g)
  }
  return g
}

// Game seconds since the start (0 before it).
export const raceSecs = (g, t) => Math.max(0, ((t - g.start) / 1000) * RACE_SPEED)

export function raceState (g, t) {
  return { status: t < g.start ? 'pre' : t >= g.end ? 'final' : 'live', home: 0, away: 0, plays: [], q: 0, clock: 0, last: null }
}

// Each runner's chance at t: { r0, r1, ... }.
export function raceOutcomes (g, t) {
  const out = {}
  const s = raceSecs(g, t)
  let row
  if (t >= g.end) row = g.runners.map((_, i) => (`r${i}` === g.winner ? 1 : 0))
  else if (g.kind === 'f1') {
    // After the last lap the leader finished.
    const st = t < g.start ? { leaderLap: 0 } : f1At(g, s)
    row = g.chances[Math.min(g.laps, st.leaderLap)]
  } else row = g.chances[Math.min(g.chances.length - 1, Math.floor(s))]
  row.forEach((p, i) => { out[`r${i}`] = t >= g.end ? p : Math.min(0.99, Math.max(0.005, p)) })
  return out
}

export function raceSlate (league, t, { next = 4, past = 6 } = {}) {
  const n = raceNumberAt(league, t)
  const out = { live: [], upcoming: [], recent: [] }
  for (let k = n - 2; k <= n + next; k++) {
    if (k < 0) continue
    if (raceStart(league, k) > t) { out.upcoming.push(k); continue }
    if (t < race(league, k).end) out.live.push(k)
  }
  for (let k = n; k >= 0 && out.recent.length < past; k--) {
    if (raceStart(league, k) > t) continue
    if (t >= race(league, k).end) out.recent.push(k)
  }
  out.upcoming = out.upcoming.slice(0, next)
  return out
}
