// The Casino's table games, you against the house: Letter Roulette, Word
// Blackjack and the Wheel of Words. The rules are in src/shared/tables.js
// (lobby tables use the same ones). Bets come out of your coins when you
// place them and winnings go back in; like the coinflip, luck isn't
// "earned", so none of it counts toward ink. Bankrupt players can't play.

import crypto from 'node:crypto'
import {
  POCKETS, pocketColor, rouletteBet, roulettePayout, ROULETTE_KINDS,
  shuffledBag, handTotal, bjResult, bjPayout, wordInTiles, BJ_TARGET, DEALER_STANDS,
  WHEEL_SEGMENTS, WHEEL_IDS, wheelPayout, pickFrom
} from '../shared/tables.js'

const blankStats = () => ({ roulette: { spins: 0, net: 0, biggest: 0 }, wheel: { spins: 0, net: 0, biggest: 0 }, blackjack: { hands: 0, wins: 0, words: 0, net: 0, biggest: 0 }, bj: null })
const MAX_BETS = 12

export class Tables {
  // byLetters(sorted): a word spelled by exactly those letters, or null.
  constructor ({ economy, byLetters = () => null }) {
    this.economy = economy
    this.byLetters = byLetters
    const b = blankStats()
    const s = economy.s.tables || {}
    economy.s.tables = { ...b, ...s, roulette: { ...b.roulette, ...(s.roulette || {}) }, wheel: { ...b.wheel, ...(s.wheel || {}) }, blackjack: { ...b.blackjack, ...(s.blackjack || {}) } }
  }

  get s () { return this.economy.s.tables }
  _commit () { const e = this.economy; e.dirty = true; e.save(true); e.emit('changed'); e.emit('played', 'table') }

  // Take the bets' coins, all or nothing.
  _stake (bets, valid) {
    const e = this.economy
    e.tick()
    e._casinoOpen()
    if (!Array.isArray(bets) || !bets.length) throw new Error('Place a bet first.')
    if (bets.length > MAX_BETS) throw new Error(`At most ${MAX_BETS} bets a spin.`)
    const clean = bets.map((b) => ({ kind: String(b.kind), pick: b.pick == null ? null : String(b.pick).slice(0, 24), amount: Math.floor(Number(b.amount)) }))
    for (const b of clean) {
      if (!(b.amount >= 1)) throw new Error('Each bet needs at least 1 coin.')
      if (!valid(b)) throw new Error('That isn’t a bet on this table.')
    }
    const total = clean.reduce((a, b) => a + b.amount, 0)
    if (total > Math.floor(e.s.coins)) throw new Error('You don’t have that many coins.')
    e.s.coins -= total
    return { clean, total }
  }

  _settle (game, total, paid) {
    const st = this.s[game]
    const net = paid - total
    this.economy.s.coins += paid
    st.net += net
    st.biggest = Math.max(st.biggest || 0, net)
    return net
  }

  // --- Letter Roulette ---
  roulette (bets) {
    const { clean, total } = this._stake(bets, (b) => ROULETTE_KINDS.includes(b.kind) && Boolean(rouletteBet(b.kind, b.pick)))
    const pocket = crypto.randomInt(POCKETS.length)
    const results = clean.map((b) => ({ ...b, paid: roulettePayout(b, pocket) }))
    const paid = results.reduce((a, b) => a + b.paid, 0)
    this.s.roulette.spins++
    const net = this._settle('roulette', total, paid)
    this._commit()
    return { pocket, letter: POCKETS[pocket], color: pocketColor(pocket), bets: results, total, paid, net, coins: this.economy.s.coins }
  }

  // --- Wheel of Words ---
  wheel (bets) {
    const { clean, total } = this._stake(bets, (b) => b.kind === 'word' && WHEEL_IDS.includes(b.pick))
    const segment = crypto.randomInt(WHEEL_SEGMENTS.length)
    const results = clean.map((b) => ({ ...b, paid: wheelPayout(b, segment) }))
    const paid = results.reduce((a, b) => a + b.paid, 0)
    this.s.wheel.spins++
    const net = this._settle('wheel', total, paid)
    this._commit()
    return { segment, word: WHEEL_SEGMENTS[segment], bets: results, total, paid, net, coins: this.economy.s.coins }
  }

  // --- Word Blackjack ---
  // A hand: your tiles, the dealer's (the second face down until you stand).
  bjView () {
    const h = this.s.bj
    if (!h) return null
    const dealer = h.done ? h.dealer : [h.dealer[0], '?']
    return { stake: h.stake, mine: h.mine, dealer, mineTotal: handTotal(h.mine), dealerTotal: h.done ? handTotal(h.dealer) : handTotal([h.dealer[0]]), done: h.done, result: h.result || null, word: h.word || null, paid: h.paid ?? null, doubled: Boolean(h.doubled), canDouble: !h.done && h.mine.length === 2 && this.economy.s.coins >= h.stake }
  }

  bjDeal (stake) {
    if (this.s.bj && !this.s.bj.done) throw new Error('Finish this hand first.')
    const { total } = this._stake([{ kind: 'hand', amount: stake }], () => true)
    const bag = shuffledBag(crypto.randomBytes(16).toString('hex'))
    this.s.bj = { stake: total, bag, mine: [bag.pop(), bag.pop()], dealer: [bag.pop(), bag.pop()], done: false }
    this._commit()
    return this.bjView()
  }

  _hand () {
    const h = this.s.bj
    if (!h || h.done) throw new Error('Deal a hand first.')
    return h
  }

  bjHit () {
    const h = this._hand()
    h.mine.push(h.bag.pop())
    if (handTotal(h.mine) > BJ_TARGET) return this._finish(h)
    this._commit()
    return this.bjView()
  }

  bjDouble () {
    const h = this._hand()
    if (h.mine.length !== 2) throw new Error('You can only double on your first two tiles.')
    const e = this.economy
    if (e.s.coins < h.stake) throw new Error('You don’t have the coins to double.')
    e.s.coins -= h.stake
    h.stake *= 2
    h.doubled = true
    h.mine.push(h.bag.pop())
    return this._finish(h)
  }

  bjStand () { return this._finish(this._hand()) }

  _finish (h) {
    // The dealer draws to 20 (unless you've already gone over).
    if (handTotal(h.mine) <= BJ_TARGET) while (handTotal(h.dealer) < DEALER_STANDS) h.dealer.push(h.bag.pop())
    h.result = bjResult(h.mine, h.dealer)
    h.word = h.result === 'win' ? wordInTiles(h.mine, this.byLetters) : null
    h.paid = bjPayout(h.stake, h.result, h.word)
    h.done = true
    const st = this.s.blackjack
    st.hands++
    if (h.result === 'win') st.wins++
    if (h.word) st.words++
    this._settle('blackjack', h.stake, h.paid)
    delete h.bag
    this._commit()
    return this.bjView()
  }

  view () {
    const s = this.s
    return { roulette: s.roulette, wheel: s.wheel, blackjack: s.blackjack, bj: this.bjView(), coins: this.economy.s.coins }
  }

  net () { return (this.s.roulette.net || 0) + (this.s.wheel.net || 0) + (this.s.blackjack.net || 0) }
}

export { pickFrom }
