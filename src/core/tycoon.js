// Wird Tycoon on this computer: the company you're running, what it's
// earned you, and your record across companies. Kept in economy.json as
// s.tycoon, so it lasts through publishing an edition. The weeks themselves
// pass in the window (src/shared/tycoon/sim.js); each save pays for books
// published since the last one, once.

import crypto from 'node:crypto'
import { LX_GOALS, TYCOON_COSMETICS, blankProgress, SIZES } from '../shared/tycoon/content.js'
import { newCompany, restore } from '../shared/tycoon/sim.js'
import { baseCps } from '../shared/economy.js'

const MAX_SAVE = 600000

export class Tycoon {
  constructor ({ economy, rated, name = () => 'You', award = () => null }) {
    this.economy = economy
    this.rated = rated
    this.name = name
    this.award = award
    const s = economy.s.tycoon || {}
    economy.s.tycoon = { run: null, runId: null, paid: 0, ...s, progress: { ...blankProgress(), ...(s.progress || {}) } }
  }

  get s () { return this.economy.s.tycoon }
  get p () { return this.s.progress }

  view () {
    const p = this.p
    const run = this.s.run
    return {
      run: run ? { name: run.name, week: run.week, cash: run.cash, books: run.stats?.books || 0 } : null,
      progress: { companies: p.companies, books: p.books, best: p.best, tens: p.tens, cashPeak: p.cashPeak, bestseller: p.bestseller, history: p.history.slice() },
      goals: Object.entries(LX_GOALS).map(([id, g]) => ({ id, text: g.text, done: Boolean(g.test(p)) })),
      looks: TYCOON_COSMETICS.map((c) => ({ kind: c.kind, id: c.id, name: c.name, goal: LX_GOALS[c.lx].text, have: this.economy.s.owned.includes(`${c.kind}:${c.id}`) }))
    }
  }

  start ({ name } = {}) {
    const id = crypto.randomBytes(6).toString('hex')
    const words = this.rated().map((x) => x.word)
    for (let i = words.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [words[i], words[j]] = [words[j], words[i]] }
    const g = newCompany({ name: String(name || '').trim() || 'Wird & Co.', founder: this.name() || 'You', words: words.slice(0, 80), seed: id })
    g.id = id
    this.s.run = g
    this.s.runId = id
    this.s.paid = 0
    this.p.companies++
    this.economy.dirty = true
    this.economy.save(true)
    return g
  }

  // The company as it stands. Pays for any books published since the last
  // save, and notes your records. Returns what it earned this time.
  save (data) {
    if (!data || typeof data !== 'object' || data.id !== this.s.runId) return null
    if (JSON.stringify(data).length > MAX_SAVE) return null
    const g = restore(data)
    if (!g) return null
    this.s.run = g
    const before = new Set(this.economy.s.owned)
    const fresh = (g.books || []).filter((b) => b.id > this.s.paid).slice(0, 10)
    let coins = 0
    const minute = Math.max(250, baseCps(this.economy.s) * 60)
    for (const b of fresh) {
      const score = Math.max(1, Math.min(10, Number(b.score) || 1))
      const size = Math.max(0, SIZES.findIndex((z) => z.id === b.size))
      coins += minute * 0.3 * Math.pow(score / 10, 2) * [1, 1.6, 2.4, 3.5][size]
      this.p.books++
      this.p.best = Math.max(this.p.best, score)
      if (score >= 9.95) this.p.tens++
    }
    if (fresh.length) this.s.paid = Math.max(...fresh.map((b) => b.id))
    const st = g.stats || {}
    this.p.office = Math.max(this.p.office, Math.min(3, Number(g.office) || 0))
    this.p.cashPeak = Math.max(this.p.cashPeak, Math.min(1e12, Number(st.cashPeak) || 0))
    this.p.bestseller = Math.max(this.p.bestseller, Math.min(1e9, Number(st.bestseller) || 0))
    for (const m of Object.keys(st.media || {}).slice(0, 12)) this.p.media[m] = true
    coins = Math.round(coins)
    if (coins > 0) this.economy._earn(coins, 'tycoon')
    const looks = this._grant().filter((l) => !before.has(`${l.kind}:${l.id}`))
    let badges = []
    if (fresh.length) {
      const res = this.award(fresh.map((b) => ({ amount: Math.round(10 + b.score * 4), why: `“${b.title}” published` })), {})
      badges = res?.badges || []
    }
    this.economy.dirty = true
    if (fresh.length) { this.economy.save(true); this.economy.emit('changed'); this.economy.emit('look') }
    return { coins, looks, badges }
  }

  resume () { return this.s.run }

  abandon () { this.s.run = null; this.s.runId = null; this.economy.dirty = true }

  // The company closed: retired in 2030 (a pension), or went bust.
  end (data) {
    if (!data || data.id !== this.s.runId || !data.over) throw new Error('That company is still trading.')
    const paid = this.save(data) || { coins: 0, looks: [], badges: [] }
    const g = this.s.run
    const retired = g.over.why === 'retired'
    if (retired) this.p.retired++
    const minute = Math.max(250, baseCps(this.economy.s) * 60)
    const pension = retired ? Math.round(minute * 10) : 0
    if (pension) this.economy._earn(pension, 'tycoon')
    this.p.history.unshift({ name: g.name, year: 1985 + Math.floor(g.week / 52), retired, books: g.stats?.books || 0, best: g.stats?.bestScore || 0, cash: Math.round(g.cash) })
    this.p.history = this.p.history.slice(0, 10)
    this.s.run = null
    this.s.runId = null
    const looks = [...paid.looks, ...this._grant()]
    const res = retired ? this.award([{ amount: 300, why: `${g.name} made it to 2030` }], {}) : null
    this.economy.dirty = true
    this.economy.save(true)
    this.economy.emit('changed')
    this.economy.emit('look')
    return { coins: paid.coins + pension, pension, looks, badges: [...paid.badges, ...(res?.badges || [])], retired }
  }

  _grant () {
    const owned = this.economy.s.owned
    const got = []
    for (const c of TYCOON_COSMETICS) {
      const key = `${c.kind}:${c.id}`
      if (owned.includes(key) || !LX_GOALS[c.lx].test(this.p)) continue
      owned.push(key)
      got.push({ kind: c.kind, id: c.id, name: c.name })
    }
    return got
  }

  badgeStats () {
    const p = this.p
    return { lxBooks: p.books, lxBest: p.best, lxOffice: p.office, lxCash: p.cashPeak, lxBestseller: p.bestseller, lxRetired: p.retired }
  }
}
