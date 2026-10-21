// The Word Farm on this computer: plots, the bag, the gods' friendship and
// fishing. Kept inside economy.json (as s.farm) so it saves with the coins.
// The rules and the content are in src/shared/farm.js.

import crypto from 'node:crypto'
import {
  HOUR, WET_HOURS, HEART, MAX_FRIEND, MAX_DATING, MAX_MARRIED, GIFTS_PER_WEEK, TALK_POINTS, GIFT_POINTS, BIRTHDAY_MULT,
  BOUQUET, QUILL, WORD_SEEDS_MAX, CROPS, WORD_CROP, FISH, SHOP, GODS, GOD_IDS, PLOTS, SPOTS, cropDone, dayKey, dayStart,
  weekKey, isRainy, partOfDay, itemInfo, taste, isBirthday, heartsOf, forageFor, pickFish, hash32
} from '../shared/farm.js'

const STEP = 15 * 60e3 // growth is worked out in quarter hours
export const blankFarm = () => ({
  plots: PLOTS.map(() => null),
  bag: { 'seed:syllabeet': 6, 'seed:thyme': 3 },
  gods: {},
  spouse: null,
  foraged: { day: null, picked: [] },
  day: null,
  news: [],
  fishing: null,
  stats: { harvested: 0, fish: {}, shipped: 0, earned: 0, gifts: 0 },
  started: 0
})
const blankGod = () => ({ points: 0, talked: null, gifts: { week: null, n: 0 }, seen: [], dating: false, married: false, met: false, known: {} })

export class Farm {
  constructor ({ economy, now = () => Date.now(), random = () => crypto.randomInt(2 ** 32) / 2 ** 32 }) {
    this.economy = economy
    this.now = now
    this.random = random
    const f = { ...blankFarm(), ...(economy.s.farm || {}) }
    f.stats = { ...blankFarm().stats, ...(f.stats || {}) }
    if (!Array.isArray(f.plots) || f.plots.length !== PLOTS.length) f.plots = PLOTS.map((_, i) => f.plots?.[i] || null)
    for (const id of GOD_IDS) f.gods[id] = { ...blankGod(), ...(f.gods[id] || {}) }
    if (!f.started) f.started = this.now()
    economy.s.farm = f
  }

  get s () { return this.economy.s.farm }
  _save () { this.economy.dirty = true; this.economy.save(true); this.economy.emit('changed') }
  _add (id, n = 1) { this.s.bag[id] = (this.s.bag[id] || 0) + n; if (this.s.bag[id] <= 0) delete this.s.bag[id] }
  _take (id, n = 1) {
    if (!((this.s.bag[id] || 0) >= n)) throw new Error('You don’t have that.')
    this._add(id, -n)
  }

  _news (text) { this.s.news = [{ at: this.now(), text }, ...this.s.news].slice(0, 12) }

  // Bring the farm up to now: crops grow while wet, and each new day the
  // spouse helps out.
  tick (t = this.now()) {
    const day = dayKey(t)
    if (this.s.day !== day) {
      const first = !this.s.day
      this.s.day = day
      if (!first && this.s.spouse && hash32(`chore|${day}|${this.s.spouse}`) % 100 < 40) {
        const g = GODS[this.s.spouse]
        let n = 0
        for (const p of this.s.plots) if (p && !p.ready) { this._grow(p, t); p.wetUntil = Math.max(p.wetUntil || 0, t + WET_HOURS * HOUR); n++ }
        if (n) this._news(`${g.name} watered the crops this morning.`)
      }
    }
    for (const p of this.s.plots) if (p) this._grow(p, t)
  }

  _grow (p, t) {
    if (p.ready) { p.lastAt = t; return }
    let at = p.lastAt || t
    const need = p.regrowing ? (CROPS[p.crop]?.regrow || 0) * HOUR : cropDone(p)
    while (at < t && p.grown < need) {
      const to = Math.min(t, at + STEP)
      const mid = (at + to) / 2
      if ((p.wetUntil || 0) >= mid || isRainy(dayKey(mid))) p.grown += to - at
      at = to
    }
    p.lastAt = t
    if (p.grown >= need) { p.ready = true; p.grown = need }
  }

  _plot (i) {
    if (!(i >= 0 && i < PLOTS.length)) throw new Error('No such plot.')
    return this.s.plots[i]
  }

  plant (i, item) {
    this.tick()
    if (this._plot(i)) throw new Error('Something is already growing there.')
    const info = itemInfo(String(item))
    if (!info || (info.kind !== 'seed' && info.kind !== 'wordseed')) throw new Error('That isn’t a seed.')
    this._take(item)
    const t = this.now()
    this.s.plots[i] = { crop: info.kind === 'wordseed' ? 'word' : info.crop, word: info.word || null, grown: 0, wetUntil: isRainy(dayKey(t)) ? t + WET_HOURS * HOUR : 0, lastAt: t, ready: false, regrowing: false, at: t }
    this._save()
    return this.s.plots[i]
  }

  water (i) {
    this.tick()
    const p = this._plot(i)
    if (!p) throw new Error('Nothing planted there.')
    if (p.ready) throw new Error('That’s ready to pick.')
    p.wetUntil = this.now() + WET_HOURS * HOUR
    this._save()
    return p
  }

  // Water every plot that needs it, all at once (in the rain, nothing needs it).
  waterAll () {
    this.tick()
    const t = this.now()
    let n = 0
    for (const p of this.s.plots) if (p && !p.ready && (p.wetUntil || 0) < t + HOUR) { p.wetUntil = t + WET_HOURS * HOUR; n++ }
    this._save()
    return n
  }

  harvest (i) {
    this.tick()
    const p = this._plot(i)
    if (!p || !p.ready) throw new Error('Not ready yet.')
    const id = p.crop === 'word' ? `word:${p.word}` : p.crop
    this._add(id)
    this.s.stats.harvested++
    const c = CROPS[p.crop]
    if (c?.regrow) { p.ready = false; p.regrowing = true; p.grown = 0; p.lastAt = this.now() } else this.s.plots[i] = null
    this._save()
    return { item: id, info: itemInfo(id) }
  }

  // Pull up a crop that's still growing, to plant something else.
  clear (i) {
    this.tick()
    if (!this._plot(i)) throw new Error('Nothing there.')
    this.s.plots[i] = null
    this._save()
  }

  buy (id, n = 1) {
    this.economy.tick()
    const item = SHOP.find((x) => x.id === id)
    if (!item) throw new Error('The stall doesn’t sell that.')
    n = Math.max(1, Math.min(99, Math.floor(Number(n) || 1)))
    this.economy._spend(item.price * n, 'farm')
    this._add(id, n)
    this._save()
    return { id, n }
  }

  sell (id, n = 1) {
    this.economy.tick()
    const info = itemInfo(String(id))
    if (!info || !(info.sell > 0)) throw new Error('Nobody will buy that.')
    n = Math.max(1, Math.min(this.s.bag[id] || 0, Math.floor(Number(n) || 1)))
    this._take(id, n)
    const coins = info.sell * n
    this.economy._earn(coins, 'farm')
    this.s.stats.shipped += n
    this.s.stats.earned += coins
    this._save()
    return { id, n, coins }
  }

  // Everything you'd sell, shipped at once (seeds and keepsakes stay).
  sellAll () {
    let coins = 0
    for (const [id, n] of Object.entries(this.s.bag)) {
      const info = itemInfo(id)
      if (!info || !(info.sell > 0) || ['seed', 'wordseed', 'special'].includes(info.kind)) continue
      coins += this.sell(id, n).coins
    }
    return { coins }
  }

  // A new word was rated: it drops a seed of itself (whatever you rated it).
  onNewWord (word) {
    const w = String(word).toLowerCase()
    if (!/^[a-z][a-z'-]*$/.test(w)) return null
    const seeds = Object.keys(this.s.bag).filter((k) => k.startsWith('wordseed:'))
    if (seeds.length >= WORD_SEEDS_MAX && !this.s.bag[`wordseed:${w}`]) delete this.s.bag[seeds[0]]
    this._add(`wordseed:${w}`)
    this.economy.dirty = true
    return w
  }

  forage (id) {
    this.tick()
    const day = dayKey(this.now())
    if (this.s.foraged.day !== day) this.s.foraged = { day, picked: [] }
    const spot = forageFor(day).find((f) => f.id === id)
    if (!spot || this.s.foraged.picked.includes(id)) throw new Error('Nothing there now.')
    this.s.foraged.picked.push(id)
    this._add(spot.kind)
    this._save()
    return { item: spot.kind, info: itemInfo(spot.kind) }
  }

  // --- the gods ---
  _god (id) {
    if (!GODS[id]) throw new Error('No such god.')
    return this.s.gods[id]
  }

  _cap (g) { return g.married ? MAX_MARRIED : g.dating ? MAX_DATING : MAX_FRIEND }
  _gain (g, n) { g.points = Math.max(0, Math.min(this._cap(g), g.points + n)) }

  _tier (g) {
    if (g.married) return 'married'
    if (g.dating) return 'dating'
    const h = heartsOf(g.points)
    return h >= 6 ? 't2' : h >= 3 ? 't1' : 't0'
  }

  talk (id) {
    this.tick()
    const g = this._god(id)
    const G = GODS[id]
    const t = this.now()
    const day = dayKey(t)
    const first = !g.met
    g.met = true
    // A heart event, if one's due and unseen.
    const due = [2, 4, 6, 8].find((h) => heartsOf(g.points) >= h && !g.seen.includes(h))
    let lines
    let event = null
    if (due) { g.seen.push(due); event = due; lines = G.events[due] } else {
      const pool = G.lines[this._tier(g)]
      lines = [pool[hash32(`${id}|${day}|${g.talked === day ? 'again' : ''}`) % pool.length]]
      if (isBirthday(id, t) && g.talked !== day) lines = [...lines, 'It’s my birthday today, you know.']
    }
    let gained = 0
    if (g.talked !== day) { g.talked = day; this._gain(g, TALK_POINTS + (event ? 30 : 0)); gained = TALK_POINTS + (event ? 30 : 0) }
    // The spouse sometimes has something for you in the morning.
    let gift = null
    if (g.married && gained && hash32(`spousegift|${day}`) % 100 < 35) {
      const pool = [...G.loves, ...G.likes].filter((x) => x !== 'page' && !FISH[x]?.legendary)
      gift = pool[hash32(`sg|${day}|${id}`) % pool.length]
      this._add(gift)
    }
    this._save()
    return { god: id, lines, event, first, gained, gift, hearts: heartsOf(g.points), points: g.points }
  }

  gift (id, item) {
    this.tick()
    const g = this._god(id)
    const G = GODS[id]
    const t = this.now()
    item = String(item)
    const info = itemInfo(item)
    if (!info) throw new Error('No such thing.')
    if (!(this.s.bag[item] > 0)) throw new Error('You don’t have that.')
    if (item === BOUQUET) return this._bouquet(id)
    if (item === QUILL) return this._propose(id)
    const week = weekKey(t)
    if (g.gifts.week !== week) g.gifts = { week, n: 0 }
    const bday = isBirthday(id, t)
    if (g.gifts.n >= GIFTS_PER_WEEK && !bday) throw new Error(`${G.name} has had two gifts from you this week. Try again next week.`)
    if (bday && g.gifts.bday === dayKey(t)) throw new Error(`You’ve already given ${G.name} a birthday gift.`)
    const how = taste(id, item)
    this._take(item)
    let pts = GIFT_POINTS[how] * (bday ? BIRTHDAY_MULT : 1)
    if (bday) g.gifts.bday = dayKey(t); else g.gifts.n++
    g.met = true
    this._gain(g, pts)
    g.known[info.kind === 'word' ? `word:${how}` : item] = how
    this.s.stats.gifts++
    this._save()
    const line = bday ? G.react.birthday : G.react[how]
    if (pts < 0) pts = Math.round(pts)
    return { god: id, item, how, birthday: bday, line, points: pts, hearts: heartsOf(g.points) }
  }

  _bouquet (id) {
    const g = this._god(id)
    const G = GODS[id]
    if (Object.values(this.s.gods).some((x) => x.married)) throw new Error('You’re married. Best not.')
    if (g.dating) throw new Error(`You’re already dating ${G.name}.`)
    if (heartsOf(g.points) < 8) throw new Error(`${G.name} would like to be closer friends first (8 hearts).`)
    this._take(BOUQUET)
    g.dating = true
    this._news(`You and ${G.name} are dating.`)
    this._save()
    return { god: id, item: BOUQUET, how: 'love', line: G.accept.bouquet, dating: true, hearts: heartsOf(g.points) }
  }

  _propose (id) {
    const g = this._god(id)
    const G = GODS[id]
    if (this.s.spouse) throw new Error('You’re already married.')
    if (!g.dating) throw new Error(`You’d need to be dating ${G.name} first. Give them a bouquet.`)
    if (heartsOf(g.points) < 10) throw new Error(`${G.name} isn’t quite ready (10 hearts).`)
    this._take(QUILL)
    g.married = true
    this.s.spouse = id
    // Dating anyone else ends kindly.
    for (const [other, x] of Object.entries(this.s.gods)) if (other !== id && x.dating) { x.dating = false; x.points = Math.min(x.points, MAX_FRIEND) }
    this._news(`You married ${G.name}. They’ve moved into the farmhouse.`)
    this._save()
    return { god: id, item: QUILL, how: 'love', line: G.accept.quill, married: true, hearts: heartsOf(g.points) }
  }

  // --- fishing ---
  // Cast: something will bite after a moment. The screen plays the catch;
  // reel() says how it went.
  cast () {
    this.tick()
    const t = this.now()
    const r = () => this.random()
    const fish = pickFish(r, t, isRainy(dayKey(t)))
    const bite = 1500 + Math.floor(r() * 4500)
    this.s.fishing = { fish, at: t, bite }
    this.economy.dirty = true
    const f = FISH[fish]
    return { bite, diff: f.diff, moves: f.moves, junk: Boolean(f.junk), legendary: Boolean(f.legendary) }
  }

  reel (caught) {
    const c = this.s.fishing
    this.s.fishing = null
    if (!c) throw new Error('Nothing on the line.')
    const t = this.now()
    if (t < c.at + c.bite - 250) { this._save(); return { early: true } }
    const f = FISH[c.fish]
    if (!caught && !f.junk) { this._save(); return { got: false, fish: c.fish, name: f.name } }
    this._add(c.fish)
    if (!f.junk) this.s.stats.fish[c.fish] = (this.s.stats.fish[c.fish] || 0) + 1
    this._save()
    return { got: true, fish: c.fish, info: itemInfo(c.fish), first: this.s.stats.fish[c.fish] === 1 }
  }

  // --- for the screen ---
  view () {
    this.tick()
    const t = this.now()
    const day = dayKey(t)
    const picked = this.s.foraged.day === day ? this.s.foraged.picked : []
    const part = partOfDay(t)
    const gods = GOD_IDS.map((id) => {
      const g = this.s.gods[id]
      const G = GODS[id]
      const week = weekKey(t)
      return {
        id,
        name: G.name,
        title: G.title,
        birthday: G.birthday,
        birthdayToday: isBirthday(id, t),
        hearts: heartsOf(g.points),
        points: g.points,
        progress: (g.points % HEART) / HEART,
        maxHearts: this._cap(g) / HEART,
        talkedToday: g.talked === day,
        giftsLeft: g.gifts.week === week ? Math.max(0, GIFTS_PER_WEEK - g.gifts.n) : GIFTS_PER_WEEK,
        dating: g.dating,
        married: g.married,
        met: g.met,
        known: g.known,
        wordHint: Object.keys(g.known).some((k) => k.startsWith('word:')) ? G.wordHint : null,
        spot: g.married ? (part === 'night' || part === 'morning' ? [6, 7] : SPOTS[id][part]) : SPOTS[id][part]
      }
    })
    const plots = this.s.plots.map((p, i) => {
      if (!p) return null
      const need = p.regrowing ? (CROPS[p.crop]?.regrow || 0) * HOUR : cropDone(p)
      return { i, crop: p.crop, word: p.word, ready: p.ready, wet: (p.wetUntil || 0) > t || isRainy(day), progress: need ? Math.min(1, p.grown / need) : 1, hoursLeft: Math.max(0, (need - p.grown) / HOUR), regrowing: p.regrowing }
    })
    return {
      at: t,
      day,
      part,
      rainy: isRainy(day),
      dayStart: dayStart(t),
      plots,
      bag: Object.entries(this.s.bag).map(([id, n]) => ({ ...itemInfo(id), n })).filter((x) => x.id),
      gods,
      spouse: this.s.spouse,
      forage: forageFor(day).filter((f) => !picked.includes(f.id)),
      shop: SHOP,
      news: this.s.news.slice(0, 6),
      stats: this.s.stats,
      crops: Object.fromEntries(Object.entries(CROPS).map(([id, c]) => [id, { name: c.name, color: c.color, leaf: c.leaf, shape: c.shape, hours: c.hours, regrow: c.regrow || 0, sell: c.sell }])),
      wordCrop: WORD_CROP,
      coins: this.economy.s.coins
    }
  }
}
