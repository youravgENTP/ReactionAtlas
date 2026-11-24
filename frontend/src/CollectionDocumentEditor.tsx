import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent, type MouseEvent } from 'react'
import { api } from './api'
import { useLatex } from './latex'
import type { CollectionBlock, CollectionDocument, Reaction, RichTextValue } from './types'
import { RichFormattedText } from './inlineMarkup'
import { formatScriptHtml, normalizeScriptNodes, normalizeTextNodes, sanitizeRichHtml } from './richText'
import { flattenStudyItems } from './hierarchy'
import { HierarchyEditor, StudyImage, type HierarchyImage } from './HierarchicalDocumentEditor'
import { newCollectionBlock } from './collectionDocument'
import { useInternalLinkPicker } from './InternalLinkPicker'

export function CollectionDocumentEditor({ document, reactions, targetItemId, onChange, onOpenReaction }: {
  document: CollectionDocument
  reactions: Reaction[]
  targetItemId?: string
  onChange: (document: CollectionDocument) => void
  onOpenReaction: (code: string) => void
}) {
  const blocks = document.blocks
  const commit = (next: CollectionBlock[]) => onChange({ version: 1, blocks: next })
  const add = (type: CollectionBlock['type']) => commit([...blocks, newCollectionBlock(type, reactions[0]?.id ?? null)])
  const update = (index: number, block: CollectionBlock) => commit(blocks.map((item, i) => i === index ? block : item))
  const flow = blocks.filter((block) => block.type !== 'image' || !block.anchor_item_id)
  const move = (blockId: string, amount: number) => {
    const flowIndex = flow.findIndex((block) => block.id === blockId); const target = flowIndex + amount
    if (flowIndex < 0 || target < 0 || target >= flow.length) return
    const index = blocks.findIndex((block) => block.id === blockId); const targetIndex = blocks.findIndex((block) => block.id === flow[target].id)
    const next = [...blocks]; [next[index], next[targetIndex]] = [next[targetIndex], next[index]]; commit(next)
  }
  const remove = (block: CollectionBlock) => {
    const itemIds = block.type === 'hierarchy' ? new Set(flattenStudyItems(block.items).map((item) => item.id)) : new Set<string>()
    commit(blocks.filter((candidate) => candidate.id !== block.id && (candidate.type !== 'image' || !candidate.anchor_item_id || !itemIds.has(candidate.anchor_item_id))))
  }
  const updateHierarchy = (block: Extract<CollectionBlock, { type: 'hierarchy' }>, items: typeof block.items) => {
    const remaining = new Set(flattenStudyItems(items).map((item) => item.id))
    const removed = new Set(flattenStudyItems(block.items).filter((item) => !remaining.has(item.id)).map((item) => item.id))
    commit(blocks
      .filter((candidate) => candidate.type !== 'image' || !candidate.anchor_item_id || !removed.has(candidate.anchor_item_id))
      .map((candidate) => candidate.id === block.id ? { ...block, items } : candidate))
  }
  const anchorImage = (imageId: string, itemId: string, side: 'before' | 'after') => commit(blocks.map((block) => block.id === imageId && block.type === 'image' ? { ...block, anchor_item_id: itemId, anchor_side: side } : block))
  const images = blocks.filter((block): block is Extract<CollectionBlock, { type: 'image' }> => block.type === 'image')
  const targetExists = !targetItemId || blocks.some((block) => block.type === 'hierarchy' && flattenStudyItems(block.items).some((item) => item.id === targetItemId))

  return <div className="block-document">
    <div className="block-toolbar"><span>Insert</span><button onClick={() => add('heading')}>Heading</button><button onClick={() => add('text')}>Text</button><button onClick={() => add('hierarchy')}>Hierarchy</button><button onClick={() => add('image')}>Image</button><button disabled={!reactions.length} onClick={() => add('reaction')}>Reaction card</button><button onClick={() => add('divider')}>Divider</button></div>
    <div className="document-canvas">
      {blocks.map((block, index) => block.type === 'image' && block.anchor_item_id ? null : <div className={`document-block ${block.type}`} key={block.id} data-block-id={block.id}>
        <div className="block-controls"><button disabled={flow[0]?.id === block.id} onClick={() => move(block.id, -1)}>↑</button><button disabled={flow.at(-1)?.id === block.id} onClick={() => move(block.id, 1)}>↓</button><button onClick={() => remove(block)}>×</button></div>
        {block.type === 'heading' && <><select className="heading-level" value={block.level} onChange={(event) => update(index, { ...block, level: Number(event.target.value) as 1 | 2 | 3 })}><option value="1">H1</option><option value="2">H2</option><option value="3">H3</option></select><RichEditor value={block.content} heading={block.level} onChange={(content) => update(index, { ...block, content })} /></>}
        {block.type === 'text' && <RichEditor value={block.content} onChange={(content) => update(index, { ...block, content })} />}
        {block.type === 'hierarchy' && <HierarchyEditor items={block.items} images={images} targetItemId={flattenStudyItems(block.items).some((item) => item.id === targetItemId) ? targetItemId : undefined} onChange={(items) => updateHierarchy(block, items)} onImageAnchor={anchorImage} onImageChange={(image: HierarchyImage) => update(indexFor(blocks, image.id), image)} onImageRemove={(imageId) => commit(blocks.filter((item) => item.id !== imageId))} />}
        {block.type === 'image' && (block.media_asset_id ? <StudyImage block={block} onChange={(next) => update(index, next)} onRemove={() => remove(block)} /> : <CollectionImage block={block} onChange={(next) => update(index, next)} />)}
        {block.type === 'reaction' && <ReactionEmbed block={block} reactions={reactions} onChange={(next) => update(index, next)} onOpenReaction={onOpenReaction} />}
        {block.type === 'divider' && <hr />}
      </div>)}
      {!blocks.length && <div className="document-empty"><strong>Build a study document</strong><p>Add rich text, headings, images, dividers, and linked reaction cards.</p><button onClick={() => add('text')}>+ Start writing</button></div>}
    </div>
    {targetItemId && !targetExists && <div className="missing-target">The linked hierarchy item no longer exists.</div>}
  </div>
}

function indexFor(blocks: CollectionBlock[], id: string) { return blocks.findIndex((block) => block.id === id) }

export function RichEditor({ value, heading, singleLine = false, placeholder, allowImages = false, compact = false, editorId, onEditorFocus, onEditorKeyDown, onChange }: { value: RichTextValue; heading?: 1 | 2 | 3; singleLine?: boolean; placeholder?: string; allowImages?: boolean; compact?: boolean; editorId?: string; onEditorFocus?: () => void; onEditorKeyDown?: (event: KeyboardEvent<HTMLDivElement>, value: RichTextValue) => void; onChange: (value: RichTextValue) => void }) {
  const editor = useRef<HTMLDivElement>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const savedRange = useRef<Range | null>(null)
  const composing = useRef(false)
  const finishingComposition = useRef(false)
  const lastEmittedHtml = useRef<string | undefined>(undefined)
  const [selectedImage, setSelectedImage] = useState<HTMLImageElement | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [imageError, setImageError] = useState('')
  const { shortcuts } = useLatex()
  useEffect(() => {
    // HTML emitted while the user is typing may intentionally contain an unfinished
    // trailing _x/^x sequence. Re-formatting it here replaces the editable DOM and
    // drops the browser selection, which makes the field appear to stop accepting
    // input. Only derive script HTML from legacy/plain-text values; emitted HTML is
    // already normalized at the appropriate input boundary.
    const desired = value.html !== undefined
      ? sanitizeRichHtml(value.html)
      : formatScriptHtml(escapeHtml(value.text).replace(/\n/g, '<br>'))
    if (!editor.current || lastEmittedHtml.current === desired) return
    if (editor.current.innerHTML !== desired) { editor.current.innerHTML = desired; setSelectedImage(null) }
    lastEmittedHtml.current = desired
  }, [value.html, value.text])
  const readValue = () => {
    if (!editor.current) return
    const html = sanitizeRichHtml(editor.current.innerHTML)
    const innerText = editor.current.innerText
    const text = innerText.trim() || !editor.current.textContent?.trim() ? innerText : editor.current.textContent
    return { text, html }
  }
  const emit = (includeEnd = false) => {
    if (!editor.current) return
    normalizeTextNodes(editor.current, shortcuts, includeEnd)
    normalizeScriptNodes(editor.current, includeEnd)
    const value = readValue()
    if (!value) return
    const { text, html } = value
    lastEmittedHtml.current = html
    onChange({ text, html })
  }
  const links = useInternalLinkPicker(editor, () => emit())
  const command = (name: string, value?: string) => { document.execCommand(name, false, value); emit() }
  const rememberSelection = () => {
    const selection = window.getSelection()
    if (editor.current && selection?.rangeCount && editor.current.contains(selection.anchorNode)) savedRange.current = selection.getRangeAt(0).cloneRange()
  }
  const uploadImage = async (file?: File, range?: Range | null) => {
    if (!allowImages || !file || !file.type.startsWith('image/')) return
    if (range) savedRange.current = range.cloneRange()
    setUploadingImage(true); setImageError('')
    try {
      const asset = await api.uploadImage(file)
      if (!editor.current) return
      const selection = window.getSelection()
      const insertion = savedRange.current && editor.current.contains(savedRange.current.commonAncestorContainer)
        ? savedRange.current : document.createRange()
      if (!savedRange.current || !editor.current.contains(insertion.commonAncestorContainer)) {
        insertion.selectNodeContents(editor.current); insertion.collapse(false)
      }
      const image = document.createElement('img')
      image.src = asset.content_url
      image.alt = file.name
      image.dataset.mediaId = asset.id
      image.dataset.widthPercent = '55'
      image.dataset.align = 'center'
      image.style.width = '55%'
      insertion.deleteContents(); insertion.insertNode(image)
      const trailingBreak = document.createElement('br')
      image.after(trailingBreak)
      insertion.setStartAfter(trailingBreak); insertion.collapse(true)
      selection?.removeAllRanges(); selection?.addRange(insertion)
      savedRange.current = insertion.cloneRange()
      setSelectedImage(image); emit()
    } catch (cause) { setImageError(cause instanceof Error ? cause.message : 'Could not upload image') }
    finally { setUploadingImage(false); if (imageInput.current) imageInput.current.value = '' }
  }
  const selectImage = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target
    if (target instanceof HTMLImageElement && target.dataset.mediaId) { event.preventDefault(); setSelectedImage(target) }
    else setSelectedImage(null)
  }
  const updateImage = (width: number, align: 'left' | 'center' | 'right') => {
    if (!selectedImage || !editor.current?.contains(selectedImage)) return
    selectedImage.dataset.widthPercent = String(width)
    selectedImage.dataset.align = align
    selectedImage.style.width = `${width}%`
    emit()
  }
  const removeImage = () => {
    if (!selectedImage || !editor.current?.contains(selectedImage)) return
    selectedImage.remove(); setSelectedImage(null); emit()
  }
  const pasteImage = (event: ClipboardEvent<HTMLDivElement>) => {
    if (!allowImages) return
    const file = [...event.clipboardData.items].find((item) => item.type.startsWith('image/'))?.getAsFile() ?? undefined
    if (!file) return
    event.preventDefault(); rememberSelection(); void uploadImage(file, savedRange.current)
  }
  const dropImage = (event: DragEvent<HTMLDivElement>) => {
    if (!allowImages) return
    const file = [...event.dataTransfer.files].find((item) => item.type.startsWith('image/'))
    if (!file) return
    event.preventDefault()
    const pointRange = rangeAtPoint(event.clientX, event.clientY)
    void uploadImage(file, pointRange)
  }
  const imageWidth = Number(selectedImage?.dataset.widthPercent) || 55
  const imageAlign = selectedImage?.dataset.align === 'left' || selectedImage?.dataset.align === 'right' ? selectedImage.dataset.align : 'center'
  return <div className={`rich-editor ${heading ? `heading-${heading}` : ''} ${singleLine ? 'single-line' : ''} ${compact ? 'compact-editor' : ''}`}>
    <div className="rich-toolbar"><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => command('bold')}><b>B</b></button><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => command('italic')}><i>I</i></button><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => command('underline')}><u>U</u></button><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => command('superscript')}>x<sup>2</sup></button><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => command('subscript')}>x<sub>2</sub></button><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => command('hiliteColor', '#fff1a8')}>Highlight</button><span title="Text color"><input aria-label="Text color" type="color" onChange={(e) => command('foreColor', e.target.value)} /></span>{allowImages && <button type="button" disabled={uploadingImage} onMouseDown={(e) => { e.preventDefault(); rememberSelection() }} onClick={() => imageInput.current?.click()}>{uploadingImage ? 'Uploading…' : 'Image'}</button>}</div>
    {allowImages && <input ref={imageInput} hidden type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={(event) => void uploadImage(event.target.files?.[0])} />}
    {selectedImage && <div className="rich-image-controls"><label>Width <input aria-label="Image width" type="range" min="15" max="100" value={imageWidth} onChange={(event) => updateImage(Number(event.target.value), imageAlign)} /></label><span>{imageWidth}%</span>{(['left', 'center', 'right'] as const).map((align) => <button type="button" className={imageAlign === align ? 'active' : ''} key={align} aria-label={`Align image ${align}`} onMouseDown={(event) => event.preventDefault()} onClick={() => updateImage(imageWidth, align)}>{align}</button>)}<button type="button" onMouseDown={(event) => event.preventDefault()} onClick={removeImage}>Remove</button></div>}
    {imageError && <small className="rich-image-error">{imageError}</small>}
    <div ref={editor} contentEditable role="textbox" aria-label={placeholder ?? (heading ? `Heading ${heading}` : 'Rich text')} suppressContentEditableWarning data-editor-id={editorId} data-placeholder={placeholder ?? (heading ? `Heading ${heading}` : 'Write something…')} onFocus={onEditorFocus} onMouseUp={rememberSelection} onKeyUp={rememberSelection} onClick={(event) => { links.handleClick(event); selectImage(event) }} onPaste={pasteImage} onDragOver={(event) => { if (allowImages && [...event.dataTransfer.items].some((item) => item.type.startsWith('image/'))) event.preventDefault() }} onDrop={dropImage} onCompositionStart={() => { composing.current = true; finishingComposition.current = false }} onCompositionEnd={() => { composing.current = false; finishingComposition.current = true; requestAnimationFrame(() => { finishingComposition.current = false; emit() }) }} onInput={() => { if (!composing.current && !finishingComposition.current) emit() }} onBlur={() => { finishingComposition.current = false; emit(true) }} onKeyDown={(event) => {
      if (event.nativeEvent.isComposing || composing.current) return
      if (links.openPicker(event)) return
      if (onEditorKeyDown) {
        if (event.key === 'Enter' || event.key === 'Tab') emit(true)
        const current = readValue(); if (current) onEditorKeyDown(event, current)
        if (event.defaultPrevented) return
      }
      if (singleLine && event.key === 'Enter') { event.preventDefault(); emit(true) }
    }} />{links.picker}
  </div>
}

function CollectionImage({ block, onChange }: { block: Extract<CollectionBlock, { type: 'image' }>; onChange: (block: Extract<CollectionBlock, { type: 'image' }>) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const upload = async (file?: File) => {
    if (!file || !file.type.startsWith('image/')) return
    setBusy(true); setError('')
    try { const asset = await api.uploadImage(file); onChange({ ...block, media_asset_id: asset.id }) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not upload image') }
    finally { setBusy(false) }
  }
  const drop = (event: DragEvent) => { event.preventDefault(); void upload([...event.dataTransfer.files].find((file) => file.type.startsWith('image/'))) }
  if (!block.media_asset_id) return <div className="image-drop" tabIndex={0} onClick={() => input.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={drop} onPaste={(e) => void upload([...e.clipboardData.items].find((item) => item.type.startsWith('image/'))?.getAsFile() ?? undefined)}><strong>{busy ? 'Uploading…' : 'Drop, paste, or choose an image'}</strong><span>JPEG, PNG, GIF, or WebP · max 8 MB</span>{error && <small>{error}</small>}<input ref={input} hidden type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={(e) => void upload(e.target.files?.[0])} /></div>
  return <figure className={`collection-image ${block.align}`} style={{ width: `${block.width_percent}%` }}><img src={`/api/media/${block.media_asset_id}/content`} alt="Collection" /><figcaption><input aria-label="Image width" type="range" min="15" max="100" value={block.width_percent} onChange={(e) => onChange({ ...block, width_percent: Number(e.target.value) })} /><span>{(['left', 'center', 'right'] as const).map((align) => <button className={block.align === align ? 'active' : ''} key={align} onClick={() => onChange({ ...block, align })}>{align}</button>)}</span><button onClick={() => onChange({ ...block, media_asset_id: '' })}>Replace</button></figcaption></figure>
}

function ReactionEmbed({ block, reactions, onChange, onOpenReaction }: { block: Extract<CollectionBlock, { type: 'reaction' }>; reactions: Reaction[]; onChange: (block: Extract<CollectionBlock, { type: 'reaction' }>) => void; onOpenReaction: (code: string) => void }) {
  const reaction = reactions.find((item) => item.id === block.reaction_id)
  return <div className="reaction-embed"><select value={block.reaction_id ?? ''} onChange={(e) => onChange({ ...block, reaction_id: Number(e.target.value) || null })}><option value="">Choose a reaction</option>{reactions.map((item) => <option value={item.id} key={item.id}>{item.display_code} — {item.name}</option>)}</select>{reaction && <button className="embedded-card" onClick={() => onOpenReaction(reaction.display_code)}>{reaction.image && <img src={reaction.image.content_url} alt="" />}<span><small>{reaction.display_code}</small><strong><RichFormattedText text={reaction.name} html={reaction.rich_text.name} /></strong><em><RichFormattedText text={reaction.reaction_class || 'Unclassified'} html={reaction.rich_text.reaction_class} /></em></span></button>}</div>
}

function escapeHtml(value: string) { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }

function rangeAtPoint(x: number, y: number) {
  const chromiumRange = document.caretRangeFromPoint?.(x, y)
  if (chromiumRange) return chromiumRange
  const firefoxDocument = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null }
  const position = firefoxDocument.caretPositionFromPoint?.(x, y)
  if (!position) return null
  const range = document.createRange()
  range.setStart(position.offsetNode, position.offset); range.collapse(true)
  return range
}
