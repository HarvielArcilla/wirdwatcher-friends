import test from 'node:test'
import assert from 'node:assert/strict'
import { WirdApp } from '../src/core/app.js'
import { typeRating, ratingValue, nudge, levelFor, roundVerdict } from '../src/shared/progress.js'
import { tmp } from './helpers.js'

const offline = (dataDir = tmp(), now) => new WirdApp({ dataDir, settings: { lan: false, internet: false }, now })

test('rating input behaves like the original: 4 → 4., 47 → 4.7, 5 → 5.0', () => {
  assert.equal(typeRating('4'), '4.')
  assert.equal(typeRating('4.7'), '4.7')
  assert.equal(typeRating('47'), '4.7')
  assert.equal(typeRating('5'), '5.0')
  assert.equal(typeRating('9'), '')
  assert.equal(typeRating(''), '')
  assert.equal(ratingValue('4.'), null)
  assert.equal(ratingValue('3.5'), 3.5)
  assert.equal(nudge(4.9, 0.5), 5)
  assert.equal(nudge(0.2, -1), 0)
})

test('levels need more XP each time', () => {
  assert.equal(levelFor(0).level, 1)
  assert.equal(levelFor(99).level, 1)
  assert.equal(levelFor(100).level, 2)
  assert.equal(levelFor(100 + 140).level, 3)
})

test('the word list is clean and has definitions and pronunciations', () => {
  const app = offline()
  assert.ok(app.words.size > 50000)
  for (const bad of ['fuck', 'shit', 'cunt', 'nigger', 'faggot', 'bitch', 'kike', 'wetback']) assert.equal(app.words.has(bad), false, bad)
  for (const ok of ['cat', 'serendipity', 'screw', 'pig']) assert.equal(app.words.has(ok), true, ok)
  const cat = app.words.lookup('serendipity')
  assert.ok(cat.ipa.length)
  assert.match(cat.senses[0].def, /luck/)
  assert.ok(app.words.lookup('pig').senses.every((s) => !/policeman/.test(s.def)), 'disparaging senses are dropped')
  assert.ok(app.words.synonyms('happy').includes('felicitous'))
  assert.deepEqual(app.words.search('serendip'), ['serendipity', 'serendipitous'].filter((w) => app.words.has(w)).sort())
})

test('rating earns XP, streaks and badges, and is saved', () => {
  const dir = tmp()
  let day = new Date('2026-10-17T12:00:00')
  const app = offline(dir, () => day)
  const dealt = app.game.deal('everyday')
  assert.ok(dealt.word && dealt.info.senses.length)
  const first = app.game.rate(dealt.word, 5)
  assert.ok(first.xp.some((x) => x.why === 'New word'))
  assert.ok(first.xp.some((x) => x.why === 'First word today'))
  assert.ok(first.badges.some((b) => b.id === 'first'))
  assert.ok(first.badges.some((b) => b.id === 'perfect'))
  // Re-rating isn't new XP.
  assert.ok(!app.game.rate(dealt.word, 4.2).xp.some((x) => x.why === 'New word'))
  // Next day continues the streak.
  day = new Date('2026-10-18T09:00:00')
  const next = app.game.deal('shuffle').word
  const r = app.game.rate(next, 2.5)
  assert.equal(r.streak, 2)
  assert.ok(r.xp.some((x) => /2-day streak/.test(x.why)))
  app.store.flush()
  const again = offline(dir, () => day)
  assert.equal(again.store.rating(dealt.word), 4.2)
  assert.equal(again.game.profile().stats.rated, 2)
  assert.equal(again.store.progress.streak, 2)
})

test('skips words already rated, and chains walk through synonyms', () => {
  const app = offline()
  const seen = new Set()
  for (let i = 0; i < 40; i++) {
    const { word } = app.game.deal('short')
    assert.ok(!seen.has(word), `dealt ${word} twice`)
    seen.add(word)
    app.game.rate(word, 3)
  }
  const { word, chain } = app.game.deal('chain')
  assert.ok(chain.words.length >= 3)
  let result = null
  for (const w of chain.words.map((x) => x.word)) result = app.game.rate(w, 3.3)
  assert.ok(result.chainDone, 'chain complete')
  assert.ok(result.xp.some((x) => x.why === 'Chain complete'))
  assert.ok(word)
})

test('playlists, comments and favorites', () => {
  const app = offline()
  const words = ['cat', 'dog', 'owl', 'fox', 'bee', 'elk', 'yak', 'emu', 'ant', 'gnu']
  const id = app.game.createPlaylist({ name: 'Critters', emoji: '🐾', words })
  assert.equal(app.game.modes().playlists[0].total, 10)
  let last = null
  for (let i = 0; i < 10; i++) { const d = app.game.deal(`list:${id}`); last = app.game.rate(d.word, 4) }
  assert.deepEqual(last.finished, ['Critters'])
  assert.ok(app.game.deal(`list:${id}`).empty)
  const c = app.game.comment('cat', '  purrfect   word ')
  assert.equal(c.info.mine.comment, 'purrfect word')
  assert.ok(c.xp.some((x) => x.why === 'New comment'))
  assert.equal(app.game.favorite('cat', true).info.mine.favorite, true)
})

test('lobby verdicts', () => {
  assert.equal(roundVerdict({ a: 4, b: 4.3 }).hive, true)
  assert.equal(roundVerdict({ a: 0, b: 4, c: 4.5 }).hotTake, 'a')
  assert.deepEqual(roundVerdict({ a: 3, b: 3, c: 1 }).twins, [['a', 'b']])
})
