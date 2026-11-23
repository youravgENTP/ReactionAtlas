import type { StudyDocument, StudyItem } from './types'

export function parseStructuredStudyDocument(source: string | null | undefined): StudyDocument | null {
  if (!source) return null
  try {
    const parsed = JSON.parse(source) as StudyDocument
    return parsed.version === 1 && Array.isArray(parsed.blocks) ? { version: 1, blocks: parsed.blocks } : null
  } catch {
    return null
  }
}

export function serializeStudyDocument(document: StudyDocument) { return JSON.stringify(document) }

export function studyDocumentText(document: StudyDocument) {
  const lines: string[] = []
  const visit = (items: StudyItem[]) => items.forEach((item) => { if (item.text.trim()) lines.push(item.text); visit(item.children ?? []) })
  for (const block of document.blocks) {
    if (block.type === 'text' && block.content.text.trim()) lines.push(block.content.text)
    if (block.type === 'hierarchy') visit(block.items)
  }
  return lines.join('\n')
}
