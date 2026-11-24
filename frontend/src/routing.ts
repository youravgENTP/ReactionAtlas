export type AppPage = 'library' | 'collections' | 'drugs' | 'structures' | 'settings' | 'questions'

export interface AppRoute { page: AppPage; code?: string; collectionId?: number; field?: string; item?: string }

export function parseAppRoute(pathname: string, search = ''): AppRoute {
  const path = pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/'
  const query = new URLSearchParams(search)
  const deep = { ...(query.get('field') ? { field: query.get('field')! } : {}), ...(query.get('item') ? { item: query.get('item')! } : {}) }
  const record = path.match(/^\/(reactions|drugs|structures)\/([^/]+)$/)
  if (record) return { page: record[1] === 'reactions' ? 'library' : record[1] as 'drugs' | 'structures', code: decodeURIComponent(record[2]), ...deep }
  const collection = path.match(/^\/collections\/(\d+)$/)
  if (collection) return { page: 'collections', collectionId: Number(collection[1]), ...deep }
  if (path === '/' || path === '/reactions') return { page: 'library', ...deep }
  if (path === '/drugs') return { page: 'drugs', ...deep }
  if (path === '/structures') return { page: 'structures', ...deep }
  if (path === '/collections') return { page: 'collections', ...deep }
  if (path === '/settings') return { page: 'settings' }
  if (path === '/questions') return { page: 'questions' }
  return { page: 'library' }
}

export function routeHref(route: AppRoute) {
  const base = route.page === 'library' ? route.code ? `/reactions/${encodeURIComponent(route.code)}` : '/reactions'
    : route.page === 'drugs' ? route.code ? `/drugs/${encodeURIComponent(route.code)}` : '/drugs'
      : route.page === 'structures' ? route.code ? `/structures/${encodeURIComponent(route.code)}` : '/structures'
        : route.page === 'collections' ? route.collectionId ? `/collections/${route.collectionId}` : '/collections'
          : `/${route.page}`
  const query = new URLSearchParams()
  if (route.field) query.set('field', route.field)
  if (route.item) query.set('item', route.item)
  return `${base}${query.size ? `?${query}` : ''}`
}

export function isAppHref(value: string) {
  try {
    const url = new URL(value, 'http://reactionatlas.local')
    return url.origin === 'http://reactionatlas.local' && (/^\/(reactions|drugs|structures|collections)(\/|$)/.test(url.pathname) || ['/settings', '/questions'].includes(url.pathname))
  } catch { return false }
}
