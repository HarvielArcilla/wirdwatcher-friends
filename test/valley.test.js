import test from 'node:test'
import assert from 'node:assert/strict'
import { WirdApp } from '../src/core/app.js'
import { GODS, GOD_IDS, CROPS, FISH, BUGS, HEART, FIELD, ACTIVITIES, PLACES, WHERE, isRainy, dayKey, taste, itemInfo, SHOP, forestRound, starsTonight, outingPoints } from '../src/shared/valley.js'
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
  return { a, clock, v: a.valley }
}

test('every god is whole: lines, scenes, reactions, tastes and favourite outings', () => {
  for (const id of GOD_IDS) {
    const g = GODS[id]
    for (const k of ['t0', 't1', 't2', 'dating', 'married']) assert.ok(g.lines[k].length >= 3, `${id} has ${k} lines`)
    for (const h of [2, 4, 6, 8]) assert.ok(g.events[h].length >= 2)
    for (const k of ['love', 'like', 'neutral', 'dislike', 'hate', 'birthday']) assert.ok(g.react[k])
    for (const x of [...g.loves, ...g.likes, ...g.dislikes, ...g.hates]) assert.ok(itemInfo(x), `${id}: ${x} is a real item`)
    assert.ok(g.fav.length && g.fav.every((a) => ACTIVITIES[a]))
    assert.ok(g.outing.invite && g.outing.fav && g.outing.after)
    assert.ok(g.cheer.yay.length && g.cheer.aw.length)
    for (const part of ['morning', 'day', 'evening', 'night']) assert.ok(PLACES.includes(WHERE[part][id][0]), `${id} is somewhere real in the ${part}`)
  }
})

test('the field: till, plant, water, and crops grow only while the soil is wet', () => {
  const { v, clock } = app(dryStart())
  const i = v.view().field.findIndex((c) => !c.decor)
  assert.throws(() => v.plant(i, 'seed:syllabeet'), /Till/)
  v.till(i)
  v.plant(i, 'seed:syllabeet')
  clock.t += 6 * H
  assert.equal(v.view().field[i].ready, false, 'dry soil: nothing grows')
  v.water(i)
  clock.t += CROPS.syllabeet.hours * H + 60e3
  assert.equal(v.view().field[i].ready, true)
  const coins = v.economy.s.coins
  v.harvest(i)
  assert.equal(v.view().field[i].crop, undefined)
  assert.equal(v.view().field[i].soil, 'tilled', 'the soil stays tilled')
  v.sell('syllabeet', 1)
  assert.equal(v.economy.s.coins - coins, CROPS.syllabeet.sell)
  // Weeds and stones come off with the hoe first.
  const w = v.view().field.findIndex((c) => c.decor)
  if (w >= 0) { assert.ok(v.till(w).cleared); assert.ok(v.till(w).tilled) }
  assert.equal(v.view().field.length, FIELD)
})

test('every new word drops a seed of itself, whatever it was rated', () => {
  const { a, v } = app(dryStart())
  a.rate('tranquil', 1)
  a.rate('zephyr', 5)
  const bag = v.view().bag.map((x) => x.id)
  assert.ok(bag.includes('wordseed:tranquil') && bag.includes('wordseed:zephyr'))
})

test('gods: a chat a day, two gifts a week, an outing a day, dating and marriage', () => {
  const { v, clock } = app(dryStart())
  const r1 = v.talk('vela')
  assert.ok(r1.gained > 0 && r1.lines.length)
  assert.equal(v.talk('vela').gained, 0, 'once a day')
  assert.equal(taste('vela', 'melon'), 'love')
  assert.equal(taste('vela', 'word:aeiou'), 'love')
  assert.equal(taste('hush', 'word:knight'), 'love')
  assert.equal(taste('glyph', 'glasswing'), 'love')
  v.s.bag.melon = 5
  v.gift('vela', 'melon')
  v.gift('vela', 'melon')
  assert.throws(() => v.gift('vela', 'melon'), /two gifts/)
  // Outings: favourites count for more, and one a day.
  const o = v.outing('vela', 'stars', 1)
  assert.ok(o.fav && o.points === outingPoints('vela', 'stars', 1) && o.points > outingPoints('vela', 'farming', 1))
  assert.throws(() => v.outing('vela', 'fishing', 1), /rest/)
  clock.t += 11 * 60e3
  assert.ok(v.outing('vela', 'fishing', 1).points > 0, 'again after ten minutes')
  v.economy.s.coins = 1e6
  v.buy('bouquet', 1)
  assert.throws(() => v.gift('vela', 'bouquet'), /8 hearts/)
  v.s.gods.vela.points = 8 * HEART
  assert.ok(v.gift('vela', 'bouquet').dating)
  v.buy('quill', 1)
  v.s.gods.vela.points = 10 * HEART
  assert.ok(v.gift('vela', 'quill').married && v.view().spouse === 'vela')
  clock.t += 24 * H
  assert.equal(v.talk('vela').event, 2)
})

test('the woods, the meadow, the stars and the lake', () => {
  const t0 = dryStart()
  const { v, clock } = app(t0)
  // Foraging: the woods have a handful of things until they refill.
  const items = v.view().forest.items
  assert.ok(items.length >= 5)
  const got = v.forage(items[0].id)
  assert.ok(got.info && got.left === items.length - 1)
  assert.throws(() => v.forage(items[0].id), /Nothing/)
  assert.equal(forestRound(t0).items.length, forestRound(t0 + 60e3).items.length)
  // Butterflies.
  let n = 0
  v.random = () => (n++ % 97) / 97
  const round = v.netStart()
  assert.ok(round.bugs.length && round.bugs.every((b) => BUGS[b.kind]))
  assert.ok(v.netCatch(round.bugs[0].id).info)
  assert.throws(() => v.netCatch(round.bugs[0].id), /Missed/)
  clock.t += 60e3
  assert.throws(() => v.netCatch(round.bugs[1].id), /quiet/)
  // Stars: only at night, once a night.
  assert.throws(() => v.stars('X'), /after 9/)
  clock.t = new Date(2026, 9, 21, 22, 30).getTime()
  const word = starsTonight(clock.t).word
  assert.throws(() => v.stars('NOPE'), /not quite/)
  assert.equal(v.stars(word).item, 'stardust')
  assert.throws(() => v.stars(word), /Another rises/)
  clock.t += 10 * 60e3
  assert.notEqual(starsTonight(clock.t).night, starsTonight(clock.t - 10 * 60e3).night, 'a new constellation every ten minutes')
  // Fishing.
  for (let i = 0; i < 20; i++) {
    const c = v.cast()
    clock.t += c.bite + 100
    const r = v.reel(true)
    assert.ok(r.got && FISH[r.fish])
  }
  v.cast()
  assert.ok(v.reel(true).early)
  assert.ok(SHOP.length >= 10)
})
