import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { WirdApp } from '../src/core/app.js'
import { migrate, SCHEMA } from '../src/core/migrate.js'
import { tmp } from './helpers.js'

const offline = (dataDir = tmp(), now) => new WirdApp({ dataDir, settings: { lan: false, internet: false }, now })

test('an update keeps everything, and only chosen settings are saved', () => {
  const dir = tmp()
  let app = offline(dir)
  app.setProfile({ name: 'Harviel' })
  app.game.rate('cat', 4.2)
  app.game.createPlaylist({ name: 'Pets', words: ['cat', 'dog'] })
  app.setSettings({ soundVolume: 40, speakOnReveal: true })
  app.setAppearance({ mode: 'light', light: { theme: 'parchment' } })
  app.store.flush()
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'))
  assert.deepEqual(saved, { soundVolume: 40, speakOnReveal: true }, 'defaults aren’t written, so better defaults reach you later')
  app.setSettings({ soundVolume: 70 })
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8')), { speakOnReveal: true })
  // "Update": a new app over the same folder.
  app = offline(dir)
  assert.equal(app.identity.name, 'Harviel')
  assert.equal(app.store.rating('cat'), 4.2)
  assert.equal(app.store.playlists()[0].name, 'Pets')
  assert.equal(app.settings.get('speakOnReveal'), true)
  assert.equal(app.appearance().light.theme, 'parchment')
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'version.json'), 'utf8')).schema, SCHEMA)
})

test('a folder from the first v2 builds is backed up and migrated', () => {
  const dir = tmp()
  // Layout 1: every setting saved, no version.json.
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ sounds: true, ratingSound: 'chime', soundVolume: 35, lan: true, internet: false }))
  fs.writeFileSync(path.join(dir, 'me.json'), JSON.stringify({ seq: 1, records: { 'r/cat': { v: 3, t: 1, seq: 1 } } }))
  const app = offline(dir)
  assert.equal(app.migration.from, 1)
  assert.equal(app.migration.to, SCHEMA)
  assert.ok(fs.existsSync(path.join(app.migration.backup, 'settings.json')), 'backup made first')
  assert.ok(fs.existsSync(path.join(app.migration.backup, 'me.json')))
  assert.equal(app.store.rating('cat'), 3)
  assert.equal(app.settings.get('soundVolume'), 35, 'a real choice stays')
  assert.equal(app.settings.get('ratingSound'), 'arcade', 'an old default follows the new default')
  assert.equal(app.settings.get('sounds'), false)
})

test('data from a newer version is left alone', () => {
  const dir = tmp()
  fs.writeFileSync(path.join(dir, 'version.json'), JSON.stringify({ schema: SCHEMA + 1 }))
  fs.writeFileSync(path.join(dir, 'me.json'), '{"seq":9,"records":{}}')
  assert.throws(() => migrate(dir), /newer version/)
  assert.equal(fs.readFileSync(path.join(dir, 'me.json'), 'utf8'), '{"seq":9,"records":{}}')
})

test('a damaged file is kept aside, not silently replaced', () => {
  const dir = tmp()
  offline(dir).store.flush()
  fs.writeFileSync(path.join(dir, 'me.json'), '{"seq": 3, "records": {broken')
  const app = offline(dir)
  assert.equal(app.store.ratings().length, 0)
  assert.ok(fs.readdirSync(dir).some((f) => f.startsWith('me.json.damaged-')))
})

test('deleting a profile removes everything of ours', async () => {
  const dir = tmp()
  const app = offline(dir)
  await app.start()
  app.game.rate('cat', 5)
  app.setSettings({ soundVolume: 10 })
  fs.writeFileSync(path.join(dir, 'Preferences'), 'electron’s own file')
  await app.deleteProfile()
  const left = fs.readdirSync(dir)
  assert.deepEqual(left, ['Preferences'])
  const fresh = offline(dir)
  assert.equal(fresh.store.ratings().length, 0)
  assert.equal(fresh.identity.hasChosenName, false)
})

test('comparisons: against friends, and against your own ratings', () => {
  const app = offline()
  // Two friends with ratings, as if they had synced.
  for (const [id, name, vals] of [['a'.repeat(64), 'Pip', { cat: 4, dog: 1, owl: 3, elk: 2, emu: 5, ant: 2 }], ['b'.repeat(64), 'Quinn', { cat: 2, dog: 4, owl: 1, elk: 5, emu: 0, ant: 4 }]]) {
    app.store.addFriend({ userId: id, name, color: '#88ccff', pairSecret: '00' })
    let seq = 0
    app.store.applyFriend(id, Object.fromEntries(Object.entries(vals).map(([w, v]) => [`r/${w}`, { v, t: 1, seq: ++seq }])))
  }
  for (const [w, r] of Object.entries({ dog: 1, owl: 3, elk: 2, emu: 5, ant: 2 })) app.game.rate(w, r)
  const res = app.game.rate('cat', 4.9)
  const c = res.compare
  assert.equal(c.friends.length, 2)
  assert.equal(c.friends[0].name, 'Pip', 'closest first')
  assert.equal(c.table.avg, 3)
  assert.equal(c.verdict.tone, 'hot')
  assert.match(c.verdict.text, /Hot take: 1\.9 above/)
  assert.equal(c.friends[0].match, 97, 'Pip and I agree on every other shared word (0.9 off on this one)')
  assert.ok(c.friends[1].match < 50)
  // With no friends on a word: against your own ratings.
  for (let i = 0; i < 12; i++) app.game.rate(app.game.deal('short').word, 2)
  const own = app.game.rate('zebra', 4.8).compare
  assert.equal(own.friends.length, 0)
  assert.match(own.verdict.text, /highest ratings ever|Higher than/)
})

test('new badges unlock', () => {
  let day = new Date('2026-10-17T06:00:00') // a Saturday morning
  const app = offline(tmp(), () => day)
  const r1 = app.game.rate('level', 3)
  const ids = r1.badges.map((b) => b.id)
  assert.ok(ids.includes('palindrome'))
  assert.ok(ids.includes('early'))
  assert.ok(app.game.rate('qat', 3).badges.some((b) => b.id === 'qnou'))
  assert.ok(app.game.rate('rhythm', 3).badges.some((b) => b.id === 'vowelless'))
  day = new Date('2026-10-18T12:00:00') // the Sunday
  assert.ok(app.game.rate('owl', 3).badges.some((b) => b.id === 'weekend'))
  assert.ok(app.count('skips').badges.some((b) => b.id === 'skipper'))
  assert.throws(() => app.count('anything'), /Unknown/)
})
