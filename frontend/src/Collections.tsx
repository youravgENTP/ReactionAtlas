import { useEffect, useMemo, useState } from 'react'
import { api } from './api'
import { CollectionDocumentEditor, parseCollectionDocument, serializeCollectionDocument } from './CollectionDocumentEditor'
import { useLatex } from './latex'
import { FormattedText, RichFormattedText } from './inlineMarkup'
import type { Collection, CollectionDocument, Reaction } from './types'

export function Collections({ onOpenReaction }: { onOpenReaction: (index: string) => void }) {
  const [collections, setCollections] = useState<Collection[]>([])
  const [active, setActive] = useState<Collection | null>(null)
  const [reactions, setReactions] = useState<Reaction[]>([])
  const [document, setDocument] = useState<CollectionDocument>({ version: 1, blocks: [] })
  const [addSearch, setAddSearch] = useState('')
  const [error, setError] = useState('')
  const { transform } = useLatex()

  const reload = async () => { try { const data = await api.collections(); setCollections(data); setActive((old) => data.find((c) => c.id === old?.id) ?? null) } catch (e) { setError(e instanceof Error ? e.message : 'Could not load collections') } }
  useEffect(() => { void Promise.all([reload(), api.reactions().then(setReactions)]) }, [])
  useEffect(() => { setDocument(parseCollectionDocument(active?.markdown_content ?? '')) }, [active?.id, active?.markdown_content])
  const available = useMemo(() => reactions.filter((r) => !active?.reaction_links.some((link) => link.reaction.id === r.id) && `${r.display_code} ${r.name} ${r.aliases.map((alias) => alias.alias).join(' ')}`.toLowerCase().includes(addSearch.toLowerCase())).slice(0, 8), [reactions, active, addSearch])

  const create = async () => {
    const title = transform(window.prompt('Collection title')?.trim() ?? '', true); if (!title) return
    try { const item = await api.createCollection({ title, description: null, markdown_content: serializeCollectionDocument({ version: 1, blocks: [{ id: crypto.randomUUID(), type: 'heading', level: 1, content: { text: title } }] }) }); await reload(); setActive(item) } catch (e) { setError(e instanceof Error ? e.message : 'Could not create collection') }
  }
  const save = async () => {
    if (!active) return
    try { const item = await api.updateCollection(active.id, { title: active.title, description: active.description, markdown_content: serializeCollectionDocument(document) }); setActive(item); await reload() } catch (e) { setError(e instanceof Error ? e.message : 'Could not save collection') }
  }
  useEffect(() => {
    const handleSaveShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's' || !active) return
      event.preventDefault()
      void save()
    }
    window.addEventListener('keydown', handleSaveShortcut)
    return () => window.removeEventListener('keydown', handleSaveShortcut)
  })
  const rename = async () => {
    if (!active) return; const title = transform(window.prompt('Collection title', active.title)?.trim() ?? '', true); if (!title) return
    const item = await api.updateCollection(active.id, { title, description: active.description, markdown_content: serializeCollectionDocument(document) }); setActive(item); await reload()
  }
  const removeCollection = async () => {
    if (!active || !window.confirm(`Delete collection “${active.title}”? Reactions will not be deleted.`)) return
    await api.deleteCollection(active.id); setActive(null); await reload()
  }
  const setCollection = (item: Collection) => { setActive(item); setDocument(parseCollectionDocument(item.markdown_content)); setError('') }
  const add = async (reactionId: number) => { if (!active) return; const item = await api.addReaction(active.id, reactionId); setActive(item); setAddSearch(''); await reload() }
  const remove = async (reactionId: number) => { if (!active) return; const item = await api.removeReaction(active.id, reactionId); setActive(item); await reload() }
  const move = async (index: number, amount: number) => {
    if (!active) return; const ids = active.reaction_links.map((link) => link.reaction.id); const target = index + amount
    if (target < 0 || target >= ids.length) return; [ids[index], ids[target]] = [ids[target], ids[index]]
    const item = await api.reorder(active.id, ids); setActive(item); await reload()
  }
  if (!active) return <div className="collections-index"><div className="index-header"><div><span className="eyebrow">Study sets</span><h1>Collections</h1><p>Group related reactions and build a focused study document.</p></div><button onClick={() => void create()}>+ New collection</button></div>
    {error && <div className="error">{error}</div>}
    <div className="collection-grid">{collections.map((item) => <button className="collection-card" key={item.id} onClick={() => setCollection(item)}><span className="count">{item.reaction_links.length}</span><h2><FormattedText>{item.title}</FormattedText></h2><p><FormattedText>{item.description || 'No description'}</FormattedText></p><small>Updated {new Date(item.updated_at).toLocaleDateString()}</small></button>)}
      {collections.length === 0 && <div className="empty-state"><span>＋</span><h2>No collections yet</h2><p>Create one to organize reactions for your next study session.</p></div>}
    </div></div>

  return <div className="workspace">
    <div className="workspace-header"><button className="back" onClick={() => setActive(null)}>← Collections</button><div><span className="eyebrow">Study workspace</span><h1><FormattedText>{active.title}</FormattedText></h1></div><div className="button-row"><button className="secondary" onClick={() => void rename()}>Rename</button><button className="danger ghost" onClick={() => void removeCollection()}>Delete</button><button title="Save (⌘S)" onClick={() => void save()}>Save</button></div></div>
    {error && <div className="error page-error">{error}</div>}
    <div className="workspace-columns">
      <aside className="reaction-cards"><div className="panel-label">REACTION CARDS · {active.reaction_links.length}</div>
        {active.reaction_links.map((link, index) => <article className="mini-card" id={`card-${link.reaction.display_code}`} key={link.id}>
          {link.reaction.image && <img className="mini-card-image" src={link.reaction.image.content_url} alt="" />}
          <button className="card-main" onClick={() => onOpenReaction(link.reaction.display_code)}><span className="index-line"><span className={`series-label ${link.reaction.series}`}>{link.reaction.series}</span><span className="rxn-index">{link.reaction.display_code}</span></span><strong><RichFormattedText text={link.reaction.name} html={link.reaction.rich_text.name} /></strong><small><RichFormattedText text={link.reaction.reaction_class} html={link.reaction.rich_text.reaction_class} /></small></button>
          <div className="card-controls"><button disabled={index === 0} onClick={() => void move(index, -1)}>↑</button><button disabled={index === active.reaction_links.length - 1} onClick={() => void move(index, 1)}>↓</button><button onClick={() => void remove(link.reaction.id)}>×</button></div>
        </article>)}
        <div className="add-reaction"><input placeholder="Add reaction by index or name…" value={addSearch} onBlur={(e) => setAddSearch(transform(e.target.value, true))} onChange={(e) => setAddSearch(transform(e.target.value))} />{addSearch && <div className="add-results">{available.map((reaction) => <button key={reaction.id} onClick={() => void add(reaction.id)}><span className="rxn-index">{reaction.display_code}</span>{reaction.name}</button>)}</div>}</div>
      </aside>
      <main className="document-panel"><div className="document-tabs"><strong>Document</strong><span>{document.blocks.length} blocks · rich text and LaTeX shortcuts enabled</span></div>
        <CollectionDocumentEditor document={document} reactions={active.reaction_links.map((link) => link.reaction)} onChange={setDocument} onOpenReaction={onOpenReaction} />
      </main>
    </div>
  </div>
}
