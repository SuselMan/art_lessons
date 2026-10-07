import { expect, it } from 'vitest'
import { clearPrefixElisionRequested, captureClearPrefixElision } from './clearPrefixElision'

it('requires an explicit DEV URL and cannot opt production into replay elision', () => {
  expect(clearPrefixElisionRequested(true, '?qaClearPrefixElision=1')).toBe(true)
  for (const search of ['', '?qaClearPrefixElision=0', '?qaClearPrefixElision=true', '?qaClearPrefixElision']) {
    expect(clearPrefixElisionRequested(true, search)).toBe(false)
  }
  expect(clearPrefixElisionRequested(false, '?qaClearPrefixElision=1')).toBe(false)
})

it('captures the QA flag before same-room URL cleanup and resets on room change', () => {
  const on = captureClearPrefixElision(null, 'own-A', true, '?qaClearPrefixElision=1')
  expect(on.enabled).toBe(true)
  expect(captureClearPrefixElision(on, 'own-A', true, '')).toBe(on)
  expect(captureClearPrefixElision(on, 'own-B', true, '').enabled).toBe(false)
  const off = captureClearPrefixElision(null, 'own-A', true, '')
  expect(captureClearPrefixElision(off, 'own-A', true, '?qaClearPrefixElision=1')).toBe(off)
  expect(captureClearPrefixElision(off, 'own-B', true, '?qaClearPrefixElision=1').enabled).toBe(true)
  expect(captureClearPrefixElision(null, 'production-A', false, '?qaClearPrefixElision=1').enabled).toBe(false)
})
