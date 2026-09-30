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

export interface Reaction {
  id: number
  rxn_index: string
  name: string
  category: string | null
  description: string | null
  notes: string | null
  source_note: string | null
  created_at: string
  updated_at: string
  components: ReactionComponent[]
}

export interface ComponentInput {
  component_id?: number
  name?: string
  role: Role
  display_order: number
  detail?: string | null
}

export interface ReactionInput {
  rxn_index: string
  name: string
  category: string | null
  description: string | null
  notes: string | null
  source_note: string | null
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
