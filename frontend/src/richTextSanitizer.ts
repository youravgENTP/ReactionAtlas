export function sanitizeRichHtml(html: string) {
  const parsed = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  const root = parsed.body.firstElementChild!
  const allowed = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'SUB', 'SUP', 'BR', 'DIV', 'SPAN', 'IMG', 'A'])
  for (const candidate of [...root.querySelectorAll('*')]) {
    let element = candidate
    if (element.tagName === 'FONT') {
      const replacement = parsed.createElement('span')
      const color = element.getAttribute('color')?.trim() ?? ''
      if (isSafeColor(color)) replacement.setAttribute('style', `color: ${color}`)
      replacement.append(...element.childNodes)
      element.replaceWith(replacement)
      element = replacement
    }
    if (!allowed.has(element.tagName)) { element.replaceWith(...element.childNodes); continue }
    if (element.tagName === 'IMG') {
      sanitizeManagedImage(element as HTMLImageElement)
      continue
    }
    if (element.tagName === 'A') {
      const href = safeInternalHref(element.getAttribute('href') ?? '')
      if (!href) { element.replaceWith(...element.childNodes); continue }
      for (const attribute of [...element.attributes]) element.removeAttribute(attribute.name)
      element.setAttribute('href', href)
      continue
    }
    for (const attribute of [...element.attributes]) if (attribute.name !== 'style') element.removeAttribute(attribute.name)
    const safe = sanitizeStyle(element.getAttribute('style') ?? '')
    if (safe) element.setAttribute('style', safe); else element.removeAttribute('style')
  }
  return root.innerHTML
}

const safeStyleProperties = new Set(['color', 'background-color', 'text-decoration'])

function sanitizeStyle(style: string) {
  const declarations: string[] = []
  for (const source of style.split(';')) {
    const separator = source.indexOf(':')
    if (separator < 0) continue
    const property = source.slice(0, separator).trim().toLowerCase()
    const value = source.slice(separator + 1).trim()
    if (!safeStyleProperties.has(property) || !isSafeStyleValue(property, value)) continue
    declarations.push(`${property}: ${value}`)
  }
  return declarations.join('; ')
}

function isSafeStyleValue(property: string, value: string) {
  if (property === 'color' || property === 'background-color') return isSafeColor(value)
  if (property === 'text-decoration') {
    const tokens = value.toLowerCase().split(/\s+/).filter(Boolean)
    return tokens.length > 0 && tokens.every((token) => token === 'underline' || token === 'line-through')
  }
  return false
}

function isSafeColor(value: string) {
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)) return true
  const match = value.match(/^(rgb|rgba)\((.*)\)$/i)
  if (!match) return false
  const body = match[2].trim()
  if (body.includes(',')) {
    const parts = body.split(',').map((part) => part.trim())
    const expected = match[1].toLowerCase() === 'rgba' ? 4 : 3
    return parts.length === expected && parts.slice(0, 3).every(isRgbChannel) && (parts.length === 3 || isAlphaChannel(parts[3]))
  }
  const slashParts = body.split('/').map((part) => part.trim())
  if (slashParts.length > 2) return false
  const channels = slashParts[0].split(/\s+/).filter(Boolean)
  return channels.length === 3 && channels.every(isRgbChannel) && (slashParts.length === 1 || isAlphaChannel(slashParts[1]))
}

function isRgbChannel(value: string) {
  if (/^(?:\d+(?:\.\d+)?|\.\d+)%$/.test(value)) return Number.parseFloat(value) <= 100
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value)) return false
  return Number.parseFloat(value) <= 255
}

function isAlphaChannel(value: string) {
  if (/^(?:\d+(?:\.\d+)?|\.\d+)%$/.test(value)) return Number.parseFloat(value) <= 100
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value)) return false
  return Number.parseFloat(value) <= 1
}

function safeInternalHref(value: string) {
  try {
    const url = new URL(value, 'http://reactionatlas.local')
    if (url.origin !== 'http://reactionatlas.local' || !/^\/(reactions|drugs|structures|collections)\//.test(url.pathname)) return ''
    return `${url.pathname}${url.search}`
  } catch { return '' }
}

function sanitizeManagedImage(image: HTMLImageElement) {
  const source = image.getAttribute('src') ?? ''
  const match = source.match(/^\/api\/media\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/content$/i)
  if (!match) { image.remove(); return }
  const width = Math.min(100, Math.max(15, Number(image.dataset.widthPercent) || 55))
  const align = image.dataset.align === 'left' || image.dataset.align === 'right' ? image.dataset.align : 'center'
  const alt = (image.getAttribute('alt') ?? '').slice(0, 255)
  for (const attribute of [...image.attributes]) image.removeAttribute(attribute.name)
  image.setAttribute('src', `/api/media/${match[1]}/content`)
  image.setAttribute('data-media-id', match[1])
  image.setAttribute('data-width-percent', String(width))
  image.setAttribute('data-align', align)
  image.setAttribute('style', `width: ${width}%`)
  image.setAttribute('alt', alt)
}
