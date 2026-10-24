import test from 'node:test'
import assert from 'node:assert/strict'
import { WirdApp } from '../src/core/app.js'
import * as T from '../src/shared/tycoon/sim.js'
import { SUBJECTS, FORMATS, MEDIA, subjectFit, mediumFit } from '../src/shared/tycoon/content.js'
import { tmp } from './helpers.js'

const app = () => new WirdApp({ dataDir: tmp(), settings: { lan: false, internet: false } })

// Make one book, splitting the work as the format likes (or evenly).
function make (g, opts, ideal = true) {
  T.startBook(g, opts)
  while (g.project) {
    if (g.project.waiting === 'alloc') T.setAlloc(g, ideal ? T.idealAlloc(opts.format, g.project.stage) : [1, 1, 1])
    if (g.project.waiting === 'release') return T.publish(g)
    T.step(g)
  }
}

test('Wird Tycoon’s catalogue: every fit names real things', () => {
  const f = new Set(FORMATS.map((x) => x.id))
  for (const s of SUBJECTS) for (const id of [...s.great, ...s.poor]) assert.ok(f.has(id), `${s.id}: ${id}`)
  for (const m of MEDIA) for (const id of [...m.great, ...m.poor]) assert.ok(f.has(id), `${m.id}: ${id}`)
})

test('Wird Tycoon: a well-made, well-matched book reviews better than a mismatched one', () => {
  const a = T.newCompany({ seed: 'a', words: ['velvet'] })
  assert.equal(subjectFit('cooking', 'picture'), 'great')
  assert.equal(mediumFit('hardcover', 'picture'), 'great')
  const good = make(a, { subject: 'cooking', format: 'picture', medium: 'hardcover', size: 'small' })
  const b = T.newCompany({ seed: 'a', words: ['velvet'] })
  const bad = make(b, { subject: 'children', format: 'thesaurus', medium: 'hardcover', size: 'small' }, false)
  assert.ok(good.book.score > bad.book.score + 1.5, `${good.book.score} vs ${bad.book.score}`)
  assert.equal(a.known.fits['cooking|picture'], 'great', 'you learn the fit by publishing')
  assert.ok(Object.keys(a.known.hints.picture).length >= 1)
  // Sales come in over the following weeks.
  const cash = a.cash
  for (let i = 0; i < 10; i++) T.step(a)
  assert.ok(a.books[0].sold > 0 && a.cash > cash - 1)
})

test('Wird Tycoon: rules about offices, staff and research', () => {
  const g = T.newCompany({ seed: 'r' })
  assert.throws(() => T.startBook(g, { subject: 'everyday', format: 'pocket', medium: 'paperback', size: 'medium' }), /office/)
  assert.throws(() => T.startBook(g, { subject: 'law', format: 'pocket', medium: 'paperback', size: 'small' }), /Research/)
  T.refreshCandidates(g)
  assert.throws(() => T.hire(g, 0), /garage/)
  g.cash = 1e6
  T.moveOffice(g)
  T.refreshCandidates(g)
  T.hire(g, 0)
  assert.equal(g.staff.length, 2)
  g.rp = 50
  T.research(g, 'subject', 'law')
  assert.ok(g.known.subjects.includes('law'))
  // Nobody pays the bills, the bank takes it.
  g.cash = -1
  g.staff[1].salary = 1e5
  while (!g.over) T.step(g)
  assert.equal(g.over.why, 'broke')
})

test('Wird Tycoon on this computer: each book pays once, retiring pays a pension', () => {
  const a = app()
  const g = a.tycoon.start({ name: 'Inkwell Press' })
  assert.equal(g.name, 'Inkwell Press')
  make(g, { subject: 'cooking', format: 'picture', medium: 'hardcover', size: 'small' })
  const before = a.economy.s.coins
  const res = a.tycoon.save(g)
  assert.ok(res.coins > 0 && a.economy.s.coins > before)
  assert.ok(res.looks.some((l) => l.id === 'lx-publisher'))
  assert.equal(a.tycoon.save(g).coins, 0, 'only once')
  assert.throws(() => a.tycoon.end(g), /trading/)
  g.week = T.END_WEEK - 1
  T.step(g)
  assert.equal(g.over.why, 'retired')
  const end = a.tycoon.end(g)
  assert.ok(end.retired && end.pension > 0)
  assert.equal(a.tycoon.view().progress.history[0].name, 'Inkwell Press')
  assert.throws(() => a.economy.buyCosmetic('table', 'lx-desk'), /Wird Tycoon/)
})
