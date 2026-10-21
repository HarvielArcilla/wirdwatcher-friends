import test from 'node:test'
import assert from 'node:assert/strict'
import { WirdApp } from '../src/core/app.js'
import { POCKETS, rouletteBet, roulettePayout, ROULETTE_KINDS, freshBag, bestWord, wjResult, wjPayout, dealerHand, shuffledBag, pickFrom } from '../src/shared/tables.js'
import { tmp } from './helpers.js'

const app = () => new WirdApp({ dataDir: tmp(), settings: { lan: false, internet: false } })

test('Letter Roulette: every bet keeps the house edge between 2% and 4%', () => {
  for (const [kind, pick] of [['letter', 'Q'], ['red'], ['black'], ['vowel'], ['consonant'], ['low'], ['high'], ['word', 'cat'], ['word', 'quiz'], ['word', 'a']]) {
    assert.ok(ROULETTE_KINDS.includes(kind))
    let back = 0
    for (let p = 0; p < POCKETS.length; p++) back += roulettePayout({ kind, pick, amount: 100 }, p)
    const rtp = back / POCKETS.length / 100
    assert.ok(rtp > 0.955 && rtp < 0.98, `${kind} ${pick}: returns ${rtp.toFixed(3)}`)
  }
  assert.equal(rouletteBet('word', '!!'), null)
  assert.equal(rouletteBet('letter', 'AB'), null)
})

test('Wheel of Words: spin, call consonants, buy vowels, solve', () => {
  const a = app()
  a.economy.devAddCoins(1e6)
  const t = a.tables
  t.wordFor = () => ({ word: 'banana', clue: 'A noun' })
  let g = t.wfStart(1000)
  assert.deepEqual(g.pattern, [null, null, null, null, null, null])
  assert.equal(g.word, null, 'the word stays hidden')
  assert.throws(() => t.wfCall('N'), /Spin first/)
  // Spin until it lands on a value, then call N (twice in banana).
  let guard = 0
  while (g.value === null && !g.done && guard++ < 100) g = t.wfSpin()
  if (!g.done) {
    const before = g.bank
    const value = g.value
    g = t.wfCall('N')
    assert.equal(g.bank, Math.floor(before + value * 1000 * 2))
    assert.deepEqual(g.pattern, [null, null, 'N', null, 'N', null])
    assert.throws(() => t.wfVowel('B'), /vowel/)
    g = t.wfSolve('bandana')
    assert.ok(g.misses >= 1, 'a wrong answer is a miss')
    const bank = g.bank
    g = t.wfSolve('banana')
    assert.ok(g.done && g.solved)
    assert.equal(g.paid, bank)
    assert.equal(g.word, 'banana')
  }
  // Six misses and it's gone.
  g = t.wfStart(100)
  for (let i = 0; i < 6 && !g.done; i++) g = t.wfSolve('nothing' + 'x'.repeat(i))
  assert.ok(g.done && !g.solved && g.paid === 0)
})

test('Wordjack: a hand is worth its best word, and going over 21 busts', () => {
  assert.equal(freshBag().length, 98)
  const dict = new Map([['act', 'cat'], ['acst', 'cats'], ['iqz', 'qiz'], ['iq', 'qi'], ['eoqtu', 'quote']])
  const bl = (k) => dict.get(k) || null
  const cat = bestWord(['T', 'A', 'C', 'X'], bl)
  assert.equal(cat.word, 'cat')
  assert.equal(cat.score, 3 + 1 + 1)
  assert.deepEqual(cat.used.sort(), [0, 1, 2], 'the X waits in the hand')
  assert.equal(bestWord(['T', 'A', 'C', 'S'], bl).word, 'cats', 'the best word scores most')
  assert.equal(bestWord(['Q', 'I', 'Z'], bl).score, 21)
  assert.equal(bestWord(['B', 'B'], bl).score, 0, 'no word, no score')
  assert.equal(wjResult(22, 10), 'bust')
  assert.equal(wjResult(15, 22), 'win')
  assert.equal(wjResult(15, 15), 'push', 'ties push')
  assert.equal(wjResult(14, 15), 'lose')
  assert.equal(wjPayout(10, 'win'), 20)
  assert.equal(wjPayout(10, 'push'), 10)
  assert.equal(wjPayout(10, 'lose'), 0)
  // The dealer draws until their best word reaches 17 (or the hand's full).
  const d = dealerHand(shuffledBag('x'), bl)
  assert.ok(bestWord(d, bl).score >= 17 || d.length >= 10)
  // The same seed shuffles the same way everywhere (lobby tables rely on it).
  assert.deepEqual(shuffledBag('abc'), shuffledBag('abc'))
  assert.notDeepEqual(shuffledBag('abc'), shuffledBag('abd'))
  assert.ok(pickFrom('seed', 27) >= 0 && pickFrom('seed', 27) < 27)
})

test('playing against the house: bets come out, winnings go back, nothing goes negative', () => {
  const a = app()
  a.economy.devAddCoins(1e6)
  const t = a.tables
  const before = a.economy.s.coins
  const r = t.roulette([{ kind: 'red', amount: 100 }, { kind: 'word', pick: 'wird', amount: 50 }])
  assert.equal(Math.round(a.economy.s.coins - before), Math.round(r.paid - 150))
  assert.ok(POCKETS[r.pocket] === r.letter)
  assert.throws(() => t.roulette([{ kind: 'letter', pick: 'A', amount: 1e12 }]), /coins/)
  assert.throws(() => t.roulette([{ kind: 'nope', amount: 1 }]), /isn’t a bet/)
  // A hand of blackjack, to the end.
  let h = t.bjDeal(100)
  assert.equal(h.mine.length, 2)
  assert.equal(h.dealer[1], '?', 'the dealer’s second tile is face down')
  assert.throws(() => t.bjDeal(100), /Finish/)
  while (!h.done && h.mineScore < 15) h = t.bjHit()
  if (!h.done) h = t.bjStand()
  assert.ok(['win', 'lose', 'push', 'bust'].includes(h.result))
  if (h.result !== 'bust') assert.ok(h.dealerScore >= 17 || h.dealer.length >= 10 || h.result === 'win')
  assert.equal(t.view().blackjack.hands, 1)
  // Bankrupt players can't play.
  a.economy.s.bankrupt = { at: 0, discharged: 1, need: 1e9, earned: 0, until: Infinity, n: 1 }
  assert.throws(() => t.roulette([{ kind: 'red', amount: 1 }]), /bankrupt/)
})
