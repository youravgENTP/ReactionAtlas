import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'
import type { Annotation, AnnotationSourceType, StudyItem } from './types'
import { annotationItemHref } from './annotationCore'

export interface AnnotationSource {
  sourceType: AnnotationSourceType
  entityId: number
  field: string
  blockId?: string
  rootHref: string
  allowDrxn?: boolean
  unsaved?: boolean
}

export function useSourceAnnotations(source?: Pick<AnnotationSource, 'sourceType' | 'entityId'>) {
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [error, setError] = useState('')
  const [savingItem, setSavingItem] = useState('')
  const loadVersion = useRef(0)
  const reload = useCallback(async () => {
    const version = ++loadVersion.current
    if (!source) { setAnnotations([]); return }
    try { const next = await api.annotations({ source_type: source.sourceType, source_entity_id: source.entityId }); if (version === loadVersion.current) { setAnnotations(next); setError('') } }
    catch (cause) { if (version === loadVersion.current) setError(cause instanceof Error ? cause.message : 'Could not load annotations') }
  }, [source?.sourceType, source?.entityId])
  useEffect(() => { void reload() }, [reload])
  useEffect(() => {
    const changed = (event: Event) => {
      const detail = (event as CustomEvent<{ sourceType: AnnotationSourceType; entityId: number }>).detail
      if (source && detail?.sourceType === source.sourceType && detail.entityId === source.entityId) void reload()
    }
    window.addEventListener('reactionatlas:annotations-changed', changed)
    return () => window.removeEventListener('reactionatlas:annotations-changed', changed)
  }, [reload, source?.sourceType, source?.entityId])
  const create = async (kind: 'drxn' | 'question', item: StudyItem, detail: AnnotationSource) => {
    if (detail.unsaved) { setError('Save the document before adding an annotation.'); return }
    const questionText = kind === 'question' ? window.prompt('Question prompt', item.text)?.trim() : undefined
    if (kind === 'question' && !questionText) return
    setSavingItem(item.id); setError('')
    try { const created = await api.createAnnotation({ kind, source_type: detail.sourceType, source_entity_id: detail.entityId, document_field: detail.field, block_id: detail.blockId, item_id: item.id, question_text: questionText }); setAnnotations((current) => [...current.filter((annotation) => annotation.id !== created.id), created]); window.dispatchEvent(new CustomEvent('reactionatlas:annotations-changed', { detail: { sourceType: detail.sourceType, entityId: detail.entityId } })) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save annotation') }
    finally { setSavingItem('') }
  }
  const remove = async (annotation: Annotation) => {
    setSavingItem(annotation.item_id); setError('')
    try { await api.deleteAnnotation(annotation.id); setAnnotations((current) => current.filter((item) => item.id !== annotation.id)); window.dispatchEvent(new CustomEvent('reactionatlas:annotations-changed', { detail: { sourceType: annotation.source_type, entityId: annotation.source_entity_id } })) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not remove annotation') }
    finally { setSavingItem('') }
  }
  return { annotations, error, savingItem, create, remove, reload }
}

export function itemLink(source: AnnotationSource, itemId: string) {
  return annotationItemHref(source, itemId)
}
