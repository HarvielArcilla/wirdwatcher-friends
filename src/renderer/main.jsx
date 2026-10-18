import { createRoot } from 'react-dom/client'
import { useCallback, useEffect, useState } from 'react'
import { api, icons, ToastHost, useToast, celebrate } from './ui.jsx'
import Play from './Play.jsx'
import Lobby from './Lobby.jsx'
import Collection from './Collection.jsx'
import Friends from './Friends.jsx'
import Settings from './Settings.jsx'
import { applyAppearance, onSystemScheme } from './theme.js'
import Search from './Search.jsx'
import { setCustomSound } from './sound.js'

const TABS = [
  { id: 'play', label: 'Play', icon: icons.play },
  { id: 'collection', label: 'Collection', icon: icons.collection },
  { id: 'friends', label: 'Friends', icon: icons.friends },
  { id: 'lobby', label: 'Lobby', icon: icons.lobby }
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

  useEffect(() => {
    api('boot').then((b) => {
      setBoot(b); setAppearance(b.appearance); setMe(b.me); setProfile(b.profile); setModes(b.modes); setFriends(b.friends); setSettings(b.settings); setLobby(b.lobby)
      if (b.platform === 'darwin') document.body.classList.add('mac')
    })
    api('customSound').then((snd) => setCustomSound(snd?.dataUrl || null))
  }, [])

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
      window.ww.on.progress((p) => { celebrate(toast, p); refreshTop() }),
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
        <span className='stat flame' title='Days in a row'><strong>{me.streak || 0}</strong>day streak 🔥</span>
        <span className='stat'><strong>{profile.stats.rated.toLocaleString()}</strong>rated</span>
        <span className='stat'><strong>{onlineFriends}</strong>friends online</span>
      </header>

      <main className='main'>
        <div style={{ display: tab === 'play' ? 'contents' : 'none' }}>
          <Play mode={mode} setMode={pickMode} modes={allModes} settings={settings.values} refreshTop={refreshTop} focusWord={focusWord} clearFocusWord={() => setFocusWord(null)} active={tab === 'play' && !searching} />
        </div>
        {tab === 'collection' && <Collection profile={profile} modes={modes} refreshTop={refreshTop} openWord={(w) => { setFocusWord(w); setTab('play') }} playMode={(m) => { pickMode(m); setTab('play') }} />}
        {tab === 'friends' && <Friends friends={friends} profile={profile} refreshTop={refreshTop} openWord={(w) => { setFocusWord(w); setTab('play') }} playMode={(m) => { pickMode(m); setTab('play') }} />}
        <div style={{ display: tab === 'lobby' ? 'contents' : 'none' }}>
          <Lobby lobby={lobby} choices={boot.lobbyChoices} me={me} active={tab === 'lobby' && !searching} events={events} settings={settings.values} />
        </div>
        {searching && <Search onClose={() => setSearching(false)} onOpen={(w) => { setSearching(false); setFocusWord(w); setTab('play') }} />}
        {tab === 'settings' && <Settings appearance={appearance} setAppearance={setAppearance} me={me} settings={settings} setSettings={setSettings} setMe={(m) => { setMe(m); refreshTop() }} wordCount={boot.wordCount} source={boot.source} />}
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
