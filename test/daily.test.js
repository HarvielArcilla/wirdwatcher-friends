import test from 'node:test'
import assert from 'node:assert/strict'
import { WirdApp } from '../src/core/app.js'
import { questsFor, utcWeek } from '../src/core/daily.js'
import { tmp } from './helpers.js'

function app (t0 = Date.UTC(2026, 9, 20, 9)) {
  const clock = { t: t0 }
  const a = new WirdApp({ dataDir: tmp(), settings: { lan: false, internet: false }, now: () => new Date(clock.t) })
  a.clock = clock
  return a
}

test('the same quests and the same Daily Clues word for everyone, by UTC day', () => {
  const a = app()
  const b = app()
  assert.deepEqual(questsFor('2026-10-20'), questsFor('2026-10-20'))
  assert.notDeepEqual(questsFor('2026-10-20'), questsFor('2026-10-21'))
  assert.equal(a.daily.word(), b.daily.word())
  assert.equal(questsFor('2026-10-20').length, 3)
  assert.ok(questsFor('2026-10-20').some((q) => q.kind === 'words' || q.kind === 'topic'), 'always one about rating')
  assert.equal(utcWeek(Date.UTC(2026, 9, 22)), '2026-10-19', 'weeks start on Monday')
})

test('quests count what you do and pay when claimed; all three in a row builds a streak', () => {
  const a = app()
  a.daily.s.day = null
  const day = a.daily.view().day
  // Make today's quests easy to finish by doing a bit of everything.
  const words = a.words.sorted.filter((w) => /^[a-z]{5,8}$/.test(w)).slice(1000, 1040)
  a.economy.devAddCoins(1e6)
  for (const w of words) { a.clock.t += 4000; a.rate(w, 3) }
  for (const q of questsFor(day)) {
    if (q.kind === 'topic') { const pool = a.words.byTopic.get(q.topic).map((i) => a.words.list[i][0]).filter((w) => !a.store.rating(w)).slice(0, q.n); for (const w of pool) { a.clock.t += 4000; a.rate(w, 2) } }
    for (let i = 0; i < q.n; i++) a.daily.note(q.kind)
  }
  const v = a.daily.view()
  for (const q of v.quests) assert.equal(q.have, q.n, `${q.text} done`)
  const before = a.economy.s.coins
  a.daily.claim(v.quests[0].id)
  assert.throws(() => a.daily.claim(v.quests[0].id), /Already/)
  a.daily.claim(v.quests[1].id)
  const last = a.daily.claim(v.quests[2].id)
  assert.equal(last.all, true)
  assert.equal(last.streak, 1)
  assert.ok(a.economy.s.coins > before)
  // The next day starts fresh.
  a.clock.t += 864e5
  assert.ok(a.daily.view().quests.every((q) => !q.claimed))
})

test('Daily Clues: clues cost points, a right guess pays, and the result can be shared without the word', () => {
  const a = app()
  const word = a.daily.word()
  const start = a.daily.cluesView()
  assert.equal(start.word, null)
  // It starts with something to go on: what kind of word, a first letter, a meaning.
  assert.ok(start.clues.some((c) => c.kind === 'pos'), 'shows the kind of word')
  assert.ok(start.clues.some((c) => c.kind === 'def' || c.kind === 'syn'), 'shows a first meaning')
  assert.ok(start.pattern.some((x) => x), 'a letter is showing')
  assert.equal(start.worth, 100, 'the starting hints are free')
  a.daily.nextClue()
  a.daily.guess('notthewordatall')
  const done = a.daily.guess(word.toUpperCase())
  assert.equal(done.solved, true)
  assert.equal(done.points, 100 - 12 - 10)
  assert.ok(done.coins > 0)
  assert.equal(done.word, word)
  assert.ok(!done.share.toLowerCase().includes(word), 'the share text doesn’t give it away')
  assert.equal(a.daily.public().solved, true)
  // Solving it counts for a quest about it.
  assert.equal(a.daily.s.counts.clues, 1)
})
