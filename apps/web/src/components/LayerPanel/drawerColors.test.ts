import { describe, expect, it } from 'vitest'

import type { LayerFolder, LayerItem, LayerState, RasterLayer } from '@grafetto/shared'

import { rollUpDrawerColors } from './drawerColors'

function layer(id: string): RasterLayer {
  return { kind: 'layer', id, name: id, opacity: 1, visible: true }
}

function folder(id: string, children: string[], collapsed: boolean): LayerFolder {
  return { kind: 'folder', id, name: id, opacity: 1, visible: true, collapsed, children }
}

function stateOf(items: Record<string, LayerItem>, rootOrder: string[]): LayerState {
  return { items, rootOrder, activeId: rootOrder[0] ?? '', selectedIds: [] }
}

describe('rollUpDrawerColors', () => {
  it('keeps a layer\'s own colours on its row', () => {
    const state = stateOf({ a: layer('a'), b: layer('b') }, ['a', 'b'])
    expect(rollUpDrawerColors(state, { a: ['#f00'] })).toEqual({ a: ['#f00'] })
  })

  it('lights every collapsed folder above the layer, not the expanded ones', () => {
    const state = stateOf({
      outer: folder('outer', ['open'], true),
      open:  folder('open', ['inner'], false),
      inner: folder('inner', ['a'], true),
      a: layer('a'),
    }, ['outer'])
    expect(rollUpDrawerColors(state, { a: ['#f00'] })).toEqual({
      a: ['#f00'], inner: ['#f00'], outer: ['#f00'],
    })
  })

  it('merges several drawers inside one folder, without repeating a colour', () => {
    const state = stateOf({
      f: folder('f', ['a', 'b'], true), a: layer('a'), b: layer('b'),
    }, ['f'])
    expect(rollUpDrawerColors(state, { a: ['#f00', '#0f0'], b: ['#0f0', '#00f'] }).f)
      .toEqual(['#f00', '#0f0', '#00f'])
  })

  it('ignores a layer that no longer exists', () => {
    const state = stateOf({ a: layer('a') }, ['a'])
    expect(rollUpDrawerColors(state, { gone: ['#f00'] })).toEqual({})
  })
})
