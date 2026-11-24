import { useEffect, useMemo, useState } from 'react'
import { api } from './api'
import type { Annotation, AnnotationSourceType, QuestionStatus } from './types'
import { filterQuestions } from './annotationCore'

const statuses: Array<{ value: QuestionStatus; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'resolved', label: 'Resolved' },
]

export function Questions() {
  const [questions, setQuestions] = useState<Annotation[]>([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<QuestionStatus | ''>('')
  const [sourceType, setSourceType] = useState<AnnotationSourceType | ''>('')
  const [saving, setSaving] = useState(0)
  const [error, setError] = useState('')
  const load = async () => {
    try { setQuestions(await api.annotations({ kind: 'question' })); setError('') }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load questions') }
  }
  useEffect(() => { void load() }, [])
  const filtered = useMemo(() => filterQuestions(questions, search, status, sourceType), [questions, search, sourceType, status])
  const counts = statuses.map(({ value }) => questions.filter((question) => question.status === value).length)
  const update = async (question: Annotation, patch: { status?: QuestionStatus; resolution_memo?: string }) => {
    setSaving(question.id); setError('')
    try { const next = await api.updateAnnotation(question.id, patch); setQuestions((current) => current.map((item) => item.id === next.id ? next : item)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update question') }
    finally { setSaving(0) }
  }
  const editMemo = (question: Annotation) => {
    const memo = window.prompt('Answer or resolution memo', question.resolution_memo ?? '')
    if (memo !== null) void update(question, { resolution_memo: memo })
  }
  return <main className="questions-page">
    <header className="questions-header"><div><small>Study review</small><h1>Questions</h1><p>Questions remain here after resolution and when a source note is removed.</p></div><div className="question-counts">{statuses.map(({ value, label }, index) => <span key={value}><strong>{counts[index]}</strong>{label}</span>)}</div></header>
    <div className="questions-filters"><input aria-label="Search questions" placeholder="Search question, source, or note text…" value={search} onChange={(event) => setSearch(event.target.value)} /><select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value as QuestionStatus | '')}><option value="">All statuses</option>{statuses.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select><select aria-label="Filter by source type" value={sourceType} onChange={(event) => setSourceType(event.target.value as AnnotationSourceType | '')}><option value="">All sources</option><option value="drug">Drugs</option><option value="reaction">Reactions</option><option value="collection">Collections</option></select></div>
    {error && <div className="error questions-error">{error}</div>}
    <section className="questions-list" aria-live="polite">
      {!filtered.length && <div className="questions-empty">No questions match these filters.</div>}
      {filtered.map((question) => <article className={`question-card ${question.source_exists ? '' : 'missing'}`} key={question.id}>
        <div className="question-card-heading"><span className={`question-status ${question.status}`}>{question.status?.replace('_', ' ')}</span><small>{question.source_type} · {question.source_code || `#${question.source_entity_id}`}</small></div>
        <h2>{question.question_text}</h2><p>{question.source_item_text ?? 'The referenced hierarchy item is no longer available.'}</p>
        <div className="question-source"><strong>{question.source_name || question.source_code || 'Missing source record'}</strong>{!question.source_exists && <em>Missing source — annotation retained</em>}</div>
        {question.resolution_memo && <blockquote>{question.resolution_memo}</blockquote>}
        <footer><select aria-label={`Status for ${question.question_text}`} disabled={saving === question.id} value={question.status ?? 'open'} onChange={(event) => void update(question, { status: event.target.value as QuestionStatus })}>{statuses.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select><button type="button" className="secondary" disabled={saving === question.id} onClick={() => editMemo(question)}>Resolution memo</button>{question.source_exists ? <a className="button-link" href={question.source_href} target="_blank" rel="noreferrer">Open source ↗</a> : <span className="missing-source-label">Source unavailable</span>}</footer>
      </article>)}
    </section>
  </main>
}
