import test from 'node:test'
import assert from 'node:assert/strict'
import { WirdApp } from '../src/core/app.js'
import { profile, priceAt, buyPrice, sellPrice, series, MARKET_OPEN, hash32 } from '../src/shared/market.js'
import { tmp } from './helpers.js'

const facts = { sector: 'food', senses: 3, synonyms: 2 }

test('prices are the same everywhere: a pure function of the word and the minute', () => {
  const t = Date.UTC(2026, 9, 20, 12, 34, 56)
  const a = priceAt(profile('gravy', facts), t)
  const b = priceAt(profile('gravy', { ...facts }), t + 3000) // same minute
  assert.equal(a, b)
  assert.notEqual(a, priceAt(profile('gravy', facts), t + 60000 * 60 * 24), 'it moves over a day')
  // Fixed points: market v1 must never change, or everyone's history would.
  assert.equal(hash32('wirdwatcher'), 1757392191)
  assert.equal(priceAt(profile('gravy', facts), Date.UTC(2026, 6, 1)), 473.23)
  assert.equal(priceAt(profile('serendipity', { sector: 'nature', senses: 1, synonyms: 0 }), Date.UTC(2026, 9, 20, 16)), 31.07)
})

test('never zero, generally up, and obscure words swing harder', () => {
  const year = [Date.UTC(2026, 0, 1), Date.UTC(2027, 0, 1)]
  let up = 0
  let n = 0
  for (let i = 0; i < 300; i++) {
    const p = profile(`word${i}`, { sector: 'misc', senses: 1 + (i % 6), synonyms: i % 4 })
    const s = series(p, year[0], year[1], 120).map((x) => x[1])
    assert.ok(Math.min(...s) > 0)
    if (s[s.length - 1] > s[0]) up++
    n++
  }
  assert.ok(up / n > 0.8, `most words rise over a year (${up}/${n})`)
  const obscure = profile('zymurgy', { sector: 'misc', senses: 1, synonyms: 0 })
  const common = profile('cat', { sector: 'animals', senses: 8, synonyms: 6 })
  assert.ok(obscure.vol > common.vol * 2)
  assert.ok(priceAt(obscure, MARKET_OPEN - 864e5) > 0, 'before the market opened: the listing price')
  assert.ok(buyPrice(100) > 100 && sellPrice(100) < 100)
})

test('trading: only words you rated, coins for shares, a spread, and returns', () => {
  let t = Date.UTC(2026, 9, 20, 12)
  const app = new WirdApp({ dataDir: tmp(), settings: { lan: false, internet: false }, now: () => new Date(t) })
  app.economy.devAddCoins(10000)
  assert.throws(() => app.market.buy('gravy', 100), /Rate a word/)
  app.rate('gravy', 4)
  const before = app.economy.s.coins
  app.market.buy('gravy', 1000)
  assert.equal(Math.round(before - app.economy.s.coins), 1000)
  const p = app.market.portfolio()
  assert.equal(p.rows.length, 1)
  assert.ok(p.value < 1000 && p.value > 980, 'selling straight back loses the spread')
  // A week later, sell it all.
  t += 7 * 864e5
  app.market.sell('gravy', 'all')
  const st = app.market.stats()
  assert.equal(st.trades, 2)
  assert.equal(Object.keys(app.economy.s.market.holdings).length, 0)
  assert.ok(Math.abs(st.gain - (st.proceeds - st.spent)) < 1e-6)
  assert.ok(st.best)
  // The clock can't go back to buy cheap.
  t -= 864e5
  assert.throws(() => app.market.buy('gravy', 10), /clock/)
})

test('publishing sells your shares first, so nothing slips through', () => {
  const app = new WirdApp({ dataDir: tmp(), settings: { lan: false, internet: false } })
  app.rate('gravy', 4)
  app.economy.devAddCoins(8e9)
  app.market.buy('gravy', 5e9)
  app.economy.prestige()
  assert.deepEqual(app.economy.s.market.holdings, {})
  assert.ok(app.economy.s.coins < 1e9, 'and the coins went with the edition')
})
