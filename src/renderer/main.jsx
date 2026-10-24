import { createRoot } from 'react-dom/client'
import './lookStyles.js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, icons, ToastHost, useToast, celebrate, Coins, setLevelUpSettings, useShownCoins } from './ui.jsx'
import Play from './Play.jsx'
import Lobby from './Lobby.jsx'
import Collection from './Collection.jsx'
import Friends from './Friends.jsx'
import Settings from './Settings.jsx'
import { applyAppearance, onSystemScheme } from './theme.js'
import Search from './Search.jsx'
import { setCustomSound } from './sound.js'
import { setConfettiStyle } from './effects.js'
import Wirdhouse from './Wirdhouse.jsx'
import Shop from './Shop.jsx'
import Market from './Market.jsx'
import Leximon from './Leximon.jsx'
import Valley from './Valley.jsx'
import Casino from './Casino.jsx'
import Today from './Today.jsx'
import Wirdlike from './Wirdlike.jsx'
import { formatCoins } from '../shared/economy.js'

const TABS = [
  { id: 'play', label: 'Play', icon: icons.play },
  { id: 'collection', label: 'Profile', icon: icons.collection },
  { id: 'wirdhouse', label: 'Wirdhouse', icon: icons.house },
  { id: 'lobby', label: 'Lobby', icon: icons.lobby },
  { id: 'friends', label: 'Friends', icon: icons.friends },
  { id: 'today', label: 'Today', icon: icons.daily },
  { id: 'leximon', label: 'Leximon', icon: icons.leximon },
  { id: 'market', label: 'Market', icon: icons.market },
  { id: 'casino', label: 'Casino', icon: icons.casino },
  { id: 'valley', label: 'Valley', icon: icons.farm },
  { id: 'wirdlike', label: 'Wirdlike', icon: icons.wirdlike },
  { id: 'shop', label: 'Shop', icon: icons.shop }
]

function App () {
  const toast = useToast()
  const [boot, setBoot] = useState(null)
  const [tab, setTab] = useState('play')
  const [me, setMe] = useState(null)
  const [profile, setProfile] = useState(null)
  const [modes, setModes] = useState(null)
  const [friends, setFriends] = useState([])
  const [settings, setSettings] = useState(null)
  const [appearance, setAppearance] = useState(null)
  const [lobby, setLobby] = useState(null)
  const [events, setEvents] = useState([])
  const [mode, setMode] = useState(() => { try { return localStorage.getItem('mode') || 'everyday' } catch { return 'everyday' } })
  const [focusWord, setFocusWord] = useState(null)
  const [searching, setSearching] = useState(false)
  const [econ, setEcon] = useState(null) // coins, coins per second, the streak, your look
  const [today, setToday] = useState(null) // for the dot on Today
  const [update, setUpdate] = useState(null) // a new release, as it downloads and gets ready
  const [lobbyWild, setLobbyWild] = useState(null)
  const shownCoins = useShownCoins(econ?.coins ?? 0) // a wild Leximon from a word rated at the table
  const [sure, setSure] = useState(false)

  useEffect(() => {
    api('boot').then((b) => {
      setBoot(b); setAppearance(b.appearance); setMe(b.me); setProfile(b.profile); setModes(b.modes); setFriends(b.friends); setSettings(b.settings); setLobby(b.lobby)
      if (b.platform === 'darwin') document.body.classList.add('mac')
    })
    api('customSound').then((snd) => setCustomSound(snd?.dataUrl || null))
    api('economy').then((e) => {
      setEcon(e)
      if (e.away?.coins >= 1) toast({ emoji: '🏠', title: `The wirdhouse made ${formatCoins(e.away.coins)} coins while you were away`, text: `${Math.round(e.away.rate * 100)}% speed for ${e.away.secs >= 3600 ? `${(e.away.secs / 3600).toFixed(1)} hours` : `${Math.round(e.away.secs / 60)} minutes`}${e.away.capped ? ' (the most it can hold)' : ''}.`, ms: 7000 })
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => window.ww.on.economy((c) => setEcon((old) => ({ ...(old || {}), ...c }))), [])
  useEffect(() => { api('update').then(setUpdate).catch(() => {}); return window.ww.on.update(setUpdate) }, [])
  useEffect(() => { if (update?.status === 'ready') toast({ emoji: '✨', title: `wirdwatcher ${update.version} is ready`, text: 'Restart whenever you like, or it installs when you quit.', ms: 8000 }) }, [update?.status === 'ready']) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const get = () => api('today').then(setToday).catch(() => {}); get(); const id = setInterval(get, 30000); return () => clearInterval(id) }, [])
  const todayDot = today && (today.quests.some((q) => !q.claimed && q.have >= q.n) || (today.weekly.have >= today.weekly.n && !today.weekly.claimed) || !(today.clues.solved || today.clues.gaveUp) || today.freeSpin.ready)
  useEffect(() => { setConfettiStyle(econ?.look?.confetti || 'classic') }, [econ?.look?.confetti])
  // Discharged from bankruptcy: say so, once.
  const wasBankrupt = useRef(null)
  useEffect(() => {
    if (!econ) return
    const now = Boolean(econ.bankrupt)
    if (wasBankrupt.current === true && !now) toast({ emoji: '🕊️', title: 'Discharged from bankruptcy', text: 'The casino, card packs, stakes, risky trades and your looks are all back.', ms: 7000 })
    wasBankrupt.current = now
  }, [Boolean(econ?.bankrupt)]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (settings) setLevelUpSettings(settings.values) }, [settings])

  // A button clicked with the mouse gives the keyboard back to the game, so
  // Space or Enter afterwards don't press it again. Tabbing still works.
  useEffect(() => {
    const up = () => { const el = document.activeElement; if (el?.tagName === 'BUTTON') el.blur() }
    document.addEventListener('mouseup', up)
    return () => document.removeEventListener('mouseup', up)
  }, [])

  // Search from anywhere: / (when not typing) or Ctrl/Cmd+K.
  useEffect(() => {
    const onKey = (e) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) && !e.target.readOnly
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey)) {
        e.preventDefault()
        setSearching(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Appearance: apply on every change, and when the system flips light/dark.
  useEffect(() => {
    if (!appearance) return
    applyAppearance(appearance)
    return onSystemScheme(() => applyAppearance(appearance))
  }, [appearance])

  const refreshTop = useCallback(async () => {
    const [m, p, md] = await Promise.all([api('me'), api('profile'), api('modes')])
    setMe(m); setProfile(p); setModes(md)
  }, [])

  useEffect(() => {
    const offs = [
      window.ww.on.friends((f) => { setFriends(f); api('modes').then(setModes) }),
      window.ww.on.friendRecords(() => api('modes').then(setModes)),
      // A friend code used (or failing) while you were anywhere in the app.
      window.ww.on.friendCode((e) => {
        if (e.friend) { toast({ emoji: '🤝', title: `You and ${e.friend.name} are friends`, text: 'Your ratings will swap whenever you’re both online.' }); refreshTop() }
        if (e.error) toast({ error: true, title: 'Adding a friend didn’t work', text: e.error })
      }),
      window.ww.on.progress((p) => {
        celebrate(toast, p); refreshTop()
        if (p.source === 'lobby' && p.leximon?.encounter) setLobbyWild(p.leximon.encounter)
        else if (p.source === 'lobby' && p.leximon?.fled) setLobbyWild((w) => (w && w.word === p.leximon.fled ? null : w))
      }),
      window.ww.on.lobby((s) => { setLobby(s); if (!s) setEvents([]) }),
      window.ww.on.lobbyEvent((e) => setEvents((all) => [...all.slice(-80), e])),
      window.ww.on.lobbyClosed((reason) => toast({ emoji: '🚪', title: 'The lobby ended', text: reason }))
    ]
    return () => offs.forEach((off) => off())
  }, [toast, refreshTop])

  // Joining or hosting a lobby takes you to it.
  useEffect(() => { if (lobby) setTab('lobby') }, [Boolean(lobby)]) // eslint-disable-line react-hooks/exhaustive-deps

  const pickMode = (m) => { setMode(m); try { localStorage.setItem('mode', m) } catch {} }

  if (!boot || !me || !modes || !settings || !appearance) return null
  const allModes = { ...modes, all: [...modes.modes, ...modes.topics, ...modes.playlists, ...modes.friendPlaylists, ...(modes.friendWords || [])] }
  const lvl = me.level
  const pct = lvl.into / lvl.step
  const onlineFriends = friends.filter((f) => f.online).length

  return (
    <div className='shell'>
      <nav className='rail' aria-label='Sections'>
        <div className='logo' aria-hidden='true'>ww</div>
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)} aria-current={tab === t.id}>
            {t.icon()}{t.label}
            {t.id === 'friends' && onlineFriends > 0 && <span className='dot' title={`${onlineFriends} online`} />}
            {t.id === 'lobby' && lobby && <span className='dot' />}
            {t.id === 'today' && todayDot && <span className='dot' />}
          </button>
        ))}
        <div className='spacer' />
        <button className={tab === 'settings' ? 'on' : ''} onClick={() => setTab('settings')}>{icons.settings()}Settings</button>
      </nav>

      <header className='top'>
        <button className='levelchip' onClick={() => setTab('collection')} title={`${lvl.into} / ${lvl.step} XP`}>
          <span className='ring'>
            <svg viewBox='0 0 40 40' aria-hidden='true'>
              <circle cx='20' cy='20' r='17' fill='none' stroke='var(--panel)' strokeWidth='4' />
              <circle cx='20' cy='20' r='17' fill='none' stroke='var(--accent)' strokeWidth='4' strokeLinecap='round' strokeDasharray={`${pct * 106.8} 106.8`} style={{ transition: 'stroke-dasharray .6s' }} />
            </svg>
            <b>{lvl.level}</b>
          </span>
          <span className='who'><strong>{me.name}</strong><span>{lvl.title}, {lvl.step - lvl.into} XP to go</span></span>
        </button>
        <div className='grow' />
        <button className='searchbtn' onClick={() => setSearching(true)} aria-label='Search words'>
          <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' aria-hidden='true'><circle cx='11' cy='11' r='7' /><path d='m20 20-3.5-3.5' /></svg>
          <span>Search words</span><kbd>/</kbd>
        </button>
        {update?.status === 'ready' && (
          <button className='stat updchip' onClick={() => { if (lobby && !sure) { setSure(true); setTimeout(() => setSure(false), 5000); return } api('updateRestart').catch(() => {}) }} title={`Restart into wirdwatcher ${update.version}`}>
            {sure ? 'Restart and leave the lobby?' : `✨ Restart for ${update.version}`}
          </button>
        )}
        {econ?.bankrupt && <button className='stat bankchip' onClick={() => setTab('market')} title='Bankrupt: see what’s left to be discharged'>⚖️ Bankrupt</button>}
        {econ && <button className={`stat coinstat ${econ.streak?.n > 1 ? 'hot' : ''} ${econ.coins < 0 ? 'debt' : ''}`} onClick={() => setTab('wirdhouse')} title={econ.coins < 0 ? `In debt: ${formatCoins(-econ.coins)} coins owed` : `${formatCoins(econ.cps)} coins a second`}><strong><Coins n={shownCoins} /></strong>{econ.cps >= 0.1 ? `${formatCoins(econ.cps)}/s` : 'coins'}</button>}
        <span className='stat flame' title='Days in a row'><strong>{me.streak || 0}</strong>day streak 🔥</span>
        <span className='stat'><strong>{profile.stats.rated.toLocaleString()}</strong>rated</span>
        <span className='stat'><strong>{onlineFriends}</strong>friends online</span>
      </header>

      <main className='main'>
        <div style={{ display: tab === 'play' ? 'contents' : 'none' }}>
          <Play mode={mode} setMode={pickMode} modes={allModes} settings={settings.values} refreshTop={refreshTop} focusWord={focusWord} clearFocusWord={() => setFocusWord(null)} active={tab === 'play' && !searching} econ={econ} />
        </div>
        {tab === 'collection' && <Collection me={me} econ={econ} profile={profile} modes={modes} refreshTop={refreshTop} openWord={(w) => { setFocusWord(w); setTab('play') }} playMode={(m) => { pickMode(m); setTab('play') }} />}
        {tab === 'friends' && <Friends friends={friends} profile={profile} refreshTop={refreshTop} openWord={(w) => { setFocusWord(w); setTab('play') }} playMode={(m) => { pickMode(m); setTab('play') }} />}
        <div style={{ display: tab === 'lobby' ? 'contents' : 'none' }}>
          <Lobby lobby={lobby} choices={boot.lobbyChoices} me={me} coins={Math.floor(econ?.coins ?? 0)} active={tab === 'lobby' && !searching} events={events} settings={settings.values} wild={lobbyWild} clearWild={() => setLobbyWild(null)} />
        </div>
        {tab === 'wirdhouse' && <Wirdhouse econ={econ} />}
        {tab === 'shop' && <Shop econ={econ} me={me} />}
        {tab === 'today' && <Today settings={settings.values} goTo={setTab} onChange={setToday} />}
        {tab === 'casino' && <Casino econ={econ} settings={settings.values} />}
        {tab === 'valley' && <Valley />}
        {tab === 'wirdlike' && <Wirdlike settings={settings.values} />}
        {tab === 'leximon' && <Leximon econ={econ} friends={friends} settings={settings.values} />}
        {tab === 'market' && <Market econ={econ} openWord={(w) => { setFocusWord(w); setTab('play') }} />}
        {searching && <Search onClose={() => setSearching(false)} onOpen={(w) => { setSearching(false); setFocusWord(w); setTab('play') }} />}
        {tab === 'settings' && <Settings update={update} appearance={appearance} setAppearance={setAppearance} me={me} settings={settings} setSettings={setSettings} setMe={(m) => { setMe(m); refreshTop() }} wordCount={boot.wordCount} source={boot.source} />}
      </main>

      {!me.hasChosenName && <Welcome onDone={(m) => { setMe(m); refreshTop() }} />}
    </div>
  )
}

function Welcome ({ onDone }) {
  const [name, setName] = useState('')
  const go = async (e) => {
    e.preventDefault()
    if (name.trim()) onDone(await api('setProfile', { name }))
  }
  return (
    <div className='welcome'>
      <form onSubmit={go}>
        <h1>wirdwatcher</h1>
        <p>You get a word. You rate it out of 5.0. That’s the whole game, and it’s strangely hard to stop.</p>
        <p>What should friends call you?</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input autoFocus className='field' style={{ fontSize: 20 }} value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder='Your name' />
          <button className='btn primary' disabled={!name.trim()}>Start rating</button>
        </div>
        <p style={{ fontSize: 14 }}>No account. Your ratings stay on this computer, and with friends you add.</p>
      </form>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<ToastHost><App /></ToastHost>)
