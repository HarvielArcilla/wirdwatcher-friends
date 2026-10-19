// Coins: the wirdhouse, prestige, the coinflip and the shop. Kept in
// economy.json in the data folder, on this computer only. Friends see only
// what you're wearing (your look) and your edition number.
//
// Coins come from rating words you haven't rated before (the same for any
// score), from lobby rounds, and from the wirdhouse, which works every
// second the app is open and, more slowly, while it's closed. See
// src/shared/economy.js for the numbers.

import crypto from 'node:crypto'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { readJson, writeJson } from './files.js'
import {
  BUILDINGS, UPGRADES, PERKS, buildingCost, maxAffordable, effects, baseCps, buildingCps, cpsNow,
  wordPay, nextStreak, streakNow, lobbyPay, offlinePay, upgradeList, inkGain, inkTotalFor, INK_BONUS, INK_PER
} from '../shared/economy.js'
import { COSMETICS, KINDS, DEFAULT_LOOK, cosmetic, PUBLIC_KINDS } from '../shared/cosmetics.js'
import { balanced, validStake } from '../shared/stakes.js'

const SAVE_EVERY_MS = 15000
const TICK_MS = 1000
const ASLEEP_MS = 30000 // a gap this long between ticks means the computer slept: count it as time away
export const SAME_LIMIT = 5 // this many of the same score in a row ends the pace streak

const blank = (now) => ({
  v: 1,
  coins: 0,
  runCoins: 0, // earned this edition
  allCoins: 0, // earned ever (coinflip winnings don't count)
  buildings: {},
  upgrades: [],
  edition: 0,
  ink: 0, // unspent
  inkTotal: 0, // earned ever; each one is +2% forever
  perks: {},
  streak: { n: 0, last: 0 },
  museUntil: 0,
  lastTick: now,
  lastWordDay: null,
  paid: [], // words that have already paid out
  stats: { words: 0, lobbyRounds: 0, friendsSeen: 0, offline: 0, bestStreak: 0 },
  flips: { count: 0, wins: 0, streak: 0, bestStreak: 0, worstStreak: 0, biggestWin: 0, biggestLoss: 0, net: 0 },
  owned: [],
  look: { ...DEFAULT_LOOK },
  escrow: {}, // lobby stakes in play: key -> { amount, host, state: 'held' | 'committed', at }
  stakes: { games: 0, won: 0, lost: 0, net: 0, biggestPot: 0 }
})

const localDay = (t) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` }

export class Economy extends EventEmitter {
  // now(): milliseconds. friendsOnline(): how many friends are online.
  constructor ({ dir, now = () => Date.now(), friendsOnline = () => 0, hasBadge = () => false, level = () => 1, dev = false }) {
    super()
    this.file = path.join(dir, 'economy.json')
    this.now = now
    this.friendsOnline = friendsOnline
    this.hasBadge = hasBadge
    this.level = level
    this.dev = dev
    const saved = readJson(this.file, null)
    this.s = { ...blank(now()), ...(saved || {}) }
    for (const k of ['stats', 'flips', 'stakes']) this.s[k] = { ...blank(0)[k], ...(saved?.[k] || {}) }
    this.s.escrow = { ...(saved?.escrow || {}) }
    this.s.look = { ...DEFAULT_LOOK, ...(saved?.look || {}) }
    this.paid = new Set(this.s.paid)
    this.dirty = false
    this.away = null
  }

  // Counts the time away, then ticks every second.
  start () {
    const t = this.now()
    const away = t - (this.s.lastTick || t)
    if (away > ASLEEP_MS) this._awayFor(away)
    this.s.lastTick = t
    if (this.dev) this.devUnlockAll(false)
    this.settleOrphanStakes()
    this._timer = setInterval(() => this.tick(), TICK_MS)
    this._timer.unref?.()
    this._saver = setInterval(() => this.save(), SAVE_EVERY_MS)
    this._saver.unref?.()
    return this
  }

  stop () {
    clearInterval(this._timer)
    clearInterval(this._saver)
    this.tick()
    this.save(true)
  }

  save (force = false) {
    if (!this.dirty && !force) return
    this.s.paid = [...this.paid]
    writeJson(this.file, this.s)
    this.dirty = false
  }

  _earn (coins) {
    if (!(coins > 0)) return 0
    this.s.coins += coins
    this.s.runCoins += coins
    this.s.allCoins += coins
    this.dirty = true
    return coins
  }

  _awayFor (ms) {
    const pay = offlinePay(this.s, ms)
    if (pay.coins > 0) {
      this._earn(pay.coins)
      this.s.stats.offline += pay.coins
      this.away = { ...pay, ms }
    }
  }

  // One second of the wirdhouse (or however long it's been).
  tick (t = this.now()) {
    const dt = t - (this.s.lastTick || t)
    if (dt <= 0) return
    if (dt > ASLEEP_MS) this._awayFor(dt)
    else {
      const friends = this.friendsOnline()
      if (friends > 0 && !this.s.stats.friendsSeen) this.s.stats.friendsSeen = 1
      this._earn(cpsNow(this.s, { now: t, friendsOnline: friends }) * dt / 1000)
    }
    this.s.lastTick = t
    this.emit('tick', this.compact(t))
  }

  // Taking the time it was away, once, for the window to show.
  takeAway () { const a = this.away; this.away = null; return a }

  // --- earning --------------------------------------------------------------------

  // A word was rated. Only the first time a word is ever rated pays, and what
  // the rating was never matters.
  //
  // Giving the same score SAME_LIMIT times running ends the pace streak (and
  // that word pays without it): the streak is for rating, not for holding a
  // key down.
  onWord (word, { fresh, r = null }) {
    if (!fresh || this.paid.has(word)) return null
    const t = this.now()
    this.tick(t)
    const day = localDay(t)
    const firstToday = this.s.lastWordDay !== day
    const fx = effects(this.s)
    const same = r !== null && this.s.same?.r === r ? this.s.same.n + 1 : 1
    this.s.same = { r, n: same }
    const spam = same >= SAME_LIMIT
    const pay = wordPay(this.s, { word, now: t, firstToday }, fx)
    if (spam) { pay.coins /= pay.streak.mult; pay.streak = { n: 0, mult: 1 } }
    this.paid.add(word)
    this.s.lastWordDay = day
    this.s.streak = spam ? { n: 0, last: 0 } : { n: pay.streak.n, last: t }
    this.s.stats.bestStreak = Math.max(this.s.stats.bestStreak, pay.streak.n)
    if (fx.museSecs) this.s.museUntil = t + fx.museSecs * 1000
    this.s.stats.words++
    this._earn(pay.coins)
    this.emit('changed')
    return { coins: pay.coins, streak: { n: pay.streak.n, mult: pay.streak.mult }, same: { r, n: same }, broke: spam, firstToday: pay.firstToday, muse: fx.museSecs ? { mult: fx.museMult, until: this.s.museUntil } : null }
  }

  onLobbyRound ({ hosting = false } = {}) {
    this.tick()
    const coins = lobbyPay(this.s, { hosting })
    this.s.stats.lobbyRounds++
    this._earn(coins)
    this.emit('changed')
    return coins
  }

  // --- spending -------------------------------------------------------------------

  _spend (cost) {
    this.tick()
    if (!(cost >= 0) || this.s.coins + 1e-6 < cost) throw new Error('Not enough coins.')
    this.s.coins = Math.max(0, this.s.coins - cost)
    this.dirty = true
  }

  buyBuilding (id, count = 1) {
    const b = BUILDINGS.find((x) => x.id === id)
    if (!b) throw new Error('No such building.')
    const owned = this.s.buildings[id] || 0
    this.tick()
    const n = count === 'max' ? maxAffordable(b, owned, this.s.coins) : Math.max(1, Math.min(1000, Math.floor(Number(count) || 1)))
    if (!n) throw new Error('Not enough coins.')
    this._spend(buildingCost(b, owned, n))
    this.s.buildings[id] = owned + n
    this.emit('changed')
    return this.view()
  }

  buyUpgrade (id) {
    const u = UPGRADES.find((x) => x.id === id)
    if (!u) throw new Error('No such upgrade.')
    if (this.s.upgrades.includes(id)) throw new Error('You already have that.')
    if (!u.req(this.s)) throw new Error(`Not yet: ${u.hint.toLowerCase()}.`)
    this._spend(u.cost)
    this.s.upgrades.push(id)
    this.emit('changed')
    return this.view()
  }

  // Publishing your dictionary: the wirdhouse starts over, and you keep ink.
  prestige () {
    const gain = inkGain(this.s)
    if (gain < 1) throw new Error('Not enough to publish yet. Keep earning.')
    this.tick()
    const s = this.s
    s.edition++
    s.inkTotal += gain
    s.ink += gain
    const head = s.perks.headstart || 0
    const seed = s.perks.seed || 0
    s.coins = [0, 1e3, 1e4, 1e5, 1e6, 1e7][seed]
    s.runCoins = 0
    s.buildings = { pencil: [0, 5, 15, 30, 50, 100][head], notebook: [0, 0, 5, 10, 25, 50][head] }
    s.upgrades = s.perks.momentum ? ['streak-1', 'streak-2'] : []
    s.streak = { n: 0, last: 0 }
    s.museUntil = 0
    // Each edition can bring something only editions bring.
    const earned = COSMETICS.filter((c) => c.edition && c.edition <= s.edition && !s.owned.includes(`${c.kind}:${c.id}`))
    for (const c of earned) s.owned.push(`${c.kind}:${c.id}`)
    this.dirty = true
    this.save(true)
    this.emit('changed')
    this.emit('look')
    return { edition: s.edition, gain, unlocked: earned.map((c) => ({ kind: c.kind, id: c.id, name: c.name })) }
  }

  buyPerk (id) {
    const p = PERKS.find((x) => x.id === id)
    if (!p) throw new Error('No such perk.')
    const level = this.s.perks[id] || 0
    if (level >= p.max) throw new Error('That’s as far as it goes.')
    const cost = p.cost(level)
    if (this.s.ink < cost) throw new Error('Not enough ink.')
    this.s.ink -= cost
    this.s.perks[id] = level + 1
    this.dirty = true
    this.emit('changed')
    return this.view()
  }

  // Heads or tails, for no reason at all. Winnings aren't "earned", so they
  // don't count toward ink.
  flip (stake, call = 'heads') {
    this.tick()
    const amount = Math.floor(Number(stake))
    if (!(amount >= 1)) throw new Error('Bet at least 1 coin.')
    if (amount > Math.floor(this.s.coins)) throw new Error('You don’t have that many coins.')
    const side = crypto.randomInt(2) ? 'heads' : 'tails'
    const win = side === (call === 'tails' ? 'tails' : 'heads')
    const f = this.s.flips
    f.count++
    if (win) {
      this.s.coins += amount
      f.wins++
      f.net += amount
      f.streak = f.streak > 0 ? f.streak + 1 : 1
      f.bestStreak = Math.max(f.bestStreak, f.streak)
      f.biggestWin = Math.max(f.biggestWin, amount)
    } else {
      this.s.coins -= amount
      f.net -= amount
      f.streak = f.streak < 0 ? f.streak - 1 : -1
      f.worstStreak = Math.min(f.worstStreak, f.streak)
      f.biggestLoss = Math.max(f.biggestLoss, amount)
    }
    this.dirty = true
    this.emit('changed')
    return { win, side, stake: amount, coins: this.s.coins, flips: { ...f } }
  }

  // --- lobby stakes -------------------------------------------------------------
  //
  // See src/shared/stakes.js for the rules. Every change here is saved to
  // disk before it returns, and each step can be repeated safely: holding a
  // key twice takes the coins once, and a payout is credited only by using
  // up a committed escrow record, so it can't land twice.

  holdStake (key, amount, host) {
    key = String(key)
    const rec = this.s.escrow[key]
    if (rec) return rec.amount === amount // already held (a repeated ask)
    if (!validStake(amount) || amount > Math.floor(this.s.coins)) return false
    this.tick()
    if (amount > Math.floor(this.s.coins)) return false
    this.s.coins -= amount
    this.s.escrow[key] = { amount, host: String(host || ''), state: 'held', at: this.now() }
    this._stakeSaved()
    return true
  }

  // The game ended and we saw the result: we'll never take this stake back.
  commitStake (key) {
    const rec = this.s.escrow[key]
    if (!rec) return false
    if (rec.state !== 'committed') { rec.state = 'committed'; this._stakeSaved() }
    return true
  }

  // Our share of a pot. Only from a committed record, only if the payouts
  // add up, only once. Returns what was credited, or null if refused.
  settleStake (key, { stake, payouts, me }) {
    const rec = this.s.escrow[key]
    if (!rec || rec.state !== 'committed') return null
    if (stake !== rec.amount || !balanced(stake, payouts) || !(me in payouts)) return null
    const won = payouts[me]
    delete this.s.escrow[key]
    this.s.coins += won // a payout isn't earning: it doesn't count toward ink
    const st = this.s.stakes
    st.games++
    st.net += won - stake
    if (won > stake) st.won++
    if (won < stake) st.lost++
    st.biggestPot = Math.max(st.biggestPot, stake * Object.keys(payouts).length)
    this._stakeSaved()
    return won
  }

  // A stake that was never promised comes back. A promised one can't.
  refundStake (key) {
    const rec = this.s.escrow[key]
    if (!rec || rec.state !== 'held') return 0
    delete this.s.escrow[key]
    this.s.coins += rec.amount
    this._stakeSaved()
    return rec.amount
  }

  // Leaving a game on purpose: the stake goes to the pot.
  forfeitStake (key) {
    const rec = this.s.escrow[key]
    if (!rec) return 0
    delete this.s.escrow[key]
    this.s.stakes.games++
    this.s.stakes.lost++
    this.s.stakes.net -= rec.amount
    this._stakeSaved()
    return rec.amount
  }

  // A promised stake whose payout never came (the app or the connection died
  // in between): gone, rather than risk paying it twice.
  dropStake (key) {
    const rec = this.s.escrow[key]
    if (!rec || rec.state !== 'committed') return 0
    return this.forfeitStake(key)
  }

  stakesWith (host) { return Object.entries(this.s.escrow).filter(([, r]) => r.host === host) }
  stakedNow () { return Object.values(this.s.escrow).reduce((a, r) => a + r.amount, 0) }

  // At startup no lobby is open, so nothing in escrow can still be settled:
  // unpromised stakes come back, promised ones are gone.
  settleOrphanStakes () {
    for (const [key, rec] of Object.entries(this.s.escrow)) {
      if (rec.state === 'held') this.refundStake(key)
      else this.dropStake(key)
    }
  }

  _stakeSaved () {
    this.dirty = true
    this.save(true)
    this.emit('changed')
  }

  // --- levels ---------------------------------------------------------------------
  //
  // Every level pays coins: the larger of a fixed amount that grows with the
  // level, or some minutes of what the wirdhouse makes (so it stays worth
  // having however far along you are). Every 5th level also brings a
  // cosmetic only levels bring. Each level pays once, ever; levels reached
  // before coins existed don't pay out retroactively.
  static levelCoins (level, cps) {
    const minutes = Math.min(30, 2 + level * 0.5)
    return Math.max(250 * level * level, cps * minutes * 60)
  }

  levelReward (level) {
    if (this.s.levelPaid == null) this.s.levelPaid = level - 1
    if (level <= this.s.levelPaid) return null
    this.tick()
    const cps = baseCps(this.s)
    let coins = 0
    const items = []
    for (let l = this.s.levelPaid + 1; l <= level; l++) {
      coins += Economy.levelCoins(l, cps)
      for (const c of COSMETICS) if (c.level === l) items.push({ kind: c.kind, id: c.id, name: c.name, rarity: c.rarity, kindName: KINDS.find((k) => k.id === c.kind)?.name })
    }
    this.s.levelPaid = level
    this.s.coins += coins // a gift, not earned: doesn't count toward ink
    this.dirty = true
    this.emit('changed')
    if (items.length) this.emit('look')
    return { coins, items, level }
  }

  // --- the shop ---------------------------------------------------------------------

  owns (kind, id) {
    const c = cosmetic(kind, id)
    return Boolean(c && (c.free || this.s.owned.includes(`${kind}:${id}`) || (c.badge && this.hasBadge(c.badge)) || (c.level && this.level() >= c.level)))
  }

  buyCosmetic (kind, id) {
    const c = cosmetic(kind, id)
    if (!c) throw new Error('No such item.')
    if (this.owns(kind, id)) throw new Error('You already have it.')
    if (c.badge) throw new Error('That one comes with a badge.')
    if (c.level) throw new Error(`That one comes at level ${c.level}.`)
    if (c.price === null) throw new Error(`That one comes from publishing ${c.edition === 1 ? 'once' : `${c.edition} times`}.`)
    this._spend(c.price)
    this.s.owned.push(`${kind}:${id}`)
    this.s.look[kind] = id // wear it straight away
    this.emit('changed')
    this.emit('look')
    return this.view()
  }

  equip (kind, id) {
    if (!KINDS.some((k) => k.id === kind)) throw new Error('No such slot.')
    if (!this.owns(kind, id)) throw new Error('You don’t have that yet.')
    this.s.look[kind] = id
    this.dirty = true
    this.emit('changed')
    this.emit('look')
    return this.view()
  }

  // Numbers for badges.
  badgeStats () {
    const s = this.s
    return {
      ecoEver: s.allCoins,
      ecoBuildings: Object.values(s.buildings).reduce((a, b) => a + b, 0),
      ecoKinds: BUILDINGS.filter((b) => (s.buildings[b.id] || 0) > 0).length,
      ecoUpgrades: s.upgrades.length,
      ecoEditions: s.edition,
      ecoFlips: s.flips.count,
      ecoFlipBest: s.flips.bestStreak,
      ecoFlipBig: Math.max(s.flips.biggestWin, s.flips.biggestLoss),
      ecoFlipWorst: -s.flips.worstStreak,
      ecoPace: s.stats.bestStreak,
      ecoCosmetics: s.owned.length,
      ecoPerks: Object.values(s.perks).reduce((a, b) => a + b, 0)
    }
  }

  // What others see.
  look () {
    return { ...Object.fromEntries(PUBLIC_KINDS.map((k) => [k, this.s.look[k] || DEFAULT_LOOK[k]])), edition: this.s.edition }
  }

  // --- for testing (the dev account) -------------------------------------------------

  devUnlockAll (notify = true) {
    for (const c of COSMETICS) if (!c.free && !this.s.owned.includes(`${c.kind}:${c.id}`)) this.s.owned.push(`${c.kind}:${c.id}`) // badge titles too, for testing
    this.dirty = true
    if (notify) { this.emit('changed'); this.emit('look') }
  }

  devAddCoins (n) { this._earn(Math.max(0, Number(n) || 0)); this.emit('changed') }

  devWarp (secs) {
    // As if the app had been open (no muse or streak) for that long.
    this.tick()
    this._earn(baseCps(this.s) * Math.max(0, Number(secs) || 0))
    this.emit('changed')
  }

  devReset () {
    const owned = this.s.owned
    const look = this.s.look
    const escrow = this.s.escrow
    this.s = { ...blank(this.now()), owned, look, escrow }
    this.paid = new Set()
    this.dirty = true
    this.emit('changed')
  }

  // --- what the window shows ------------------------------------------------------------

  compact (t = this.now()) {
    const fx = effects(this.s)
    const st = streakNow(this.s, t, fx)
    return {
      coins: this.s.coins,
      cps: cpsNow(this.s, { now: t, friendsOnline: this.friendsOnline() }, fx),
      streak: { n: st.n, mult: st.mult, endsAt: st.endsAt, window: fx.streakWindow },
      same: this.s.same || { r: null, n: 0 },
      sameLimit: SAME_LIMIT,
      museUntil: this.s.museUntil > t ? this.s.museUntil : 0,
      museMult: fx.museMult,
      edition: this.s.edition,
      staked: this.stakedNow(),
      look: { ...this.s.look }
    }
  }

  view () {
    const t = this.now()
    const s = this.s
    const fx = effects(s)
    return {
      ...this.compact(t),
      runCoins: s.runCoins,
      allCoins: s.allCoins,
      baseCps: baseCps(s, fx),
      perWord: wordPay(s, { word: 'example', now: t }, fx).coins / Math.max(1, nextStreak(s, t, fx).mult), // before streak, for a 7-letter word
      fx: {
        streakStep: fx.streakStep, streakCap: fx.streakCap, streakWindow: fx.streakWindow, streakKeep: fx.streakKeep, streakToIdle: fx.streakToIdle,
        museMult: fx.museMult, museSecs: fx.museSecs, offlineRate: fx.offlineRate, offlineHours: fx.offlineHours,
        lobbyMult: fx.lobbyMult, hostMult: fx.hostMult, friendPct: fx.friendPct, global: fx.global, prestige: fx.prestige, wordSecs: fx.wordSecs, wordFlat: fx.wordFlat, wordMult: fx.wordMult, firstOfDay: fx.firstOfDay
      },
      buildings: BUILDINGS.map((b) => ({ ...b, owned: s.buildings[b.id] || 0, next: buildingCost(b, s.buildings[b.id] || 0, 1), next10: buildingCost(b, s.buildings[b.id] || 0, 10), max: maxAffordable(b, s.buildings[b.id] || 0, s.coins), each: buildingCps(s, b.id, fx) })),
      upgrades: upgradeList(s),
      prestige: { edition: s.edition, ink: s.ink, inkTotal: s.inkTotal, gain: inkGain(s), nextAt: ((inkTotalFor(s.allCoins) + 1) ** 3) * INK_PER, bonus: INK_BONUS, perks: PERKS.map((p) => { const level = s.perks[p.id] || 0; return { id: p.id, emoji: p.emoji, name: p.name, max: p.max, level, cost: level < p.max ? p.cost(level) : null, desc: p.desc(level), nextDesc: level < p.max ? p.desc(level + 1) : null } }) },
      flips: { ...s.flips },
      stats: { ...s.stats },
      owned: [...COSMETICS.filter((c) => c.free || (c.badge && this.hasBadge(c.badge)) || (c.level && this.level() >= c.level)).map((c) => `${c.kind}:${c.id}`), ...s.owned],
      level: this.level(),
      dev: this.dev
    }
  }
}
