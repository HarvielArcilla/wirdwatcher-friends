// The word list (built from Open English WordNet 2025 by
// scripts/build-words.mjs) and the ways words are dealt from it.

import fs from 'node:fs'
import zlib from 'node:zlib'
import crypto from 'node:crypto'

const POS_NAMES = { n: 'noun', v: 'verb', a: 'adjective', r: 'adverb' }

// Topic playlists, made from WordNet's topic files. `topics` are lexicographer
// file names; a word belongs when its first (most common) sense is in one.
export const TOPICS = [
  { id: 'animals', name: 'Animals', emoji: '🦊', topics: ['noun.animal'] },
  { id: 'food', name: 'Food & drink', emoji: '🍜', topics: ['noun.food'] },
  { id: 'plants', name: 'Plants', emoji: '🌿', topics: ['noun.plant'] },
  { id: 'body', name: 'Body', emoji: '🫀', topics: ['noun.body'] },
  { id: 'feelings', name: 'Feelings', emoji: '💭', topics: ['noun.feeling', 'verb.emotion'] },
  { id: 'nature', name: 'Weather & nature', emoji: '⛈️', topics: ['noun.phenomenon', 'noun.object', 'verb.weather'] },
  { id: 'people', name: 'People', emoji: '🧑‍🤝‍🧑', topics: ['noun.person'] },
  { id: 'things', name: 'Things', emoji: '🧰', topics: ['noun.artifact'] },
  { id: 'places', name: 'Places', emoji: '🗺️', topics: ['noun.location'] },
  { id: 'motion', name: 'On the move', emoji: '🏃', topics: ['verb.motion', 'verb.contact'] },
  { id: 'talk', name: 'Talking', emoji: '🗣️', topics: ['verb.communication', 'noun.communication'] },
  { id: 'mind', name: 'Thinking', emoji: '🧠', topics: ['noun.cognition', 'verb.cognition'] },
  { id: 'describing', name: 'Describing words', emoji: '✨', topics: ['adj.all', 'adj.ppl'] },
  { id: 'adverbs', name: 'Adverbs', emoji: '💨', topics: ['adv.all'] }
]

// Built-in playlists that aren't topics.
export const MODES = [
  { id: 'shuffle', name: 'Shuffle', emoji: '🎲', blurb: 'Any word at all. Prepare to meet some strangers.' },
  { id: 'everyday', name: 'Everyday words', emoji: '☕', blurb: 'Words people actually say.' },
  { id: 'daily', name: 'Word of the day', emoji: '📅', blurb: 'One word, the same for everyone today. Compare with friends.' },
  { id: 'chain', name: 'Synonym chains', emoji: '🔗', blurb: 'Rate a word, then every synonym of it. Finish the chain for a bonus.' },
  { id: 'short', name: 'Short & sweet', emoji: '🍬', blurb: 'Four letters or fewer.' },
  { id: 'long', name: 'Mouthfuls', emoji: '🐍', blurb: 'Twelve letters or more.' },
  { id: 'friends', name: 'Friends’ picks', emoji: '💌', blurb: 'Words your friends rated that you haven’t.' }
]

export class Words {
  constructor (file) {
    const data = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8'))
    this.source = data.source
    this.topicNames = data.topics
    this.list = data.words
    this.index = new Map(this.list.map((w, i) => [w[0], i]))
    this.sorted = this.list.map((w) => w[0]) // already alphabetical

    const topicIndex = new Map(this.topicNames.map((t, i) => [t, i]))
    this.byTopic = new Map(TOPICS.map((t) => [t.id, []]))
    this.everyday = []
    this.short = []
    this.long = []
    this.chainable = []
    this._pos = new Array(this.list.length)
    this._topic = new Array(this.list.length).fill(null)
    const topicOf = new Map()
    for (const t of TOPICS) for (const name of t.topics) if (topicIndex.has(name)) topicOf.set(topicIndex.get(name), t.id)
    this.list.forEach((w, i) => {
      const [form, ipa, senses] = w
      const first = senses[0][1]
      this._pos[i] = [...new Set(senses.map((x) => x[0]))].join('')
      const topic = topicOf.get(first)
      if (topic) { this._topic[i] = topic; this.byTopic.get(topic).push(i) }
      if (ipa.length && senses.length >= 2) this.everyday.push(i)
      if (form.length <= 4) this.short.push(i)
      if (form.length >= 12) this.long.push(i)
      if (this.synonyms(form).length >= 2) this.chainable.push(i)
    })
  }

  // What the Word Exchange needs to know about a word.
  marketFacts (form) {
    const i = this.index.get(form)
    if (i === undefined) return null
    return { sector: this._topic[i] || 'misc', senses: this.list[i][2].length, synonyms: this.synonyms(form).length }
  }

  // Cheap facts about a word for stats: its parts of speech and its topic
  // playlist (by its most common sense). No objects built per call.
  meta (form) {
    const i = this.index.get(form)
    if (i === undefined) return null
    return { pos: this._pos[i], topic: this._topic[i] }
  }

  get size () { return this.list.length }
  has (form) { return this.index.has(form) }

  // Everything the app shows about a word.
  lookup (form) {
    const i = this.index.get(String(form || '').toLowerCase())
    if (i === undefined) return null
    const [word, ipa, senses] = this.list[i]
    return {
      word,
      ipa,
      senses: senses.map(([pos, topic, def, ex, syn]) => ({ pos, posName: POS_NAMES[pos], topic: this.topicNames[topic], def, ex, syn })),
      synonyms: this.synonyms(word),
      topics: TOPICS.filter((t) => t.topics.includes(this.topicNames[senses[0][1]])).map((t) => t.id)
    }
  }

  synonyms (form) {
    const i = this.index.get(form)
    if (i === undefined) return []
    return [...new Set(this.list[i][2].flatMap((s) => s[4]))].filter((w) => w !== form)
  }

  // Words that start with the text, then words that contain it.
  search (text, limit = 30) {
    const q = String(text || '').toLowerCase().replace(/[^a-z]/g, '')
    if (!q) return []
    const out = []
    let lo = 0
    let hi = this.sorted.length
    while (lo < hi) { const mid = (lo + hi) >> 1; if (this.sorted[mid] < q) lo = mid + 1; else hi = mid }
    for (let i = lo; i < this.sorted.length && out.length < limit && this.sorted[i].startsWith(q); i++) out.push(this.sorted[i])
    if (out.length < limit && q.length >= 3) {
      for (const w of this.sorted) {
        if (out.length >= limit) break
        if (!w.startsWith(q) && w.includes(q)) out.push(w)
      }
    }
    return out
  }

  // For the search box: words that start with or contain the text, then
  // words whose definitions mention it ("a word for being happy by chance").
  // Each result: { word, match: 'word' | 'meaning', pos, def, ipa }.
  searchDetailed (text, limit = 30) {
    const raw = String(text || '').toLowerCase().trim().replace(/\s+/g, ' ').slice(0, 60)
    if (!raw) return []
    const out = []
    const seen = new Set()
    const add = (form, match, def = null) => {
      if (seen.has(form) || out.length >= limit) return
      seen.add(form)
      const [, ipa, senses] = this.list[this.index.get(form)]
      const sense = def ? senses.find((x) => x[2] === def) : senses[0]
      out.push({ word: form, match, pos: POS_NAMES[sense[0]], def: sense[2], ipa: ipa[0] || null })
    }
    if (/^[a-z]+$/.test(raw)) for (const w of this.search(raw, limit)) add(w, 'word')
    if (raw.length >= 3 && out.length < limit) {
      const esc = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const re = new RegExp(`\\b${esc}`)
      for (const [form, , senses] of this.list) {
        if (out.length >= limit) break
        if (seen.has(form)) continue
        const hit = senses.find((x) => re.test(x[2]))
        if (hit) add(form, 'meaning', hit[2])
      }
    }
    return out
  }

  // The same word for everyone on a given day (YYYY-MM-DD), from everyday words.
  daily (day) {
    const h = crypto.createHash('sha256').update(`wirdwatcher/daily/${day}`).digest().readUInt32BE(0)
    return this.list[this.everyday[h % this.everyday.length]][0]
  }

  pool (mode) {
    if (mode === 'shuffle') return null // everything
    if (mode === 'everyday') return this.everyday
    if (mode === 'short') return this.short
    if (mode === 'long') return this.long
    if (mode === 'chain') return this.chainable
    if (mode.startsWith('topic:')) return this.byTopic.get(mode.slice(6)) || []
    return []
  }

  poolSize (mode) {
    const p = this.pool(mode)
    return p ? p.length : this.list.length
  }

  // A random word from a pool, avoiding `skip` (a Set of words) when it can.
  random (mode = 'shuffle', skip = new Set()) {
    const pool = this.pool(mode)
    const size = pool ? pool.length : this.list.length
    if (!size) return null
    const at = (k) => this.list[pool ? pool[k] : k][0]
    for (let tries = 0; tries < 60; tries++) {
      const w = at(crypto.randomInt(size))
      if (!skip.has(w)) return w
    }
    // Mostly rated already: walk from a random start to find what's left.
    const start = crypto.randomInt(size)
    for (let k = 0; k < size; k++) {
      const w = at((start + k) % size)
      if (!skip.has(w)) return w
    }
    return null
  }

  // How many words of a pool are in `rated` (a Set).
  progress (mode, rated) {
    const pool = this.pool(mode)
    if (!pool) return { done: rated.size, total: this.list.length }
    let done = 0
    for (const i of pool) if (rated.has(this.list[i][0])) done++
    return { done, total: pool.length }
  }
}
