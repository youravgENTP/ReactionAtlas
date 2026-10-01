export type Role = 'reactant' | 'product' | 'reagent' | 'catalyst' | 'solvent' | 'condition' | 'other'

export interface Component {
  id: number
  name: string
  normalized_name: string
  aliases: string | null
  notes: string | null
}

export interface ReactionComponent {
  id: number
  role: Role
  display_order: number
  detail: string | null
  component: Component
}

export type ReactionSeries = 'general' | 'special'
export type ReactionStatus = 'active' | 'deprecated'

export interface ReactionAlias {
  id: number
  alias: string
  alias_type: 'deprecated_index' | 'alternate_name' | 'abbreviation'
  note: string | null
}

export interface ReactionRelation {
  id: number
  source_reaction_id: number
  source_display_code: string
  source_name: string
  target_reaction_id: number
  target_display_code: string
  target_name: string
  relation_type: 'subtype_of' | 'application_of' | 'method_for' | 'related_to'
}

export interface Reaction {
  id: number
  series: ReactionSeries
  number: number
  display_code: string
  name: string
  slug: string | null
  summary: string | null
  reaction_class: string | null
  status: ReactionStatus
  notes: string | null
  created_at: string
  updated_at: string
  components: ReactionComponent[]
  aliases: ReactionAlias[]
  outgoing_relations: ReactionRelation[]
  incoming_relations: ReactionRelation[]
}

export interface ComponentInput {
  component_id?: number
  name?: string
  role: Role
  display_order: number
  detail?: string | null
}

export interface ReactionInput {
  series: ReactionSeries
  number: number
  name: string
  slug: string | null
  summary: string | null
  reaction_class: string | null
  status: ReactionStatus
  notes: string | null
  components: ComponentInput[]
}

export interface CollectionLink {
  id: number
  display_order: number
  note: string | null
  reaction: Reaction
}

export interface Collection {
  id: number
  title: string
  description: string | null
  markdown_content: string
  created_at: string
  updated_at: string
  reaction_links: CollectionLink[]
}
