import assert from 'node:assert/strict'
import test from 'node:test'
import { dirtyEditorEntries, discardDirtyEditors, hasDirtyEditors, reconcileSavedValue, saveDirtyEditors, type UnsavedEditorEntry } from '../src/unsavedChangesCore.ts'
import { serializeStudyDocument } from '../src/studyDocumentCore.ts'
import type { StudyDocument } from '../src/types.ts'

function editor(id: string, save: () => Promise<void>, dirty = true, discard?: () => void): UnsavedEditorEntry {
  return { id, label: id, dirty, saving: false, save, discard }
}

test('multiple dirty editors are saved and navigation waits for every save', async () => {
  let finishFirst!: () => void
  let finishSecond!: () => void
  const first = new Promise<void>((resolve) => { finishFirst = resolve })
  const second = new Promise<void>((resolve) => { finishSecond = resolve })
  let navigated = false
  const saving = saveDirtyEditors([editor('reaction', () => first), editor('collection', () => second)]).then(() => { navigated = true })
  await Promise.resolve()
  assert.equal(navigated, false)
  finishFirst(); await Promise.resolve()
  assert.equal(navigated, false)
  finishSecond(); await saving
  assert.equal(navigated, true)
})

test('a save failure rejects navigation and does not discard either draft', async () => {
  let discarded = 0
  const entries = [
    editor('drug', async () => { throw new Error('offline') }, true, () => { discarded += 1 }),
    editor('collection', async () => undefined, true, () => { discarded += 1 }),
  ]
  let navigated = false
  await assert.rejects(saveDirtyEditors(entries).then(() => { navigated = true }), /offline/)
  assert.equal(navigated, false)
  assert.equal(discarded, 0)
  assert.deepEqual(dirtyEditorEntries(entries).map((entry) => entry.id), ['drug', 'collection'])
})

test('discard invokes every dirty editor but skips clean editors', () => {
  const discarded: string[] = []
  const ids = discardDirtyEditors([
    editor('reaction', async () => undefined, true, () => discarded.push('reaction')),
    editor('clean', async () => undefined, false, () => discarded.push('clean')),
    editor('settings', async () => undefined, true, () => discarded.push('settings')),
  ])
  assert.deepEqual(ids, ['reaction', 'settings'])
  assert.deepEqual(discarded, ['reaction', 'settings'])
})

test('reload protection activates whenever any registered editor is dirty', () => {
  assert.equal(hasDirtyEditors([editor('clean', async () => undefined, false)]), false)
  assert.equal(hasDirtyEditors([editor('clean', async () => undefined, false), editor('notes', async () => undefined)]), true)
})

test('a stale save response never replaces text entered while saving', () => {
  const captured = { text: 'first draft' }
  const saved = { text: 'server-normalized first draft' }
  const newer = { text: 'first draft plus newer typing' }
  const fingerprint = JSON.stringify(captured)
  assert.equal(reconcileSavedValue(captured, fingerprint, saved, JSON.stringify), saved)
  assert.equal(reconcileSavedValue(newer, fingerprint, saved, JSON.stringify), newer)
})

test('adding an uploaded image reference makes the owning document dirty', () => {
  const baseline: StudyDocument = { version: 1, blocks: [] }
  const withImage: StudyDocument = { version: 1, blocks: [{
    id: 'image', type: 'image', media_asset_id: '12345678-1234-4234-8234-123456789abc', width_percent: 55, align: 'center',
  }] }
  assert.notEqual(serializeStudyDocument(withImage), serializeStudyDocument(baseline))
})
