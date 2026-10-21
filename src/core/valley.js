// Wird Valley on this computer: the field, the bag, the gods' friendship,
// and the outdoor minigames (fishing, foraging, butterflies, stargazing).
// Kept inside economy.json (as s.valley) so it saves with the coins. The
// rules and the content are in src/shared/valley.js.

import crypto from 'node:crypto'
import {
  HOUR, WET_HOURS, HEART, MAX_FRIEND, MAX_DATING, MAX_MARRIED, GIFTS_PER_WEEK, TALK_POINTS, GIFT_POINTS, BIRTHDAY_MULT,
  BOUQUET, QUILL, STARDUST, WORD_SEEDS_MAX, CROPS, WORD_CROP, FISH, BUGS, SHOP, GODS, GOD_IDS, ACTIVITIES, FIELD, fieldStart,
  cropDone, dayKey, weekKey, isRainy, partOfDay, itemInfo, taste, isBirthday, heartsOf, pickFish, pickBug, BUG_ROUND_MS,
  forestRound, starsTonight, isNight, outingPoints, hash32, RESET_MS
} from '../shared/valley.js'

const STEP = 15 * 60e3 // growth is worked out in quarter hours
export const blankValley = () => ({
  field: fieldStart(),
  bag: { 'seed:syllabeet': 6, 'seed:thyme': 3 },
  gods: {},
  spouse: null,
  forest: { window: null, found: [] },
  stars: { night: null, done: false },
  net: null,
  fishing: null,
  day: null,
  news: [],
  stats: { harvested: 0, fish: {}, bugs: {}, found: 0, constellations: 0, shipped: 0, earned: 0, gifts: 0, outings: 0 },
  started: 0
})
const blankGod = () => ({ points: 0, talked: null, outing: null, gifts: { week: null, n: 0 }, seen: [], dating: false, married: false, met: false, known: {} })

export class Valley {
  constructor ({ economy, now = () => Date.now(), random = () => crypto.randomInt(2 ** 32) / 2 ** 32 }) {
    this.economy = economy
    this.now = now
    this.random = random
    // An early build kept a walkable farm as s.farm; Wird Valley starts fresh.
    delete economy.s.farm
    const v = { ...blankValley(), ...(economy.s.valley || {}) }
    v.stats = { ...blankValley().stats, ...(v.stats || {}) }
    if (!Array.isArray(v.field) || v.field.length !== FIELD) v.field = fieldStart()
    for (const id of GOD_IDS) v.gods[id] = { ...blankGod(), ...(v.gods[id] || {}) }
    if (!v.started) v.started = this.now()
    economy.s.valley = v
  }

  get s () { return this.economy.s.valley }
  _save () { this.economy.dirty = true; this.economy.save(true); this.economy.emit('changed') }
  _add (id, n = 1) { this.s.bag[id] = (this.s.bag[id] || 0) + n; if (this.s.bag[id] <= 0) delete this.s.bag[id] }
  _take (id, n = 1) {
    if (!((this.s.bag[id] || 0) >= n)) throw new Error('You don’t have that.')
    this._add(id, -n)
  }

  _news (text) { this.s.news = [{ at: this.now(), text }, ...this.s.news].slice(0, 12) }

  // Bring the valley up to now: crops grow while wet, and each new day the
  // spouse helps out.
  tick (t = this.now()) {
    const day = dayKey(t)
    if (this.s.day !== day) {
      const first = !this.s.day
      this.s.day = day
      if (!first && this.s.spouse && hash32(`chore|${day}|${this.s.spouse}`) % 100 < 40) {
        let n = 0
        for (const c of this.s.field) if (c.crop && !c.ready) { this._grow(c, t); c.wetUntil = Math.max(c.wetUntil || 0, t + WET_HOURS * HOUR); n++ }
        if (n) this._news(`${GODS[this.s.spouse].name} watered the field this morning.`)
      }
    }
    for (const c of this.s.field) if (c.crop) this._grow(c, t)
  }

  _grow (c, t) {
    if (c.ready) { c.lastAt = t; return }
    let at = c.lastAt || t
    const need = c.regrowing ? (CROPS[c.crop]?.regrow || 0) * HOUR : cropDone(c)
    while (at < t && c.grown < need) {
      const to = Math.min(t, at + STEP)
      const mid = (at + to) / 2
      if ((c.wetUntil || 0) >= mid || isRainy(dayKey(mid))) c.grown += to - at
      at = to
    }
    c.lastAt = t
    if (c.grown >= need) { c.ready = true; c.grown = need }
  }

  _cell (i) {
    if (!(i >= 0 && i < FIELD)) throw new Error('That’s off the field.')
    return this.s.field[i]
  }

  // --- the field ---
  // The hoe: clears a weed or stone, or turns grass into tilled soil.
  till (i) {
    this.tick()
    const c = this._cell(i)
    if (c.decor) { c.decor = null; this._save(); return { cleared: true } }
    if (c.soil === 'tilled') return { already: true } // nothing to do
    c.soil = 'tilled'
    this._save()
    return { tilled: true }
  }

  plant (i, item) {
    this.tick()
    const c = this._cell(i)
    if (c.soil !== 'tilled') throw new Error('Till the soil first, with the hoe.')
    if (c.crop) throw new Error('Something is already growing there.')
    const info = itemInfo(String(item))
    if (!info || (info.kind !== 'seed' && info.kind !== 'wordseed')) throw new Error('That isn’t a seed.')
    this._take(item)
    const t = this.now()
    Object.assign(c, { crop: info.kind === 'wordseed' ? 'word' : info.crop, word: info.word || null, grown: 0, wetUntil: isRainy(dayKey(t)) ? t + WET_HOURS * HOUR : (c.wetUntil || 0), lastAt: t, ready: false, regrowing: false })
    this._save()
    return { planted: c.crop }
  }

  water (i) {
    this.tick()
    const c = this._cell(i)
    if (c.soil !== 'tilled') throw new Error('Nothing to water there.')
    if (c.ready) throw new Error('That’s ready to pick.')
    c.wetUntil = this.now() + WET_HOURS * HOUR
    this._save()
    return { watered: true }
  }

  harvest (i) {
    this.tick()
    const c = this._cell(i)
    if (!c.crop || !c.ready) throw new Error('Not ready yet.')
    const id = c.crop === 'word' ? `word:${c.word}` : c.crop
    this._add(id)
    this.s.stats.harvested++
    const crop = CROPS[c.crop]
    if (crop?.regrow) Object.assign(c, { ready: false, regrowing: true, grown: 0, lastAt: this.now() })
    else { for (const k of ['crop', 'word', 'grown', 'ready', 'regrowing', 'lastAt']) delete c[k] }
    this._save()
    return { item: id, info: itemInfo(id) }
  }

  // --- the stall and the bin ---
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

  // --- foraging: the woods refill every few hours ---
  _forest () {
    const round = forestRound(this.now())
    if (this.s.forest.window !== round.window) this.s.forest = { window: round.window, found: [] }
    return round
  }

  forage (id) {
    const round = this._forest()
    const it = round.items.find((x) => x.id === id)
    if (!it || this.s.forest.found.includes(id)) throw new Error('Nothing there now.')
    this.s.forest.found.push(id)
    this._add(it.kind)
    this.s.stats.found++
    this._save()
    return { item: it.kind, info: itemInfo(it.kind), left: round.items.length - this.s.forest.found.length }
  }

  // --- butterflies: a round of things fluttering by ---
  netStart () {
    const t = this.now()
    if (isRainy(dayKey(t))) throw new Error('The butterflies are sheltering from the rain. Try another day.')
    const r = () => this.random()
    const bugs = Array.from({ length: 7 }, (_, i) => {
      const kind = pickBug(r, t)
      return { id: i, kind, speed: BUGS[kind].speed, seed: Math.floor(r() * 1e9) }
    })
    this.s.net = { at: t, bugs, caught: [] }
    this.economy.dirty = true
    return { at: t, ms: BUG_ROUND_MS, bugs }
  }

  netCatch (id) {
    const n = this.s.net
    if (!n || this.now() > n.at + BUG_ROUND_MS + 2000) throw new Error('The meadow’s gone quiet. Start again.')
    const b = n.bugs.find((x) => x.id === Number(id))
    if (!b || n.caught.includes(b.id)) throw new Error('Missed.')
    n.caught.push(b.id)
    this._add(b.kind)
    this.s.stats.bugs[b.kind] = (this.s.stats.bugs[b.kind] || 0) + 1
    this._save()
    return { item: b.kind, info: itemInfo(b.kind), first: this.s.stats.bugs[b.kind] === 1 }
  }

  // --- stargazing: tonight's constellation, traced once a night ---
  stars (word) {
    const t = this.now()
    if (!isNight(t)) throw new Error('The stars come out after 9 in the evening.')
    const tonight = starsTonight(t)
    if (this.s.stars.night === tonight.night && this.s.stars.done) throw new Error('You’ve traced this one. Another rises within ten minutes.')
    if (String(word).toUpperCase() !== tonight.word) throw new Error('That’s not quite it.')
    this.s.stars = { night: tonight.night, done: true }
    this._add(STARDUST)
    this.s.stats.constellations++
    this._save()
    return { word: tonight.word, item: STARDUST, info: itemInfo(STARDUST) }
  }

  // --- fishing ---
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
    const due = [2, 4, 6, 8].find((h) => heartsOf(g.points) >= h && !g.seen.includes(h))
    let lines
    let event = null
    if (due) { g.seen.push(due); event = due; lines = G.events[due] } else {
      const pool = G.lines[this._tier(g)]
      lines = [pool[hash32(`${id}|${day}|${g.talked === day ? 'again' : ''}`) % pool.length]]
      if (isBirthday(id, t) && g.talked !== day) lines = [...lines, 'It’s my birthday today, you know.']
    }
    let gained = 0
    if (g.talked !== day) { g.talked = day; gained = TALK_POINTS + (event ? 30 : 0); this._gain(g, gained) }
    let gift = null
    if (g.married && gained && hash32(`spousegift|${day}`) % 100 < 35) {
      const pool = [...G.loves, ...G.likes].filter((x) => x !== 'page' && x !== STARDUST && !FISH[x]?.legendary)
      gift = pool[hash32(`sg|${day}|${id}`) % pool.length]
      this._add(gift)
    }
    this._save()
    return { god: id, lines, event, first, gained, gift, giftName: gift ? itemInfo(gift).name : null, hearts: heartsOf(g.points), points: g.points }
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
    const pts = GIFT_POINTS[how] * (bday ? BIRTHDAY_MULT : 1)
    if (bday) g.gifts.bday = dayKey(t); else g.gifts.n++
    g.met = true
    this._gain(g, pts)
    g.known[info.kind === 'word' ? `word:${how}` : item] = how
    this.s.stats.gifts++
    this._save()
    return { god: id, item, how, birthday: bday, line: bday ? G.react.birthday : G.react[how], points: pts, hearts: heartsOf(g.points) }
  }

  // An outing together: once a day each. How well it went, 0 to 1, and
  // whether it's one of their favourite things, decide how much it means.
  outing (id, activity, quality = 1) {
    this.tick()
    const g = this._god(id)
    const G = GODS[id]
    if (!ACTIVITIES[activity]) throw new Error('No such outing.')
    const t = this.now()
    if (typeof g.outing === 'number' && t - g.outing < RESET_MS) throw new Error(`${G.name} needs a little rest. Ask again in ${Math.ceil((g.outing + RESET_MS - t) / 60000)} min.`)
    g.outing = t
    g.met = true
    const pts = outingPoints(id, activity, Number(quality) || 0)
    this._gain(g, pts)
    this.s.stats.outings++
    this._save()
    const fav = G.fav.includes(activity)
    return { god: id, activity, points: pts, fav, line: fav ? G.outing.fav : G.outing.after, hearts: heartsOf(g.points) }
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
    for (const [other, x] of Object.entries(this.s.gods)) if (other !== id && x.dating) { x.dating = false; x.points = Math.min(x.points, MAX_FRIEND) }
    this._news(`You married ${G.name}. They’ve moved into the farmhouse.`)
    this._save()
    return { god: id, item: QUILL, how: 'love', line: G.accept.quill, married: true, hearts: heartsOf(g.points) }
  }

  // --- for the screen ---
  view () {
    this.tick()
    const t = this.now()
    const day = dayKey(t)
    const week = weekKey(t)
    const forest = this._forest()
    const tonight = starsTonight(t)
    const gods = GOD_IDS.map((id) => {
      const g = this.s.gods[id]
      const G = GODS[id]
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
        outingToday: typeof g.outing === 'number' && t - g.outing < RESET_MS,
        outingIn: typeof g.outing === 'number' ? Math.max(0, g.outing + RESET_MS - t) : 0,
        giftsLeft: g.gifts.week === week ? Math.max(0, GIFTS_PER_WEEK - g.gifts.n) : GIFTS_PER_WEEK,
        dating: g.dating,
        married: g.married,
        met: g.met,
        known: g.known,
        fav: g.met ? G.fav : null,
        wordHint: Object.keys(g.known).some((k) => k.startsWith('word:')) ? G.wordHint : null,
        invite: G.outing.invite
      }
    })
    const field = this.s.field.map((c, i) => {
      const base = { i, soil: c.soil, decor: c.decor || null, wet: c.soil === 'tilled' && ((c.wetUntil || 0) > t || isRainy(day)) }
      if (!c.crop) return base
      const need = c.regrowing ? (CROPS[c.crop]?.regrow || 0) * HOUR : cropDone(c)
      return { ...base, crop: c.crop, word: c.word, ready: c.ready, progress: need ? Math.min(1, c.grown / need) : 1, hoursLeft: Math.max(0, (need - c.grown) / HOUR), regrowing: c.regrowing }
    })
    return {
      at: t,
      day,
      part: partOfDay(t),
      rainy: isRainy(day),
      night: isNight(t),
      field,
      bag: Object.entries(this.s.bag).map(([id, n]) => ({ ...itemInfo(id), n })).filter((x) => x.id),
      gods,
      spouse: this.s.spouse,
      forest: { until: forest.until, items: forest.items.filter((x) => !this.s.forest.found.includes(x.id)), total: forest.items.length },
      stars: { done: this.s.stars.night === tonight.night && this.s.stars.done, letters: tonight.word.length, stars: isNight(t) ? tonight.stars.map((s) => ({ x: s.x, y: s.y, letter: s.letter })) : null },
      shop: SHOP,
      news: this.s.news.slice(0, 6),
      stats: this.s.stats,
      activities: ACTIVITIES,
      crops: Object.fromEntries(Object.entries(CROPS).map(([id, c]) => [id, { name: c.name, color: c.color, leaf: c.leaf, shape: c.shape, hours: c.hours, regrow: c.regrow || 0, sell: c.sell }])),
      wordCrop: WORD_CROP,
      coins: this.economy.s.coins
    }
  }
}
