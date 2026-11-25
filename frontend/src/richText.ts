import { tokenizeInlineMarkup } from './scriptMarkup'
import type { LatexShortcut } from './types'
import { sanitizeRichHtml } from './richTextSanitizer'
export { sanitizeRichHtml } from './richTextSanitizer'

export function formatScriptHtml(html: string) {
  const parsed = new DOMParser().parseFromString(`<div>${sanitizeRichHtml(html)}</div>`, 'text/html')
  const root = parsed.body.firstElementChild!
  repairMalformedScriptElements(root, parsed)
  const walker = parsed.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  while (walker.nextNode()) if (!(walker.currentNode.parentElement?.closest('sub, sup'))) nodes.push(walker.currentNode as Text)
  for (const node of nodes) {
    const tokens = tokenizeInlineMarkup(node.data)
    if (!tokens.some((token) => token.type !== 'text')) continue
    const fragment = parsed.createDocumentFragment()
    for (const token of tokens) {
      if (token.type === 'text') fragment.append(token.text)
      else { const element = parsed.createElement(token.type); element.textContent = token.text; fragment.append(element) }
    }
    node.replaceWith(fragment)
  }
  return root.innerHTML
}

function repairMalformedScriptElements(root: Element, parsed: Document) {
  for (const element of [...root.querySelectorAll('sub, sup')]) {
    const source = element.textContent ?? ''
    const marker = element.tagName === 'SUB' ? source.match(/^(?:\\_|₩_|_)/)?.[0] : source.match(/^\^/)?.[0]
    if (!marker) continue
    const remainder = source.slice(marker.length)
    let content = ''
    let trailing = ''
    if (remainder.startsWith('{')) {
      const close = remainder.indexOf('}', 1)
      if (close < 0) continue
      content = remainder.slice(1, close)
      trailing = remainder.slice(close + 1)
    } else {
      const character = Array.from(remainder)[0]
      if (!character) continue
      content = character
      trailing = remainder.slice(character.length)
    }
    element.textContent = content
    if (trailing) element.after(parsed.createTextNode(trailing))
  }
}

export function normalizeTextNodes(root: HTMLElement, shortcuts: LatexShortcut[], includeEnd: boolean) {
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

export function normalizeScriptNodes(root: HTMLElement, includeEnd: boolean) {
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
  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    if (remaining <= node.length) {
      const range = document.createRange()
      const script = node.parentElement?.closest('sub, sup')
      if (remaining === node.length && script && root.contains(script)) range.setStartAfter(script)
      else range.setStart(node, remaining)
      range.collapse(true)
      const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range)
      return
    }
    remaining -= node.length
  }
}
