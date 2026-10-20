// This computer's settings, including every limit that protects it from
// what friends and lobby players send. Each computer protects itself (there
// is no server to do it), so each limit is a setting you can change, with a
// range it can't leave.

import path from 'node:path'
import { readJson, writeJson } from './files.js'

// kind: 'count' | 'bool' | 'choice' | 'text'. group orders the settings screen; the
// 'sound' group has its own section in Settings.
export const SETTING_FIELDS = {
  // Playing
  ratingSound: { group: 'sound', kind: 'choice', default: 'arcade', options: ['arcade', 'coin', 'gem', 'harp', 'kalimba', 'chime', 'marimba', 'pop', 'bubble', 'typewriter', 'original', 'custom', 'off'], label: 'Sound when you rate a word' },
  celebrate: { group: 'sound', kind: 'bool', default: true, label: 'Fanfare and trombone at the ends', hint: 'From 4.5 up a fanfare plays after the sound; from 0.5 down, a sad trombone. Biggest at 5.0 and 0.0.' },
  animations: { group: 'sound', kind: 'choice', default: 'all', options: ['all', 'ends', 'off'], label: 'Animations when you rate', hint: 'Every rating gets a small reaction; the ends get confetti or a crumble.' },
  soundVolume: { group: 'sound', kind: 'count', default: 70, min: 0, max: 100, label: 'Volume' },
  soundPitch: { group: 'sound', kind: 'bool', default: true, label: 'Higher ratings sound higher', hint: 'The pitch climbs with the rating, so a 5.0 rings and a 0.0 thuds.' },
  voice: { group: 'sound', kind: 'text', default: '', max: 120, label: 'Voice for saying words', hint: 'Empty picks the best English voice on this computer.' },
  leximonEncounters: { group: 'play', kind: 'bool', default: true, label: 'Wild Leximon to catch', hint: 'Every few new words, one of the words you’ve rated shows up for you to catch. Off keeps them to the Leximon tab.' },
  speakOnReveal: { group: 'play', kind: 'bool', default: false, label: 'Say each new word out loud' },
  skipRated: { group: 'play', kind: 'bool', default: true, label: 'Don’t deal words I’ve already rated', hint: 'Turn off to see old words again in shuffles.' },
  autoAdvanceMs: { group: 'play', kind: 'count', default: 0, min: 0, max: 10000, label: 'Move to the next word by itself after (ms)', hint: '0 waits for a second Enter.' },
  // Friends
  maxFriends: { group: 'friends', kind: 'count', default: 50, min: 1, max: 1000, label: 'Most friends to keep' },
  maxFriendRecords: { group: 'friends', kind: 'count', default: 100000, min: 100, max: 2000000, label: 'Ratings, comments and lists to keep from one friend', hint: 'Anything past this from one friend is ignored, so nobody can fill your disk.' },
  maxCommentChars: { group: 'friends', kind: 'count', default: 280, min: 0, max: 2000, label: 'Longest comment to show or keep', hint: '0 hides friends’ comments.' },
  showFriendComments: { group: 'friends', kind: 'bool', default: true, label: 'Show friends’ comments' },
  friendCodeMinutes: { group: 'friends', kind: 'count', default: 15, min: 1, max: 120, label: 'Friend codes stop working after (minutes)' },
  // Lobbies
  lobbySize: { group: 'lobbies', kind: 'count', default: 8, min: 2, max: 8, label: 'Most players in a lobby I host' },
  lobbyMessagesPerMinute: { group: 'lobbies', kind: 'count', default: 120, min: 10, max: 2000, label: 'Messages one player may send per minute', hint: 'Players who send more are removed (stops reaction spam).' },
  // Network
  showCasinoStats: { group: 'friends', kind: 'bool', default: true, label: 'Show friends how I do at the market and casino', hint: 'Your returns, coinflips and slots on your profile.' },
  lan: { group: 'network', kind: 'bool', default: true, label: 'Find friends and lobbies on the same Wi-Fi directly', hint: 'Works with no internet. Others on the network see only scrambled tags, never who you are.' },
  internet: { group: 'network', kind: 'bool', default: true, label: 'Use the internet peer-to-peer network', hint: 'Off means same-network only.' }
}

export const SETTING_GROUPS = { play: 'Playing', sound: 'Sound', friends: 'Friends', lobbies: 'Lobbies', network: 'Network' }

export const DEFAULT_SETTINGS = Object.fromEntries(Object.entries(SETTING_FIELDS).map(([k, f]) => [k, f.default]))

export function normalizeSettings (s = {}) {
  const out = {}
  for (const [k, f] of Object.entries(SETTING_FIELDS)) {
    const v = s[k]
    if (f.kind === 'bool') out[k] = typeof v === 'boolean' ? v : f.default
    else if (f.kind === 'choice') out[k] = f.options.includes(v) ? v : f.default
    else if (f.kind === 'text') out[k] = typeof v === 'string' ? v.slice(0, f.max) : f.default
    else {
      const n = Number(v)
      out[k] = Number.isFinite(n) ? Math.round(Math.max(f.min, Math.min(f.max, n))) : f.default
    }
  }
  return out
}

export class Settings {
  constructor (dir, overrides = {}) {
    this.file = path.join(dir, 'settings.json')
    // Only the settings you changed are saved, so improved defaults reach
    // you in updates while your own choices stay.
    this.defaults = normalizeSettings({ ...DEFAULT_SETTINGS, ...overrides })
    this.chosen = readJson(this.file, {}) || {}
    if ('lexiconEncounters' in this.chosen) { this.chosen.leximonEncounters ??= this.chosen.lexiconEncounters; delete this.chosen.lexiconEncounters } // renamed
    this.values = normalizeSettings({ ...this.defaults, ...this.chosen })
  }

  get (k) { return this.values[k] }
  all () { return { ...this.values } }

  set (patch) {
    this.values = normalizeSettings({ ...this.values, ...patch })
    for (const k of Object.keys(patch)) {
      if (!(k in SETTING_FIELDS)) continue
      if (this.values[k] === this.defaults[k]) delete this.chosen[k]
      else this.chosen[k] = this.values[k]
    }
    writeJson(this.file, this.chosen, { pretty: true })
    return this.all()
  }

  reset () {
    this.chosen = {}
    this.values = { ...this.defaults }
    writeJson(this.file, this.chosen, { pretty: true })
    return this.all()
  }
}
