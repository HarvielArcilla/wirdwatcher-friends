import { useEffect, useRef, useState } from 'react'
import { formatRating } from '../shared/progress.js'
import { api, Kbd, ratingColor } from './ui.jsx'

// Look up any word, by spelling or by meaning. ↑ ↓ to move, Enter to open
// it on the Play screen (where you can rate it), Esc to close.
export default function Search ({ onOpen, onClose }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState([])
  const [sel, setSel] = useState(0)
  const ref = useRef(null)
  const list = useRef(null)

  useEffect(() => { ref.current?.focus() }, [])
  useEffect(() => {
    let live = true
    const t = setTimeout(() => api('searchWords', q).then((h) => { if (live) { setHits(h); setSel(0) } }), q.length < 3 ? 0 : 90)
    return () => { live = false; clearTimeout(t) }
  }, [q])
  useEffect(() => { list.current?.querySelector('.on')?.scrollIntoView({ block: 'nearest' }) }, [sel])

  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((i) => Math.min(hits.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((i) => Math.max(0, i - 1)) }
    else if (e.key === 'Enter' && hits[sel]) { e.preventDefault(); e.stopPropagation(); onOpen(hits[sel].word) }
  }

  const words = hits.filter((h) => h.match === 'word')
  const meanings = hits.filter((h) => h.match === 'meaning')
  const row = (h) => {
    const i = hits.indexOf(h)
    return (
      <button key={h.word} className={`search-hit ${i === sel ? 'on' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => onOpen(h.word)}>
        <span className='w'>{h.word}{h.ipa && <small>/{h.ipa}/</small>}</span>
        <span className='d'><b>{h.pos}</b>{h.def}</span>
        {h.r === null ? <span className='r none'>not rated</span> : <span className='r' style={{ color: ratingColor(h.r) }}>{formatRating(h.r)}</span>}
      </button>
    )
  }

  return (
    <div className='overlay' onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className='sheet search-sheet' role='dialog' aria-label='Search words'>
        <div className='search-input'>
          <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' aria-hidden='true'><circle cx='11' cy='11' r='7' /><path d='m20 20-3.5-3.5' /></svg>
          <input ref={ref} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder='Search a word, or describe one' spellCheck={false} aria-label='Search words' />
        </div>
        <div className='search-results' ref={list}>
          {!q && <div className='search-empty'>Type a word, part of one (“phobia”), or what it means (“fear of spiders”).</div>}
          {q && !hits.length && <div className='search-empty'>Nothing matches “{q}”. Try fewer letters, or describe what the word means.</div>}
          {words.length > 0 && <>{meanings.length > 0 && <div className='search-group'>Words</div>}{words.map(row)}</>}
          {meanings.length > 0 && <><div className='search-group'>Words that mean “{q}”</div>{meanings.map(row)}</>}
        </div>
        <div className='search-foot'><span><Kbd>↑</Kbd><Kbd>↓</Kbd> choose</span><span><Kbd>Enter</Kbd> open and rate</span><span><Kbd>Esc</Kbd> close</span></div>
      </div>
    </div>
  )
}
