import type { Reaction, Role } from './types'
import { FormattedText, RichFormattedText } from './inlineMarkup'

const groups: [Role, string][] = [['reactant', 'Reactants'], ['product', 'Products'], ['reagent', 'Reagents'], ['catalyst', 'Catalysts'], ['solvent', 'Solvents'], ['condition', 'Conditions'], ['other', 'Other']]
const relationLabels = { subtype_of: 'is a subtype of', application_of: 'is an application of', method_for: 'is a method for', related_to: 'is related to' }

export function ReactionDetail({ reaction, onEdit, onDelete }: { reaction: Reaction; onEdit: () => void; onDelete: () => void }) {
  const relations = [...reaction.outgoing_relations.map((item) => ({ ...item, direction: 'outgoing' as const })), ...reaction.incoming_relations.map((item) => ({ ...item, direction: 'incoming' as const }))]
  return <article className="detail-card">
    <div className="detail-header"><div><div className="index-line"><span className={`series-label ${reaction.series}`}>{reaction.series}</span><span className="rxn-index large">{reaction.display_code}</span></div><h1><RichFormattedText text={reaction.name} html={reaction.rich_text.name} /></h1></div><div className="button-row"><button className="secondary" onClick={onEdit}>Edit</button><button className="danger ghost" onClick={onDelete}>Delete</button></div></div>
    {reaction.reaction_class && <div className="category"><RichFormattedText text={reaction.reaction_class} html={reaction.rich_text.reaction_class} /></div>}
    {reaction.image && <img className="reaction-hero" src={reaction.image.content_url} alt={`${reaction.name} reaction`} />}
    {reaction.summary && <p className="description"><RichFormattedText text={reaction.summary} html={reaction.rich_text.summary} /></p>}
    <div className="role-grid">{groups.map(([role, title]) => {
      const entries = reaction.components.filter((item) => item.role === role)
      if (!entries.length) return null
      return <section key={role}><h3>{title}</h3><ul>{entries.map((item) => <li key={item.id}><span><FormattedText>{item.component.name}</FormattedText></span>{item.detail && <small><FormattedText>{item.detail}</FormattedText></small>}</li>)}</ul></section>
    })}</div>
    {reaction.aliases.length > 0 && <section className="notes"><h3>Aliases</h3><ul className="metadata-list">{reaction.aliases.map((alias) => <li key={alias.id}><strong>{alias.alias}</strong> <span>{alias.alias_type.replace('_', ' ')}</span>{alias.note && <small>{alias.note}</small>}</li>)}</ul></section>}
    {relations.length > 0 && <section className="notes"><h3>Relations</h3><ul className="metadata-list">{relations.map((relation) => <li key={`${relation.direction}-${relation.id}`}>{relation.direction === 'incoming' && <><strong>{relation.source_display_code}</strong> {relation.source_name} </>}<span>{relationLabels[relation.relation_type]}</span>{relation.direction === 'outgoing' ? <><strong>{relation.target_display_code}</strong> {relation.target_name}</> : 'this reaction'}</li>)}</ul></section>}
    {reaction.notes && <section className="notes"><h3>Notes</h3><p><RichFormattedText text={reaction.notes} html={reaction.rich_text.notes} /></p></section>}
  </article>
}
