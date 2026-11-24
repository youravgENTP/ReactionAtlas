import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { dirtyEditorEntries, discardDirtyEditors, hasDirtyEditors, saveDirtyEditors, type UnsavedEditorEntry } from './unsavedChangesCore'

interface EditorRegistration {
  id: string
  label?: string
  dirty: boolean
  saving: boolean
  save: () => Promise<void>
  discard?: () => void
  enabled?: boolean
}

interface UnsavedChangesContextValue {
  register: (entry: UnsavedEditorEntry) => () => void
  update: (entry: UnsavedEditorEntry) => void
  requestNavigation: (action: () => void) => void
  hasDirty: () => boolean
}

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(null)

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const editors = useRef(new Map<string, UnsavedEditorEntry>())
  const [pending, setPending] = useState<(() => void) | null>(null)
  const [modalSaving, setModalSaving] = useState(false)
  const [modalError, setModalError] = useState('')
  const continueButton = useRef<HTMLButtonElement>(null)
  const [, refresh] = useState(0)
  const notify = useCallback(() => refresh((value) => value + 1), [])
  const register = useCallback((entry: UnsavedEditorEntry) => {
    editors.current.set(entry.id, entry); notify()
    return () => { editors.current.delete(entry.id); notify() }
  }, [notify])
  const update = useCallback((entry: UnsavedEditorEntry) => { editors.current.set(entry.id, entry); notify() }, [notify])
  const hasDirty = useCallback(() => hasDirtyEditors(editors.current.values()), [])
  const requestNavigation = useCallback((action: () => void) => {
    if (!dirtyEditorEntries(editors.current.values()).length) { action(); return }
    setModalError(''); setPending(() => action)
  }, [])

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (!hasDirty()) return; event.preventDefault(); event.returnValue = '' }
    const internalLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href]')
      if (!anchor || anchor.download || anchor.target || anchor.origin !== window.location.origin) return
      event.preventDefault(); requestNavigation(() => window.dispatchEvent(new CustomEvent('reactionatlas:navigate', { detail: anchor.href })))
    }
    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('click', internalLink, true)
    return () => { window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('click', internalLink, true) }
  }, [hasDirty, requestNavigation])

  const dirty = dirtyEditorEntries(editors.current.values())
  const value = useMemo(() => ({ register, update, requestNavigation, hasDirty }), [register, update, requestNavigation, hasDirty])
  const continueEditing = () => { if (modalSaving) return; setPending(null); setModalError('') }
  useEffect(() => {
    if (!pending) return
    const frame = window.requestAnimationFrame(() => continueButton.current?.focus())
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !modalSaving) continueEditing() }
    window.addEventListener('keydown', escape)
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener('keydown', escape) }
  }, [pending, modalSaving])
  const discardAndLeave = () => {
    if (!pending || modalSaving) return
    const action = pending; discardDirtyEditors(editors.current.values()); setPending(null); setModalError(''); action()
  }
  const saveAndLeave = async () => {
    if (!pending || modalSaving) return
    const action = pending; setModalSaving(true); setModalError('')
    try {
      for (let pass = 0; pass < 5 && dirtyEditorEntries(editors.current.values()).length; pass += 1) {
        await saveDirtyEditors(editors.current.values())
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
      }
      if (dirtyEditorEntries(editors.current.values()).length) throw new Error('The draft changed while it was saving. Your newest edits are still open; choose Save and leave again when ready.')
      setPending(null); action()
    }
    catch (cause) { setModalError(cause instanceof Error ? cause.message : 'Could not save changes. Your draft is still open.') }
    finally { setModalSaving(false) }
  }

  return <UnsavedChangesContext.Provider value={value}>{children}{pending && <div className="modal-backdrop unsaved-backdrop" role="presentation"><section className="unsaved-modal" role="alertdialog" aria-modal="true" aria-labelledby="unsaved-title" aria-describedby="unsaved-description"><span className="eyebrow">Data protection</span><h2 id="unsaved-title">Unsaved changes</h2><p id="unsaved-description">Save your work before leaving, or discard the current draft.</p>{dirty.length > 1 && <ul>{dirty.map((entry) => <li key={entry.id}>{entry.label}</li>)}</ul>}{modalError && <div className="error">{modalError}</div>}<div className="unsaved-actions"><button ref={continueButton} type="button" className="secondary" disabled={modalSaving} onClick={continueEditing}>Continue editing</button><button type="button" className="danger ghost" disabled={modalSaving} onClick={discardAndLeave}>Discard and leave</button><button type="button" disabled={modalSaving} onClick={() => void saveAndLeave()}>{modalSaving ? 'Saving…' : 'Save and leave'}</button></div></section></div>}</UnsavedChangesContext.Provider>
}

export function useUnsavedChanges() {
  const value = useContext(UnsavedChangesContext)
  if (!value) throw new Error('useUnsavedChanges must be used within UnsavedChangesProvider')
  return value
}

export function useUnsavedEditor({ id, label, dirty, saving, save, discard, enabled = true }: EditorRegistration) {
  const registry = useUnsavedChanges()
  const saveRef = useRef(save); const discardRef = useRef(discard)
  saveRef.current = save; discardRef.current = discard
  useLayoutEffect(() => {
    if (!enabled) return
    const entry: UnsavedEditorEntry = { id, label: label ?? id, dirty, saving, save: () => saveRef.current(), discard: () => discardRef.current?.() }
    return registry.register(entry)
  }, [registry, id, enabled])
  useLayoutEffect(() => {
    if (!enabled) return
    registry.update({ id, label: label ?? id, dirty, saving, save: () => saveRef.current(), discard: () => discardRef.current?.() })
  }, [registry, id, label, dirty, saving, enabled])
}
