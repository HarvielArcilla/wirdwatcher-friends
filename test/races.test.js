import test from 'node:test'
import assert from 'node:assert/strict'
import { WirdApp } from '../src/core/app.js'
import { game, outcomes, gameStart, slate } from '../src/shared/sports.js'
import { race, f1At, derbyAt, raceSecs, F1_LAPS, RACE_SPEED, RACE_LEAGUES } from '../src/shared/races.js'
import { PAYOUT, sidesOf } from '../src/core/sportsbook.js'
import { tmp } from './helpers.js'

const calibrated = (league, count, fracs, tol) => {
  const buckets = Array.from({ length: 5 }, () => ({ n: 0, p: 0, w: 0 }))
  for (let n = 0; n < count; n++) {
    const g = race(league, 3000 + n)
    for (const f of fracs) {
      const o = outcomes(g, g.start + (g.end - g.start) * f)
      for (const side of sidesOf(g)) { const b = buckets[Math.min(4, Math.floor(o[side] * 5))]; b.n++; b.p += o[side]; b.w += side === g.winner ? 1 : 0 }
    }
  }
  for (const b of buckets) if (b.n > 40) assert.ok(Math.abs(b.p / b.n - b.w / b.n) < tol, `${league} predicted ${(b.p / b.n).toFixed(2)} vs happened ${(b.w / b.n).toFixed(2)}`)
}

test('Formula 1: the same race everywhere, a grid, pit stops on two compounds, and laps that add up', () => {
  const g = race('f1', 1234)
  assert.equal(g, game('f1', 1234))
  assert.equal(g.grid.length, 22)
  assert.equal(g.runners.length, 22)
  for (const r of g.runners) assert.match(r.name, /^[A-Z]\. [A-Z][a-z]+$/, 'drivers are an initial and a word')
  assert.ok(new Set(g.runners.map((r) => r.team)).size === 11)
  const last = g.lapsData[F1_LAPS]
  for (const [d, x] of Object.entries(last)) {
    if (x.out) continue
    assert.ok(x.pits >= 1, `${g.runners[d].name} made the mandatory stop`)
    assert.equal(x.lapsDone, F1_LAPS)
  }
  // Positions at any moment are 1..22 with no gaps, and the leader leads.
  const s = (g.end - g.start) / 1000 * RACE_SPEED * 0.5
  const at = f1At(g, s)
  assert.deepEqual(at.rows.map((x) => x.pos), Array.from({ length: 22 }, (_, i) => i + 1))
  assert.ok(at.leaderLap > 10 && at.leaderLap < 45)
  // The race takes about 40 minutes, and the next starts soon after.
  const mins = (g.end - g.start) / 60000
  assert.ok(mins > 30 && mins < RACE_LEAGUES.f1.every / 60000, `${mins.toFixed(1)} minutes`)
  assert.ok(gameStart('f1', 1235) - g.end < 20 * 60000)
})

test('horse racing: adjective-and-noun names, a short race, and the first past the post wins', () => {
  const g = race('derby', 4321)
  for (const r of g.runners) assert.match(r.name, /^[A-Z][a-z]+ [A-Z][a-z]+$/)
  assert.equal(new Set(g.runners.map((r) => r.name)).size, g.runners.length)
  const secs = (g.end - g.start) / 1000
  assert.ok(secs > 25 && secs < 90, `${secs.toFixed(0)} seconds`)
  const end = derbyAt(g, raceSecs(g, g.end))
  assert.equal(`r${end.ranks[0]}`, g.winner)
  assert.ok(gameStart('derby', 4322) - g.end < 4 * 60000)
})

test('race chances add up, come true, and the winner pays', () => {
  for (const league of ['f1', 'derby']) {
    const g = race(league, 77)
    const o = outcomes(g, g.start + (g.end - g.start) / 3)
    const sum = Object.values(o).reduce((a, b) => a + b, 0)
    assert.ok(Math.abs(sum - 1) < 0.08, `${league} chances add to ${sum}`)
    assert.equal(outcomes(g, g.end)[g.winner], 1)
  }
  calibrated('derby', 250, [0, 0.4, 0.75], 0.08)
  calibrated('f1', 80, [0, 0.5, 0.85], 0.12)
  const g = race('derby', 900)
  const clock = { t: g.start - 1000 }
  const a = new WirdApp({ dataDir: tmp(), settings: { lan: false, internet: false }, now: () => new Date(clock.t) })
  a.economy.devAddCoins(1e5)
  const bet = a.sports.buy(g.id, g.winner, 1000)
  const loser = sidesOf(g).find((s) => s !== g.winner)
  a.sports.buy(g.id, loser, 500)
  assert.ok(slate('derby', clock.t).upcoming.includes(900))
  clock.t = g.end + 1
  a.sports.sync()
  const h = a.economy.s.sports.history[0]
  assert.ok(Math.abs(h.pay - Math.floor(bet.shares * PAYOUT * 100) / 100) < 0.02)
  assert.equal(h.result, g.runners[Number(g.winner.slice(1))].name)
  const card = a.sports.view(g.id)
  assert.ok(card.race && card.winner === g.winner && card.result.length === g.runners.length)
})
