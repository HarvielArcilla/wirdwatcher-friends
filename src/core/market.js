// The Word Exchange on this computer: quotes and charts from the shared price
// model (src/shared/market.js), and your portfolio (kept in the economy, so
// coins and shares are saved together).
//
// You can trade any word you've rated: rating is how you find the market.
// What you gave a word never moves its price; prices are the same for
// everyone.

import { profile, priceAt, buyPrice, sellPrice, series, headline, sectorIndex, SECTORS, quoteTime, MARKET_OPEN } from '../shared/market.js'

const DAY = 864e5
export const CHART_RANGES = { day: DAY, week: 7 * DAY, month: 30 * DAY, year: 365 * DAY }

export class Market {
  constructor ({ words, store, economy, now = () => Date.now() }) {
    this.words = words
    this.store = store
    this.economy = economy
    this.now = now
    this.profiles = new Map()
  }

  profile (word) {
    let p = this.profiles.get(word)
    if (!p) {
      const facts = this.words.marketFacts(word)
      if (!facts) return null
      p = profile(word, facts)
      this.profiles.set(word, p)
    }
    return p
  }

  quote (word, t = this.now()) {
    const p = this.profile(word)
    if (!p) return null
    const price = priceAt(p, t)
    const day = priceAt(p, t - DAY)
    const week = priceAt(p, t - 7 * DAY)
    return {
      word,
      price,
      buy: buyPrice(price),
      sell: sellPrice(price),
      day: price / day - 1,
      week: price / week - 1,
      sector: p.sector,
      vol: p.vol,
      news: headline(p, t),
      tradable: this.store.rating(word) !== null
    }
  }

  chart (word, range = 'day') {
    const p = this.profile(word)
    if (!p) return null
    const span = CHART_RANGES[range] || DAY
    const t = this.now()
    return { word, range, points: series(p, Math.max(MARKET_OPEN, t - span), t, range === 'day' ? 145 : 160) }
  }

  // The board: words you can trade (ones you've rated), with what's moving.
  board ({ sector = null, query = '', sort = 'movers', limit = 60 } = {}) {
    const t = this.now()
    const held = this.economy.s.market.holdings
    const q = String(query || '').toLowerCase().trim()
    let rated = this.store.ratings().map((x) => x.word).filter((w) => this.words.has(w))
    if (q) rated = rated.filter((w) => w.includes(q))
    let rows = rated.map((w) => this.quote(w, t)).filter(Boolean)
    if (sector) rows = rows.filter((r) => r.sector === sector)
    const by = {
      movers: (a, b) => Math.abs(b.day) - Math.abs(a.day),
      gainers: (a, b) => b.day - a.day,
      losers: (a, b) => a.day - b.day,
      price: (a, b) => b.price - a.price,
      volatile: (a, b) => b.vol - a.vol,
      name: (a, b) => a.word.localeCompare(b.word)
    }[sort] || ((a, b) => Math.abs(b.day) - Math.abs(a.day))
    rows.sort(by)
    const news = rows.filter((r) => r.news).sort((a, b) => b.news.at - a.news.at).slice(0, 8)
    return {
      at: quoteTime(t),
      count: rows.length,
      rows: rows.slice(0, limit).map((r) => ({ ...r, held: held[r.word]?.shares || 0, spark: series(this.profile(r.word), t - DAY, t, 25).map((x) => x[1]) })),
      news,
      sectors: SECTORS.map((s) => ({ ...s, index: sectorIndex(s.id, t), day: sectorIndex(s.id, t) / sectorIndex(s.id, t - DAY) - 1 }))
    }
  }

  portfolio () {
    this.derivs?.sync()
    const m = this.economy.s.market
    const t = this.now()
    const rows = Object.entries(m.holdings).filter(([, h]) => h.shares > 0).map(([word, h]) => {
      const q = this.quote(word, t)
      const value = q ? h.shares * q.sell : 0
      return { word, shares: h.shares, cost: h.cost, value, gain: value - h.cost, pct: h.cost ? value / h.cost - 1 : 0, quote: q }
    }).sort((a, b) => b.value - a.value)
    const value = rows.reduce((a, r) => a + r.value, 0)
    return { rows, value, ...this.stats(value) }
  }

  // Your record as a trader: what friends see on your profile.
  stats (value = null) {
    const m = this.economy.s.market
    if (value === null) value = Object.entries(m.holdings).reduce((a, [w, h]) => { const q = this.quote(w); return a + (q ? h.shares * q.sell : 0) }, 0)
    const shares = value
    const derivs = this.derivs ? this.derivs.value() : 0
    value += derivs
    const gain = value + m.proceeds - m.spent
    return { spent: m.spent, proceeds: m.proceeds, value, shares, derivs, gain, returnPct: m.spent ? gain / m.spent : 0, trades: m.trades, best: m.best, worst: m.worst }
  }

  // coins: how much to spend (fractional shares are fine).
  buy (word, coins) {
    if (this.store.rating(word) === null) throw new Error('Rate a word before you can trade it.')
    const q = this.quote(word)
    if (!q) throw new Error('That word isn’t listed.')
    return this.economy.marketBuy(word, Number(coins), q.buy)
  }

  // shares: how many to sell ('all' for everything).
  sell (word, shares) {
    const q = this.quote(word)
    if (!q) throw new Error('That word isn’t listed.')
    const held = this.economy.s.market.holdings[word]?.shares || 0
    return this.economy.marketSell(word, shares === 'all' ? held : Number(shares), q.sell)
  }
}
