import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api'
import { HierarchicalDocumentEditor } from './HierarchicalDocumentEditor'
import { RichFormattedText } from './inlineMarkup'
import { parseStudyDocument, serializeStudyDocument, studyDocumentText } from './studyDocument'
import type { Drug, DrugImportInput, DrugImportResult, Reaction, StudyDocument } from './types'
import { useUnsavedChanges, useUnsavedEditor } from './UnsavedChanges'
import { reconcileSavedValue } from './unsavedChangesCore'

const sidebarPreferenceKey = 'reactionAtlas.drugs.sidebarCollapsed'
const chapterCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

export function DrugDatabase({ initialCode, onOpenReaction, onOpenStructure }: { initialCode?: string; onOpenReaction: (code: string) => void; onOpenStructure: (code: string) => void }) {
  const [drugs, setDrugs] = useState<Drug[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [chapter, setChapter] = useState('')
  const [drugFunction, setDrugFunction] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<DrugImportResult | null>(null)
  const [importing, setImporting] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return window.localStorage.getItem(sidebarPreferenceKey) === 'true' } catch { return false }
  })
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(() => new Set(['']))
  const knownChapters = useRef(new Set<string>())
  const fileInput = useRef<HTMLInputElement>(null)
  const { requestNavigation, hasDirty } = useUnsavedChanges()

  const load = async () => {
    try {
      const next = await api.drugs(); setDrugs(next)
      setSelectedId((current) => next.find((drug) => drug.display_code.toLowerCase() === initialCode?.toLowerCase())?.id ?? (next.some((drug) => drug.id === current) ? current : next[0]?.id ?? null))
      setError('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load drugs') }
  }
  useEffect(() => { void load() }, [])
  useEffect(() => {
    try { window.localStorage.setItem(sidebarPreferenceKey, String(sidebarCollapsed)) } catch { /* Storage may be unavailable. */ }
  }, [sidebarCollapsed])

  const chapters = useMemo(() => [...new Set(drugs.flatMap((drug) => drug.chapters))].sort(chapterCollator.compare), [drugs])
  const functions = useMemo(() => [...new Set(drugs.flatMap((drug) => drug.functions))].sort(), [drugs])
  useEffect(() => {
    const additions = chapters.filter((item) => !knownChapters.current.has(item))
    if (additions.length) setExpandedChapters((current) => new Set([...current, ...additions]))
    chapters.forEach((item) => knownChapters.current.add(item))
  }, [chapters])
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase()
    return drugs.filter((drug) => (!chapter || drug.chapters.includes(chapter))
      && (!drugFunction || drug.functions.includes(drugFunction))
      && (!term || [drug.display_code, drug.name, drug.slug, drug.description ?? '', ...drug.aliases, ...drug.chapters, ...drug.functions].join(' ').toLocaleLowerCase().includes(term)))
  }, [drugs, search, chapter, drugFunction])
  useEffect(() => {
    if (filtered.some((drug) => drug.id === selectedId)) return
    if (hasDirty()) return
    const next = filtered[0]?.id ?? null
    if (next !== selectedId) requestNavigation(() => setSelectedId(next))
  }, [filtered, selectedId, requestNavigation, hasDirty])
  const selected = drugs.find((drug) => drug.id === selectedId) ?? null
  const visibleChapters = chapter ? [chapter] : chapters
  const groups = visibleChapters.map((name) => ({ name, drugs: filtered.filter((drug) => drug.chapters.includes(name)) })).filter((group) => group.drugs.length)
  const uncategorized = chapter ? [] : filtered.filter((drug) => !drug.chapters.length)
  const searching = Boolean(search.trim())

  const importFile = async (file: File) => {
    setImporting(true); setError(''); setResult(null)
    try {
      const raw: unknown = JSON.parse(await file.text())
      const items = Array.isArray(raw) ? raw : raw && typeof raw === 'object' && 'drugs' in raw ? (raw as { drugs: unknown }).drugs : null
      if (!Array.isArray(items)) throw new Error('JSON must be an array or an object containing a drugs array')
      const next = await api.importDrugs(items as DrugImportInput[])
      setResult(next); await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Drug import failed') }
    finally { setImporting(false) }
  }
  const updateDrug = (next: Drug) => setDrugs((current) => current.map((item) => item.id === next.id ? next : item))
  const toggleChapter = (name: string) => setExpandedChapters((current) => {
    const next = new Set(current)
    if (next.has(name)) next.delete(name); else next.add(name)
    return next
  })

  return <div className="drug-page">
    <div className="toolbar drug-toolbar">
      <div className="search-wrap"><span>⌕</span><input placeholder="Search drug, alias, chapter, function…" value={search} onChange={(event) => setSearch(event.target.value)} />{search && <button className="clear" onClick={() => setSearch('')}>×</button>}</div>
      <select aria-label="Filter by chapter" value={chapter} onChange={(event) => setChapter(event.target.value)}><option value="">All chapters</option>{chapters.map((item) => <option key={item}>{item}</option>)}</select>
      <select aria-label="Filter by function" value={drugFunction} onChange={(event) => setDrugFunction(event.target.value)}><option value="">All functions</option>{functions.map((item) => <option key={item}>{item}</option>)}</select>
      <input ref={fileInput} hidden type="file" accept=".json,application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); event.target.value = '' }} />
      <button disabled={importing} onClick={() => fileInput.current?.click()}>{importing ? 'Importing…' : 'Import JSON'}</button>
    </div>
    {error && <div className="error page-error">{error}</div>}
    {result && <div className="drug-import-result"><strong>Import complete</strong><span>{result.created} created · {result.updated} updated · {result.images_uploaded} images uploaded · {result.reactions_linked} reactions linked · {result.structures_linked} structures linked</span>{result.warnings.map((warning, index) => <small key={`${index}-${warning}`}>{warning}</small>)}</div>}
    <div className={`drug-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className="drug-results" aria-hidden={sidebarCollapsed}><div className="panel-label">{filtered.length} {filtered.length === 1 ? 'drug' : 'drugs'}</div><div className="drug-tree result-list">
        {groups.map((group) => {
          const expanded = searching || expandedChapters.has(group.name)
          return <section className="drug-tree-chapter" key={group.name}><button type="button" className="drug-tree-heading" aria-expanded={expanded} onClick={() => toggleChapter(group.name)}><span aria-hidden="true">{expanded ? '⌄' : '›'}</span><strong>{group.name}</strong><small>{group.drugs.length}</small></button>{expanded && <div>{group.drugs.map((drug) => <DrugTreeItem drug={drug} selected={drug.id === selectedId} key={`${group.name}-${drug.id}`} onSelect={(id) => requestNavigation(() => setSelectedId(id))} />)}</div>}</section>
        })}
        {uncategorized.length > 0 && <section className="drug-tree-chapter"><button type="button" className="drug-tree-heading" aria-expanded={searching || expandedChapters.has('')} onClick={() => toggleChapter('')}><span aria-hidden="true">{searching || expandedChapters.has('') ? '⌄' : '›'}</span><strong>Uncategorized</strong><small>{uncategorized.length}</small></button>{(searching || expandedChapters.has('')) && <div>{uncategorized.map((drug) => <DrugTreeItem drug={drug} selected={drug.id === selectedId} key={`uncategorized-${drug.id}`} onSelect={(id) => requestNavigation(() => setSelectedId(id))} />)}</div>}</section>}
      </div></aside>
      <button type="button" className="library-sidebar-toggle drug-sidebar-toggle" title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!sidebarCollapsed} onClick={() => setSidebarCollapsed((current) => !current)}>{sidebarCollapsed ? '>>' : '<<'}</button>
      <main className="drug-detail">{selected ? <DrugDetail drug={selected} onChange={updateDrug} onOpenReaction={onOpenReaction} onOpenStructure={onOpenStructure} /> : <DrugEmpty hasDrugs={drugs.length > 0} />}</main>
    </div>
  </div>
}

function DrugTreeItem({ drug, selected, onSelect }: { drug: Drug; selected: boolean; onSelect: (id: number) => void }) {
  return <button className={`drug-result ${selected ? 'active' : ''}`} onClick={() => onSelect(drug.id)}>{drug.image_links[0] && <img src={drug.image_links[0].asset.content_url} alt="" />}<span><small className="record-code">{drug.display_code}</small><strong>{drug.name}</strong><em>{drug.functions.join(' · ') || 'No function assigned'}</em></span></button>
}

function DrugDetail({ drug, onChange, onOpenReaction, onOpenStructure }: { drug: Drug; onChange: (drug: Drug) => void; onOpenReaction: (code: string) => void; onOpenStructure: (code: string) => void }) {
  const [linking, setLinking] = useState(false)
  const [reactionSearch, setReactionSearch] = useState('')
  const [candidates, setCandidates] = useState<Reaction[]>([])
  const [mappingError, setMappingError] = useState('')
  const [busy, setBusy] = useState(false)
  const serverDocument = useMemo(() => parseStudyDocument(drug.description_document, { text: drug.description ?? '' }), [drug.id, drug.updated_at, drug.description_document, drug.description])
  const [descriptionBaseline, setDescriptionBaseline] = useState<StudyDocument>(serverDocument)
  const [descriptionDocument, setDescriptionDocument] = useState<StudyDocument>(serverDocument)
  const [descriptionSaving, setDescriptionSaving] = useState(false)
  const [descriptionError, setDescriptionError] = useState('')
  const descriptionEntityId = useRef(drug.id)
  const descriptionSaveInFlight = useRef<Promise<void> | null>(null)
  const descriptionDirty = serializeStudyDocument(descriptionDocument) !== serializeStudyDocument(descriptionBaseline)
  useEffect(() => { setLinking(false); setReactionSearch(''); setCandidates([]); setMappingError('') }, [drug.id])
  useEffect(() => {
    if (descriptionEntityId.current !== drug.id) { descriptionEntityId.current = drug.id; setDescriptionBaseline(serverDocument); setDescriptionDocument(serverDocument); setDescriptionError(''); return }
    if (!descriptionDirty && !descriptionSaving) { setDescriptionBaseline(serverDocument); setDescriptionDocument(serverDocument) }
  }, [drug.id, drug.updated_at])
  useEffect(() => {
    if (!linking) return
    const timer = window.setTimeout(async () => {
      try { setCandidates(await api.reactions(reactionSearch)); setMappingError('') }
      catch (cause) { setMappingError(cause instanceof Error ? cause.message : 'Could not search reactions') }
    }, 180)
    return () => clearTimeout(timer)
  }, [linking, reactionSearch])
  const linkedIds = new Set(drug.reaction_links.map((link) => link.reaction.id))
  const available = candidates.filter((reaction) => !linkedIds.has(reaction.id)).slice(0, 12)
  const mutate = async (action: () => Promise<Drug>) => {
    setBusy(true); setMappingError('')
    try { onChange(await action()) }
    catch (cause) { setMappingError(cause instanceof Error ? cause.message : 'Could not update reaction links') }
    finally { setBusy(false) }
  }
  const move = (index: number, amount: number) => {
    const target = index + amount
    if (target < 0 || target >= drug.reaction_links.length) return
    const ids = drug.reaction_links.map((link) => link.reaction.id); [ids[index], ids[target]] = [ids[target], ids[index]]
    void mutate(() => api.reorderDrugReactions(drug.id, ids))
  }
  const saveDescription = () => {
    if (descriptionSaveInFlight.current) return descriptionSaveInFlight.current
    const captured = descriptionDocument; const capturedSerialized = serializeStudyDocument(captured)
    const operation = (async () => {
      setDescriptionSaving(true); setDescriptionError('')
      try {
        const saved = await api.updateDrugDescription(drug.id, studyDocumentText(captured) || null, capturedSerialized)
        const savedBaseline = parseStudyDocument(saved.description_document, { text: saved.description ?? '' })
        setDescriptionBaseline(savedBaseline)
        setDescriptionDocument((current) => reconcileSavedValue(current, capturedSerialized, savedBaseline, serializeStudyDocument))
        onChange(saved)
      } catch (cause) { const message = cause instanceof Error ? cause.message : 'Could not save description'; setDescriptionError(message); throw cause instanceof Error ? cause : new Error(message) }
      finally { setDescriptionSaving(false); descriptionSaveInFlight.current = null }
    })()
    descriptionSaveInFlight.current = operation
    return operation
  }
  const discardDescription = () => { setDescriptionDocument(descriptionBaseline); setDescriptionError('') }
  useUnsavedEditor({ id: `drug:${drug.id}:description`, label: `${drug.display_code} description`, dirty: descriptionDirty, saving: descriptionSaving, save: saveDescription, discard: discardDescription })
  return <article className="drug-record"><span className="eyebrow">Drug record · {drug.display_code}</span><h1>{drug.name}</h1>{drug.aliases.length > 0 && <p className="drug-aliases">Also known as {drug.aliases.join(', ')}</p>}
    <div className="drug-tags">{drug.chapters.map((item) => <span className="chapter" key={`chapter-${item}`}>{item}</span>)}{drug.functions.map((item) => <span key={`function-${item}`}>{item}</span>)}</div>
    <section className="drug-description-editor"><h2>Description</h2><HierarchicalDocumentEditor placeholder="Add a drug description…" document={descriptionDocument} onChange={setDescriptionDocument} />{descriptionError && <div className="error mapping-error">{descriptionError}</div>}{descriptionDirty && <div className="inline-save-bar drug-description-save"><span>Unsaved description changes</span><button type="button" className="secondary" disabled={descriptionSaving} onClick={discardDescription}>Discard</button><button type="button" disabled={descriptionSaving} onClick={() => void saveDescription().catch(() => undefined)}>{descriptionSaving ? 'Saving…' : 'Save description'}</button></div>}</section>
    {drug.image_links.length > 0 && <section><h2>Images</h2><div className="drug-gallery">{drug.image_links.map((image) => <figure key={image.id}><img src={image.asset.content_url} alt={`${drug.name} — ${image.asset.original_filename}`} /><figcaption>{image.asset.original_filename}</figcaption></figure>)}</div></section>}
    <section><div className="section-heading mapping-heading"><h2>Synthesis reactions</h2><button type="button" className="secondary" onClick={() => setLinking((current) => !current)}>{linking ? 'Close' : '+ Link reaction'}</button></div>
      {linking && <div className="reaction-link-picker"><input autoFocus aria-label="Search reactions to link" placeholder="Search Rxn code, name, or class…" value={reactionSearch} onChange={(event) => setReactionSearch(event.target.value)} />{available.length ? <div className="reaction-link-results">{available.map((reaction) => <button type="button" disabled={busy} key={reaction.id} onClick={() => void mutate(() => api.linkDrugReaction(drug.id, reaction.id))}><small>{reaction.display_code}</small><span><strong><RichFormattedText text={reaction.name} html={reaction.rich_text.name} /></strong><em><RichFormattedText text={reaction.reaction_class || 'Unclassified'} html={reaction.rich_text.reaction_class} /></em></span><b>Link</b></button>)}</div> : <p className="muted compact">No unlinked reactions match.</p>}</div>}
      {mappingError && <div className="error mapping-error">{mappingError}</div>}
      {drug.reaction_links.length ? <div className="drug-reactions mapped-reactions">{drug.reaction_links.map(({ reaction }, index) => <div className="drug-reaction-card" key={reaction.id}><button type="button" className="reaction-card-open" onClick={() => onOpenReaction(reaction.display_code)}>{reaction.image && <img src={reaction.image.content_url} alt="" />}<span><small>{reaction.display_code}</small><strong><RichFormattedText text={reaction.name} html={reaction.rich_text.name} /></strong><em><RichFormattedText text={reaction.reaction_class || 'Unclassified'} html={reaction.rich_text.reaction_class} /></em></span></button><div className="mapping-controls"><button type="button" aria-label={`Move ${reaction.display_code} up`} disabled={busy || index === 0} onClick={() => move(index, -1)}>↑</button><button type="button" aria-label={`Move ${reaction.display_code} down`} disabled={busy || index === drug.reaction_links.length - 1} onClick={() => move(index, 1)}>↓</button><button type="button" className="unlink" disabled={busy} onClick={() => void mutate(() => api.unlinkDrugReaction(drug.id, reaction.id))}>Unlink</button></div></div>)}</div> : <p className="muted">No Rxn Library reactions are linked yet.</p>}
    </section>
    <section><h2>Structures</h2>{drug.structure_links.length ? <div className="entity-links">{drug.structure_links.map(({ structure }) => <button key={structure.id} onClick={() => onOpenStructure(structure.display_code)}>{structure.image && <img src={structure.image.content_url} alt="" />}<span><small>{structure.display_code}</small><strong>{structure.name}</strong><em>{structure.categories.join(' · ') || 'Uncategorized'}</em></span><b>Open →</b></button>)}</div> : <p className="muted">No structures are linked yet.</p>}</section>
    <footer>Image source directory: <code>{drug.image_directory}</code></footer>
  </article>
}

function DrugEmpty({ hasDrugs }: { hasDrugs: boolean }) {
  if (hasDrugs) return <div className="drug-empty"><span>⌕</span><h2>No matching drugs</h2><p>Clear the search or choose a different chapter or function.</p></div>
  return <div className="drug-empty"><span>DB</span><h2>Drug Database is ready</h2><p>No drugs have been added. Put each drug's images in its own folder under <code>drug-images/</code>, then import a JSON array.</p><pre>{`[
  {
    "name": "Example drug",
    "number": 1,
    "slug": "example-drug",
    "chapters": ["Chapter name"],
    "functions": ["Function"],
    "image_directory": "drug-images/example-drug",
    "reaction_codes": ["Rxn1", "Rxn*2"],
    "structure_codes": ["Str1"]
  }
]`}</pre></div>
}
