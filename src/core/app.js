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
import { LobbyHost, LobbyClient, LOBBY_ROUNDS, LOBBY_TIMERS, LOBBY_STYLES, REACTIONS } from './lobby.js'
import { XP } from '../shared/progress.js'
import { normalizeAppearance } from '../shared/appearance.js'
import { readJson, writeJson } from './files.js'
import { migrate } from './migrate.js'

const here = path.dirname(fileURLToPath(import.meta.url))
export const WORDS_FILE = path.join(here, '..', '..', 'data', 'words.json.gz')
export const APP_VERSION = JSON.parse(fs.readFileSync(path.join(here, '..', '..', 'package.json'), 'utf8')).version

const SOUND_TYPES = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.flac': 'audio/flac', '.webm': 'audio/webm' }
const MAX_SOUND_BYTES = 3 * 1024 * 1024
const OUR_FILES = new Set(['identity.json', 'me.json', 'progress.json', 'settings.json', 'appearance.json', 'version.json', 'friends', 'sounds', 'backups'])

let sharedWords = null // the list is read-only, so copies in one process share it

export class WirdApp extends EventEmitter {
  // swarm / lan: options for the network (tests use a local DHT and port).
  constructor ({ dataDir, swarm = {}, lan = {}, settings = {}, wordsFile = WORDS_FILE, now, appVersion = APP_VERSION } = {}) {
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
    this.lobby = null
    this.lobbyState = null
    this.lobbyRated = new Set()
  }

  async start () {
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
    await this.leaveLobby()
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
    return { name: this.identity.name, color: this.identity.color, level: lvl.level, title: lvl.title, userId: this.identity.userId, sign: (t) => this.identity.sign(t) }
  }

  _wireLobby (lobby) {
    this.lobby = lobby
    this.lobbyRated = new Set()
    lobby.on('state', (s) => this._lobbyState(s))
    lobby.on('event', (e) => this.emit('lobby-event', e))
    lobby.on('closed', ({ reason }) => {
      if (this.lobby !== lobby) return
      this.lobby = null
      this.lobbyState = null
      this.emit('lobby', null)
      if (reason) this.emit('lobby-closed', reason)
    })
  }

  // Decorates the lobby's state for this computer (who's a friend, who I am)
  // and turns reveals and finished games into my own ratings, XP and badges.
  _lobbyState (s) {
    const friendIds = new Set(this.store.listFriends().map((f) => f.userId))
    const prev = this.lobbyState
    const view = { ...s, players: s.players.map((p) => ({ ...p, friend: Boolean(p.userId && friendIds.has(p.userId)), me: p.id === s.you })) }
    this.lobbyState = view
    const res = s.current?.result
    const key = `${s.round}:${s.current?.style}`
    if (s.phase === 'reveal' && res && !this.lobbyRated.has(key)) {
      this.lobbyRated.add(key)
      const xp = []
      const badges = []
      let levelUp = false
      // Words I rated at the table become my ratings.
      for (const { by, word, r } of res.rated || []) {
        if (by !== s.you || !this.words.has(word)) continue
        const earned = this.game.rate(word, r, { source: 'lobby' })
        xp.push(...earned.xp)
        badges.push(...earned.badges)
        levelUp = levelUp || earned.levelUp
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
      const bonus = this.game.award(items, counters)
      this.emit('progress', { ...bonus, xp: [...xp, ...bonus.xp], badges: [...badges, ...bonus.badges], levelUp: levelUp || bonus.levelUp, source: 'lobby' })
    }
    if (s.phase === 'results' && prev?.phase !== 'results' && s.history.length) {
      const counters = { lobbyGames: 1 }
      if (s.players.length >= 8) counters.fullTables = 1
      counters[`games_${s.options.style}`] = 1
      this.emit('progress', { ...this.game.award([{ amount: XP.lobbyGame, why: 'Lobby game' }], counters), source: 'lobby' })
    }
    this.emit('lobby', view)
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
    const lobby = new LobbyHost({ me: this._lobbyMe(), dealer, lookup, settings: this.settings, swarm: this.swarm, lan: this.lan, options })
    this._wireLobby(lobby)
    await lobby.start()
    return this.lobbyState
  }

  async joinLobby (code) {
    await this.leaveLobby()
    const lobby = new LobbyClient({ code, me: this._lobbyMe(), settings: this.settings, swarm: this.swarm, lan: this.lan })
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
    this.lobby = null
    this.lobbyState = null
    await lobby.close()
    this.emit('lobby', null)
  }

  lobbyAction (action, arg) {
    const l = this.lobby
    if (!l) throw new Error('You’re not in a lobby.')
    const hostOnly = ['configure', 'begin', 'advance', 'kick', 'backToLobby']
    const allowed = ['rate', 'guess', 'pick', 'choose', 'next', 'react', 'chat', 'setReady', ...hostOnly]
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
      timers: LOBBY_TIMERS,
      reactions: REACTIONS,
      modes: [...m.modes.filter((x) => ['shuffle', 'everyday', 'short', 'long'].includes(x.id)), ...m.topics].map(({ id, name, emoji }) => ({ id, name, emoji }))
    }
  }
}
