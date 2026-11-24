import { useRef, useState, type KeyboardEvent, type MouseEvent, type RefObject } from 'react'
import { api } from './api'
import { flattenStudyItems } from './hierarchy'
import type { Collection, Drug, Reaction, Structure, StudyItem } from './types'

export type InternalLinkType = 'reaction' | 'drug' | 'structure' | 'collection' | 'item'
export interface InternalLinkTarget { type: InternalLinkType; label: string; detail: string; href: string; search: string }

function documentItems(source?: string | null) {
  if (!source) return [] as StudyItem[]
  try {
    const parsed = JSON.parse(source) as { blocks?: { type: string; items?: StudyItem[] }[] }
    return parsed.blocks?.flatMap((block) => block.type === 'hierarchy' ? flattenStudyItems(block.items ?? []) : []) ?? []
  } catch { return [] }
}

export function buildInternalLinkTargets(reactions: Reaction[], drugs: Drug[], structures: Structure[], collections: Collection[]) {
  const targets: InternalLinkTarget[] = []
  for (const reaction of reactions) {
    const root = `/reactions/${encodeURIComponent(reaction.display_code)}`
    targets.push({ type: 'reaction', label: `${reaction.display_code} — ${reaction.name}`, detail: 'Reaction', href: root, search: `${reaction.display_code} ${reaction.name} ${reaction.reaction_class ?? ''}` })
    for (const [field, source] of [['summary', reaction.rich_text.summary_document], ['notes', reaction.rich_text.notes_document]] as const) for (const item of documentItems(source)) targets.push({ type: 'item', label: item.text || 'Untitled hierarchy item', detail: `${reaction.display_code} · ${field}`, href: `${root}?field=${field}&item=${item.id}`, search: `${reaction.display_code} ${reaction.name} ${field} ${item.text}` })
  }
  for (const drug of drugs) {
    const root = `/drugs/${encodeURIComponent(drug.display_code)}`
    targets.push({ type: 'drug', label: `${drug.display_code} — ${drug.name}`, detail: 'Drug', href: root, search: `${drug.display_code} ${drug.name} ${drug.aliases.join(' ')}` })
    for (const item of documentItems(drug.description_document)) targets.push({ type: 'item', label: item.text || 'Untitled hierarchy item', detail: `${drug.display_code} · description`, href: `${root}?field=description&item=${item.id}`, search: `${drug.display_code} ${drug.name} description ${item.text}` })
  }
  for (const structure of structures) targets.push({ type: 'structure', label: `${structure.display_code} — ${structure.name}`, detail: 'Structure', href: `/structures/${encodeURIComponent(structure.display_code)}`, search: `${structure.display_code} ${structure.name} ${structure.aliases.join(' ')}` })
  for (const collection of collections) {
    const root = `/collections/${collection.id}`
    targets.push({ type: 'collection', label: collection.title, detail: `Collection ${collection.id}`, href: root, search: `${collection.id} ${collection.title} ${collection.description ?? ''}` })
    for (const item of documentItems(collection.markdown_content)) targets.push({ type: 'item', label: item.text || 'Untitled hierarchy item', detail: `${collection.title} · hierarchy`, href: `${root}?item=${item.id}`, search: `${collection.title} ${item.text}` })
  }
  return targets
}

export function useInternalLinkPicker(editor: RefObject<HTMLElement | null>, commit: () => void) {
  const range = useRef<Range | null>(null)
  const anchor = useRef<HTMLAnchorElement | null>(null)
  const [open, setOpen] = useState(false)
  const [targets, setTargets] = useState<InternalLinkTarget[]>([])
  const [search, setSearch] = useState('')
  const [type, setType] = useState<'all' | InternalLinkType>('all')
  const [loading, setLoading] = useState(false)
  const openPicker = (event: KeyboardEvent<HTMLElement>) => {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return false
    event.preventDefault()
    const selection = window.getSelection()
    if (!editor.current || !selection?.rangeCount || !editor.current.contains(selection.anchorNode)) return true
    range.current = selection.getRangeAt(0).cloneRange()
    anchor.current = (selection.anchorNode instanceof Element ? selection.anchorNode : selection.anchorNode?.parentElement)?.closest<HTMLAnchorElement>('a') ?? null
    setSearch(anchor.current?.textContent ?? selection.toString()); setOpen(true); setLoading(true)
    void Promise.all([api.reactions(), api.drugs(), api.structures(), api.collections()]).then(([reactions, drugs, structures, collections]) => setTargets(buildInternalLinkTargets(reactions, drugs, structures, collections))).finally(() => setLoading(false))
    return true
  }
  const apply = (target: InternalLinkTarget) => {
    if (anchor.current) anchor.current.setAttribute('href', target.href)
    else if (range.current && editor.current?.contains(range.current.commonAncestorContainer)) {
      const link = document.createElement('a'); link.href = target.href
      const content = range.current.extractContents()
      if (content.textContent) link.append(content); else link.textContent = target.label
      range.current.insertNode(link); range.current.setStartAfter(link); range.current.collapse(true)
    }
    setOpen(false); commit(); editor.current?.focus()
  }
  const remove = () => {
    const current = anchor.current
    if (current) current.replaceWith(...current.childNodes)
    setOpen(false); commit(); editor.current?.focus()
  }
  const handleClick = (event: MouseEvent<HTMLElement>) => {
    if (!(event.target as Element).closest('a') || event.metaKey || event.ctrlKey) return
    event.preventDefault()
  }
  const term = search.trim().toLocaleLowerCase()
  const visible = targets.filter((target) => (type === 'all' || target.type === type) && (!term || target.search.toLocaleLowerCase().includes(term))).slice(0, 30)
  const picker = open ? <div className="internal-link-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}><section className="internal-link-picker" role="dialog" aria-modal="true" aria-label="Insert internal link"><h3>{anchor.current ? 'Edit internal link' : 'Insert internal link'}</h3><div className="internal-link-filters"><select aria-label="Link target type" value={type} onChange={(event) => setType(event.target.value as typeof type)}><option value="all">All targets</option><option value="reaction">Reactions</option><option value="drug">Drugs</option><option value="structure">Structures</option><option value="collection">Collections</option><option value="item">Hierarchy items</option></select><input autoFocus placeholder="Search name or stable code…" value={search} onChange={(event) => setSearch(event.target.value)} /></div><div className="internal-link-results">{loading ? <p>Loading targets…</p> : visible.map((target) => <button type="button" key={`${target.type}-${target.href}`} onClick={() => apply(target)}><strong>{target.label}</strong><small>{target.detail}</small></button>)}</div><footer><button type="button" className="secondary" onClick={() => setOpen(false)}>Cancel</button>{anchor.current && <button type="button" className="danger ghost" onClick={remove}>Remove link</button>}</footer></section></div> : null
  return { openPicker, handleClick, picker }
}
