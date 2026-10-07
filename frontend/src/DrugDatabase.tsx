import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api'
import { RichFormattedText } from './inlineMarkup'
import type { Drug, DrugImportInput, DrugImportResult } from './types'

export function DrugDatabase({ initialCode, onOpenReaction, onOpenStructure }: { initialCode?: string; onOpenReaction: (code: string) => void; onOpenStructure: (code: string) => void }) {
  const [drugs, setDrugs] = useState<Drug[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [chapter, setChapter] = useState('')
  const [drugFunction, setDrugFunction] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<DrugImportResult | null>(null)
  const [importing, setImporting] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const load = async () => {
    try {
      const next = await api.drugs(); setDrugs(next)
      setSelectedId((current) => next.find((drug) => drug.display_code.toLowerCase() === initialCode?.toLowerCase())?.id ?? (next.some((drug) => drug.id === current) ? current : next[0]?.id ?? null))
      setError('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load drugs') }
  }
  useEffect(() => { void load() }, [])

  const chapters = useMemo(() => [...new Set(drugs.flatMap((drug) => drug.chapters))].sort(), [drugs])
  const functions = useMemo(() => [...new Set(drugs.flatMap((drug) => drug.functions))].sort(), [drugs])
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase()
    return drugs.filter((drug) => (!chapter || drug.chapters.includes(chapter))
      && (!drugFunction || drug.functions.includes(drugFunction))
      && (!term || [drug.display_code, drug.name, drug.slug, drug.description ?? '', ...drug.aliases, ...drug.chapters, ...drug.functions].join(' ').toLocaleLowerCase().includes(term)))
  }, [drugs, search, chapter, drugFunction])
  useEffect(() => { setSelectedId((current) => filtered.some((drug) => drug.id === current) ? current : filtered[0]?.id ?? null) }, [filtered])
  const selected = drugs.find((drug) => drug.id === selectedId) ?? null

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
    <div className="drug-layout">
      <aside className="drug-results"><div className="panel-label">{filtered.length} {filtered.length === 1 ? 'drug' : 'drugs'}</div><div className="result-list">{filtered.map((drug) => <button className={`drug-result ${drug.id === selectedId ? 'active' : ''}`} key={drug.id} onClick={() => setSelectedId(drug.id)}>{drug.image_links[0] && <img src={drug.image_links[0].asset.content_url} alt="" />}<span><small className="record-code">{drug.display_code}</small><strong>{drug.name}</strong><small>{drug.chapters.join(' · ') || 'Uncategorized'}</small><em>{drug.functions.join(' · ') || 'No function assigned'}</em></span></button>)}</div></aside>
      <main className="drug-detail">{selected ? <DrugDetail drug={selected} onOpenReaction={onOpenReaction} onOpenStructure={onOpenStructure} /> : <DrugEmpty hasDrugs={drugs.length > 0} />}</main>
    </div>
  </div>
}

function DrugDetail({ drug, onOpenReaction, onOpenStructure }: { drug: Drug; onOpenReaction: (code: string) => void; onOpenStructure: (code: string) => void }) {
  return <article className="drug-record"><span className="eyebrow">Drug record · {drug.display_code}</span><h1>{drug.name}</h1>{drug.aliases.length > 0 && <p className="drug-aliases">Also known as {drug.aliases.join(', ')}</p>}
    <div className="drug-tags">{drug.chapters.map((item) => <span className="chapter" key={`chapter-${item}`}>{item}</span>)}{drug.functions.map((item) => <span key={`function-${item}`}>{item}</span>)}</div>
    {drug.description && <p className="drug-description">{drug.description}</p>}
    {drug.image_links.length > 0 && <section><h2>Images</h2><div className="drug-gallery">{drug.image_links.map((image) => <figure key={image.id}><img src={image.asset.content_url} alt={`${drug.name} — ${image.asset.original_filename}`} /><figcaption>{image.asset.original_filename}</figcaption></figure>)}</div></section>}
    <section><h2>Synthesis reactions</h2>{drug.reaction_links.length ? <div className="drug-reactions">{drug.reaction_links.map(({ reaction }) => <button key={reaction.id} onClick={() => onOpenReaction(reaction.display_code)}>{reaction.image && <img src={reaction.image.content_url} alt="" />}<span><small>{reaction.display_code}</small><strong><RichFormattedText text={reaction.name} html={reaction.rich_text.name} /></strong><em><RichFormattedText text={reaction.reaction_class || 'Unclassified'} html={reaction.rich_text.reaction_class} /></em></span><b>Open →</b></button>)}</div> : <p className="muted">No Rxn Library reactions are linked yet.</p>}</section>
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
