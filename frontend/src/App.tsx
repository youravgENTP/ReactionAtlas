import { useState } from 'react'
import { Collections } from './Collections'
import { Library } from './Library'
import { Settings } from './Settings'
import { DrugDatabase } from './DrugDatabase'
import { StructureDatabase } from './StructureDatabase'
import { LatexProvider } from './latex'

type Page = 'library' | 'collections' | 'drugs' | 'structures' | 'settings'

export default function App() {
  const [page, setPage] = useState<Page>('library')
  const [initialIndex, setInitialIndex] = useState('')
  const [initialDrugCode, setInitialDrugCode] = useState('')
  const [initialStructureCode, setInitialStructureCode] = useState('')
  const openReaction = (index: string) => { setInitialIndex(index); setPage('library') }
  const openDrug = (code: string) => { setInitialDrugCode(code); setPage('drugs') }
  const openStructure = (code: string) => { setInitialStructureCode(code); setPage('structures') }
  return <LatexProvider><div className="app-shell">
    <header className="app-header"><button className="brand" onClick={() => setPage('library')}><span>RA</span><strong>ReactionAtlas</strong></button><nav><button className={page === 'library' ? 'active' : ''} onClick={() => { setInitialIndex(''); setPage('library') }}>Reaction Library</button><button className={page === 'collections' ? 'active' : ''} onClick={() => setPage('collections')}>Collections</button><button className={page === 'drugs' ? 'active' : ''} onClick={() => { setInitialDrugCode(''); setPage('drugs') }}>Drug Database</button><button className={page === 'structures' ? 'active' : ''} onClick={() => { setInitialStructureCode(''); setPage('structures') }}>Structure Database</button><button className={page === 'settings' ? 'active' : ''} onClick={() => setPage('settings')}>Settings</button></nav><div className="local-badge"><i /> Local database</div></header>
    {page === 'library' ? <Library key={initialIndex} initialIndex={initialIndex} /> : page === 'collections' ? <Collections onOpenReaction={openReaction} /> : page === 'drugs' ? <DrugDatabase key={initialDrugCode} initialCode={initialDrugCode} onOpenReaction={openReaction} onOpenStructure={openStructure} /> : page === 'structures' ? <StructureDatabase key={initialStructureCode} initialCode={initialStructureCode} onOpenReaction={openReaction} onOpenDrug={openDrug} /> : <Settings />}
  </div></LatexProvider>
}
