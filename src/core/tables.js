// The Casino's table games, you against the house: Letter Roulette,
// Wordjack and the word wheel. The rules are in src/shared/tables.js
// (lobby tables use the same ones). Bets come out of your coins when you
// place them and winnings go back in; like the coinflip, luck isn't
// "earned", so none of it counts toward ink. Bankrupt players can't play.

import crypto from 'node:crypto'
import {
  POCKETS, pocketColor, rouletteBet, roulettePayout, ROULETTE_KINDS,
  shuffledBag, lexicon, bestWord, wjResult, wjPayout, handDone, playHand, dealerHand, WJ_TARGET, MAX_TILES,
  WF_SEGMENTS, WF_MISSES, WF_VOWEL, WF_VOWELS, WF_MIN_STAKE, wfValue, wfPattern, pickFrom
} from '../shared/tables.js'
import { PC_LEVELS, PC_MIN_STAKE, pcMult, pcPayout, pcFirstCrack } from '../shared/penguin.js'

const blankStats = () => ({ roulette: { spins: 0, net: 0, biggest: 0 }, wheel: { spins: 0, words: 0, solved: 0, net: 0, biggest: 0 }, blackjack: { hands: 0, wins: 0, jacks: 0, net: 0, biggest: 0 }, penguin: { runs: 0, crossed: 0, best: 0, net: 0, biggest: 0 }, pc: null, bj: null, wf: null, held: {} })
const MAX_BETS = 12

export class Tables {
  // byLetters: the words Wordjack knows (lexicon() in src/shared/tables.js).
  // wordFor(): a word for the wheel, { word, clue }.
  constructor ({ economy, byLetters = lexicon(() => []), wordFor = () => null }) {
    this.economy = economy
    this.byLetters = byLetters
    this.wordFor = wordFor
    const b = blankStats()
    const s = economy.s.tables || {}
    economy.s.tables = { ...b, ...s, held: {}, roulette: { ...b.roulette, ...(s.roulette || {}) }, wheel: { ...b.wheel, ...(s.wheel || {}) }, blackjack: { ...b.blackjack, ...(s.blackjack || {}) }, penguin: { ...b.penguin, ...(s.penguin || {}) } }
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
  // The puzzle as you see it: the blanks, never the word until it's over.
  wfView () {
    const g = this.s.wf
    if (!g) return null
    return {
      stake: g.stake,
      pattern: g.done ? [...g.word.toUpperCase()] : wfPattern(g.word, g.called),
      clue: g.clue,
      called: g.called,
      misses: g.misses,
      maxMisses: WF_MISSES,
      bank: Math.floor(g.bank),
      segment: g.segment ?? null, // where the last spin landed
      value: g.value ?? null, // a value waiting for a consonant (a share of the stake)
      coinsUp: g.value ? wfValue(g.value, g.stake) : null, // the same, in coins
      vowelCost: Math.ceil(g.stake * WF_VOWEL),
      consonantsLeft: [...new Set(g.word.toUpperCase())].some((l) => !WF_VOWELS.has(l) && !g.called.includes(l)),
      done: g.done,
      solved: Boolean(g.solved),
      word: g.done ? g.word : null,
      paid: g.paid ?? null,
      last: g.last || null
    }
  }

  _wf () {
    const g = this.s.wf
    if (!g || g.done) throw new Error('Start a word first.')
    return g
  }

  wfStart (stake) {
    if (this.s.wf && !this.s.wf.done) throw new Error('Finish this word first.')
    if (!(Math.floor(Number(stake)) >= WF_MIN_STAKE)) throw new Error(`The Wheel of Words starts at ${WF_MIN_STAKE} coins.`)
    const pick = this.wordFor()
    if (!pick?.word) throw new Error('No words to play with.')
    const { total } = this._stake([{ kind: 'word', amount: stake }], () => true)
    this.s.wf = { stake: total, word: pick.word.toLowerCase(), clue: pick.clue || null, called: [], misses: 0, bank: 0, done: false }
    this.s.wheel.words++
    this._commit()
    return this.wfView()
  }

  _miss (g, why) {
    g.misses++
    g.last = why
    if (g.misses >= WF_MISSES) return this._wfEnd(g, false)
    this._commit()
    return this.wfView()
  }

  wfSpin () {
    const g = this._wf()
    if (g.value) throw new Error('Call a consonant first.')
    if (!this.wfView().consonantsLeft) throw new Error('There are no consonants left: buy a vowel or solve it.')
    const segment = crypto.randomInt(WF_SEGMENTS.length)
    const v = WF_SEGMENTS[segment]
    g.segment = segment
    this.s.wheel.spins++
    if (v === 'bankrupt') { g.bank = 0; g.last = { kind: 'bankrupt' }; this._commit(); return this.wfView() }
    if (v === 'lose') return this._miss(g, { kind: 'lose' })
    g.value = v
    g.last = { kind: 'value', value: wfValue(v, g.stake) }
    this._commit()
    return this.wfView()
  }

  wfCall (letter) {
    const g = this._wf()
    const l = String(letter || '').toUpperCase()
    if (!g.value) throw new Error('Spin first.')
    if (!/^[A-Z]$/.test(l) || WF_VOWELS.has(l)) throw new Error('Call a consonant.')
    if (g.called.includes(l)) throw new Error('That one’s been called.')
    g.called.push(l)
    const n = [...g.word.toUpperCase()].filter((x) => x === l).length
    const value = g.value
    g.value = null
    if (!n) return this._miss(g, { kind: 'none', letter: l })
    // Each time the letter's in the word pays what the space was worth.
    const each = wfValue(value, g.stake)
    g.bank += each * n
    g.last = { kind: 'hit', letter: l, n, each, won: each * n }
    this._commit()
    return this.wfView()
  }

  wfVowel (letter) {
    const g = this._wf()
    const l = String(letter || '').toUpperCase()
    if (g.value) throw new Error('Call a consonant first.')
    if (!WF_VOWELS.has(l)) throw new Error('That isn’t a vowel.')
    if (g.called.includes(l)) throw new Error('That one’s been called.')
    const cost = Math.ceil(g.stake * WF_VOWEL)
    if (g.bank < cost) throw new Error(`A vowel costs ${cost.toLocaleString()} from your bank.`)
    g.bank -= cost
    g.called.push(l)
    const n = [...g.word.toUpperCase()].filter((x) => x === l).length
    g.last = { kind: 'vowel', letter: l, n, cost }
    this._commit()
    return this.wfView()
  }

  wfSolve (guess) {
    const g = this._wf()
    if (g.value) throw new Error('Call a consonant first.')
    const t = String(guess || '').toLowerCase().replace(/[^a-z]/g, '')
    if (!t) throw new Error('Type the word.')
    if (t === g.word) return this._wfEnd(g, true)
    return this._miss(g, { kind: 'wrong', guess: t.slice(0, 20) })
  }

  _wfEnd (g, solved) {
    g.done = true
    g.solved = solved
    g.paid = solved ? Math.floor(g.bank) : 0
    g.last = { kind: solved ? 'solved' : 'out' }
    if (solved) this.s.wheel.solved++
    this._settle('wheel', g.stake, g.paid)
    this._commit()
    return this.wfView()
  }

  // --- Wordjack ---
  // (Kept under its old name, blackjack, in saved games.)
  // A hand: your tiles and best word, the dealer's (the second tile face
  // down until you stand).
  bjView () {
    const h = this.s.bj
    if (!h) return null
    const mine = bestWord(h.mine, this.byLetters)
    const dealer = h.done ? h.dealer : [h.dealer[0], '?']
    const theirs = h.done ? bestWord(h.dealer, this.byLetters) : { word: null, score: null, used: [] }
    return {
      stake: h.stake,
      mine: h.mine,
      mineWord: mine.word,
      mineScore: mine.score,
      mineUsed: mine.used,
      dealer,
      dealerWord: theirs.word,
      dealerScore: theirs.score,
      dealerUsed: theirs.used,
      done: h.done,
      result: h.result || null,
      paid: h.paid ?? null,
      doubled: Boolean(h.doubled),
      canDouble: !h.done && h.mine.length === 2 && this.economy.s.coins >= h.stake,
      full: h.mine.length >= MAX_TILES
    }
  }

  bjDeal (stake) {
    if (this.s.bj && !this.s.bj.done) throw new Error('Finish this hand first.')
    const { total } = this._stake([{ kind: 'hand', amount: stake }], () => true)
    const bag = shuffledBag(crypto.randomBytes(16).toString('hex'))
    this.s.bj = { stake: total, bag, mine: [bag.pop(), bag.pop()], dealer: [bag.pop(), bag.pop()], done: false }
    if (handDone(this.s.bj.mine, this.byLetters)) return this._finish(this.s.bj)
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
    if (h.mine.length >= MAX_TILES) throw new Error('Your hand’s full.')
    h.mine.push(h.bag.pop())
    if (handDone(h.mine, this.byLetters)) return this._finish(h)
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
    const mine = bestWord(h.mine, this.byLetters).score
    // The dealer draws to 17 (unless you've already gone over).
    if (mine <= WJ_TARGET) h.dealer = dealerHand(h.bag, this.byLetters, h.dealer)
    h.result = wjResult(mine, bestWord(h.dealer, this.byLetters).score)
    h.paid = wjPayout(h.stake, h.result, mine)
    h.done = true
    const st = this.s.blackjack
    st.hands++
    if (h.result === 'win') st.wins++
    if (mine === WJ_TARGET) st.jacks = (st.jacks || 0) + 1
    this._settle('blackjack', h.stake, h.paid)
    delete h.bag
    this._commit()
    return this.bjView()
  }

  // --- Penguin Cross ---
  // (Rules in src/shared/penguin.js.) Which island crumbles gets decided when you
  // start, and stays on this computer until the run ends.
  pcView () {
    const g = this.s.pc
    if (!g) return null
    const lanes = g.word.length
    return {
      stake: g.stake,
      level: g.level,
      lanes,
      at: g.at, // lanes crossed safely
      letters: [...g.word.toUpperCase()].map((l, i) => (i < g.at || g.done ? l : null)),
      clue: g.clue,
      mults: Array.from({ length: lanes }, (_, i) => pcMult(g.level, i + 1)),
      cashNow: g.at > 0 && !g.done ? pcPayout(g.stake, g.level, g.at) : null,
      done: g.done,
      hit: g.done && g.hit !== null ? g.hit : null, // the island that crumbled
      crossed: g.done && g.at === lanes,
      word: g.done ? g.word : null,
      paid: g.paid ?? null
    }
  }

  pcStart (stake, level = 'medium') {
    if (this.s.pc && !this.s.pc.done) throw new Error('Finish this crossing first.')
    if (!PC_LEVELS[level]) throw new Error('Pick the ice.')
    if (!(Math.floor(Number(stake)) >= PC_MIN_STAKE)) throw new Error('Bet at least 1 coin.')
    const pick = this.wordFor()
    if (!pick?.word) throw new Error('No words to play with.')
    const { total } = this._stake([{ kind: 'run', amount: stake }], () => true)
    const word = pick.word.toLowerCase()
    const crack = pcFirstCrack(level, word.length, () => crypto.randomInt(1e9) / 1e9)
    this.s.pc = { stake: total, level, word, clue: pick.clue || null, crack, at: 0, hit: null, done: false }
    this.s.penguin.runs++
    this._commit()
    return this.pcView()
  }

  _pc () {
    const g = this.s.pc
    if (!g || g.done) throw new Error('Start a crossing first.')
    return g
  }

  pcHop () {
    const g = this._pc()
    if ((g.crack ?? g.car) === g.at) { g.hit = g.at; return this._pcEnd(g, 0) }
    g.at++
    if (g.at === g.word.length) { this.s.penguin.crossed++; return this._pcEnd(g, pcPayout(g.stake, g.level, g.at)) }
    this._commit()
    return this.pcView()
  }

  pcCash () {
    const g = this._pc()
    if (g.at < 1) throw new Error('Hop to an island first.')
    return this._pcEnd(g, pcPayout(g.stake, g.level, g.at))
  }

  _pcEnd (g, paid) {
    g.done = true
    g.paid = paid
    if (paid) this.s.penguin.best = Math.max(this.s.penguin.best || 0, pcMult(g.level, g.at))
    this._settle('penguin', g.stake, paid)
    this._commit()
    return this.pcView()
  }

  view () {
    const s = this.s
    return { roulette: s.roulette, wheel: s.wheel, blackjack: s.blackjack, penguin: s.penguin, bj: this.bjView(), wf: this.wfView(), pc: this.pcView(), coins: this.economy.s.coins }
  }

  net () { return (this.s.roulette.net || 0) + (this.s.wheel.net || 0) + (this.s.blackjack.net || 0) + (this.s.penguin.net || 0) }

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
    const out = tableOutcome(h.kind, result, key, this.byLetters)
    const mine = out && result.seeds?.[me] === h.seed && result.commits?.[me] === h.commit
    if (!mine) { const back = this.lobbyRefund(key); return { ok: false, paid: back, net: 0, total: h.total } }
    let paid = 0
    let extra = {}
    if (h.kind === 'roulette') {
      paid = h.bets.reduce((a, b) => a + roulettePayout(b, out.pocket), 0)
      extra = { letter: POCKETS[out.pocket] }
    } else {
      const moves = Array.isArray(result.moves?.[me]) ? result.moves[me] : []
      const hand = playHand(out.bag(me), moves, this.byLetters)
      const doubled = moves.includes('double')
      if (doubled !== Boolean(h.doubled)) { const back = this.lobbyRefund(key); return { ok: false, paid: back, net: 0, total: h.total } }
      const best = bestWord(hand, this.byLetters)
      const res = wjResult(best.score, bestWord(out.dealer, this.byLetters).score)
      const word = best.word
      paid = wjPayout(h.total, res, best.score)
      const st = this.s.blackjack
      st.hands++
      if (res === 'win') st.wins++
      if (best.score === WJ_TARGET) st.jacks = (st.jacks || 0) + 1
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

// What a round's seeds decide: the pocket, or each seat's bag and the
// dealer's hand. Every seat draws from its own bag.
export function tableOutcome (kind, result, key, byLetters) {
  const seed = combineSeeds(result?.seeds, result?.commits)
  if (!seed) return null
  if (kind === 'roulette') return { seed, pocket: pickFrom(seed, POCKETS.length, `roulette:${key}`) }
  return { seed, bag: (id) => shuffledBag(`${seed}:${key}:${id}`), dealer: dealerHand(shuffledBag(`${seed}:${key}:dealer`), byLetters) }
}

export { pickFrom }
