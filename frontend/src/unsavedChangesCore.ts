export interface UnsavedEditorEntry {
  id: string
  label: string
  dirty: boolean
  saving: boolean
  save: () => Promise<void>
  discard?: () => void
}

export function dirtyEditorEntries(entries: Iterable<UnsavedEditorEntry>) {
  return [...entries].filter((entry) => entry.dirty)
}

export function hasDirtyEditors(entries: Iterable<UnsavedEditorEntry>) {
  for (const entry of entries) if (entry.dirty) return true
  return false
}

export async function saveDirtyEditors(entries: Iterable<UnsavedEditorEntry>) {
  const dirty = dirtyEditorEntries(entries)
  await Promise.all(dirty.map((entry) => entry.save()))
  return dirty.map((entry) => entry.id)
}

export function discardDirtyEditors(entries: Iterable<UnsavedEditorEntry>) {
  const dirty = dirtyEditorEntries(entries)
  dirty.forEach((entry) => entry.discard?.())
  return dirty.map((entry) => entry.id)
}

export function reconcileSavedValue<T>(current: T, capturedFingerprint: string, saved: T, fingerprint: (value: T) => string) {
  return fingerprint(current) === capturedFingerprint ? saved : current
}
