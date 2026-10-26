// Derivatives on the Word Exchange: options, futures, leverage and ETFs,
// priced the way real desks price them, on top of the word prices in
// market.js (which every computer agrees on).
//
//   Options   European, cash-settled at expiry on the spot price.
//             Black–Scholes with a dividend-free underlying, the exchange
//             rate RATE, and implied volatility read off each word's own
//             realized volatility at the option's horizon (so there is a term
//             structure), plus a variance premium and a gentle smile.
//   Futures   Cost of carry: F = S·e^(r·T). They converge to spot at expiry
//             and are margined like SPAN: initial margin covers a three-
//             sigma day, maintenance is three quarters of that.
//   Leverage  Borrow coins to buy (long) or borrow shares to sell (short).
//             Interest accrues continuously. Margin is checked at the
//             closing bell each day: under maintenance, the position is
//             closed then, at that minute's price. A position can lose more
//             than was put up (a gap, a jump, a day away), and the
//             shortfall is debt: your coins go negative.
//
// Prices here are in a position's own units (pos.f, the split factor when
// they were last written down), so a split never moves anything; the book
// rewrites quantities and strikes at each split, as real exchanges do.
//   ETFs      Sector funds and a whole-market fund track the sector indices;
//             the 3× and inverse funds rebalance daily, so they decay in
//             choppy markets exactly like the real ones.
//
// Everything is a pure function of the word, the time and the position.

import { priceAt, sectorIndex, SECTORS, MARKET_OPEN, quoteTime, QUOTE_MS } from './market.js'
export { shownPrice, splitFactor } from './market.js'

export const RATE = 0.05 // the exchange's risk-free rate, a year, compounded continuously
export const BORROW_SPREAD = 0.02 // what borrowing coins costs over RATE
export const VARIANCE_PREMIUM = 1.1 // implied vol runs a little over realized, as in real markets
export const OPTION_SPREAD = 0.03 // market makers quote 3% either side of fair value
export const FUTURE_SPREAD = 0.001
export const ETF_SPREAD = 0.0005
export const LIQUIDATION_FEE = 0.005 // of notional, taken from what's left
export const EXPIRY_HOUR = 20 // 20:00 UTC: the closing bell
const MIN = QUOTE_MS
const HOUR = 3600e3
const DAY = 864e5
export const YEAR_MS = 365.25 * DAY
const round2 = (x) => Math.round(x * 100) / 100
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x))

// --- the normal distribution ----------------------------------------------------------

// erfc by Chebyshev fit (Numerical Recipes), good to about 1.2e-7 everywhere.
export function normCdf (x) {
  const z = Math.abs(x) / Math.SQRT2
  const t = 1 / (1 + 0.5 * z)
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))))
  return x >= 0 ? 1 - r / 2 : r / 2
}
export const normPdf = (x) => Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI)

// --- Black–Scholes ------------------------------------------------------------------

// T in years. Greeks: delta per coin, gamma per coin², theta per day,
// vega per volatility point (1%), rho per rate point.
export function blackScholes ({ S, K, T, sigma, r = RATE, type }) {
  const call = type === 'call'
  if (!(T > 0) || !(sigma > 0)) {
    const intrinsic = Math.max(0, call ? S - K : K - S)
    return { price: intrinsic, delta: intrinsic > 0 ? (call ? 1 : -1) : 0, gamma: 0, theta: 0, vega: 0, rho: 0 }
  }
  const sq = sigma * Math.sqrt(T)
  const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / sq
  const d2 = d1 - sq
  const df = Math.exp(-r * T)
  const nd1 = normPdf(d1)
  const gamma = nd1 / (S * sq)
  const vega = S * nd1 * Math.sqrt(T) / 100
  const decay = -S * nd1 * sigma / (2 * Math.sqrt(T))
  if (call) {
    return {
      price: S * normCdf(d1) - K * df * normCdf(d2),
      delta: normCdf(d1),
      gamma,
      theta: (decay - r * K * df * normCdf(d2)) / 365,
      vega,
      rho: K * T * df * normCdf(d2) / 100
    }
  }
  return {
    price: K * df * normCdf(-d2) - S * normCdf(-d1),
    delta: normCdf(d1) - 1,
    gamma,
    theta: (decay + r * K * df * normCdf(-d2)) / 365,
    vega,
    rho: -K * T * df * normCdf(-d2) / 100
  }
}

// The volatility that makes Black–Scholes give `price` (Newton, then bisection).
export function impliedVol ({ price, S, K, T, r = RATE, type }) {
  const intrinsic = Math.max(0, type === 'call' ? S - K * Math.exp(-r * T) : K * Math.exp(-r * T) - S)
  if (!(T > 0) || price <= intrinsic + 1e-12) return 0
  let lo = 1e-4
  let hi = 20
  let s = 0.8
  for (let i = 0; i < 100; i++) {
    const b = blackScholes({ S, K, T, sigma: s, r, type })
    const diff = b.price - price
    if (Math.abs(diff) < 1e-10) return s
    if (diff > 0) hi = s; else lo = s
    const v = b.vega * 100
    const next = v > 1e-12 ? s - diff / v : NaN
    s = next > lo && next < hi ? next : (lo + hi) / 2
  }
  return s
}

// --- volatility ---------------------------------------------------------------------

// Realized volatility at a horizon: the spread of log returns over that
// horizon across the last 90 days, annualized. Words revert toward their
// trend, so long horizons are calmer than short ones (an inverted term
// structure), just as the price model behaves.
export function realizedVol (p, t, horizonMs) {
  const h = clamp(horizonMs, HOUR, 30 * DAY)
  const end = quoteTime(t)
  const start = Math.max(MARKET_OPEN, end - 90 * DAY)
  const n = 128
  if (end - h - start < 2 * h) return Math.max(0.05, p.vol) // too little history
  let sum = 0
  let sum2 = 0
  for (let i = 0; i < n; i++) {
    const s = start + ((end - h - start) * i) / (n - 1)
    const x = Math.log(priceAt(p, s + h) / priceAt(p, s))
    sum += x
    sum2 += x * x
  }
  const varr = Math.max(0, (sum2 - (sum * sum) / n) / (n - 1))
  return Math.sqrt(varr) / Math.sqrt(h / YEAR_MS)
}

// At-the-money implied vol, quoted fresh each hour. Horizons share a quote
// within a quarter octave, which keeps it cheap without visible steps.
const ivCache = new Map()
export function atmVol (p, t, T) {
  const h = clamp(T * YEAR_MS, HOUR, 30 * DAY)
  const hour = Math.floor(t / HOUR)
  const band = Math.round(Math.log2(h / HOUR) * 4)
  const key = `${p.word}|${p.sector}|${hour}|${band}`
  let v = ivCache.get(key)
  if (v === undefined) {
    v = clamp(realizedVol(p, hour * HOUR, HOUR * 2 ** (band / 4)) * VARIANCE_PREMIUM, 0.05, 6)
    if (ivCache.size > 20000) ivCache.clear()
    ivCache.set(key, v)
  }
  return v
}

// The smile: options far from the money cost more volatility, measured in
// standard deviations so it looks the same at every expiry.
export function smileVol (atm, S, K, T) {
  const m = Math.log(K / (S * Math.exp(RATE * T))) / (atm * Math.sqrt(Math.max(T, 1 / 8760)))
  return atm * Math.min(1.6, 1 + 0.06 * m * m)
}

// --- expiries and strikes -------------------------------------------------------------

const at20 = (dayMs) => dayMs + EXPIRY_HOUR * HOUR
function thirdFriday (y, m) {
  const first = new Date(Date.UTC(y, m, 1)).getUTCDay()
  return Date.UTC(y, m, 1 + ((5 - first + 7) % 7) + 14)
}

// What's listed at time t: two dailies, two weeklies (Fridays) and three
// monthlies (third Fridays), all at the closing bell. Futures list the
// monthlies only.
export function expiries (t) {
  const out = new Map()
  const day0 = Math.floor(t / DAY) * DAY
  const add = (e, kind) => { if (e > t + MIN && !out.has(e)) out.set(e, kind) }
  const isMonthly = (e) => { const d = new Date(e); return e === at20(thirdFriday(d.getUTCFullYear(), d.getUTCMonth())) }
  let n = 0
  for (let d = 0; n < 2 && d < 7; d++) {
    const e = at20(day0 + d * DAY)
    const wd = new Date(e).getUTCDay()
    if (e > t + MIN && wd !== 0 && wd !== 6) { add(e, 'daily'); n++ }
  }
  n = 0
  for (let d = 0; n < 2 && d < 21; d++) {
    const e = at20(day0 + d * DAY)
    if (new Date(e).getUTCDay() === 5 && e > t + MIN) { if (!isMonthly(e)) out.set(e, 'weekly'); n++ }
  }
  const monthly = []
  const now = new Date(t)
  for (let k = 0; monthly.length < 3 && k < 5; k++) {
    const e = at20(thirdFriday(now.getUTCFullYear(), now.getUTCMonth() + k))
    if (e > t + MIN) monthly.push(e)
  }
  for (const e of monthly) out.set(e, 'monthly')
  return [...out.entries()].sort((a, b) => a[0] - b[0]).map(([at, kind]) => ({ at, kind }))
}
export const futureExpiries = (t) => expiries(t).filter((e) => e.kind === 'monthly')
export const isListedExpiry = (t, at, futures = false) => (futures ? futureExpiries(t) : expiries(t)).some((e) => e.at === at)

// A tidy step: 1, 2, 2.5 or 5 times a power of ten.
export function niceStep (x) {
  if (!(x > 0)) return 0.01
  const pow = 10 ** Math.floor(Math.log10(x))
  const f = x / pow
  const s = f < 1.5 ? 1 : f < 2.25 ? 2 : f < 3.5 ? 2.5 : f < 7.5 ? 5 : 10
  return Math.max(0.01, round2(s * pow))
}

// Eleven strikes around the forward, spaced by about a third of a standard
// deviation at that expiry (wider for longer and wilder).
export function strikes (S, T, sigma, n = 11) {
  const F = S * Math.exp(RATE * T)
  const step = niceStep(Math.max(S * 0.005, (F * sigma * Math.sqrt(Math.max(T, 1 / 8760))) / 3))
  const mid = Math.round(F / step) * step
  const out = []
  for (let i = -Math.floor(n / 2); i <= Math.floor(n / 2); i++) {
    const k = round2(mid + i * step)
    if (k > 0) out.push(k)
  }
  return out
}

// --- quotes ---------------------------------------------------------------------------

const years = (t, at) => Math.max(0, (at - t) / YEAR_MS)

export function optionQuote (p, t, at, K, type, f = 1) {
  const S = priceAt(p, t) / f
  const T = years(t, at)
  const atm = atmVol(p, t, T)
  const sigma = smileVol(atm, S, K, T)
  const b = blackScholes({ S, K, T, sigma, type })
  const half = Math.max(0.005, b.price * OPTION_SPREAD)
  return {
    S,
    K,
    T,
    type,
    iv: sigma,
    theo: b.price,
    bid: Math.max(0, Math.floor((b.price - half) * 100) / 100),
    ask: Math.max(0.01, Math.ceil((b.price + half) * 100) / 100),
    delta: b.delta,
    gamma: b.gamma,
    theta: b.theta,
    vega: b.vega,
    rho: b.rho
  }
}

export function futurePrice (S, t, at) { return S * Math.exp(RATE * years(t, at)) }
export function futureQuote (p, t, at, f = 1) {
  const S = priceAt(p, t) / f
  const F = futurePrice(S, t, at)
  return { S, F, bid: F * (1 - FUTURE_SPREAD), ask: F * (1 + FUTURE_SPREAD), basis: F - S, im: initialMargin(p, t) }
}

// Margin covering a three-sigma day, between 4% and 50% of notional.
export function initialMargin (p, t) {
  const daily = atmVol(p, t, 1 / 365.25) / Math.sqrt(365.25)
  return clamp(3 * daily, 0.04, 0.5)
}
export const maxFutureLeverage = (p, t) => Math.min(25, Math.floor(1 / initialMargin(p, t)))
export const maxMarginLeverage = (p, t) => Math.max(1, Math.min(10, Math.floor(1 / initialMargin(p, t))))
// Shorts pay to borrow shares; wilder words are harder to borrow.
export const shortBorrowRate = (p) => 0.01 + 0.12 * p.vol
export const longBorrowRate = () => RATE + BORROW_SPREAD
// Reg T's 25% at 2×, scaling down with leverage.
export const maintenanceRatio = (lev) => Math.min(0.25, 0.5 / lev)

// A short option's margin, the CBOE way: 20% of the underlying less how far
// out of the money it is, at least 10% of the underlying (calls) or strike (puts).
export function shortOptionRequirement (S, K, type) {
  const otm = Math.max(0, type === 'call' ? K - S : S - K)
  return Math.max(0.2 * S - otm, 0.1 * (type === 'call' ? S : K))
}

// --- positions ------------------------------------------------------------------------
//
// pos.kind: 'margin' | 'future' | 'option'. `mark(pos, t, p)` returns
// { equity, maint, value }: what the position is worth to you at mid
// (equity), the line under which the closing bell closes it (maint), and
// what closing it now would pay after the spread (value). Both can be
// negative: that's debt. Bought options can't lose more than their premium,
// so they have maint = -Infinity.

export function mark (pos, t, p) {
  const f = pos.f || 1
  const spot = (x) => priceAt(p, x) / f
  if (pos.kind === 'margin') {
    const S = spot(t)
    const dt = Math.max(0, t - pos.opened) / YEAR_MS
    const interest = pos.base * (Math.exp(pos.rate * dt) - 1)
    const pnl = (S0) => pos.side * pos.qty * (S0 - pos.entry)
    const equity = pos.margin + pnl(S) - interest
    const exit = pos.side > 0 ? S * (1 - 0.005) : S * (1 + 0.005) // the share spread
    return { equity, maint: maintenanceRatio(pos.lev) * pos.qty * S, value: pos.margin + pnl(exit) - interest, S, interest }
  }
  if (pos.kind === 'future') {
    const S = spot(Math.min(t, pos.expiry))
    const F = t >= pos.expiry ? S : futurePrice(S, t, pos.expiry)
    const exit = t >= pos.expiry ? F : F * (1 - pos.side * FUTURE_SPREAD)
    return { equity: pos.margin + pos.side * pos.qty * (F - pos.entry), maint: 0.75 * pos.im * pos.qty * F, value: pos.margin + pos.side * pos.qty * (exit - pos.entry), S, F }
  }
  // Options
  const S = spot(Math.min(t, pos.expiry))
  if (t >= pos.expiry) {
    const pay = Math.max(0, pos.type === 'call' ? S - pos.K : pos.K - S) * pos.qty
    return pos.side > 0
      ? { equity: pay, maint: -Infinity, value: pay, S }
      : { equity: pos.margin - pay, maint: -Infinity, value: pos.margin - pay, S }
  }
  const q = optionQuote(p, t, pos.expiry, pos.K, pos.type, f)
  if (pos.side > 0) return { equity: q.theo * pos.qty, maint: -Infinity, value: q.bid * pos.qty, S, q }
  const req = shortOptionRequirement(S, pos.K, pos.type) * pos.qty
  return { equity: pos.margin - q.theo * pos.qty, maint: req, req, value: pos.margin - q.ask * pos.qty, S, q }
}

// The closing bells (20:00 UTC, every day) in (from, to].
export function bellsBetween (from, to) {
  const out = []
  let b = Math.floor(from / DAY) * DAY + EXPIRY_HOUR * HOUR
  if (b <= from) b += DAY
  for (; b <= to; b += DAY) out.push(b)
  return out
}
export const nextBell = (t) => bellsBetween(t, t + DAY + 1)[0]

// The first closing bell in (from, to] at which a position was under its
// maintenance line, or null. Prices are known for every minute, so this is
// exact however long you were away. An expiry at the same bell settles
// instead.
export function marginCallAt (pos, from, to, p) {
  if (pos.kind === 'option' && pos.side > 0) return null
  const end = Math.min(to, pos.expiry ? pos.expiry - 1 : Infinity)
  for (const b of bellsBetween(from, end)) {
    const m = mark(pos, b, p)
    if (m.equity < m.maint) return b
  }
  return null
}

// --- ETFs -----------------------------------------------------------------------------

const TICKERS = { animals: 'XANM', food: 'XFOD', plants: 'XPLT', body: 'XBOD', feelings: 'XFEL', nature: 'XNAT', people: 'XPPL', things: 'XTHG', places: 'XPLC', motion: 'XMOV', talk: 'XTLK', mind: 'XMND', describing: 'XDSC', adverbs: 'XADV', misc: 'XMSC' }
const SECTOR_FUNDS = SECTORS.map((s) => ({ id: TICKERS[s.id], name: `${s.name} fund`, emoji: s.emoji, track: s.id, k: 1, fee: 0.0035 }))
export const ETFS = [
  { id: 'WORD', name: 'Whole Market', emoji: '🌐', track: 'all', k: 1, fee: 0.0009, blurb: 'Every sector, equally weighted.' },
  { id: 'WTLX', name: 'Total Lexicon', emoji: '🧾', track: 'all', k: 1, fee: 0.0008, blurb: 'The same words as WORD, in the same amounts, for 0.01% a year less.' },
  { id: 'WRD3', name: 'Whole Market 3×', emoji: '🚀', track: 'all', k: 3, fee: 0.0095, blurb: 'Three times the market’s daily move, reset each day.' },
  { id: 'WSHT', name: 'Whole Market Short', emoji: '🐻', track: 'all', k: -1, fee: 0.0095, blurb: 'The opposite of the market’s daily move.' },
  { id: 'WSH3', name: 'Whole Market Short 3×', emoji: '🕳️', track: 'all', k: -3, fee: 0.0095, blurb: 'Three times the opposite, reset each day.' },
  ...SECTOR_FUNDS,
  // Sectors of a different kind: words picked by what they're like, not
  // what they're about (see core/derivatives.js), held equally.
  { id: 'BLUE', name: 'Blue Chips', emoji: '🧱', track: 'basket', pick: 'blue', k: 1, fee: 0.002, blurb: 'The 25 steadiest everyday words.' },
  { id: 'WILD', name: 'Wild Ones', emoji: '🎢', track: 'basket', pick: 'wild', k: 1, fee: 0.006, blurb: 'The 25 wildest obscure words.' },
  { id: 'LONG', name: 'Long Words', emoji: '📏', track: 'basket', pick: 'long', k: 1, fee: 0.004, blurb: '25 everyday words of eleven letters or more.' },
  { id: 'TINY', name: 'Tiny Words', emoji: '🐜', track: 'basket', pick: 'tiny', k: 1, fee: 0.004, blurb: '25 everyday words of four letters or fewer.' },
  { id: 'PALI', name: 'Palindromes', emoji: '🪞', track: 'basket', pick: 'pali', k: 1, fee: 0.005, blurb: 'Words that read the same backwards.' },
  { id: 'TWIN', name: 'Double Letters', emoji: '👯', track: 'basket', pick: 'twin', k: 1, fee: 0.004, blurb: '25 everyday words with a letter twice in a row.' }
]
export const etfById = (id) => ETFS.find((e) => e.id === id)

// The index a fund tracks at time t.
function trackLevel (track, t) {
  if (track !== 'all') return sectorIndex(track, t)
  let s = 0
  for (const x of SECTORS) s += Math.log(sectorIndex(x.id, t))
  return Math.exp(s / SECTORS.length)
}

// Net asset value. Plain funds are the index less fees. Leveraged and
// inverse funds compound k × each day's move, plus the cash they hold
// (1 − k) earning RATE, less fees, resetting at 00:00 UTC.
const navDays = new Map() // id -> [nav at the start of each day since the open]
export const SECTOR_BASKETS_FROM = Date.UTC(2026, 9, 22)
export const SECTOR_BASKET_SIZE = 30

// A basket's level: the geometric mean of its words' growth since the open.
export function basketLevel (profiles, t) {
  if (!profiles?.length) return 1
  let s = 0
  for (const p of profiles) s += Math.log(priceAt(p, t) / priceAt(p, MARKET_OPEN))
  return Math.exp(s / profiles.length)
}

// basket: the word profiles a basket fund holds.
export function etfNav (etf, t, basket = null) {
  t = quoteTime(Math.max(MARKET_OPEN, t))
  const yrs = (t - MARKET_OPEN) / YEAR_MS
  if (etf.track === 'basket') return 100 * basketLevel(basket, t) * Math.exp(-etf.fee * yrs)
  // Sector funds hold their sector's words (from SECTOR_BASKETS_FROM; before
  // that they tracked the sector index), carried on from the price they had
  // then, so nothing jumps.
  if (etf.k === 1 && etf.track !== 'all' && basket?.length && t >= SECTOR_BASKETS_FROM) {
    const base = etfNav(etf, SECTOR_BASKETS_FROM - QUOTE_MS)
    return base * (basketLevel(basket, t) / basketLevel(basket, SECTOR_BASKETS_FROM)) * Math.exp(-etf.fee * (t - SECTOR_BASKETS_FROM) / YEAR_MS)
  }
  if (etf.k === 1) return 100 * (trackLevel(etf.track, t) / trackLevel(etf.track, MARKET_OPEN)) * Math.exp(-etf.fee * yrs)
  const d = Math.floor((t - MARKET_OPEN) / DAY)
  let days = navDays.get(etf.id)
  if (!days) { days = [100]; navDays.set(etf.id, days) }
  const carry = ((1 - etf.k) * RATE - etf.fee) / 365.25
  while (days.length <= d) {
    const i = days.length - 1
    const a = trackLevel(etf.track, MARKET_OPEN + i * DAY)
    const b = trackLevel(etf.track, MARKET_OPEN + (i + 1) * DAY)
    days.push(days[i] * Math.max(0.001, 1 + etf.k * (b / a - 1) + carry))
  }
  const dayStart = MARKET_OPEN + d * DAY
  const frac = (t - dayStart) / DAY
  const move = trackLevel(etf.track, t) / trackLevel(etf.track, dayStart) - 1
  return days[d] * Math.max(0.001, 1 + etf.k * move + carry * frac)
}
export function etfQuote (etf, t, basket = null) {
  const nav = etfNav(etf, t, basket)
  return { nav, buy: nav * (1 + ETF_SPREAD), sell: nav * (1 - ETF_SPREAD), day: nav / etfNav(etf, t - DAY, basket) - 1 }
}
export function etfSeries (etf, from, to, n, basket = null) {
  const out = []
  const step = (to - from) / Math.max(1, n - 1)
  for (let i = 0; i < n; i++) { const t = from + step * i; out.push([quoteTime(t), etfNav(etf, t, basket)]) }
  return out
}
