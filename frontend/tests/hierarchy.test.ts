import assert from 'node:assert/strict'
import test from 'node:test'
import { addStudyItemAfter, flattenStudyItems, hierarchyMarker, indentStudyItem, outdentStudyItem, updateStudyItem } from '../src/hierarchy.ts'
import { parseStructuredStudyDocument, serializeStudyDocument, studyDocumentText } from '../src/studyDocumentCore.ts'
import type { StudyDocument, StudyItem } from '../src/types.ts'

test('markers follow the Pharmacognosy four-level convention and circled fallback', () => {
  assert.equal(hierarchyMarker(0, 0), 'i)')
  assert.equal(hierarchyMarker(0, 3), 'iv)')
  assert.equal(hierarchyMarker(1, 0), '①')
  assert.equal(hierarchyMarker(1, 19), '⑳')
  assert.equal(hierarchyMarker(1, 20), '(21)')
  assert.equal(hierarchyMarker(2, 1), 'b)')
  assert.equal(hierarchyMarker(3, 7), '•')
})

test('indent, outdent, sibling insertion, and Korean rich content remain structural', () => {
  const source: StudyItem[] = [
    { id: 'one', text: '반응 개요' },
    { id: 'two', text: '중간체', html: '<strong>중간체</strong>' },
  ]
  const indented = indentStudyItem(source, 'two')
  assert.deepEqual(flattenStudyItems(indented).map((item) => item.id), ['one', 'two'])
  assert.equal(indented[0].children?.[0].html, '<strong>중간체</strong>')
  const withSibling = addStudyItemAfter(indented, 'two', { id: 'three', text: '재배열' })
  assert.deepEqual(withSibling[0].children?.map((item) => item.id), ['two', 'three'])
  const updated = updateStudyItem(withSibling, 'three', { text: '생성물 형성' })
  assert.equal(updated[0].children?.[1].text, '생성물 형성')
  const outdented = outdentStudyItem(updated, 'three')
  assert.deepEqual(outdented.map((item) => item.id), ['one', 'three'])
})

test('versioned documents reload rich hierarchy and anchored image metadata exactly', () => {
  const document: StudyDocument = { version: 1, blocks: [
    { id: 'list', type: 'hierarchy', items: [
      { id: 'one', text: '반응 개요', html: '<strong>반응 개요</strong>', children: [
        { id: 'two', text: '중간체 형성', html: '<em>중간체 형성</em>' },
      ] },
    ] },
    { id: 'image', type: 'image', media_asset_id: '12345678-1234-4234-8234-123456789abc', width_percent: 72, align: 'right', anchor_item_id: 'two', anchor_side: 'after' },
    { id: 'text', type: 'text', content: { text: '일반 문단', html: '<u>일반 문단</u>' } },
  ] }
  const serialized = serializeStudyDocument(document)
  assert.deepEqual(parseStructuredStudyDocument(serialized), document)
  assert.equal(studyDocumentText(document), '반응 개요\n중간체 형성\n일반 문단')
})
