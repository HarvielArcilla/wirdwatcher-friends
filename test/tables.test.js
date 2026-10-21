import test from 'node:test'
import assert from 'node:assert/strict'
import { WirdApp } from '../src/core/app.js'
import { POCKETS, rouletteBet, roulettePayout, ROULETTE_KINDS, WHEEL, WHEEL_SEGMENTS, wheelPayout, freshBag, handTotal, tileValue, bjResult, bjPayout, wordInTiles, shuffledBag, pickFrom } from '../src/shared/tables.js'
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

test('Wheel of Words: 54 segments, and a word pays its length', () => {
  assert.equal(WHEEL_SEGMENTS.length, 54)
  for (const [w, n, pays] of WHEEL) {
    assert.equal(WHEEL_SEGMENTS.filter((x) => x === w).length, n)
    if (!w.startsWith('★')) assert.equal(pays, w.length)
  }
  const i = WHEEL_SEGMENTS.indexOf('WORDS')
  assert.equal(wheelPayout({ pick: 'WORDS', amount: 10 }, i), 60)
  assert.equal(wheelPayout({ pick: 'AN', amount: 10 }, i), 0)
})

test('Word Blackjack: tiles, totals, the dealer, and the word bonus', () => {
  assert.equal(freshBag().length, 98)
  assert.equal(tileValue('Q'), 11)
  assert.equal(handTotal(['C', 'A', 'T']), 4 + 2 + 2)
  assert.equal(bjResult(['Q', 'Z'], ['A']), 'bust')
  assert.equal(bjResult(['Q', 'K'], ['Z', 'B']), 'win')
  assert.equal(bjResult(['Q', 'B'], ['Z', 'B']), 'lose', 'the dealer wins ties')
  assert.equal(bjPayout(10, 'win', null), 20)
  assert.equal(bjPayout(10, 'win', 'cats'), 30)
  const dict = new Map([['acst', 'cats'], ['aelpst', 'plates']])
  assert.equal(wordInTiles(['T', 'S', 'A', 'C', 'Q'], (k) => dict.get(k) || null), 'cats')
  assert.equal(wordInTiles(['T', 'A', 'C'], (k) => dict.get(k) || null), null, 'four letters or more')
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
  const w = t.wheel([{ kind: 'word', pick: 'A', amount: 10 }])
  assert.ok(WHEEL_SEGMENTS[w.segment] === w.word)
  assert.throws(() => t.roulette([{ kind: 'letter', pick: 'A', amount: 1e12 }]), /coins/)
  assert.throws(() => t.wheel([{ kind: 'word', pick: 'NOPE', amount: 1 }]), /isn’t a bet/)
  // A hand of blackjack, to the end.
  let h = t.bjDeal(100)
  assert.equal(h.mine.length, 2)
  assert.equal(h.dealer[1], '?', 'the dealer’s second tile is face down')
  assert.throws(() => t.bjDeal(100), /Finish/)
  while (!h.done && h.mineTotal < 15) h = t.bjHit()
  if (!h.done) h = t.bjStand()
  assert.ok(['win', 'lose', 'push', 'bust'].includes(h.result))
  if (h.result !== 'bust') assert.ok(h.dealerTotal >= 20 || h.result === 'win')
  assert.equal(t.view().blackjack.hands, 1)
  // Bankrupt players can't play.
  a.economy.s.bankrupt = { at: 0, discharged: 1, need: 1e9, earned: 0, until: Infinity, n: 1 }
  assert.throws(() => t.roulette([{ kind: 'red', amount: 1 }]), /bankrupt/)
})
