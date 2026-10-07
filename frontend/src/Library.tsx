import { useEffect, useRef, useState } from 'react'
import { api } from './api'
import { ReactionDetail } from './ReactionDetail'
import { ReactionForm } from './ReactionForm'
import type { Reaction, ReactionInput, Role } from './types'
import { useLatex } from './latex'
import { FormattedText } from './inlineMarkup'

function parseCsv(text: string): ReactionInput[] {
  const lines = text.trim().split(/\r?\n/)
  const headers = lines.shift()?.split(',').map((value) => value.trim()) ?? []
  const roles: [string, Role][] = [['reactants', 'reactant'], ['products', 'product'], ['reagents', 'reagent'], ['catalysts', 'catalyst'], ['solvents', 'solvent']]
  return lines.filter(Boolean).map((line) => {
    const values = line.split(',').map((value) => value.trim())
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']))
    return {
      series: row.series === 'special' ? 'special' : 'general', number: Number(row.number), name: row.name,
      slug: row.slug || null, summary: row.summary || null, reaction_class: row.reaction_class || null,
      status: row.status === 'deprecated' ? 'deprecated' : 'active', notes: row.notes || null,
      components: roles.flatMap(([column, role]) => (row[column] ?? '').split(';').filter(Boolean).map((name, index) => ({ name: name.trim(), role, display_order: index }))),
    }
  })
}

export function Library({ initialIndex }: { initialIndex?: string }) {
  const [reactions, setReactions] = useState<Reaction[]>([])
  const [selected, setSelected] = useState<Reaction | null>(null)
  const [search, setSearch] = useState(initialIndex ?? '')
  const [editing, setEditing] = useState<Reaction | 'new' | null>(null)
  const [error, setError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const { transform } = useLatex()

  const load = async (term = search) => {
    try {
      const data = await api.reactions(term); setReactions(data)
      setSelected((current) => data.find((item) => item.id === current?.id) ?? data[0] ?? null); setError('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load reactions') }
  }
  useEffect(() => { const timer = window.setTimeout(() => void load(search), 180); return () => clearTimeout(timer) }, [search])

  const save = async (data: ReactionInput) => {
    const saved = editing === 'new' ? await api.createReaction(data) : await api.updateReaction((editing as Reaction).id, data)
    setEditing(null); await load(''); setSearch(''); setSelected(saved)
  }
  const remove = async () => {
    if (!selected || !window.confirm(`Delete ${selected.display_code} — ${selected.name}?`)) return
    await api.deleteReaction(selected.id); setSelected(null); await load()
  }
  const importFile = async (file: File) => {
    try {
      const text = await file.text()
      const raw: unknown = JSON.parse(text)
      let items: ReactionInput[]
      if (Array.isArray(raw)) items = raw as ReactionInput[]
      else if (raw && typeof raw === 'object' && 'reactions' in raw) {
        const records = (raw as { reactions: Reaction[] }).reactions
        items = records.map((r) => ({
          series: r.series, number: r.number, name: r.name, slug: r.slug, summary: r.summary,
          reaction_class: r.reaction_class, status: r.status, notes: r.notes,
          components: r.components.map((c) => ({ name: c.component.name, role: c.role, display_order: c.display_order, detail: c.detail })),
        }))
      } else throw new Error('JSON must be an array or a ReactionAtlas export')
      const result = await api.importReactions(items); window.alert(`Import complete: ${result.created} created, ${result.updated} updated.`); await load()
    } catch (jsonError) {
      if (file.name.toLowerCase().endsWith('.csv')) {
        try { const result = await api.importReactions(parseCsv(await file.text())); window.alert(`Import complete: ${result.created} created, ${result.updated} updated.`); await load() }
        catch (cause) { setError(cause instanceof Error ? cause.message : 'CSV import failed') }
      } else setError(jsonError instanceof Error ? jsonError.message : 'Import failed')
    }
  }

  return <div className="library-page">
    <div className="toolbar">
      <div className="search-wrap"><span>⌕</span><input autoFocus placeholder="Search index, reaction, reagent, product…" value={search} onBlur={(e) => setSearch(transform(e.target.value, true))} onChange={(e) => setSearch(transform(e.target.value))} />{search && <button className="clear" onClick={() => setSearch('')}>×</button>}</div>
      <input ref={fileInput} type="file" hidden accept=".json,.csv,application/json,text/csv" onChange={(e) => { const file = e.target.files?.[0]; if (file) void importFile(file); e.target.value = '' }} />
      <button className="secondary" onClick={() => fileInput.current?.click()}>Import</button>
      <a className="button secondary" href="/api/export" download="reaction-atlas-export.json">Export</a>
      <button onClick={() => setEditing('new')}>+ New reaction</button>
    </div>
    {error && <div className="error page-error">{error}</div>}
    <div className="library-layout">
      <aside className="results-panel"><div className="panel-label">{reactions.length} {reactions.length === 1 ? 'reaction' : 'reactions'}</div>
        <div className="result-list">{reactions.map((reaction) => <button key={reaction.id} className={`result-item ${selected?.id === reaction.id ? 'active' : ''}`} onClick={() => setSelected(reaction)}>
          {reaction.image && <img className="result-thumbnail" src={reaction.image.content_url} alt="" />}<span className="index-line"><span className={`series-label ${reaction.series}`}>{reaction.series}</span><span className="rxn-index">{reaction.display_code}</span></span><strong><FormattedText>{reaction.name}</FormattedText></strong><small><FormattedText>{reaction.reaction_class || 'Unclassified'}</FormattedText></small>
          {search && <span className="component-hint">{reaction.aliases.filter((a) => a.alias.toLowerCase().includes(search.toLowerCase())).map((a) => `${a.alias} (${a.alias_type.replace('_', ' ')})`).concat(reaction.components.filter((c) => `${c.component.name} ${c.role}`.toLowerCase().includes(search.toLowerCase())).slice(0, 2).map((c) => c.component.name)).join(' · ')}</span>}
        </button>)}</div>
      </aside>
      <main className="detail-panel">{selected ? <ReactionDetail reaction={selected} onEdit={() => setEditing(selected)} onDelete={() => void remove()} /> : <div className="empty-state"><span>RA</span><h2>No reaction selected</h2><p>Search your atlas or create a reaction record.</p></div>}</main>
    </div>
    {editing && <ReactionForm reaction={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSave={save} />}
  </div>
}
