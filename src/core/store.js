// Everything wirdwatcher keeps on this computer.
//
//   me.json             your ratings, comments, favorites, playlists, and a
//                       short public profile: the records friends receive
//   progress.json       XP, streaks, badges and counters (stay on this computer)
//   friends/<id>.json   each friend: who they are, and the records they sent
//
// Records are single-writer: only you write yours, only each friend writes
// theirs. Each of your records carries a sequence number that goes up with
// every change, so catching a friend up is "everything after the last number
// you have from me" and nothing can conflict. A deletion is a record whose
// value is null.
//
//   r/<word>   rating, 0.0–5.0       c/<word>  comment
//   f/<word>   favorite (true)       p/<id>    playlist { name, emoji, words }
//   me         { name, color, level, xp, title, rated, badges }

import fs from 'node:fs'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { readJson, writeJson } from './files.js'

const USER = /^[0-9a-f]{64}$/
const KEY = /^(r|c|f|p)\/[a-z0-9-]{1,64}$|^me$/

// Checks one record from a friend; returns a clean copy or null.
export function cleanRecord (key, rec, { maxCommentChars = 2000 } = {}) {
  if (typeof key !== 'string' || !KEY.test(key) || !rec || typeof rec !== 'object') return null
  const seq = Number(rec.seq)
  const t = Number(rec.t)
  if (!Number.isSafeInteger(seq) || seq < 1 || !Number.isFinite(t)) return null
  let v = rec.v
  if (v !== null) {
    const kind = key === 'me' ? 'me' : key[0]
    if (kind === 'r') {
      if (typeof v !== 'number' || !(v >= 0 && v <= 5)) return null
      v = Math.round(v * 10) / 10
    } else if (kind === 'c') {
      if (typeof v !== 'string') return null
      v = v.slice(0, maxCommentChars)
    } else if (kind === 'f') {
      if (v !== true) return null
    } else if (kind === 'p') {
      if (typeof v !== 'object' || typeof v.name !== 'string' || !Array.isArray(v.words)) return null
      v = { name: v.name.slice(0, 40), emoji: typeof v.emoji === 'string' ? v.emoji.slice(0, 8) : '🎧', words: v.words.filter((w) => typeof w === 'string' && /^[a-z]{1,64}$/.test(w)).slice(0, 500) }
    } else if (kind === 'me') {
      if (typeof v !== 'object') return null
      v = {
        name: String(v.name || '').slice(0, 24),
        color: /^#[0-9a-f]{6}$/i.test(v.color) ? v.color : '#e8c686',
        level: Math.max(1, Math.min(9999, Number(v.level) || 1)),
        xp: Math.max(0, Number(v.xp) || 0),
        title: String(v.title || '').slice(0, 40),
        rated: Math.max(0, Number(v.rated) || 0),
        badges: Math.max(0, Number(v.badges) || 0)
      }
    }
  }
  return { v, t, seq }
}

export class Store extends EventEmitter {
  constructor (dir) {
    super()
    this.dir = dir
    fs.mkdirSync(path.join(dir, 'friends'), { recursive: true })
    this.mine = readJson(path.join(dir, 'me.json'), { seq: 0, records: {} })
    this.progress = {
      xp: 0, day: null, streak: 0, bestStreak: 0, badges: {}, history: [], counters: {},
      ...readJson(path.join(dir, 'progress.json'), {})
    }
    this.friends = new Map()
    for (const f of fs.readdirSync(path.join(dir, 'friends'))) {
      const id = f.replace(/\.json$/, '')
      if (!USER.test(id)) continue
      const data = readJson(path.join(dir, 'friends', f), null)
      if (data?.info?.userId === id) this.friends.set(id, data)
    }
    this._dirty = new Set()
    this._timer = null
  }

  // --- saving ---------------------------------------------------------------

  _save (what) {
    this._dirty.add(what)
    if (this._timer) return
    this._timer = setTimeout(() => this.flush(), 300)
    this._timer.unref?.()
  }

  flush () {
    clearTimeout(this._timer)
    this._timer = null
    for (const what of this._dirty) {
      if (what === 'me') writeJson(path.join(this.dir, 'me.json'), this.mine)
      else if (what === 'progress') writeJson(path.join(this.dir, 'progress.json'), this.progress)
      else if (what.startsWith('friend:')) {
        const id = what.slice(7)
        const file = path.join(this.dir, 'friends', `${id}.json`)
        if (this.friends.has(id)) writeJson(file, this.friends.get(id))
        else fs.rmSync(file, { force: true })
      }
    }
    this._dirty.clear()
  }

  // --- my records -------------------------------------------------------------

  get (key) {
    const rec = this.mine.records[key]
    return rec && rec.v !== null ? rec.v : null
  }

  // Sets one of my records (null deletes) and tells the friends layer.
  put (key, v) {
    const old = this.mine.records[key]
    if (old && JSON.stringify(old.v) === JSON.stringify(v)) return false
    if (!old && v === null) return false
    const rec = { v, t: Date.now(), seq: ++this.mine.seq }
    this.mine.records[key] = rec
    this._save('me')
    this.emit('records', { [key]: rec })
    return true
  }

  // My records changed after `seq`, for catching a friend up.
  since (seq) {
    const out = {}
    for (const [k, rec] of Object.entries(this.mine.records)) if (rec.seq > seq) out[k] = rec
    return out
  }

  rating (word) { return this.get(`r/${word}`) }
  ratings () {
    const out = []
    for (const [k, rec] of Object.entries(this.mine.records)) if (k.startsWith('r/') && rec.v !== null) out.push({ word: k.slice(2), r: rec.v, t: rec.t })
    return out
  }

  ratedSet () { return new Set(this.ratings().map((x) => x.word)) }

  favorites () {
    return Object.entries(this.mine.records).filter(([k, rec]) => k.startsWith('f/') && rec.v).map(([k, rec]) => ({ word: k.slice(2), t: rec.t })).sort((a, b) => b.t - a.t)
  }

  comments () {
    return Object.entries(this.mine.records).filter(([k, rec]) => k.startsWith('c/') && rec.v).map(([k, rec]) => ({ word: k.slice(2), text: rec.v, t: rec.t }))
  }

  playlists () {
    return Object.entries(this.mine.records).filter(([k, rec]) => k.startsWith('p/') && rec.v).map(([k, rec]) => ({ id: k.slice(2), ...rec.v, t: rec.t, owner: 'me' })).sort((a, b) => b.t - a.t)
  }

  // --- progress (this computer only) -----------------------------------------

  count (name, by = 1) {
    this.progress.counters[name] = (this.progress.counters[name] || 0) + by
    this._save('progress')
    return this.progress.counters[name]
  }

  counter (name) { return this.progress.counters[name] || 0 }

  saveProgress () { this._save('progress') }

  // --- friends --------------------------------------------------------------

  listFriends () { return [...this.friends.values()].map((f) => f.info) }
  friend (id) { return this.friends.get(id) || null }

  addFriend (info) {
    if (!USER.test(info.userId)) throw new Error('That isn’t a wirdwatcher friend.')
    const existing = this.friends.get(info.userId)
    const data = existing || { info: {}, seq: 0, records: {} }
    data.info = { ...data.info, ...info, addedAt: data.info.addedAt || Date.now() }
    this.friends.set(info.userId, data)
    this._save(`friend:${info.userId}`)
    this.emit('friends')
    return data.info
  }

  updateFriendInfo (id, patch) {
    const data = this.friends.get(id)
    if (!data) return
    data.info = { ...data.info, ...patch }
    this._save(`friend:${id}`)
    this.emit('friends')
  }

  removeFriend (id) {
    if (!this.friends.delete(id)) return false
    this._save(`friend:${id}`)
    this.emit('friends')
    return true
  }

  // Records a friend sent. Keeps at most maxRecords of theirs.
  applyFriend (id, records, { maxRecords = 100000, maxCommentChars = 280 } = {}) {
    const data = this.friends.get(id)
    if (!data || !records || typeof records !== 'object') return 0
    let applied = 0
    for (const [key, raw] of Object.entries(records)) {
      const rec = cleanRecord(key, raw, { maxCommentChars: Math.max(maxCommentChars, 1) })
      if (!rec) continue
      const old = data.records[key]
      if (old && old.seq >= rec.seq) continue
      if (!old && Object.keys(data.records).length >= maxRecords) continue
      data.records[key] = rec
      if (rec.seq > data.seq) data.seq = rec.seq
      applied++
    }
    if (applied) {
      const me = data.records.me?.v
      if (me?.name) data.info.name = me.name
      if (me?.color) data.info.color = me.color
      this._save(`friend:${id}`)
      this.emit('friend-records', id)
    }
    return applied
  }

  // What every friend did with one word.
  friendsOn (word) {
    const out = []
    for (const { info, records } of this.friends.values()) {
      const r = records[`r/${word}`]?.v
      const c = records[`c/${word}`]?.v
      const f = records[`f/${word}`]?.v
      if (r == null && !c && !f) continue
      out.push({ userId: info.userId, name: info.name, color: info.color, r: r ?? null, comment: c || null, favorite: Boolean(f) })
    }
    return out
  }

  // How alike two people rate: 100% means identical on every shared word,
  // 0% means a full 5 points apart on average. null until 5 shared words.
  tasteMatch (id) {
    const data = this.friends.get(id)
    if (!data) return null
    let n = 0
    let diff = 0
    for (const [k, rec] of Object.entries(data.records)) {
      if (!k.startsWith('r/') || rec.v === null) continue
      const mine = this.mine.records[k]
      if (!mine || mine.v === null) continue
      n++
      diff += Math.abs(mine.v - rec.v)
    }
    return n >= 5 ? { pct: Math.round(100 - (diff / n) * 20), shared: n } : { pct: null, shared: n }
  }

  friendRatings (id) {
    const data = this.friends.get(id)
    if (!data) return []
    return Object.entries(data.records).filter(([k, rec]) => k.startsWith('r/') && rec.v !== null).map(([k, rec]) => ({ word: k.slice(2), r: rec.v, t: rec.t }))
  }

  friendPlaylists () {
    const out = []
    for (const { info, records } of this.friends.values()) {
      for (const [k, rec] of Object.entries(records)) if (k.startsWith('p/') && rec.v) out.push({ id: `${info.userId.slice(0, 8)}-${k.slice(2)}`, ...rec.v, t: rec.t, owner: info.userId, ownerName: info.name, ownerColor: info.color })
    }
    return out.sort((a, b) => b.t - a.t)
  }

  // Words friends rated that I haven't, best first.
  friendPicks (rated = this.ratedSet()) {
    const best = new Map()
    for (const { records } of this.friends.values()) {
      for (const [k, rec] of Object.entries(records)) {
        if (!k.startsWith('r/') || rec.v === null) continue
        const w = k.slice(2)
        if (rated.has(w)) continue
        best.set(w, Math.max(best.get(w) ?? -1, rec.v))
      }
    }
    return [...best].sort((a, b) => b[1] - a[1]).map(([w]) => w)
  }
}
