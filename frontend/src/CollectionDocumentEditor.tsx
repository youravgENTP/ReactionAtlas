import { useEffect, useRef, useState, type DragEvent } from 'react'
import { api } from './api'
import { useLatex } from './latex'
import type { CollectionBlock, CollectionDocument, Reaction, RichTextValue } from './types'
import { FormattedText, tokenizeInlineMarkup } from './inlineMarkup'

const id = () => crypto.randomUUID()

export function parseCollectionDocument(source: string): CollectionDocument {
  try {
    const parsed = JSON.parse(source) as CollectionDocument
    if (parsed.version === 1 && Array.isArray(parsed.blocks)) return parsed
  } catch { /* Legacy Markdown becomes a text block below. */ }
  return { version: 1, blocks: source ? [{ id: id(), type: 'text', content: { text: source, html: escapeHtml(source).replace(/\n/g, '<br>') } }] : [] }
}

export function serializeCollectionDocument(document: CollectionDocument) { return JSON.stringify(document) }

export function CollectionDocumentEditor({ document, reactions, onChange, onOpenReaction }: {
  document: CollectionDocument
  reactions: Reaction[]
  onChange: (document: CollectionDocument) => void
  onOpenReaction: (code: string) => void
}) {
  const blocks = document.blocks
  const commit = (next: CollectionBlock[]) => onChange({ version: 1, blocks: next })
  const add = (type: CollectionBlock['type']) => {
    const block: CollectionBlock = type === 'heading' ? { id: id(), type, level: 2, content: { text: '' } }
      : type === 'text' ? { id: id(), type, content: { text: '' } }
      : type === 'image' ? { id: id(), type, media_asset_id: '', width_percent: 55, align: 'center' }
      : type === 'reaction' ? { id: id(), type, reaction_id: reactions[0]?.id ?? null }
      : { id: id(), type: 'divider' }
    commit([...blocks, block])
  }
  const update = (index: number, block: CollectionBlock) => commit(blocks.map((item, i) => i === index ? block : item))
  const move = (index: number, amount: number) => {
    const target = index + amount; if (target < 0 || target >= blocks.length) return
    const next = [...blocks]; [next[index], next[target]] = [next[target], next[index]]; commit(next)
  }

  return <div className="block-document">
    <div className="block-toolbar"><span>Insert</span><button onClick={() => add('heading')}>Heading</button><button onClick={() => add('text')}>Text</button><button onClick={() => add('image')}>Image</button><button disabled={!reactions.length} onClick={() => add('reaction')}>Reaction card</button><button onClick={() => add('divider')}>Divider</button></div>
    <div className="document-canvas">
      {blocks.map((block, index) => <div className={`document-block ${block.type}`} key={block.id} data-block-id={block.id}>
        <div className="block-controls"><button disabled={index === 0} onClick={() => move(index, -1)}>↑</button><button disabled={index === blocks.length - 1} onClick={() => move(index, 1)}>↓</button><button onClick={() => commit(blocks.filter((_, i) => i !== index))}>×</button></div>
        {block.type === 'heading' && <><select className="heading-level" value={block.level} onChange={(event) => update(index, { ...block, level: Number(event.target.value) as 1 | 2 | 3 })}><option value="1">H1</option><option value="2">H2</option><option value="3">H3</option></select><RichEditor value={block.content} heading={block.level} onChange={(content) => update(index, { ...block, content })} /></>}
        {block.type === 'text' && <RichEditor value={block.content} onChange={(content) => update(index, { ...block, content })} />}
        {block.type === 'image' && <CollectionImage block={block} onChange={(next) => update(index, next)} />}
        {block.type === 'reaction' && <ReactionEmbed block={block} reactions={reactions} onChange={(next) => update(index, next)} onOpenReaction={onOpenReaction} />}
        {block.type === 'divider' && <hr />}
      </div>)}
      {!blocks.length && <div className="document-empty"><strong>Build a study document</strong><p>Add rich text, headings, images, dividers, and linked reaction cards.</p><button onClick={() => add('text')}>+ Start writing</button></div>}
    </div>
  </div>
}

function RichEditor({ value, heading, onChange }: { value: RichTextValue; heading?: 1 | 2 | 3; onChange: (value: RichTextValue) => void }) {
  const editor = useRef<HTMLDivElement>(null)
  const composing = useRef(false)
  const { shortcuts } = useLatex()
  useEffect(() => {
    if (editor.current && editor.current.innerHTML !== (value.html ?? escapeHtml(value.text).replace(/\n/g, '<br>'))) editor.current.innerHTML = value.html ?? escapeHtml(value.text).replace(/\n/g, '<br>')
  }, [value.html, value.text])
  const emit = (includeEnd = false) => {
    if (!editor.current) return
    normalizeTextNodes(editor.current, shortcuts, includeEnd)
    normalizeScriptNodes(editor.current, includeEnd)
    onChange({ text: editor.current.innerText, html: sanitizeRichHtml(editor.current.innerHTML) })
  }
  const command = (name: string, value?: string) => { document.execCommand(name, false, value); emit() }
  return <div className={`rich-editor ${heading ? `heading-${heading}` : ''}`}>
    <div className="rich-toolbar"><button onMouseDown={(e) => e.preventDefault()} onClick={() => command('bold')}><b>B</b></button><button onMouseDown={(e) => e.preventDefault()} onClick={() => command('italic')}><i>I</i></button><button onMouseDown={(e) => e.preventDefault()} onClick={() => command('underline')}><u>U</u></button><button onMouseDown={(e) => e.preventDefault()} onClick={() => command('hiliteColor', '#fff1a8')}>Highlight</button><label title="Text color"><input type="color" onChange={(e) => command('foreColor', e.target.value)} /></label></div>
    <div ref={editor} contentEditable suppressContentEditableWarning data-placeholder={heading ? `Heading ${heading}` : 'Write something…'} onCompositionStart={() => { composing.current = true }} onCompositionEnd={() => { composing.current = false; emit() }} onInput={() => { if (!composing.current) emit() }} onBlur={() => emit(true)} />
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
  return <div className="reaction-embed"><select value={block.reaction_id ?? ''} onChange={(e) => onChange({ ...block, reaction_id: Number(e.target.value) || null })}><option value="">Choose a reaction</option>{reactions.map((item) => <option value={item.id} key={item.id}>{item.display_code} — {item.name}</option>)}</select>{reaction && <button className="embedded-card" onClick={() => onOpenReaction(reaction.display_code)}>{reaction.image && <img src={reaction.image.content_url} alt="" />}<span><small>{reaction.display_code}</small><strong><FormattedText>{reaction.name}</FormattedText></strong><em><FormattedText>{reaction.reaction_class || 'Unclassified'}</FormattedText></em></span></button>}</div>
}

function normalizeTextNodes(root: HTMLElement, shortcuts: import('./types').LatexShortcut[], includeEnd: boolean) {
  const selection = window.getSelection()
  const active = Boolean(selection?.rangeCount && selection.isCollapsed && root.contains(selection.anchorNode))
  const offset = active ? richCaretOffset(root) : 0
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const replacements = new Map(shortcuts.map((item) => [item.command, item.replacement]))
  const names = shortcuts.map((item) => item.command).filter(Boolean).sort((a, b) => b.length - a.length).map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  if (!names) return
  const regex = new RegExp(`[\\\\₩](${names})${includeEnd ? '(?=$|[\\s.,;:!?()[\\]{}])' : '(?=[\\s.,;:!?()[\\]{}])'}`, 'g')
  let delta = 0
  while (walker.nextNode()) {
    const node = walker.currentNode as Text; const before = node.data
    const after = before.replace(regex, (_, command: string) => replacements.get(command) ?? command)
    if (before !== after) { node.data = after; delta += after.length - before.length }
  }
  if (active && delta) placeRichCaret(root, Math.max(0, offset + delta))
}

function normalizeScriptNodes(root: HTMLElement, includeEnd: boolean) {
  const selection = window.getSelection()
  const active = Boolean(selection?.rangeCount && selection.isCollapsed && root.contains(selection.anchorNode))
  const caret = active ? richCaretOffset(root) : 0
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  while (walker.nextNode()) if (!(walker.currentNode.parentElement?.closest('sub, sup'))) nodes.push(walker.currentNode as Text)
  let sourceOffset = 0
  let removedBeforeCaret = 0
  for (const node of nodes) {
    const source = node.data
    const tokens = tokenizeInlineMarkup(source, includeEnd)
    if (tokens.some((token) => token.type !== 'text')) {
      const fragment = document.createDocumentFragment()
      for (const token of tokens) {
        const replacementLength = token.text.length
        if (active && sourceOffset + token.end <= caret) removedBeforeCaret += (token.end - token.start) - replacementLength
        if (token.type === 'text') fragment.append(token.text)
        else { const element = document.createElement(token.type); element.textContent = token.text; fragment.append(element) }
      }
      node.replaceWith(fragment)
    }
    sourceOffset += source.length
  }
  if (active && removedBeforeCaret) placeRichCaret(root, Math.max(0, caret - removedBeforeCaret))
}

function richCaretOffset(root: HTMLElement) {
  const selection = window.getSelection(); if (!selection?.rangeCount) return 0
  const range = selection.getRangeAt(0).cloneRange(); range.selectNodeContents(root); range.setEnd(selection.anchorNode!, selection.anchorOffset)
  return range.toString().length
}

function placeRichCaret(root: HTMLElement, offset: number) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let remaining = offset
  while (walker.nextNode()) { const node = walker.currentNode as Text; if (remaining <= node.length) { const range = document.createRange(); range.setStart(node, remaining); range.collapse(true); const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); return } remaining -= node.length }
}

function sanitizeRichHtml(html: string) {
  const document = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  const root = document.body.firstElementChild!
  const allowed = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'SUB', 'SUP', 'BR', 'DIV', 'SPAN'])
  for (const element of [...root.querySelectorAll('*')]) {
    if (!allowed.has(element.tagName)) { element.replaceWith(...element.childNodes); continue }
    for (const attribute of [...element.attributes]) if (attribute.name !== 'style') element.removeAttribute(attribute.name)
    const style = element.getAttribute('style') ?? ''
    const safe = style.split(';').map((part) => part.trim()).filter((part) => /^(color|background-color|text-decoration):\s*(#[0-9a-f]{3,6}|underline|line-through)$/i.test(part)).join(';')
    if (safe) element.setAttribute('style', safe); else element.removeAttribute('style')
  }
  return root.innerHTML
}

function escapeHtml(value: string) { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
