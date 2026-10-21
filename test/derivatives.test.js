import test from 'node:test'
import assert from 'node:assert/strict'
import { WirdApp } from '../src/core/app.js'
import { profile, priceAt } from '../src/shared/market.js'
import {
  blackScholes, impliedVol, normCdf, RATE, YEAR_MS, expiries, futureExpiries, strikes, optionQuote, futureQuote,
  mark, marginCallAt, bellsBetween, ETFS, etfById, etfNav, realizedVol
} from '../src/shared/derivatives.js'
import { splitFactor, splitsUpTo, pendingSplit, splitTaste } from '../src/shared/market.js'
import { DEBT_RATE } from '../src/core/economy.js'
import { drawPack, PITY, packPool, packOdds, cardValue, craftCost, scrapFor, BONUS_MIN } from '../src/shared/packs.js'
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

test('a leveraged long: interest accrues and the position marks to market', () => {
  const a = app()
  const before = a.economy.s.coins
  const v = a.derivs.openMargin({ word: 'gravy', side: 'long', lev: 2, coins: 1000 })
  assert.equal(Math.round(before - a.economy.s.coins), 1000)
  assert.ok(v.value < 1000 && v.value > 975, 'closing straight away loses the spreads')
  assert.ok(v.liqPrice > 0 && v.liqPrice < v.S)
  a.clock.t += 3 * DAY
  const pos = a.derivs.book().open[0]
  if (pos) { assert.ok(pos.interest > 0); a.derivs.close(pos.id) }
  assert.equal(a.derivs.d.open.length, 0)
})

test('margin calls land on the closing bell, and losses past the margin become debt', () => {
  const a = app()
  // Short a wild word at full leverage and wait: it trends up, so sooner or
  // later a bell catches it under water.
  const max = a.derivs.chain('zymurgy').maxMarginLev
  a.derivs.openMargin({ word: 'zymurgy', side: 'short', lev: max, coins: 5000 })
  const pos = { ...a.derivs.d.open[0] }
  let done = null
  for (let k = 0; k < 24 && !done; k++) {
    a.clock.t += 30 * DAY
    a.derivs.sync()
    done = a.derivs.d.log.find((x) => x.id === pos.id)
  }
  assert.equal(done.how, 'liquidated')
  assert.equal(new Date(done.at).getUTCHours(), 20, 'at the bell')
  const p = a.market.profile('zymurgy')
  assert.equal(done.at, marginCallAt(pos, pos.checked, a.clock.t, p))
  for (const b of bellsBetween(pos.checked, done.at - 1)) { const m = mark(pos, b, p); assert.ok(m.equity >= m.maint, 'fine at every bell before') }
  // A loss beyond the margin is debt, not forgiven.
  const m = mark(pos, done.at, p)
  assert.ok(Math.abs(done.pay - (m.equity - 0.005 * pos.qty * m.S)) < 0.02)
})

test('debt charges interest, earning pays it down, and publishing waits until it’s paid', () => {
  const a = app()
  a.economy.s.coins = -10000
  a.economy.s.lastTick = a.clock.t
  a.economy.s.buildings = {}
  a.clock.t += 365.25 * DAY
  a.economy.s.lastTick = a.clock.t - 1000 // a second of ticking, then the rest by hand
  a.economy.tick()
  const owed = -a.economy.s.coins
  assert.ok(owed > 10000, 'it grew')
  assert.ok(Math.abs(Math.log(owed / 10000) - DEBT_RATE * (1000 / (365.25 * DAY))) < 1e-9, 'continuously, at the debt rate')
  a.economy.s.inkTotal = 0
  a.economy.s.allCoins = 1e15
  assert.throws(() => a.economy.prestige(), /debt/)
  assert.throws(() => a.derivs.openMargin({ word: 'gravy', side: 'long', lev: 2, coins: 10 }), /debt|coins/)
})

test('bankruptcy: everything is sold first, the rest cancelled, and the fun waits for steady income', () => {
  const a = app()
  a.market.buy('gravy', 1000)
  a.economy.s.coins = 500
  assert.throws(() => a.declareBankruptcy(), /not in debt/)
  a.economy.s.coins = -200 // the shares cover this
  assert.throws(() => a.declareBankruptcy(), /cover/)
  a.economy.s.coins = -1e6
  const b = a.declareBankruptcy()
  assert.equal(a.economy.s.coins, 0)
  assert.deepEqual(a.economy.s.market.holdings, {}, 'the shares went to the creditors')
  assert.ok(b.discharged > 990000 && b.discharged < 1e6)
  assert.throws(() => a.economy.flip(1), /bankrupt/)
  assert.throws(() => a.economy.spin(1), /bankrupt/)
  assert.throws(() => a.economy.openPack({ free: true }), /bankrupt/)
  assert.throws(() => a.derivs.openMargin({ word: 'gravy', side: 'long', lev: 2, coins: 10 }), /bankrupt/)
  assert.throws(() => a.economy.buyCosmetic('frame', 'silver'), /bankrupt/)
  a.economy.s.owned.push('frame:gold')
  a.economy.s.look.frame = 'gold'
  assert.equal(a.economy.look().frame, 'none', 'looks are locked away')
  assert.throws(() => a.economy.equip('frame', 'gold'), /bankrupt/)
  assert.equal(a.economy.holdStake('k', 10, 'h'), false, 'no lobby stakes')
  // Rebuild: time passes and steady income comes in.
  a.clock.t += 3 * DAY
  a.economy.tick()
  assert.ok(a.economy.s.bankrupt, 'time alone isn’t enough')
  a.economy._earn(b.need)
  a.economy.tick()
  assert.equal(a.economy.s.bankrupt, null)
  assert.equal(a.economy.look().frame, 'gold', 'and your looks come back')
  assert.equal(a.economy.s.credit.filings, 1)
})

test('splits change the price you see, never what you hold', () => {
  const a = app()
  // Find a rated word that splits in the next few months.
  const words = a.words.sorted.filter((w) => /^[a-z]{5,7}$/.test(w)).slice(2000, 3000)
  let word = null
  let when = null
  for (const w of words) {
    const p = a.market.profile(w)
    const e = splitsUpTo(p, a.clock.t + 120 * DAY).filter((x) => x.at > a.clock.t + DAY && x.ratio > 1).pop()
    if (e) { word = w; when = e; break }
  }
  assert.ok(word, 'some word splits')
  a.rate(word, 3)
  a.market.buy(word, 10000)
  const ch = a.derivs.chain(word)
  const ex = ch.expiries[ch.expiries.length - 1]
  a.derivs.openOption({ word, expiry: ex.at, K: ex.rows[5].K, type: 'call', side: 'long', qty: 5 })
  a.clock.t = when.at - 60000
  const before = a.market.portfolio()
  const optBefore = a.derivs.book().open[0]
  a.clock.t = when.at
  const after = a.market.portfolio()
  const optAfter = a.derivs.book().open[0]
  assert.ok(Math.abs(after.rows[0].shares / before.rows[0].shares - when.ratio) < 1e-9, 'more shares')
  assert.ok(Math.abs(Math.log(a.market.quote(word).price / splitTaste(a.market.profile(word)).aim)) < Math.log(4), 'back near the price its board likes')
  // It was announced days ahead.
  assert.ok(when.at - when.announced >= 3 * DAY)
  assert.deepEqual(pendingSplit(a.market.profile(word), when.at - DAY), when)
  assert.equal(pendingSplit(a.market.profile(word), when.at), null)
  assert.ok(Math.abs(after.rows[0].value / before.rows[0].value - 1) < 0.05, 'worth the same (but for a minute’s move)')
  assert.ok(Math.abs(optAfter.qty / optBefore.qty - when.ratio) < 1e-9 && Math.abs(optAfter.K * when.ratio - optBefore.K) < 1e-9, 'contracts and strike adjusted')
  assert.ok(Math.abs(a.market.quote(word).day) < 0.5, 'a split isn’t a crash')
  assert.equal(splitFactor(a.market.profile(word), when.at), splitFactor(a.market.profile(word), when.at - 60000) * when.ratio)
})

test('card packs: one free every five levels, three cards, value-weighted, pity, scraps and crafting', () => {
  const a = app()
  a.economy.s.packs.granted = 0
  a.economy.s.packs.free = 0
  assert.equal(a.economy.grantLevelPacks(12), 2)
  assert.equal(a.economy.grantLevelPacks(12), 0, 'only once')
  const r = a.economy.openPack({ free: true })
  assert.equal(r.cards.length, 3)
  const price = a.economy.packPrice()
  assert.ok(r.cards[2].value >= BONUS_MIN * price, 'the third card is the bonus')
  for (const c of r.cards) assert.ok(c.dup || a.economy.owns(c.kind, c.id))
  // Expensive things are really hard to get from a cheap pack.
  const odds = packOdds(10000)
  const top = packPool().reduce((x, c) => (cardValue(c) > cardValue(x) ? c : x))
  assert.ok(odds.cardChance(top) < 1e-9, 'the priciest card is about once in a lifetime')
  assert.ok(odds.main.legendary < 1e-4)
  // …and come within reach as packs get dearer.
  assert.ok(packOdds(1e10).main.legendary > packOdds(1e6).main.legendary * 100)
  // Pity: a card worth the pack within PITY packs.
  let seed = 1
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  let dry = 0
  let worst = 0
  for (let i = 0; i < 5000; i++) { const d = drawPack(rand, 50000, dry); dry = d.dry; worst = Math.max(worst, dry) }
  assert.ok(worst < PITY)
  assert.ok(packPool().some((c) => c.pack) && !packPool().some((c) => c.level || c.badge || c.edition))
  // Scraps: a quarter of the value for a duplicate; crafting costs the full value.
  const target = packPool().find((c) => c.rarity === 'rare' && !a.economy.owns(c.kind, c.id))
  a.economy.s.packs.scraps = craftCost(target) + 7
  a.economy.craft(target.kind, target.id)
  assert.ok(a.economy.owns(target.kind, target.id))
  assert.equal(a.economy.s.packs.scraps, 7)
  assert.equal(scrapFor(target), Math.round(cardValue(target) / 4))
  const coins = a.economy.s.coins
  a.economy.openPack()
  assert.ok(a.economy.s.coins < coins)
  const packOnly = packPool().find((c) => c.pack && !a.economy.owns(c.kind, c.id))
  if (packOnly) assert.throws(() => a.economy.buyCosmetic(packOnly.kind, packOnly.id), /packs/)
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
