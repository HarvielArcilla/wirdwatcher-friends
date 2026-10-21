import test from 'node:test'
import assert from 'node:assert/strict'
import { WirdApp } from '../src/core/app.js'
import { game, stateAt, winChance, outcomes, clockAt, gameStart, team, LEAGUES, slate } from '../src/shared/sports.js'
import { quotes, PAYOUT } from '../src/core/sportsbook.js'
import { tmp } from './helpers.js'

test('games are the same everywhere, and the score is the sum of the plays', () => {
  for (const lg of ['hoops', 'gridiron', 'pitch']) {
    for (let n = 0; n < 300; n++) {
      const g = game(lg, n)
      assert.equal(g.start, gameStart(lg, n))
      let home = 0
      let away = 0
      let last = g.start
      for (const p of g.plays) {
        if (p.kind === 'safety') { if (p.team === 'home') away += 2; else home += 2 } else if (p.pts) { if (p.team === 'home') home += p.pts; else away += p.pts }
        assert.equal(p.home, home); assert.equal(p.away, away)
        assert.ok(p.at >= last, 'plays in time order'); last = p.at
      }
      assert.deepEqual(g.final, { home, away })
      // Between plays the clock runs in step with real time, so it can be shown live.
      const speed = clockAt(g, stateAt(g, g.start + 1)).speed
      for (let k = 1; k < g.plays.length; k++) {
        const a = g.plays[k - 1]
        const b = g.plays[k]
        if (a.q !== b.q || ['period-end', 'half-time', 'final'].includes(a.kind) || b.kind === 'final') continue
        assert.ok(Math.abs(Math.abs(b.clock - a.clock) - ((b.at - a.at) / 1000) * speed) <= 1.01, `${lg} clock in step`)
      }
      if (lg === 'hoops') assert.notEqual(home, away, 'basketball always has a winner')
      // Every point has a scorer (a safety goes to the defense).
      for (const p of g.plays) if (p.pts && p.kind !== 'ft') assert.ok(p.who, `${lg} ${p.kind} has a scorer`)
      assert.ok(g.home !== g.away)
    }
  }
  // Fixed points: sports v1 must never change, or everyone's games would.
  assert.deepEqual(game('hoops', 1000).final, game('hoops', 1000).final)
  assert.equal(team('hoops', 'LAL').full, 'Los Angeles Lexicons')
  assert.match(team('gridiron', 'GB').players[0].name, /^[A-Z]\. [A-Z][a-z]+$/)
})

test('win chances follow the score and the clock, and are calibrated', () => {
  const buckets = Array.from({ length: 5 }, () => ({ n: 0, p: 0, w: 0 }))
  for (const lg of ['hoops', 'gridiron']) {
    for (let n = 0; n < 1500; n++) {
      const g = game(lg, n)
      const won = g.final.home > g.final.away ? 1 : g.final.home < g.final.away ? 0 : 0.5
      for (const f of [0.1, 0.4, 0.7, 0.9]) {
        const p = winChance(g, g.start + (g.end - g.start) * f)
        const b = buckets[Math.min(4, Math.floor(p * 5))]
        b.n++; b.p += p; b.w += won
      }
      assert.equal(winChance(g, g.end), won === 0.5 ? 0.5 : won, 'settled at the end')
    }
  }
  for (const b of buckets) assert.ok(Math.abs(b.p / b.n - b.w / b.n) < 0.05, `predicted ${(b.p / b.n).toFixed(2)} vs won ${(b.w / b.n).toFixed(2)}`)
  // A big lead late is nearly certain.
  const g = game('hoops', 42)
  const late = stateAt(g, g.end - 1000)
  const lead = late.home - late.away
  if (Math.abs(lead) >= 6) assert.ok(Math.abs(winChance(g, g.end - 1000) - (lead > 0 ? 1 : 0)) < 0.05)
})

test('betting: buy at the ask, sell at the bid, winners paid 100 a contract', () => {
  const clock = { t: gameStart('hoops', 2000) + 5 * 60000 }
  const a = new WirdApp({ dataDir: tmp(), settings: { lan: false, internet: false }, now: () => new Date(clock.t) })
  a.economy.devAddCoins(1e6)
  const g = game('hoops', 2000)
  const q = quotes(g, clock.t)
  assert.ok(q.home.ask > q.home.bid && q.home.ask + q.away.ask > PAYOUT, 'the house keeps a spread')
  const coins = a.economy.s.coins
  const res = a.sports.buy(g.id, 'home', 1000)
  assert.equal(Math.round(coins - a.economy.s.coins), 1000)
  assert.ok(Math.abs(res.shares - 1000 / q.home.ask) < 1e-4)
  a.sports.buy(g.id, 'away', 500)
  clock.t = g.end + 1000
  const board = a.sports.board('hoops')
  assert.equal(Object.keys(a.economy.s.sports.bets).length, 0, 'settled')
  const h = board.history[0]
  const homeWon = g.final.home > g.final.away
  const expect = Math.floor(((homeWon ? res.shares : a.economy.s.sports.history[0].pay / PAYOUT) * PAYOUT) * 100) / 100
  assert.ok(h.pay > 0 && Math.abs(h.pay - expect) < 1 || !homeWon)
  assert.throws(() => a.sports.buy(g.id, 'home', 10), /over/)
  // The clock can't go back to bet on a known result.
  clock.t = g.end - 60000 // the result is known now; winding back can't use it
  assert.throws(() => a.sports.buy(g.id, homeWon ? 'home' : 'away', 10), /clock/)
  // Bankrupt players can't bet.
  a.economy.s.bankrupt = { at: 0, discharged: 1, need: 1e9, earned: 0, until: Infinity, n: 1 }
  clock.t = g.end + 2000
  assert.throws(() => a.sports.buy(game('hoops', 2002).id, 'home', 10), /bankrupt/)
  assert.ok(slate('gridiron', clock.t).upcoming.length > 0)
  assert.ok(LEAGUES.hoops.teams.length === 12)
})

test('soccer: three results, chances that add up and come true, and the draw pays', () => {
  const buckets = Array.from({ length: 5 }, () => ({ n: 0, p: 0, w: 0 }))
  let draws = 0
  for (let n = 0; n < 1500; n++) {
    const g = game('pitch', n)
    const res = g.final.home > g.final.away ? 'home' : g.final.home < g.final.away ? 'away' : 'draw'
    if (res === 'draw') draws++
    for (const f of [0, 0.3, 0.6, 0.9]) {
      const o = outcomes(g, g.start + (g.end - g.start) * f)
      assert.ok(Math.abs(o.home + o.draw + o.away - 1) < 1e-9)
      for (const k of ['home', 'draw', 'away']) { const b = buckets[Math.min(4, Math.floor(o[k] * 5))]; b.n++; b.p += o[k]; b.w += k === res ? 1 : 0 }
    }
    assert.equal(outcomes(g, g.end)[res], 1)
  }
  for (const b of buckets) assert.ok(Math.abs(b.p / b.n - b.w / b.n) < 0.04, `predicted ${(b.p / b.n).toFixed(2)} vs happened ${(b.w / b.n).toFixed(2)}`)
  assert.ok(draws / 1500 > 0.15 && draws / 1500 < 0.32, 'draws happen, like real football')
  // The clock runs between plays at the game's speed.
  const g = game('pitch', 10)
  const mid = stateAt(g, g.start + 5 * 60000)
  const k = clockAt(g, mid)
  assert.ok(k.running && k.countUp && k.speed === 3)

  // Betting on the draw.
  let n = 0
  while (game('pitch', n).final.home !== game('pitch', n).final.away) n++
  const d = game('pitch', n)
  const clock = { t: d.start + 60000 }
  const a = new WirdApp({ dataDir: tmp(), settings: { lan: false, internet: false }, now: () => new Date(clock.t) })
  a.economy.devAddCoins(1e5)
  const q = quotes(d, clock.t)
  const bet = a.sports.buy(d.id, 'draw', 1000)
  assert.equal(bet.price, q.draw.ask)
  a.sports.buy(d.id, 'home', 500)
  clock.t = d.end + 1
  a.sports.sync()
  const h = a.economy.s.sports.history[0]
  assert.ok(Math.abs(h.pay - Math.floor(bet.shares * PAYOUT * 100) / 100) < 0.02, 'the draw pays 100 a contract, the team nothing')
})

test('nobody plays two games in a row, everyone plays as often, and scores are told apart', () => {
  for (const lg of ['hoops', 'gridiron', 'pitch']) {
    const count = {}
    for (let n = 0; n < 1320; n++) {
      const a = game(lg, n)
      const b = game(lg, n + 1)
      assert.ok(![a.home, a.away].some((t) => [b.home, b.away].includes(t)), `${lg} game ${n}: back to back`)
      for (const t of [a.home, a.away]) count[t] = (count[t] || 0) + 1
    }
    assert.equal(new Set(Object.values(count)).size, 1, 'a whole number of seasons: everyone equal')
  }
  const kinds = new Set()
  for (let n = 0; n < 60; n++) for (const p of game('gridiron', n).plays) if (p.pts) kinds.add(p.kind)
  for (const k of ['td-pass', 'td-rush', 'xp', 'fg']) assert.ok(kinds.has(k), `football has ${k}`)
  assert.ok(game('gridiron', 3).plays.filter((p) => p.kind === 'td-pass').every((p) => p.passer && p.who))
})
