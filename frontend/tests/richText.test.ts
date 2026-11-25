import assert from 'node:assert/strict'
import test from 'node:test'
import { DOMParser as LinkeDOMParser } from 'linkedom'
import { parseCollectionDocument, serializeCollectionDocument } from '../src/collectionDocument.ts'
import { parseStructuredStudyDocument, serializeStudyDocument } from '../src/studyDocumentCore.ts'
import type { CollectionDocument, StudyDocument } from '../src/types.ts'

class TestDOMParser {
  parseFromString(source: string, type: DOMParserSupportedType) {
    return new LinkeDOMParser().parseFromString(`<!doctype html><html><body>${source}</body></html>`, type) as unknown as Document
  }
}

Object.assign(globalThis, { DOMParser: TestDOMParser })
const { sanitizeRichHtml } = await import('../src/richTextSanitizer.ts')

test('preserves valid HEX, RGB, RGBA, and background colors', () => {
  const result = sanitizeRichHtml('<span style="color:#abc;background-color: rgb(12, 34, 56)">one</span><span style="color:rgba(1, 2, 3, 0.5);background-color:#11223344">two</span>')
  assert.equal(result, '<span style="color: #abc; background-color: rgb(12, 34, 56)">one</span><span style="color: rgba(1, 2, 3, 0.5); background-color: #11223344">two</span>')
})

test('normalizes legacy FONT colors to safe spans', () => {
  assert.equal(sanitizeRichHtml('<font face="serif" size="7" color="rgb(4, 5, 6)"><b>legacy</b></font>'), '<span style="color: rgb(4, 5, 6)"><b>legacy</b></span>')
})

test('preserves combined formatting and is idempotent', () => {
  const source = '<strong><em><sub><span style="color: #123456; background-color: rgba(250, 240, 1, .4)">sub</span></sub></em></strong><sup style="color:rgb(2 3 4 / 50%)">sup</sup>'
  const once = sanitizeRichHtml(source)
  assert.match(once, /<strong><em><sub><span style="color: #123456; background-color: rgba\(250, 240, 1, \.4\)">sub<\/span><\/sub><\/em><\/strong>/)
  assert.match(once, /<sup style="color: rgb\(2 3 4 \/ 50%\)">sup<\/sup>/)
  assert.equal(sanitizeRichHtml(once), once)
})

test('rejects unsafe HTML, attributes, links, and CSS while retaining safe formatting', () => {
  const result = sanitizeRichHtml('<script>alert(1)</script><span onclick="steal()" style="color: expression(alert(1)); background-image:url(javascript:x); position:fixed; color:rgb(1, 2, 3)">safe</span><a href="javascript:alert(1)" target="_blank">bad link</a>')
  assert.doesNotMatch(result, /<script|onclick|expression|background-image|position|javascript:|target=/i)
  assert.match(result, /<span style="color: rgb\(1, 2, 3\)">safe<\/span>/)
  assert.match(result, /bad link/)
})

test('retains managed images and internal links without unsafe attributes', () => {
  const id = '12345678-1234-4234-8234-123456789abc'
  const result = sanitizeRichHtml(`<img src="/api/media/${id}/content" data-width-percent="64" data-align="right" alt="scheme" onerror="bad()"><a href="/reactions/Rxn1?field=notes" onclick="bad()">reaction</a>`)
  assert.match(result, new RegExp(`src="/api/media/${id}/content"`))
  assert.match(result, /data-width-percent="64"/)
  assert.match(result, /data-align="right"/)
  assert.doesNotMatch(result, /onerror|onclick/)
  assert.match(result, /<a href="\/reactions\/Rxn1\?field=notes">reaction<\/a>/)
  assert.equal(sanitizeRichHtml(result), result)
})

test('colored formatting survives save, reload, and a second application parse', () => {
  const html = sanitizeRichHtml('<font color="#a1b2c3"><b><i>persistent</i></b></font><span style="background-color:rgba(255, 241, 168, .8)">highlight</span>')
  const study: StudyDocument = { version: 1, blocks: [{ id: 'text', type: 'text', content: { text: 'persistent highlight', html } }] }
  const firstStudyLoad = parseStructuredStudyDocument(serializeStudyDocument(study))
  const restartedStudyLoad = parseStructuredStudyDocument(serializeStudyDocument(firstStudyLoad!))
  assert.equal(restartedStudyLoad?.blocks[0].type === 'text' ? restartedStudyLoad.blocks[0].content.html : undefined, html)

  const collection: CollectionDocument = { version: 1, blocks: [{ id: 'text', type: 'text', content: { text: 'persistent highlight', html } }] }
  const firstCollectionLoad = parseCollectionDocument(serializeCollectionDocument(collection))
  const restartedCollectionLoad = parseCollectionDocument(serializeCollectionDocument(firstCollectionLoad))
  assert.equal(restartedCollectionLoad.blocks[0].type === 'text' ? restartedCollectionLoad.blocks[0].content.html : undefined, html)
})
