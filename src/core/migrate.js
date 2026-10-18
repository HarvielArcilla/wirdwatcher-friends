// Keeping your data through updates.
//
// Everything lives in the app's data folder, outside the app itself, so
// installing a new version (or pulling a new commit) never touches it:
//   Windows  %APPDATA%\wirdwatcher
//   macOS    ~/Library/Application Support/wirdwatcher
//   Linux    ~/.config/wirdwatcher
//
// version.json records which layout the folder is in. When an update needs
// to change the layout, it adds a step to MIGRATIONS; on first launch after
// the update, the files are copied to backups/before-<n>-<date>/ and then
// each step runs in order. If a step fails, the backup is still there and
// the folder is left as it was before that step.

import fs from 'node:fs'
import path from 'node:path'
import { readJson, writeJson } from './files.js'

export const SCHEMA = 3

const DATA_FILES = ['identity.json', 'me.json', 'progress.json', 'settings.json', 'appearance.json']
const DATA_DIRS = ['friends', 'sounds']

// MIGRATIONS[n] moves a folder from layout n to n + 1.
export const MIGRATIONS = {
  // Layout 1 (the first v2 builds) saved every setting, chosen or not, so a
  // better default could never reach anyone. Layout 2 keeps only the
  // settings you changed. Values equal to layout 1's defaults are dropped,
  // so they follow the defaults from now on.
  1 (dir) {
    const file = path.join(dir, 'settings.json')
    const saved = readJson(file, null)
    if (!saved) return
    const OLD_DEFAULTS = { sounds: true, ratingSound: 'chime', soundVolume: 70, soundPitch: true, speakOnReveal: false, skipRated: true, autoAdvanceMs: 0, maxFriends: 50, maxFriendRecords: 100000, maxCommentChars: 280, showFriendComments: true, friendCodeMinutes: 15, lobbySize: 8, lobbyMessagesPerMinute: 120, lan: true, internet: true }
    const kept = Object.fromEntries(Object.entries(saved).filter(([k, v]) => !(k in OLD_DEFAULTS) || OLD_DEFAULTS[k] !== v))
    writeJson(file, kept, { pretty: true })
  },
  // Layout 3 drops the separate 'original sounds at the extremes' switch: if
  // you had turned it on, you get the Original sound preset instead.
  2 (dir) {
    const file = path.join(dir, 'settings.json')
    const saved = readJson(file, null)
    if (!saved || !('sounds' in saved)) return
    const { sounds, ...rest } = saved
    if (sounds === true && !('ratingSound' in rest)) rest.ratingSound = 'original'
    writeJson(file, rest, { pretty: true })
  }
}

function copyTree (from, to) {
  fs.mkdirSync(to, { recursive: true })
  for (const name of DATA_FILES) if (fs.existsSync(path.join(from, name))) fs.copyFileSync(path.join(from, name), path.join(to, name))
  for (const name of DATA_DIRS) {
    const src = path.join(from, name)
    if (fs.existsSync(src)) fs.cpSync(src, path.join(to, name), { recursive: true })
  }
}

// Returns { from, to, backup } describing what happened.
export function migrate (dir, { schema = SCHEMA, migrations = MIGRATIONS, appVersion = null } = {}) {
  fs.mkdirSync(dir, { recursive: true })
  const versionFile = path.join(dir, 'version.json')
  const version = readJson(versionFile, null)
  const hasData = DATA_FILES.some((f) => fs.existsSync(path.join(dir, f)))
  // A brand-new folder starts at the current layout; an old one without
  // version.json is layout 1.
  let at = version?.schema ?? (hasData ? 1 : schema)
  if (at > schema) {
    // Made by a newer wirdwatcher: leave it alone rather than guess.
    throw new Error(`This data was made by a newer version of wirdwatcher (layout ${at}). Update wirdwatcher to open it; your data hasn’t been changed.`)
  }
  const from = at
  let backup = null
  if (at < schema) {
    backup = path.join(dir, 'backups', `before-${schema}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`)
    copyTree(dir, backup)
    while (at < schema) {
      migrations[at]?.(dir)
      at++
      writeJson(versionFile, { schema: at, app: appVersion, migratedAt: new Date().toISOString() }, { pretty: true })
    }
  }
  if (!version || version.app !== appVersion) writeJson(versionFile, { schema: at, app: appVersion, ...(from !== at ? { migratedAt: new Date().toISOString() } : {}) }, { pretty: true })
  return { from, to: at, backup }
}
