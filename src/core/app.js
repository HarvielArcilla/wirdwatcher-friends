// Everything wirdwatcher runs in the background, in one object: the word
// list, your identity and records, the game, friends, and the lobby you're
// in. The Electron main process wraps this in IPC; the tests drive it
// directly, two or three at a time on a local test network.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { EventEmitter } from 'node:events'
import { Identity } from './identity.js'
import { Settings, SETTING_FIELDS, SETTING_GROUPS } from './settings.js'
import { Store } from './store.js'
import { Words } from './words.js'
import { Game } from './game.js'
import { Friends } from './friends.js'
import { LobbyHost, LobbyClient, LOBBY_ROUNDS, LOBBY_TIMERS, REACTIONS } from './lobby.js'
import { XP } from '../shared/progress.js'

const here = path.dirname(fileURLToPath(import.meta.url))
export const WORDS_FILE = path.join(here, '..', '..', 'data', 'words.json.gz')

let sharedWords = null // the list is read-only, so copies in one process share it

export class WirdApp extends EventEmitter {
  // swarm / lan: options for the network (tests use a local DHT and port).
  constructor ({ dataDir, swarm = {}, lan = {}, settings = {}, wordsFile = WORDS_FILE, now } = {}) {
    super()
    this.dataDir = dataDir
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

  // Decorates the lobby's state for this computer (who's a friend, what I
  // rated) and turns finished rounds and games into my own ratings and XP.
  _lobbyState (s) {
    const friendIds = new Set(this.store.listFriends().map((f) => f.userId))
    const prev = this.lobbyState
    const view = { ...s, players: s.players.map((p) => ({ ...p, friend: Boolean(p.userId && friendIds.has(p.userId)), me: p.id === s.you })) }
    this.lobbyState = view
    // A reveal: my rating becomes mine, plus XP for the round.
    const res = s.current?.result
    if (s.phase === 'reveal' && res && !this.lobbyRated.has(`${s.round}:${s.current.word}`)) {
      this.lobbyRated.add(`${s.round}:${s.current.word}`)
      const mine = res.ratings[s.you]
      if (mine !== undefined) {
        const earned = this.game.rate(s.current.word, mine, { source: 'lobby' })
        const items = [{ amount: XP.lobbyRound, why: 'Lobby round' }]
        const counters = { lobbyRounds: 1 }
        if (res.hive && Object.keys(res.ratings).length >= 2) { items.push({ amount: XP.hiveMind, why: 'Hive mind' }); counters.hiveMinds = 1 }
        if (res.hotTake === s.you) counters.hotTakes = 1
        const bonus = this.game.award(items, counters)
        this.emit('progress', { ...bonus, xp: [...earned.xp, ...bonus.xp], badges: [...earned.badges, ...bonus.badges], levelUp: earned.levelUp || bonus.levelUp, source: 'lobby' })
      }
    }
    if (s.phase === 'results' && prev?.phase !== 'results' && s.history.length) {
      const counters = { lobbyGames: 1 }
      if (s.players.length >= 8) counters.fullTables = 1
      this.emit('progress', { ...this.game.award([{ amount: XP.lobbyGame, why: 'Lobby game' }], counters), source: 'lobby' })
    }
    this.emit('lobby', view)
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
    const lobby = new LobbyHost({ me: this._lobbyMe(), dealer, settings: this.settings, swarm: this.swarm, lan: this.lan, options })
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
    const allowed = ['rate', 'next', 'react', 'chat', 'setReady', ...hostOnly]
    if (!allowed.includes(action)) throw new Error('Unknown lobby action.')
    if (hostOnly.includes(action) && !l.isHost) throw new Error('Only the host can do that.')
    l[action](arg)
    return true
  }

  lobbyChoices () {
    const m = this.game.modes()
    return {
      rounds: LOBBY_ROUNDS,
      timers: LOBBY_TIMERS,
      reactions: REACTIONS,
      modes: [...m.modes.filter((x) => ['shuffle', 'everyday', 'short', 'long'].includes(x.id)), ...m.topics].map(({ id, name, emoji }) => ({ id, name, emoji }))
    }
  }
}
