import { expect, it } from 'vitest'
import { clearPrefixElisionRequested } from './clearPrefixElision'

it('requires an explicit DEV URL and cannot opt production into replay elision', () => {
  expect(clearPrefixElisionRequested(true, '?qaClearPrefixElision=1')).toBe(true)
  for (const search of ['', '?qaClearPrefixElision=0', '?qaClearPrefixElision=true', '?qaClearPrefixElision']) {
    expect(clearPrefixElisionRequested(true, search)).toBe(false)
  }
  expect(clearPrefixElisionRequested(false, '?qaClearPrefixElision=1')).toBe(false)
})
