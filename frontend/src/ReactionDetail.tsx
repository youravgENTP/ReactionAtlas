import { useEffect, useMemo, useRef, useState } from 'react'
import type { Reaction, ReactionInput, ReactionRichTextInput, RichTextValue, Role } from './types'
import { FormattedText } from './inlineMarkup'
import { RichEditor } from './CollectionDocumentEditor'
import { HierarchicalDocumentEditor } from './HierarchicalDocumentEditor'
import { reactionSeriesLabel } from './reactionSeries'
import { parseStudyDocument, serializeStudyDocument, studyDocumentText } from './studyDocument'
import type { StudyDocument } from './types'
import { useUnsavedEditor } from './UnsavedChanges'
import { reconcileSavedValue } from './unsavedChangesCore'

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

export function ReactionDetail({ reaction, deepLink, onEdit, onDelete, onSave, onOpenDrug }: { reaction: Reaction; deepLink?: { field?: string; item: string }; onEdit: () => void; onDelete: () => void; onSave: (data: ReactionRichTextInput) => Promise<Reaction>; onOpenDrug: (code: string) => void }) {
  const relations = [...reaction.outgoing_relations.map((item) => ({ ...item, direction: 'outgoing' as const })), ...reaction.incoming_relations.map((item) => ({ ...item, direction: 'incoming' as const }))]
  const initial = inputFromReaction(reaction)
  const [baseline, setBaseline] = useState(initial)
  const [draft, setDraft] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const entityId = useRef(reaction.id)
  const saveInFlight = useRef<Promise<void> | null>(null)
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline)
  useEffect(() => {
    const next = inputFromReaction(reaction)
    if (entityId.current !== reaction.id) { entityId.current = reaction.id; setBaseline(next); setDraft(next); setError(''); return }
    if (!dirty && !saving) { setBaseline(next); setDraft(next) }
  }, [reaction.id, reaction.updated_at])
  const summaryDocument = useMemo(() => parseStudyDocument(draft.rich_text?.summary_document, { text: draft.summary ?? '', html: draft.rich_text?.summary }), [draft.rich_text?.summary_document, draft.rich_text?.summary, draft.summary])
  const notesDocument = useMemo(() => parseStudyDocument(draft.rich_text?.notes_document, { text: draft.notes ?? '', html: draft.rich_text?.notes }), [draft.rich_text?.notes_document, draft.rich_text?.notes, draft.notes])
  const value = (key: RichKey): RichTextValue => ({ text: String(draft[key] ?? ''), html: draft.rich_text?.[key] })
  const change = (key: RichKey, content: RichTextValue) => {
    setDraft((current) => {
      const richText = { ...(current.rich_text ?? {}) }
      const text = content.text.trim() ? content.text : ''
      if ((text || content.html?.includes('<img')) && content.html) richText[key] = content.html; else delete richText[key]
      return { ...current, [key]: text, rich_text: richText }
    })
  }
  const changeDocument = (key: 'summary' | 'notes', document: StudyDocument) => {
    setDraft((current) => {
      const richText = { ...(current.rich_text ?? {}), [`${key}_document`]: serializeStudyDocument(document) }
      delete richText[key]
      return { ...current, [key]: studyDocumentText(document) || null, rich_text: richText }
    })
  }
  const save = () => {
    if (saveInFlight.current) return saveInFlight.current
    const captured = draft
    const operation = (async () => {
      if (!captured.name.trim()) { const failure = new Error('Reaction name is required'); setError(failure.message); throw failure }
      setSaving(true); setError('')
      try {
        const saved = await onSave({ name: captured.name, reaction_class: captured.reaction_class, summary: captured.summary, notes: captured.notes, rich_text: captured.rich_text ?? {} })
        const savedBaseline = inputFromReaction(saved)
        setBaseline(savedBaseline)
        setDraft((current) => reconcileSavedValue(current, JSON.stringify(captured), savedBaseline, JSON.stringify))
      } catch (cause) { const message = cause instanceof Error ? cause.message : 'Could not save reaction'; setError(message); throw cause instanceof Error ? cause : new Error(message) }
      finally { setSaving(false); saveInFlight.current = null }
    })()
    saveInFlight.current = operation
    return operation
  }
  const discard = () => { setDraft(baseline); setError('') }
  useUnsavedEditor({ id: `reaction:${reaction.id}:detail`, label: `${reaction.display_code} study notes`, dirty, saving, save, discard })
  useEffect(() => {
    const handleSaveShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') return
      event.preventDefault()
      if (dirty && !saving) void save().catch(() => undefined)
    }
    window.addEventListener('keydown', handleSaveShortcut)
    return () => window.removeEventListener('keydown', handleSaveShortcut)
  })
  return <article className="detail-card">
    <div className="detail-header rich-detail-header"><div className="detail-title-area"><div className="index-line"><span className={`series-label ${reaction.series}`}>{reactionSeriesLabel[reaction.series]}</span><span className="rxn-index large">{reaction.display_code}</span></div><RichEditor heading={1} singleLine placeholder="Reaction name" value={value('name')} onChange={(content) => change('name', content)} /></div><div className="button-row"><button className="secondary" onClick={onEdit}>Edit metadata</button><button className="danger ghost" onClick={onDelete}>Delete</button></div></div>
    {error && <div className="error inline-editor-error">{error}</div>}
    {deepLink?.field && !['summary', 'notes'].includes(deepLink.field) && <div className="missing-target">The linked document field does not exist.</div>}
    <section className="detail-rich-fields">
      <label>Reaction class<RichEditor singleLine placeholder="Add a reaction class…" value={value('reaction_class')} onChange={(content) => change('reaction_class', content)} /></label>
      <div className="hierarchical-field"><span>Summary</span><HierarchicalDocumentEditor placeholder="Add a summary…" document={summaryDocument} targetItemId={deepLink?.field === 'summary' ? deepLink.item : undefined} annotationSource={{ sourceType: 'reaction', entityId: reaction.id, field: 'summary', unsaved: dirty }} onChange={(document) => changeDocument('summary', document)} /></div>
    </section>
    {reaction.image && <img className="reaction-hero" src={reaction.image.content_url} alt={`${reaction.name} reaction`} />}
    <div className="role-grid">{groups.map(([role, title]) => {
      const entries = reaction.components.filter((item) => item.role === role)
      if (!entries.length) return null
      return <section key={role}><h3>{title}</h3><ul>{entries.map((item) => <li key={item.id}><span><FormattedText>{item.component.name}</FormattedText></span>{item.detail && <small><FormattedText>{item.detail}</FormattedText></small>}</li>)}</ul></section>
    })}</div>
    {reaction.aliases.length > 0 && <section className="notes"><h3>Aliases</h3><ul className="metadata-list">{reaction.aliases.map((alias) => <li key={alias.id}><strong>{alias.alias}</strong> <span>{alias.alias_type.replace('_', ' ')}</span>{alias.note && <small>{alias.note}</small>}</li>)}</ul></section>}
    {relations.length > 0 && <section className="notes"><h3>Relations</h3><ul className="metadata-list">{relations.map((relation) => <li key={`${relation.direction}-${relation.id}`}>{relation.direction === 'incoming' && <><strong>{relation.source_display_code}</strong> {relation.source_name} </>}<span>{relationLabels[relation.relation_type]}</span>{relation.direction === 'outgoing' ? <><strong>{relation.target_display_code}</strong> {relation.target_name}</> : 'this reaction'}</li>)}</ul></section>}
    <section className="notes"><h3>Linked drugs</h3>{reaction.drug_links.length ? <div className="reaction-drug-links">{reaction.drug_links.map(({ drug }) => <button type="button" key={drug.id} onClick={() => onOpenDrug(drug.display_code)}>{drug.image && <img src={drug.image.content_url} alt="" />}<span><small>{drug.display_code}</small><strong>{drug.name}</strong><em>{drug.chapters.join(' · ') || 'Uncategorized'}</em></span><b>Open →</b></button>)}</div> : <p className="muted compact">No drugs are linked to this reaction.</p>}</section>
    <section className="notes detail-notes-editor"><h3>Notes</h3><HierarchicalDocumentEditor placeholder="Add notes…" document={notesDocument} targetItemId={deepLink?.field === 'notes' || !deepLink?.field ? deepLink?.item : undefined} annotationSource={{ sourceType: 'reaction', entityId: reaction.id, field: 'notes', unsaved: dirty }} onChange={(document) => changeDocument('notes', document)} /></section>
    {dirty && <div className="inline-save-bar"><span>Unsaved rich-text changes · ⌘S to save</span><button className="secondary" disabled={saving} onClick={discard}>Discard</button><button disabled={saving} onClick={() => void save().catch(() => undefined)}>{saving ? 'Saving…' : 'Save changes'}</button></div>}
  </article>
}
