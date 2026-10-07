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
  image: MediaAsset | null
  rich_text: Record<string, string>
}

export interface MediaAsset {
  id: string
  original_filename: string
  mime_type: string
  size_bytes: number
  width: number | null
  height: number | null
  created_at: string
  content_url: string
}

export interface LatexShortcut {
  id: string
  command: string
  replacement: string
}

export interface BackupStatus {
  directory: string
  interval_hours: number
  latest_filename: string | null
  latest_created_at: string | null
  latest_size_bytes: number | null
  next_due_at: string
  created_filename?: string
}

export interface DrugImage {
  id: number
  source_path: string
  display_order: number
  asset: MediaAsset
}

export interface DrugReactionLink {
  id: number
  display_order: number
  reaction: Reaction
}

export interface StructureReference {
  id: number
  number: number
  display_code: string
  name: string
  slug: string
  categories: string[]
  image: MediaAsset | null
}

export interface DrugReference {
  id: number
  number: number
  display_code: string
  name: string
  slug: string
  chapters: string[]
  functions: string[]
  image: MediaAsset | null
}

export interface DrugStructureLink {
  id: number
  display_order: number
  structure: StructureReference
}

export interface Drug {
  id: number
  number: number
  display_code: string
  name: string
  slug: string
  description: string | null
  chapters: string[]
  functions: string[]
  aliases: string[]
  image_directory: string
  created_at: string
  updated_at: string
  image_links: DrugImage[]
  reaction_links: DrugReactionLink[]
  structure_links: DrugStructureLink[]
}

export interface DrugImportInput {
  name: string
  number?: number | null
  slug?: string | null
  description?: string | null
  chapters?: string[]
  functions?: string[]
  aliases?: string[]
  image_directory?: string | null
  reaction_codes?: string[]
  reactions?: string[]
  structure_codes?: string[]
}

export interface DrugImportResult {
  created: number
  updated: number
  images_uploaded: number
  reactions_linked: number
  structures_linked: number
  warnings: string[]
}

export interface StructureImage {
  id: number
  source_path: string
  display_order: number
  asset: MediaAsset
}

export interface StructureReactionLink {
  id: number
  display_order: number
  reaction: Reaction
}

export interface StructureDrugLink {
  id: number
  display_order: number
  drug: DrugReference
}

export interface Structure {
  id: number
  number: number
  display_code: string
  name: string
  slug: string
  description: string | null
  categories: string[]
  aliases: string[]
  image_directory: string
  created_at: string
  updated_at: string
  image_links: StructureImage[]
  reaction_links: StructureReactionLink[]
  drug_links: StructureDrugLink[]
}

export interface StructureImportInput {
  name: string
  number?: number | null
  slug?: string | null
  description?: string | null
  categories?: string[]
  aliases?: string[]
  image_directory?: string | null
  reaction_codes?: string[]
  drug_codes?: string[]
}

export interface StructureImportResult {
  created: number
  updated: number
  images_uploaded: number
  reactions_linked: number
  drugs_linked: number
  warnings: string[]
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
  image_asset_id?: string | null
  rich_text?: Record<string, string>
}

export interface ReactionRichTextInput {
  name: string
  reaction_class: string | null
  summary: string | null
  notes: string | null
  rich_text: Record<string, string>
}

export interface RichTextValue { text: string; html?: string }
export type CollectionBlock =
  | { id: string; type: 'heading'; level: 1 | 2 | 3; content: RichTextValue }
  | { id: string; type: 'text'; content: RichTextValue }
  | { id: string; type: 'image'; media_asset_id: string; width_percent: number; align: 'left' | 'center' | 'right' }
  | { id: string; type: 'reaction'; reaction_id: number | null }
  | { id: string; type: 'divider' }

export interface CollectionDocument { version: 1; blocks: CollectionBlock[] }

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
