import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { THEMES, FONTS, FONT_PRESETS, DEFAULT_APPEARANCE, themeById, themeColors, resolveFonts, accentWarning } from '../shared/appearance.js'
import { api, ratingColor } from './ui.jsx'
import { paint, schemeFor } from './theme.js'

// Settings → Appearance. Light and dark are set separately; a live preview
// shows the choice before you leave the page.
export default function Appearance ({ appearance: a, setAppearance }) {
  const scheme = schemeFor(a)
  const [previewScheme, setPreviewScheme] = useState(scheme)
  useEffect(() => setPreviewScheme(scheme), [scheme])
  const save = async (patch) => setAppearance(await api('setAppearance', patch))

  return (
    <section className='appearance'>
      <h2>Appearance</h2>
      <div className='ap-top'>
        <div className='ap-controls'>
          <Row label='Light or dark' hint={a.mode === 'system' ? `Following your computer, which is ${scheme} right now.` : null}>
            <Seg value={a.mode} options={[['system', 'Match computer'], ['light', 'Light'], ['dark', 'Dark']]} onChange={(mode) => save({ mode })} />
          </Row>
          <Row label='Word size'>
            <Seg value={a.wordSize} options={[['compact', 'Compact'], ['normal', 'Normal'], ['huge', 'Huge']]} onChange={(wordSize) => save({ wordSize })} />
          </Row>
          <Row label='Corners'>
            <Seg value={a.corners} options={[['square', 'Square'], ['soft', 'Soft'], ['round', 'Round']]} onChange={(corners) => save({ corners })} />
          </Row>
          <Row label='Motion' hint='Reduced turns off card flips, XP pops and level-up bursts.'>
            <Seg value={a.motion} options={[['full', 'Full'], ['reduced', 'Reduced']]} onChange={(motion) => save({ motion })} />
          </Row>
        </div>
        <div>
          <Preview a={a} scheme={previewScheme} />
          <div className='ap-preview-switch'>
            <Seg value={previewScheme} options={[['light', 'Preview light'], ['dark', 'Preview dark']]} onChange={setPreviewScheme} />
          </div>
        </div>
      </div>

      <div className='ap-sides'>
        {['dark', 'light'].map((mode) => (
          <Side key={mode} mode={mode} side={a[mode]} active={scheme === mode} save={(patch) => { setPreviewScheme(mode); save({ [mode]: patch }) }} />
        ))}
      </div>

      <h3 className='ap-h'>Fonts</h3>
      <div className='ap-fonts'>
        {FONT_PRESETS.map((p) => {
          const f = resolveFonts({ preset: p.id })
          const on = a.fonts.preset === p.id
          return (
            <button key={p.id} className={`ap-font ${on ? 'on' : ''}`} onClick={() => save({ fonts: { preset: p.id, word: null, ui: null, reading: null } })} aria-pressed={on}>
              <span className='ap-font-word' style={{ fontFamily: `"${f.word.family}"`, fontWeight: f.word.word.weight, letterSpacing: f.word.word.tracking }}>wordsmith</span>
              <strong style={{ fontFamily: `"${f.ui.family}"` }}>{p.name}</strong>
              <small style={{ fontFamily: `"${f.reading.family}"` }}>{p.blurb}</small>
            </button>
          )
        })}
      </div>
      <div className='ap-custom-fonts'>
        {[['word', 'The word and numbers'], ['ui', 'Buttons and labels'], ['reading', 'Definitions']].map(([k, label]) => {
          const preset = FONT_PRESETS.find((p) => p.id === a.fonts.preset)
          return (
            <label key={k}>{label}
              <select className='field' value={a.fonts[k] || ''} onChange={(e) => save({ fonts: { [k]: e.target.value || null } })} style={{ fontFamily: `"${resolveFonts(a.fonts)[k].family}"` }}>
                <option value=''>{preset.name}: {FONTS.find((f) => f.id === preset[k]).name}</option>
                {FONTS.map((f) => <option key={f.id} value={f.id}>{f.name} ({f.kind.toLowerCase()})</option>)}
              </select>
            </label>
          )
        })}
      </div>

      <div style={{ marginTop: 18 }}>
        <button className='btn small ghost' onClick={() => save(DEFAULT_APPEARANCE)}>Reset appearance</button>
      </div>
    </section>
  )
}

function Side ({ mode, side, active, save }) {
  const theme = themeById(side.theme)
  const [custom, setCustom] = useState(side.accent || theme.colors.accent)
  useEffect(() => setCustom(side.accent || theme.colors.accent), [side.accent, theme])
  const warning = accentWarning(theme, side.accent)
  // Suggested accents: the other themes' accents of the same kind.
  const swatches = [...new Set(THEMES.filter((t) => t.mode === mode).map((t) => t.colors.accent))]
  return (
    <div className={`ap-side ${active ? 'active' : ''}`}>
      <h3>{mode === 'dark' ? 'Dark mode' : 'Light mode'} {active && <span>in use</span>}</h3>
      <div className='ap-themes'>
        {THEMES.filter((t) => t.mode === mode).map((t) => {
          const c = themeColors(t, t.id === side.theme ? side.accent : null)
          const on = t.id === side.theme
          return (
            <button key={t.id} className={`ap-theme ${on ? 'on' : ''}`} onClick={() => save({ theme: t.id, accent: null })} aria-pressed={on} title={t.blurb} style={{ background: c.bg, color: c.text }}>
              <span className='ap-theme-word' style={{ color: c.word }}>wird</span>
              <span className='ap-theme-scale'>{[c.bad, c.mid, c.good].map((x) => <i key={x} style={{ background: x }} />)}<i style={{ background: c.accent, marginLeft: 'auto' }} /></span>
              <span className='ap-theme-name' style={{ background: c.panel }}>{t.name}</span>
            </button>
          )
        })}
      </div>
      <div className='ap-row'>
        <span>Accent</span>
        <div className='ap-accents'>
          <button className={`ap-swatch ${!side.accent ? 'on' : ''}`} onClick={() => save({ accent: null })} title={`${theme.name}’s own`} style={{ background: theme.colors.accent }} aria-label='Theme accent' />
          {swatches.filter((x) => x !== theme.colors.accent).map((x) => <button key={x} className={`ap-swatch ${side.accent === x ? 'on' : ''}`} onClick={() => save({ accent: x })} style={{ background: x }} aria-label={`Accent ${x}`} />)}
          <label className='ap-picker' title='Any color'>
            <input type='color' value={custom} onChange={(e) => setCustom(e.target.value)} onBlur={() => custom !== (side.accent || theme.colors.accent) && save({ accent: custom })} />
            <span>Custom</span>
          </label>
        </div>
      </div>
      {warning && <p className='ap-warn'>{warning}</p>}
      <div className='ap-row'>
        <span>Texture</span>
        <Seg value={side.texture} options={[['none', 'None'], ['paper', 'Paper'], ['grain', 'Grain']]} onChange={(texture) => save({ texture })} />
      </div>
    </div>
  )
}

// A tiny Play screen in the chosen look.
function Preview ({ a, scheme }) {
  const ref = useRef(null)
  useLayoutEffect(() => { if (ref.current) paint(ref.current, a, scheme) }, [a, scheme])
  const f = resolveFonts(a.fonts)
  return (
    <div ref={ref} className='ap-preview' data-texture={a[scheme].texture} aria-label='Preview'>
      <div className='ap-pv-top'><span className='ap-pv-lvl'>7</span><span>Wordsmith<small>140 XP to go</small></span></div>
      <div className='ap-pv-word' style={{ fontSize: Math.round(54 * ({ compact: 0.78, normal: 1, huge: 1.2 }[a.wordSize]) * (f.word.scale || 1)) }}>serendipity</div>
      <div className='ap-pv-ipa'>/ˌsɛ.ɹən.ˈdɪ.pɪ.ti/</div>
      <div className='ap-pv-rate'>
        <span style={{ color: ratingColor(4.6) }}>4.6</span>
        <span className='ap-pv-bars'>{[0, 1, 2, 3, 4].map((i) => <i key={i} style={{ background: i < 4 ? ratingColor(4.6) : 'var(--panel)' }} />)}</span>
      </div>
      <p className='ap-pv-def'><b>noun</b> good luck in making unexpected and fortunate discoveries</p>
      <div className='ap-pv-actions'>
        <span className='btn small primary'>Next word</span>
        <span className='chip'>💛 Favorite</span>
        <span className='ap-pv-low' style={{ color: ratingColor(0.8) }}>0.8</span>
        <span className='ap-pv-low' style={{ color: ratingColor(2.5) }}>2.5</span>
      </div>
    </div>
  )
}

function Row ({ label, hint, children }) {
  return <div className='ap-row'><span>{label}{hint && <small>{hint}</small>}</span>{children}</div>
}

function Seg ({ value, options, onChange }) {
  return <div className='seg' role='radiogroup'>{options.map(([v, label]) => <button key={v} role='radio' aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{label}</button>)}</div>
}
