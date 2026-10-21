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

const blankStats = () => ({ roulette: { spins: 0, net: 0, biggest: 0 }, wheel: { spins: 0, net: 0, biggest: 0 }, blackjack: { hands: 0, wins: 0, words: 0, net: 0, biggest: 0 }, bj: null, held: {} })
const MAX_BETS = 12

export class Tables {
  // byLetters(sorted): a word spelled by exactly those letters, or null.
  constructor ({ economy, byLetters = () => null }) {
    this.economy = economy
    this.byLetters = byLetters
    const b = blankStats()
    const s = economy.s.tables || {}
    economy.s.tables = { ...b, ...s, held: {}, roulette: { ...b.roulette, ...(s.roulette || {}) }, wheel: { ...b.wheel, ...(s.wheel || {}) }, blackjack: { ...b.blackjack, ...(s.blackjack || {}) } }
    // At startup no lobby is open, so bets still held at a lobby table come back.
    for (const h of Object.values(s.held || {})) { economy.s.coins += h.total || 0; economy.dirty = true }
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

  // --- lobby tables ----------------------------------------------------------------
  //
  // At a lobby table everyone plays against the house, and each app pays for
  // its own bets: they come out of my coins when I place them (held under the
  // round's key), and my app works out what I'm owed from the result itself.
  // Nobody can steer the result: with my bet I send the hash of a random seed
  // of mine, and the outcome comes from every player's seed, shown with the
  // result. My app checks every seed against its hash and the outcome against
  // the seeds before paying anything; if something doesn't add up, my bets
  // come back instead.

  // A bet at a lobby table. kind 'roulette': { bets }; 'blackjack': { stake }.
  lobbyBet (key, host, kind, payload) {
    key = String(key)
    if (this.s.held[key]) throw new Error('Your bet’s already on the table.')
    let rec
    if (kind === 'roulette') {
      const { clean, total } = this._stake(payload.bets, (b) => ROULETTE_KINDS.includes(b.kind) && Boolean(rouletteBet(b.kind, b.pick)))
      rec = { kind, bets: clean, total }
    } else if (kind === 'blackjack') {
      const { total } = this._stake([{ kind: 'hand', amount: payload.stake }], () => true)
      rec = { kind, stake: total, total }
    } else throw new Error('That isn’t a table game.')
    const seed = crypto.randomBytes(16).toString('hex')
    this.s.held[key] = { ...rec, host: String(host), seed, commit: seedHash(seed), at: Date.now() }
    this._commit()
    return { commit: this.s.held[key].commit, bets: rec.bets, stake: rec.stake }
  }

  // Doubling a blackjack hand puts the same again in.
  lobbyDouble (key) {
    const h = this.s.held[key]
    if (!h || h.kind !== 'blackjack' || h.doubled) throw new Error('You can’t double now.')
    if (this.economy.s.coins < h.stake) throw new Error('You don’t have the coins to double.')
    this.economy.s.coins -= h.stake
    h.total += h.stake
    h.doubled = true
    this._commit()
  }

  // My seed, once the betting's closed: only for the host I bet with.
  lobbySeed (key, host) {
    const h = this.s.held[String(key)]
    return h && h.host === host ? h.seed : null
  }

  heldWith (host) { return Object.entries(this.s.held).filter(([, h]) => h.host === host) }

  // My bets came back (the round never finished, or I wasn't counted).
  lobbyRefund (key) {
    const h = this.s.held[key]
    if (!h) return 0
    delete this.s.held[key]
    this.economy.s.coins += h.total
    this._commit()
    return h.total
  }

  // Settles my bets from a round's result: { seeds, commits, moves? }.
  // Returns { paid, net, total, ok }, or null if I had nothing on it.
  lobbySettle (key, result, me) {
    const h = this.s.held[key]
    if (!h) return null
    const out = tableOutcome(h.kind, result, key)
    const mine = out && result.seeds?.[me] === h.seed && result.commits?.[me] === h.commit
    if (!mine) { const back = this.lobbyRefund(key); return { ok: false, paid: back, net: 0, total: h.total } }
    let paid = 0
    let extra = {}
    if (h.kind === 'roulette') {
      paid = h.bets.reduce((a, b) => a + roulettePayout(b, out.pocket), 0)
      extra = { letter: POCKETS[out.pocket] }
    } else {
      const moves = Array.isArray(result.moves?.[me]) ? result.moves[me] : []
      const hand = playHand(out.bag(me), moves)
      const doubled = moves.includes('double')
      if (doubled !== Boolean(h.doubled)) { const back = this.lobbyRefund(key); return { ok: false, paid: back, net: 0, total: h.total } }
      const res = bjResult(hand, out.dealer)
      const word = res === 'win' ? wordInTiles(hand, this.byLetters) : null
      paid = bjPayout(h.total, res, word)
      const st = this.s.blackjack
      st.hands++
      if (res === 'win') st.wins++
      if (word) st.words++
      extra = { result: res, word }
    }
    delete this.s.held[key]
    if (h.kind === 'roulette') this.s.roulette.spins++
    const net = this._settle(h.kind, h.total, paid)
    this._commit()
    return { ok: true, paid, net, total: h.total, ...extra }
  }

  // At startup no lobby is open, so anything still held comes back.
  refundAllHeld () {
    let back = 0
    for (const key of Object.keys(this.s.held)) back += this.lobbyRefund(key)
    return back
  }
}

// --- shared randomness for lobby tables -------------------------------------------------
export const seedHash = (seed) => crypto.createHash('sha256').update(String(seed)).digest('hex')
export const goodSeed = (x) => typeof x === 'string' && /^[0-9a-f]{32}$/.test(x)
export const goodCommit = (x) => typeof x === 'string' && /^[0-9a-f]{64}$/.test(x)

// One seed from everyone's, in seat-independent order. null if any seed
// doesn't match the hash its player sent with their bet.
export function combineSeeds (seeds, commits) {
  const ids = Object.keys(seeds || {}).sort()
  if (!ids.length) return null
  for (const id of ids) if (!goodSeed(seeds[id]) || commits?.[id] !== seedHash(seeds[id])) return null
  return crypto.createHash('sha256').update(ids.map((id) => `${id}:${seeds[id]}`).join('|')).digest('hex')
}

// A blackjack hand from a bag and the moves made: two tiles, then one for
// each hit (or the double).
export function playHand (bag, moves) {
  const b = [...bag]
  const hand = [b.pop(), b.pop()]
  for (const m of moves) {
    if (handTotal(hand) > BJ_TARGET) break
    if (m === 'hit' || m === 'double') hand.push(b.pop())
    if (m === 'double' || m === 'stand') break
  }
  return hand
}

// The dealer draws to 20 from their own bag.
export function dealerHand (bag) {
  const b = [...bag]
  const hand = [b.pop(), b.pop()]
  while (handTotal(hand) < DEALER_STANDS) hand.push(b.pop())
  return hand
}

// What a round's seeds decide: the pocket, or each seat's bag and the
// dealer's hand. Every seat draws from its own bag.
export function tableOutcome (kind, result, key) {
  const seed = combineSeeds(result?.seeds, result?.commits)
  if (!seed) return null
  if (kind === 'roulette') return { seed, pocket: pickFrom(seed, POCKETS.length, `roulette:${key}`) }
  return { seed, bag: (id) => shuffledBag(`${seed}:${key}:${id}`), dealer: dealerHand(shuffledBag(`${seed}:${key}:dealer`)) }
}

export { pickFrom }
