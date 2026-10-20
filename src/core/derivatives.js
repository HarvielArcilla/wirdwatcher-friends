// Derivatives on this computer: your leveraged positions, futures, options
// and ETF shares, kept in the economy (s.market.derivs and s.market.etfs) so
// they save with the coins. The pricing is in src/shared/derivatives.js.
//
// Losses aren't capped at what you put up. Margin is checked at each day's
// closing bell, worked out lazily but exactly (prices are known for every
// minute), and a position that's gone further than its margin leaves you in
// debt: your coins go negative and the debt charges interest. Bankruptcy
// (in the economy) is the way out.
//
// Coins only move in one place each: _pay takes them as a position opens
// and _settle moves them (either way) as it closes, and a position leaves
// the book in the same step that settles it, so it can't settle twice.

import { priceAt, quoteTime, splitFactor } from '../shared/market.js'
import {
  RATE, YEAR_MS, LIQUIDATION_FEE, mark, marginCallAt, nextBell, optionQuote, futureQuote, futurePrice, expiries, futureExpiries,
  isListedExpiry, strikes, atmVol, initialMargin, maxFutureLeverage, maxMarginLeverage, longBorrowRate, shortBorrowRate,
  maintenanceRatio, shortOptionRequirement, blackScholes, ETFS, etfById, etfQuote
} from '../shared/derivatives.js'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const fmtK = (k) => (Number.isInteger(k) ? String(k) : k.toFixed(2))
export function label (pos) {
  const W = pos.word.toUpperCase()
  const d = pos.expiry ? new Date(pos.expiry) : null
  const date = d ? `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}` : ''
  if (pos.kind === 'margin') return `${W} ${pos.side > 0 ? 'long' : 'short'} ${pos.lev}×`
  if (pos.kind === 'future') return `${W} ${date} future`
  return `${W} ${date} ${fmtK(Math.round(pos.K * 100) / 100)} ${pos.type === 'call' ? 'call' : 'put'}`
}

export class Derivatives {
  constructor ({ market, economy, now }) {
    this.market = market
    this.economy = economy
    this.now = now
    const m = economy.s.market
    m.derivs = { next: 1, open: [], log: [], liquidations: 0, seen: 0, ...(m.derivs || {}) }
    m.etfs = { ...(m.etfs || {}) }
  }

  get d () { return this.economy.s.market.derivs }
  get m () { return this.economy.s.market }

  _p (word) {
    const p = this.market.profile(word)
    if (!p) throw new Error('That word isn’t listed.')
    return p
  }

  _tradable (word) {
    if (this.economy.s.bankrupt) throw new Error('No margin, futures or options while you’re bankrupt. Shares and funds are fine.')
    if (this.market.store.rating(word) === null) throw new Error('Rate a word before you can trade it.')
    return this._p(word)
  }

  // --- money ------------------------------------------------------------------------

  _pay (coins) {
    const e = this.economy
    e.tick()
    coins = Math.ceil(coins * 100) / 100
    if (!(coins >= 0.01)) throw new Error('That’s too small to trade.')
    if (coins > e.s.coins + 1e-9) throw new Error(e.s.coins < 0 ? 'You’re in debt: nothing to trade with.' : 'You don’t have that many coins.')
    e._tradeClock()
    e.s.coins -= coins
    this.m.spent += coins
    this.m.trades++
    return coins
  }

  // Either way: a loss beyond what you have takes your coins below zero.
  _settle (coins) {
    coins = Math.round(coins * 100) / 100
    this.economy.s.coins += coins
    this.m.proceeds += coins
    return coins
  }

  _commit () {
    const e = this.economy
    e.dirty = true
    e.save(true)
    e.emit('changed')
    e.emit('played', 'trade')
  }

  _record (pos, how, at, pay, extra = {}) {
    const gain = pay - pos.paid
    const name = label(pos)
    const m = this.m
    if (!m.best || gain > m.best.gain) m.best = { word: name, gain, pct: pos.paid ? gain / pos.paid : 0 }
    if (!m.worst || gain < m.worst.gain) m.worst = { word: name, gain, pct: pos.paid ? gain / pos.paid : 0 }
    if (how === 'liquidated') this.d.liquidations++
    this.d.log = [{ id: pos.id, label: name, how, at, pay, paid: pos.paid, gain, ...extra }, ...this.d.log].slice(0, 40)
  }

  // A split rewrites a position in the new units: more contracts at a lower
  // price and strike (or fewer, for a reverse split). Nothing changes value.
  _resplit (pos, p, t) {
    const f = splitFactor(p, t)
    const was = pos.f || 1
    if (f === was) return false
    const r = f / was
    pos.qty *= r
    if (pos.entry !== undefined) pos.entry /= r
    if (pos.K !== undefined) pos.K /= r
    if (pos.premium !== undefined) pos.premium /= r
    pos.f = f
    return true
  }

  // --- the book catches up with the clock -------------------------------------------

  sync (t = this.now()) {
    let changed = false
    for (const pos of [...this.d.open]) {
      const p = this.market.profile(pos.word)
      if (!p) continue
      const shown = (x) => x * (pos.f || 1) / splitFactor(p, t)
      const call = marginCallAt(pos, pos.checked, t, p)
      if (call !== null) {
        const mk = mark(pos, call, p)
        const notional = Math.abs(pos.qty * (mk.F || mk.S))
        this.d.open = this.d.open.filter((x) => x.id !== pos.id)
        this._record(pos, 'liquidated', call, this._settle(mk.equity - LIQUIDATION_FEE * notional), { price: shown(mk.F || mk.S) })
        changed = true
      } else if (pos.expiry && t >= pos.expiry) {
        const mk = mark(pos, pos.expiry, p)
        this.d.open = this.d.open.filter((x) => x.id !== pos.id)
        this._record(pos, 'expired', pos.expiry, this._settle(mk.value), { price: shown(mk.S) })
        changed = true
      } else {
        pos.checked = Math.max(pos.checked, quoteTime(t))
        if (this._resplit(pos, p, t)) changed = true
      }
    }
    if (changed) { this.economy.dirty = true; this.economy.save(true); this.economy.emit('changed') }
    return changed
  }

  // --- what's on offer ----------------------------------------------------------------

  // The option chain and futures for a word, in today's (split-adjusted) units.
  chain (word) {
    const t = this.now()
    const p = this._p(word)
    const f = splitFactor(p, t)
    const S = priceAt(p, t) / f
    const listed = expiries(t).map(({ at, kind }) => {
      const T = (at - t) / YEAR_MS
      const atm = atmVol(p, t, T)
      const ks = strikes(S, T, atm)
      return {
        at,
        kind,
        atm,
        expectedMove: S * atm * Math.sqrt(T),
        rows: ks.map((K) => ({ K, call: optionQuote(p, t, at, K, 'call', f), put: optionQuote(p, t, at, K, 'put', f), callReq: shortOptionRequirement(S, K, 'call'), putReq: shortOptionRequirement(S, K, 'put') }))
      }
    })
    const futures = futureExpiries(t).map(({ at }) => ({ at, ...futureQuote(p, t, at, f) }))
    return {
      word,
      S,
      at: quoteTime(t),
      rate: RATE,
      expiries: listed,
      futures,
      im: initialMargin(p, t),
      maxFutureLev: maxFutureLeverage(p, t),
      maxMarginLev: maxMarginLeverage(p, t),
      longRate: longBorrowRate(),
      shortRate: shortBorrowRate(p),
      nextBell: nextBell(t),
      bankrupt: Boolean(this.economy.s.bankrupt),
      tradable: this.market.store.rating(word) !== null
    }
  }

  // --- opening ------------------------------------------------------------------------

  _open (pos, p) {
    const t = this.now()
    pos.id = this.d.next++
    pos.opened = t
    pos.checked = quoteTime(t)
    pos.f = splitFactor(p, t)
    this.d.open.push(pos)
    this._commit()
    return this.view(pos)
  }

  // Leverage: borrow coins to go long, or borrow shares to go short.
  openMargin ({ word, side, lev, coins }) {
    this.sync()
    const t = this.now()
    const p = this._tradable(word)
    const s = side === 'short' ? -1 : 1
    lev = Math.floor(Number(lev))
    const max = maxMarginLeverage(p, t)
    if (!(lev >= 1 && lev <= max)) throw new Error(`Leverage on ${word} goes from 1× to ${max}×.`)
    if (s > 0 && lev < 2) throw new Error('A 1× long is just shares: buy them instead.')
    const S = priceAt(p, t) / splitFactor(p, t)
    const entry = s > 0 ? S * 1.005 : S * 0.995 // the share spread
    const paid = this._pay(Number(coins))
    const qty = (lev * paid) / entry
    return this._open({
      kind: 'margin', word, side: s, lev, qty, entry, margin: paid, paid,
      base: s > 0 ? (lev - 1) * paid : qty * entry, // what's borrowed: coins for a long, shares (at their sale price) for a short
      rate: s > 0 ? longBorrowRate() : shortBorrowRate(p)
    }, p)
  }

  openFuture ({ word, expiry, side, lev, coins }) {
    this.sync()
    const t = this.now()
    const p = this._tradable(word)
    expiry = Number(expiry)
    if (!isListedExpiry(t, expiry, true)) throw new Error('That future isn’t listed any more.')
    const s = side === 'short' ? -1 : 1
    lev = Number(lev)
    const max = maxFutureLeverage(p, t)
    if (!(lev >= 1 && lev <= max)) throw new Error(`Futures on ${word} go up to ${max}×.`)
    const q = futureQuote(p, t, expiry, splitFactor(p, t))
    const entry = s > 0 ? q.ask : q.bid
    const paid = this._pay(Number(coins))
    return this._open({ kind: 'future', word, side: s, lev, qty: (lev * paid) / entry, entry, margin: paid, paid, im: q.im, expiry }, p)
  }

  // Options: buy (pay the premium; that's all you can lose) or write (take
  // the premium and put up margin, the CBOE way; the loss can run past it).
  openOption ({ word, expiry, K, type, side, qty }) {
    this.sync()
    const t = this.now()
    const p = this._tradable(word)
    const f = splitFactor(p, t)
    expiry = Number(expiry)
    K = Math.round(Number(K) * 100) / 100
    qty = Math.floor(Number(qty) * 1e4) / 1e4
    if (!isListedExpiry(t, expiry)) throw new Error('That expiry isn’t listed any more.')
    if (type !== 'call' && type !== 'put') throw new Error('Calls or puts only.')
    if (!(qty > 0)) throw new Error('Trade at least a little.')
    const S = priceAt(p, t) / f
    if (!(K > 0) || Math.abs(Math.log(K / S)) > 1.5) throw new Error('That strike isn’t listed.')
    const q = optionQuote(p, t, expiry, K, type, f)
    if (side === 'short') {
      if (!(q.bid >= 0.01)) throw new Error('Nobody will pay for that option: there’s nothing to write.')
      const premium = q.bid * qty
      const posted = this._pay(shortOptionRequirement(S, K, type) * qty)
      return this._open({ kind: 'option', word, side: -1, type, K, qty, expiry, premium: q.bid, margin: posted + premium, paid: posted }, p)
    }
    const paid = this._pay(q.ask * qty)
    return this._open({ kind: 'option', word, side: 1, type, K, qty, expiry, premium: q.ask, paid }, p)
  }

  // More margin pushes the liquidation line further away.
  addMargin (id, coins) {
    this.sync()
    const pos = this.d.open.find((x) => x.id === Number(id))
    if (!pos) throw new Error('That position is closed.')
    if (pos.kind === 'option' && pos.side > 0) throw new Error('A bought option has no margin.')
    const paid = this._pay(Number(coins))
    pos.margin += paid
    pos.paid += paid
    this._commit()
    return this.view(pos)
  }

  // Closing pays what it's worth now, which can be less than nothing.
  close (id) {
    this.sync()
    const pos = this.d.open.find((x) => x.id === Number(id))
    if (!pos) throw new Error('That position is already closed.')
    this.economy.tick()
    this.economy._tradeClock()
    const t = this.now()
    const mk = mark(pos, t, this._p(pos.word))
    this.d.open = this.d.open.filter((x) => x.id !== pos.id)
    const pay = this._settle(mk.value)
    this.m.trades++
    this._record(pos, 'closed', t, pay, { price: mk.F || mk.S })
    this._commit()
    return { pay, gain: pay - pos.paid }
  }

  closeAll () { for (const pos of [...this.d.open]) this.close(pos.id); for (const id of Object.keys(this.m.etfs)) this.sellEtf(id, 'all') }

  // --- a position as the screen shows it ------------------------------------------------

  view (pos, t = this.now()) {
    const p = this.market.profile(pos.word)
    const mk = mark(pos, t, p)
    const out = {
      id: pos.id, kind: pos.kind, word: pos.word, label: label(pos), side: pos.side, lev: pos.lev || null,
      qty: pos.qty, entry: pos.entry ?? pos.premium, K: pos.K ?? null, type: pos.type ?? null, expiry: pos.expiry ?? null,
      opened: pos.opened, paid: pos.paid, margin: pos.margin ?? null,
      value: mk.value, gain: mk.value - pos.paid, pct: pos.paid ? mk.value / pos.paid - 1 : 0,
      S: mk.S, F: mk.F ?? null, interest: mk.interest ?? null, owes: mk.value < 0
    }
    // How far the price can go before the closing bell closes it.
    if (mk.maint > -Infinity) {
      out.health = Math.max(0, Math.min(1, (mk.equity - mk.maint) / Math.max(1e-9, (pos.margin || pos.paid))))
      out.liqPrice = this._liqPrice(pos, t, p)
      out.marginCall = mk.equity < mk.maint
      out.nextBell = nextBell(t)
    }
    if (pos.kind === 'option' && t < pos.expiry) {
      const q = mk.q
      out.greeks = { delta: q.delta * pos.side * pos.qty, gamma: q.gamma * pos.side * pos.qty, theta: q.theta * pos.side * pos.qty, vega: q.vega * pos.side * pos.qty }
      out.iv = q.iv
      out.mark = q.theo
    }
    if (pos.kind === 'margin') out.rate = pos.rate
    return out
  }

  // The spot price past which the bell would close it (now, ignoring
  // interest still to come and, for options, time decay).
  _liqPrice (pos, t, p) {
    if (pos.kind === 'margin') {
      const dt = Math.max(0, t - pos.opened) / YEAR_MS
      const interest = pos.base * (Math.exp(pos.rate * dt) - 1)
      // margin + side·qty·(S − entry) − interest = mmr·qty·S
      const mmr = maintenanceRatio(pos.lev)
      const S = (pos.margin - interest - pos.side * pos.qty * pos.entry) / (mmr * pos.qty - pos.side * pos.qty)
      return S > 0 ? S : null
    }
    if (pos.kind === 'future') {
      const g = futurePrice(1, t, pos.expiry) // F = g·S
      const S = (pos.margin - pos.side * pos.qty * pos.entry) / (g * pos.qty * (0.75 * pos.im - pos.side))
      return S > 0 ? S : null
    }
    // Short option: bisect on spot, holding today's volatility.
    const T = Math.max(0, (pos.expiry - t) / YEAR_MS)
    const sigma = mark(pos, t, p).q?.iv || 0
    const bad = (S) => pos.margin - blackScholes({ S, K: pos.K, T, sigma, type: pos.type }).price * pos.qty < shortOptionRequirement(S, pos.K, pos.type) * pos.qty
    let good = pos.K
    let worst = pos.type === 'call' ? pos.K * 1000 : pos.K * 1e-6
    if (bad(good)) good = mark(pos, t, p).S
    if (!bad(worst) || bad(good)) return null
    for (let i = 0; i < 80; i++) {
      const mid = Math.sqrt(good * worst)
      if (bad(mid)) worst = mid; else good = mid
    }
    return worst
  }

  // --- ETFs -----------------------------------------------------------------------------

  etfs () {
    const t = this.now()
    return ETFS.map((e) => {
      const q = etfQuote(e, t)
      const h = this.m.etfs[e.id]
      const value = h ? h.shares * q.sell : 0
      return { ...e, ...q, shares: h?.shares || 0, cost: h?.cost || 0, value, gain: h ? value - h.cost : 0 }
    })
  }

  buyEtf (id, coins) {
    const e = etfById(id)
    if (!e) throw new Error('No such fund.')
    const q = etfQuote(e, this.now())
    const paid = this._pay(Math.floor(Number(coins) * 100) / 100)
    const h = this.m.etfs[id] || { shares: 0, cost: 0 }
    h.shares += Math.floor((paid / q.buy) * 1e6) / 1e6
    h.cost += paid
    this.m.etfs[id] = h
    this._commit()
    return { ...h }
  }

  sellEtf (id, shares) {
    const e = etfById(id)
    const h = this.m.etfs[id]
    if (!e || !h || !(h.shares > 0)) throw new Error('You don’t hold that fund.')
    shares = shares === 'all' ? h.shares : Math.min(h.shares, Math.floor(Number(shares) * 1e6) / 1e6)
    if (!(shares > 0)) throw new Error('Sell at least a little.')
    this.economy.tick()
    this.economy._tradeClock()
    const q = etfQuote(e, this.now())
    const cost = h.cost * (shares / h.shares)
    h.shares -= shares
    h.cost -= cost
    if (h.shares < 1e-6) delete this.m.etfs[id]
    const pay = this._settle(Math.floor(shares * q.sell * 100) / 100)
    this.m.trades++
    const gain = pay - cost
    if (!this.m.best || gain > this.m.best.gain) this.m.best = { word: e.id, gain, pct: cost ? gain / cost : 0 }
    if (!this.m.worst || gain < this.m.worst.gain) this.m.worst = { word: e.id, gain, pct: cost ? gain / cost : 0 }
    this._commit()
    return { pay, gain }
  }

  // --- totals -----------------------------------------------------------------------------

  // What everything open would fetch now (negative if it owes).
  value (t = this.now()) {
    let v = 0
    for (const pos of this.d.open) { const p = this.market.profile(pos.word); if (p) v += mark(pos, t, p).value }
    for (const [id, h] of Object.entries(this.m.etfs)) { const e = etfById(id); if (e) v += h.shares * etfQuote(e, t).sell }
    return v
  }

  book () {
    this.sync()
    const t = this.now()
    const fresh = this.d.log.filter((x) => x.at > (this.d.seen || 0) && x.how !== 'closed')
    if (fresh.length) { this.d.seen = Math.max(...this.d.log.map((x) => x.at)); this.economy.dirty = true }
    return {
      open: this.d.open.map((pos) => this.view(pos, t)),
      log: this.d.log.slice(0, 15),
      fresh,
      liquidations: this.d.liquidations,
      nextBell: nextBell(t)
    }
  }
}
