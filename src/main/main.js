// Electron main process: runs the game, your records and the peer-to-peer
// network (src/core), and hosts the window. The window never touches the
// network or the disk; it talks to this process through preload.cjs.

import { app, BrowserWindow, ipcMain, clipboard, shell, Menu, nativeTheme, dialog } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { WirdApp } from '../core/app.js'
import { setNetlogFolder } from '../core/netlog.js'
import { themeById, themeColors } from '../shared/appearance.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..', '..')

// WIRDWATCHER_PROFILE=bob runs a second, independent copy on one computer
// (its own identity and ratings), handy for trying friends and lobbies.
// --smoke-test: start with a throwaway profile, check the window comes up
// and can talk to the background process, then quit (0 = fine). CI runs this
// on Windows, macOS and Linux.
const smoke = process.argv.includes('--smoke-test')
if (smoke) process.env.WIRDWATCHER_PROFILE = `smoke-${process.pid}`
const profile = process.env.WIRDWATCHER_PROFILE
if (profile) app.setPath('userData', `${app.getPath('userData')}-${profile.replace(/[^a-z0-9-]/gi, '')}`)
if (!profile && !app.requestSingleInstanceLock()) app.quit()

app.setName('wirdwatcher')
if (process.platform === 'win32') app.setAppUserModelId('com.harvielarcilla.wirdwatcher')

let win = null
let ww = null

const send = (channel, ...args) => { if (win && !win.isDestroyed()) win.webContents.send(channel, ...args) }

// The window's color before the page paints, so it doesn't flash.
function windowColor () {
  const a = ww.appearance()
  const mode = a.mode === 'system' ? (nativeTheme.shouldUseDarkColors ? 'dark' : 'light') : a.mode
  return themeColors(themeById(a[mode].theme)).bg
}

function createWindow () {
  win = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 860,
    minHeight: 600,
    title: 'wirdwatcher',
    backgroundColor: windowColor(),
    icon: path.join(root, 'build', 'icon.png'),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 18, y: 18 },
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false
    }
  })
  win.loadFile(path.join(root, 'renderer', 'index.html'))
  // Links open in the browser, never in the app.
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' } })
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  win.on('closed', () => { win = null })
}

// Every call from the window: name → function(...args). Errors go back as
// { error } so the window can show them.
function handlers () {
  const g = ww.game
  return {
    boot: () => ({ appearance: ww.appearance(), me: ww.me(), settings: ww.settingsView(), modes: g.modes(), profile: g.profile(), friends: ww.friends.list(), lobby: ww.lobbyState, lobbyChoices: ww.lobbyChoices(), wordCount: ww.words.size, source: ww.words.source, platform: process.platform }),
    me: () => ww.me(),
    setProfile: (patch) => ww.setProfile(patch),
    deal: (mode, after) => g.deal(mode, { after }),
    wordInfo: (word) => g.wordInfo(word),
    rate: (word, r) => g.rate(word, r),
    unrate: (word) => g.unrate(word),
    comment: (word, text) => g.comment(word, text),
    favorite: (word, on) => g.favorite(word, on),
    search: (text) => ww.words.search(text, 40),
    searchWords: (text) => ww.words.searchDetailed(text, 40).map((h) => ({ ...h, r: ww.store.rating(h.word) })),
    modes: () => g.modes(),
    profile: () => g.profile(),
    allRatings: () => g.allRatings(),
    history: () => ww.store.progress.history.slice(0, 50),
    createPlaylist: (p) => g.createPlaylist(p),
    updatePlaylist: (id, patch) => g.updatePlaylist(id, patch),
    deletePlaylist: (id) => g.deletePlaylist(id),
    savePlaylist: (owner, id) => g.savePlaylist(owner, id),
    friends: () => ww.friends.list(),
    friendRatings: (id) => ww.store.friendRatings(id),
    friendProfile: (id) => g.friendProfile(id),
    makeFriendCode: () => ww.friends.makeCode(),
    cancelFriendCode: () => ww.friends.cancelCode(),
    redeemFriendCode: (code) => ww.friends.redeem(code),
    removeFriend: (id) => ww.friends.remove(id),
    hostLobby: (options) => ww.hostLobby(options),
    joinLobby: (code) => ww.joinLobby(code),
    leaveLobby: () => ww.leaveLobby(),
    lobbyAction: (action, arg) => ww.lobbyAction(action, arg),
    lobbyState: () => ww.lobbyState,
    appearance: () => ww.appearance(),
    setAppearance: (patch) => { const a = ww.setAppearance(patch); win?.setBackgroundColor(windowColor()); return a },
    customSound: () => ww.customSound(),
    chooseSound: async () => {
      const res = await dialog.showOpenDialog(win, { title: 'Choose a rating sound', properties: ['openFile'], filters: [{ name: 'Sounds', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'webm'] }] })
      if (res.canceled || !res.filePaths[0]) return { canceled: true }
      return { sound: ww.setCustomSound(res.filePaths[0]), settings: ww.settingsView() }
    },
    clearCustomSound: () => { ww.clearCustomSound(); return ww.settingsView() },
    count: (name) => ww.count(name),
    dataFolder: () => app.getPath('userData'),
    openDataFolder: () => shell.openPath(app.getPath('userData')),
    openNetworkLog: () => { const f = path.join(app.getPath('userData'), 'network.log'); if (fs.existsSync(f)) shell.showItemInFolder(f); else shell.openPath(app.getPath('userData')); return true },
    deleteProfile: async () => {
      await ww.deleteProfile()
      ww = null
      setTimeout(() => { app.relaunch(); app.exit(0) }, 100)
      return true
    },
    resetSettings: (tab) => ww.resetSettings(tab),
    settings: () => ww.settingsView(),
    setSettings: (patch) => ww.setSettings(patch),
    copy: (text) => { clipboard.writeText(String(text)); return true },
    openLink: (url) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return true }
  }
}

// Smoke test progress, as GitHub annotations so CI shows where it got to.
let smokeStage = 'starting'
const stage = (name) => { smokeStage = name; if (smoke) console.log(`::notice title=smoke ${process.platform}::${name}`) }
if (smoke) {
  setTimeout(() => { console.log(`::error title=smoke ${process.platform}::stuck at: ${smokeStage}`); app.exit(1) }, 90000).unref?.()
}

app.whenReady().then(async () => {
  stage('electron ready')
  Menu.setApplicationMenu(process.platform === 'darwin' ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]) : null)
  try {
    setNetlogFolder(app.getPath('userData'))
    ww = new WirdApp({ dataDir: app.getPath('userData') })
  } catch (err) {
    // Most likely data from a newer version. Say so, and change nothing.
    dialog.showErrorBox('wirdwatcher can’t open your data', `${err.message}\n\nYour data folder: ${app.getPath('userData')}`)
    app.exit(1)
    return
  }
  stage('data folder ready')
  await ww.start()
  stage('network started')
  const h = handlers()
  ipcMain.handle('ww', async (_e, name, args) => {
    if (!Object.hasOwn(h, name)) return { error: 'Unknown request.' }
    try {
      return { value: await h[name](...(Array.isArray(args) ? args : [])) }
    } catch (err) {
      return { error: err?.message || String(err) }
    }
  })
  ww.on('friends', () => send('friends', ww.friends.list()))
  ww.on('friend-records', () => send('friend-records'))
  ww.on('friend-code', (e) => send('friend-code', e))
  ww.on('progress', (p) => { if (p.source === 'lobby') send('progress', p) })
  ww.on('lobby', (s) => send('lobby', s))
  ww.on('lobby-event', (e) => send('lobby-event', e))
  ww.on('lobby-closed', (reason) => send('lobby-closed', reason))
  createWindow()
  app.on('activate', () => { if (!win) createWindow() })
  if (smoke) runSmokeTest()
})

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus() } })

let quitting = false
app.on('before-quit', async (e) => {
  if (quitting || !ww) return
  e.preventDefault()
  quitting = true
  await Promise.race([ww.stop().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 2000))])
  app.quit()
})
app.on('window-all-closed', () => app.quit())

async function runSmokeTest () {
  const fail = (why) => { console.log(`::error title=smoke ${process.platform}::${why}`); app.exit(1) }
  win.webContents.on('render-process-gone', (_e, d) => fail(`renderer ${d.reason}`))
  win.webContents.on('console-message', (e) => { if (e.level === 'error') console.log(`::warning title=smoke renderer::${String(e.message).slice(0, 300)}`) })
  await new Promise((resolve) => win.webContents.once('did-finish-load', resolve))
  stage('window loaded')
  for (let i = 0; i < 150; i++) {
    const ok = await win.webContents.executeJavaScript("Boolean(document.querySelector('.welcome input') && document.querySelector('.rail'))").catch(() => false)
    if (ok) {
      stage('app on screen')
      const word = await win.webContents.executeJavaScript("window.ww.call('deal', 'everyday').then((d) => d.word)")
      const fonts = await win.webContents.executeJavaScript("document.fonts.ready.then(() => [...document.fonts].filter((f) => f.status === 'error').map((f) => f.family))")
      if (!word) return fail('no word dealt')
      if (fonts.length) return fail(`fonts failed to load: ${fonts.join(', ')}`)
      stage(`dealt “${word}”; stopping`)
      // Shutting down the network shouldn't hold up the result.
      await Promise.race([ww.stop().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 3000))])
      try { fs.rmSync(app.getPath('userData'), { recursive: true, force: true }) } catch {}
      console.log(`smoke test passed on ${process.platform}`)
      app.exit(0)
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  fail('the window never showed the app')
}
