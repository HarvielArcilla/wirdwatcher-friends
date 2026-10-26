// The prediction market, as W sees it: a snapshot of one market at a moment,
// taken from the same schedule and odds the Predict tab uses, so a post
// quoting "62%" matches what the market showed at that minute.

import { LEAGUES, game, gameId, gameNumberAt, team, outcomes } from '../sports.js'
import { EVENT_LEAGUES, eventNumberAt } from '../events.js'
import { RACE_LEAGUES, raceNumberAt } from '../races.js'

const HOUR = 3600e3

// The market most likely to be on screen in a league at t: the one running
// now, or else the last to finish.
function numberAt (league, t) {
  if (EVENT_LEAGUES[league]) return eventNumberAt(league, t)
  if (RACE_LEAGUES[league]) return raceNumberAt(league, t)
  return gameNumberAt(league, t)
}

function options (g, league, o) {
  if (g.event) return [{ k: 'home', name: g.sideNames.home, p: o.home }, { k: 'away', name: g.sideNames.away, p: o.away }]
  if (g.race) return g.runners.map((x, i) => ({ k: `r${i}`, name: x.name, p: o[`r${i}`] || 0 }))
  const H = team(league, g.home)
  const A = team(league, g.away)
  const out = [{ k: 'away', name: A.name, p: o.away }, { k: 'home', name: H.name, p: o.home }]
  if (o.draw > 0.004) out.push({ k: 'draw', name: 'Draw', p: o.draw })
  return out
}

function question (g, league) {
  if (g.event) return g.question
  if (g.race) return `Who wins the ${g.title}?`
  const H = team(league, g.home)
  const A = team(league, g.away)
  return H.fighter ? `${A.full} vs. ${H.full}: who wins?` : `${A.full} at ${H.full}: who wins?`
}

// { league, id, q, emoji, lname, status, opts: [{ k, name, pct, was }], closes }
// opts are sorted by chance, highest first (a race keeps its top three).
export function marketAt (league, t, { settled = false } = {}) {
  const L = LEAGUES[league]
  if (!L) return null
  let n = numberAt(league, t)
  if (n < 0) return null
  let g = game(league, n)
  if (g.start > t) { if (n === 0) return null; g = game(league, --n) }
  if (settled && t < g.end && n > 0) { const prev = game(league, n - 1); if (prev.end <= t) { g = prev; n-- } }
  const status = t >= g.end ? 'final' : 'live'
  const back = g.event ? HOUR : 10 * 60e3
  const then = Math.max(g.start, t - back)
  const since = then === g.start ? 'open' : g.event ? 'an hour ago' : '10 minutes ago'
  const now = options(g, league, outcomes(g, Math.min(t, g.end)))
  const before = Object.fromEntries(options(g, league, outcomes(g, then)).map((x) => [x.k, x.p]))
  let opts = now.map((x) => ({ k: x.k, name: x.name, pct: Math.round(x.p * 100), was: Math.round((before[x.k] ?? x.p) * 100) }))
  opts.sort((a, b) => b.pct - a.pct)
  if (g.race) opts = opts.slice(0, 3)
  return { league, id: g.event || g.race ? g.id : gameId(league, n), q: question(g, league), emoji: L.emoji, lname: L.short, status, opts, closes: g.end, since, winner: status === 'final' ? opts[0].k : null }
}
