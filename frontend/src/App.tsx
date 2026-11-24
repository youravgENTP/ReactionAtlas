import { useCallback, useEffect, useRef, useState } from 'react'
import { Collections } from './Collections'
import { Library } from './Library'
import { Settings } from './Settings'
import { DrugDatabase } from './DrugDatabase'
import { StructureDatabase } from './StructureDatabase'
import { LatexProvider } from './latex'
import { UnsavedChangesProvider, useUnsavedChanges } from './UnsavedChanges'

type Page = 'library' | 'collections' | 'drugs' | 'structures' | 'settings'
interface Destination { page: Page; initialIndex: string; initialDrugCode: string; initialStructureCode: string }
interface HistoryDestination extends Destination { reactionAtlas: true; index: number }

const initialDestination: Destination = { page: 'library', initialIndex: '', initialDrugCode: '', initialStructureCode: '' }

export default function App() {
  return <LatexProvider><UnsavedChangesProvider><AppContent /></UnsavedChangesProvider></LatexProvider>
}

function AppContent() {
  const [destination, setDestination] = useState<Destination>(initialDestination)
  const { requestNavigation, hasDirty } = useUnsavedChanges()
  const destinationRef = useRef(destination)
  const historyIndex = useRef(0)
  const allowNextPop = useRef(false)
  destinationRef.current = destination

  const apply = useCallback((next: Destination) => setDestination(next), [])
  const navigate = useCallback((next: Destination) => requestNavigation(() => {
    const index = historyIndex.current + 1; historyIndex.current = index
    window.history.pushState({ ...next, reactionAtlas: true, index } satisfies HistoryDestination, '')
    apply(next)
  }), [apply, requestNavigation])

  useEffect(() => {
    window.history.replaceState({ ...destinationRef.current, reactionAtlas: true, index: historyIndex.current } satisfies HistoryDestination, '')
    const popState = (event: PopStateEvent) => {
      const target = event.state as HistoryDestination | null
      if (!target?.reactionAtlas) return
      if (allowNextPop.current) { allowNextPop.current = false; historyIndex.current = target.index; apply(target); return }
      if (!hasDirty()) { historyIndex.current = target.index; apply(target); return }
      const current = destinationRef.current
      window.history.pushState({ ...current, reactionAtlas: true, index: historyIndex.current } satisfies HistoryDestination, '')
      requestNavigation(() => { allowNextPop.current = true; window.history.back() })
    }
    window.addEventListener('popstate', popState)
    return () => window.removeEventListener('popstate', popState)
  }, [apply, hasDirty, requestNavigation])

  const openPage = (page: Page) => navigate({ page, initialIndex: '', initialDrugCode: '', initialStructureCode: '' })
  const openReaction = (initialIndex: string) => navigate({ page: 'library', initialIndex, initialDrugCode: '', initialStructureCode: '' })
  const openDrug = (initialDrugCode: string) => navigate({ page: 'drugs', initialIndex: '', initialDrugCode, initialStructureCode: '' })
  const openStructure = (initialStructureCode: string) => navigate({ page: 'structures', initialIndex: '', initialDrugCode: '', initialStructureCode })
  const { page, initialIndex, initialDrugCode, initialStructureCode } = destination

  return <div className="app-shell">
    <header className="app-header"><button className="brand" onClick={() => openPage('library')}><span>RA</span><strong>ReactionAtlas</strong></button><nav><button className={page === 'library' ? 'active' : ''} onClick={() => openPage('library')}>Reaction Library</button><button className={page === 'collections' ? 'active' : ''} onClick={() => openPage('collections')}>Collections</button><button className={page === 'drugs' ? 'active' : ''} onClick={() => openPage('drugs')}>Drug Database</button><button className={page === 'structures' ? 'active' : ''} onClick={() => openPage('structures')}>Structure Database</button><button className={page === 'settings' ? 'active' : ''} onClick={() => openPage('settings')}>Settings</button></nav><div className="local-badge"><i /> Local database</div></header>
    {page === 'library' ? <Library initialIndex={initialIndex} onOpenDrug={openDrug} /> : page === 'collections' ? <Collections onOpenReaction={openReaction} /> : page === 'drugs' ? <DrugDatabase initialCode={initialDrugCode} onOpenReaction={openReaction} onOpenStructure={openStructure} /> : page === 'structures' ? <StructureDatabase initialCode={initialStructureCode} onOpenReaction={openReaction} onOpenDrug={openDrug} /> : <Settings />}
  </div>
}
