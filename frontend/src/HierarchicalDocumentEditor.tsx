import { createContext, useContext, useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { api } from './api'
import { useLatex } from './latex'
import { formatScriptHtml, normalizeScriptNodes, normalizeTextNodes, sanitizeRichHtml } from './richText'
import type { RichTextValue, StudyBlock, StudyDocument, StudyItem } from './types'
import { addStudyItemAfter, flattenStudyItems, hierarchyMarker, indentStudyItem, newStudyItem, nextStudyItemId, outdentStudyItem, previousStudyItemId, removeStudyItem, updateStudyItem } from './hierarchy'
import { newHierarchyBlock, newTextBlock } from './studyDocument'
import { useInternalLinkPicker } from './InternalLinkPicker'
import { itemLink, useSourceAnnotations, type AnnotationSource } from './annotations'
import type { Annotation } from './types'

type ActivePosition = { blockId: string; itemId?: string }
export interface HierarchyImage { id: string; type: 'image'; media_asset_id: string; width_percent: number; align: 'left' | 'center' | 'right'; anchor_item_id?: string; anchor_side?: 'before' | 'after' }
interface AnnotationUi { source: AnnotationSource; annotations: Annotation[]; savingItem: string; create: (kind: 'drxn' | 'question', item: StudyItem, source: AnnotationSource) => Promise<void>; remove: (annotation: Annotation) => Promise<void> }
const AnnotationContext = createContext<AnnotationUi | null>(null)

export function HierarchicalDocumentEditor({ document, placeholder, targetItemId, annotationSource, onChange }: { document: StudyDocument; placeholder?: string; targetItemId?: string; annotationSource?: Omit<AnnotationSource, 'blockId'>; onChange: (document: StudyDocument) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [active, setActive] = useState<ActivePosition | null>(null)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const blocks = document.blocks.length ? document.blocks : [newTextBlock()]
  const commit = (next: StudyBlock[]) => onChange({ version: 1, blocks: next })
  const targetExists = !targetItemId || blocks.some((block) => block.type === 'hierarchy' && flattenStudyItems(block.items).some((item) => item.id === targetItemId))

  useEffect(() => {
    if (!targetItemId || !targetExists) return
    const frame = window.requestAnimationFrame(() => {
      const target = window.document.querySelector<HTMLElement>(`[data-study-item="${targetItemId}"]`)
      target?.scrollIntoView({ block: 'center', behavior: 'smooth' }); target?.classList.add('deep-link-highlight')
      if (target) window.setTimeout(() => target.classList.remove('deep-link-highlight'), 3000)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [targetItemId, targetExists])

  const updateBlock = (id: string, next: StudyBlock) => commit(blocks.map((block) => block.id === id ? next : block))
  const anchorImage = (imageId: string, itemId: string, side: 'before' | 'after') => commit(blocks.map((block) => block.id === imageId && block.type === 'image' ? { ...block, anchor_item_id: itemId, anchor_side: side } : block))
  const updateHierarchy = (id: string, items: StudyItem[]) => {
    const current = blocks.find((block) => block.id === id)
    const remaining = new Set(flattenStudyItems(items).map((item) => item.id))
    const removed = new Set(current?.type === 'hierarchy' ? flattenStudyItems(current.items).filter((item) => !remaining.has(item.id)).map((item) => item.id) : [])
    commit(blocks
      .filter((block) => block.type !== 'image' || !block.anchor_item_id || !removed.has(block.anchor_item_id))
      .map((block) => block.id === id && block.type === 'hierarchy' ? { ...block, items } : block))
  }
  const insertBlock = (block: StudyBlock) => {
    const index = active ? blocks.findIndex((item) => item.id === active.blockId) : blocks.length - 1
    const next = [...blocks]; next.splice(Math.max(0, index + 1), 0, block); commit(next)
  }
  const moveBlock = (id: string, amount: number) => {
    const flow = blocks.filter((block) => block.type !== 'image' || !block.anchor_item_id)
    const flowIndex = flow.findIndex((block) => block.id === id); const target = flowIndex + amount
    if (flowIndex < 0 || target < 0 || target >= flow.length) return
    const index = blocks.findIndex((block) => block.id === id); const targetIndex = blocks.findIndex((block) => block.id === flow[target].id)
    const next = [...blocks]; [next[index], next[targetIndex]] = [next[targetIndex], next[index]]; commit(next)
  }
  const removeBlock = (block: StudyBlock) => {
    if (block.type === 'hierarchy' && annotationSource && !window.confirm('Delete this hierarchy block? Any annotations on its items will be retained as missing-source records.')) return
    const itemIds = block.type === 'hierarchy' ? new Set(flattenStudyItems(block.items).map((item) => item.id)) : new Set<string>()
    commit(blocks.filter((candidate) => candidate.id !== block.id && (candidate.type !== 'image' || !candidate.anchor_item_id || !itemIds.has(candidate.anchor_item_id))))
  }
  const upload = async (file?: File, position = active) => {
    if (!file || !file.type.startsWith('image/')) return
    setUploading(true); setError('')
    try {
      const asset = await api.uploadImage(file)
      const image: StudyBlock = { id: crypto.randomUUID(), type: 'image', media_asset_id: asset.id, width_percent: 55, align: 'center', ...(position?.itemId ? { anchor_item_id: position.itemId, anchor_side: 'after' as const } : {}) }
      const index = position ? blocks.findIndex((block) => block.id === position.blockId) : blocks.length - 1
      const next = [...blocks]; next.splice(Math.max(0, index + 1), 0, image); commit(next)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not upload image') }
    finally { setUploading(false); if (input.current) input.current.value = '' }
  }
  const pasteImage = (event: ClipboardEvent<HTMLDivElement>) => {
    const file = [...event.clipboardData.items].find((item) => item.type.startsWith('image/'))?.getAsFile() ?? undefined
    if (!file) return
    event.preventDefault(); event.stopPropagation(); void upload(file)
  }
  const dropImage = (event: DragEvent<HTMLDivElement>) => {
    const file = [...event.dataTransfer.files].find((item) => item.type.startsWith('image/'))
    if (!file) return
    event.preventDefault(); setDragging(false)
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-study-item]')
    const itemId = target?.dataset.studyItem
    const hierarchy = itemId ? blocks.find((block) => block.type === 'hierarchy' && flattenStudyItems(block.items).some((item) => item.id === itemId)) : undefined
    void upload(file, hierarchy ? { blockId: hierarchy.id, itemId } : active)
  }

  const images = blocks.filter((block): block is HierarchyImage => block.type === 'image')
  const flowIds = blocks.filter((block) => block.type !== 'image' || !block.anchor_item_id).map((block) => block.id)
  return <div className={`study-document-editor ${dragging ? 'dragging' : ''}`} onPaste={pasteImage} onDragOver={(event) => { if ([...event.dataTransfer.items].some((item) => item.type.startsWith('image/'))) { event.preventDefault(); setDragging(true) } }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false) }} onDrop={dropImage}>
    <div className="study-document-canvas">
      {blocks.map((block) => {
        if (block.type === 'image' && block.anchor_item_id) return null
        return <div className={`study-flow-block ${block.type}`} key={block.id} onFocusCapture={() => setActive({ blockId: block.id })}>
          {block.type !== 'image' && <BlockControls first={flowIds.indexOf(block.id) === 0} last={flowIds.indexOf(block.id) === flowIds.length - 1} onUp={() => moveBlock(block.id, -1)} onDown={() => moveBlock(block.id, 1)} onRemove={() => removeBlock(block)} />}
          {block.type === 'text' && <StudyRichInput multiline placeholder={placeholder ?? 'Write a paragraph…'} value={block.content} onFocus={() => setActive({ blockId: block.id })} onChange={(content) => updateBlock(block.id, { ...block, content })} />}
          {block.type === 'hierarchy' && <HierarchyEditor items={block.items} images={images} annotationSource={annotationSource ? { ...annotationSource, blockId: block.id } : undefined} onActive={(itemId) => setActive({ blockId: block.id, itemId })} onChange={(items) => updateHierarchy(block.id, items)} onImageAnchor={anchorImage} onImageChange={(image) => updateBlock(image.id, image)} onImageRemove={(id) => commit(blocks.filter((item) => item.id !== id))} />}
          {block.type === 'image' && <StudyImage block={block} onChange={(image) => updateBlock(block.id, image)} onRemove={() => removeBlock(block)} />}
        </div>
      })}
    </div>
    <div className="study-insert-row"><span>Insert</span><button type="button" onClick={() => insertBlock(newTextBlock())}>Paragraph</button><button type="button" onClick={() => insertBlock(newHierarchyBlock())}>Hierarchy</button><button type="button" disabled={uploading} onClick={() => input.current?.click()}>{uploading ? 'Uploading…' : 'Image'}</button><small>or paste/drop an image</small><input ref={input} hidden type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={(event) => void upload(event.target.files?.[0])} /></div>
    {dragging && <div className="study-image-drop-overlay">Drop image to insert</div>}
    {error && <small className="rich-image-error">{error}</small>}
    {targetItemId && !targetExists && <div className="missing-target">The linked hierarchy item no longer exists.</div>}
  </div>
}

export function HierarchyEditor({ items, images = [], targetItemId, annotationSource, onActive = () => undefined, onChange, onImageAnchor = () => undefined, onImageChange = () => undefined, onImageRemove = () => undefined }: { items: StudyItem[]; images?: HierarchyImage[]; targetItemId?: string; annotationSource?: AnnotationSource; onActive?: (id: string) => void; onChange: (items: StudyItem[]) => void; onImageAnchor?: (imageId: string, itemId: string, side: 'before' | 'after') => void; onImageChange?: (image: HierarchyImage) => void; onImageRemove?: (id: string) => void }) {
  const focusNext = useRef<string | undefined>(undefined)
  const annotationState = useSourceAnnotations(annotationSource)
  const scopedAnnotations = annotationState.annotations.filter((annotation) => annotation.document_field === annotationSource?.field && (!annotationSource?.blockId || annotation.block_id === annotationSource.blockId))
  const removeItem = (source: StudyItem[], id: string) => {
    if (scopedAnnotations.some((annotation) => annotation.item_id === id) && !window.confirm('This item has annotations. Delete the note item and retain its Questions as missing-source records?')) return source
    return removeStudyItem(source, id)
  }
  useEffect(() => {
    if (!focusNext.current) return
    const editor = window.document.querySelector<HTMLElement>(`[data-study-item="${focusNext.current}"]`)
    if (editor) { editor.focus(); placeCaretAtEnd(editor) }
    focusNext.current = undefined
  }, [items])
  useEffect(() => {
    if (!targetItemId) return
    const frame = window.requestAnimationFrame(() => {
      const target = window.document.querySelector<HTMLElement>(`[data-study-item="${targetItemId}"]`)
      target?.scrollIntoView({ block: 'center', behavior: 'smooth' }); target?.classList.add('deep-link-highlight')
      if (target) window.setTimeout(() => target.classList.remove('deep-link-highlight'), 3000)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [targetItemId])
  const keyAction = (event: KeyboardEvent<HTMLDivElement>, id: string, content: RichTextValue) => {
    const source = updateStudyItem(items, id, content)
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const targetId = event.key === 'ArrowUp' ? previousStudyItemId(source, id) : nextStudyItemId(source, id)
      if (!targetId) return
      event.preventDefault(); const offset = caretOffset(event.currentTarget); const target = window.document.querySelector<HTMLElement>(`[data-study-item="${targetId}"]`); target?.focus({ preventScroll: true }); if (target) placeCaretAtOffset(target, offset); return
    }
    if (event.key === 'Tab') { event.preventDefault(); onChange(event.shiftKey ? outdentStudyItem(source, id) : indentStudyItem(source, id)); return }
    if (event.key === 'Enter') { event.preventDefault(); const item = newStudyItem(); focusNext.current = item.id; onChange(addStudyItemAfter(source, id, item)); return }
    if (event.key === 'Backspace' && !content.text && items.length) {
      const previous = previousStudyItemId(source, id)
      event.preventDefault(); focusNext.current = previous; onChange(removeItem(source, id))
    }
  }
  const addFirst = () => { const item = newStudyItem(); focusNext.current = item.id; onChange([item]) }
  const content = items.length ? <HierarchyRows items={items} depth={0} images={images} onActive={onActive} onChange={(id, value) => onChange(updateStudyItem(items, id, value))} onKeyAction={keyAction} onRemove={(id) => onChange(removeItem(items, id))} onImageAnchor={onImageAnchor} onImageChange={onImageChange} onImageRemove={onImageRemove} /> : <button type="button" className="hierarchy-empty-add" onClick={addFirst}>+ Add list item</button>
  const annotationUi = annotationSource ? { source: annotationSource, annotations: scopedAnnotations, savingItem: annotationState.savingItem, create: annotationState.create, remove: annotationState.remove } : null
  return <div className="hierarchy-editor">{annotationState.error && <div className="annotation-error">{annotationState.error}</div>}{annotationUi ? <AnnotationContext.Provider value={annotationUi}>{content}</AnnotationContext.Provider> : content}</div>
}

function HierarchyRows({ items, depth, images, onActive, onChange, onKeyAction, onRemove, onImageAnchor, onImageChange, onImageRemove }: { items: StudyItem[]; depth: number; images: HierarchyImage[]; onActive: (id: string) => void; onChange: (id: string, content: RichTextValue) => void; onKeyAction: (event: KeyboardEvent<HTMLDivElement>, id: string, content: RichTextValue) => void; onRemove: (id: string) => void; onImageAnchor: (imageId: string, itemId: string, side: 'before' | 'after') => void; onImageChange: (image: HierarchyImage) => void; onImageRemove: (id: string) => void }) {
  const annotationUi = useContext(AnnotationContext)
  return <>{items.map((item, index) => {
    const before = images.filter((image) => image.anchor_item_id === item.id && image.anchor_side === 'before')
    const after = images.filter((image) => image.anchor_item_id === item.id && image.anchor_side !== 'before')
    const imageSlot = (side: 'before' | 'after') => ({
      onDragOver: (event: DragEvent<HTMLDivElement>) => { if (!event.dataTransfer.types.includes('application/x-reactionatlas-study-image')) return; event.preventDefault(); event.stopPropagation(); window.document.querySelectorAll('.hierarchy-image-slot.active').forEach((slot) => slot.classList.remove('active')); event.currentTarget.classList.add('active') },
      onDragLeave: (event: DragEvent<HTMLDivElement>) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) event.currentTarget.classList.remove('active') },
      onDrop: (event: DragEvent<HTMLDivElement>) => { const imageId = event.dataTransfer.getData('application/x-reactionatlas-study-image'); if (!imageId) return; event.preventDefault(); event.stopPropagation(); event.currentTarget.classList.remove('active'); onImageAnchor(imageId, item.id, side) },
    })
    return <div className="hierarchy-node" key={item.id}>
      <div className="hierarchy-image-slot" {...imageSlot('before')}>{before.map((image) => <StudyImage key={image.id} block={image} onChange={onImageChange} onRemove={() => onImageRemove(image.id)} />)}</div>
      <div className={`hierarchy-row depth-${Math.min(depth, 3)}`}><span className="hierarchy-marker">{hierarchyMarker(depth, index)}</span><StudyRichInput editorId={item.id} placeholder="List item…" value={{ text: item.text, html: item.html }} onFocus={() => onActive(item.id)} onKeyAction={(event, content) => onKeyAction(event, item.id, content)} onRemove={() => onRemove(item.id)} onChange={(content) => onChange(item.id, content)} />{annotationUi && <HierarchyAnnotationControls item={item} ui={annotationUi} />}</div>
      <div className="hierarchy-image-slot" {...imageSlot('after')}>{after.map((image) => <StudyImage key={image.id} block={image} onChange={onImageChange} onRemove={() => onImageRemove(image.id)} />)}</div>
      {item.children?.length ? <div className="hierarchy-children"><HierarchyRows items={item.children} depth={depth + 1} images={images} onActive={onActive} onChange={onChange} onKeyAction={onKeyAction} onRemove={onRemove} onImageAnchor={onImageAnchor} onImageChange={onImageChange} onImageRemove={onImageRemove} /></div> : null}
    </div>
  })}</>
}

function HierarchyAnnotationControls({ item, ui }: { item: StudyItem; ui: AnnotationUi }) {
  const annotations = ui.annotations.filter((annotation) => annotation.item_id === item.id)
  const question = annotations.find((annotation) => annotation.kind === 'question')
  const drxn = annotations.find((annotation) => annotation.kind === 'drxn')
  const copy = async () => {
    const href = new URL(itemLink(ui.source, item.id), window.location.origin).href
    try { await navigator.clipboard.writeText(href) } catch { window.prompt('Copy link to item', href) }
  }
  return <div className="hierarchy-annotation-controls">{drxn && <span className="annotation-badge drxn" title={drxn.stable_code ?? 'Drug-specific reaction'}>{drxn.stable_code}</span>}{question && <span className={`annotation-badge question ${question.status}`}>Q · {question.status?.replace('_', ' ')}</span>}{ui.savingItem === item.id && <span className="annotation-saving">Saving…</span>}<div className="annotation-menu"><button type="button" disabled={ui.savingItem === item.id} onMouseDown={(event) => event.preventDefault()} onClick={() => void copy()} title="Copy link to item">Link</button>{!question && <button type="button" disabled={ui.savingItem === item.id || ui.source.unsaved} onMouseDown={(event) => event.preventDefault()} onClick={() => void ui.create('question', item, ui.source)} title={ui.source.unsaved ? 'Save the document first' : 'Mark as Question'}>Q</button>}{ui.source.allowDrxn && !drxn && <button type="button" disabled={ui.savingItem === item.id || ui.source.unsaved} onMouseDown={(event) => event.preventDefault()} onClick={() => void ui.create('drxn', item, ui.source)} title={ui.source.unsaved ? 'Save the document first' : 'Mark as DRxn'}>DRxn</button>}{annotations.map((annotation) => <button type="button" className="annotation-remove" key={annotation.id} disabled={ui.savingItem === item.id} onMouseDown={(event) => event.preventDefault()} onClick={() => void ui.remove(annotation)} title={`Remove ${annotation.kind} annotation`}>×{annotation.kind === 'drxn' ? 'D' : 'Q'}</button>)}</div></div>
}

function StudyRichInput({ value, multiline = false, editorId, placeholder, onFocus, onKeyAction, onRemove, onChange }: { value: RichTextValue; multiline?: boolean; editorId?: string; placeholder: string; onFocus?: () => void; onKeyAction?: (event: KeyboardEvent<HTMLDivElement>, content: RichTextValue) => void; onRemove?: () => void; onChange: (value: RichTextValue) => void }) {
  const editor = useRef<HTMLDivElement>(null)
  const savedRange = useRef<Range | null>(null)
  const composing = useRef(false)
  const { shortcuts } = useLatex()
  useEffect(() => {
    const node = editor.current
    if (!node || window.document.activeElement === node) return
    const desired = value.html !== undefined ? sanitizeRichHtml(value.html) : formatScriptHtml(escapeHtml(value.text).replace(/\n/g, '<br>'))
    if (node.innerHTML !== desired) node.innerHTML = desired
  }, [value.html, value.text])
  const content = (): RichTextValue => {
    const node = editor.current!
    const text = multiline ? node.innerText.replace(/\r\n?/g, '\n') : node.innerText.replace(/\n/g, '')
    return { text, html: sanitizeRichHtml(node.innerHTML) }
  }
  const rememberSelection = () => { const selection = window.getSelection(); if (selection?.rangeCount && editor.current?.contains(selection.anchorNode)) savedRange.current = selection.getRangeAt(0).cloneRange() }
  const emit = (includeEnd = false) => { const node = editor.current; if (!node) return; normalizeTextNodes(node, shortcuts, includeEnd); normalizeScriptNodes(node, includeEnd); const next = content(); rememberSelection(); onChange(next) }
  const links = useInternalLinkPicker(editor, () => emit())
  const command = (name: string, commandValue?: string) => {
    const node = editor.current; if (!node) return
    node.focus({ preventScroll: true })
    if (savedRange.current) { const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(savedRange.current) }
    if (name === 'superscript' && window.document.queryCommandState('subscript')) window.document.execCommand('subscript')
    if (name === 'subscript' && window.document.queryCommandState('superscript')) window.document.execCommand('superscript')
    window.document.execCommand(name, false, commandValue); emit()
  }
  return <div className={`study-rich-input-wrap ${multiline ? 'multiline' : ''}`}>
    <div ref={editor} className="study-rich-input" contentEditable role="textbox" aria-multiline={multiline} aria-label={placeholder} suppressContentEditableWarning data-study-item={editorId} data-placeholder={placeholder} onFocus={onFocus} onClick={links.handleClick} onCompositionStart={() => { composing.current = true }} onCompositionEnd={() => { composing.current = false; emit() }} onInput={() => { if (!composing.current) emit() }} onBlur={() => { composing.current = false; emit(true) }} onMouseUp={rememberSelection} onKeyUp={rememberSelection} onKeyDown={(event) => {
      if (event.nativeEvent.isComposing || composing.current) return
      if (links.openPicker(event)) return
      if ((event.metaKey || event.ctrlKey) && ['b', 'i', 'u'].includes(event.key.toLowerCase())) { event.preventDefault(); command({ b: 'bold', i: 'italic', u: 'underline' }[event.key.toLowerCase()]!); return }
      if (onKeyAction && (event.key === 'Enter' || event.key === 'Tab')) emit(true)
      if (onKeyAction) { onKeyAction(event, content()); if (event.defaultPrevented) return }
    }} />
    <div className="study-rich-actions"><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => command('bold')} title="Bold"><b>B</b></button><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => command('italic')} title="Italic"><i>I</i></button><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => command('underline')} title="Underline"><u>U</u></button><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => command('superscript')} title="Superscript">x<sup>2</sup></button><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => command('subscript')} title="Subscript">x<sub>2</sub></button><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => command('hiliteColor', '#fff1a8')} title="Highlight">▰</button><label title="Text color">A<input aria-label="Text color" type="color" onMouseDown={rememberSelection} onChange={(event) => command('foreColor', event.target.value)} /></label>{onRemove && <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={onRemove} title="Remove item">×</button>}</div>{links.picker}
  </div>
}

export function StudyImage({ block, onChange, onRemove }: { block: HierarchyImage; onChange: (block: HierarchyImage) => void; onRemove: () => void }) {
  const beginResize = (event: ReactPointerEvent<HTMLButtonElement>, side: 'left' | 'right') => {
    event.preventDefault(); event.stopPropagation()
    const figure = event.currentTarget.closest('figure'); const containerWidth = figure?.parentElement?.clientWidth || 1
    const startX = event.clientX; const startWidth = block.width_percent
    const calculate = (clientX: number) => Math.max(15, Math.min(100, startWidth + (clientX - startX) / containerWidth * 100 * (side === 'left' ? -1 : 1)))
    const move = (pointer: PointerEvent) => { if (figure) figure.style.width = `${calculate(pointer.clientX)}%` }
    const end = (pointer: PointerEvent) => { const width = Math.round(calculate(pointer.clientX)); onChange({ ...block, width_percent: width }); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', end, { once: true })
  }
  return <figure draggable className={`study-image ${block.align}`} style={{ width: `${block.width_percent}%` }} tabIndex={0} onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-reactionatlas-study-image', block.id) }}><img src={`/api/media/${block.media_asset_id}/content`} draggable={false} alt="Study content" />{(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map((corner) => <button type="button" draggable={false} aria-label="Resize image" className={`study-image-resize ${corner}`} key={corner} onPointerDown={(event) => beginResize(event, corner.endsWith('left') ? 'left' : 'right')} />)}<div className="study-image-toolbar">{(['left', 'center', 'right'] as const).map((align) => <button type="button" draggable={false} className={block.align === align ? 'active' : ''} key={align} onClick={() => onChange({ ...block, align })} title={`Align ${align}`}>{align.at(0)?.toUpperCase()}</button>)}{block.anchor_item_id && <button type="button" draggable={false} onClick={() => onChange({ ...block, anchor_side: block.anchor_side === 'before' ? 'after' : 'before' })}>{block.anchor_side === 'before' ? 'After' : 'Before'}</button>}<button type="button" draggable={false} onClick={onRemove} title="Remove image">×</button></div></figure>
}

function BlockControls({ first, last, onUp, onDown, onRemove }: { first: boolean; last: boolean; onUp: () => void; onDown: () => void; onRemove: () => void }) {
  return <div className="study-block-controls"><button type="button" aria-label="Move block up" disabled={first} onClick={onUp}>↑</button><button type="button" aria-label="Move block down" disabled={last} onClick={onDown}>↓</button><button type="button" aria-label="Remove block" onClick={onRemove}>×</button></div>
}

function escapeHtml(value: string) { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
function caretOffset(element: HTMLElement) { const selection = window.getSelection(); if (!selection?.rangeCount || !element.contains(selection.anchorNode)) return 0; const range = selection.getRangeAt(0).cloneRange(); range.selectNodeContents(element); range.setEnd(selection.anchorNode!, selection.anchorOffset); return range.toString().length }
function placeCaretAtEnd(element: HTMLElement) { const range = window.document.createRange(); range.selectNodeContents(element); range.collapse(false); const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range) }
function placeCaretAtOffset(element: HTMLElement, offset: number) { const walker = window.document.createTreeWalker(element, NodeFilter.SHOW_TEXT); let remaining = offset; let last: Text | undefined; while (walker.nextNode()) { const node = walker.currentNode as Text; last = node; if (remaining <= node.length) { const range = window.document.createRange(); range.setStart(node, remaining); range.collapse(true); const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); return } remaining -= node.length } if (last) { const range = window.document.createRange(); range.setStart(last, last.length); range.collapse(true); const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); return } placeCaretAtEnd(element) }
