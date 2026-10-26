// Socials on this computer: Writter, readit and WirdIn. The world's posts
// come from the shared feed (src/shared/socials/feed.js), built here from
// facts every computer agrees on: the word list, Word Exchange prices,
// sports results, the Daily Clues number. Your own posts (and your
// friends') sync as records, s/<id>, and friends' votes as v/<id>; your
// follower count is worked out from your posts, so it's the same wherever
// it's shown.
//
// Kept in economy.json as s.socials, so it lasts through publishing.

import crypto from 'node:crypto'
import { hash32, profile, priceAt } from '../shared/market.js'
import { slate, game, team, LEAGUES } from '../shared/sports.js'
import { feed, findPost, statsAt, trends, repliesFor, rng, isWritterDay, mainCharacter, slotOf, SLOT_MS } from '../shared/socials/feed.js'
import { render, engagement, countsAt, gradeCall, followerGain, myReplies } from '../shared/socials/player.js'
import { throwaway, REGULARS, validHandle } from '../shared/socials/cast.js'
import { SUBS, SUB, STANCE, TIERS, tierFor, LEGACY_AT, BLUE, BLUE_TIER, SPONSORS } from '../shared/socials/content.js'
import { SM_GOALS, SOCIALS_COSMETICS } from '../shared/socials/looks.js'
import { baseCps } from '../shared/economy.js'

const HOUR = 3600e3
const DAY = 24 * HOUR
const MAX_POSTS = 300
const MAX_EXTRA = 140
// Words the crowd never gets named after (or posts about): the list is
// already clean, but names and hot takes need a wider berth.
const AVOID = new Set('handcuff handcuffs gimp cripple crippled spastic midget lame idiot moron imbecile cretin dwarf fatso lunatic psycho schizo junkie addict slave slavery rape rapist murder murderer kill killer killing suicide corpse nazi terrorist terrorism bomb bomber genocide massacre abortion cancer tumor tumour disease death dead dying die drug drugs cocaine heroin porn sex sexy sexual naked nude erotic penis vagina breast breasts nipple anus rectum urine feces faeces vomit gun rifle pistol weapon sniper bullet shoot shooting stab stabbing hang hanging noose torture victim widow orphan disabled handicapped obese anorexic bulimic deaf blind mute ugly stupid dumb fool impotence impotent incest molest molester pervert pervert sexist racist fetish orgasm lust condom syphilis herpes gonorrhea sodomy prostitute brothel'.split(' '))
const dayNumber = (t) => Math.floor((t - Date.UTC(2026, 0, 1)) / DAY) + 1
const blank = () => ({ handle: null, posts: [], votes: {}, blue: null, legacy: false, boughtBlue: 0, paidViews: 0, payoutDay: null, paidToday: 0, sponsors: { done: {}, pending: null }, seen: 0, best: { likes: 0, followers: 0, karma: 0 }, flags: {} })

export class Socials {
  constructor ({ economy, store, words, rated, me, now = () => Date.now(), award = () => null }) {
    this.economy = economy
    this.store = store
    this.words = words
    this.rated = rated
    this.me = me
    this.now = now
    this.award = award
    const s = economy.s.socials || {}
    economy.s.socials = { ...blank(), ...s, sponsors: { ...blank().sponsors, ...(s.sponsors || {}) }, best: { ...blank().best, ...(s.best || {}) }, flags: { ...(s.flags || {}) } }
    this._world = new Map()
    this._profiles = new Map()
  }

  get s () { return this.economy.s.socials }

  // --- the shared world ----------------------------------------------------------------------
  get ctx () {
    if (this._ctx) return this._ctx
    const W = this.words
    const everyday = W.everyday.map((i) => W.list[i][0]).filter((w) => /^[a-z]{4,10}$/.test(w) && !AVOID.has(w))
    const adj = []; const noun = []
    for (const w of everyday) { const m = W.meta(w); if (!m) continue; if (/[as]/.test(m.pos)) adj.push(w); if (m.pos.includes('n')) noun.push(w) }
    const market = everyday.filter((w) => W.marketFacts(w))
    const prof = (w) => { let p = this._profiles.get(w); if (!p) { const f = W.marketFacts(w); if (!f) return null; p = profile(w, f); if (this._profiles.size > 5000) this._profiles.clear(); this._profiles.set(w, p) } return p }
    this._price = (w, t) => { const p = prof(w); return p ? priceAt(p, t) : null }
    const self = this
    this._ctx = {
      pools: { adj: adj.slice(0, 4000), noun: noun.slice(0, 4000), any: everyday.slice(0, 6000) },
      word: (x) => everyday[Math.floor(x * everyday.length)] || 'word',
      info (w) {
        const i = W.lookup(w)
        const s = i?.senses?.[0]
        if (!s) return null
        let def = String(s.def || '').replace(/\.$/, '')
        if (def.length > 90) def = `${def.slice(0, 88).replace(/\s+\S*$/, '')}…`
        return { pos: s.posName || 'word', def, syns: W.synonyms(w).filter((x) => /^[a-z]+$/.test(x)).slice(0, 4) }
      },
      // The crowd's rating of a word: the same everywhere, leaning to the middle.
      consensus (w) { const h = hash32(`crowd|${w}`); return Math.round(((h % 1000) / 1000 * 0.6 + ((h >>> 10) % 1000) / 1000 * 0.4) * 50) / 10 },
      at (t) { return self._at(t, market) }
    }
    return this._ctx
  }

  // What's going on, by the hour: the day's biggest movers among a sample of
  // words, recent final scores, and the Daily Clues number.
  _at (t, market) {
    const h = Math.floor(t / HOUR)
    let w = this._world.get(h)
    if (w) return w
    const at = h * HOUR
    const day = Math.floor(at / DAY)
    const r = rng(hash32(`movers|${day}`))
    const sample = new Set()
    while (sample.size < 48 && market.length) sample.add(market[Math.floor(r() * market.length)])
    const moves = []
    for (const word of sample) {
      const a = this._price(word, at - DAY); const b = this._price(word, at)
      if (a && b) moves.push({ word, pct: (b / a - 1) * 100 })
    }
    moves.sort((x, y) => y.pct - x.pct)
    const sports = []
    for (const lg of ['hoops', 'gridiron', 'pitch']) {
      try {
        for (const n of slate(lg, at, { next: 0, past: 2 }).recent) {
          const g = game(lg, n)
          const hs = g.final.home; const as = g.final.away
          if (hs === as) continue
          const win = hs > as ? g.home : g.away; const lose = hs > as ? g.away : g.home
          sports.push({ league: LEAGUES[lg].short, winner: team(lg, win).name, loser: team(lg, lose).name, ws: Math.max(hs, as), ls: Math.min(hs, as) })
        }
      } catch {}
    }
    w = { day, dailyNumber: dayNumber(at), movers: { up: moves.slice(0, 3).filter((m) => m.pct > 0), down: moves.slice(-3).reverse().filter((m) => m.pct < 0) }, sports }
    if (this._world.size > 200) this._world.clear()
    this._world.set(h, w)
    return w
  }

  // --- you -----------------------------------------------------------------------------------
  _minute () { return Math.max(250, baseCps(this.economy.s) * 60) }
  _myAuthor () {
    const me = this.me()
    return { handle: this.s.handle || 'you', name: me.name || 'You', color: me.color || '#e8c686', check: this._check(), you: true }
  }

  _check () {
    const b = this.s.blue
    if (b && b.until > this.now()) return b.tier === 'checkcheck' ? 'checkcheck' : b.tier === 'diamond' ? 'diamond' : 'blue'
    if (this.s.legacy) return 'legacy'
    return null
  }

  // Each post with its eventual counts (and its call's grade).
  _scored (posts, t = this.now()) {
    return posts.map((p) => {
      const eng = engagement(p, this.ctx.at(p.t), p.word ? this.ctx.consensus(p.word) : 2.5)
      const grade = p.kind === 'call' ? gradeCall(p, this._price || (() => null), t) : null
      return { p, eng, grade }
    })
  }

  // Followers, karma and connections, from your posts.
  standing (t = this.now(), posts = this.s.posts) {
    let followers = 0; let karma = 0; let connections = 0
    for (const { p, eng, grade } of this._scored(posts, t)) {
      followers += followerGain(p, eng, t, grade)
      const c = countsAt(p, eng, t)
      if (p.site === 'readit') karma += c.score || 0
      if (p.site === 'wirdin') connections += Math.round((eng.likes || 0) * 0.15 * (1 - Math.exp(-(t - p.t) / eng.tau)))
    }
    followers = Math.max(0, Math.round(followers))
    return { followers, karma: Math.round(karma), connections: 12 + connections, tier: tierFor(followers) }
  }

  setHandle (handle) {
    handle = String(handle || '').toLowerCase().trim()
    if (!validHandle(handle)) throw new Error('A handle is 3 to 20 letters, numbers or underscores, starting with a letter.')
    const word = handle.replace(/[0-9_]+$/, '')
    if (!this.rated().some((x) => x.word === word)) throw new Error('Your handle has to be a word you’ve rated (you can add numbers or _ after it).')
    this.s.handle = handle
    this.economy.dirty = true
    return this.view('writter')
  }

  suggestHandles () {
    const top = this.rated().filter((x) => /^[a-z]{3,16}$/.test(x.word)).sort((a, b) => b.r - a.r || a.word.length - b.word.length).slice(0, 8).map((x) => x.word)
    return top
  }

  // --- posting -------------------------------------------------------------------------------
  // opts: { site, sub, kind: 'take'|'call'|'brag'|'say'|'apology', word, stance, call: { dir, pct, days }, brag, extra, sponsor, disclosed }
  post (opts = {}) {
    if (!this.s.handle) throw new Error('Pick a handle first.')
    const t = this.now()
    const site = ['writter', 'readit', 'wirdin'].includes(opts.site) ? opts.site : 'writter'
    const kind = ['take', 'call', 'brag', 'say', 'apology'].includes(opts.kind) ? opts.kind : 'say'
    const extra = String(opts.extra || '').replace(/\s+/g, ' ').trim().slice(0, MAX_EXTRA)
    const recent = this.s.posts.filter((p) => t - p.t < 6 * HOUR).length
    if (this.s.posts.some((p) => t - p.t < 45e3)) throw new Error('Slow down. The algorithm is watching.')
    const rec = { v: 1, id: `${t.toString(36)}-${crypto.randomBytes(3).toString('hex')}`, site, kind, t, extra, spam: recent }
    if (site === 'readit') { rec.sub = SUB[opts.sub] ? opts.sub : 'Wirds' }
    if (kind === 'take' || kind === 'call') {
      const word = String(opts.word || '').toLowerCase()
      if (!this.words.has(word)) throw new Error('Pick a word.')
      rec.word = word
    }
    if (kind === 'take') { if (!STANCE[opts.stance]) throw new Error('Pick what you think.'); rec.stance = opts.stance }
    if (kind === 'call') {
      if (!this._price(rec.word, t)) throw new Error('That word isn’t on the Word Exchange.')
      rec.call = { dir: opts.call?.dir === 'down' ? 'down' : 'up', pct: Math.max(1, Math.min(500, Math.round(Number(opts.call?.pct) || 10))), days: Math.max(1, Math.min(14, Math.round(Number(opts.call?.days) || 3))) }
    }
    if (kind === 'brag') {
      const brag = this.brags().find((b) => b.id === opts.brag)
      if (!brag) throw new Error('Pick something to brag about.')
      rec.brag = brag.text
    }
    if (kind === 'say' && !extra) throw new Error('Say something.')
    if (kind === 'apology' && !this.s.posts.some((p) => this._scored([p])[0].eng.cancelled)) throw new Error('Nothing to apologize for. (Yet.)')
    // A sponsored post: paid now, disclosed or not.
    let pay = 0
    const sp = this.s.sponsors.pending
    if (opts.sponsor && sp && sp.id === opts.sponsor && t < sp.until) {
      const s = SPONSORS.find((x) => x.id === sp.id)
      rec.sponsor = s.id
      rec.disclosed = opts.disclosed !== false
      if (kind === 'say' || kind === 'take') rec.brag = `Big thanks to ${s.brand} for making this possible.`
      pay = Math.round(this._minute() * sp.pay)
      this.s.sponsors.done[s.id] = t
      this.s.sponsors.pending = null
    }
    const st = this.standing(t)
    rec.f0 = st.followers
    const b = this.s.blue
    if (site === 'writter' && b && b.until > t) rec.blue = b.tier
    if (this.s.legacy) rec.legacy = true
    const me = this._myAuthor()
    rec.handle = me.handle
    const shown = render(rec)
    rec.title = shown.title
    rec.text = shown.text
    this.s.posts.push(rec)
    if (this.s.posts.length > MAX_POSTS) this.s.posts.splice(0, this.s.posts.length - MAX_POSTS)
    if (pay > 0) this.economy._earn(pay, 'socials')
    // Friends see it.
    this.store.put(`s/${rec.id}`, rec)
    this.economy.dirty = true
    this.economy.save(true)
    const res = this._progress()
    return { post: this._show(rec, t), pay, ...res }
  }

  deletePost (id) {
    const i = this.s.posts.findIndex((p) => p.id === id)
    if (i < 0) return false
    this.s.posts.splice(i, 1)
    this.store.put(`s/${id}`, null)
    this.economy.dirty = true
    return true
  }

  // Your recent achievements, as brags.
  brags () {
    const out = []
    const e = this.economy.s
    const stats = this.statsForBrags?.() || {}
    const n = this.rated().length
    if (n) out.push({ id: 'rated', text: `I’ve rated ${n.toLocaleString()} words` })
    if (stats.level) out.push({ id: 'level', text: `I just hit level ${stats.level}` })
    if (stats.streak > 1) out.push({ id: 'streak', text: `${stats.streak}-day rating streak 🔥` })
    if (e.wirdlike?.progress?.wins) out.push({ id: 'wl', text: `I’ve beaten The Red Pen in Wirdlike ${e.wirdlike.progress.wins} time${e.wirdlike.progress.wins === 1 ? '' : 's'} 😤` })
    const cw = e.catchword?.progress
    if (cw?.words?.[0]) out.push({ id: 'cw', text: cw.words[0].won ? `I got “${cw.words[0].word}” into every dictionary on Earth` : `“${cw.words[0].word}” almost took over the world` })
    if (e.tycoon?.progress?.best) out.push({ id: 'ty', text: `My dictionary company got a ${e.tycoon.progress.best.toFixed(1)} from the critics` })
    if (e.coins > 0) out.push({ id: 'coins', text: `${Math.round(e.coins).toLocaleString()} coins in the bank and counting` })
    const owned = (e.owned || []).length
    if (owned) out.push({ id: 'looks', text: `${owned} looks in my wardrobe` })
    return out
  }

  // Votes: on friends' posts they sync; on everything else they're yours alone.
  vote (id, v) {
    v = v === 1 || v === -1 ? v : 0
    const friendPost = this._friendPosts().find((x) => x.rec.id === id)
    if (friendPost) this.store.put(`v/${id}`, v ? { v } : null)
    if (v) this.s.votes[id] = v; else delete this.s.votes[id]
    const keys = Object.keys(this.s.votes)
    if (keys.length > 2000) for (const k of keys.slice(0, keys.length - 2000)) delete this.s.votes[k]
    this.economy.dirty = true
    return { id, v }
  }

  // --- Writter Blue, payouts and sponsors ---------------------------------------------------------
  bluePrice (tier) { return Math.round(this._minute() * 8 * (BLUE_TIER[tier]?.k || 1)) }

  buyBlue (tier) {
    const b = BLUE_TIER[tier]
    if (!b) throw new Error('No such tier.')
    const cost = this.bluePrice(tier)
    if (this.economy.s.coins < cost) throw new Error('Not enough coins. (The check is very important.)')
    this.economy.s.coins -= cost
    this.economy.note?.('spent', 'socials', cost)
    const now = this.now()
    const until = Math.max(now, this.s.blue?.tier === tier ? this.s.blue.until : now) + 7 * DAY
    this.s.blue = { tier, until, since: this.s.blue?.since && this.s.blue.until > now ? this.s.blue.since : now }
    this.s.boughtBlue++
    this.economy.dirty = true
    this.economy.save(true)
    this._progress()
    return this.profile()
  }

  cancelBlue () {
    this.s.blue = null
    this.economy.dirty = true
    return this.profile()
  }

  // The creator payout: views since you were last paid, up to a daily cap
  // that grows with your tier.
  payout (t = this.now()) {
    const views = this._scored(this.s.posts, t).reduce((a, { p, eng }) => a + (countsAt(p, eng, t).views || 0), 0)
    const fresh = Math.max(0, views - this.s.paidViews)
    const st = this.standing(t)
    const tierN = TIERS.indexOf(st.tier)
    const day = Math.floor(t / DAY)
    const paidToday = this.s.payoutDay === day ? this.s.paidToday : 0
    const cap = this._minute() * (4 + tierN * 6) // a minute of income for every few thousand views, capped
    const coins = Math.max(0, Math.min(cap - paidToday, Math.round((fresh / 2500) * this._minute() * 0.5)))
    return { views, fresh, coins, cap, paidToday }
  }

  claimPayout () {
    const t = this.now()
    const p = this.payout(t)
    if (p.coins <= 0) throw new Error(p.fresh ? 'You’ve hit today’s cap. More tomorrow.' : 'No new views yet.')
    const day = Math.floor(t / DAY)
    if (this.s.payoutDay !== day) { this.s.payoutDay = day; this.s.paidToday = 0 }
    this.s.paidToday += p.coins
    this.s.paidViews = p.views
    this.economy._earn(p.coins, 'socials')
    this.economy.dirty = true
    this.economy.save(true)
    return { coins: p.coins, ...this.profile() }
  }

  sponsorOffer (t = this.now()) {
    const sp = this.s.sponsors
    if (sp.pending && sp.pending.until > t) return sp.pending
    const st = this.standing(t)
    const lastDone = Math.max(0, ...Object.values(sp.done))
    if (t - lastDone < DAY) return null
    const s = SPONSORS.filter((x) => st.followers >= x.at && !(sp.done[x.id] && t - sp.done[x.id] < 7 * DAY)).pop()
    if (!s) return null
    return { id: s.id, brand: s.brand, handle: s.handle, ask: s.ask, pay: 5 + SPONSORS.indexOf(s) * 10, offered: true }
  }

  acceptSponsor (id) {
    const o = this.sponsorOffer()
    if (!o || o.id !== id) throw new Error('That offer’s gone.')
    this.s.sponsors.pending = { ...o, until: this.now() + DAY }
    this.economy.dirty = true
    return this.profile()
  }

  // --- reading -------------------------------------------------------------------------------
  _friendPosts () {
    const out = []
    for (const f of this.store.listFriends()) {
      const data = this.store.friends.get(f.userId)
      if (!data) continue
      const me = data.records.me?.v || {}
      for (const [k, rec] of Object.entries(data.records)) {
        if (!k.startsWith('s/') || !rec.v) continue
        out.push({ rec: rec.v, friend: { userId: f.userId, name: me.name || f.name, color: me.color || f.color } })
      }
    }
    return out
  }

  // Friends' votes on a post (theirs and mine).
  _votesOn (id) {
    let up = 0; let down = 0; const who = []
    for (const f of this.store.listFriends()) {
      const v = this.store.friends.get(f.userId)?.records[`v/${id}`]?.v?.v
      if (v === 1) { up++; who.push(f.name) } else if (v === -1) down++
    }
    return { up, down, who }
  }

  // A post of mine or a friend's, ready to show.
  _show (rec, t, friend = null) {
    const eng = engagement(rec, this.ctx.at(rec.t), rec.word ? this.ctx.consensus(rec.word) : 2.5)
    const grade = rec.kind === 'call' ? gradeCall(rec, this._price || (() => null), t) : null
    const c = countsAt(rec, eng, t)
    const fv = this._votesOn(rec.id)
    const author = friend
      ? { handle: rec.handle || 'friend', name: friend.name, color: friend.color, check: rec.blue ? (rec.blue === 'checkcheck' ? 'checkcheck' : rec.blue === 'diamond' ? 'diamond' : 'blue') : rec.legacy ? 'legacy' : null, friend: true }
      : this._myAuthor()
    return {
      id: rec.id, site: rec.site, sub: rec.sub || null, t: rec.t, kind: rec.kind, title: rec.title, text: rec.text, word: rec.word || null, author, mine: !friend, friend: Boolean(friend),
      stats: { likes: c.likes + fv.up, replies: c.replies, reposts: c.reposts, views: c.views, score: (c.score ?? 0) + fv.up - fv.down, comments: c.comments ?? c.replies },
      ratio: eng.ratio, ratioed: eng.ratioed && t - rec.t > 30 * 60e3, cancelled: eng.cancelled && t - rec.t > 60 * 60e3, friendsLiked: fv.who,
      call: rec.call ? { ...rec.call, grade } : null, sponsor: rec.sponsor || null, disclosed: rec.disclosed ?? null,
      footnote: grade && !grade.right ? `Readers added context: $${rec.word.toUpperCase()} ${grade.move >= 0 ? 'rose' : 'fell'} ${Math.abs(grade.move)}% over ${rec.call.days} days. The call was wrong.` : rec.sponsor && !rec.disclosed && eng.cancelled ? `Readers added context: this is a paid post for ${SPONSORS.find((s) => s.id === rec.sponsor)?.brand}. It wasn’t marked #ad.` : null,
      vote: this.s.votes[rec.id] || 0
    }
  }

  _showWorld (p, t) {
    return { ...p, stats: statsAt(p, t), vote: this.s.votes[p.id] || 0, eng: undefined }
  }

  // A site's feed: the world's posts with yours and your friends' mixed in.
  view (site = 'writter', { sub = null, tab = 'foryou', limit = 50, before = null } = {}) {
    const t = this.now()
    const to = before ? Math.min(t, before) : t
    const world = tab === 'following' || tab === 'mine' ? [] : feed(site, this.ctx, { to, from: to - 2 * DAY, limit, sub }).map((p) => this._showWorld(p, t))
    const mine = this.s.posts.filter((p) => p.site === site && (!sub || p.sub === sub) && p.t <= to).map((p) => this._show(p, t))
    const friends = tab === 'mine' ? [] : this._friendPosts().filter(({ rec }) => rec.site === site && (!sub || rec.sub === sub) && rec.t <= to && rec.t > to - 7 * DAY).map(({ rec, friend }) => this._show(rec, t, friend))
    const seen = new Set()
    const posts = [...world, ...mine, ...friends].sort((a, b) => b.t - a.t).filter((p) => { if (p.mine || p.friend) return true; const k = `${p.sub || ''}|${p.title || p.text}`; if (seen.has(k)) return false; seen.add(k); return true }).slice(0, limit)
    return {
      site, sub, tab, posts, now: t, writterDay: isWritterDay(t),
      trends: site === 'writter' ? trends(t, this.ctx) : null,
      subs: site === 'readit' ? SUBS.map((s) => ({ id: s.id, blurb: s.blurb, group: s.group, members: s.members })) : null,
      follow: site === 'writter' ? this._whoToFollow(t) : null,
      me: this.profile(t)
    }
  }

  _whoToFollow (t) {
    const day = Math.floor(t / DAY)
    const r = rng(hash32(`follow|${day}`))
    const list = REGULARS.filter((x) => x.sites.includes('writter') && x.voice !== 'owner')
    const out = []
    while (out.length < 3) { const x = list[Math.floor(r() * list.length)]; if (!out.includes(x)) out.push(x) }
    return out.map((x) => ({ handle: x.handle, name: x.name, check: x.check, color: x.color, bio: x.bio, followers: x.followers }))
  }

  // One post and its replies.
  thread (id) {
    const t = this.now()
    const p = findPost(id, this.ctx)
    if (p) return { post: this._showWorld(p, t), replies: repliesFor(p, this.ctx).filter((x) => x.t <= t) }
    const mine = this.s.posts.find((x) => x.id === id)
    const fr = mine ? null : this._friendPosts().find(({ rec }) => rec.id === id)
    const rec = mine || fr?.rec
    if (!rec) return null
    const shown = this._show(rec, t, fr?.friend || null)
    const eng = engagement(rec, this.ctx.at(rec.t), rec.word ? this.ctx.consensus(rec.word) : 2.5)
    const crowd = (r) => throwaway(rec.site, this.ctx.pools, r)
    const replies = myReplies(rec, eng, t, crowd, shown.call?.grade).map((x) => ({ ...x, author: { handle: x.author.handle, name: x.author.name, color: x.author.color, check: x.author.check } }))
    return { post: shown, replies }
  }

  // Who someone is (for their profile card).
  person (handle) {
    const r = REGULARS.find((x) => x.handle === handle)
    if (r) return { ...r, regular: true }
    if (handle === this.s.handle) return { ...this._myAuthor(), ...this.standing() }
    return null
  }

  profile (t = this.now()) {
    const st = this.standing(t)
    if (st.followers >= LEGACY_AT && !this.s.legacy) { this.s.legacy = true; this.economy.dirty = true }
    const scored = this._scored(this.s.posts, t)
    const next = TIERS[TIERS.indexOf(st.tier) + 1] || null
    return {
      handle: this.s.handle, author: this._myAuthor(), ...st, next, legacy: this.s.legacy,
      blue: this.s.blue && this.s.blue.until > t ? { ...this.s.blue, ...BLUE_TIER[this.s.blue.tier] } : null,
      blueTiers: BLUE.map((b) => ({ ...b, price: this.bluePrice(b.id) })),
      payout: this.payout(t), sponsor: this.sponsorOffer(t), pendingSponsor: this.s.sponsors.pending && this.s.sponsors.pending.until > t ? this.s.sponsors.pending : null,
      posts: this.s.posts.length, viral: scored.filter(({ eng }) => eng.likes >= 10000).length, ratioed: scored.filter(({ eng }) => eng.ratioed).length,
      cancelled: scored.some(({ p, eng }) => eng.cancelled && t - p.t < 3 * DAY), mainCharacter: mainCharacter(Math.floor(t / DAY), this.ctx).handle,
      suggestions: this.s.handle ? null : this.suggestHandles()
    }
  }

  // Notifications, newest first: likes passing milestones, replies, graded
  // calls, cancellations, sponsors and new rungs on the ladder.
  notifications () {
    const t = this.now()
    const out = []
    for (const { p, eng, grade } of this._scored(this.s.posts, t)) {
      const short = (p.title || p.text).slice(0, 60)
      for (const m of [10, 100, 1000, 10000, 100000, 1e6]) {
        if (eng.likes < m) break
        const at = p.t - eng.tau * Math.log(1 - m / eng.likes)
        if (at <= t) out.push({ t: at, kind: 'like', text: `Your post passed ${m.toLocaleString()} ${p.site === 'readit' ? 'upvotes' : 'likes'}`, post: p.id, sub: short })
      }
      if (eng.ratioed && t - p.t > 30 * 60e3) out.push({ t: p.t + 30 * 60e3, kind: 'ratio', text: 'You got ratio’d.', post: p.id, sub: short })
      if (eng.cancelled && t - p.t > HOUR) out.push({ t: p.t + HOUR, kind: 'cancel', text: 'You’re the Main Character today. Not in a good way.', post: p.id, sub: short })
      if (grade) out.push({ t: grade.due, kind: grade.right ? 'called' : 'wrong', text: grade.right ? `Called it! $${p.word.toUpperCase()} moved ${grade.move}%.` : `Your call on $${p.word.toUpperCase()} was wrong (${grade.move}%).`, post: p.id, sub: short })
    }
    const o = this.sponsorOffer(t)
    if (o) out.push({ t: t - 1, kind: 'sponsor', text: `${o.brand} wants ${o.ask}.`, sponsor: o.id })
    out.sort((a, b) => b.t - a.t)
    return { list: out.slice(0, 40), unseen: out.filter((x) => x.t > this.s.seen).length }
  }

  seenNotifications () { this.s.seen = this.now(); this.economy.dirty = true }

  // Records, badges and looks.
  _progress () {
    const t = this.now()
    const st = this.standing(t)
    const scored = this._scored(this.s.posts, t)
    const b = this.s.best
    b.followers = Math.max(b.followers, st.followers)
    b.karma = Math.max(b.karma, st.karma)
    b.likes = Math.max(b.likes, ...scored.map(({ eng }) => eng.likes || 0), 0)
    const f = this.s.flags
    if (scored.some(({ eng }) => eng.ratioed)) f.ratioed = true
    if (scored.some(({ eng }) => eng.cancelled)) f.cancelled = true
    if (scored.some(({ grade }) => grade?.right)) f.called = true
    if (this.s.posts.some((p) => p.kind === 'apology') && f.cancelled) f.comeback = true
    if (this.s.boughtBlue) f.blue = true
    if (this.s.legacy) f.legacy = true
    const owned = this.economy.s.owned
    const got = []
    for (const c of SOCIALS_COSMETICS) {
      const key = `${c.kind}:${c.id}`
      if (owned.includes(key) || !SM_GOALS[c.sm].test(this._goalStats())) continue
      owned.push(key)
      got.push({ kind: c.kind, id: c.id, name: c.name })
    }
    const res = this.award([], {})
    if (got.length) { this.economy.emit('look'); this.economy.emit('changed') }
    return { looks: got, badges: res?.badges || [] }
  }

  _goalStats () {
    const f = this.s.flags
    return { posts: this.s.posts.length, followers: this.s.best.followers, karma: this.s.best.karma, likes: this.s.best.likes, ratioed: f.ratioed, cancelled: f.cancelled, called: f.called, comeback: f.comeback, blue: f.blue, legacy: f.legacy }
  }

  badgeStats () {
    const g = this._goalStats()
    return { smPosts: g.posts, smFollowers: g.followers, smLikes: g.likes, smRatioed: g.ratioed ? 1 : 0, smCancelled: g.cancelled ? 1 : 0, smCalled: g.called ? 1 : 0, smBlue: g.blue ? 1 : 0, smLegacy: g.legacy ? 1 : 0, smKarma: g.karma }
  }

  looks () {
    const g = this._goalStats()
    return SOCIALS_COSMETICS.map((c) => ({ kind: c.kind, id: c.id, name: c.name, goal: SM_GOALS[c.sm].text, have: this.economy.s.owned.includes(`${c.kind}:${c.id}`), done: Boolean(SM_GOALS[c.sm].test(g)) }))
  }
}

export { slotOf, SLOT_MS }
