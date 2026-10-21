import { useState, useEffect } from 'react'
import { api, ratingColor, englishVoices, bestVoice, voiceScore, setVoice, speak } from './ui.jsx'
import Appearance from './Appearance.jsx'
import { SOUND_PRESETS, playRating, setCustomSound } from './sound.js'

const COLORS = ['#e8c686', '#e88a6b', '#7fc4a8', '#8ab4e8', '#c49ae8', '#e89ac0', '#a8d46f', '#6fd4d4']

const TABS = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'sound', label: 'Sound & effects' },
  { id: 'play', label: 'Playing' },
  { id: 'friends', label: 'Friends & lobbies' },
  { id: 'network', label: 'Network' },
  { id: 'profile', label: 'Profile' },
  { id: 'about', label: 'About' }
]

const remembered = () => { try { return localStorage.getItem('settingsTab') || 'appearance' } catch { return 'appearance' } }

// Settings, in tabs. Every limit that protects this computer from what
// others send is here too (Friends & lobbies, Network).
export default function Settings ({ update, appearance, setAppearance, me, settings, setSettings, setMe, wordCount, source }) {
  const [tab, setTab] = useState(remembered)
  const save = async (patch) => setSettings(await api('setSettings', patch))
  const pick = (id) => { setTab(id); try { localStorage.setItem('settingsTab', id) } catch {} }
  const fields = (groups) => Object.entries(settings.fields).filter(([, f]) => groups.includes(f.group)).map(([key, f]) => (
    <div key={key} className='setting'>
      <div>{f.label}{f.hint && <small>{f.hint}</small>}</div>
      {f.kind === 'bool'
        ? <button className={`toggle ${settings.values[key] ? 'on' : ''}`} role='switch' aria-checked={settings.values[key]} aria-label={f.label} onClick={() => save({ [key]: !settings.values[key] })} />
        : <input className='field' type='number' min={f.min} max={f.max} defaultValue={settings.values[key]} key={settings.values[key]} onBlur={(e) => save({ [key]: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} aria-label={f.label} />}
    </div>
  ))
  return (
    <div className='page settings wide'>
      <h1>Settings</h1>
      <div className='tabs settings-tabs' role='tablist'>
        {TABS.map((t) => <button key={t.id} role='tab' aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => pick(t.id)}>{t.label}</button>)}
      </div>
      {tab === 'appearance' && <Appearance appearance={appearance} setAppearance={setAppearance} />}
      <div style={{ maxWidth: 720 }}>
        {tab === 'sound' && <SoundSettings settings={settings} save={save} setSettings={setSettings} />}
        {tab === 'play' && <section><h2>Playing</h2>{fields(['play'])}</section>}
        {tab === 'friends' && <section><h2>Friends</h2>{fields(['friends'])}<h2>Lobbies</h2>{fields(['lobbies'])}</section>}
        {tab === 'network' && <section><h2>Network</h2>{fields(['network'])}</section>}
        {tab === 'profile' && <Profile me={me} setMe={setMe} />}
        {tab === 'about' && <About wordCount={wordCount} source={source} update={update} />}
        {['play', 'friends', 'network'].includes(tab) && <div style={{ marginTop: 18 }}><button className='btn small ghost' onClick={async () => setSettings(await api('resetSettings', TABS.find((t) => t.id === tab).id))}>Reset these to defaults</button></div>}
      </div>
    </div>
  )
}

function Profile ({ me, setMe }) {
  const [name, setName] = useState(me.hasChosenName ? me.name : '')
  const [confirm, setConfirm] = useState(null) // null | '' | text typed
  const [busy, setBusy] = useState(false)
  const saveMe = async (patch) => setMe(await api('setProfile', patch))
  const word = 'delete'
  return (
    <section>
      <h2>You</h2>
      <div className='setting'>
        <div>Name<small>Friends and lobby players see this.</small></div>
        <input className='field' value={name} maxLength={24} placeholder={me.name} onChange={(e) => setName(e.target.value)} onBlur={() => saveMe({ name })} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
      </div>
      <div className='setting'>
        <div>Color</div>
        <div className='swatches'>{COLORS.map((c) => <button key={c} style={{ background: c }} className={me.color === c ? 'on' : ''} onClick={() => saveMe({ color: c })} aria-label={`Color ${c}`} />)}</div>
      </div>
      <div className='setting'>
        <div>Your ID<small>Your public key. Friends’ computers know you by it; nobody can pretend to be you without this computer.</small></div>
        <code className='userid'>{me.userId.slice(0, 8)}…{me.userId.slice(-6)}</code>
      </div>
      <h2>Delete profile</h2>
      <div className='danger-zone'>
        <p>This deletes everything wirdwatcher keeps on this computer: your ratings, comments, favorites, playlists, XP and badges, your friends list, your settings and your identity. Friends who are online are told to remove you too. It can’t be undone, and wirdwatcher starts fresh afterwards.</p>
        {confirm === null
          ? <button className='btn danger-btn' onClick={() => setConfirm('')}>Delete my profile…</button>
          : (
            <form onSubmit={async (e) => { e.preventDefault(); if (confirm !== word) return; setBusy(true); await api('deleteProfile') }}>
              <label><span>Type <b>{word}</b> to confirm</span>
                <input autoFocus className='field' value={confirm} onChange={(e) => setConfirm(e.target.value.toLowerCase())} disabled={busy} />
              </label>
              <span style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button className='btn danger-btn' disabled={confirm !== word || busy}>{busy ? 'Deleting…' : 'Delete everything'}</button>
                <button type='button' className='btn ghost' onClick={() => setConfirm(null)} disabled={busy}>Keep my profile</button>
              </span>
            </form>
            )}
      </div>
    </section>
  )
}

function About ({ wordCount, source, update }) {
  const [folder, setFolder] = useState('')
  useEffect(() => { api('dataFolder').then(setFolder) }, [])
  return (
    <section>
      <h2>About</h2>
      <Updates u={update} />
      <p className='lede'>
        wirdwatcher 2, free and open source (MIT). {wordCount.toLocaleString()} words from {source.replace(/, https:.*/, '')}, <a href='https://en-word.net' target='_blank' rel='noreferrer'>en-word.net</a>.
        Fonts: Fredoka, Newsreader, Source Serif 4, EB Garamond, Fraunces, Inter, Bricolage Grotesque, Atkinson Hyperlegible, IBM Plex Mono and OpenDyslexic, all under the SIL Open Font License.
      </p>
      <h2>Your data</h2>
      <p className='lede'>Your ratings live on this computer and on your friends’ computers, nowhere else. They’re kept outside the app, so updating or reinstalling wirdwatcher keeps them. Before an update changes how they’re stored, a copy goes in the backups folder.</p>
      <div className='setting'>
        <div>Data folder<small className='path'>{folder}</small></div>
        <span style={{ justifySelf: 'end' }}><button className='btn small' onClick={() => api('openDataFolder')}>Open folder</button></span>
      </div>
      <div className='setting'>
        <div>Network log<small>If friends or lobbies won’t connect, this file shows what the network tried. It has no codes, keys or addresses in it, so it’s safe to send to whoever is helping you.</small></div>
        <span style={{ justifySelf: 'end' }}><button className='btn small' onClick={() => api('openNetworkLog')}>Show file</button></span>
      </div>
    </section>
  )
}

// Rating sounds: pick a preset (it plays when you pick it), test it across
// the rating scale, or use your own file.
function SoundSettings ({ settings, save, setSettings }) {
  const v = settings.values
  const [custom, setCustom] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => { api('customSound').then(setCustom) }, [])
  const test = (r, patch = {}) => playRating(r, { ...v, ...patch })
  const pick = async (id) => {
    if (id === 'custom' && !custom) return choose()
    await save({ ratingSound: id })
    test(id === 'original' ? 4.6 : 3.5, { ratingSound: id })
  }
  const choose = async () => {
    setError(null)
    try {
      const res = await api('chooseSound')
      if (res.canceled) return
      setCustom(res.sound)
      setCustomSound(res.sound?.dataUrl || null)
      setSettings(res.settings)
      setTimeout(() => playRating(3.5, res.settings.values), 50)
    } catch (err) { setError(err.message) }
  }
  const clear = async () => {
    setSettings(await api('clearCustomSound'))
    setCustom(null)
    setCustomSound(null)
  }
  return (
    <section>
      <h2>Sound & effects</h2>
      <div className='sounds'>
        {SOUND_PRESETS.map((p) => (
          <button key={p.id} className={`sound ${v.ratingSound === p.id ? 'on' : ''}`} onClick={() => pick(p.id)} aria-pressed={v.ratingSound === p.id}>
            <strong>{p.name}{p.id !== 'off' && <span className='play-icon' aria-hidden='true'>▶</span>}</strong>
            <small>{p.id === 'custom' && custom ? custom.name : p.blurb}</small>
          </button>
        ))}
      </div>
      <div className='setting'>
        <div>Your own sound<small>{custom ? `Using “${custom.name}”. It stays on this computer.` : 'MP3, WAV, OGG, M4A, AAC, FLAC or WebM, up to 3 MB. Short sounds work best.'}</small>{error && <small style={{ color: 'var(--bad)' }}>{error}</small>}</div>
        <span style={{ justifySelf: 'end', display: 'flex', gap: 6 }}>
          <button className='btn small' onClick={choose}>{custom ? 'Change file' : 'Choose file'}</button>
          {custom && <button className='btn small ghost danger' onClick={clear}>Remove</button>}
        </span>
      </div>
      <div className='setting'>
        <div>Try it<small>How each rating sounds with your settings.</small></div>
        <div className='scale-test'>
          {[0, 0.5, 1, 2, 2.5, 3, 4, 4.5, 5].map((r) => <button key={r} onClick={() => test(r)} style={{ color: ratingColor(r) }}>{r.toFixed(1)}</button>)}
        </div>
      </div>
      <div className='setting'>
        <div>Volume</div>
        <input type='range' min='0' max='100' value={v.soundVolume} aria-label='Volume' onChange={(e) => setSettings({ ...settings, values: { ...v, soundVolume: Number(e.target.value) } })} onPointerUp={(e) => { save({ soundVolume: e.currentTarget.value }); test(4) }} onKeyUp={(e) => save({ soundVolume: e.currentTarget.value })} />
      </div>
      <div className='setting'>
        <div>{settings.fields.animations.label}<small>{settings.fields.animations.hint}</small></div>
        <div className='seg'>{[['all', 'Every rating'], ['ends', 'Only the ends'], ['off', 'Off']].map(([x, label]) => <button key={x} className={v.animations === x ? 'on' : ''} onClick={() => save({ animations: x })}>{label}</button>)}</div>
      </div>
      <VoicePicker value={v.voice} save={save} />
      {['celebrate', 'soundPitch', 'tableSounds'].map((key) => {
        const f = settings.fields[key]
        return (
          <div key={key} className='setting'>
            <div>{f.label}{f.hint && <small>{f.hint}</small>}</div>
            <button className={`toggle ${v[key] ? 'on' : ''}`} role='switch' aria-checked={v[key]} aria-label={f.label} onClick={() => save({ [key]: !v[key] })} />
          </div>
        )
      })}
    </section>
  )
}

// The voice that says words out loud: the system's voices, best first.
function VoicePicker ({ value, save }) {
  const [voices, setVoices] = useState(() => englishVoices())
  useEffect(() => {
    const load = () => setVoices(englishVoices())
    load()
    window.speechSynthesis?.addEventListener?.('voiceschanged', load)
    return () => window.speechSynthesis?.removeEventListener?.('voiceschanged', load)
  }, [])
  const sorted = [...voices].sort((a, b) => voiceScore(b) - voiceScore(a) || a.name.localeCompare(b.name))
  const auto = bestVoice()
  const choose = (name) => { setVoice(name); save({ voice: name }); setTimeout(() => speak('sesquipedalian'), 60) }
  return (
    <div className='setting'>
      <div>Voice for saying words<small>{voices.length ? `Space says the word. Voices marked Enhanced, Premium or Natural are much better; ${navigator.platform.startsWith('Mac') ? 'add them in System Settings → Accessibility → Spoken Content → System voice → Manage Voices' : 'Windows adds more under Settings → Time & language → Speech'}.` : 'This computer has no English voices for speech.'}</small></div>
      <span style={{ justifySelf: 'end', display: 'flex', gap: 6 }}>
        <select className='field' value={value} onChange={(e) => choose(e.target.value)} aria-label='Voice for saying words' style={{ width: 230 }}>
          <option value=''>Best available{auto ? ` (${auto.name})` : ''}</option>
          {sorted.map((x) => <option key={x.name} value={x.name}>{x.name} · {x.lang}</option>)}
        </select>
        <button className='btn small' style={{ whiteSpace: 'nowrap' }} onClick={() => speak('sesquipedalian')}>Try it</button>
      </span>
    </div>
  )
}

// Where this copy stands against the latest release, and what to do about it.
function Updates ({ u }) {
  if (!u) return null
  const manual = u.kind === 'manual' || u.kind === 'mac-manual' || u.manualOnly
  const pct = u.progress == null ? null : Math.round(u.progress * 100)
  const line = {
    idle: 'Checks for a new release a little after starting, then every six hours.',
    checking: 'Checking for a new release…',
    current: `You have the latest release.${u.checked ? ` Checked ${new Date(u.checked).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.` : ''}`,
    available: manual
      ? `wirdwatcher ${u.version} is out. ${u.kind === 'mac-manual' ? 'This copy can’t replace itself (it’s running from the disk image or a folder it can’t write to), so download it and drag it to Applications.' : 'Download it from the Releases page.'}`
      : `wirdwatcher ${u.version} is out.${u.enabled ? '' : ' Updating by itself is off, so it waits for you.'}`,
    downloading: `Getting wirdwatcher ${u.version}${pct != null ? `… ${pct}%` : '…'}`,
    ready: `wirdwatcher ${u.version} is ready. Restart now, or it installs when you quit.`,
    error: `Couldn’t update: ${u.error || 'something went wrong'}`
  }[u.status] || ''
  const off = u.kind === 'off'
  return (
    <div className='setting updates'>
      <div>
        Version {u.current}
        <small>{off ? 'This copy is run from a developer folder (npm start), so it doesn’t update itself. Copies from the installers and the install scripts do.' : line}</small>
        {u.status === 'downloading' && pct != null && <span className='upd-bar'><i style={{ width: `${pct}%` }} /></span>}
      </div>
      {!off && (
        <span style={{ justifySelf: 'end', display: 'flex', gap: 6 }}>
          {u.status === 'ready' && <button className='btn small primary' onClick={() => api('updateRestart')}>Restart now</button>}
          {u.status === 'available' && manual && <button className='btn small primary' onClick={() => api('updateOpen')}>Download</button>}
          {u.status === 'available' && !manual && !u.enabled && <button className='btn small primary' onClick={() => api('updateDownload')}>Get it</button>}
          {['idle', 'current', 'error'].includes(u.status) && <button className='btn small' onClick={() => api('updateCheck')}>Check now</button>}
        </span>
      )}
    </div>
  )
}
