import { useState, useEffect } from 'react'
import { api, ratingColor } from './ui.jsx'
import Appearance from './Appearance.jsx'
import { SOUND_PRESETS, playRating, setCustomSound } from './sound.js'

const COLORS = ['#e8c686', '#e88a6b', '#7fc4a8', '#8ab4e8', '#c49ae8', '#e89ac0', '#a8d46f', '#6fd4d4']

// Your name and color, then every setting, including each limit that
// protects this computer from what others send.
export default function Settings ({ appearance, setAppearance, me, settings, setSettings, setMe, wordCount, source }) {
  const [name, setName] = useState(me.hasChosenName ? me.name : '')
  const save = async (patch) => setSettings(await api('setSettings', patch))
  const saveMe = async (patch) => setMe(await api('setProfile', patch))
  return (
    <div className='page settings wide'>
      <h1>Settings</h1>
      <Appearance appearance={appearance} setAppearance={setAppearance} />
      <div style={{ maxWidth: 720 }}>
      <h2>You</h2>
      <div className='setting'>
        <div>Name<small>Friends and lobby players see this.</small></div>
        <input className='field' value={name} maxLength={24} placeholder={me.name} onChange={(e) => setName(e.target.value)} onBlur={() => saveMe({ name })} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
      </div>
      <div className='setting'>
        <div>Color</div>
        <div className='swatches'>{COLORS.map((c) => <button key={c} style={{ background: c }} className={me.color === c ? 'on' : ''} onClick={() => saveMe({ color: c })} aria-label={`Color ${c}`} />)}</div>
      </div>
      <SoundSettings settings={settings} save={save} setSettings={setSettings} />
      {Object.entries(settings.groups).filter(([group]) => group !== 'sound').map(([group, title]) => (
        <section key={group}>
          <h2>{title}</h2>
          {Object.entries(settings.fields).filter(([, f]) => f.group === group).map(([key, f]) => (
            <div key={key} className='setting'>
              <div>{f.label}{f.hint && <small>{f.hint}</small>}</div>
              {f.kind === 'bool'
                ? <button className={`toggle ${settings.values[key] ? 'on' : ''}`} role='switch' aria-checked={settings.values[key]} aria-label={f.label} onClick={() => save({ [key]: !settings.values[key] })} />
                : <input className='field' type='number' min={f.min} max={f.max} defaultValue={settings.values[key]} key={settings.values[key]} onBlur={(e) => save({ [key]: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} aria-label={f.label} />}
            </div>
          ))}
        </section>
      ))}
      <h2>About</h2>
      <p className='lede'>
        wirdwatcher 2, free and open source (MIT). {wordCount.toLocaleString()} words from {source.replace(/, https:.*/, '')}, <a href='https://en-word.net' target='_blank' rel='noreferrer'>en-word.net</a>.
        Your ratings live on this computer and on your friends’ computers, nowhere else.
        Fonts: Fredoka, Newsreader, Source Serif 4, EB Garamond, Fraunces, Inter, Bricolage Grotesque, Atkinson Hyperlegible, IBM Plex Mono and OpenDyslexic, all under the SIL Open Font License.
      </p>
      </div>
    </div>
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
    test(3.5, { ratingSound: id, sounds: false })
  }
  const choose = async () => {
    setError(null)
    try {
      const res = await api('chooseSound')
      if (res.canceled) return
      setCustom(res.sound)
      setCustomSound(res.sound?.dataUrl || null)
      setSettings(res.settings)
      setTimeout(() => playRating(3.5, { ...res.settings.values, sounds: false }), 50)
    } catch (err) { setError(err.message) }
  }
  const clear = async () => {
    setSettings(await api('clearCustomSound'))
    setCustom(null)
    setCustomSound(null)
  }
  return (
    <section>
      <h2>Sound</h2>
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
          {[0, 1, 2, 2.5, 3, 4, 5].map((r) => <button key={r} onClick={() => test(r)} style={{ color: ratingColor(r) }}>{r.toFixed(1)}</button>)}
        </div>
      </div>
      <div className='setting'>
        <div>Volume</div>
        <input type='range' min='0' max='100' value={v.soundVolume} aria-label='Volume' onChange={(e) => setSettings({ ...settings, values: { ...v, soundVolume: Number(e.target.value) } })} onPointerUp={(e) => { save({ soundVolume: e.currentTarget.value }); test(4) }} onKeyUp={(e) => save({ soundVolume: e.currentTarget.value })} />
      </div>
      {['soundPitch', 'sounds'].map((key) => {
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
