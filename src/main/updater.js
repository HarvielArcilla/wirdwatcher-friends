// Keeping wirdwatcher up to date by itself, from the Releases page on GitHub.
//
// There are three kinds of copy, and each updates its own way:
//
//   windows  The installer (.exe). electron-updater downloads the new
//            installer in the background and runs it when you quit, or
//            straight away if you press Restart.
//   mac      The .dmg app. It's signed ad hoc (no paid Apple certificate),
//            and the standard Mac updater won't accept that, so this does it
//            by hand: download the new app as a .zip, check its SHA-512
//            against the release's latest-mac.yml, unpack it, and once this
//            app has quit, swap it in place (keeping the old one until the
//            new one is in). If the app can't be replaced (run from the
//            disk image, or a folder it can't write to), it offers the
//            download instead.
//   source   A copy installed by scripts/install.sh or install.ps1 (a git
//            folder), started by its launcher. The new release's tag is
//            fetched in the background, and the launcher moves to it the
//            next time it starts wirdwatcher, before anything is running.
//            Plain `npm start` never updates: that's a developer's copy.
//
// Releases only, never unreleased work on main. Nothing installs without a
// check, and nothing restarts without you saying so (or quitting).

import { app, net, shell } from 'electron'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import { newer, shaFor } from '../shared/versions.js'

const run = promisify(execFile)
export const OWNER = 'HarvielArcilla'
export const REPO = 'wirdwatcher-friends'
const API = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`
const FIRST_CHECK_MS = 15000
const CHECK_EVERY_MS = 6 * 3600e3

export class Updater extends EventEmitter {
  // appDir: the app's folder. enabled(): whether to update by itself.
  // busy(): true while it would be rude to restart (in a lobby game).
  constructor ({ appDir, enabled = () => true, busy = () => false }) {
    super()
    this.appDir = appDir
    this.enabled = enabled
    this.busy = busy
    this.version = app.getVersion()
    this.kind = this._kind()
    this.state = { status: 'idle', kind: this.kind, current: this.version }
    this.timers = []
  }

  _kind () {
    if (process.env.WIRDWATCHER_NO_UPDATE === '1') return 'off'
    if (app.isPackaged) {
      if (process.platform === 'win32') return 'windows'
      if (process.platform === 'darwin') return this._macBundle() ? 'mac' : 'mac-manual'
      return 'manual' // Linux packages update through whatever installed them
    }
    // A source copy: only when started by the installer's launcher.
    if (process.env.WIRDWATCHER_LAUNCHER === '1' && fs.existsSync(path.join(this.appDir, '.git'))) return 'source'
    return 'off'
  }

  _set (patch) {
    this.state = { ...this.state, ...patch, kind: this.kind, current: this.version }
    this.emit('state', this.state)
  }

  view () { return { ...this.state, enabled: this.enabled() } }

  start () {
    if (this.kind === 'off') return
    if (this.kind === 'windows') this._setupWindows()
    this.timers.push(setTimeout(() => this.check().catch(() => {}), FIRST_CHECK_MS))
    this.timers.push(setInterval(() => { if (this.enabled()) this.check().catch(() => {}) }, CHECK_EVERY_MS))
    for (const t of this.timers) t.unref?.()
  }

  stop () { for (const t of this.timers) { clearTimeout(t); clearInterval(t) } }

  async _latest () {
    const res = await net.fetch(API, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'wirdwatcher' } })
    if (!res.ok) throw new Error(res.status === 403 ? 'GitHub asked us to slow down. Try again later.' : `GitHub said ${res.status}.`)
    const r = await res.json()
    return { version: String(r.tag_name || '').replace(/^v/, ''), tag: r.tag_name, notes: String(r.body || '').slice(0, 4000), url: r.html_url, assets: r.assets || [], date: r.published_at }
  }

  // Look for a newer release, and (if updating by itself) get it ready.
  async check ({ manual = false } = {}) {
    if (this.kind === 'off') return this.view()
    if (['downloading', 'ready', 'checking'].includes(this.state.status)) return this.view()
    this._set({ status: 'checking', error: null })
    try {
      if (this.kind === 'windows') {
        const r = await this.au.checkForUpdates()
        const v = r?.updateInfo?.version
        if (!v || !newer(v, this.version)) this._set({ status: 'current', checked: Date.now() })
        // electron-updater takes it from here (see _setupWindows).
        return this.view()
      }
      const rel = await this._latest()
      if (!rel.version || !newer(rel.version, this.version)) { this._set({ status: 'current', checked: Date.now() }); return this.view() }
      this._set({ status: 'available', version: rel.version, notes: rel.notes, url: rel.url, checked: Date.now() })
      if (this.enabled() || manual) {
        if (this.kind === 'mac') await this._prepareMac(rel)
        if (this.kind === 'source') await this._prepareSource(rel)
      }
    } catch (err) {
      this._set({ status: 'error', error: err?.message || String(err) })
    }
    return this.view()
  }

  // Get the waiting update now, even with updating by itself off.
  async download () {
    if (this.state.status !== 'available') return this.check({ manual: true })
    if (this.kind === 'windows') { this.au.downloadUpdate().catch((err) => this._set({ status: 'error', error: err.message })); return this.view() }
    return this.check({ manual: true })
  }

  // Restart into the new version.
  restart () {
    if (this.state.status !== 'ready') throw new Error('No update is ready yet.')
    this.restarting = true
    if (this.kind === 'windows') { setImmediate(() => this.au.quitAndInstall(true, true)); return }
    if (this.kind === 'mac') { this._swapMac(true); app.quit(); return }
    if (this.kind === 'source') { this._relaunchSource(); app.quit() }
  }

  // Quitting with an update ready installs it (and doesn't reopen).
  onQuit () {
    if (this.restarting || this.state.status !== 'ready') return
    if (this.kind === 'mac') this._swapMac(false)
    // Windows: electron-updater's autoInstallOnAppQuit. Source: the launcher applies it next start.
  }

  openDownload () { shell.openExternal(this.state.url || `https://github.com/${OWNER}/${REPO}/releases/latest`) }

  // --- Windows ------------------------------------------------------------------------

  _setupWindows () {
    // electron-updater is CommonJS; loaded here so other platforms never touch it.
    const { autoUpdater } = this._require('electron-updater')
    this.au = autoUpdater
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.allowPrerelease = false
    autoUpdater.on('update-available', (info) => {
      this._set({ status: 'available', version: info.version, notes: typeof info.releaseNotes === 'string' ? info.releaseNotes.slice(0, 4000) : null, url: `https://github.com/${OWNER}/${REPO}/releases/tag/v${info.version}` })
      if (this.enabled()) autoUpdater.downloadUpdate().catch((err) => this._set({ status: 'error', error: err.message }))
    })
    autoUpdater.on('download-progress', (p) => this._set({ status: 'downloading', progress: (p.percent || 0) / 100 }))
    autoUpdater.on('update-downloaded', (info) => this._set({ status: 'ready', version: info.version, progress: 1 }))
    autoUpdater.on('error', (err) => this._set({ status: 'error', error: err?.message || String(err) }))
  }

  _require (name) {
    // createRequire, so an ES module can load a CommonJS package.
    return this._req ? this._req(name) : (this._req = createRequireFor(this.appDir))(name)
  }

  // --- macOS --------------------------------------------------------------------------

  // The .app this is running from, if it can be replaced.
  _macBundle () {
    const bundle = path.resolve(process.execPath, '..', '..', '..')
    if (!bundle.endsWith('.app')) return null
    if (bundle.includes('/AppTranslocation/') || bundle.startsWith('/Volumes/')) return null // run from the disk image, or quarantined
    try { fs.accessSync(path.dirname(bundle), fs.constants.W_OK); fs.accessSync(bundle, fs.constants.W_OK) } catch { return null }
    return bundle
  }

  async _prepareMac (rel) {
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
    const zip = rel.assets.find((a) => a.name === `wirdwatcher-${rel.version}-${arch}.zip`) || rel.assets.find((a) => a.name.endsWith(`-${arch}.zip`))
    const yml = rel.assets.find((a) => a.name === 'latest-mac.yml')
    if (!zip || !yml) { this._set({ status: 'available', manualOnly: true }); return }
    const dir = path.join(app.getPath('userData'), 'updates', rel.version)
    fs.rmSync(dir, { recursive: true, force: true })
    fs.mkdirSync(dir, { recursive: true })
    const want = shaFor(await (await net.fetch(yml.browser_download_url)).text(), zip.name)
    if (!want) throw new Error('The release doesn’t list a checksum for this Mac.')
    const file = path.join(dir, zip.name)
    await this._download(zip.browser_download_url, file, zip.size)
    const got = crypto.createHash('sha512').update(fs.readFileSync(file)).digest('base64')
    if (got !== want) { fs.rmSync(dir, { recursive: true, force: true }); throw new Error('The download didn’t match its checksum, so it was thrown away.') }
    const out = path.join(dir, 'app')
    await run('/usr/bin/ditto', ['-x', '-k', file, out])
    const found = fs.readdirSync(out).find((n) => n.endsWith('.app'))
    if (!found) throw new Error('The download had no app in it.')
    const next = path.join(out, found)
    await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', next]) // signed, and not tampered with since
    fs.rmSync(file, { force: true })
    this.macNext = next
    this._set({ status: 'ready', version: rel.version, progress: 1 })
  }

  // After this app quits: move the new app into place, keeping the old one
  // until the new one is in, then (if restarting) open it.
  _swapMac (reopen) {
    const bundle = this._macBundle()
    if (!bundle || !this.macNext) return
    const script = path.join(app.getPath('userData'), 'updates', 'swap.sh')
    fs.writeFileSync(script, `#!/bin/bash
pid="$1"; next="$2"; app="$3"; reopen="$4"
for i in $(seq 1 300); do kill -0 "$pid" 2>/dev/null || break; sleep 0.2; done
rm -rf "$app.old"
if mv "$app" "$app.old"; then
  if /usr/bin/ditto "$next" "$app"; then rm -rf "$app.old"; else rm -rf "$app"; mv "$app.old" "$app"; fi
fi
/usr/bin/xattr -dr com.apple.quarantine "$app" 2>/dev/null
rm -rf "$(dirname "$(dirname "$next")")"
[ "$reopen" = 1 ] && /usr/bin/open "$app"
`, { mode: 0o755 })
    spawn('/bin/bash', [script, String(process.pid), this.macNext, bundle, reopen ? '1' : '0'], { detached: true, stdio: 'ignore' }).unref()
    this.macNext = null
  }

  async _download (url, file, size) {
    const res = await net.fetch(url)
    if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}).`)
    const total = Number(res.headers.get('content-length')) || size || 0
    const outStream = fs.createWriteStream(file)
    const reader = res.body.getReader()
    let got = 0
    this._set({ status: 'downloading', progress: 0 })
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      got += value.length
      if (!outStream.write(value)) await new Promise((resolve) => outStream.once('drain', resolve))
      if (total) this._set({ status: 'downloading', progress: Math.min(0.99, got / total) })
    }
    await new Promise((resolve, reject) => outStream.end((err) => (err ? reject(err) : resolve())))
  }

  // --- a source copy ----------------------------------------------------------------------

  async _prepareSource (rel) {
    const git = (...args) => run('git', args, { cwd: this.appDir, windowsHide: true })
    const { stdout } = await git('status', '--porcelain', '--untracked-files=no')
    if (stdout.trim()) throw new Error('Files in the wirdwatcher folder have been changed, so it won’t update itself. Undo the changes, or update with the installer.')
    this._set({ status: 'downloading', progress: null })
    await git('fetch', '--quiet', '--depth', '1', 'origin', `refs/tags/${rel.tag}:refs/tags/${rel.tag}`)
    // The launcher moves to this tag next time it starts wirdwatcher.
    fs.writeFileSync(path.join(this.appDir, '.update-to'), rel.tag)
    this._set({ status: 'ready', version: rel.version, progress: 1 })
  }

  _relaunchSource () {
    if (process.platform === 'win32') {
      spawn('cmd.exe', ['/c', 'start', '""', '/min', path.join(this.appDir, 'scripts', 'start.cmd'), '--after-update'], { cwd: this.appDir, detached: true, stdio: 'ignore', windowsHide: true }).unref()
    } else {
      // Wait for this copy to go before starting the next.
      spawn('/bin/bash', ['-c', `while kill -0 ${process.pid} 2>/dev/null; do sleep 0.2; done; exec "${path.join(this.appDir, 'scripts', 'start.sh')}"`], { cwd: this.appDir, detached: true, stdio: 'ignore' }).unref()
    }
  }
}

function createRequireFor (dir) { return createRequire(path.join(dir, 'package.json')) }
