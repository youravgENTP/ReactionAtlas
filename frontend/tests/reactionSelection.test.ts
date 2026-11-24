import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { automaticReactionSelection, exactReactionForRoute, explicitReactionRoute, isLatestRequest } from '../src/reactionSelection.ts'
import { parseAppRoute, routeHref } from '../src/routing.ts'

const reactions = [{ display_code: 'Rxn1' }, { display_code: 'Rxn41' }, { display_code: 'Rxn*3' }]

test('initial library selection replaces the bare Reaction URL', () => {
  assert.deepEqual(automaticReactionSelection(reactions), { record: reactions[0], route: { code: 'Rxn1', mode: 'replace' } })
  assert.equal(routeHref({ page: 'library', code: reactions[0].display_code }), '/reactions/Rxn1')
})

test('explicit Reaction selection uses push navigation', () => {
  assert.deepEqual(explicitReactionRoute(reactions[1]), { code: 'Rxn41', mode: 'push' })
})

test('direct, refreshed, back, and forward routes restore exact Reactions', () => {
  for (const code of ['Rxn41', 'Rxn1', 'Rxn*3', 'Rxn41']) {
    const route = parseAppRoute(`/reactions/${encodeURIComponent(code)}`)
    assert.equal(exactReactionForRoute(reactions, route.code!), reactions.find((reaction) => reaction.display_code === code))
  }
  assert.equal(exactReactionForRoute(reactions, 'Rxn999'), null)
})

test('stale search or route responses cannot supersede the latest request', () => {
  assert.equal(isLatestRequest(3, 4), false)
  assert.equal(isLatestRequest(4, 4), true)
})

test('Reaction item deep links retain field and item parameters', () => {
  const href = '/reactions/Rxn41?field=notes&item=12345678-1234-4234-8234-123456789abc'
  const url = new URL(href, 'http://reactionatlas.local')
  assert.equal(routeHref(parseAppRoute(url.pathname, url.search)), href)
})

test('hierarchy Link control is removed without removing DRxn or Question controls', () => {
  const source = readFileSync(new URL('../src/HierarchicalDocumentEditor.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /Copy link to item|>Link<|navigator\.clipboard/)
  assert.match(source, /Mark as DRxn/)
  assert.match(source, /Mark as Question/)
  assert.match(source, /annotation-remove/)
})
