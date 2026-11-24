import type { CollectionBlock, CollectionDocument } from './types'

const id = () => crypto.randomUUID()

export function parseCollectionDocument(source: string): CollectionDocument {
  try {
    const parsed = JSON.parse(source) as CollectionDocument
    if (parsed.version === 1 && Array.isArray(parsed.blocks)) return parsed
  } catch { /* Legacy Markdown becomes a text block below. */ }
  return { version: 1, blocks: source ? [{ id: id(), type: 'text', content: { text: source, html: escapeHtml(source).replace(/\n/g, '<br>') } }] : [] }
}

export function serializeCollectionDocument(document: CollectionDocument) { return JSON.stringify(document) }

export function newCollectionBlock(type: CollectionBlock['type'], reactionId: number | null = null): CollectionBlock {
  if (type === 'heading') return { id: id(), type, level: 2, content: { text: '' } }
  if (type === 'text') return { id: id(), type, content: { text: '' } }
  if (type === 'hierarchy') return { id: id(), type, items: [{ id: id(), text: '' }] }
  if (type === 'image') return { id: id(), type, media_asset_id: '', width_percent: 55, align: 'center' }
  if (type === 'reaction') return { id: id(), type, reaction_id: reactionId }
  return { id: id(), type: 'divider' }
}

function escapeHtml(value: string) { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
