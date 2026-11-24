import type { Annotation, AnnotationSourceType, QuestionStatus } from './types'

export interface AnnotationLinkSource {
  sourceType: AnnotationSourceType
  field: string
  rootHref: string
}

export function annotationItemHref(source: AnnotationLinkSource, itemId: string) {
  const separator = source.rootHref.includes('?') ? '&' : '?'
  const field = source.sourceType === 'collection' ? '' : `field=${encodeURIComponent(source.field)}&`
  return `${source.rootHref}${separator}${field}item=${encodeURIComponent(itemId)}`
}

export function filterQuestions(questions: Annotation[], search: string, status: QuestionStatus | '', sourceType: AnnotationSourceType | '') {
  const term = search.trim().toLowerCase()
  return questions.filter((question) => {
    if (status && question.status !== status) return false
    if (sourceType && question.source_type !== sourceType) return false
    return `${question.question_text ?? ''} ${question.source_code ?? ''} ${question.source_name ?? ''} ${question.source_item_text ?? ''}`.toLowerCase().includes(term)
  })
}
