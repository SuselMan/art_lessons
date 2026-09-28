import { describe, expect, it } from 'vitest'

import { isLayerStateShape } from './layers.js'
import { fillRoutePath, splitRouteKey } from './rest.js'

/** (#623) The runtime half of the route table: turning a key into a method
 *  and a URL. The type half is proved by the typecheck itself. */

describe('splitRouteKey', () => {
  it('splits the method from the path', () => {
    expect(splitRouteKey('PATCH /api/rooms/:id/closed')).toEqual(['PATCH', '/api/rooms/:id/closed'])
  })
})

describe('fillRoutePath', () => {
  it('fills and encodes the params', () => {
    expect(fillRoutePath('/api/rooms/:id/invites/:email', { id: 'r1', email: 'a+b@x.org' }))
      .toBe('/api/rooms/r1/invites/a%2Bb%40x.org')
  })

  it('takes numbers, and appends the query without the undefined values', () => {
    expect(fillRoutePath('/api/rooms/:roomId/operations', { roomId: 'r' }, { beforeSeq: 300, limit: undefined }))
      .toBe('/api/rooms/r/operations?beforeSeq=300')
  })

  it('leaves the query off when nothing is in it', () => {
    expect(fillRoutePath('/api/rooms', undefined, { folderId: undefined })).toBe('/api/rooms')
  })

  it('refuses a template whose param was not given, rather than sending ":id"', () => {
    expect(() => fillRoutePath('/api/rooms/:id', {})).toThrow(/:id/)
  })
})

describe('isLayerStateShape', () => {
  const good = { items: {}, rootOrder: ['layer-1'], activeId: 'layer-1', selectedIds: [] }

  it('accepts a LayerState-shaped value', () => {
    expect(isLayerStateShape(good)).toBe(true)
  })

  it('refuses what a stored row could otherwise smuggle to the engine', () => {
    expect(isLayerStateShape(null)).toBe(false)
    expect(isLayerStateShape('{}')).toBe(false)
    expect(isLayerStateShape({ ...good, items: [] })).toBe(false)
    expect(isLayerStateShape({ ...good, rootOrder: [1] })).toBe(false)
    const { activeId: _dropped, ...noActive } = good
    expect(isLayerStateShape(noActive)).toBe(false)
  })
})
