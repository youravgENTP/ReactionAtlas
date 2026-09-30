import type { Reaction, Role } from './types'

const groups: [Role, string][] = [['reactant', 'Reactants'], ['product', 'Products'], ['reagent', 'Reagents'], ['catalyst', 'Catalysts'], ['solvent', 'Solvents'], ['condition', 'Conditions'], ['other', 'Other']]

export function ReactionDetail({ reaction, onEdit, onDelete }: { reaction: Reaction; onEdit: () => void; onDelete: () => void }) {
  return <article className="detail-card">
    <div className="detail-header"><div><div className="rxn-index large">{reaction.rxn_index}</div><h1>{reaction.name}</h1></div><div className="button-row"><button className="secondary" onClick={onEdit}>Edit</button><button className="danger ghost" onClick={onDelete}>Delete</button></div></div>
    {reaction.category && <div className="category">{reaction.category}</div>}
    {reaction.description && <p className="description">{reaction.description}</p>}
    <div className="role-grid">{groups.map(([role, title]) => {
      const entries = reaction.components.filter((item) => item.role === role)
      if (!entries.length) return null
      return <section key={role}><h3>{title}</h3><ul>{entries.map((item) => <li key={item.id}><span>{item.component.name}</span>{item.detail && <small>{item.detail}</small>}</li>)}</ul></section>
    })}</div>
    {reaction.notes && <section className="notes"><h3>Notes</h3><p>{reaction.notes}</p></section>}
    {reaction.source_note && <section className="notes"><h3>Source</h3><p>{reaction.source_note}</p></section>}
  </article>
}
