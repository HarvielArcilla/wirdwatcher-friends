// Today: a daily Clues puzzle, three quests, and a weekly challenge, the
// same for everyone (picked by the UTC date), kept in economy.json (as
// s.daily) so rewards and progress save with the coins.
//
// No quest asks for a particular score: ratings stay honest.

import { buildClues, plain } from './lobby.js'
import { hash32 } from '../shared/market.js'
import { seededRandom } from '../shared/leximon.js'
import { TOPICS } from './words.js'

const DAY = 864e5
export const utcDay = (t) => new Date(t).toISOString().slice(0, 10)
// Weeks start on Monday (UTC).
export const utcWeek = (t) => { const d = new Date(t); const day = (d.getUTCDay() + 6) % 7; return utcDay(t - day * DAY) }
const dayNumber = (t) => Math.floor((t - Date.UTC(2026, 0, 1)) / DAY) + 1 // Daily #1 was 1 January 2026

// The quests a day can draw from. `kind` is what counts toward it.
const QUESTS = [
  { kind: 'words', n: [10, 20, 30], text: (n) => `Rate ${n} new words`, emoji: '📝' },
  { kind: 'topic', n: [5, 8], text: (n, q) => `Rate ${n} new words about ${q.topicName.toLowerCase()}`, emoji: '🗂️' },
  { kind: 'catch', n: [1], text: () => 'Catch a wild Leximon', emoji: '🃏' },
  { kind: 'trade', n: [1, 3], text: (n) => (n === 1 ? 'Make a trade on the Word Exchange' : `Make ${n} trades on the Word Exchange`), emoji: '📈' },
  { kind: 'spin', n: [3, 5], text: (n) => `Spin Wird Slots ${n} times`, emoji: '🎰' },
  { kind: 'flip', n: [1, 3], text: (n) => (n === 1 ? 'Flip a coin' : `Flip a coin ${n} times`), emoji: '🪙' },
  { kind: 'lobby', n: [3, 5], text: (n) => `Play ${n} lobby rounds`, emoji: '🎲' },
  { kind: 'clues', n: [1], text: () => 'Solve today’s Daily Clues', emoji: '🧩' },
  { kind: 'duel', n: [1, 2], text: (n) => (n === 1 ? 'Duel a friend’s Leximon' : `Duel friends’ Leximon ${n} times`), emoji: '⚔️' },
  { kind: 'streak', n: [10, 15], text: (n) => `Reach a pace streak of ${n}`, emoji: '🔥' },
  { kind: 'train', n: [1], text: () => 'Train a Leximon', emoji: '🏋️' }
]
export const WEEKLY = { kind: 'words', n: 150, text: 'Rate 150 new words this week', emoji: '🏆' }

export function questsFor (day) {
  const rand = seededRandom(hash32(`quests|${day}`))
  const pool = [...QUESTS]
  const out = []
  // Always one about rating, then two others.
  const first = pool.splice(rand() < 0.5 ? 0 : 1, 1)[0]
  out.push(first)
  while (out.length < 3) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0])
  return out.map((q, i) => {
    const n = q.n[Math.floor(rand() * q.n.length)]
    const topic = q.kind === 'topic' ? TOPICS[Math.floor(rand() * TOPICS.length)] : null
    const quest = { id: `${day}:${i}`, kind: q.kind, n, emoji: q.emoji, topic: topic?.id || null, topicName: topic?.name || null }
    return { ...quest, text: q.text(n, quest) }
  })
}

const blankDaily = () => ({ day: null, counts: {}, claimed: [], allDone: false, streak: 0, lastAllDay: null, clues: null, week: null, weekWords: 0, weekClaimed: false, history: [] })

export class Daily {
  constructor ({ economy, words, now = () => Date.now() }) {
    this.economy = economy
    this.words = words
    this.now = now
    economy.s.daily = { ...blankDaily(), ...(economy.s.daily || {}) }
  }

  get s () { return this.economy.s.daily }
  _save () { this.economy.dirty = true; this.economy.save(true); this.economy.emit('changed') }

  // A new UTC day (or week) starts fresh.
  _roll (t = this.now()) {
    const s = this.s
    const day = utcDay(t)
    if (s.day !== day) {
      // An unbroken run of days with every quest done.
      if (s.lastAllDay && s.lastAllDay !== utcDay(t - DAY) && s.lastAllDay !== day) s.streak = 0
      s.day = day
      s.counts = {}
      s.claimed = []
      s.allDone = false
      s.clues = null
    }
    const week = utcWeek(t)
    if (s.week !== week) { s.week = week; s.weekWords = 0; s.weekClaimed = false }
  }

  // Something happened that quests might count.
  note (kind, extra = {}) {
    this._roll()
    const c = this.s.counts
    if (kind === 'words') {
      c.words = (c.words || 0) + 1
      this.s.weekWords++
      if (extra.topic) c[`topic:${extra.topic}`] = (c[`topic:${extra.topic}`] || 0) + 1
      if (extra.streak) c.streak = Math.max(c.streak || 0, extra.streak)
    } else c[kind] = (c[kind] || 0) + 1
    this.economy.dirty = true
  }

  progress (q) {
    const c = this.s.counts
    const have = q.kind === 'topic' ? c[`topic:${q.topic}`] || 0 : c[q.kind] || 0
    return Math.min(q.n, have)
  }

  // Rewards scale with the wirdhouse, so they matter at any size.
  questReward () { return Math.round(Math.max(500, this.economy.compact().cps * 300)) }
  weeklyReward () { return Math.round(Math.max(10000, this.economy.compact().cps * 3600)) }
  cluesReward (points) { return Math.round(Math.max(300, this.economy.compact().cps * 180) * (points / 100)) }

  claim (id) {
    this._roll()
    const q = questsFor(this.s.day).find((x) => x.id === id)
    if (!q) throw new Error('That quest isn’t today’s.')
    if (this.s.claimed.includes(id)) throw new Error('Already claimed.')
    if (this.progress(q) < q.n) throw new Error('Not done yet.')
    this.s.claimed.push(id)
    let coins = this.questReward()
    let all = false
    if (this.s.claimed.length === 3 && !this.s.allDone) {
      this.s.allDone = true
      all = true
      this.s.streak = this.s.lastAllDay === utcDay(this.now() - DAY) ? this.s.streak + 1 : 1
      this.s.lastAllDay = this.s.day
      coins += this.questReward() * 2
    }
    this.economy.s.coins += coins // a reward, not earnings: no ink
    this.economy.note('got', 'rewards', coins)
    this._save()
    return { coins, all, streak: this.s.streak }
  }

  claimWeekly () {
    this._roll()
    if (this.s.weekClaimed) throw new Error('Already claimed this week.')
    if (this.s.weekWords < WEEKLY.n) throw new Error('Not done yet.')
    this.s.weekClaimed = true
    const coins = this.weeklyReward()
    this.economy.s.coins += coins
    this.economy.note('got', 'rewards', coins)
    this._save()
    return { coins }
  }

  // --- Daily Clues: one word a day, the same everywhere ---------------------------------

  word (day = null) {
    if (!day) { this._roll(); day = this.s.day }
    // Familiar words: everyday ones with three or more meanings.
    this._pool = this._pool || this.words.everyday.filter((i) => this.words.list[i][2].length >= 3).map((i) => this.words.list[i][0]).filter((w) => /^[a-z]{4,9}$/.test(w))
    const pool = this._pool
    return pool[hash32(`dailyclues|${day}`) % pool.length]
  }

  _clues () {
    this._roll()
    if (!this.s.clues) this.s.clues = { clue: 0, wrong: 0, guesses: [], solved: false, gaveUp: false, points: 0, coins: 0 }
    return this.s.clues
  }

  // Where today's puzzle starts: already showing what kind of word it is, its
  // first letter and a first meaning, so there's something to go on. Clues
  // you ask for (st.clue) come after these, and only those cost points.
  _start (all) {
    const at = all.findIndex((x) => x.kind === 'def')
    const at2 = at >= 0 ? at : all.findIndex((x) => x.kind === 'syn')
    return Math.max(0, Math.min(all.length - 1, at2 >= 0 ? at2 : 2))
  }

  cluesView () {
    const st = this._clues()
    const word = this.word()
    const all = buildClues(word, this.words.lookup(word))
    const base = this._start(all)
    const done = st.solved || st.gaveUp
    return {
      day: this.s.day,
      number: dayNumber(this.now()),
      clue: st.clue,
      count: all.length - base,
      clues: all.slice(0, Math.min(all.length, base + st.clue + 1)).map(({ pattern, ...x }) => x),
      pattern: done ? [...word].map((ch) => ch.toUpperCase()) : all[Math.min(all.length - 1, base + st.clue)].pattern,
      wrong: st.wrong,
      guesses: st.guesses,
      solved: st.solved,
      gaveUp: st.gaveUp,
      points: st.points,
      coins: st.coins,
      word: done ? word : null,
      info: done ? this.words.lookup(word) : null,
      worth: Math.max(10, 100 - 12 * st.clue - 10 * st.wrong),
      share: done ? this.shareText() : null
    }
  }

  nextClue () {
    const st = this._clues()
    if (st.solved || st.gaveUp) return this.cluesView()
    const word = this.word()
    const all = buildClues(word, this.words.lookup(word))
    if (this._start(all) + st.clue < all.length - 1) st.clue++
    this._save()
    return this.cluesView()
  }

  guess (text) {
    const st = this._clues()
    if (st.solved || st.gaveUp) return this.cluesView()
    const g = plain(text).slice(0, 40)
    if (!g) return this.cluesView()
    if (g === plain(this.word())) {
      st.solved = true
      st.points = Math.max(10, 100 - 12 * st.clue - 10 * st.wrong)
      st.coins = this.cluesReward(st.points)
      this.economy.s.coins += st.coins
      this.economy.note('got', 'rewards', st.coins)
      this.note('clues')
      this.s.history = [{ day: this.s.day, points: st.points, clue: st.clue, wrong: st.wrong }, ...this.s.history].slice(0, 60)
    } else {
      st.wrong++
      st.guesses.push(String(text).trim().slice(0, 40))
    }
    this._save()
    return this.cluesView()
  }

  giveUp () {
    const st = this._clues()
    if (!st.solved) st.gaveUp = true
    this._save()
    return this.cluesView()
  }

  // A result to paste anywhere, without giving the word away.
  shareText () {
    const st = this.s.clues
    const marks = [...Array(st.clue + 1)].map((_, i) => (i === st.clue && st.solved ? '🟩' : '🟨')).join('') + '🟥'.repeat(Math.min(st.wrong, 6))
    return st.solved
      ? `wirdwatcher Daily Clues #${dayNumber(this.now())}: ${st.points} points\n${marks}\n${st.clue} clue${st.clue === 1 ? '' : 's'}, ${st.wrong} miss${st.wrong === 1 ? '' : 'es'}`
      : `wirdwatcher Daily Clues #${dayNumber(this.now())}: stumped\n${marks}`
  }

  // What friends see: how today's went.
  public () {
    const st = this.s.clues
    if (!st || this.s.day !== utcDay(this.now())) return null
    return { day: this.s.day, solved: st.solved, gaveUp: st.gaveUp, clue: st.clue, wrong: st.wrong, points: st.points }
  }

  view () {
    this._roll()
    const quests = questsFor(this.s.day).map((q) => ({ ...q, have: this.progress(q), claimed: this.s.claimed.includes(q.id) }))
    const nextDay = Date.parse(`${this.s.day}T00:00:00Z`) + DAY
    return {
      day: this.s.day,
      quests,
      questReward: this.questReward(),
      allBonus: this.questReward() * 2,
      allDone: this.s.allDone,
      streak: this.s.streak,
      weekly: { ...WEEKLY, have: Math.min(WEEKLY.n, this.s.weekWords), claimed: this.s.weekClaimed, reward: this.weeklyReward(), ends: Date.parse(`${this.s.week}T00:00:00Z`) + 7 * DAY },
      resetsAt: nextDay,
      freeSpin: { ready: this.economy.freeSpinReady(), amount: this.economy.freeSpinAmount() },
      clues: this.cluesView()
    }
  }
}
