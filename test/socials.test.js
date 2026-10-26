import test from 'node:test'
import assert from 'node:assert/strict'
import { WirdApp } from '../src/core/app.js'
import { feed, slotPosts, slotOf, SLOT_MS } from '../src/shared/socials/feed.js'
import { engagement, countsAt, followerGain, render } from '../src/shared/socials/player.js'
import { REGULARS, validHandle } from '../src/shared/socials/cast.js'
import { SUBS, BLUE } from '../src/shared/socials/content.js'
import { cleanRecord } from '../src/core/store.js'
import { tmp } from './helpers.js'

const T0 = Date.UTC(2026, 9, 21, 15, 0)
const app = (t = T0) => {
  let now = t
  const a = new WirdApp({ dataDir: tmp(), settings: { lan: false, internet: false }, now: () => new Date(now) })
  a.tick = (ms) => { now += ms }
  return a
}
const rateOne = (a) => { const d = a.game.deal('everyday'); a.rate(d.word, 4.5); return d.word }

test('Socials: the cast and subs are well formed', () => {
  const handles = new Set()
  for (const r of REGULARS) {
    assert.ok(validHandle(r.handle), r.handle)
    assert.ok(!handles.has(r.handle), `duplicate ${r.handle}`)
    handles.add(r.handle)
  }
  assert.equal(new Set(SUBS.map((s) => s.id)).size, SUBS.length)
  assert.ok(SUBS.some((s) => s.id === 'Wodleheads'))
  assert.ok(BLUE.every((b, i) => i === 0 || b.k > BLUE[i - 1].k))
})

test('Socials: the generated feed is the same on every client', () => {
  const a = app()
  const b = app()
  for (const site of ['writter', 'readit', 'wirdin']) {
    const fa = feed(site, a.socials.ctx, { to: T0, limit: 30 })
    const fb = feed(site, b.socials.ctx, { to: T0, limit: 30 })
    assert.ok(fa.length > 5, site)
    assert.deepEqual(fa.map((p) => [p.id, p.text]), fb.map((p) => [p.id, p.text]))
  }
  const s = slotOf(T0)
  assert.deepEqual(slotPosts(s, a.socials.ctx).map((p) => p.id), slotPosts(s, b.socials.ctx).map((p) => p.id))
  assert.notDeepEqual(slotPosts(s, a.socials.ctx).map((p) => p.text), slotPosts(s + 1, a.socials.ctx).map((p) => p.text))
})

test('Socials: player engagement is a pure function of the post', () => {
  const post = { v: 1, id: 'x', site: 'readit', sub: 'Wodleheads', kind: 'take', word: 'velvet', stance: 'buy', t: T0, f0: 120, spam: 0, extra: '' }
  const world = { hot: [], consensus: () => 3 }
  const e1 = engagement(post, world)
  const e2 = engagement({ ...post }, world)
  assert.deepEqual(e1, e2)
  const later = countsAt(post, e1, T0 + 3 * 3600e3)
  const sooner = countsAt(post, e1, T0 + 60e3)
  assert.ok(later.likes >= sooner.likes)
  assert.equal(followerGain({ ...post }, e1, T0 + 3600e3), followerGain(post, e1, T0 + 3600e3))
  const shown = render(post)
  assert.ok(shown.title || shown.text)
})

test('Socials: store keeps clean post and vote records only', () => {
  assert.equal(cleanRecord('v/abc', { seq: 1, t: T0, v: { v: 1 } })?.v.v, 1)
  assert.equal(cleanRecord('v/abc', { seq: 1, t: T0, v: { v: 7 } }), null)
  const s = cleanRecord('s/abc', { seq: 1, t: T0, v: { v: 1, id: 'abc', site: 'writter', kind: 'say', t: T0, extra: 'hi', text: 'hi', evil: 'x' } })
  assert.ok(s)
  assert.equal(s.v.evil, undefined)
})

test('Socials: handles must be words you’ve rated', () => {
  const a = app()
  assert.throws(() => a.socials.setHandle('zzzzqx'))
  assert.throws(() => a.socials.post({ kind: 'say', extra: 'hello' }), /handle/)
  const w = rateOne(a)
  a.socials.setHandle(`${w}_99`)
  assert.equal(a.socials.s.handle, `${w}_99`)
})

test('Socials: posting syncs, followers come from posts, and you can’t spam', () => {
  const a = app()
  a.socials.setHandle(rateOne(a))
  const res = a.socials.post({ site: 'writter', kind: 'say', extra: 'first wird' })
  assert.ok(res.post)
  assert.throws(() => a.socials.post({ site: 'writter', kind: 'say', extra: 'again' }), /Slow down/)
  a.tick(6 * 3600e3)
  const st = a.socials.standing()
  assert.ok(st.followers >= 0)
  assert.equal(a.socials.standing().followers, st.followers) // same moment, same answer
  a.socials.deletePost(res.post.id)
  assert.equal(a.socials.s.posts.length, 0)
})

test('Socials: Blue costs coins and payouts are capped', () => {
  const a = app()
  a.socials.setHandle(rateOne(a))
  a.economy.s.coins = 0
  assert.throws(() => a.socials.buyBlue('blue'), /Not enough/)
  a.economy.s.coins = a.socials.bluePrice('blue') + 5
  a.socials.buyBlue('blue')
  assert.equal(a.economy.s.coins, 5)
  assert.ok(a.socials.s.blue.until > T0)
  assert.ok(a.socials.bluePrice('checkcheck') > a.socials.bluePrice('blue'))
  const p = a.socials.payout()
  assert.ok(p.coins <= p.cap)
  assert.throws(() => a.socials.claimPayout(), /views/)
})

test('Socials: a feed view never shows the same post twice', () => {
  const a = app()
  for (const site of ['writter', 'readit', 'wirdin']) {
    const v = a.socials.view(site)
    const ids = v.posts.map((p) => p.id)
    assert.equal(new Set(ids).size, ids.length, site)
  }
  assert.ok(SLOT_MS > 0)
})

test('Socials: W quotes Predict’s real odds, and market posts open as threads', async () => {
  const { marketAt } = await import('../src/shared/socials/markets.js')
  const { gameById, outcomes } = await import('../src/shared/sports.js')
  for (const lg of ['vote', 'pop', 'hoops', 'gridiron', 'pitch']) {
    const m = marketAt(lg, T0)
    assert.ok(m && m.opts.length >= 2, lg)
    assert.deepEqual(marketAt(lg, T0), m)
    const g = gameById(m.id)
    assert.ok(g, m.id)
    const o = outcomes(g, Math.min(T0, g.end))
    const top = m.opts[0]
    assert.equal(top.pct, Math.round(o[top.k] * 100), lg)
  }
  const a = app()
  const posts = []
  for (let s = slotOf(T0) - 40; s <= slotOf(T0); s++) posts.push(...slotPosts(s, a.socials.ctx).filter((p) => p.kind === 'predict'))
  assert.ok(posts.length > 5)
  assert.ok(posts.every((p) => p.media.type === 'market' && !/\{\w+\}/.test(p.text)))
  assert.ok(a.socials.thread(posts[0].id))
})
