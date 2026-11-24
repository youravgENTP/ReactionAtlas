import assert from 'node:assert/strict'
import test from 'node:test'
import { newCollectionBlock, parseCollectionDocument, serializeCollectionDocument } from '../src/collectionDocument.ts'
import { flattenStudyItems, indentStudyItem, outdentStudyItem, updateStudyItem } from '../src/hierarchy.ts'
import { hasDirtyEditors, reconcileSavedValue, saveDirtyEditors, type UnsavedEditorEntry } from '../src/unsavedChangesCore.ts'
import type { CollectionDocument } from '../src/types.ts'

const completeDocument: CollectionDocument = { version: 1, blocks: [
  { id: 'heading', type: 'heading', level: 1, content: { text: 'Synthesis', html: '<strong>Synthesis</strong>' } },
  { id: 'paragraph', type: 'text', content: { text: 'Overview', html: '<u>Overview</u>' } },
  { id: 'hierarchy', type: 'hierarchy', items: [
    { id: 'overview', text: 'Reaction overview', html: '<strong>Reaction overview</strong>' },
    { id: 'mechanism', text: 'Mechanism', children: [{ id: 'intermediate', text: 'Intermediate formation', html: '<em>Intermediate formation</em>' }] },
  ] },
  { id: 'image', type: 'image', media_asset_id: '12345678-1234-4234-8234-123456789abc', width_percent: 64, align: 'right', anchor_item_id: 'intermediate', anchor_side: 'after' },
  { id: 'reaction', type: 'reaction', reaction_id: 42 },
  { id: 'divider', type: 'divider' },
] }

test('legacy Collection content is converted to one rich text block', () => {
  const parsed = parseCollectionDocument('Line one\nLine <two>')
  assert.equal(parsed.version, 1)
  assert.equal(parsed.blocks.length, 1)
  assert.deepEqual(parsed.blocks[0].type === 'text' ? parsed.blocks[0].content : null, {
    text: 'Line one\nLine <two>', html: 'Line one<br>Line &lt;two&gt;',
  })
})

test('existing Collection blocks save and reload without format or ordering loss', () => {
  assert.deepEqual(parseCollectionDocument(serializeCollectionDocument(completeDocument)), completeDocument)
  assert.deepEqual(completeDocument.blocks.map((block) => block.type), ['heading', 'text', 'hierarchy', 'image', 'reaction', 'divider'])
})

test('Hierarchy insertion creates persistent block and item UUIDs', () => {
  const block = newCollectionBlock('hierarchy')
  assert.equal(block.type, 'hierarchy')
  if (block.type !== 'hierarchy') return
  assert.match(block.id, /^[0-9a-f-]{36}$/i)
  assert.match(block.items[0].id, /^[0-9a-f-]{36}$/i)
  const document: CollectionDocument = { version: 1, blocks: [block] }
  assert.deepEqual(parseCollectionDocument(serializeCollectionDocument(document)), document)
})

test('indent, rich-text edits, outdent, and reload retain hierarchy item identities', () => {
  const hierarchy = completeDocument.blocks.find((block) => block.type === 'hierarchy')
  assert.ok(hierarchy?.type === 'hierarchy')
  const originalIds = flattenStudyItems(hierarchy.items).map((item) => item.id)
  const indented = indentStudyItem(hierarchy.items, 'mechanism')
  const rich = updateStudyItem(indented, 'mechanism', { html: '<span style="background-color:#fff1a8">Mechanism</span>' })
  const outdented = outdentStudyItem(rich, 'mechanism')
  const document: CollectionDocument = { version: 1, blocks: [{ ...hierarchy, items: outdented }] }
  const reloaded = parseCollectionDocument(serializeCollectionDocument(document))
  const reloadedBlock = reloaded.blocks[0]
  assert.ok(reloadedBlock.type === 'hierarchy')
  assert.deepEqual(flattenStudyItems(reloadedBlock.items).map((item) => item.id), originalIds)
  assert.equal(flattenStudyItems(reloadedBlock.items).find((item) => item.id === 'mechanism')?.html, '<span style="background-color:#fff1a8">Mechanism</span>')
})

test('anchored images and Reaction embeds remain distinct blocks across reload', () => {
  const reloaded = parseCollectionDocument(serializeCollectionDocument(completeDocument))
  const image = reloaded.blocks.find((block) => block.type === 'image')
  const reaction = reloaded.blocks.find((block) => block.type === 'reaction')
  assert.ok(image?.type === 'image')
  assert.equal(image.anchor_item_id, 'intermediate')
  assert.equal(image.anchor_side, 'after')
  assert.ok(reaction?.type === 'reaction')
  assert.equal(reaction.reaction_id, 42)
})

test('hierarchy and image changes participate in dirty guarding and stale-save reconciliation', async () => {
  const baseline = serializeCollectionDocument(completeDocument)
  const hierarchy = completeDocument.blocks.find((block) => block.type === 'hierarchy')
  assert.ok(hierarchy?.type === 'hierarchy')
  const edited: CollectionDocument = { ...completeDocument, blocks: completeDocument.blocks.map((block) => block.id === hierarchy.id ? { ...hierarchy, items: updateStudyItem(hierarchy.items, 'overview', { text: 'Edited overview' }) } : block) }
  const entry: UnsavedEditorEntry = { id: 'collection:1:document', label: 'Collection', dirty: serializeCollectionDocument(edited) !== baseline, saving: false, save: async () => undefined }
  assert.equal(hasDirtyEditors([entry]), true)
  await saveDirtyEditors([entry])
  const image = newCollectionBlock('image')
  assert.ok(image.type === 'image')
  const uploadedImage = { ...image, media_asset_id: '87654321-4321-4321-8321-cba987654321' }
  const newer = { ...edited, blocks: [...edited.blocks, uploadedImage] }
  assert.notEqual(serializeCollectionDocument(newer), serializeCollectionDocument(edited))
  assert.equal(hasDirtyEditors([{ ...entry, dirty: serializeCollectionDocument(newer) !== serializeCollectionDocument(edited) }]), true)
  assert.equal(reconcileSavedValue(newer, serializeCollectionDocument(edited), edited, serializeCollectionDocument), newer)
})
