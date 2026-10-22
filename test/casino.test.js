import test from 'node:test'
import assert from 'node:assert/strict'
import { WirdApp } from '../src/core/app.js'
import { LETTERS, LETTER_WEIGHTS, WEIGHT_TOTAL, evaluate, PAYS, withForms } from '../src/shared/slots.js'
import { tmp } from './helpers.js'

test('Wird Slots counts everyday forms, and pays for the longest word', () => {
  const has = (w) => ['cat', 'run', 'box', 'try', 'bake', 'fly', 'go'].includes(w)
  const isWord = withForms(has)
  for (const w of ['cats', 'boxes', 'tries', 'baked', 'tried', 'ran', 'went', 'flies']) assert.ok(isWord(w), w)
  for (const w of ['catss', 'ca', 'zzz']) assert.equal(isWord(w), false, w)
  // CATS beats CAT.
  assert.equal(evaluate(['c', 'a', 't', 's', 'x'], isWord).word, 'cats')
})

test('Wird Slots pays back about 95%, worked out over every possible spin', () => {
  const app = new WirdApp({ dataDir: tmp(), settings: { lan: false, internet: false } })
  const isWord = withForms((w) => app.words.has(w))
  // Every combination of five letters, weighted by how likely it is.
  const p = LETTERS.map((k) => LETTER_WEIGHTS[k] / WEIGHT_TOTAL)
  let rtp = 0
  let jackpot = 0
  const reels = new Array(5)
  for (let a = 0; a < 26; a++) {
    reels[0] = LETTERS[a]
    for (let b = 0; b < 26; b++) {
      reels[1] = LETTERS[b]
      const pab = p[a] * p[b]
      for (let c = 0; c < 26; c++) {
        reels[2] = LETTERS[c]
        const pabc = pab * p[c]
        for (let d = 0; d < 26; d++) {
          reels[3] = LETTERS[d]
          const pabcd = pabc * p[d]
          for (let e = 0; e < 26; e++) {
            reels[4] = LETTERS[e]
            const hit = evaluate(reels, isWord)
            if (hit.mult) { rtp += pabcd * p[e] * hit.mult; if (hit.len === 5) jackpot += pabcd * p[e] }
          }
        }
      }
    }
  }
  assert.ok(rtp > 0.92 && rtp < 0.98, `return to player ${rtp.toFixed(4)}`)
  assert.ok(jackpot > 1 / 1000 && jackpot < 1 / 200, `a jackpot about 1 in ${Math.round(1 / jackpot)}`)
})

test('spins: bets, wins, stats, a free spin a day, and no ink from luck', () => {
  let t = Date.UTC(2026, 9, 20, 9)
  const app = new WirdApp({ dataDir: tmp(), settings: { lan: false, internet: false }, now: () => new Date(t) })
  app.economy.devAddCoins(100000)
  const ink = app.economy.s.allCoins
  let wins = 0
  for (let i = 0; i < 300; i++) { const r = app.economy.spin(10); if (r.won) { wins++; assert.equal(r.won, Math.floor(10 * PAYS[r.len])) } }
  assert.ok(wins > 30, 'words come up often')
  assert.equal(app.economy.s.slots.spins, 300)
  assert.equal(app.economy.s.allCoins, ink)
  assert.throws(() => app.economy.spin(1e12), /don’t have/)
  const before = app.economy.s.coins
  const free = app.economy.spin(0, { free: true })
  assert.equal(app.economy.s.coins, before + free.won, 'the free spin costs nothing')
  assert.throws(() => app.economy.spin(0, { free: true }), /free spin is used/)
  t += 864e5
  app.economy.spin(0, { free: true })
})
