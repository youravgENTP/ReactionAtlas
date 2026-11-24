import assert from 'node:assert/strict'
import test from 'node:test'
import { isAppHref, parseAppRoute, routeHref } from '../src/routing.ts'

test('stable record URLs parse and round trip', () => {
  for (const href of ['/reactions/Rxn20', '/reactions/Rxn*20', '/drugs/Drug24', '/structures/Str7', '/collections/8', '/settings']) {
    const url = new URL(href, 'http://reactionatlas.local')
    assert.equal(routeHref(parseAppRoute(url.pathname, url.search)), href)
  }
})

test('hierarchy item deep links preserve field and UUID parameters', () => {
  const href = '/drugs/Drug24?field=description&item=12345678-1234-4234-8234-123456789abc'
  const url = new URL(href, 'http://reactionatlas.local')
  const route = parseAppRoute(url.pathname, url.search)
  assert.equal(route.code, 'Drug24')
  assert.equal(route.field, 'description')
  assert.equal(route.item, '12345678-1234-4234-8234-123456789abc')
  assert.equal(routeHref(route), href)
})

test('unknown routes safely fall back to the Reaction Library', () => {
  assert.deepEqual(parseAppRoute('/does-not-exist'), { page: 'library' })
  assert.equal(isAppHref('/reactions/Rxn1'), true)
  assert.equal(isAppHref('javascript:alert(1)'), false)
  assert.equal(isAppHref('https://example.com/reactions/Rxn1'), false)
})
