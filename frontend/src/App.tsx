import { useState } from 'react'
import { Collections } from './Collections'
import { Library } from './Library'
import { Settings } from './Settings'
import { LatexProvider } from './latex'

type Page = 'library' | 'collections' | 'settings'

export default function App() {
  const [page, setPage] = useState<Page>('library')
  const [initialIndex, setInitialIndex] = useState('')
  const openReaction = (index: string) => { setInitialIndex(index); setPage('library') }
  return <LatexProvider><div className="app-shell">
    <header className="app-header"><button className="brand" onClick={() => setPage('library')}><span>RA</span><strong>ReactionAtlas</strong></button><nav><button className={page === 'library' ? 'active' : ''} onClick={() => { setInitialIndex(''); setPage('library') }}>Reaction Library</button><button className={page === 'collections' ? 'active' : ''} onClick={() => setPage('collections')}>Collections</button><button className={page === 'settings' ? 'active' : ''} onClick={() => setPage('settings')}>Settings</button></nav><div className="local-badge"><i /> Local database</div></header>
    {page === 'library' ? <Library key={initialIndex} initialIndex={initialIndex} /> : page === 'collections' ? <Collections onOpenReaction={openReaction} /> : <Settings />}
  </div></LatexProvider>
}
