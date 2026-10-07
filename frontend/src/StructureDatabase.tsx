import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api'
import { RichFormattedText } from './inlineMarkup'
import type { Structure, StructureImportInput, StructureImportResult } from './types'

export function StructureDatabase({ initialCode, onOpenReaction, onOpenDrug }: {
  initialCode?: string
  onOpenReaction: (code: string) => void
  onOpenDrug: (code: string) => void
}) {
  const [structures, setStructures] = useState<Structure[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<StructureImportResult | null>(null)
  const [importing, setImporting] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const load = async () => {
    try {
      const next = await api.structures(); setStructures(next)
      setSelectedId((current) => next.find((structure) => structure.display_code.toLowerCase() === initialCode?.toLowerCase())?.id ?? (next.some((structure) => structure.id === current) ? current : next[0]?.id ?? null))
      setError('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load structures') }
  }
  useEffect(() => { void load() }, [])

  const categories = useMemo(() => [...new Set(structures.flatMap((structure) => structure.categories))].sort(), [structures])
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase()
    return structures.filter((structure) => (!category || structure.categories.includes(category))
      && (!term || [structure.display_code, structure.name, structure.slug, structure.description ?? '', ...structure.aliases, ...structure.categories].join(' ').toLocaleLowerCase().includes(term)))
  }, [structures, search, category])
  useEffect(() => { setSelectedId((current) => filtered.some((structure) => structure.id === current) ? current : filtered[0]?.id ?? null) }, [filtered])
  const selected = structures.find((structure) => structure.id === selectedId) ?? null

  const importFile = async (file: File) => {
    setImporting(true); setError(''); setResult(null)
    try {
      const raw: unknown = JSON.parse(await file.text())
      const items = Array.isArray(raw) ? raw : raw && typeof raw === 'object' && 'structures' in raw ? (raw as { structures: unknown }).structures : null
      if (!Array.isArray(items)) throw new Error('JSON must be an array or an object containing a structures array')
      const next = await api.importStructures(items as StructureImportInput[])
      setResult(next); await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Structure import failed') }
    finally { setImporting(false) }
  }

  return <div className="drug-page">
    <div className="toolbar drug-toolbar">
      <div className="search-wrap"><span>⌕</span><input placeholder="Search Str index, structure, alias, category…" value={search} onChange={(event) => setSearch(event.target.value)} />{search && <button className="clear" onClick={() => setSearch('')}>×</button>}</div>
      <select aria-label="Filter by category" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All categories</option>{categories.map((item) => <option key={item}>{item}</option>)}</select>
      <input ref={fileInput} hidden type="file" accept=".json,application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); event.target.value = '' }} />
      <button disabled={importing} onClick={() => fileInput.current?.click()}>{importing ? 'Importing…' : 'Import JSON'}</button>
    </div>
    {error && <div className="error page-error">{error}</div>}
    {result && <div className="drug-import-result"><strong>Import complete</strong><span>{result.created} created · {result.updated} updated · {result.images_uploaded} images uploaded · {result.reactions_linked} reactions linked · {result.drugs_linked} drugs linked</span>{result.warnings.map((warning, index) => <small key={`${index}-${warning}`}>{warning}</small>)}</div>}
    <div className="drug-layout">
      <aside className="drug-results"><div className="panel-label">{filtered.length} {filtered.length === 1 ? 'structure' : 'structures'}</div><div className="result-list">{filtered.map((structure) => <button className={`drug-result ${structure.id === selectedId ? 'active' : ''}`} key={structure.id} onClick={() => setSelectedId(structure.id)}>{structure.image_links[0] && <img src={structure.image_links[0].asset.content_url} alt="" />}<span><small className="record-code">{structure.display_code}</small><strong>{structure.name}</strong><em>{structure.categories.join(' · ') || 'Uncategorized'}</em></span></button>)}</div></aside>
      <main className="drug-detail">{selected ? <StructureDetail structure={selected} onOpenReaction={onOpenReaction} onOpenDrug={onOpenDrug} /> : <StructureEmpty hasStructures={structures.length > 0} />}</main>
    </div>
  </div>
}

function StructureDetail({ structure, onOpenReaction, onOpenDrug }: {
  structure: Structure
  onOpenReaction: (code: string) => void
  onOpenDrug: (code: string) => void
}) {
  return <article className="drug-record"><span className="eyebrow">Structure record · {structure.display_code}</span><h1>{structure.name}</h1>{structure.aliases.length > 0 && <p className="drug-aliases">Also known as {structure.aliases.join(', ')}</p>}
    <div className="drug-tags">{structure.categories.map((item) => <span className="chapter" key={item}>{item}</span>)}</div>
    {structure.description && <p className="drug-description">{structure.description}</p>}
    {structure.image_links.length > 0 && <section><h2>Images</h2><div className="drug-gallery">{structure.image_links.map((image) => <figure key={image.id}><img src={image.asset.content_url} alt={`${structure.name} — ${image.asset.original_filename}`} /><figcaption>{image.asset.original_filename}</figcaption></figure>)}</div></section>}
    <section><h2>Synthesis reactions</h2>{structure.reaction_links.length ? <div className="drug-reactions">{structure.reaction_links.map(({ reaction }) => <button key={reaction.id} onClick={() => onOpenReaction(reaction.display_code)}>{reaction.image && <img src={reaction.image.content_url} alt="" />}<span><small>{reaction.display_code}</small><strong><RichFormattedText text={reaction.name} html={reaction.rich_text.name} /></strong><em><RichFormattedText text={reaction.reaction_class || 'Unclassified'} html={reaction.rich_text.reaction_class} /></em></span><b>Open →</b></button>)}</div> : <p className="muted">No Rxn Library reactions are linked yet.</p>}</section>
    <section><h2>Appears in drugs</h2>{structure.drug_links.length ? <div className="entity-links">{structure.drug_links.map(({ drug }) => <button key={drug.id} onClick={() => onOpenDrug(drug.display_code)}>{drug.image && <img src={drug.image.content_url} alt="" />}<span><small>{drug.display_code}</small><strong>{drug.name}</strong><em>{[...drug.chapters, ...drug.functions].join(' · ') || 'Uncategorized'}</em></span><b>Open →</b></button>)}</div> : <p className="muted">No drugs are linked yet.</p>}</section>
    <footer>Image source directory: <code>{structure.image_directory}</code></footer>
  </article>
}

function StructureEmpty({ hasStructures }: { hasStructures: boolean }) {
  if (hasStructures) return <div className="drug-empty"><span>⌕</span><h2>No matching structures</h2><p>Clear the search or choose a different category.</p></div>
  return <div className="drug-empty"><span>Str</span><h2>Structure Database is ready</h2><p>Put each structure's images in its own folder under <code>structure-images/</code>, then import a JSON array.</p><pre>{`{
  "structures": [
    {
      "number": 1,
      "name": "Imidazole",
      "slug": "imidazole",
      "categories": ["Heterocycle"],
      "image_directory": "structure-images/imidazole",
      "reaction_codes": ["Rxn4"],
      "drug_codes": ["Drug3"]
    }
  ]
}`}</pre></div>
}
