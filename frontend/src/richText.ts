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
