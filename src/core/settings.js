// This computer's settings, including every limit that protects it from
// what friends and lobby players send. Each computer protects itself (there
// is no server to do it), so each limit is a setting you can change, with a
// range it can't leave.

import fs from 'node:fs'
import path from 'node:path'

// kind: 'count' | 'bool' | 'choice'. group orders the settings screen.
export const SETTING_FIELDS = {
  // Playing
  sounds: { group: 'play', kind: 'bool', default: true, label: 'Sounds for very high and very low ratings' },
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
  lan: { group: 'network', kind: 'bool', default: true, label: 'Find friends and lobbies on the same Wi-Fi directly', hint: 'Works with no internet. Others on the network see only scrambled tags, never who you are.' },
  internet: { group: 'network', kind: 'bool', default: true, label: 'Use the internet peer-to-peer network', hint: 'Off means same-network only.' }
}

export const SETTING_GROUPS = { play: 'Playing', friends: 'Friends', lobbies: 'Lobbies', network: 'Network' }

export const DEFAULT_SETTINGS = Object.fromEntries(Object.entries(SETTING_FIELDS).map(([k, f]) => [k, f.default]))

export function normalizeSettings (s = {}) {
  const out = {}
  for (const [k, f] of Object.entries(SETTING_FIELDS)) {
    const v = s[k]
    if (f.kind === 'bool') out[k] = typeof v === 'boolean' ? v : f.default
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
    let saved = {}
    try { saved = JSON.parse(fs.readFileSync(this.file, 'utf8')) } catch {}
    this.values = normalizeSettings({ ...DEFAULT_SETTINGS, ...overrides, ...saved })
  }

  get (k) { return this.values[k] }
  all () { return { ...this.values } }

  set (patch) {
    this.values = normalizeSettings({ ...this.values, ...patch })
    fs.writeFileSync(this.file, JSON.stringify(this.values, null, 2))
    return this.all()
  }

  reset () { return this.set(DEFAULT_SETTINGS) }
}
