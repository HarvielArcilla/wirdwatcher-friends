import { useState } from 'react'
import { api } from './ui.jsx'
import Appearance from './Appearance.jsx'

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
      {Object.entries(settings.groups).map(([group, title]) => (
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
