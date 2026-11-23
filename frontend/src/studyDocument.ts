import type { RichTextValue, StudyBlock, StudyDocument } from './types'
import { sanitizeRichHtml } from './richText'
import { newStudyItem } from './hierarchy'
import { parseStructuredStudyDocument } from './studyDocumentCore'
export { serializeStudyDocument, studyDocumentText } from './studyDocumentCore'

const newId = () => crypto.randomUUID()

export function parseStudyDocument(source: string | null | undefined, legacy: RichTextValue): StudyDocument {
  const structured = parseStructuredStudyDocument(source)
  if (structured) return structured
  return { version: 1, blocks: legacyBlocks(legacy) }
}

export function newTextBlock(): StudyBlock { return { id: newId(), type: 'text', content: { text: '' } } }
export function newHierarchyBlock(): StudyBlock { return { id: newId(), type: 'hierarchy', items: [newStudyItem()] } }

function legacyBlocks(legacy: RichTextValue): StudyBlock[] {
  const html = legacy.html ? sanitizeRichHtml(legacy.html) : escapeHtml(legacy.text).replace(/\n/g, '<br>')
  if (!html) return [newTextBlock()]
  const parts = html.split(/(<img\b[^>]*>)/gi).filter(Boolean)
  if (parts.length === 1) return [{ id: newId(), type: 'text', content: { text: legacy.text, html } }]
  const blocks: StudyBlock[] = []
  for (const part of parts) {
    if (/^<img\b/i.test(part)) {
      const image = new DOMParser().parseFromString(part, 'text/html').body.querySelector('img')
      const mediaId = image?.dataset.mediaId
      if (mediaId) blocks.push({ id: newId(), type: 'image', media_asset_id: mediaId, width_percent: Number(image.dataset.widthPercent) || 55, align: image.dataset.align === 'left' || image.dataset.align === 'right' ? image.dataset.align : 'center' })
    } else if (part.replace(/<br\s*\/?\s*>/gi, '').trim()) {
      const safe = sanitizeRichHtml(part)
      const text = new DOMParser().parseFromString(safe, 'text/html').body.innerText
      blocks.push({ id: newId(), type: 'text', content: { text, html: safe } })
    }
  }
  return blocks.length ? blocks : [newTextBlock()]
}

function escapeHtml(value: string) { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
