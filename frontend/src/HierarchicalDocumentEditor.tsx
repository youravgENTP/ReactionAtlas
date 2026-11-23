import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent, type MutableRefObject } from 'react'
import { api } from './api'
import { RichEditor } from './CollectionDocumentEditor'
import type { RichTextValue, StudyBlock, StudyDocument, StudyItem } from './types'
import { addStudyItemAfter, flattenStudyItems, hierarchyMarker, indentStudyItem, newStudyItem, nextStudyItemId, outdentStudyItem, previousStudyItemId, removeStudyItem, updateStudyItem } from './hierarchy'
import { newHierarchyBlock, newTextBlock } from './studyDocument'

type ActivePosition = { blockId: string; itemId?: string }

export function HierarchicalDocumentEditor({ document, placeholder, onChange }: { document: StudyDocument; placeholder?: string; onChange: (document: StudyDocument) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const focusNext = useRef<string | undefined>(undefined)
  const [active, setActive] = useState<ActivePosition | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const blocks = document.blocks.length ? document.blocks : [newTextBlock()]
  const commit = (next: StudyBlock[]) => onChange({ version: 1, blocks: next })
  useEffect(() => {
    if (!focusNext.current) return
    const editor = window.document.querySelector<HTMLElement>(`[data-editor-id="${focusNext.current}"]`)
    if (editor) { editor.focus(); placeCaretAtEnd(editor) }
    focusNext.current = undefined
  }, [document])
  const updateBlock = (id: string, next: StudyBlock) => commit(blocks.map((block) => block.id === id ? next : block))
  const insertBlock = (block: StudyBlock) => {
    const index = active ? blocks.findIndex((item) => item.id === active.blockId) : blocks.length - 1
    const next = [...blocks]; next.splice(Math.max(0, index + 1), 0, block); commit(next)
  }
  const moveBlock = (id: string, amount: number) => {
    const index = blocks.findIndex((block) => block.id === id); const target = index + amount
    if (index < 0 || target < 0 || target >= blocks.length) return
    const next = [...blocks]; [next[index], next[target]] = [next[target], next[index]]; commit(next)
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
    event.preventDefault()
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-editor-id]')
    const itemId = target?.dataset.editorId
    const hierarchy = itemId ? blocks.find((block) => block.type === 'hierarchy' && flattenStudyItems(block.items).some((item) => item.id === itemId)) : undefined
    void upload(file, hierarchy ? { blockId: hierarchy.id, itemId } : active)
  }
  return <div className="study-document-editor" onPaste={pasteImage} onDragOver={(event) => { if ([...event.dataTransfer.items].some((item) => item.type.startsWith('image/'))) event.preventDefault() }} onDrop={dropImage}>
    <div className="study-document-toolbar"><span>Insert</span><button type="button" onClick={() => insertBlock(newTextBlock())}>Paragraph</button><button type="button" onClick={() => insertBlock(newHierarchyBlock())}>Hierarchical list</button><button type="button" disabled={uploading} onClick={() => input.current?.click()}>{uploading ? 'Uploading…' : 'Image'}</button><input ref={input} hidden type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={(event) => void upload(event.target.files?.[0])} /></div>
    <div className="study-document-canvas">
      {blocks.map((block, index) => {
        if (block.type === 'image' && block.anchor_item_id) return null
        return <div className={`study-block ${block.type}`} key={block.id} onFocusCapture={() => setActive({ blockId: block.id })}>
          <BlockControls first={index === 0} last={index === blocks.length - 1} onUp={() => moveBlock(block.id, -1)} onDown={() => moveBlock(block.id, 1)} onRemove={() => commit(blocks.filter((item) => item.id !== block.id))} />
          {block.type === 'text' && <RichEditor placeholder={placeholder ?? 'Write a paragraph…'} value={block.content} onChange={(content) => updateBlock(block.id, { ...block, content })} />}
          {block.type === 'hierarchy' && <HierarchyItems block={block} images={blocks.filter((item): item is Extract<StudyBlock, { type: 'image' }> => item.type === 'image')} onActive={(itemId) => setActive({ blockId: block.id, itemId })} onChange={(items) => updateBlock(block.id, { ...block, items })} onImageChange={(image) => updateBlock(image.id, image)} onImageRemove={(id) => commit(blocks.filter((item) => item.id !== id))} focusNext={focusNext} />}
          {block.type === 'image' && <StudyImage block={block} onChange={(image) => updateBlock(block.id, image)} onRemove={() => commit(blocks.filter((item) => item.id !== block.id))} />}
        </div>
      })}
    </div>
    {error && <small className="rich-image-error">{error}</small>}
  </div>
}

function HierarchyItems({ block, images, onActive, onChange, onImageChange, onImageRemove, focusNext }: { block: Extract<StudyBlock, { type: 'hierarchy' }>; images: Extract<StudyBlock, { type: 'image' }>[]; onActive: (id: string) => void; onChange: (items: StudyItem[]) => void; onImageChange: (image: Extract<StudyBlock, { type: 'image' }>) => void; onImageRemove: (id: string) => void; focusNext: MutableRefObject<string | undefined> }) {
  const keyAction = (event: KeyboardEvent<HTMLDivElement>, id: string, content: RichTextValue) => {
    const source = updateStudyItem(block.items, id, content)
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const targetId = event.key === 'ArrowUp' ? previousStudyItemId(source, id) : nextStudyItemId(source, id)
      if (!targetId) return
      event.preventDefault(); const offset = caretOffset(event.currentTarget); const target = window.document.querySelector<HTMLElement>(`[data-editor-id="${targetId}"]`); target?.focus({ preventScroll: true }); if (target) placeCaretAtOffset(target, offset); return
    }
    if (event.key === 'Tab') { event.preventDefault(); onChange(event.shiftKey ? outdentStudyItem(source, id) : indentStudyItem(source, id)); return }
    if (event.key === 'Enter') { event.preventDefault(); const item = newStudyItem(); focusNext.current = item.id; onChange(addStudyItemAfter(source, id, item)); return }
    if (event.key === 'Backspace' && !content.text && block.items.length) {
      const previous = previousStudyItemId(source, id); if (!previous) return
      event.preventDefault(); focusNext.current = previous; onChange(removeStudyItem(source, id))
    }
  }
  return <div className="hierarchy-editor"><HierarchyRows items={block.items} depth={0} images={images} onActive={onActive} onChange={(id, content) => onChange(updateStudyItem(block.items, id, content))} onKeyAction={keyAction} onImageChange={onImageChange} onImageRemove={onImageRemove} /></div>
}

function HierarchyRows({ items, depth, images, onActive, onChange, onKeyAction, onImageChange, onImageRemove }: { items: StudyItem[]; depth: number; images: Extract<StudyBlock, { type: 'image' }>[]; onActive: (id: string) => void; onChange: (id: string, content: RichTextValue) => void; onKeyAction: (event: KeyboardEvent<HTMLDivElement>, id: string, content: RichTextValue) => void; onImageChange: (image: Extract<StudyBlock, { type: 'image' }>) => void; onImageRemove: (id: string) => void }) {
  return <>{items.map((item, index) => {
    const before = images.filter((image) => image.anchor_item_id === item.id && image.anchor_side === 'before')
    const after = images.filter((image) => image.anchor_item_id === item.id && image.anchor_side !== 'before')
    return <div className="hierarchy-node" key={item.id}>{before.map((image) => <StudyImage key={image.id} block={image} onChange={onImageChange} onRemove={() => onImageRemove(image.id)} />)}<div className={`hierarchy-row depth-${Math.min(depth, 3)}`}><span className="hierarchy-marker">{hierarchyMarker(depth, index)}</span><RichEditor compact singleLine editorId={item.id} placeholder="List item…" value={{ text: item.text, html: item.html }} onEditorFocus={() => onActive(item.id)} onEditorKeyDown={(event, content) => onKeyAction(event, item.id, content)} onChange={(content) => onChange(item.id, content)} /></div>{after.map((image) => <StudyImage key={image.id} block={image} onChange={onImageChange} onRemove={() => onImageRemove(image.id)} />)}{item.children?.length ? <div className="hierarchy-children"><HierarchyRows items={item.children} depth={depth + 1} images={images} onActive={onActive} onChange={onChange} onKeyAction={onKeyAction} onImageChange={onImageChange} onImageRemove={onImageRemove} /></div> : null}</div>
  })}</>
}

function StudyImage({ block, onChange, onRemove }: { block: Extract<StudyBlock, { type: 'image' }>; onChange: (block: Extract<StudyBlock, { type: 'image' }>) => void; onRemove: () => void }) {
  return <figure className={`study-image ${block.align}`} style={{ width: `${block.width_percent}%` }}><img src={`/api/media/${block.media_asset_id}/content`} alt="Study content" /><figcaption><input aria-label="Image width" type="range" min="15" max="100" value={block.width_percent} onChange={(event) => onChange({ ...block, width_percent: Number(event.target.value) })} /><span>{(['left', 'center', 'right'] as const).map((align) => <button type="button" className={block.align === align ? 'active' : ''} key={align} onClick={() => onChange({ ...block, align })}>{align}</button>)}</span>{block.anchor_item_id && <button type="button" onClick={() => onChange({ ...block, anchor_side: block.anchor_side === 'before' ? 'after' : 'before' })}>{block.anchor_side === 'before' ? 'Move after' : 'Move before'}</button>}<button type="button" onClick={onRemove}>Remove</button></figcaption></figure>
}

function BlockControls({ first, last, onUp, onDown, onRemove }: { first: boolean; last: boolean; onUp: () => void; onDown: () => void; onRemove: () => void }) {
  return <div className="study-block-controls"><button type="button" aria-label="Move block up" disabled={first} onClick={onUp}>↑</button><button type="button" aria-label="Move block down" disabled={last} onClick={onDown}>↓</button><button type="button" aria-label="Remove block" onClick={onRemove}>×</button></div>
}

function caretOffset(element: HTMLElement) { const selection = window.getSelection(); if (!selection?.rangeCount || !element.contains(selection.anchorNode)) return 0; const range = selection.getRangeAt(0).cloneRange(); range.selectNodeContents(element); range.setEnd(selection.anchorNode!, selection.anchorOffset); return range.toString().length }
function placeCaretAtEnd(element: HTMLElement) { const range = window.document.createRange(); range.selectNodeContents(element); range.collapse(false); const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range) }
function placeCaretAtOffset(element: HTMLElement, offset: number) { const walker = window.document.createTreeWalker(element, NodeFilter.SHOW_TEXT); let remaining = offset; while (walker.nextNode()) { const node = walker.currentNode as Text; if (remaining <= node.length) { const range = window.document.createRange(); range.setStart(node, remaining); range.collapse(true); const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); return } remaining -= node.length } placeCaretAtEnd(element) }
