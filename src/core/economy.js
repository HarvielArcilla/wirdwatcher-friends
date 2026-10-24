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
  museNow, museFactor, museDrainSecs, MUSE_FILL, MUSE_FLOOR,
  BUILDINGS, UPGRADES, PERKS, buildingCost, maxAffordable, effects, baseCps, buildingCps, cpsNow,
  wordPay, nextStreak, streakNow, lobbyPay, offlinePay, upgradeList, inkGain, inkTotalFor, INK_BONUS, INK_PER
} from '../shared/economy.js'
import { COSMETICS, KINDS, DEFAULT_LOOK, cosmetic, PUBLIC_KINDS } from '../shared/cosmetics.js'
import { balanced, validStake } from '../shared/stakes.js'
import { letterAt, WEIGHT_TOTAL, evaluate } from '../shared/slots.js'
import { drawPack, drawCrate, crateKinds, cratePrice, packPool, packPrice, PITY, scrapFor, craftCost, cardValue, FLAT, STEEP, BONUS_MIN, SCRAP_RATE } from '../shared/packs.js'

const SAVE_EVERY_MS = 15000
const TICK_MS = 1000
const ASLEEP_MS = 30000 // a gap this long between ticks means the computer slept: count it as time away
export const SAME_LIMIT = 5 // this many of the same score in a row ends the pace streak
export const DEBT_RATE = 0.24 // a year, compounded continuously, on coins below zero
const YEAR_MS = 365.25 * 864e5
const DAY_MS = 864e5
// Bankruptcy lasts at least this many days, longer each time.
export const BANKRUPT_DAYS = (n) => Math.min(14, 3 * n)

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
  slots: { spins: 0, wins: 0, net: 0, biggest: 0, jackpots: 0, bestWord: null, bestMult: 0, freeDay: null, last: [] },
  market: { holdings: {}, spent: 0, proceeds: 0, trades: 0, best: null, worst: null, lastTradeAt: 0 },
  escrow: {}, // lobby stakes in play: key -> { amount, host, state: 'held' | 'committed', at }
  stakes: { games: 0, won: 0, lost: 0, net: 0, biggestPot: 0 },
  bankrupt: null, // { at, discharged, need, earned, until, n } while it lasts
  credit: { filings: 0, discharged: 0, lastFiled: null, debtInterest: 0, deepest: 0 },
  packs: { free: 0, granted: 0, opened: 0, bought: 0, dry: 0, scraps: 0, scrapsV: 2, last: [] },
  // Where coins came from and went (kept from 2.3.1 on).
  ledger: { since: now, spent: {}, got: {} }
})

const localDay = (t) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` }

// How many slot machines you can play at once.
export const MAX_MACHINES = 12

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
    for (const k of ['stats', 'flips', 'stakes', 'market', 'slots', 'credit', 'packs']) this.s[k] = { ...blank(0)[k], ...(saved?.[k] || {}) }
    if (!this.s.ledger) this.s.ledger = { since: now(), spent: {}, got: {} }
    this.s.escrow = { ...(saved?.escrow || {}) }
    // 2.3.0 counted scraps in small numbers by rarity; from 2.3.1 they're worth coins' value.
    if (saved?.packs && saved.packs.scrapsV !== 2) { this.s.packs.scraps = Math.round((this.s.packs.scraps || 0) * 5000); this.s.packs.dry = this.s.packs.sinceEpic || 0; delete this.s.packs.sinceEpic; this.s.packs.scrapsV = 2 }
    this.s.look = { ...DEFAULT_LOOK, ...(saved?.look || {}) }
    if (!this.s.muse) this.s.muse = { v: 1, t: now() } // arrive inspired
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

  _earn (coins, what = 'income') {
    if (!(coins > 0)) return 0
    this.note('got', what, coins)
    this.s.coins += coins
    this.s.runCoins += coins
    this.s.allCoins += coins
    this.dirty = true
    if (this.s.bankrupt) {
      this.s.bankrupt.earned += coins // steady income, toward the discharge
      if (this._dischargeReady()) this._discharge(this.now())
    }
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
    // Debt grows: interest on whatever's below zero, for however long it's been.
    if (this.s.coins < 0) {
      const owed = -this.s.coins
      const grown = owed * Math.exp(DEBT_RATE * dt / YEAR_MS)
      this.s.coins = -grown
      this.s.credit.debtInterest += grown - owed
      this.s.credit.deepest = Math.max(this.s.credit.deepest, grown)
      this.dirty = true
    }
    if (this.s.bankrupt && this._dischargeReady(t)) this._discharge(t)
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
    this.s.muse = { v: Math.min(1, museNow(this.s, t, fx) + MUSE_FILL), t }
    this.s.stats.words++
    this._earn(pay.coins)
    this.emit('changed')
    return { coins: pay.coins, streak: { n: pay.streak.n, mult: pay.streak.mult }, same: { r, n: same }, broke: spam, firstToday: pay.firstToday, muse: { level: this.s.muse.v } }
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

  _spend (cost, what = 'other') {
    this.tick()
    if (!(cost >= 0) || this.s.coins + 1e-6 < cost) throw new Error('Not enough coins.')
    this.s.coins = Math.max(0, this.s.coins - cost)
    this.note('spent', what, cost)
    this.dirty = true
  }

  // The ledger: what came in and went out, by what for.
  note (side, what, coins) {
    if (!(coins > 0)) return
    const l = this.s.ledger
    l[side][what] = (l[side][what] || 0) + coins
  }

  buyBuilding (id, count = 1) {
    const b = BUILDINGS.find((x) => x.id === id)
    if (!b) throw new Error('No such building.')
    const owned = this.s.buildings[id] || 0
    this.tick()
    const n = count === 'max' ? maxAffordable(b, owned, this.s.coins) : Math.max(1, Math.min(1000, Math.floor(Number(count) || 1)))
    if (!n) throw new Error('Not enough coins.')
    this._spend(buildingCost(b, owned, n), 'wirdhouse')
    this.s.buildings[id] = owned + n
    this.emit('changed')
    return this.view()
  }

  buyUpgrade (id) {
    const u = UPGRADES.find((x) => x.id === id)
    if (!u) throw new Error('No such upgrade.')
    if (this.s.upgrades.includes(id)) throw new Error('You already have that.')
    if (!u.req(this.s)) throw new Error(`Not yet: ${u.hint.toLowerCase()}.`)
    this._spend(u.cost, 'wirdhouse')
    this.s.upgrades.push(id)
    this.emit('changed')
    return this.view()
  }

  // Publishing your dictionary: the wirdhouse starts over, and you keep ink.
  prestige () {
    const gain = inkGain(this.s)
    if (this.s.coins < 0) throw new Error('Pay off your debt before publishing.')
    if (this.s.bankrupt) throw new Error('No publishing while you’re bankrupt.')
    if (gain < 1) throw new Error('Not enough to publish yet. Keep earning.')
    this.tick()
    // Shares are sold at today's prices first: they're part of the edition
    // that's ending, so nothing carries over through the market.
    this.beforePrestige?.()
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
    s.muse = { v: 1, t: this.now() }
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
  _casinoOpen () { if (this.s.bankrupt) throw new Error('The casino doesn’t take bankrupt players. Build some steady income first.') }

  flip (stake, call = 'heads') {
    this.tick()
    this._casinoOpen()
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
    this.emit('played', 'flip')
    return { win, side, stake: amount, coins: this.s.coins, flips: { ...f } }
  }

  // --- Wird Slots -------------------------------------------------------------------
  // isWord(w): set by the app (the word list). See src/shared/slots.js.

  freeSpinAmount () { return Math.max(100, Math.round(this.compact().cps * 60)) }
  freeSpinReady () { return this.s.slots.freeDay !== new Date(this.now()).toISOString().slice(0, 10) }

  spin (stake, { free = false } = {}) {
    this.tick()
    this._casinoOpen()
    const sl = this.s.slots
    let amount
    if (free) {
      if (!this.freeSpinReady()) throw new Error('Today’s free spin is used. Another tomorrow.')
      amount = this.freeSpinAmount()
      sl.freeDay = new Date(this.now()).toISOString().slice(0, 10)
    } else {
      amount = Math.floor(Number(stake))
      if (!(amount >= 1)) throw new Error('Bet at least 1 coin.')
      if (amount > Math.floor(this.s.coins)) throw new Error('You don’t have that many coins.')
      this.s.coins -= amount
    }
    const out = this._spinOne(amount, free)
    this.dirty = true
    this.emit('changed')
    this.emit('played', 'spin')
    return { ...out, coins: this.s.coins, slots: { ...sl } }
  }

  // Several machines at once, the same bet on each. Each pays on its own.
  spinMany (stake, count) {
    this.tick()
    this._casinoOpen()
    const n = Math.floor(Number(count))
    if (!(n >= 1 && n <= MAX_MACHINES)) throw new Error(`Between 1 and ${MAX_MACHINES} machines.`)
    const amount = Math.floor(Number(stake))
    if (!(amount >= 1)) throw new Error('Bet at least 1 coin on each.')
    if (amount * n > Math.floor(this.s.coins)) throw new Error(`That’s ${(amount * n).toLocaleString('en-US')} coins for ${n} machines. You don’t have that many.`)
    this.s.coins -= amount * n
    const spins = Array.from({ length: n }, () => this._spinOne(amount, false))
    this.dirty = true
    this.emit('changed')
    this.emit('played', 'spin')
    return { spins, stake: amount, total: amount * n, won: spins.reduce((a, x) => a + x.won, 0), coins: this.s.coins, slots: { ...this.s.slots } }
  }

  _spinOne (amount, free) {
    const sl = this.s.slots
    const reels = Array.from({ length: 5 }, () => letterAt(crypto.randomInt(WEIGHT_TOTAL)))
    const hit = evaluate(reels, this.isWord || (() => false))
    const won = Math.floor(amount * hit.mult)
    this.s.coins += won // winnings don't count as earning: no ink from luck
    sl.spins++
    if (won > 0) sl.wins++
    sl.net += won - (free ? 0 : amount)
    sl.biggest = Math.max(sl.biggest, won)
    if (hit.len === 5) sl.jackpots++
    if (hit.word && (hit.mult > sl.bestMult || (hit.mult === sl.bestMult && won > sl.biggest - 1))) { sl.bestWord = hit.word; sl.bestMult = hit.mult }
    sl.last = [{ reels: reels.join(''), word: hit.word, won, at: this.now() }, ...(sl.last || [])].slice(0, 12)
    return { reels, ...hit, stake: amount, won, free }
  }

  // --- the Word Exchange ------------------------------------------------------------
  //
  // Prices come from src/shared/market.js (via core/market.js); here is just
  // the money. Trades don't count as earning, so they make no ink. A clock
  // that goes backwards can't trade (no buying at yesterday's prices).

  _tradeClock () {
    const t = this.now()
    if (t < (this.s.market.lastTradeAt || 0) - 1000) throw new Error('Your computer’s clock is behind your last trade. Fix the clock to trade.')
    this.s.market.lastTradeAt = Math.max(t, this.s.market.lastTradeAt || 0)
  }

  marketBuy (word, coins, unitPrice) {
    this.tick()
    coins = Math.floor(coins * 100) / 100
    if (!(coins >= 1)) throw new Error('Spend at least 1 coin.')
    if (coins > this.s.coins + 1e-9) throw new Error('You don’t have that many coins.')
    if (!(unitPrice > 0)) throw new Error('No price for that word.')
    this._tradeClock()
    const m = this.s.market
    const shares = Math.floor((coins / unitPrice) * 1e6) / 1e6
    const h = m.holdings[word] || { shares: 0, cost: 0 }
    h.shares += shares
    h.cost += coins
    m.holdings[word] = h
    m.spent += coins
    m.trades++
    this.s.coins -= coins
    this.dirty = true
    this.save(true)
    this.emit('changed')
    this.emit('played', 'trade')
    return { word, shares, coins, price: unitPrice, holding: { ...h } }
  }

  marketSell (word, shares, unitPrice) {
    this.tick()
    const m = this.s.market
    const h = m.holdings[word]
    if (!h || !(h.shares > 0)) throw new Error('You don’t own any of that word.')
    shares = Math.min(h.shares, Math.floor(Number(shares) * 1e6) / 1e6)
    if (!(shares > 0)) throw new Error('Sell at least a little.')
    this._tradeClock()
    const coins = Math.floor(shares * unitPrice * 100) / 100
    const cost = h.cost * (shares / h.shares) // average cost of what's sold
    const gain = coins - cost
    h.shares -= shares
    h.cost -= cost
    if (h.shares < 1e-6) delete m.holdings[word]
    m.proceeds += coins
    m.trades++
    if (!m.best || gain > m.best.gain) m.best = { word, gain, pct: cost ? gain / cost : 0 }
    if (!m.worst || gain < m.worst.gain) m.worst = { word, gain, pct: cost ? gain / cost : 0 }
    this.s.coins += coins
    this.dirty = true
    this.save(true)
    this.emit('changed')
    this.emit('played', 'trade')
    return { word, shares, coins, price: unitPrice, gain }
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
    if (this.s.bankrupt || !validStake(amount) || amount > Math.floor(this.s.coins)) return false
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
    this.note('got', 'rewards', coins)
    const packs = this.grantLevelPacks(level)
    this.dirty = true
    this.emit('changed')
    if (items.length) this.emit('look')
    return { coins, items, level, packs }
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
    if (this.s.bankrupt) throw new Error('No new looks while you’re bankrupt.')
    if (c.pack) throw new Error('That one only comes in card packs.')
    if (c.wl || c.valley) throw new Error(c.wl ? 'That one only comes from Wirdlike.' : 'That one only comes from Wird Valley.')
    if (c.price === null) throw new Error(`That one comes from publishing ${c.edition === 1 ? 'once' : `${c.edition} times`}.`)
    this._spend(c.price, 'cosmetics')
    this.s.owned.push(`${kind}:${id}`)
    this.s.look[kind] = id // wear it straight away
    this.emit('changed')
    this.emit('look')
    return this.view()
  }

  equip (kind, id) {
    if (!KINDS.some((k) => k.id === kind)) throw new Error('No such slot.')
    if (!this.owns(kind, id)) throw new Error('You don’t have that yet.')
    if (this.s.bankrupt && !cosmetic(kind, id)?.free) throw new Error('Your looks are locked away while you’re bankrupt.')
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
    const worn = this.worn()
    return { ...Object.fromEntries(PUBLIC_KINDS.map((k) => [k, worn[k] || DEFAULT_LOOK[k]])), edition: this.s.edition }
  }

  // What you actually wear: while bankrupt, only the free looks.
  worn () { return this.s.bankrupt ? { ...DEFAULT_LOOK } : { ...this.s.look } }

  // --- debt and bankruptcy ----------------------------------------------------------
  //
  // Coins can go below zero (big losses on the Word Exchange). Debt charges
  // DEBT_RATE, and anything you earn pays it down. If what you own can't
  // cover it, you can declare bankruptcy: the app sells everything on the
  // Exchange first (see WirdApp.declareBankruptcy), then the rest of the
  // debt is cancelled and coins start again from zero. Until you've built
  // some steady income (earned at least a day of your wirdhouse, or a tenth
  // of what was cancelled, whichever is more) and some days have passed, the
  // casino, cosmetics, stakes, risky trades and publishing are locked.

  fileBankruptcy () {
    this.tick()
    if (this.s.bankrupt) throw new Error('You’re already bankrupt.')
    if (this.s.coins >= 0) throw new Error('You’re not in debt.')
    const t = this.now()
    const discharged = -this.s.coins
    const c = this.s.credit
    c.filings++
    c.discharged += discharged
    c.lastFiled = t
    const need = Math.max(10000, baseCps(this.s) * 86400, discharged * 0.1)
    this.s.coins = 0
    this.s.bankrupt = { at: t, discharged, need, earned: 0, until: t + BANKRUPT_DAYS(c.filings) * DAY_MS, n: c.filings }
    this.dirty = true
    this.save(true)
    this.emit('changed')
    this.emit('look')
    return this.bankruptView()
  }

  _dischargeReady (t = this.now()) {
    const b = this.s.bankrupt
    return b && t >= b.until && b.earned >= b.need
  }

  _discharge (t) {
    const b = this.s.bankrupt
    this.s.bankrupt = null
    this.s.credit.lastDischarged = t
    this.dirty = true
    this.discharged = { ...b, at: t }
    this.emit('changed')
    this.emit('look')
  }

  // Taking the news of a discharge, once, for the window to show.
  takeDischarge () { const d = this.discharged; this.discharged = null; return d }

  bankruptView () {
    const b = this.s.bankrupt
    if (!b) return null
    return { ...b, progress: Math.min(1, b.earned / b.need), daysLeft: Math.max(0, (b.until - this.now()) / DAY_MS) }
  }

  // --- card packs (in the casino) -----------------------------------------------------
  //
  // See src/shared/packs.js for the odds. A free pack comes with every fifth
  // level; more can be bought. Each pack is three cards; a card you already
  // have becomes scraps, and scraps make any card of your choosing.

  grantLevelPacks (level = this.level()) {
    const pk = this.s.packs
    const want = Math.floor(level / 5)
    if (want <= pk.granted) return 0
    const n = want - pk.granted
    pk.free += n
    pk.granted = want
    this.dirty = true
    this.emit('changed')
    return n
  }

  packPrice () { return packPrice(baseCps(this.s)) }

  openPack ({ free = false } = {}) {
    this.tick()
    this._casinoOpen()
    const pk = this.s.packs
    let price = 0
    if (free) {
      if (pk.free < 1) throw new Error('No free packs left. One comes every five levels.')
      pk.free--
    } else {
      price = this.packPrice()
      this._spend(price, 'packs')
      pk.bought++
    }
    const owned = new Set([...this.s.owned, ...COSMETICS.filter((c) => c.free).map((c) => `${c.kind}:${c.id}`)])
    const value = this.packPrice()
    const { cards, dry } = drawPack(() => crypto.randomInt(2 ** 32) / 2 ** 32, value, pk.dry || 0)
    pk.dry = dry
    const out = cards.map((c) => {
      const key = `${c.kind}:${c.id}`
      const dup = owned.has(key)
      if (dup) pk.scraps += scrapFor(c)
      else { this.s.owned.push(key); owned.add(key) }
      return { kind: c.kind, id: c.id, name: c.name, rarity: c.rarity, value: cardValue(c), dup, scraps: dup ? scrapFor(c) : 0, kindName: KINDS.find((k) => k.id === c.kind)?.name }
    })
    pk.opened++
    pk.last = [{ at: this.now(), cards: out.map((c) => `${c.kind}:${c.id}`), free }, ...pk.last].slice(0, 10)
    this.dirty = true
    this.save(true)
    this.emit('changed')
    this.emit('played', 'pack')
    return { cards: out, price, free, packs: this.packsView() }
  }

  // A crate: one card of a kind (or any), opened with a reel.
  crateKinds () { return crateKinds().map((k) => ({ ...k, price: this.cratePrice() })) }
  cratePrice () { return cratePrice(baseCps(this.s)) }

  openCrate (kind = 'all') {
    this.tick()
    this._casinoOpen()
    if (!crateKinds().some((k) => k.id === kind)) throw new Error('No such crate.')
    const pk = this.s.packs
    const price = this.cratePrice()
    this._spend(price, 'packs')
    const c = drawCrate(() => crypto.randomInt(2 ** 32) / 2 ** 32, kind, price)
    const key = `${c.kind}:${c.id}`
    const dup = this.s.owned.includes(key) || Boolean(c.free)
    if (dup) pk.scraps += scrapFor(c)
    else this.s.owned.push(key)
    pk.crates = (pk.crates || 0) + 1
    const card = { kind: c.kind, id: c.id, name: c.name, rarity: c.rarity, value: cardValue(c), dup, scraps: dup ? scrapFor(c) : 0, kindName: KINDS.find((k) => k.id === c.kind)?.name }
    pk.lastCrates = [{ at: this.now(), card: key, crate: kind }, ...(pk.lastCrates || [])].slice(0, 10)
    this.dirty = true
    this.save(true)
    this.emit('changed')
    this.emit('played', 'pack')
    return { card, price, crate: kind, packs: this.packsView() }
  }

  craft (kind, id) {
    this._casinoOpen()
    const c = cosmetic(kind, id)
    if (!c || !packPool().includes(c)) throw new Error('That can’t be crafted.')
    if (this.owns(kind, id)) throw new Error('You already have it.')
    const cost = craftCost(c)
    if (this.s.packs.scraps < cost) throw new Error(`That takes ${cost.toLocaleString('en-US')} scraps.`)
    this.s.packs.scraps -= cost
    this.s.owned.push(`${kind}:${id}`)
    this.dirty = true
    this.save(true)
    this.emit('changed')
    return this.packsView()
  }

  packsView () {
    const pk = this.s.packs
    return { ...pk, price: this.packPrice(), cratePrice: this.cratePrice(), crates: pk.crates || 0, pity: PITY, flat: FLAT, steep: STEEP, bonusMin: BONUS_MIN, scrapRate: SCRAP_RATE, toPity: Math.max(1, PITY - (pk.dry || 0)), nextFreeAt: (pk.granted + 1) * 5 }
  }

  // --- for testing (the dev account) -------------------------------------------------

  devUnlockAll (notify = true) {
    for (const c of COSMETICS) if (!c.free && !this.s.owned.includes(`${c.kind}:${c.id}`)) this.s.owned.push(`${c.kind}:${c.id}`) // badge titles too, for testing
    this.dirty = true
    if (notify) { this.emit('changed'); this.emit('look') }
  }

  devAddCoins (n) { this._earn(Math.max(0, Number(n) || 0), 'dev'); this.emit('changed') }
  devDebt (n) { this.tick(); this.s.coins -= Math.max(0, Number(n) || 0); this.dirty = true; this.emit('changed') }

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
      muse: { level: museNow(this.s, t, fx), mult: fx.museMult, floor: MUSE_FLOOR, factor: museFactor(museNow(this.s, t, fx), fx), drainSecs: museDrainSecs(fx), fill: MUSE_FILL },
      edition: this.s.edition,
      staked: this.stakedNow(),
      look: this.worn(),
      debt: this.s.coins < 0 ? -this.s.coins : 0,
      bankrupt: this.bankruptView()
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
      slots: { ...s.slots },
      packs: this.packsView(),
      credit: { ...s.credit },
      freeSpin: { ready: this.freeSpinReady(), amount: this.freeSpinAmount() },
      stats: { ...s.stats },
      owned: [...COSMETICS.filter((c) => c.free || (c.badge && this.hasBadge(c.badge)) || (c.level && this.level() >= c.level)).map((c) => `${c.kind}:${c.id}`), ...s.owned],
      level: this.level(),
      dev: this.dev
    }
  }
}
