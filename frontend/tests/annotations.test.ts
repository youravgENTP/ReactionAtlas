import assert from 'node:assert/strict'
import test from 'node:test'
import { annotationItemHref, filterQuestions } from '../src/annotationCore.ts'
import type { Annotation } from '../src/types.ts'

const question: Annotation = {
  id: 1, kind: 'question', source_type: 'drug', source_entity_id: 24, source_code: 'Drug24', source_name: 'Indomethacin', document_field: 'description', block_id: 'block', item_id: 'item id', stable_code: null, question_text: 'Why is this selective?', status: 'open', resolution_memo: null, created_at: '', updated_at: '', resolved_at: null, source_exists: true, source_href: '/drugs/Drug24?field=description&item=item%20id', source_item_text: 'Selective transformation',
}

test('annotation links target an exact hierarchy item and field', () => {
  assert.equal(annotationItemHref({ sourceType: 'drug', field: 'description', rootHref: '/drugs/Drug24' }, 'item id'), '/drugs/Drug24?field=description&item=item%20id')
  assert.equal(annotationItemHref({ sourceType: 'collection', field: 'document', rootHref: '/collections/3' }, 'uuid'), '/collections/3?item=uuid')
})

test('question filtering covers source, status, and note text', () => {
  assert.equal(filterQuestions([question], 'indomethacin', '', '').length, 1)
  assert.equal(filterQuestions([question], 'selective', 'open', 'drug').length, 1)
  assert.equal(filterQuestions([question], '', 'resolved', '').length, 0)
})
