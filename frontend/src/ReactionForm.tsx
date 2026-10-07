import { useEffect, useState, type FormEvent } from 'react'
import { api } from './api'
import type { Component, ComponentInput, Reaction, ReactionInput, ReactionSeries, ReactionStatus, Role } from './types'
import { useLatex } from './latex'

const roles: Role[] = ['reactant', 'product', 'reagent', 'catalyst', 'solvent', 'condition', 'other']
const empty: ReactionInput = { series: 'general', number: 1, name: '', slug: '', summary: '', reaction_class: '', status: 'active', notes: '', components: [], image_asset_id: null, rich_text: {} }

function fromReaction(reaction?: Reaction): ReactionInput {
  if (!reaction) return { ...empty, components: [] }
  return {
    series: reaction.series, number: reaction.number, name: reaction.name, slug: reaction.slug,
    summary: reaction.summary, reaction_class: reaction.reaction_class, status: reaction.status, notes: reaction.notes,
    image_asset_id: reaction.image?.id ?? null, rich_text: reaction.rich_text ?? {}, components: reaction.components.map((item) => ({
      component_id: item.component.id, name: item.component.name, role: item.role,
      display_order: item.display_order, detail: item.detail,
    })),
  }
}

interface Props {
  reaction?: Reaction
  onSave: (data: ReactionInput) => Promise<void>
  onClose: () => void
}

export function ReactionForm({ reaction, onSave, onClose }: Props) {
  const [form, setForm] = useState<ReactionInput>(() => fromReaction(reaction))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [knownComponents, setKnownComponents] = useState<Component[]>([])
  const [imageUrl, setImageUrl] = useState(reaction?.image?.content_url ?? '')
  const [uploading, setUploading] = useState(false)
  const { transform } = useLatex()
  useEffect(() => { setForm(fromReaction(reaction)); setImageUrl(reaction?.image?.content_url ?? '') }, [reaction])
  useEffect(() => { void api.components().then(setKnownComponents).catch(() => undefined) }, [])

  const field = (key: keyof ReactionInput, value: string | number) => setForm({ ...form, [key]: value })
  const changeComponent = (index: number, patch: Partial<ComponentInput>) => {
    const components = [...form.components]
    components[index] = { ...components[index], ...patch }
    if (patch.name !== undefined) {
      const normalized = patch.name.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
      const existing = knownComponents.find((item) => item.normalized_name.toLocaleLowerCase() === normalized)
      if (existing) components[index].component_id = existing.id
      else delete components[index].component_id
    }
    setForm({ ...form, components })
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!form.name.trim()) { setError('Reaction name is required'); return }
    setBusy(true); setError('')
    try { await onSave(form) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save') }
    finally { setBusy(false) }
  }
  const uploadImage = async (file?: File) => {
    if (!file) return; setUploading(true); setError('')
    try { const asset = await api.uploadImage(file); setForm((current) => ({ ...current, image_asset_id: asset.id })); setImageUrl(asset.content_url) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not upload image') }
    finally { setUploading(false) }
  }
  const textChange = (key: keyof ReactionInput, value: string, includeEnd = false) => field(key, transform(value, includeEnd))
  const plainTextChange = (key: 'name' | 'reaction_class' | 'summary' | 'notes', value: string, includeEnd = false) => {
    const richText = { ...(form.rich_text ?? {}) }; delete richText[key]
    setForm({ ...form, [key]: transform(value, includeEnd), rich_text: richText })
  }

  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <form className="modal" onSubmit={submit}>
      <div className="modal-title"><div><span className="eyebrow">Reaction record</span><h2>{reaction ? 'Edit reaction' : 'New reaction'}</h2></div><button type="button" className="icon-button" onClick={onClose}>×</button></div>
      {error && <div className="error">{error}</div>}
      <div className="form-grid">
        <label>Series<select value={form.series} onChange={(e) => field('series', e.target.value as ReactionSeries)}><option value="general">General</option><option value="special">Special</option></select></label>
        <label>Number<input required min="1" type="number" value={form.number} onChange={(e) => field('number', Number(e.target.value))} /></label>
        <label>Reaction name<input required placeholder="Reaction name" value={form.name} onBlur={(e) => plainTextChange('name', e.target.value, true)} onChange={(e) => plainTextChange('name', e.target.value)} /></label>
        <label>Status<select value={form.status} onChange={(e) => field('status', e.target.value as ReactionStatus)}><option value="active">Active</option><option value="deprecated">Deprecated</option></select></label>
        <label className="wide">Slug<input placeholder="optional-url-slug" value={form.slug ?? ''} onBlur={(e) => textChange('slug', e.target.value, true)} onChange={(e) => textChange('slug', e.target.value)} /></label>
        <label className="wide">Reaction class<input placeholder="e.g. Amine synthesis" value={form.reaction_class ?? ''} onBlur={(e) => plainTextChange('reaction_class', e.target.value, true)} onChange={(e) => plainTextChange('reaction_class', e.target.value)} /></label>
        <label className="wide">Summary<textarea rows={2} value={form.summary ?? ''} onBlur={(e) => plainTextChange('summary', e.target.value, true)} onChange={(e) => plainTextChange('summary', e.target.value)} /></label>
        <div className="wide reaction-image-field"><strong>Card image</strong><div className="reaction-image-input">{imageUrl ? <img src={imageUrl} alt="Reaction preview" /> : <span>No image</span>}<div><label className="button secondary image-picker">{uploading ? 'Uploading…' : imageUrl ? 'Replace image' : 'Choose image'}<input hidden disabled={uploading} type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={(e) => void uploadImage(e.target.files?.[0])} /></label>{imageUrl && <button type="button" className="danger ghost" onClick={() => { setImageUrl(''); setForm({ ...form, image_asset_id: null }) }}>Remove</button>}<small>Shown in the library, reaction detail, and collection cards.</small></div></div></div>
      </div>
      <div className="component-editor">
        <div className="section-heading"><h3>Components</h3><button type="button" className="secondary" onClick={() => setForm({ ...form, components: [...form.components, { name: '', role: 'reactant', display_order: form.components.length }] })}>+ Add component</button></div>
        {form.components.length === 0 && <p className="muted compact">Add reactants, products, reagents, catalysts, solvents, or conditions.</p>}
        {form.components.map((item, index) => <div className="component-row" key={index}>
          <input required list="known-components" aria-label="Component name" placeholder="Type or select component" value={item.name ?? ''} onBlur={(e) => changeComponent(index, { name: transform(e.target.value, true) })} onChange={(e) => changeComponent(index, { name: transform(e.target.value) })} />
          <select value={item.role} onChange={(e) => changeComponent(index, { role: e.target.value as Role })}>{roles.map((role) => <option key={role}>{role}</option>)}</select>
          <input aria-label="Component detail" placeholder="Detail / stoichiometry" value={item.detail ?? ''} onBlur={(e) => changeComponent(index, { detail: transform(e.target.value, true) })} onChange={(e) => changeComponent(index, { detail: transform(e.target.value) })} />
          <button type="button" className="icon-button" onClick={() => setForm({ ...form, components: form.components.filter((_, i) => i !== index) })}>×</button>
        </div>)}
        <datalist id="known-components">{knownComponents.map((component) => <option value={component.name} key={component.id} />)}</datalist>
      </div>
      <div className="form-grid">
        <label className="wide">Notes<textarea rows={3} value={form.notes ?? ''} onBlur={(e) => plainTextChange('notes', e.target.value, true)} onChange={(e) => plainTextChange('notes', e.target.value)} /></label>
      </div>
      <p className="input-syntax-help">Formatting: <code>_&#123;text&#125;</code> or <code>_x</code> for subscript · <code>^&#123;text&#125;</code> or <code>^x</code> for superscript</p>
      <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button disabled={busy}>{busy ? 'Saving…' : 'Save reaction'}</button></div>
    </form>
  </div>
}
