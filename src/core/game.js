// The game on this computer: dealing words, rating them, and the XP, levels,
// streaks and badges that come with it. Lobbies and friends call into this
// too, so a word rated at a lobby table counts like any other.

import crypto from 'node:crypto'
import { EventEmitter } from 'node:events'
import { TOPICS, MODES } from './words.js'
import { XP, BADGES, levelFor, titleFor } from '../shared/progress.js'

const localDay = (d = new Date()) => d.toLocaleDateString('en-CA') // YYYY-MM-DD, local time
export const utcDay = (d = new Date()) => d.toISOString().slice(0, 10)
const dayBefore = (day) => { const d = new Date(`${day}T12:00:00`); d.setDate(d.getDate() - 1); return localDay(d) }

const FLOW_GAP_MS = 10 * 60 * 1000
const MIN_PLAYLIST = 10

export class Game extends EventEmitter {
  constructor ({ words, store, settings, now = () => new Date() }) {
    super()
    this.words = words
    this.store = store
    this.settings = settings
    this.now = now
    this.session = { count: 0, last: 0 }
    this.chain = store.progress.chain || null // { root, words: [...] }
    this.store.on('friends', () => this._refreshProfile())
  }

  // --- dealing ----------------------------------------------------------------

  modes () {
    const rated = this.store.ratedSet()
    const built = MODES.map((m) => ({ ...m, kind: 'mode', ...this._modeProgress(m.id, rated) }))
    const topics = TOPICS.map((t) => ({ id: `topic:${t.id}`, name: t.name, emoji: t.emoji, kind: 'topic', ...this.words.progress(`topic:${t.id}`, rated) }))
    const mine = this.store.playlists().map((p) => ({ id: `list:${p.id}`, name: p.name, emoji: p.emoji, kind: 'playlist', words: p.words, done: p.words.filter((w) => rated.has(w)).length, total: p.words.length }))
    const theirs = this.store.friendPlaylists().map((p) => ({ id: `flist:${p.owner}:${p.id}`, name: p.name, emoji: p.emoji, kind: 'friend-playlist', ownerName: p.ownerName, ownerColor: p.ownerColor, words: p.words, done: p.words.filter((w) => rated.has(w)).length, total: p.words.length }))
    return { modes: built, topics, playlists: mine, friendPlaylists: theirs }
  }

  _modeProgress (id, rated) {
    if (id === 'daily') return { done: rated.has(this.words.daily(utcDay(this.now()))) ? 1 : 0, total: 1 }
    if (id === 'friends') { const left = this.store.friendPicks(rated).length; return { done: 0, total: left } }
    return this.words.progress(id, rated)
  }

  _playlistWords (mode) {
    if (mode.startsWith('list:')) return this.store.playlists().find((p) => p.id === mode.slice(5))?.words || []
    if (mode.startsWith('flist:')) {
      const [, owner, id] = mode.split(':')
      return this.store.friendPlaylists().find((p) => p.owner === owner && p.id === id)?.words || []
    }
    return null
  }

  // The next word for a mode. Returns { word, info, mode, chain?, empty? }.
  deal (mode = 'shuffle', { after = null } = {}) {
    const rated = this.store.ratedSet()
    const skip = this.settings.get('skipRated') ? rated : new Set(after ? [after] : [])
    let word = null
    let chain = null
    let note = null
    if (mode === 'daily') {
      word = this.words.daily(utcDay(this.now()))
      note = 'Same word for everyone today'
    } else if (mode === 'friends') {
      const picks = this.store.friendPicks(rated)
      word = picks[0] || null
      if (!word) return { mode, empty: this.store.listFriends().length ? 'You’ve rated everything your friends have. Nice.' : 'Add a friend to see the words they rate.' }
    } else if (mode === 'chain') {
      ;({ word, chain } = this._dealChain(rated))
    } else {
      const list = this._playlistWords(mode)
      if (list) {
        const left = list.filter((w) => !rated.has(w) && this.words.has(w))
        word = left.length ? left[crypto.randomInt(left.length)] : null
        if (!word) return { mode, empty: list.length ? 'Every word in this playlist is rated.' : 'This playlist is empty. Add words with the + button on any word.' }
      } else {
        word = this.words.random(mode, skip)
      }
    }
    if (!word) return { mode, empty: 'You’ve rated every word here. Impressive. Try another playlist.' }
    return { mode, word, info: this.wordInfo(word), chain, note }
  }

  _dealChain (rated) {
    let c = this.chain
    if (c) {
      const next = c.words.find((w) => !rated.has(w))
      if (next) return { word: next, chain: this._chainView(c, rated) }
    }
    // Start a new chain from a word with at least two synonyms nobody here rated.
    for (let tries = 0; tries < 40; tries++) {
      const root = this.words.random('chain', rated)
      if (!root) break
      const words = [root, ...this.words.synonyms(root)].slice(0, 12)
      if (words.filter((w) => !rated.has(w)).length < 3) continue
      c = this.chain = { root, words, done: false }
      this.store.progress.chain = c
      this.store.saveProgress()
      return { word: words.find((w) => !rated.has(w)), chain: this._chainView(c, rated) }
    }
    return { word: null, chain: null }
  }

  _chainView (c, rated) {
    return { root: c.root, words: c.words.map((w) => ({ word: w, rated: rated.has(w), r: this.store.rating(w) })) }
  }

  wordInfo (word) {
    const info = this.words.lookup(word)
    if (!info) return null
    const comment = this.store.get(`c/${word}`)
    return {
      ...info,
      mine: { r: this.store.rating(word), comment, favorite: Boolean(this.store.get(`f/${word}`)) },
      friends: this.store.friendsOn(word).map((f) => (this.settings.get('showFriendComments') ? f : { ...f, comment: null })),
      inPlaylists: this.store.playlists().filter((p) => p.words.includes(word)).map((p) => p.id),
      daily: word === this.words.daily(utcDay(this.now()))
    }
  }

  // --- rating -----------------------------------------------------------------

  // Rates a word. Returns what it earned: { r, xp:[{amount, why}], level,
  // levelUp, badges:[new badges], twins:[names], chainDone, friends }.
  rate (word, r, { source = 'solo' } = {}) {
    if (!this.words.has(word)) throw new Error('That word isn’t in the list.')
    if (!(typeof r === 'number' && r >= 0 && r <= 5)) throw new Error('Ratings go from 0.0 to 5.0.')
    r = Math.round(r * 10) / 10
    const before = levelFor(this.store.progress.xp)
    const badgesBefore = new Set(Object.keys(this.store.progress.badges))
    const fresh = this.store.rating(word) === null
    const now = this.now()
    const xp = []
    const gain = (amount, why) => { if (amount > 0) xp.push({ amount, why }) }

    this.store.put(`r/${word}`, r)
    this.store.progress.history = [word, ...this.store.progress.history.filter((w) => w !== word)].slice(0, 200)

    if (fresh) {
      gain(XP.rating, 'New word')
      // Streaks and the first rating of the day.
      const today = localDay(now)
      const p = this.store.progress
      if (p.day !== today) {
        p.streak = p.day === dayBefore(today) ? p.streak + 1 : 1
        p.bestStreak = Math.max(p.bestStreak, p.streak)
        p.day = today
        gain(XP.firstOfDay, 'First word today')
        if (p.streak > 1) gain(XP.streakDay * Math.min(10, p.streak), `${p.streak}-day streak`)
      }
      if (word === this.words.daily(utcDay(now))) { this.store.count('dailies'); gain(XP.daily, 'Word of the day') }
      const hour = now.getHours()
      if (hour >= 2 && hour < 5) this.store.count('owl')
      // Flow: every 10 words in one sitting.
      const t = now.getTime()
      this.session.count = t - this.session.last > FLOW_GAP_MS ? 1 : this.session.count + 1
      this.session.last = t
      if (this.session.count % 10 === 0) gain(XP.flow, `${this.session.count} in a row`)
    }

    // Twins with friends.
    const friends = this.store.friendsOn(word)
    const twins = friends.filter((f) => f.r === r).map((f) => f.name)
    const twinKey = `twin:${word}`
    if (twins.length && !this.store.progress.counters[twinKey]) {
      this.store.progress.counters[twinKey] = 1
      this.store.count('twins')
      gain(XP.twin, `Same as ${twins[0]}`)
    }

    // Synonym chain finished?
    let chainDone = null
    const rated = this.store.ratedSet()
    if (this.chain && !this.chain.done && this.chain.words.includes(word) && this.chain.words.every((w) => rated.has(w))) {
      this.chain.done = true
      this.store.progress.chain = null
      chainDone = { root: this.chain.root, words: this.chain.words }
      this.chain = null
      this.store.count('chains')
      gain(XP.chainWord * chainDone.words.length, 'Chain complete')
    }

    // Playlists finished?
    const finished = []
    for (const p of this.store.playlists()) {
      if (p.words.length < MIN_PLAYLIST || !p.words.includes(word)) continue
      const doneKey = `playlist:${p.id}`
      if (this.store.progress.counters[doneKey]) continue
      if (p.words.every((w) => rated.has(w))) {
        this.store.progress.counters[doneKey] = 1
        this.store.count('playlistsDone')
        finished.push(p.name)
        gain(XP.playlist, `Finished “${p.name}”`)
      }
    }

    const result = this._finish(xp, before, badgesBefore)
    this.store.saveProgress()
    return { word, r, fresh, ...result, twins, chainDone, finished, friends, chain: chainDone ? null : (this.chain && this.chain.words.includes(word) ? this._chainView(this.chain, rated) : null) }
  }

  unrate (word) {
    this.store.put(`r/${word}`, null)
    this._refreshProfile()
    return this.wordInfo(word)
  }

  // Adds XP from elsewhere (lobbies) and counters; returns the same shape as rate().
  award (items = [], counters = {}) {
    const before = levelFor(this.store.progress.xp)
    const badgesBefore = new Set(Object.keys(this.store.progress.badges))
    for (const [name, by] of Object.entries(counters)) this.store.count(name, by)
    const result = this._finish(items.filter((x) => x.amount > 0), before, badgesBefore)
    this.store.saveProgress()
    return result
  }

  _finish (xp, before, badgesBefore) {
    const p = this.store.progress
    p.xp += xp.reduce((a, x) => a + x.amount, 0)
    const after = levelFor(p.xp)
    const stats = this.stats()
    const badges = []
    for (const b of BADGES) {
      if (!badgesBefore.has(b.id) && !p.badges[b.id] && b.test(stats)) {
        p.badges[b.id] = Date.now()
        badges.push({ id: b.id, emoji: b.emoji, name: b.name, hint: b.hint })
      }
    }
    this._refreshProfile(stats)
    const out = { xp, level: { ...after, title: titleFor(after.level) }, levelUp: after.level > before.level, badges, streak: p.streak }
    this.emit('progress', out)
    return out
  }

  // --- comments, favorites, playlists ---------------------------------------

  comment (word, text) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 280)
    const fresh = !this.store.get(`c/${word}`) && clean
    this.store.put(`c/${word}`, clean || null)
    if (fresh && !this.store.progress.counters[`commented:${word}`]) {
      this.store.progress.counters[`commented:${word}`] = 1
      return { info: this.wordInfo(word), ...this.award([{ amount: XP.comment, why: 'New comment' }]) }
    }
    return { info: this.wordInfo(word), ...this.award() }
  }

  favorite (word, on) {
    this.store.put(`f/${word}`, on ? true : null)
    return { info: this.wordInfo(word), ...this.award() }
  }

  createPlaylist ({ name, emoji = '🎧', words = [] }) {
    const id = crypto.randomBytes(6).toString('hex')
    this.store.put(`p/${id}`, { name: String(name || 'Untitled').trim().slice(0, 40) || 'Untitled', emoji: String(emoji).slice(0, 8), words: [...new Set(words.filter((w) => this.words.has(w)))].slice(0, 500) })
    this.award()
    return id
  }

  updatePlaylist (id, patch) {
    const cur = this.store.get(`p/${id}`)
    if (!cur) throw new Error('That playlist is gone.')
    const next = { ...cur }
    if (typeof patch.name === 'string') next.name = patch.name.trim().slice(0, 40) || cur.name
    if (typeof patch.emoji === 'string') next.emoji = patch.emoji.slice(0, 8)
    if (Array.isArray(patch.words)) next.words = [...new Set(patch.words.filter((w) => this.words.has(w)))].slice(0, 500)
    if (patch.add) next.words = [...new Set([...next.words, patch.add])].slice(0, 500)
    if (patch.remove) next.words = next.words.filter((w) => w !== patch.remove)
    this.store.put(`p/${id}`, next)
    return { ...this.award(), playlist: { id, ...next } }
  }

  deletePlaylist (id) { this.store.put(`p/${id}`, null) }

  // Copies a friend's playlist into mine.
  savePlaylist (owner, id) {
    const p = this.store.friendPlaylists().find((x) => x.owner === owner && x.id === id)
    if (!p) throw new Error('That playlist is gone.')
    return this.createPlaylist({ name: p.name, emoji: p.emoji, words: p.words })
  }

  // --- stats and profile ------------------------------------------------------

  stats () {
    const ratings = this.store.ratings()
    const p = this.store.progress
    const s = {
      rated: ratings.length, fives: 0, zeros: 0, middles: 0, lows: 0, highs: 0, byPos: { n: 0, v: 0, a: 0, r: 0 },
      topicsTouched: 0, topicsTotal: TOPICS.length, longest: 0, shortest: 0, sum: 0, histogram: new Array(11).fill(0),
      streak: p.streak, bestStreak: p.bestStreak, comments: this.store.comments().length, favorites: this.store.favorites().length,
      friends: this.store.listFriends().length, biggestPlaylist: Math.max(0, ...this.store.playlists().map((x) => x.words.length)),
      dailies: this.store.counter('dailies'), chains: this.store.counter('chains'), playlistsDone: this.store.counter('playlistsDone'),
      twins: this.store.counter('twins'), lobbyGames: this.store.counter('lobbyGames'), fullTables: this.store.counter('fullTables'),
      hiveMinds: this.store.counter('hiveMinds'), hotTakes: this.store.counter('hotTakes'), owl: this.store.counter('owl'), lobbyRounds: this.store.counter('lobbyRounds')
    }
    const touched = new Set()
    for (const { word, r } of ratings) {
      s.sum += r
      if (r === 5) s.fives++
      if (r === 0) s.zeros++
      if (r === 2.5) s.middles++
      if (r <= 1) s.lows++
      if (r >= 4.5) s.highs++
      s.histogram[Math.min(10, Math.floor(r * 2))]++
      s.longest = Math.max(s.longest, word.length)
      s.shortest = s.shortest ? Math.min(s.shortest, word.length) : word.length
      const info = this.words.lookup(word)
      if (!info) continue
      for (const pos of new Set(info.senses.map((x) => x.pos))) s.byPos[pos]++
      for (const t of info.topics) touched.add(t)
    }
    s.topicsTouched = touched.size
    s.average = ratings.length ? s.sum / ratings.length : null
    const sorted = ratings.map((x) => x.r).sort((a, b) => a - b)
    s.median = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : null
    return s
  }

  profile () {
    const stats = this.stats()
    const lvl = levelFor(this.store.progress.xp)
    const ratings = this.store.ratings()
    const byR = [...ratings].sort((a, b) => b.r - a.r || b.t - a.t)
    return {
      stats,
      level: { ...lvl, title: titleFor(lvl.level) },
      badges: BADGES.map(({ test, ...b }) => ({ ...b, earned: this.store.progress.badges[b.id] || null })),
      top: byR.slice(0, 12),
      bottom: byR.slice(-12).reverse(),
      recent: [...ratings].sort((a, b) => b.t - a.t).slice(0, 30),
      favorites: this.store.favorites().slice(0, 60),
      streak: this.store.progress.streak
    }
  }

  allRatings () {
    return this.store.ratings().sort((a, b) => b.t - a.t)
  }

  // The public summary friends see, kept up to date as a record.
  _refreshProfile (stats = null) {
    const s = stats || this.stats()
    const lvl = levelFor(this.store.progress.xp)
    this.store.put('me', { name: this.identityName?.() || '', color: this.identityColor?.() || '#e8c686', level: lvl.level, xp: this.store.progress.xp, title: titleFor(lvl.level), rated: s.rated, badges: Object.keys(this.store.progress.badges).length })
  }
}
