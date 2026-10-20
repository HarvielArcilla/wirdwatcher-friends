import test from 'node:test'
import assert from 'node:assert/strict'
import { WirdApp } from '../src/core/app.js'
import { profile, priceAt } from '../src/shared/market.js'
import {
  blackScholes, impliedVol, normCdf, RATE, YEAR_MS, expiries, futureExpiries, strikes, optionQuote, futureQuote,
  mark, firstBreach, ETFS, etfById, etfNav, realizedVol
} from '../src/shared/derivatives.js'
import { tmp } from './helpers.js'

const DAY = 864e5

test('Black–Scholes: the textbook numbers, parity, and implied vol round trips', () => {
  // Hull's example: S=42, K=40, r=10%, σ=20%, T=0.5 → call 4.76, put 0.81.
  const c = blackScholes({ S: 42, K: 40, T: 0.5, sigma: 0.2, r: 0.1, type: 'call' })
  const p = blackScholes({ S: 42, K: 40, T: 0.5, sigma: 0.2, r: 0.1, type: 'put' })
  assert.equal(c.price.toFixed(2), '4.76')
  assert.equal(p.price.toFixed(2), '0.81')
  assert.ok(Math.abs(c.price - p.price - (42 - 40 * Math.exp(-0.05))) < 1e-9, 'put–call parity')
  assert.ok(Math.abs(c.delta - p.delta - 1) < 1e-9)
  assert.ok(Math.abs(normCdf(1.96) - 0.975) < 1e-4)
  for (const sigma of [0.1, 0.6, 2.5]) {
    const price = blackScholes({ S: 100, K: 120, T: 0.25, sigma, type: 'put' }).price
    assert.ok(Math.abs(impliedVol({ price, S: 100, K: 120, T: 0.25, type: 'put' }) - sigma) < 1e-6)
  }
  // Theta is decay: an option loses value as time passes, other things equal.
  const now = blackScholes({ S: 100, K: 100, T: 30 / 365, sigma: 0.5, type: 'call' })
  const later = blackScholes({ S: 100, K: 100, T: 29 / 365, sigma: 0.5, type: 'call' })
  assert.ok(Math.abs((later.price - now.price) - now.theta) < 0.01)
})

test('listings: closing-bell expiries, monthlies on third Fridays, strikes around the forward', () => {
  const t = Date.UTC(2026, 9, 20, 12)
  const ex = expiries(t)
  assert.ok(ex.every((e) => new Date(e.at).getUTCHours() === 20))
  assert.ok(ex.some((e) => e.at === Date.UTC(2026, 9, 20, 20)), 'today’s 0DTE')
  const monthly = futureExpiries(t).map((e) => new Date(e.at).toISOString().slice(0, 10))
  assert.deepEqual(monthly, ['2026-11-20', '2026-12-18', '2027-01-15'])
  const ks = strikes(100, 0.1, 0.5)
  assert.equal(ks.length, 11)
  assert.ok(ks[0] < 100 && ks[10] > 100)
})

test('quotes: a spread around fair value, futures in contango, convergence at expiry', () => {
  const p = profile('gravy', { sector: 'food', senses: 3, synonyms: 2 })
  const t = Date.UTC(2026, 9, 20, 12)
  const at = futureExpiries(t)[0].at
  const S = priceAt(p, t)
  const q = optionQuote(p, t, at, Math.round(S), 'call')
  assert.ok(q.bid < q.theo && q.theo < q.ask)
  assert.ok(q.iv > 0.05 && q.iv < 6)
  const f = futureQuote(p, t, at)
  assert.ok(Math.abs(f.F - S * Math.exp(RATE * (at - t) / YEAR_MS)) < 1e-9)
  assert.ok(f.F > S)
  const fut = { kind: 'future', side: 1, qty: 1, entry: f.F, margin: 100, im: 0.2, expiry: at }
  assert.equal(mark(fut, at + DAY, p).F, priceAt(p, at), 'a future is worth spot at expiry')
  // Realized vol: wild words swing harder than blue chips.
  const wild = profile('zymurgy', { sector: 'misc', senses: 1, synonyms: 0 })
  const blue = profile('cat', { sector: 'animals', senses: 8, synonyms: 6 })
  assert.ok(realizedVol(wild, t, DAY) > 2 * realizedVol(blue, t, DAY))
})

test('leveraged and inverse ETFs compound daily and decay in chop', () => {
  const t = Date.UTC(2026, 9, 20, 12)
  for (const e of ETFS) assert.ok(etfNav(e, t) > 0)
  // A 3× fund over one day moves 3× its index (plus carry).
  const day = Date.UTC(2026, 6, 1)
  const base = etfById('WORD')
  const lev = etfById('WRD3')
  const idx = etfNav(base, day + DAY / 2) / etfNav(base, day) - 1
  const l3 = etfNav(lev, day + DAY / 2) / etfNav(lev, day) - 1
  assert.ok(Math.abs(l3 - 3 * idx) < 0.002, `${l3} vs 3×${idx}`)
  // Over months they are not 3× the index: path matters.
  const long = etfNav(lev, t) / 100
  const ix = etfNav(base, t) / 100
  assert.ok(Math.abs(long - ix ** 3) > 0.01)
})

function app (t0 = Date.UTC(2026, 9, 20, 12)) {
  const clock = { t: t0 }
  const a = new WirdApp({ dataDir: tmp(), settings: { lan: false, internet: false }, now: () => new Date(clock.t) })
  a.clock = clock
  a.rate('gravy', 4)
  a.rate('zymurgy', 2)
  a.economy.devAddCoins(1e6)
  return a
}

test('a leveraged long: interest accrues, and you can’t lose more than you put up', () => {
  const a = app()
  const before = a.economy.s.coins
  const v = a.derivs.openMargin({ word: 'gravy', side: 'long', lev: 2, coins: 1000 })
  assert.equal(Math.round(before - a.economy.s.coins), 1000)
  assert.ok(v.value < 1000 && v.value > 975, 'closing straight away loses the spreads')
  assert.ok(v.liqPrice > 0 && v.liqPrice < v.S)
  a.clock.t += 30 * DAY
  const book = a.derivs.book()
  const pos = book.open[0] || null
  if (pos) assert.ok(pos.interest > 0)
  const { pay } = pos ? a.derivs.close(pos.id) : { pay: book.log[0].pay }
  assert.ok(pay >= 0)
  assert.equal(a.derivs.d.open.length, 0)
})

test('liquidation happens at the exact minute the line was crossed, even after a week away', () => {
  const a = app()
  // Short the wildest word at max leverage and wait: it trends up.
  const max = a.derivs.chain('zymurgy').maxMarginLev
  a.derivs.openMargin({ word: 'zymurgy', side: 'short', lev: max, coins: 5000 })
  const pos = { ...a.derivs.d.open[0] }
  const opened = a.clock.t
  a.clock.t += 60 * DAY
  a.derivs.sync()
  const done = a.derivs.d.log.find((x) => x.id === pos.id)
  assert.equal(done.how, 'liquidated')
  const p = a.market.profile('zymurgy')
  const exact = firstBreach(pos, pos.checked, a.clock.t, p)
  assert.equal(done.at, exact)
  const mk = mark(pos, done.at - 60000, p)
  assert.ok(mk.equity > mk.maint || done.at - 60000 <= opened, 'still fine the minute before')
  assert.ok(done.pay >= 0 && done.pay < 5000)
  assert.equal(a.derivs.d.liquidations, 1)
})

test('options pay their intrinsic value at expiry, written ones keep the rest of the margin', () => {
  const a = app()
  const ch = a.derivs.chain('gravy')
  const ex = ch.expiries[2]
  const row = ex.rows[5]
  const coins0 = a.economy.s.coins
  a.derivs.openOption({ word: 'gravy', expiry: ex.at, K: row.K, type: 'call', side: 'long', qty: 10 })
  a.derivs.openOption({ word: 'gravy', expiry: ex.at, K: row.K, type: 'put', side: 'short', qty: 10 })
  const paid = coins0 - a.economy.s.coins
  a.clock.t = ex.at + 3600e3
  a.derivs.sync()
  const S = priceAt(a.market.profile('gravy'), ex.at)
  const logs = a.derivs.d.log
  const call = logs.find((x) => x.label.endsWith('call'))
  assert.equal(call.how, 'expired')
  assert.ok(Math.abs(call.pay - Math.max(0, S - row.K) * 10) < 0.02)
  const put = logs.find((x) => x.label.endsWith('put'))
  if (put.how === 'expired') assert.ok(Math.abs(put.pay - (put.paid + row.put.bid * 10 - Math.max(0, row.K - S) * 10)) < 0.05)
  // Nothing created from nowhere: what came back is what the trades were worth.
  const back = a.economy.s.coins - (coins0 - paid)
  assert.ok(Math.abs(back - call.pay - put.pay) < 1e-6)
})

test('a position can only pay once, and publishing closes everything', () => {
  const a = app()
  const ex = a.derivs.chain('gravy').futures[0]
  const v = a.derivs.openFuture({ word: 'gravy', expiry: ex.at, side: 'long', lev: 2, coins: 1000 })
  a.derivs.close(v.id)
  const coins = a.economy.s.coins
  assert.throws(() => a.derivs.close(v.id), /closed/)
  assert.equal(a.economy.s.coins, coins)
  a.derivs.buyEtf('WRD3', 500)
  a.derivs.openMargin({ word: 'gravy', side: 'long', lev: 3, coins: 1000 })
  a.economy.devAddCoins(1e10)
  a.economy.prestige()
  assert.equal(a.derivs.d.open.length, 0)
  assert.deepEqual(a.economy.s.market.etfs, {})
  // Rated words only, listed expiries only, leverage within limits.
  assert.throws(() => a.derivs.openMargin({ word: 'cat', side: 'long', lev: 2, coins: 10 }), /Rate a word/)
  assert.throws(() => a.derivs.openFuture({ word: 'gravy', expiry: 12345, side: 'long', lev: 2, coins: 10 }), /listed/)
  assert.throws(() => a.derivs.openMargin({ word: 'gravy', side: 'long', lev: 99, coins: 10 }), /Leverage/)
})
