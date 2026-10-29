import { expect, it } from 'vitest'
import { SourceCanonicalFrameEncoder, type SourceCanonicalStrokeContext } from './sourceCanonicalFrameEncoder'
import { SourceStrokeMaterialAdapter, type SourceStrokeMaterialContext } from './sourceStrokeMaterialAdapter'
import type { SourceStrokeAuthorProgram, SourceStrokeAuthorState } from './sourceStrokeAuthor'

it('rejects untrusted malformed v2 pin before assets or program access', () => {
  let reads = 0
  const material = Object.defineProperty({ version: 2, primarySource: {kind:'defaultAuto'} }, 'assets', {
    get() { reads++; throw new Error('image assets touched') },
  })
  const program = Object.defineProperty({}, 'roles', { get() { reads++; throw new Error('author program touched') } })
  expect(() => new SourceCanonicalFrameEncoder({material} as unknown as SourceCanonicalStrokeContext)).toThrow()
  expect(() => new SourceStrokeMaterialAdapter(program as SourceStrokeAuthorProgram, material as unknown as SourceStrokeMaterialContext,
    {} as SourceStrokeAuthorState)).toThrow()
  expect(reads).toBe(0)
})
