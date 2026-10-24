// Catchword on this computer: coining words from the ones you've rated,
// the game you left mid-way, and what finishing one earns. Kept in
// economy.json as s.catchword, so it lasts through publishing. The game is
// played in the window (src/shared/catchword/sim.js); this side keeps score.

import crypto from 'node:crypto'
import { CW_GOALS, CATCHWORD_COSMETICS, blankProgress, MIN_RATED_CW } from '../shared/catchword/content.js'
import { newGame, restore, blend, cleanWord, validWord, totals, DIFFICULTIES } from '../shared/catchword/sim.js'
import { REGIONS } from '../shared/catchword/regions.js'
import { baseCps } from '../shared/economy.js'

const MAX_SAVE = 400000

export class Catchword {
  constructor ({ economy, rated, award = () => null }) {
    this.economy = economy
    this.rated = rated
    this.award = award
    const s = economy.s.catchword || {}
    economy.s.catchword = { run: null, runId: null, n: 0, ...s, progress: { ...blankProgress(), ...(s.progress || {}) } }
  }

  get s () { return this.economy.s.catchword }
  get p () { return this.s.progress }

  view () {
    const p = this.p
    const rated = this.rated().length
    const run = this.s.run
    return {
      rated, need: MIN_RATED_CW, canPlay: rated >= MIN_RATED_CW,
      run: run ? { word: run.word, day: run.day, difficulty: run.difficulty } : null,
      progress: { games: p.games, wins: p.wins, byDiff: { ...p.byDiff }, fastest: p.fastest, best: p.best, words: p.words.slice() },
      goals: Object.entries(CW_GOALS).map(([id, g]) => ({ id, text: g.text, done: Boolean(g.test(p)) })),
      looks: CATCHWORD_COSMETICS.map((c) => ({ kind: c.kind, id: c.id, name: c.name, goal: CW_GOALS[c.cw].text, have: this.economy.s.owned.includes(`${c.kind}:${c.id}`) }))
    }
  }

  // Three new words, each a blend of two you've rated (the better you rated
  // them, the likelier they're picked).
  coin (n = 3) {
    const list = this.rated().filter((x) => /^[a-z]{3,}$/i.test(x.word))
    if (list.length < 2) return []
    const out = []
    const seen = new Set()
    const pick = () => {
      const w = list.map((x) => 0.3 + Math.max(0, x.r))
      let r = Math.random() * w.reduce((a, b) => a + b, 0)
      for (let i = 0; i < list.length; i++) if ((r -= w[i]) < 0) return list[i]
      return list[0]
    }
    for (let tries = 0; out.length < n && tries < 60; tries++) {
      const a = pick()
      const b = pick()
      if (a.word === b.word) continue
      const word = blend(a.word, b.word)
      if (!validWord(word) || seen.has(word) || word === a.word.toLowerCase() || word === b.word.toLowerCase()) continue
      seen.add(word)
      out.push({ word, from: [a.word, b.word], r: Math.round(((a.r + b.r) / 2) * 10) / 10 })
    }
    return out
  }

  // A new game. from: the two rated words it was blended from, if any: a
  // word from words you rated highly starts a little catchier.
  start ({ word, from = [], start, difficulty = 'normal' } = {}) {
    if (this.rated().length < MIN_RATED_CW) throw new Error(`Rate at least ${MIN_RATED_CW} words first: your new words are made from them.`)
    word = cleanWord(word)
    if (!validWord(word)) throw new Error('A word needs 3 to 14 letters.')
    if (!REGIONS.some((r) => r.id === start)) throw new Error('Pick where it starts.')
    if (!DIFFICULTIES[difficulty]) difficulty = 'normal'
    const mine = new Map(this.rated().map((x) => [x.word.toLowerCase(), x.r]))
    const rs = (Array.isArray(from) ? from : []).slice(0, 2).map((w) => mine.get(String(w).toLowerCase())).filter((r) => typeof r === 'number')
    const bonus = rs.length === 2 ? Math.max(-0.02, Math.min(0.02, ((rs[0] + rs[1]) / 2 - 2.5) * 0.008)) : 0
    const id = crypto.randomBytes(6).toString('hex')
    const g = newGame({ word, start, difficulty, seed: id, bonus })
    g.id = id
    this.s.run = g
    this.s.runId = id
    this.s.n++
    this.p.games++
    const looks = this._grant()
    this.economy.dirty = true
    this.economy.save(true)
    this.award([], {})
    return { game: g, looks }
  }

  save (data) {
    if (!data || typeof data !== 'object' || data.id !== this.s.runId) return false
    if (JSON.stringify(data).length > MAX_SAVE) return false
    const g = restore(data)
    if (!g) return false
    this.s.run = g
    this.economy.dirty = true
    return true
  }

  resume () { return this.s.run }

  abandon () { this.s.run = null; this.s.runId = null; this.economy.dirty = true }

  // A game ended: what it earned. Only the game that was started here, once.
  end (data) {
    const g = data && data.id && data.id === this.s.runId ? restore(data) : null
    if (!g || !g.over) throw new Error('That game isn’t finished.')
    const p = this.p
    const before = new Set(this.economy.s.owned)
    const won = Boolean(g.over.won)
    const tot = totals(g)
    const absorbed = Math.max(0, Math.min(1, tot.a / tot.world))
    const reachedAll = Object.values(g.regions).every((z) => z.seen)
    if (reachedAll) p.allRegions++
    p.best = Math.max(p.best, absorbed)
    if (won) {
      p.wins++
      p.byDiff[g.difficulty] = (p.byDiff[g.difficulty] || 0) + 1
      if (p.fastest === null || g.day < p.fastest) p.fastest = g.day
      p.starts[g.start] = true
      if (g.ruled) p.beatRuling++
      if ((g.stats?.peakResearch || 0) < 25) p.quietWins++
    }
    p.words.unshift({ word: g.word, won, day: g.day, difficulty: g.difficulty, absorbed: Math.round(absorbed * 1000) / 1000, start: g.start })
    p.words = p.words.slice(0, 12)
    // Coins: a win pays about twelve minutes of your wirdhouse (more on
    // harder settings); a loss pays for how far it got.
    const pay = DIFFICULTIES[g.difficulty].pay
    const minute = Math.max(250, baseCps(this.economy.s) * 60)
    const coins = Math.round(won ? minute * 12 * pay : minute * 4 * absorbed * pay)
    if (coins > 0) this.economy._earn(coins, 'catchword')
    this.s.run = null
    this.s.runId = null
    const looks = this._grant()
    const xp = won ? [{ amount: Math.round(120 * pay), why: `“${g.word}” went global` }] : absorbed > 0.05 ? [{ amount: 20, why: `“${g.word}” caught on` }] : []
    const res = this.award(xp, {})
    this.economy.dirty = true
    this.economy.save(true)
    this.economy.emit('changed')
    this.economy.emit('look')
    return { coins, won, looks: looks.filter((l) => !before.has(`${l.kind}:${l.id}`)), badges: res?.badges || [], xp: xp.reduce((a, x) => a + x.amount, 0) }
  }

  _grant () {
    const owned = this.economy.s.owned
    const got = []
    for (const c of CATCHWORD_COSMETICS) {
      const key = `${c.kind}:${c.id}`
      if (owned.includes(key) || !CW_GOALS[c.cw].test(this.p)) continue
      owned.push(key)
      got.push({ kind: c.kind, id: c.id, name: c.name })
    }
    return got
  }

  badgeStats () {
    const p = this.p
    return { cwGames: p.games, cwWins: p.wins, cwBrutal: p.byDiff.brutal || 0, cwFast: p.fastest !== null && p.fastest <= 250 ? 1 : 0, cwSurvive: p.beatRuling, cwAllRegions: p.allRegions }
  }
}
