import { useCallback, useEffect, useRef, useState } from 'react'
import { Collections } from './Collections'
import { Library } from './Library'
import { Settings } from './Settings'
import { Questions } from './Questions'
import { DrugDatabase } from './DrugDatabase'
import { StructureDatabase } from './StructureDatabase'
import { LatexProvider } from './latex'
import { UnsavedChangesProvider, useUnsavedChanges } from './UnsavedChanges'
import { parseAppRoute, routeHref, type AppPage, type AppRoute } from './routing'

export default function App() {
  return <LatexProvider><UnsavedChangesProvider><AppContent /></UnsavedChangesProvider></LatexProvider>
}

function AppContent() {
  const [route, setRoute] = useState<AppRoute>(() => parseAppRoute(window.location.pathname, window.location.search))
  const { requestNavigation, hasDirty } = useUnsavedChanges()
  const routeRef = useRef(route)
  const allowNextPop = useRef(false)
  routeRef.current = route

  const apply = useCallback((next: AppRoute, mode: 'push' | 'replace' = 'push') => {
    const href = routeHref(next)
    if (mode === 'replace') window.history.replaceState({ reactionAtlas: true }, '', href)
    else if (`${window.location.pathname}${window.location.search}` !== href) window.history.pushState({ reactionAtlas: true }, '', href)
    setRoute(next)
  }, [])
  const navigate = useCallback((next: AppRoute) => requestNavigation(() => apply(next)), [apply, requestNavigation])
  const recordRoute = useCallback((next: AppRoute) => apply(next), [apply])

  useEffect(() => {
    window.history.replaceState({ reactionAtlas: true }, '', routeHref(routeRef.current))
    const popState = () => {
      const target = parseAppRoute(window.location.pathname, window.location.search)
      if (allowNextPop.current) { allowNextPop.current = false; setRoute(target); return }
      if (!hasDirty()) { setRoute(target); return }
      window.history.pushState({ reactionAtlas: true }, '', routeHref(routeRef.current))
      requestNavigation(() => { allowNextPop.current = true; window.history.back() })
    }
    const internalNavigate = (event: Event) => { const url = new URL((event as CustomEvent<string>).detail, window.location.origin); apply(parseAppRoute(url.pathname, url.search)) }
    window.addEventListener('popstate', popState)
    window.addEventListener('reactionatlas:navigate', internalNavigate)
    return () => { window.removeEventListener('popstate', popState); window.removeEventListener('reactionatlas:navigate', internalNavigate) }
  }, [apply, hasDirty, requestNavigation])

  const openPage = (page: AppPage) => navigate({ page })
  const openReaction = (code: string) => navigate({ page: 'library', code })
  const openDrug = (code: string) => navigate({ page: 'drugs', code })
  const openStructure = (code: string) => navigate({ page: 'structures', code })
  const { page } = route

  return <div className="app-shell">
    <header className="app-header"><button className="brand" onClick={() => openPage('library')}><span>RA</span><strong>ReactionAtlas</strong></button><nav><button className={page === 'library' ? 'active' : ''} onClick={() => openPage('library')}>Reaction Library</button><button className={page === 'collections' ? 'active' : ''} onClick={() => openPage('collections')}>Collections</button><button className={page === 'drugs' ? 'active' : ''} onClick={() => openPage('drugs')}>Drug Database</button><button className={page === 'structures' ? 'active' : ''} onClick={() => openPage('structures')}>Structure Database</button><button className={page === 'questions' ? 'active' : ''} onClick={() => openPage('questions')}>Questions</button><button className={page === 'settings' ? 'active' : ''} onClick={() => openPage('settings')}>Settings</button></nav><div className="local-badge"><i /> Local database</div></header>
    {page === 'library' ? <Library initialIndex={route.code} deepLink={route.item ? { field: route.field, item: route.item } : undefined} onRouteReaction={(code) => recordRoute({ page: 'library', code })} onOpenDrug={openDrug} />
      : page === 'collections' ? <Collections initialCollectionId={route.collectionId} targetItemId={route.item} onRouteCollection={(collectionId) => recordRoute({ page: 'collections', collectionId })} onOpenReaction={openReaction} />
        : page === 'drugs' ? <DrugDatabase initialCode={route.code} targetItemId={route.field === 'description' ? route.item : undefined} onRouteDrug={(code) => recordRoute({ page: 'drugs', code })} onOpenReaction={openReaction} onOpenStructure={openStructure} />
          : page === 'structures' ? <StructureDatabase initialCode={route.code} onRouteStructure={(code) => recordRoute({ page: 'structures', code })} onOpenReaction={openReaction} onOpenDrug={openDrug} />
            : page === 'questions' ? <Questions /> : <Settings />}
  </div>
}
