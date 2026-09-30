import { useEffect, useState, type FormEvent } from 'react'
import { api } from './api'
import type { Component, ComponentInput, Reaction, ReactionInput, Role } from './types'

const roles: Role[] = ['reactant', 'product', 'reagent', 'catalyst', 'solvent', 'condition', 'other']
const empty: ReactionInput = { rxn_index: '', name: '', category: '', description: '', notes: '', source_note: '', components: [] }

function fromReaction(reaction?: Reaction): ReactionInput {
  if (!reaction) return { ...empty, components: [] }
  return {
    rxn_index: reaction.rxn_index, name: reaction.name, category: reaction.category,
    description: reaction.description, notes: reaction.notes, source_note: reaction.source_note,
    components: reaction.components.map((item) => ({
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
  useEffect(() => setForm(fromReaction(reaction)), [reaction])
  useEffect(() => { void api.components().then(setKnownComponents).catch(() => undefined) }, [])

  const field = (key: keyof ReactionInput, value: string) => setForm({ ...form, [key]: value })
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
    event.preventDefault(); setBusy(true); setError('')
    try { await onSave(form) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save') }
    finally { setBusy(false) }
  }

  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <form className="modal" onSubmit={submit}>
      <div className="modal-title"><div><span className="eyebrow">Reaction record</span><h2>{reaction ? 'Edit reaction' : 'New reaction'}</h2></div><button type="button" className="icon-button" onClick={onClose}>×</button></div>
      {error && <div className="error">{error}</div>}
      <div className="form-grid">
        <label>Reaction index<input required placeholder="RXN-004" value={form.rxn_index} onChange={(e) => field('rxn_index', e.target.value)} /></label>
        <label>Reaction name<input required placeholder="Reaction name" value={form.name} onChange={(e) => field('name', e.target.value)} /></label>
        <label className="wide">Category<input placeholder="e.g. Amine synthesis" value={form.category ?? ''} onChange={(e) => field('category', e.target.value)} /></label>
        <label className="wide">Description<textarea rows={2} value={form.description ?? ''} onChange={(e) => field('description', e.target.value)} /></label>
      </div>
      <div className="component-editor">
        <div className="section-heading"><h3>Components</h3><button type="button" className="secondary" onClick={() => setForm({ ...form, components: [...form.components, { name: '', role: 'reactant', display_order: form.components.length }] })}>+ Add component</button></div>
        {form.components.length === 0 && <p className="muted compact">Add reactants, products, reagents, catalysts, solvents, or conditions.</p>}
        {form.components.map((item, index) => <div className="component-row" key={index}>
          <input required list="known-components" aria-label="Component name" placeholder="Type or select component" value={item.name ?? ''} onChange={(e) => changeComponent(index, { name: e.target.value })} />
          <select value={item.role} onChange={(e) => changeComponent(index, { role: e.target.value as Role })}>{roles.map((role) => <option key={role}>{role}</option>)}</select>
          <input aria-label="Component detail" placeholder="Detail / stoichiometry" value={item.detail ?? ''} onChange={(e) => changeComponent(index, { detail: e.target.value })} />
          <button type="button" className="icon-button" onClick={() => setForm({ ...form, components: form.components.filter((_, i) => i !== index) })}>×</button>
        </div>)}
        <datalist id="known-components">{knownComponents.map((component) => <option value={component.name} key={component.id} />)}</datalist>
      </div>
      <div className="form-grid">
        <label className="wide">Notes<textarea rows={3} value={form.notes ?? ''} onChange={(e) => field('notes', e.target.value)} /></label>
        <label className="wide">Source note<input value={form.source_note ?? ''} onChange={(e) => field('source_note', e.target.value)} /></label>
      </div>
      <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button disabled={busy}>{busy ? 'Saving…' : 'Save reaction'}</button></div>
    </form>
  </div>
}
