// Everything wirdwatcher runs in the background, in one object: the word
// list, your identity and records, the game, friends, and the lobby you're
// in. The Electron main process wraps this in IPC; the tests drive it
// directly, two or three at a time on a local test network.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { EventEmitter } from 'node:events'
import { Identity } from './identity.js'
import { Settings, SETTING_FIELDS, SETTING_GROUPS } from './settings.js'
import { Store } from './store.js'
import { Words } from './words.js'
import { Game } from './game.js'
import { Friends } from './friends.js'
import { LobbyHost, LobbyClient, LOBBY_ROUNDS, LOBBY_TIMERS, LOBBY_STYLES, LOBBY_STAKES, REACTIONS } from './lobby.js'
import { XP } from '../shared/progress.js'
import { normalizeAppearance } from '../shared/appearance.js'
import { readJson, writeJson } from './files.js'
import { migrate } from './migrate.js'
import { Economy } from './economy.js'
import { Market } from './market.js'
import { Derivatives } from './derivatives.js'
import { Sportsbook } from './sportsbook.js'
import { Leximon } from './leximon.js'
import { Valley } from './valley.js'
import { Tables } from './tables.js'
import { DuelHost, DuelClient } from './duel.js'
import { slotWord } from '../shared/slots.js'
import { Daily } from './daily.js'

const here = path.dirname(fileURLToPath(import.meta.url))
export const WORDS_FILE = path.join(here, '..', '..', 'data', 'words.json.gz')
export const APP_VERSION = JSON.parse(fs.readFileSync(path.join(here, '..', '..', 'package.json'), 'utf8')).version

const SOUND_TYPES = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.flac': 'audio/flac', '.webm': 'audio/webm' }
const MAX_SOUND_BYTES = 3 * 1024 * 1024
const OUR_FILES = new Set(['identity.json', 'me.json', 'progress.json', 'settings.json', 'appearance.json', 'version.json', 'friends', 'sounds', 'backups', 'network.log', 'network.log.1', 'economy.json'])

let sharedWords = null // the list is read-only, so copies in one process share it

export class WirdApp extends EventEmitter {
  // swarm / lan: options for the network (tests use a local DHT and port).
  constructor ({ dataDir, swarm = {}, lan = {}, settings = {}, wordsFile = WORDS_FILE, now, appVersion = APP_VERSION, dev = false } = {}) {
    super()
    this.dataDir = dataDir
    this.migration = migrate(dataDir, { appVersion })
    this.swarm = swarm
    this.lan = lan
    this.identity = new Identity(dataDir)
    this.settings = new Settings(dataDir, settings)
    this.store = new Store(dataDir)
    this.words = sharedWords?.file === wordsFile ? sharedWords.words : new Words(wordsFile)
    sharedWords = { file: wordsFile, words: this.words }
    this.game = new Game({ words: this.words, store: this.store, settings: this.settings, now })
    this.game.identityName = () => this.identity.name
    this.game.identityColor = () => this.identity.color
    this.friends = new Friends({ identity: this.identity, store: this.store, settings: this.settings, swarm, lan })
    this.economy = new Economy({ dir: dataDir, now: now ? () => now().getTime() : () => Date.now(), friendsOnline: () => this.friends.online().length, hasBadge: (id) => Boolean(this.store.progress.badges[id]), level: () => this.game.profile().level.level, dev })
    this.market = new Market({ words: this.words, store: this.store, economy: this.economy, now: now ? () => now().getTime() : () => Date.now() })
    this.derivs = new Derivatives({ market: this.market, economy: this.economy, now: now ? () => now().getTime() : () => Date.now() })
    this.market.derivs = this.derivs
    this.sports = new Sportsbook({ economy: this.economy, now: now ? () => now().getTime() : () => Date.now() })
    this.economy.isWord = (w) => slotWord(w) && this.words.has(w)
    this.tables = new Tables({ economy: this.economy, byLetters: this.words.wordjack, wordFor: () => this.words.wheelWord() })
    this.valley = new Valley({ economy: this.economy, now: now ? () => now().getTime() : () => Date.now() })
    this.leximon = new Leximon({ economy: this.economy, store: this.store, now: now ? () => now().getTime() : () => Date.now(), encounters: () => this.settings.get('leximonEncounters') })
    this.daily = new Daily({ economy: this.economy, words: this.words, now: now ? () => now().getTime() : () => Date.now() })
    this.economy.on('played', (kind) => this.daily.note(kind))
    this.economy.beforePrestige = () => { this._sellBets(); this.derivs.sync(); this.derivs.closeAll(); for (const w of Object.keys(this.economy.s.market.holdings)) this.market.sell(w, 'all') }
    // Levels from before coins existed don't pay out; from here on, each does.
    if (this.economy.s.levelPaid == null) this.economy.s.levelPaid = this.game.profile().level.level
    // A free card pack for every fifth level, including ones reached before packs existed.
    this.economy.grantLevelPacks(this.game.profile().level.level)
    // Friends see what you wear and which edition you're on.
    this.game.extraProfile = () => this._publicProfile()
    this.game.extraStats = () => this.economy.badgeStats()
    // Spending, flipping and publishing can earn badges too.
    this.economy.on('changed', () => {
      if (this._awarding) return
      this._awarding = true
      try {
        const res = this._withLevelReward(this.game.award())
        if (res.badges?.length || res.levelUp) this.emit('progress', { ...res, source: 'economy' })
      } finally { this._awarding = false }
    })
    this.economy.on('look', () => { this.game._refreshProfile(); if (this.lobby) this.lobby.setProfile(this._lobbyMe()) })
    this.economy.on('tick', (c) => this.emit('economy', c))
    this.economy.on('changed', () => this.emit('economy', this.economy.compact()))
    this.economy.on('changed', () => this._publishSoon())
    this.lobby = null
    this.lobbyState = null
    this.lobbyRated = new Set()
  }

  // Rating a word: the game's result, plus what it paid.
  rate (word, r, opts) {
    const res = this._withLevelReward(this.game.rate(word, r, opts))
    res.coins = this.economy.onWord(word, { fresh: res.fresh, r: res.r })
    // Only new words teach your Leximon (and bring wild words), whatever you gave them.
    if (res.coins) {
      res.leximon = this.leximon.onNewWord(word, { lobby: opts?.source === 'lobby' })
      res.wordSeed = this.valley.onNewWord(word)
      this.daily.note('words', { topic: this.words.marketFacts(word)?.sector, streak: res.coins.streak?.n })
    }
    return res
  }

  // What friends see beyond ratings: your look, Top 4, your Leximon, and
  // (unless you hide it) how you do at the market and in the casino.
  _publicProfile (always = false) {
    const out = { look: this.economy.look(), top4: this.top4(), leximon: this.leximon.public(), daily: this.daily.public() }
    if (always || this.settings.get('showCasinoStats')) {
      const m = this.market.stats()
      const f = this.economy.s.flips
      const sl = this.economy.s.slots || {}
      out.market = { value: Math.round(m.value), gain: Math.round(m.gain), returnPct: m.returnPct, trades: m.trades, best: m.best ? { word: m.best.word, pct: m.best.pct } : null }
      out.casino = { flips: f.count, flipWins: f.wins, flipNet: Math.round(f.net), biggestFlip: Math.round(f.biggestWin), flipStreak: f.bestStreak, spins: sl.spins || 0, slotNet: Math.round(sl.net || 0), biggestSpin: Math.round(sl.biggest || 0), jackpots: sl.jackpots || 0, bestSpin: sl.bestWord || null }
    }
    return out
  }

  // Everything you have, less everything you owe: coins (negative in debt)
  // plus what your shares, funds and positions would sell for now.
  netWorth () {
    const m = this.market.stats()
    const held = m.value + this.sports.value()
    return { coins: this.economy.s.coins, holdings: held, total: this.economy.s.coins + held, debt: Math.max(0, -this.economy.s.coins), canFile: this.economy.s.coins + m.value < 0 && !this.economy.s.bankrupt }
  }

  // Open prediction-market bets, sold back to the house.
  _sellBets () {
    this.sports.sync()
    for (const [id, b] of Object.entries(this.economy.s.sports.bets)) for (const side of ['home', 'away', 'draw']) if (b[side] > 0) { try { this.sports.sell(id, side, 'all') } catch {} }
  }

  // Every way your coins are used, in one place: what you have and where it
  // sits (cash, shares, funds, positions, stakes, debt), and what's come in
  // and gone out (kept since 2.3.1).
  portfolioSummary () {
    this.derivs.sync()
    const e = this.economy.s
    const port = this.market.portfolio()
    const funds = this.derivs.etfs().filter((f) => f.shares > 0)
    const open = this.derivs.d.open.map((pos) => this.derivs.view(pos))
    const sum = (list, k = 'value') => list.reduce((a, x) => a + (x[k] || 0), 0)
    const kinds = { margin: open.filter((p) => p.kind === 'margin'), future: open.filter((p) => p.kind === 'future'), option: open.filter((p) => p.kind === 'option') }
    const staked = this.economy.stakedNow()
    const parts = [
      { id: 'cash', name: 'Coins', value: Math.max(0, e.coins) },
      { id: 'shares', name: 'Shares', value: sum(port.rows), gain: sum(port.rows, 'gain'), count: port.rows.length },
      { id: 'funds', name: 'Funds', value: sum(funds), gain: sum(funds, 'gain'), count: funds.length },
      { id: 'margin', name: 'Leverage', value: sum(kinds.margin), gain: sum(kinds.margin, 'gain'), count: kinds.margin.length },
      { id: 'future', name: 'Futures', value: sum(kinds.future), gain: sum(kinds.future, 'gain'), count: kinds.future.length },
      { id: 'option', name: 'Options', value: sum(kinds.option), gain: sum(kinds.option, 'gain'), count: kinds.option.length },
      { id: 'bets', name: 'Prediction bets', value: this.sports.value(), count: Object.keys(e.sports.bets).length },
      { id: 'stakes', name: 'Lobby stakes', value: staked },
      { id: 'debt', name: 'Debt', value: Math.min(0, e.coins) }
    ]
    const total = parts.reduce((a, p) => a + p.value, 0)
    const st = this.market.stats()
    return {
      at: this.economy.now(),
      total,
      parts,
      shares: port.rows.map((r) => ({ word: r.word, shares: r.shares, value: r.value, cost: r.cost, gain: r.gain, pct: r.pct, day: r.quote?.day ?? 0 })),
      funds: funds.map((f) => ({ id: f.id, name: f.name, emoji: f.emoji, value: f.value, cost: f.cost, gain: f.gain, day: f.day })),
      positions: open,
      results: {
        market: st.gain,
        slots: e.slots.net || 0,
        flips: e.flips.net || 0,
        tables: this.tables.net(),
        stakes: e.stakes.net || 0,
        sports: e.sports.net || 0,
        bankruptcy: e.credit.discharged || 0,
        debtInterest: e.credit.debtInterest || 0
      },
      ledger: e.ledger,
      wirdhouse: { cps: this.economy.compact().cps, edition: e.edition, earnedEver: e.allCoins },
      debt: Math.max(0, -e.coins),
      bankrupt: this.economy.bankruptView()
    }
  }

  // Bankruptcy, the way courts do it: everything on the Exchange is sold to
  // pay what it can, and only then is the rest cancelled. The wirdhouse
  // stays, so there's income to rebuild on.
  declareBankruptcy () {
    const nw = this.netWorth()
    if (this.economy.s.bankrupt) throw new Error('You’re already bankrupt.')
    if (nw.total >= 0) throw new Error(nw.debt > 0 ? 'Selling what you hold would cover your debt: no need for bankruptcy.' : 'You’re not in debt.')
    this._sellBets()
    this.derivs.sync()
    this.derivs.closeAll()
    for (const w of Object.keys(this.economy.s.market.holdings)) this.market.sell(w, 'all')
    if (this.economy.s.coins >= 0) return { covered: true, coins: this.economy.s.coins }
    return this.economy.fileBankruptcy()
  }

  // Changes to coins, words and trades reach friends, but not on every tick.
  _publishSoon () {
    if (this._publishTimer) return
    this._publishTimer = setTimeout(() => { this._publishTimer = null; this.game._refreshProfile() }, 20000)
    this._publishTimer.unref?.()
  }

  // The top of your own profile: Top 4, recent ratings, and the rest.
  profileExtras () {
    const all = this.store.ratings().sort((a, b) => b.t - a.t)
    const y = new Date(this.economy.now()).getFullYear()
    const def = (w) => this.words.lookup(w)?.senses?.[0]?.def || null
    return {
      ...this._publicProfile(true),
      top4: this.top4().map((w) => ({ word: w, r: this.store.rating(w), def: def(w) })),
      recent: all.slice(0, 10),
      thisYear: all.filter((x) => new Date(x.t).getFullYear() === y).length,
      friends: this.store.listFriends().length
    }
  }

  // Your four favorite words, in order, for your profile.
  top4 () { return (this.store.progress.top4 || []).filter((w) => this.words.has(w)).slice(0, 4) }
  setTop4 (words) {
    const list = [...new Set((Array.isArray(words) ? words : []).map((w) => String(w || '').toLowerCase().trim()).filter((w) => this.words.has(w)))].slice(0, 4)
    this.store.progress.top4 = list
    this.store.saveProgress()
    this.game._refreshProfile()
    return list
  }

  // How friends did at today's Daily Clues.
  friendsToday () {
    const day = new Date(this.economy.now()).toISOString().slice(0, 10)
    return this.store.listFriends().map((f) => {
      const d = this.store.friend(f.userId)?.records?.me?.v?.daily
      if (!d || d.day !== day) return { userId: f.userId, name: f.name, color: f.color, done: false }
      const n = (x) => Math.max(0, Math.min(999, Math.floor(Number(x) || 0)))
      return { userId: f.userId, name: f.name, color: f.color, done: Boolean(d.solved || d.gaveUp), solved: Boolean(d.solved), clue: n(d.clue), wrong: n(d.wrong), points: n(d.points) }
    })
  }

  // A duel against a friend's Leximon team, from their profile.
  duelFriend (userId) {
    const data = this.store.friend(userId)
    if (!data) throw new Error('That isn’t a friend.')
    const res = this.leximon.duel(userId, data.info.name, data.records.me?.v?.leximon?.team, this.identity.userId)
    this.game._refreshProfile()
    return res
  }

  // --- live Leximon duels ------------------------------------------------------------

  _duelTeam () { return this.leximon.public().team }

  async hostDuel ({ scaled = false } = {}) {
    await this.leaveDuel()
    if (!this._duelTeam().length) throw new Error('Put a Leximon on your team first.')
    const d = new DuelHost({ me: { name: this.identity.name, color: this.identity.color }, team: this._duelTeam(), scaled, settings: this.settings, swarm: this.swarm, lan: this.lan })
    this._wireDuel(d)
    await d.start()
    return this.duelState
  }

  async joinDuel (code) {
    await this.leaveDuel()
    const d = new DuelClient({ code, me: { name: this.identity.name, color: this.identity.color }, team: this._duelTeam(), settings: this.settings, swarm: this.swarm, lan: this.lan })
    this._wireDuel(d)
    try {
      await d.start()
    } catch (err) {
      if (this.duelLink === d) { this.duelLink = null; this.duelState = null; this.emit('duel', null) }
      throw err
    }
    return this.duelState
  }

  _wireDuel (d) {
    this.duelLink = d
    this.duelState = null
    let recorded = false
    d.on('state', (s) => {
      if (this.duelLink !== d) return
      this.duelState = s
      if (s.phase === 'over' && !recorded && s.state) {
        recorded = true
        const me = s.you
        const foe = me === 'a' ? 'b' : 'a'
        const draw = s.state.winner === null
        const won = s.state.winner === me
        const left = (x) => s.state.sides[x].team.filter((c) => c.hp > 0).length
        const fair = d.isHost || d.fair()
        const out = fair
          ? this.leximon.recordLiveDuel({ won, draw, foe: s.players[foe]?.name, mine: s.players[me]?.team, theirs: s.players[foe]?.team, scaled: s.scaled, ko: `${left(me)}–${left(foe)}` })
          : null
        this.game._refreshProfile()
        this.emit('progress', { source: 'economy', xp: [], badges: [], notes: [fair ? { emoji: draw ? '🤝' : won ? '🏆' : '🎗️', title: draw ? 'A draw!' : won ? `You beat ${s.players[foe]?.name}` : `${s.players[foe]?.name} won`, text: out.learned ? `Your team learned from it${out.ups.length ? `: ${out.ups.map((u) => `${u.word.toUpperCase()} reached level ${u.level}`).join(', ')}` : ''}.` : 'Your team has learned all it can from duels today.' } : { emoji: '⚠️', title: 'That duel didn’t add up', text: 'The other side’s seed didn’t match, so it wasn’t counted.' }] })
      }
      this.emit('duel', s)
    })
    d.on('closed', ({ reason }) => {
      if (this.duelLink !== d) return
      this.duelLink = null
      this.duelState = null
      this.emit('duel', null)
      if (reason) this.emit('duel-closed', reason)
    })
  }

  duelAction (action) {
    if (!this.duelLink) throw new Error('You’re not in a duel.')
    this.duelLink.act(action)
    return true
  }

  async leaveDuel () {
    const d = this.duelLink
    if (!d) return
    this.duelLink = null
    this.duelState = null
    await d.leave()
    this.emit('duel', null)
  }

  // A result that leveled you up carries that level's reward.
  _withLevelReward (res) {
    if (res?.levelUp) res.reward = this.economy.levelReward(res.level.level)
    return res
  }

  async start () {
    this.economy.start()
    await this.friends.start()
    this.friends.on('presence', () => this.emit('friends'))
    this.friends.on('friends', () => this.emit('friends'))
    this.friends.on('records', () => this.emit('friend-records'))
    this.friends.on('code', (e) => this.emit('friend-code', e))
    this.game.on('progress', (p) => this.emit('progress', p))
    this.game._refreshProfile()
    return this
  }

  async stop () {
    this.economy.stop()
    await this.leaveLobby()
    await this.leaveDuel()
    await this.friends.stop()
    this.store.flush()
  }

  me () {
    return { ...this.identity.toPublic(), level: this.game.profile().level, streak: this.store.progress.streak }
  }

  setProfile (patch) {
    const me = this.identity.update(patch)
    this.game._refreshProfile()
    this.lobby?.setProfile({ name: me.name, color: me.color })
    return this.me()
  }

  // How the app looks on this computer (appearance.json). Never shared.
  appearance () {
    if (!this._appearance) {
      this._appearance = normalizeAppearance(readJson(path.join(this.dataDir, 'appearance.json'), {}))
    }
    return this._appearance
  }

  // patch may be partial: { dark: { accent } } keeps everything else.
  setAppearance (patch = {}) {
    const cur = this.appearance()
    const merged = { ...cur, ...patch }
    for (const k of ['dark', 'light', 'fonts']) if (patch[k]) merged[k] = { ...cur[k], ...patch[k] }
    this._appearance = normalizeAppearance(merged)
    writeJson(path.join(this.dataDir, 'appearance.json'), this._appearance, { pretty: true })
    return this._appearance
  }

  // A sound file of your own for ratings, copied into sounds/ here. It never
  // leaves this computer.
  setCustomSound (file) {
    const ext = path.extname(file).toLowerCase()
    if (!SOUND_TYPES[ext]) throw new Error('Choose an MP3, WAV, OGG, M4A, AAC, FLAC or WebM file.')
    const size = fs.statSync(file).size
    if (size > MAX_SOUND_BYTES) throw new Error('Choose a shorter sound: up to 3 MB.')
    const dir = path.join(this.dataDir, 'sounds')
    fs.rmSync(dir, { recursive: true, force: true })
    fs.mkdirSync(dir, { recursive: true })
    fs.copyFileSync(file, path.join(dir, `custom${ext}`))
    fs.writeFileSync(path.join(dir, 'custom.json'), JSON.stringify({ name: path.basename(file), file: `custom${ext}` }))
    this.settings.set({ ratingSound: 'custom' })
    return this.customSound()
  }

  customSound () {
    try {
      const dir = path.join(this.dataDir, 'sounds')
      const meta = JSON.parse(fs.readFileSync(path.join(dir, 'custom.json'), 'utf8'))
      const ext = path.extname(meta.file)
      const bytes = fs.readFileSync(path.join(dir, path.basename(meta.file)))
      return { name: String(meta.name).slice(0, 120), dataUrl: `data:${SOUND_TYPES[ext]};base64,${bytes.toString('base64')}` }
    } catch {
      return null
    }
  }

  clearCustomSound () {
    fs.rmSync(path.join(this.dataDir, 'sounds'), { recursive: true, force: true })
    if (this.settings.get('ratingSound') === 'custom') this.settings.set({ ratingSound: 'arcade' })
    return null
  }

  // Resets one tab's settings: 'play', 'friends' (friends and lobbies) or 'network'.
  resetSettings (tab) {
    const groups = { play: ['play'], friends: ['friends', 'lobbies'], network: ['network'] }[tab] || []
    const patch = {}
    for (const [k, f] of Object.entries(SETTING_FIELDS)) if (groups.includes(f.group)) patch[k] = this.settings.defaults[k]
    return this.setSettings(patch)
  }

  settingsView () {
    return { values: this.settings.all(), fields: SETTING_FIELDS, groups: SETTING_GROUPS }
  }

  setSettings (patch) {
    const before = this.settings.all()
    const after = this.settings.set(patch)
    // Network switches take effect by restarting the friends network.
    if (before.lan !== after.lan || before.internet !== after.internet) {
      this.friends.stop().then(() => this.friends.start()).catch(() => {})
    }
    return this.settingsView()
  }

  // --- lobbies ------------------------------------------------------------------

  _lobbyMe () {
    const lvl = this.game.profile().level
    return { name: this.identity.name, color: this.identity.color, level: lvl.level, title: lvl.title, look: this.economy.look(), userId: this.identity.userId, sign: (t) => this.identity.sign(t) }
  }

  _wireLobby (lobby) {
    this.lobby = lobby
    this.lobbyRated = new Set()
    this.stakeConsent = null // { host, amount }: what I agreed to put in
    lobby.on('state', (s) => { this._stakeSync(s); this._tableSync(s); this._lobbyState(s) })
    lobby.on('event', (e) => this.emit('lobby-event', e))
    this.friendAsks = new Map() // seat -> my nonce, for requests I sent
    this.friendOffers = new Map() // seat -> their hello, for requests I got
    lobby.on('friend', (m) => this._lobbyFriend(lobby, m))
    lobby.on('closed', ({ reason }) => {
      this._stakeEnd(lobby)
      this._tableEnd(lobby)
      if (this.lobby !== lobby) return
      this.lobby = null
      this.lobbyState = null
      this.emit('lobby', null)
      if (reason) this.emit('lobby-closed', reason)
    })
  }

  // --- stakes --------------------------------------------------------------------
  //
  // My escrow follows what the lobby shows about each pot (the rules are in
  // src/shared/stakes.js): promised once the result is in, paid from the
  // announced payouts after checking they add up, refunded if the game was
  // void or I wasn't counted in. Called for every state, so a missed or
  // repeated update changes nothing.
  _stakeSync (s) {
    if (!s?.host) return
    this._stakeHost = s.host
    for (const [key] of this.economy.stakesWith(s.host)) {
      const rec = this.economy.s.escrow[key]
      const pot = (s.pots || []).find((p) => p.key === key)
      if (!rec || !pot || pot.status === 'collecting') continue
      const member = pot.members.includes(s.you)
      if (pot.status === 'void' || (!member && rec.state === 'held')) {
        const back = this.economy.refundStake(key)
        if (back) this._stakeNote('↩️', 'Your stake came back', `${back.toLocaleString()} coins. ${pot.status === 'void' ? 'The game ended early.' : 'You weren’t counted in that pot.'}`)
      } else if (pot.status === 'settling' && member) {
        // Promise first (on disk), then tell the host; after this update is
        // handled, so the host paying out doesn't interrupt it.
        if (this.economy.commitStake(key)) setImmediate(() => this.lobby?.stakeAck(key))
      } else if (pot.status === 'paid' && rec.state === 'committed') {
        if (pot.payouts && s.you in pot.payouts) {
          const won = this.economy.settleStake(key, { stake: rec.amount, payouts: pot.payouts, me: s.you })
          if (won === null) { this.economy.dropStake(key); this._stakeNote('⚠️', 'A payout didn’t add up', 'The pot was refused, so nothing was taken or paid.') } else if (won > rec.amount) this._stakeNote('🏆', `You won the pot: ${won.toLocaleString()} coins`, `${(won - rec.amount).toLocaleString()} more than you put in.`)
          else if (won === rec.amount) this._stakeNote('🤝', 'You got your stake back', 'Tied with the table.')
          else if (won > 0) this._stakeNote('🪙', `You won a share: ${won.toLocaleString()} coins`, 'A tie split the pot.')
          else this._stakeNote('💸', `You lost your stake: ${rec.amount.toLocaleString()} coins`, 'Better luck next game.')
        } else this.economy.dropStake(key)
      }
    }
  }

  // The lobby is gone: anything never promised comes back; a promised stake
  // whose payout never arrived is lost (never paid twice).
  _stakeEnd (lobby) {
    const host = lobby.isHost ? lobby.hostId : (lobby.state?.host || this._stakeHost)
    if (!host) return
    let back = 0
    for (const [key, rec] of this.economy.stakesWith(host)) back += rec.state === 'held' ? this.economy.refundStake(key) : (this.economy.dropStake(key), 0)
    if (back) this._stakeNote('↩️', 'Your stake came back', `${back.toLocaleString()} coins. The lobby closed before the game finished.`)
  }

  // --- lobby tables --------------------------------------------------------------
  //
  // My bets at a lobby table follow the round they're on: settled from its
  // result (Tables checks the seeds and works out what I'm owed), and back
  // to me if the round never finished.
  _tableSync (s) {
    if (!s?.host) return
    const c = s.current
    for (const [key] of this.tables.heldWith(s.host)) {
      if (c?.key === key && ['betting', 'drawing', 'playing'].includes(s.phase)) continue
      if (c?.key === key && s.phase === 'reveal' && c.result) {
        const res = c.result
        if (!res.seeds?.[s.you]) { const back = this.tables.lobbyRefund(key); if (back) this._stakeNote('↩️', 'Your bet came back', `${back.toLocaleString()} coins. It wasn’t counted this round.`); continue }
        const out = this.tables.lobbySettle(key, res, s.you)
        if (!out) continue
        if (!out.ok) this._stakeNote('⚠️', 'That round didn’t add up', `Your ${out.total.toLocaleString()} coins came back instead.`)
        else if (out.paid > 0) this._stakeNote(out.word ? '📝' : '🎉', `You won ${out.paid.toLocaleString()} coins`, out.word ? `${out.word.toUpperCase()}: a word, so the win paid double.` : out.net > 0 ? `${out.net.toLocaleString()} more than you bet.` : out.net === 0 ? 'Your bet back, no more.' : 'Some of your bet back.')
        continue
      }
      const back = this.tables.lobbyRefund(key)
      if (back) this._stakeNote('↩️', 'Your bet came back', `${back.toLocaleString()} coins. That round didn’t finish.`)
    }
  }

  _tableEnd (lobby) {
    const host = lobby.isHost ? lobby.hostId : (lobby.state?.host || this._stakeHost)
    if (!host) return
    let back = 0
    for (const [key] of this.tables.heldWith(host)) back += this.tables.lobbyRefund(key)
    if (back) this._stakeNote('↩️', 'Your bet came back', `${back.toLocaleString()} coins. The lobby closed before the round finished.`)
  }

  tableBet (arg = {}) {
    const l = this.lobby
    const s = this.lobbyState
    const c = s?.current
    if (!l || !c?.key || s.phase !== 'betting') throw new Error('Betting’s closed.')
    if (arg.skip) { l.tableBet({ skip: true }); return true }
    const host = l.isHost ? l.hostId : s.host
    const r = this.tables.lobbyBet(c.key, host, c.style, arg)
    l.tableBet({ bets: r.bets, stake: r.stake, commit: r.commit })
    return true
  }

  tableMove (move) {
    const l = this.lobby
    const c = this.lobbyState?.current
    if (!l || !c?.key || this.lobbyState.phase !== 'playing') throw new Error('Not now.')
    if (move === 'double') this.tables.lobbyDouble(c.key)
    l.tableMove(move)
    return true
  }

  _stakeNote (emoji, title, text) { this.emit('progress', { source: 'economy', notes: [{ emoji, title, text }], xp: [], badges: [] }) }

  // Buying in (or out) for the host's stake.
  stakeIn ({ in: yes, amount }) {
    const l = this.lobby
    if (!l) throw new Error('You’re not in a lobby.')
    const host = l.isHost ? l.hostId : this.lobbyState?.host
    amount = Number(amount)
    if (yes) {
      if (!(amount > 0) || amount !== this.lobbyState?.stake) throw new Error('That isn’t the stake for this table.')
      if (amount > Math.floor(this.economy.s.coins)) throw new Error(`You need ${amount.toLocaleString()} coins to buy in.`)
      this.stakeConsent = { host, amount }
    } else this.stakeConsent = null
    l.stakeIn({ in: Boolean(yes), amount })
    return true
  }

  // Decorates the lobby's state for this computer (who's a friend, who I am)
  // and turns reveals and finished games into my own ratings, XP and badges.
  _lobbyState (s) {
    const friendIds = new Set(this.store.listFriends().map((f) => f.userId))
    const prev = this.lobbyState
    const view = { ...s, players: s.players.map((p) => ({ ...p, friend: Boolean(p.userId && friendIds.has(p.userId)), me: p.id === s.you })) }
    this.lobbyState = view
    const res = s.current?.result
    const key = `${s.game || 0}:${s.round}:${s.current?.style}`
    if (s.phase === 'reveal' && res && !this.lobbyRated.has(key)) {
      this.lobbyRated.add(key)
      const xp = []
      const badges = []
      let coins = 0
      let reward = null
      let levelUp = false
      let leximon = null
      // Words I rated at the table become my ratings.  They teach the
      // Leximon and bring wild words, like any other new word.
      for (const { by, word, r } of res.rated || []) {
        if (by !== s.you || !this.words.has(word)) continue
        const earned = this.rate(word, r, { source: 'lobby' })
        if (earned.coins) coins += earned.coins.coins
        if (earned.reward) reward = earned.reward
        xp.push(...earned.xp)
        badges.push(...earned.badges)
        levelUp = levelUp || earned.levelUp
        if (earned.leximon) leximon = { ...earned.leximon, encounter: earned.leximon.encounter || leximon?.encounter || null }
      }
      const items = [{ amount: XP.lobbyRound, why: 'Lobby round' }]
      const counters = { lobbyRounds: 1 }
      const n = Object.keys(res.ratings || {}).length
      if (res.hive && n >= 2) { items.push({ amount: XP.hiveMind, why: 'In sync' }); counters.hiveMinds = 1 }
      if (res.hotTake === s.you) counters.hotTakes = 1
      const g = res.guesses?.[s.you]
      if (g?.hitHigh && g?.hitLow) { items.push({ amount: XP.hiveMind, why: 'Read the table' }); counters.mindReads = 1 }
      if (res.style === 'hotseat' && res.diffs?.[s.you] !== undefined && res.diffs[s.you] !== null && res.diffs[s.you] <= 0.1) { items.push({ amount: XP.hiveMind, why: 'Read their mind' }); counters.exactReads = 1 }
      const mine = res.entries?.find((e) => e.picker === s.you)
      if (mine?.diff !== null && mine?.diff !== undefined && mine.diff <= 0.1) { items.push({ amount: XP.hiveMind, why: 'Bullseye' }); counters.bullseyes = 1 }
      if (res.style === 'jury') {
        if (res.right?.includes(s.you)) { items.push({ amount: XP.hiveMind, why: 'Named them' }); counters.convictions = 1 }
        if (res.defendant === s.you && !res.convicted) { items.push({ amount: XP.hiveMind, why: 'Walked free' }); counters.acquittals = 1 }
      }
      const perfect = res.perfect?.[s.you] || []
      if (perfect.length) { items.push({ amount: XP.hiveMind * perfect.length, why: perfect.map((x) => x.label).join(', ') }); counters.perfects = perfect.length }
      const solved = res.style === 'clues' ? res.solved?.[s.you] : null
      if (solved) { items.push({ amount: XP.hiveMind, why: 'Solved it' }); if (solved.clue <= 2) counters.quickClues = 1 }
      const bonus = this._withLevelReward(this.game.award(items, counters))
      coins += this.economy.onLobbyRound({ hosting: Boolean(this.lobby?.isHost) })
      this.leximon.onLobbyRound()
      this.daily.note('lobby')
      this.emit('progress', { ...bonus, xp: [...xp, ...bonus.xp], badges: [...badges, ...bonus.badges], levelUp: levelUp || bonus.levelUp, reward: bonus.reward || reward, coins, leximon, source: 'lobby' })
    }
    if (s.phase === 'results' && prev?.phase !== 'results' && s.history.length) {
      const counters = { lobbyGames: 1 }
      if (s.players.length >= 8) counters.fullTables = 1
      counters[`games_${s.options.style}`] = 1
      this.emit('progress', { ...this._withLevelReward(this.game.award([{ amount: XP.lobbyGame, why: 'Lobby game' }], counters)), source: 'lobby' })
    }
    this.emit('lobby', view)
  }

  // --- friends at the table ------------------------------------------------

  _mySeat () { return this.lobbyState?.you || this.lobby?.you || this.lobby?.hostId }

  askFriend (seat) {
    const l = this.lobby
    if (!l) throw new Error('You’re not in a lobby.')
    const p = this.lobbyState?.players.find((x) => x.id === seat)
    if (!p || p.me) throw new Error('Nobody’s in that seat.')
    if (p.friend) throw new Error(`You and ${p.name} are already friends.`)
    if (!p.userId) throw new Error(`${p.name} is on an older wirdwatcher that can’t add friends at the table yet.`)
    const { hello, nonce } = this.friends.lobbyHello(this._mySeat(), seat)
    this.friendAsks.set(seat, nonce)
    l.friendAsk(seat, hello)
    return true
  }

  answerFriend (seat, yes) {
    const l = this.lobby
    const hello = this.friendOffers.get(seat)
    if (!l || !hello) throw new Error('That request has gone.')
    this.friendOffers.delete(seat)
    if (!yes) { l.friendAnswer(seat, null); return null }
    const mine = this.friends.lobbyHello(this._mySeat(), seat)
    const friend = this.friends.befriendFromLobby(hello, mine.nonce)
    l.friendAnswer(seat, mine.hello)
    return friend
  }

  _lobbyFriend (lobby, { kind, from, hello }) {
    if (lobby !== this.lobby) return
    const me = this._mySeat()
    try {
      if (kind === 'ask') {
        if (!hello) return
        const userId = this.friends.checkLobbyHello(hello, from, me)
        if (this.store.friend(userId)) return // already friends
        if (this.friendOffers.has(from)) return
        this.friendOffers.set(from, hello)
        this.emit('friend-ask', { from, userId, name: String(hello.name || '').slice(0, 24), color: hello.color })
      } else if (kind === 'answer') {
        const nonce = this.friendAsks.get(from)
        if (!nonce) return
        this.friendAsks.delete(from)
        if (!hello) return this.emit('friend-answer', { from, yes: false })
        this.friends.checkLobbyHello(hello, from, me)
        const friend = this.friends.befriendFromLobby(hello, nonce)
        this.emit('friend-answer', { from, yes: true, name: friend.name })
      }
    } catch (err) {
      this.emit('friend-answer', { from, yes: false, error: err.message })
    }
  }

  // Small counters the window reports (for badges).
  count (name) {
    if (!['skips', 'meaningSearches', 'synonymsOpened'].includes(name)) throw new Error('Unknown counter.')
    this.store.count(name)
    return this.game.award()
  }

  // Deletes everything wirdwatcher keeps about you on this computer: your
  // identity, ratings, friends, settings, sounds and backups. Friends who are
  // online are told, so they drop you too. Can't be undone.
  async deleteProfile () {
    for (const f of this.store.listFriends()) await this.friends.remove(f.userId).catch(() => {})
    await this.stop()
    for (const name of fs.readdirSync(this.dataDir)) {
      if (OUR_FILES.has(name) || /\.(damaged-|tmp$)/.test(name) || /^(me|progress|settings|appearance|identity|version)\.json\./.test(name)) {
        fs.rmSync(path.join(this.dataDir, name), { recursive: true, force: true })
      }
    }
  }

  // What this computer tells a lobby host that asks (Grand Jury and Clues).
  // Only ratings of words in the word list, and only as many as needed.
  _lobbyProvide (kind, args = {}) {
    const mine = this.store.ratings().filter((x) => this.words.has(x.word))
    const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a }
    if (kind === 'case') {
      // A few of my strongest opinions: the extremes first.
      const skip = new Set(Array.isArray(args.skip) ? args.skip.slice(0, 500) : [])
      const open = mine.filter((x) => !skip.has(x.word))
      const strong = shuffle(open.filter((x) => x.r <= 0.8 || x.r >= 4.2))
      const rest = open.filter((x) => x.r > 0.8 && x.r < 4.2).sort((a, b) => Math.abs(b.r - 2.5) - Math.abs(a.r - 2.5))
      return [...strong, ...rest].slice(0, 5).map(({ word, r }) => ({ word, r }))
    }
    if (kind === 'lookup') {
      const out = {}
      for (const w of (Array.isArray(args.words) ? args.words : []).slice(0, 8)) { const v = this.store.rating(String(w)); if (typeof v === 'number') out[w] = v }
      return out
    }
    if (kind === 'seed') return this.tables.lobbySeed(String(args.key || ''), this.lobby?.isHost ? this.lobby.hostId : this.lobbyState?.host)
    if (kind === 'sample') return shuffle(mine).slice(0, 120).map(({ word, r }) => ({ word, r }))
    if (kind === 'hold') {
      // Only what I agreed to, only for this host's game.
      const c = this.stakeConsent
      const host = this.lobby?.isHost ? this.lobby.hostId : this.lobbyState?.host
      const amount = Number(args.amount)
      if (!c || !host || c.host !== host || args.host !== host || c.amount !== amount || !String(args.key || '').startsWith(`${host}:`)) return false
      return this.economy.holdStake(String(args.key), amount, host)
    }
    return null
  }

  async hostLobby (options = {}) {
    await this.leaveLobby()
    // Lobbies deal from the whole pool (whatever the host has rated before),
    // never repeating a word within one game. The word's details travel with
    // it, so players with an older word list still see them.
    const dealer = (mode, used) => {
      const pool = this.words.pool(mode)
      const word = (pool === null || pool.length ? this.words.random(mode, used) : null) || this.words.random('everyday', used)
      return word ? { word, info: this.words.lookup(word) } : null
    }
    this.store.count('hosted')
    this.game.award()
    const lookup = (word) => (this.words.has(word) ? this.words.lookup(word) : null)
    const lobby = new LobbyHost({ me: this._lobbyMe(), dealer, lookup, byLetters: this.words.wordjack, provide: (k, a) => this._lobbyProvide(k, a), settings: this.settings, swarm: this.swarm, lan: this.lan, options })
    this._wireLobby(lobby)
    await lobby.start()
    return this.lobbyState
  }

  async joinLobby (code) {
    await this.leaveLobby()
    const lobby = new LobbyClient({ code, me: this._lobbyMe(), provide: (k, a) => this._lobbyProvide(k, a), settings: this.settings, swarm: this.swarm, lan: this.lan })
    this._wireLobby(lobby)
    try {
      await lobby.start()
    } catch (err) {
      if (this.lobby === lobby) { this.lobby = null; this.lobbyState = null }
      throw err
    }
    return this.lobbyState
  }

  async leaveLobby () {
    const lobby = this.lobby
    if (!lobby) return
    const s = this.lobbyState
    const host = lobby.isHost ? lobby.hostId : s?.host
    // A payout on its way: wait a moment for it before going.
    const waiting = () => !lobby.isHost && host && this.economy.stakesWith(host).some(([, r]) => r.state === 'committed')
    for (let i = 0; i < 40 && waiting() && this.lobby === lobby; i++) await new Promise((resolve) => setTimeout(resolve, 250))
    if (this.lobby !== lobby) return
    // Leaving a staked game in progress gives my stake to the pot.
    let forfeit = null
    if (!lobby.isHost && s?.pot?.status === 'open' && s.pot.members.includes(s.you) && this.economy.s.escrow[s.pot.key]?.state === 'held') {
      forfeit = s.pot.key
      this.economy.forfeitStake(forfeit)
    }
    this.lobby = null
    this.lobbyState = null
    await (lobby.isHost ? lobby.close() : lobby.leave({ forfeit }))
    this.emit('lobby', null)
  }

  lobbyAction (action, arg) {
    const l = this.lobby
    if (!l) throw new Error('You’re not in a lobby.')
    const hostOnly = ['configure', 'begin', 'advance', 'kick', 'backToLobby']
    if (action === 'stakeIn') return this.stakeIn(arg || {})
    if (action === 'tableBet') return this.tableBet(arg || {})
    if (action === 'tableMove') return this.tableMove(String(arg))
    const allowed = ['rate', 'guess', 'pick', 'choose', 'vote', 'clueGuess', 'next', 'react', 'chat', 'setReady', ...hostOnly]
    if (!allowed.includes(action)) throw new Error('Unknown lobby action.')
    if (hostOnly.includes(action) && !l.isHost) throw new Error('Only the host can do that.')
    l[action](arg === undefined ? null : arg)
    return true
  }

  lobbyChoices () {
    const m = this.game.modes()
    return {
      rounds: LOBBY_ROUNDS,
      styles: LOBBY_STYLES,
      stakes: LOBBY_STAKES,
      timers: LOBBY_TIMERS,
      reactions: REACTIONS,
      modes: [...m.modes.filter((x) => ['shuffle', 'everyday', 'short', 'long'].includes(x.id)), ...m.topics].map(({ id, name, emoji }) => ({ id, name, emoji }))
    }
  }
}
