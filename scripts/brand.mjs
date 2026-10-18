// Gives the Electron binary that runs wirdwatcher from source (npm start)
// our name and icon, so the Dock, menu bar, Cmd-Tab, taskbar and Task
// Manager say "wirdwatcher" instead of "Electron". Runs after npm install.
// Installers built with electron-builder are named properly already; this
// only touches node_modules/electron, and never fails the install.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const NAME = 'wirdwatcher'
const here = path.dirname(fileURLToPath(import.meta.url))
const icon = path.join(here, '..', 'build', 'icon.png')
const ico = path.join(here, '..', 'build', 'icon.ico')

const electronDir = path.dirname(createRequire(import.meta.url).resolve('electron/package.json'))

// Electron downloads its binary the first time it's needed, not at npm
// install, so fetch it now (with its own installer) to have something to
// rename. Already there (renamed or not): nothing to do.
function ensureElectron () {
  const pointed = (() => { try { return fs.readFileSync(path.join(electronDir, 'path.txt'), 'utf8') } catch { return '' } })()
  if (pointed && fs.existsSync(path.join(electronDir, 'dist', pointed))) return
  const r = spawnSync(process.execPath, [path.join(electronDir, 'install.js')], { stdio: 'inherit' })
  if (r.status !== 0) throw new Error('Electron didn’t download')
}

try {
  if (process.platform === 'darwin' || process.platform === 'win32') ensureElectron()
  if (process.platform === 'darwin') brandMac()
  else if (process.platform === 'win32') await brandWindows(path.join(electronDir, 'dist', 'electron.exe'))
} catch (err) {
  console.log(`[wirdwatcher] Couldn't rename the Electron binary (${err.message}). wirdwatcher works the same; only its name in the Dock or taskbar may show as Electron.`)
}

// macOS shows an app by its bundle's folder name (Dock, Finder, Activity
// Monitor) and by CFBundleName (menu bar), so both change. Following
// Electron's rebranding guide: rename Electron.app and its executable, set
// CFBundleName, CFBundleDisplayName and CFBundleIdentifier in it and in its
// helpers, then point the electron package (path.txt) at the new binary.
// A fresh copy of Electron (a new version) arrives as Electron.app again and
// gets the same treatment.
function brandMac () {
  const dist = path.join(electronDir, 'dist')
  const fresh = path.join(dist, 'Electron.app')
  const appDir = path.join(dist, `${NAME}.app`)
  const marker = path.join(dist, '.wirdwatcher-brand') // outside the bundle, so it doesn't break the signature
  const stamp = `${NAME} ${fs.statSync(icon).size}`
  const exePath = `${NAME}.app/Contents/MacOS/${NAME}`
  const pointAtUs = () => fs.writeFileSync(path.join(electronDir, 'path.txt'), exePath)
  if (fs.existsSync(fresh)) {
    fs.rmSync(appDir, { recursive: true, force: true })
    fs.renameSync(fresh, appDir)
  } else if (fs.existsSync(marker) && fs.readFileSync(marker, 'utf8') === stamp) {
    pointAtUs()
    return
  }
  if (!fs.existsSync(appDir)) throw new Error('Electron.app is missing')

  const plutil = (plist, key, value) => execFileSync('plutil', ['-replace', key, '-string', value, plist])
  const plist = path.join(appDir, 'Contents', 'Info.plist')
  plutil(plist, 'CFBundleName', NAME)
  plutil(plist, 'CFBundleDisplayName', NAME)
  plutil(plist, 'CFBundleIdentifier', 'com.harvielarcilla.wirdwatcher.dev')
  plutil(plist, 'CFBundleExecutable', NAME)
  const frameworks = path.join(appDir, 'Contents', 'Frameworks')
  for (const helper of fs.readdirSync(frameworks).filter((f) => /^Electron Helper.*\.app$/.test(f))) {
    const kind = (/\((\w+)\)/.exec(helper)?.[1] || '').toLowerCase()
    const hp = path.join(frameworks, helper, 'Contents', 'Info.plist')
    const label = helper.replace(/^Electron/, NAME).replace(/\.app$/, '')
    plutil(hp, 'CFBundleName', label)
    plutil(hp, 'CFBundleDisplayName', label)
    plutil(hp, 'CFBundleIdentifier', `com.harvielarcilla.wirdwatcher.dev.helper${kind ? '.' + kind : ''}`)
  }
  const oldExe = path.join(appDir, 'Contents', 'MacOS', 'Electron')
  if (fs.existsSync(oldExe)) fs.renameSync(oldExe, path.join(appDir, 'Contents', 'MacOS', NAME))
  pointAtUs()

  // electron.icns from our icon, at every size macOS asks for.
  const set = fs.mkdtempSync(path.join(os.tmpdir(), 'wirdwatcher-icon-')) + '/icon.iconset'
  fs.mkdirSync(set)
  for (const n of [16, 32, 128, 256, 512]) {
    execFileSync('sips', ['-z', String(n), String(n), icon, '--out', path.join(set, `icon_${n}x${n}.png`)], { stdio: 'ignore' })
    execFileSync('sips', ['-z', String(n * 2), String(n * 2), icon, '--out', path.join(set, `icon_${n}x${n}@2x.png`)], { stdio: 'ignore' })
  }
  execFileSync('iconutil', ['-c', 'icns', set, '-o', path.join(appDir, 'Contents', 'Resources', 'electron.icns')])
  // Editing the bundle breaks its signature; sign it again for this computer.
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appDir], { stdio: 'ignore' })
  fs.writeFileSync(marker, stamp)
  // Tell Launch Services about the new name now, rather than whenever it
  // next looks (so the Dock doesn't keep showing a cached "Electron").
  const lsregister = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister'
  try { execFileSync(lsregister, ['-f', appDir], { stdio: 'ignore' }) } catch {}
  execFileSync('touch', [appDir])
}

async function brandWindows (exe) {
  const marker = `${exe}.wirdwatcher`
  const stamp = `${NAME} ${fs.statSync(ico).size}`
  if (fs.existsSync(marker) && fs.readFileSync(marker, 'utf8') === stamp) return
  const { rcedit } = await import('rcedit')
  await rcedit(exe, {
    icon: ico,
    'version-string': { FileDescription: NAME, ProductName: NAME, InternalName: NAME, OriginalFilename: `${NAME}.exe`, CompanyName: NAME }
  })
  fs.writeFileSync(marker, stamp)
}
