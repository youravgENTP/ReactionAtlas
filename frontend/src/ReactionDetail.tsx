import { useEffect, useMemo, useState } from 'react'
import type { Reaction, ReactionInput, ReactionRichTextInput, RichTextValue, Role } from './types'
import { FormattedText } from './inlineMarkup'
import { RichEditor } from './CollectionDocumentEditor'

const groups: [Role, string][] = [['reactant', 'Reactants'], ['product', 'Products'], ['reagent', 'Reagents'], ['catalyst', 'Catalysts'], ['solvent', 'Solvents'], ['condition', 'Conditions'], ['other', 'Other']]
const relationLabels = { subtype_of: 'is a subtype of', application_of: 'is an application of', method_for: 'is a method for', related_to: 'is related to' }

type RichKey = 'name' | 'reaction_class' | 'summary' | 'notes'

function inputFromReaction(reaction: Reaction): ReactionInput {
  return {
    series: reaction.series, number: reaction.number, name: reaction.name, slug: reaction.slug,
    summary: reaction.summary, reaction_class: reaction.reaction_class, status: reaction.status,
    notes: reaction.notes, image_asset_id: reaction.image?.id ?? null, rich_text: reaction.rich_text,
    components: reaction.components.map((item) => ({ component_id: item.component.id, name: item.component.name, role: item.role, display_order: item.display_order, detail: item.detail })),
  }
}

export function ReactionDetail({ reaction, onEdit, onDelete, onSave }: { reaction: Reaction; onEdit: () => void; onDelete: () => void; onSave: (data: ReactionRichTextInput) => Promise<void> }) {
  const relations = [...reaction.outgoing_relations.map((item) => ({ ...item, direction: 'outgoing' as const })), ...reaction.incoming_relations.map((item) => ({ ...item, direction: 'incoming' as const }))]
  const [draft, setDraft] = useState(() => inputFromReaction(reaction))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { setDraft(inputFromReaction(reaction)); setError('') }, [reaction.id, reaction.updated_at])
  const original = useMemo(() => inputFromReaction(reaction), [reaction])
  const dirty = JSON.stringify(draft) !== JSON.stringify(original)
  const value = (key: RichKey): RichTextValue => ({ text: String(draft[key] ?? ''), html: draft.rich_text?.[key] })
  const change = (key: RichKey, content: RichTextValue) => {
    setDraft((current) => {
      const richText = { ...(current.rich_text ?? {}) }
      const text = content.text.trim() ? content.text : ''
      if (text && content.html) richText[key] = content.html; else delete richText[key]
      return { ...current, [key]: text, rich_text: richText }
    })
  }
  const save = async () => {
    if (!draft.name.trim()) { setError('Reaction name is required'); return }
    setSaving(true); setError('')
    try { await onSave({ name: draft.name, reaction_class: draft.reaction_class, summary: draft.summary, notes: draft.notes, rich_text: draft.rich_text ?? {} }) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save reaction') }
    finally { setSaving(false) }
  }
  useEffect(() => {
    const handleSaveShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') return
      event.preventDefault()
      if (dirty && !saving) void save()
    }
    window.addEventListener('keydown', handleSaveShortcut)
    return () => window.removeEventListener('keydown', handleSaveShortcut)
  })
  return <article className="detail-card">
    <div className="detail-header rich-detail-header"><div className="detail-title-area"><div className="index-line"><span className={`series-label ${reaction.series}`}>{reaction.series}</span><span className="rxn-index large">{reaction.display_code}</span></div><RichEditor heading={1} singleLine placeholder="Reaction name" value={value('name')} onChange={(content) => change('name', content)} /></div><div className="button-row"><button className="secondary" onClick={onEdit}>Edit metadata</button><button className="danger ghost" onClick={onDelete}>Delete</button></div></div>
    {error && <div className="error inline-editor-error">{error}</div>}
    <section className="detail-rich-fields">
      <label>Reaction class<RichEditor singleLine placeholder="Add a reaction class…" value={value('reaction_class')} onChange={(content) => change('reaction_class', content)} /></label>
      <label>Summary<RichEditor placeholder="Add a summary…" value={value('summary')} onChange={(content) => change('summary', content)} /></label>
    </section>
    {reaction.image && <img className="reaction-hero" src={reaction.image.content_url} alt={`${reaction.name} reaction`} />}
    <div className="role-grid">{groups.map(([role, title]) => {
      const entries = reaction.components.filter((item) => item.role === role)
      if (!entries.length) return null
      return <section key={role}><h3>{title}</h3><ul>{entries.map((item) => <li key={item.id}><span><FormattedText>{item.component.name}</FormattedText></span>{item.detail && <small><FormattedText>{item.detail}</FormattedText></small>}</li>)}</ul></section>
    })}</div>
    {reaction.aliases.length > 0 && <section className="notes"><h3>Aliases</h3><ul className="metadata-list">{reaction.aliases.map((alias) => <li key={alias.id}><strong>{alias.alias}</strong> <span>{alias.alias_type.replace('_', ' ')}</span>{alias.note && <small>{alias.note}</small>}</li>)}</ul></section>}
    {relations.length > 0 && <section className="notes"><h3>Relations</h3><ul className="metadata-list">{relations.map((relation) => <li key={`${relation.direction}-${relation.id}`}>{relation.direction === 'incoming' && <><strong>{relation.source_display_code}</strong> {relation.source_name} </>}<span>{relationLabels[relation.relation_type]}</span>{relation.direction === 'outgoing' ? <><strong>{relation.target_display_code}</strong> {relation.target_name}</> : 'this reaction'}</li>)}</ul></section>}
    <section className="notes detail-notes-editor"><h3>Notes</h3><RichEditor placeholder="Add notes…" value={value('notes')} onChange={(content) => change('notes', content)} /></section>
    {dirty && <div className="inline-save-bar"><span>Unsaved rich-text changes · ⌘S to save</span><button className="secondary" disabled={saving} onClick={() => setDraft(original)}>Discard</button><button disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save changes'}</button></div>}
  </article>
}
