import { tokenizeInlineMarkup } from './scriptMarkup'

export function sanitizeRichHtml(html: string) {
  const parsed = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  const root = parsed.body.firstElementChild!
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
