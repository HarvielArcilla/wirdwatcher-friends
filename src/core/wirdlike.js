// Wirdlike on this computer: what you've done across runs, the run you left
// mid-way, starting a run (its pool of items comes from the words you've
// rated) and what finishing one earns: coins for bosses, characters,
// badges and looks you can only get down there.
//
// Kept inside economy.json as s.wirdlike, so it lasts through publishing.
// The run itself is played in the window (src/shared/wirdlike/engine.js);
// this side keeps score.

import crypto from 'node:crypto'
import { WL_GOALS, WIRDLIKE_COSMETICS, CHARACTERS, MIN_RATED, POOL_SIZE, blankProgress, NAMED_BOSSES, FLOORS } from '../shared/wirdlike/content.js'
import { itemFor, sampleWords } from '../shared/wirdlike/items.js'
import { baseCps } from '../shared/economy.js'

const MAX_SAVE = 4e6

export class Wirdlike {
  // rated(): [{ word, r }]. lookup(word): what the dictionary says.
  // award(xp, counters): XP and badge counters (the game's).
  constructor ({ economy, rated, lookup, award = () => null }) {
    this.economy = economy
    this.rated = rated
    this.lookup = lookup
    this.award = award
    const s = economy.s.wirdlike || {}
    economy.s.wirdlike = { run: null, n: 0, ...s, progress: { ...blankProgress(), ...(s.progress || {}) } }
  }

  get s () { return this.economy.s.wirdlike }
  get p () { return this.s.progress }

  view () {
    const p = this.p
    const rated = this.rated().length
    const goals = Object.entries(WL_GOALS).filter(([id]) => !id.startsWith('char-')).map(([id, g]) => ({ id, text: g.text, done: Boolean(g.test(p)) }))
    return {
      rated, need: MIN_RATED, canPlay: rated >= MIN_RATED,
      run: this.s.run ? { char: this.s.run.char, fi: this.s.run.fi, floor: FLOORS[this.s.run.fi]?.name, t: this.s.run.t } : null,
      chars: CHARACTERS.map((c) => ({ id: c.id, name: c.name, glyph: c.glyph, color: c.color, blurb: c.blurb, hp: c.hp, soul: c.soul, stats: c.stats, unlocked: Boolean(p.chars[c.id]), unlock: c.unlock ? WL_GOALS[c.unlock].text : null, marks: p.marks[c.id] || {} })),
      progress: {
        runs: p.runs, deaths: p.deaths, wins: p.wins, deepWins: p.deepWins, bossKills: p.bossKills, deepest: p.deepest, bestTime: p.bestTime, winStreak: p.winStreak, bestStreak: p.bestStreak, kills: p.kills,
        bosses: NAMED_BOSSES.map((b) => ({ id: b, beaten: p.bosses[b] || 0 })), sins: { ...p.sins }, transforms: { ...p.transforms }, items: Object.keys(p.itemsFound).length
      },
      goals,
      looks: WIRDLIKE_COSMETICS.map((c) => ({ kind: c.kind, id: c.id, name: c.name, goal: WL_GOALS[c.wl].text, have: this.economy.s.owned.includes(`${c.kind}:${c.id}`) })),
      deep: p.wins >= 1
    }
  }

  // A new run: the words it can draw from, and its seed.
  start (charId = 'wirdo', seedText = '') {
    if (!this.p.chars[charId]) throw new Error('You haven’t unlocked that character yet.')
    const ratings = this.rated()
    if (ratings.length < MIN_RATED) throw new Error(`Rate at least ${MIN_RATED} words first: they’re what you find down there.`)
    const seed = String(seedText || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || crypto.randomBytes(4).toString('hex').toUpperCase()
    const pool = []
    for (const { word, r } of sampleWords(ratings, seed, POOL_SIZE)) {
      const info = this.lookup(word)
      if (info) pool.push(itemFor(word, info, r))
    }
    this.s.run = null
    this.p.runs++
    this.s.n++
    const looks = this._grant()
    this.economy.dirty = true
    this.economy.save(true)
    this.award([], {})
    return { seed, pool, deep: this.p.wins >= 1, char: charId, looks }
  }

  // The run as it stands (saved at every door, and when you stop).
  save (data) {
    if (!data || typeof data !== 'object') return false
    const size = JSON.stringify(data).length
    if (size > MAX_SAVE) return false
    this.s.run = data
    this.economy.dirty = true
    return true
  }

  resume () { return this.s.run }

  abandon () { this.s.run = null; this.economy.dirty = true }

  // A run ended (a death, a win). summary: what happened in it, from the
  // window. Returns what it earned.
  end (summary = {}) {
    const p = this.p
    const before = new Set(this.economy.s.owned)
    const chars = new Set(Object.keys(p.chars))
    const won = Boolean(summary.won)
    const deep = Boolean(summary.deep)
    const bosses = Array.isArray(summary.bosses) ? summary.bosses.filter((b) => NAMED_BOSSES.includes(b)) : []
    const sins = Array.isArray(summary.sins) ? summary.sins.filter((x) => typeof x === 'string').slice(0, 20) : []
    for (const b of bosses) p.bosses[b] = (p.bosses[b] || 0) + 1
    for (const x of sins) p.sins[x] = (p.sins[x] || 0) + 1
    p.bossKills += bosses.length
    p.deepest = Math.max(p.deepest, Math.max(0, Math.min(9, Number(summary.deepest) || 0)))
    p.bangsUsed += Math.max(0, Math.min(999, Number(summary.bangsUsed) || 0))
    p.kills += Math.max(0, Math.min(1e5, Number(summary.kills) || 0))
    p.rooms += Math.max(0, Math.min(1e4, Number(summary.rooms) || 0))
    p.noHitBosses += Math.max(0, Math.min(20, Number(summary.noHitBosses) || 0))
    for (const w of (Array.isArray(summary.found) ? summary.found : []).slice(0, 2000)) if (typeof w === 'string') p.itemsFound[w] = true
    for (const t of (Array.isArray(summary.transforms) ? summary.transforms : []).slice(0, 20)) if (typeof t === 'string') p.transforms[t] = (p.transforms[t] || 0) + 1
    const char = typeof summary.char === 'string' && p.chars[summary.char] ? summary.char : 'wirdo'
    if (won) {
      p.wins++
      if (deep) p.deepWins++
      p.marks[char] = { ...(p.marks[char] || {}), redpen: true, ...(deep ? { autocorrect: true } : {}) }
      p.winStreak++
      p.bestStreak = Math.max(p.bestStreak, p.winStreak)
      const t = Number(summary.t) || 0
      if (t > 0 && (p.bestTime === null || t < p.bestTime)) p.bestTime = Math.round(t)
    } else { p.deaths++; p.winStreak = 0 }
    // Coins: each boss pays about a minute of your wirdhouse (at least a
    // little), more the deeper it was; winning pays ten minutes' worth.
    const minute = Math.max(250, baseCps(this.economy.s) * 60)
    let coins = 0
    bosses.forEach((b, i) => { coins += minute * (1 + i * 0.35) })
    coins += sins.length * minute * 0.4
    if (won) coins += minute * (deep ? 20 : 10)
    coins = Math.round(coins)
    if (coins > 0) this.economy._earn(coins, 'wirdlike')
    this.s.run = null
    const looks = this._grant()
    const newChars = Object.keys(p.chars).filter((c) => !chars.has(c)).map((id) => CHARACTERS.find((c) => c.id === id)?.name)
    const xp = [
      ...(bosses.length ? [{ amount: bosses.length * 25, why: `${bosses.length} boss${bosses.length === 1 ? '' : 'es'} beaten` }] : []),
      ...(won ? [{ amount: deep ? 400 : 150, why: deep ? 'Beat Autocorrect' : 'Beat The Red Pen' }] : [])
    ]
    const res = this.award(xp, {})
    this.economy.dirty = true
    this.economy.save(true)
    this.economy.emit('changed')
    this.economy.emit('look')
    return { coins, newChars, looks: looks.filter((l) => !before.has(`${l.kind}:${l.id}`)), badges: res?.badges || [], xp: xp.reduce((a, x) => a + x.amount, 0), progress: this.view().progress }
  }

  // Characters and looks whose goals are met.
  _grant () {
    const p = this.p
    for (const c of CHARACTERS) if (!p.chars[c.id] && c.unlock && WL_GOALS[c.unlock].test(p)) p.chars[c.id] = true
    const owned = this.economy.s.owned
    const got = []
    for (const c of WIRDLIKE_COSMETICS) {
      const key = `${c.kind}:${c.id}`
      if (owned.includes(key) || !WL_GOALS[c.wl].test(p)) continue
      owned.push(key)
      got.push({ kind: c.kind, id: c.id, name: c.name })
    }
    return got
  }

  // Numbers for badges (see WIRDLIKE_BADGES).
  badgeStats () {
    const p = this.p
    return {
      wlRuns: p.runs, wlBossKills: p.bossKills, wlDeepest: p.deepest, wlWins: p.wins, wlDeepWins: p.deepWins,
      wlAllBosses: NAMED_BOSSES.every((b) => p.bosses[b]) ? 1 : 0, wlTransforms: Object.keys(p.transforms).length,
      wlItems: Object.keys(p.itemsFound).length, wlChars: Object.keys(p.chars).length, wlNoHit: p.noHitBosses
    }
  }
}
