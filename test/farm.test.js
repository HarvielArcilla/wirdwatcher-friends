import test from 'node:test'
import assert from 'node:assert/strict'
import { WirdApp } from '../src/core/app.js'
import { GODS, GOD_IDS, CROPS, FISH, HEART, MAP, MAP_W, PLOTS, SPOTS, tileAt, isRainy, dayKey, taste, forageFor, itemInfo, SHOP } from '../src/shared/farm.js'
import { tmp } from './helpers.js'

const H = 3600e3
// A dry day, so watering matters.
function dryStart () {
  let t = new Date(2026, 9, 21, 9, 0, 0).getTime()
  while (isRainy(dayKey(t)) || isRainy(dayKey(t + 30 * H))) t += 24 * H
  return t
}
function app (t0) {
  const clock = { t: t0 }
  const a = new WirdApp({ dataDir: tmp(), settings: { lan: false, internet: false }, now: () => new Date(clock.t) })
  return { a, clock, f: a.farm }
}

test('the map is whole, and every god stands somewhere you can walk to', () => {
  for (const row of MAP) assert.equal(row.length, MAP_W)
  assert.ok(PLOTS.length >= 24)
  for (const [id, s] of Object.entries(SPOTS)) for (const [x, y] of Object.values(s)) assert.ok(['.', ',', 'f'].includes(tileAt(x, y)), `${id} stands on ${tileAt(x, y)}`)
  for (const id of GOD_IDS) {
    const g = GODS[id]
    for (const k of ['t0', 't1', 't2', 'dating', 'married']) assert.ok(g.lines[k].length >= 3, `${id} has ${k} lines`)
    for (const h of [2, 4, 6, 8]) assert.ok(g.events[h].length >= 2)
    for (const k of ['love', 'like', 'neutral', 'dislike', 'hate', 'birthday']) assert.ok(g.react[k])
    for (const x of [...g.loves, ...g.likes, ...g.dislikes, ...g.hates]) assert.ok(itemInfo(x), `${id}: ${x} is a real item`)
  }
  for (const f of forageFor('2026-10-21')) assert.ok(['.', 'f'].includes(tileAt(f.x, f.y)))
})

test('crops grow only while the soil is wet, and never die', () => {
  const t0 = dryStart()
  const { f, clock } = app(t0)
  f.plant(0, 'seed:syllabeet')
  clock.t += 6 * H
  assert.equal(f.view().plots[0].ready, false, 'dry soil: nothing grows')
  f.water(0)
  clock.t += CROPS.syllabeet.hours * H + 60e3
  assert.equal(f.view().plots[0].ready, true)
  const coins = f.economy.s.coins
  f.harvest(0)
  assert.equal(f.view().plots[0], null)
  f.sell('syllabeet', 1)
  assert.equal(f.economy.s.coins - coins, CROPS.syllabeet.sell)
  // Water runs out: a long crop needs watering again.
  f.economy.s.coins += 1000
  f.buy('seed:punkin', 1)
  f.plant(1, 'seed:punkin')
  f.water(1)
  clock.t += 24 * H
  if (!isRainy(dayKey(clock.t))) assert.equal(f.view().plots[1].ready, false)
  // Regrowing crops come back after a harvest.
  f.buy('seed:rhymeberry', 1)
  f.plant(2, 'seed:rhymeberry')
  f.waterAll()
  clock.t += 7 * H
  f.harvest(2)
  assert.ok(f.view().plots[2] && f.view().plots[2].regrowing)
})

test('every new word drops a seed of itself, whatever it was rated', () => {
  const { a, f } = app(dryStart())
  a.rate('tranquil', 1)
  a.rate('zephyr', 5)
  const bag = f.view().bag.map((x) => x.id)
  assert.ok(bag.includes('wordseed:tranquil') && bag.includes('wordseed:zephyr'))
  f.plant(3, 'wordseed:zephyr')
  f.water(3)
})

test('gods: a chat a day, two gifts a week, tastes, birthdays, dating and marriage', () => {
  const t0 = dryStart()
  const { f, clock } = app(t0)
  const r1 = f.talk('vela')
  assert.ok(r1.gained > 0 && r1.lines.length)
  assert.equal(f.talk('vela').gained, 0, 'once a day')
  assert.equal(taste('vela', 'melon'), 'love')
  assert.equal(taste('vela', 'page'), 'hate')
  assert.equal(taste('vela', 'word:aeiou'), 'love')
  assert.equal(taste('kip', 'word:strengths'), 'love')
  assert.equal(taste('hush', 'word:knight'), 'love')
  assert.equal(taste('glyph', 'word:quiz'), 'love')
  f.economy.s.coins = 1e6
  f.s.bag.melon = 20
  const g1 = f.gift('vela', 'melon')
  assert.equal(g1.how, 'love')
  f.gift('vela', 'melon')
  assert.throws(() => f.gift('vela', 'melon'), /two gifts/)
  // Can't date before 8 hearts.
  f.buy('bouquet', 1)
  assert.throws(() => f.gift('vela', 'bouquet'), /8 hearts/)
  f.s.gods.vela.points = 8 * HEART
  const b = f.gift('vela', 'bouquet')
  assert.ok(b.dating)
  f.buy('quill', 1)
  assert.throws(() => f.gift('vela', 'quill'), /10 hearts/)
  f.s.gods.vela.points = 10 * HEART
  const m = f.gift('vela', 'quill')
  assert.ok(m.married && f.view().spouse === 'vela')
  // Heart events come once each, when you talk.
  clock.t += 24 * H
  const ev = f.talk('vela')
  assert.equal(ev.event, 2)
  assert.notEqual(f.talk('vela').event, 2)
  // A birthday gift counts five times over.
  const [mo, d] = GODS.pip.birthday
  const { f: f2 } = app(new Date(2027, mo - 1, d, 12).getTime())
  f2.s.bag.punkin = 2
  assert.equal(f2.gift('pip', 'punkin').points, 80 * 5)
})

test('fishing: something bites, the catch goes in the bag', () => {
  let n = 0
  const { f, clock } = app(dryStart())
  f.random = () => (n++ % 97) / 97
  const seen = new Set()
  for (let i = 0; i < 60; i++) {
    const c = f.cast()
    assert.ok(c.bite >= 1500 && c.diff >= 0)
    clock.t += c.bite + 100
    const r = f.reel(true)
    assert.ok(r.got && FISH[r.fish])
    seen.add(r.fish)
  }
  assert.ok(seen.size >= 3)
  // Reeling before the bite gets nothing.
  f.cast()
  assert.ok(f.reel(true).early)
  assert.ok(SHOP.length >= 10)
})
