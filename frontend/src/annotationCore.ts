import type { Annotation, AnnotationSourceType, QuestionStatus } from './types'

export function filterQuestions(questions: Annotation[], search: string, status: QuestionStatus | '', sourceType: AnnotationSourceType | '') {
  const term = search.trim().toLowerCase()
  return questions.filter((question) => {
    if (status && question.status !== status) return false
    if (sourceType && question.source_type !== sourceType) return false
    return `${question.question_text ?? ''} ${question.source_code ?? ''} ${question.source_name ?? ''} ${question.source_item_text ?? ''}`.toLowerCase().includes(term)
  })
}
