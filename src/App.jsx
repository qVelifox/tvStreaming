import { useState, useEffect, useRef, useCallback } from 'react'
import Hls from 'hls.js'
import './media-theme-microvideo.js'

const M3U_URL = 'https://iptv-org.github.io/iptv/languages/fra.m3u'

const moonSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`
const sunSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`
const closeSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`

const RANKED_IDS = [
  'tf1', 'france2', 'france3', 'm6', 'france5',
  'arte', 'c8', 'bfmtv', 'tmc', 'w9',
  'canalplus', 'france4', 'cnews', 'nrj12', 'tfx',
  'lci', 'gulli', 'franceinfo', '6ter', 'rmcstory',
  'rmcdecouverte', 'cherie25', 'lequipe', 'parispremiere',
  'canalpluscinemas', 'canalplussport', 'planeteplus',
  'nationalgeographic', 'disneychannel', 'boomerang',
  'teletoonplus', 'piwip', 'canalj', 'publicsenat',
  'lcp', 'euronews', 'tv5monde', 'france24',
]

function popRank(channel) {
  const id = (channel.tvgId || channel.name).toLowerCase()
  for (let i = 0; i < RANKED_IDS.length; i++) {
    if (id.startsWith(RANKED_IDS[i])) return i
  }
  return 999
}

function initialsFallback(name, isDark) {
  const clean = name.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').trim()
  const letters = clean.split(/[\s-]+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?'
  const fg = isDark ? '555555' : 'b8b8b4'
  return `data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="112" viewBox="0 0 200 112"%3E%3Ctext x="100" y="68" text-anchor="middle" font-family="Outfit,sans-serif" font-size="36" font-weight="500" fill="%23${fg}"%3E${encodeURIComponent(letters)}%3C/text%3E%3C/svg%3E`
}

function sortChannels(list) {
  return [...list].sort((a, b) => {
    const ra = popRank(a), rb = popRank(b)
    if (ra !== rb) return ra - rb
    return a.name.localeCompare(b.name)
  })
}

function parseM3U(text) {
  const lines = text.split('\n')
  const channels = []
  let current = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('#EXTINF:')) {
      const nameMatch = trimmed.match(/,([^,]+)$/)
      const logoMatch = trimmed.match(/tvg-logo="([^"]*)"/)
      const groupMatch = trimmed.match(/group-title="([^"]*)"/)
      const tvgIdMatch = trimmed.match(/tvg-id="([^"]*)"/)

      current = {
        name: nameMatch ? nameMatch[1].trim() : 'Unknown',
        logo: logoMatch ? logoMatch[1] : '',
        group: groupMatch && groupMatch[1] && groupMatch[1] !== 'Undefined' ? groupMatch[1].replace(/;/g, ' & ') : 'Other',
        tvgId: tvgIdMatch ? tvgIdMatch[1] : '',
        url: '',
        referer: '',
        userAgent: '',
      }
    } else if (trimmed.startsWith('#EXTVLCOPT:http-referrer=')) {
      if (current) current.referer = trimmed.split('=').slice(1).join('=')
    } else if (trimmed.startsWith('#EXTVLCOPT:http-user-agent=')) {
      if (current) current.userAgent = trimmed.split('=').slice(1).join('=')
    } else if (trimmed.startsWith('http') && current) {
      current.url = trimmed.split('?')[0]
      channels.push(current)
      current = null
    }
  }

  return channels
}

function ChannelCard({ channel, index, onSelect, theme }) {
  const isDark = theme === 'dark'
  return (
    <div className="card" style={{ '--i': index }} onClick={() => onSelect(channel)}>
      <div className="card-poster">
        <img
          src={channel.logo || initialsFallback(channel.name, isDark)}
          alt={channel.name}
          loading="lazy"
          onError={(e) => {
            if (!e.target.src.startsWith('data:image/svg+xml')) e.target.src = initialsFallback(channel.name, isDark)
          }}
        />
      </div>
      <div className="card-meta">
        <div className="card-title">{channel.name}</div>
        <div className="card-sub">{channel.group}</div>
      </div>
    </div>
  )
}

export default function App() {
  const [channels, setChannels] = useState([])
  const [filtered, setFiltered] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedGroup, setSelectedGroup] = useState('')
  const [isPlayerOpen, setIsPlayerOpen] = useState(false)
  const [currentChannel, setCurrentChannel] = useState(null)
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') === 'dark' ? 'dark' : 'light')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [groups, setGroups] = useState([])
  const [filterOpen, setFilterOpen] = useState(false)
  const videoRef = useRef(null)
  const hlsRef = useRef(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark')
    else document.documentElement.removeAttribute('data-theme')
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    document.body.classList.toggle('scroll-lock', isPlayerOpen || filterOpen)
  }, [isPlayerOpen, filterOpen])

  useEffect(() => {
    ;(async () => {
      try {
        setLoading(true)
        const res = await fetch(M3U_URL)
        if (!res.ok) throw new Error('Failed to fetch playlist')
        const text = await res.text()
        const parsed = parseM3U(text)
        if (parsed.length === 0) throw new Error('No channels found')
        const sorted = sortChannels(parsed)
        setChannels(sorted)
        setFiltered(sorted)
        const uniqueGroups = [...new Set(parsed.map(c => c.group))].sort()
        const idx = uniqueGroups.indexOf('Other')
        if (idx > -1) { uniqueGroups.splice(idx, 1); uniqueGroups.push('Other') }
        setGroups(uniqueGroups)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      let result = channels
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        result = result.filter(c => c.name.toLowerCase().includes(q) || c.group.toLowerCase().includes(q))
      }
      if (selectedGroup) {
        result = result.filter(c => c.group === selectedGroup)
      }
      setFiltered(result)
    }, 200)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [searchQuery, selectedGroup, channels])

  function openChannel(channel) {
    setCurrentChannel(channel)
    setIsPlayerOpen(true)
  }

  function closePlayer() {
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.src = ''
    }
    setIsPlayerOpen(false)
    setCurrentChannel(null)
  }

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        if (filterOpen) { setFilterOpen(false); return }
        closePlayer()
      }
    }
    document.onkeydown = handleKey
    return () => { document.onkeydown = null }
  }, [filterOpen])

  const initPlayer = useCallback((url) => {
    const video = videoRef.current
    if (!video) return

    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    if (url.includes('.m3u8') && typeof Hls !== 'undefined' && Hls.isSupported()) {
      const hls = new Hls()
      hlsRef.current = hls
      hls.loadSource(url)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {})
      })
    } else {
      video.src = url
    }
  }, [])

  useEffect(() => {
    if (isPlayerOpen && currentChannel) {
      requestAnimationFrame(() => initPlayer(currentChannel.url))
    }
  }, [isPlayerOpen, currentChannel, initPlayer])

  return (
    <>
      <button id="theme-toggle" aria-label="Toggle theme" onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
        dangerouslySetInnerHTML={{ __html: theme === 'dark' ? sunSVG : moonSVG }}
        style={{ display: isPlayerOpen ? 'none' : '' }}
      />

      <div id="header">
        <input id="search" placeholder="Search channels..." value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        {groups.length > 0 && (
          <div id="group-filter">
            <button id="group-filter-btn" className={selectedGroup ? 'active' : ''}
              onClick={() => setFilterOpen(prev => !prev)}
            >
              <span>{selectedGroup || 'All groups'}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>
        )}
      </div>

      <div id="filter-modal" className={filterOpen ? 'open' : ''}>
        <div id="filter-backdrop" onClick={() => setFilterOpen(false)} />
        <div id="filter-panel">
          <div id="filter-head">
            <span>Groups</span>
            <button onClick={() => setFilterOpen(false)} aria-label="Close" dangerouslySetInnerHTML={{ __html: closeSVG }} />
          </div>
          <div id="filter-groups">
            <button className={`filter-chip ${!selectedGroup ? 'active' : ''}`}
              onClick={() => { setSelectedGroup(''); setFilterOpen(false) }}>
              All groups
            </button>
            {groups.map(g => (
              <button key={g} className={`filter-chip ${selectedGroup === g ? 'active' : ''}`}
                onClick={() => { setSelectedGroup(g); setFilterOpen(false) }}>
                {g}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && <div id="loading">Loading channels...</div>}
      {error && <div id="error">{error}</div>}

      {!loading && !error && (
        <>
          <div id="counter">{filtered.length} channel{filtered.length !== 1 ? 's' : ''}</div>
          <div id="grid">
            {filtered.map((ch, i) => (
              <ChannelCard key={`${ch.tvgId}-${i}`} channel={ch} index={i} onSelect={openChannel} theme={theme} />
            ))}
          </div>
        </>
      )}

      <div id="player-overlay" className={isPlayerOpen ? 'open' : ''}>
        <button id="player-close" onClick={closePlayer} aria-label="Close" dangerouslySetInnerHTML={{ __html: closeSVG }} />
        {currentChannel && (
          <media-theme-microvideo key={currentChannel.url}>
            <video ref={videoRef} slot="media" autoPlay playsInline></video>
          </media-theme-microvideo>
        )}
      </div>
    </>
  )
}
