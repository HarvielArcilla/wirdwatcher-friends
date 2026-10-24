import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { WirdApp } from '../src/core/app.js'
import { blend, validWord, newGame, step, evolve, devolve, pop, popAll, totals, serialize, restore } from '../src/shared/catchword/sim.js'
import { REGIONS, REGION } from '../src/shared/catchword/regions.js'
import { TRAITS, TRAIT, canEvolve, canDevolve, traitCost } from '../src/shared/catchword/traits.js'
import { MIN_RATED_CW } from '../src/shared/catchword/content.js'
import { tmp } from './helpers.js'

const app = () => new WirdApp({ dataDir: tmp(), settings: { lan: false, internet: false } })
const MAP = JSON.parse(fs.readFileSync(new URL('../src/renderer/catchword/map.json', import.meta.url)))

// Plays like a sensible person: spread everywhere first, absorb at the end.
const EARLY = ['mouth', 'chat', 'school', 'market', 'airport', 'dock', 'punchy', 'rhyme', 'lowkey', 'memes', 'lyrics', 'radio', 'loanword', 'office', 'translate', 'multilingual', 'etymology', 'generations', 'register', 'academic', 'autocorrect', 'cruise', 'jetset', 'reinvent']
const LATE = ['ironic', 'plural', 'crossword', 'verb', 'spellingbee', 'grandma', 'everyday']
function play (g) {
  while (!g.over && g.day < 3000) {
    step(g)
    if (g.over) break
    for (const b of g.bubbles.slice()) if (b.kind === 'purist') pop(g, b.id)
    popAll(g, false)
    const t = totals(g)
    const late = (Object.values(g.regions).every((z) => z.seen) && t.u / t.world < 0.35) || g.ruled
    for (const id of late ? [...LATE, ...EARLY] : EARLY) {
      if (g.traits.includes(id) || !canEvolve(id, g.traits)) continue
      if (g.buzz >= traitCost(id, g.traits)) evolve(g, id)
      break
    }
  }
  return g
}

test('Catchword’s world: every region is on the map, borders go both ways', () => {
  for (const r of REGIONS) {
    assert.ok(MAP.regions[r.id]?.paths.length, `${r.id} is drawn`)
    assert.ok(MAP.regions[r.id].dots.length >= 10, `${r.id} has dots`)
    for (const n of r.land) assert.ok(REGION[n].land.includes(r.id), `${r.id} ↔ ${n}`)
  }
  for (const t of TRAITS) for (const q of t.req) assert.equal(TRAIT[q]?.tree, t.tree, `${t.id} needs ${q} from its own tree`)
})

test('Catchword blends two words into a new one', () => {
  for (const [a, b] of [['pastry', 'disinfectant'], ['velvet', 'thunder'], ['tax', 'gravy'], ['eye', 'sky'], ['serendipity', 'lullaby']]) {
    const w = blend(a, b)
    assert.ok(validWord(w), `${a} + ${b} → ${w}`)
    assert.notEqual(w, a)
  }
})

test('Catchword: spread well and the world absorbs it; the same seed plays the same', () => {
  const a = play(newGame({ word: 'snorkle', start: 'usa', difficulty: 'casual', seed: 'x1' }))
  assert.equal(a.over.won, true, a.over.why)
  assert.equal(totals(a).u, 0)
  const b = play(newGame({ word: 'snorkle', start: 'usa', difficulty: 'casual', seed: 'x1' }))
  assert.equal(b.day, a.day)
  // Absorbing it too soon burns it out before it's travelled.
  const c = newGame({ word: 'snorkle', start: 'japan', difficulty: 'normal', seed: 'x2' })
  c.traits = ['punchy', 'ironic', 'plural', 'verb', 'grandma', 'everyday']
  while (!c.over) step(c)
  assert.equal(c.over.won, false)
  assert.ok(c.stats.regions < REGIONS.length)
})

test('Catchword: evolving costs buzz and needs what comes before; devolving only leaves', () => {
  const g = newGame({ word: 'zib', start: 'brazil', seed: 'e' })
  g.buzz = 100
  assert.throws(() => evolve(g, 'memes'), /first/)
  evolve(g, 'mouth')
  evolve(g, 'chat')
  evolve(g, 'memes')
  assert.equal(canDevolve('chat', g.traits), false, 'memes needs chat')
  assert.throws(() => devolve(g, 'chat'), /relies/)
  devolve(g, 'memes')
  assert.deepEqual(g.traits, ['mouth', 'chat'])
  g.buzz = 0
  assert.throws(() => evolve(g, 'school'), /buzz/)
  // Saves as plain JSON.
  const back = restore(JSON.parse(JSON.stringify(serialize(g))))
  assert.deepEqual(back.traits, g.traits)
})

test('Catchword on this computer: coin words, finish once, earn looks and coins', () => {
  const a = app()
  assert.throws(() => a.catchword.start({ word: 'zib', start: 'usa' }), /Rate at least/)
  for (let i = 0; i < MIN_RATED_CW + 4; i++) { const d = a.game.deal('everyday'); a.rate(d.word, (i % 11) / 2) }
  const coined = a.catchword.coin()
  assert.ok(coined.length >= 1 && coined.every((c) => validWord(c.word) && c.from.length === 2))
  assert.throws(() => a.catchword.start({ word: 'x', start: 'usa' }), /letters/)
  const { game } = a.catchword.start({ word: coined[0].word, from: coined[0].from, start: 'usa', difficulty: 'casual' })
  assert.ok(a.economy.s.owned.includes('title:cw-coiner'))
  assert.throws(() => a.catchword.end(game), /finished/)
  play(game)
  assert.equal(game.over.won, true)
  assert.equal(a.catchword.save(game), true)
  const before = a.economy.s.coins
  const res = a.catchword.end(game)
  assert.ok(res.coins > 0 && a.economy.s.coins > before)
  assert.ok(res.looks.some((l) => l.id === 'cw-globe'))
  assert.throws(() => a.catchword.end(game), /finished/, 'only once')
  assert.equal(a.catchword.view().progress.words[0].word, coined[0].word)
  assert.throws(() => a.economy.buyCosmetic('title', 'cw-lingua'), /Catchword/)
})

test('Catchword: ships have sea lanes between every pair of ports', () => {
  const ports = REGIONS.filter((r) => r.port).map((r) => r.id)
  for (const a of ports) for (const b of ports) if (a < b) assert.ok(MAP.sea[`${a}|${b}`]?.length, `${a} ↔ ${b}`)
})
