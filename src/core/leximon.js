// Your Leximon on this computer: the words you've caught, your team of three,
// training, ascending, and duels. Kept inside economy.json (as s.leximon) so
// coins and words are saved together. The rules are in src/shared/leximon.js.

import crypto from 'node:crypto'
import {
  rarityFor, rarityName, stanceFor, STANCES, RATING_XP, LOBBY_XP, xpToNext, levelCap, ascendCost, power,
  TRAIN_XP_PER_HOUR, TRAIN_MAX_HOURS, TRAIN_SLOTS, trainCostPerHour, FOCUS, nextEncounterIn,
  DUELS_PER_DAY, DUEL_XP, duel, cleanTeam, leximonBonus
} from '../shared/leximon.js'
import { hash32 } from '../shared/market.js'

const HOUR = 3600e3
export const utcDay = (t) => new Date(t).toISOString().slice(0, 10)
export const blankLeximon = () => ({ cards: {}, team: [], encounter: null, since: 0, nextAt: 8, focus: null, duels: { day: null, today: 0, wins: 0, losses: 0, history: [] }, caught: 0 })

export class Leximon {
  // economy: the Economy (its s.leximon is ours). store: for your ratings.
  // encounters(): whether wild words appear (a setting).
  constructor ({ economy, store, now = () => Date.now(), encounters = () => true }) {
    this.economy = economy
    this.store = store
    this.now = now
    this.encounters = encounters
    const s = economy.s
    // Builds before the rename kept it as s.lexicon.
    if (!s.leximon && s.lexicon) { s.leximon = s.lexicon; delete s.lexicon }
    s.leximon = { ...blankLeximon(), ...(s.leximon || {}) }
    s.leximon.duels = { ...blankLeximon().duels, ...(s.leximon.duels || {}) }
  }

  get s () { return this.economy.s.leximon }
  _save () { this.economy.dirty = true; this.economy.save(true); this.economy.emit('changed') }
  card (word) {
    const c = this.s.cards[word]
    if (!c) throw new Error('You haven’t caught that word.')
    return c
  }

  team () { return this.s.team.map((w) => this.s.cards[w]).filter(Boolean) }
  bonus () { return leximonBonus(this.team()) }

  // XP to a word: levels while under its tier's cap; past it, banked.
  _gain (c, xp, ups) {
    c.xp += xp
    c.xpTotal = (c.xpTotal || 0) + xp
    while (c.level < levelCap(c.tier) && c.xp >= xpToNext(c.level)) {
      c.xp -= xpToNext(c.level)
      c.level++
      ups?.push({ word: c.word, level: c.level })
    }
  }

  focusMult (t = this.now()) { return this.s.focus && this.s.focus.until > t ? this.s.focus.mult : 1 }

  // A new word was rated: the team grows, wild words come and go.
  onNewWord (word) {
    const t = this.now()
    this._applyTraining(t)
    const ups = []
    const xp = Math.round(RATING_XP * this.focusMult(t))
    for (const c of this.team()) this._gain(c, xp, ups)
    // A wild word that wasn't caught leaves after the next rating.
    let fled = null
    if (this.s.encounter && this.s.encounter.at < t) { fled = this.s.encounter.word; this.s.encounter = null }
    let encounter = null
    this.s.since++
    if (this.encounters() && this.s.since >= this.s.nextAt) {
      encounter = this._spawn(word, t)
      if (encounter) { this.s.since = 0; this.s.nextAt = nextEncounterIn(Math.random()) }
    }
    this._save()
    return { xp: this.team().length ? xp : 0, ups, encounter, fled }
  }

  onLobbyRound () {
    const ups = []
    for (const c of this.team()) this._gain(c, Math.round(LOBBY_XP * this.focusMult()), ups)
    if (this.team().length) this._save()
    return ups
  }

  // A word you've rated (not the one you just rated, not one you have), with
  // its rarity worked out now, from your ratings as they are.
  _spawn (justRated, t) {
    const mine = this.store.ratings()
    const open = mine.filter((x) => x.word !== justRated && !this.s.cards[x.word])
    if (!open.length) return null
    const pick = open[crypto.randomInt(open.length)]
    const rarity = rarityFor(pick.r, mine.map((x) => x.r))
    this.s.encounter = { word: pick.word, rarity, at: t }
    return { word: pick.word, rarity: { ...rarity, name: rarityName(rarity) } }
  }

  catch () {
    const e = this.s.encounter
    if (!e) throw new Error('Nothing to catch right now.')
    this.s.encounter = null
    if (this.s.cards[e.word]) return this.s.cards[e.word]
    const c = { word: e.word, rarity: e.rarity, level: 1, xp: 0, xpTotal: 0, tier: 1, stance: stanceFor(e.rarity.side), caughtAt: this.now(), train: null, trainDay: null }
    this.s.cards[e.word] = c
    this.s.caught++
    if (this.s.team.length < 3) this.s.team.push(e.word)
    this._save()
    this.economy.emit('played', 'catch')
    return c
  }

  dismiss () { this.s.encounter = null; this._save() }

  release (word) {
    this.card(word)
    delete this.s.cards[word]
    this.s.team = this.s.team.filter((w) => w !== word)
    this._save()
  }

  // slot 0–2; a word already on the team swaps places.
  equip (word, slot) {
    this.card(word)
    slot = Math.max(0, Math.min(2, Math.floor(Number(slot) || 0)))
    const team = [...this.s.team]
    const was = team.indexOf(word)
    if (was >= 0) team.splice(was, 1)
    while (team.length < slot) team.push(null)
    team.splice(slot, 0, word)
    this.s.team = team.filter(Boolean).slice(0, 3)
    this._save()
  }

  unequip (word) { this.s.team = this.s.team.filter((w) => w !== word); this._save() }

  stance (word, stance) {
    if (!STANCES.some((s) => s.id === stance)) throw new Error('Unknown stance.')
    this.card(word).stance = stance
    this._save()
  }

  // Training: up to TRAIN_MAX_HOURS a word a day, TRAIN_SLOTS at once.
  train (word, hours) {
    const t = this.now()
    this._applyTraining(t)
    const c = this.card(word)
    hours = Math.floor(Number(hours))
    if (!(hours >= 1)) throw new Error('Train for at least an hour.')
    if (c.train) throw new Error('Already training.')
    if (Object.values(this.s.cards).filter((x) => x.train).length >= TRAIN_SLOTS) throw new Error(`You can train ${TRAIN_SLOTS} words at a time.`)
    const day = utcDay(t)
    const used = c.trainDay?.day === day ? c.trainDay.hours : 0
    if (used + hours > TRAIN_MAX_HOURS) throw new Error(used >= TRAIN_MAX_HOURS ? 'That word has trained all it can today. Rating words still teaches it.' : `Only ${TRAIN_MAX_HOURS - used} more hour${TRAIN_MAX_HOURS - used === 1 ? '' : 's'} today.`)
    const cost = trainCostPerHour(c.level) * hours
    this.economy._spend(cost)
    c.trainDay = { day, hours: used + hours }
    c.train = { start: t, end: t + hours * HOUR, xp: hours * TRAIN_XP_PER_HOUR, applied: 0 }
    this._save()
    this.economy.emit('played', 'train')
    return { cost }
  }

  _applyTraining (t = this.now()) {
    let changed = false
    for (const c of Object.values(this.s.cards)) {
      if (!c.train) continue
      const k = Math.min(1, (t - c.train.start) / (c.train.end - c.train.start))
      const due = Math.floor(c.train.xp * k) - c.train.applied
      if (due > 0) { this._gain(c, due); c.train.applied += due; changed = true }
      if (k >= 1) { c.train = null; changed = true }
    }
    return changed
  }

  ascend (word) {
    const c = this.card(word)
    if (c.level < levelCap(c.tier)) throw new Error(`Reach level ${levelCap(c.tier)} first.`)
    this.economy._spend(ascendCost(c.tier))
    c.tier++
    this._gain(c, 0) // banked XP turns into levels
    this._save()
    return c
  }

  focus (id) {
    const f = FOCUS.find((x) => x.id === id)
    if (!f) throw new Error('Unknown focus.')
    const t = this.now()
    if (this.s.focus && this.s.focus.until > t && this.s.focus.mult >= f.mult) throw new Error('Already focused.')
    this.economy._spend(f.cost(this.economy.compact().cps))
    this.s.focus = { mult: f.mult, until: t + f.mins * 60e3 }
    this._save()
  }

  // A duel with a friend's team (from their profile). The seed comes from
  // both sides, the day and how many you've fought today, so it's the same
  // battle wherever it's worked out.
  duel (friendId, friendName, theirTeamRaw, myId) {
    const t = this.now()
    const day = utcDay(t)
    const d = this.s.duels
    if (d.day !== day) { d.day = day; d.today = 0 }
    if (d.today >= DUELS_PER_DAY) throw new Error(`That’s ${DUELS_PER_DAY} duels today. More tomorrow.`)
    const mine = this.team().map((c) => ({ word: c.word, tier: c.tier, level: c.level, rarity: c.rarity, stance: c.stance }))
    const theirs = cleanTeam(theirTeamRaw)
    if (!mine.length) throw new Error('Put a word on your team first.')
    if (!theirs.length) throw new Error('They haven’t got a team yet.')
    const seed = hash32(`duel|${[myId, friendId].sort().join('|')}|${day}|${d.today}`)
    const res = duel(mine, theirs, seed)
    d.today++
    if (res.won) d.wins++
    else d.losses++
    const ups = []
    for (const c of this.team()) this._gain(c, res.won ? DUEL_XP.win : DUEL_XP.loss, ups)
    d.history = [{ vs: friendId, name: String(friendName || '').slice(0, 40), won: res.won, score: `${res.wins}–${res.losses}`, at: t, mine: mine.map((c) => c.word), theirs: theirs.map((c) => c.word) }, ...d.history].slice(0, 20)
    this._save()
    this.economy.emit('played', 'duel')
    return { ...res, ups, left: DUELS_PER_DAY - d.today }
  }

  // For the window.
  view () {
    const t = this.now()
    if (this._applyTraining(t)) this._save()
    const decorate = (c) => ({
      ...c,
      rarityName: rarityName(c.rarity),
      power: power(c),
      next: xpToNext(c.level),
      cap: levelCap(c.tier),
      ready: c.level >= levelCap(c.tier),
      ascendCost: ascendCost(c.tier),
      trainCost: trainCostPerHour(c.level),
      trainLeft: TRAIN_MAX_HOURS - (c.trainDay?.day === utcDay(t) ? c.trainDay.hours : 0),
      onTeam: this.s.team.includes(c.word)
    })
    const d = this.s.duels
    const cps = this.economy.compact().cps
    return {
      cards: Object.values(this.s.cards).map(decorate).sort((a, b) => b.power - a.power),
      team: this.team().map(decorate),
      encounter: this.s.encounter ? { ...this.s.encounter, rarityName: rarityName(this.s.encounter.rarity) } : null,
      focus: this.s.focus && this.s.focus.until > t ? this.s.focus : null,
      focusOptions: FOCUS.map((f) => ({ id: f.id, mult: f.mult, mins: f.mins, cost: f.cost(cps) })),
      bonus: this.bonus(),
      training: Object.values(this.s.cards).filter((c) => c.train).length,
      trainSlots: TRAIN_SLOTS,
      duels: { today: d.day === utcDay(t) ? d.today : 0, perDay: DUELS_PER_DAY, wins: d.wins, losses: d.losses, history: d.history },
      caught: this.s.caught,
      rated: this.store.ratings().length,
      nextIn: Math.max(0, this.s.nextAt - this.s.since)
    }
  }

  // What friends see.
  public () {
    const cards = Object.values(this.s.cards)
    const best = (side) => cards.filter((c) => c.rarity.side === side).sort((a, b) => b.rarity.tier - a.rarity.tier || b.level - a.level)[0]
    const pub = (c) => (c ? { word: c.word, tier: c.tier, level: c.level, rarity: { tier: c.rarity.tier, side: c.rarity.side }, stance: c.stance } : null)
    return {
      team: this.team().map(pub),
      caught: cards.length,
      beloved: pub(best('love')),
      nemesis: pub(best('hate')),
      wins: this.s.duels.wins,
      losses: this.s.duels.losses,
      duels: this.s.duels.history.slice(0, 10).map((h) => ({ vs: h.vs, won: h.won, score: h.score, at: h.at }))
    }
  }
}
