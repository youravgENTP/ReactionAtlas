import type { Reaction, Role } from './types'

const groups: [Role, string][] = [['reactant', 'Reactants'], ['product', 'Products'], ['reagent', 'Reagents'], ['catalyst', 'Catalysts'], ['solvent', 'Solvents'], ['condition', 'Conditions'], ['other', 'Other']]
const relationLabels = { subtype_of: 'is a subtype of', application_of: 'is an application of', method_for: 'is a method for', related_to: 'is related to' }

export function ReactionDetail({ reaction, onEdit, onDelete }: { reaction: Reaction; onEdit: () => void; onDelete: () => void }) {
  const relations = [...reaction.outgoing_relations.map((item) => ({ ...item, direction: 'outgoing' as const })), ...reaction.incoming_relations.map((item) => ({ ...item, direction: 'incoming' as const }))]
  return <article className="detail-card">
    <div className="detail-header"><div><div className="index-line"><span className={`series-label ${reaction.series}`}>{reaction.series}</span><span className="rxn-index large">{reaction.display_code}</span></div><h1>{reaction.name}</h1></div><div className="button-row"><button className="secondary" onClick={onEdit}>Edit</button><button className="danger ghost" onClick={onDelete}>Delete</button></div></div>
    {reaction.reaction_class && <div className="category">{reaction.reaction_class}</div>}
    {reaction.summary && <p className="description">{reaction.summary}</p>}
    <div className="role-grid">{groups.map(([role, title]) => {
      const entries = reaction.components.filter((item) => item.role === role)
      if (!entries.length) return null
      return <section key={role}><h3>{title}</h3><ul>{entries.map((item) => <li key={item.id}><span>{item.component.name}</span>{item.detail && <small>{item.detail}</small>}</li>)}</ul></section>
    })}</div>
    {reaction.aliases.length > 0 && <section className="notes"><h3>Aliases</h3><ul className="metadata-list">{reaction.aliases.map((alias) => <li key={alias.id}><strong>{alias.alias}</strong> <span>{alias.alias_type.replace('_', ' ')}</span>{alias.note && <small>{alias.note}</small>}</li>)}</ul></section>}
    {relations.length > 0 && <section className="notes"><h3>Relations</h3><ul className="metadata-list">{relations.map((relation) => <li key={`${relation.direction}-${relation.id}`}>{relation.direction === 'incoming' && <><strong>{relation.source_display_code}</strong> {relation.source_name} </>}<span>{relationLabels[relation.relation_type]}</span>{relation.direction === 'outgoing' ? <><strong>{relation.target_display_code}</strong> {relation.target_name}</> : 'this reaction'}</li>)}</ul></section>}
    {reaction.notes && <section className="notes"><h3>Notes</h3><p>{reaction.notes}</p></section>}
  </article>
}
